insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplierdesk-documents', 'supplierdesk-documents', false, 15000000,
        array['application/pdf', 'image/jpeg', 'image/png']);

alter table public.document_request_items
  add column status text not null default 'requested'
    check (status in ('requested', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'cancelled')),
  add column expires_on date;

create table public.document_versions (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid not null,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  filename text not null check (char_length(filename) between 1 and 255),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 15000000),
  expires_on date,
  submitted_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, item_id, version_number),
  unique (company_id, item_id, id),
  foreign key (company_id, item_id) references public.document_request_items(company_id, id) on delete cascade
);

create table public.document_review_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid not null,
  version_id uuid not null,
  status text not null check (status in ('submitted', 'under_review', 'approved', 'rejected', 'superseded')),
  actor_id uuid,
  reason text,
  expires_on date,
  created_at timestamptz not null default now(),
  foreign key (company_id, item_id, version_id)
    references public.document_versions(company_id, item_id, id) on delete cascade
);

create index document_versions_item_idx on public.document_versions(company_id, item_id, version_number desc);
create index document_review_events_item_idx on public.document_review_events(company_id, item_id, created_at);

alter table public.document_versions enable row level security;
alter table public.document_review_events enable row level security;
revoke all on public.document_versions, public.document_review_events from public, anon, authenticated;
grant select on public.document_versions, public.document_review_events to authenticated;

create policy versions_select on public.document_versions for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
create policy review_events_select on public.document_review_events for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));

create function public.record_document_upload(
  target_company uuid, target_item uuid, new_version uuid, file_name text,
  media_type text, file_size bigint, expiration date, submitted_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  previous_version uuid;
  next_number integer;
  object_path text;
begin
  if not exists (
    select 1 from public.company_memberships
    where company_id = target_company and user_id = submitted_by
      and role in ('owner', 'admin', 'quality_manager', 'procurement_manager')
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  if new_version is null or file_name is null or char_length(file_name) not between 1 and 255
    or file_name ~ '[[:cntrl:]/\\]' or media_type is null
    or media_type not in ('application/pdf', 'image/jpeg', 'image/png')
    or file_size is null or file_size not between 1 and 15000000 then
    raise exception 'Invalid document details' using errcode = '22023';
  end if;

  select status into current_status from public.document_request_items
    where company_id = target_company and id = target_item for update;
  if not found or current_status not in ('requested', 'rejected', 'approved', 'expired') then
    raise exception 'Invalid document state' using errcode = '22023';
  end if;

  object_path := target_company::text || '/' || target_item::text || '/' || new_version::text;
  if not exists (
    select 1 from storage.objects where bucket_id = 'supplierdesk-documents' and name = object_path
      and metadata ->> 'size' = file_size::text and metadata ->> 'mimetype' = media_type
  ) then
    raise exception 'Stored object does not match document' using errcode = '22023';
  end if;

  select id, version_number + 1 into previous_version, next_number from public.document_versions
    where company_id = target_company and item_id = target_item order by version_number desc limit 1;
  next_number := coalesce(next_number, 1);
  if current_status in ('approved', 'expired') and previous_version is not null then
    insert into public.document_review_events (company_id, item_id, version_id, status, actor_id)
      values (target_company, target_item, previous_version, 'superseded', submitted_by);
  end if;
  insert into public.document_versions
    (id, company_id, item_id, version_number, storage_path, filename, content_type, size_bytes, expires_on, submitted_by)
    values (new_version, target_company, target_item, next_number, object_path, file_name, media_type, file_size, expiration, submitted_by);
  insert into public.document_review_events (company_id, item_id, version_id, status, actor_id, expires_on)
    values (target_company, target_item, new_version, 'submitted', submitted_by, expiration);
  update public.document_request_items set status = 'submitted', expires_on = expiration
    where company_id = target_company and id = target_item;
  return new_version;
end;
$$;

revoke all on function public.record_document_upload(uuid, uuid, uuid, text, text, bigint, date, uuid)
  from public, anon, authenticated;
grant execute on function public.record_document_upload(uuid, uuid, uuid, text, text, bigint, date, uuid) to service_role;

create function public.review_document(
  target_company uuid, target_item uuid, target_version uuid, next_status text,
  decision_reason text, revised_expiry date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  current_version uuid;
  effective_expiry date;
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select status, expires_on into current_status, effective_expiry from public.document_request_items
    where company_id = target_company and id = target_item for update;
  if not found then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  select id into current_version from public.document_versions
    where company_id = target_company and item_id = target_item order by version_number desc limit 1;
  if current_version is null or target_version is distinct from current_version then
    raise exception 'Document version changed' using errcode = '40001';
  end if;
  if next_status is null or not (
    (current_status = 'submitted' and next_status = 'under_review')
    or (current_status = 'under_review' and next_status in ('approved', 'rejected'))
  ) or (next_status = 'rejected' and coalesce(char_length(btrim(decision_reason)), 0) = 0)
    or coalesce(char_length(decision_reason), 0) > 2000 then
    raise exception 'Invalid review transition' using errcode = '22023';
  end if;
  effective_expiry := coalesce(revised_expiry, effective_expiry);
  update public.document_request_items set status = next_status, expires_on = effective_expiry
    where company_id = target_company and id = target_item;
  insert into public.document_review_events (company_id, item_id, version_id, status, actor_id, reason, expires_on)
    values (target_company, target_item, target_version, next_status, auth.uid(),
            nullif(btrim(decision_reason), ''), effective_expiry);
end;
$$;

revoke all on function public.review_document(uuid, uuid, uuid, text, text, date) from public, anon;
grant execute on function public.review_document(uuid, uuid, uuid, text, text, date) to authenticated;
