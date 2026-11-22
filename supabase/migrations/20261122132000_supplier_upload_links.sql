create table public.supplier_upload_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (company_id, request_id) references public.document_requests(company_id, id) on delete cascade
);
create index supplier_upload_links_request_idx on public.supplier_upload_links(company_id, request_id);
alter table public.supplier_upload_links enable row level security;
revoke all on public.supplier_upload_links from public, anon, authenticated;
grant select (id, company_id, request_id, expires_at, revoked_at, created_by, created_at)
  on public.supplier_upload_links to authenticated;
grant select on public.supplier_upload_links to service_role;
create policy supplier_links_select on public.supplier_upload_links for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager']));

create function public.create_supplier_upload_link(target_company uuid, target_request uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager', 'procurement_manager']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.document_requests where company_id = target_company and id = target_request) then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.supplier_upload_links (company_id, request_id, token_hash, expires_at, created_by)
    values (target_company, target_request, encode(extensions.digest(token, 'sha256'), 'hex'),
            now() + interval '7 days', auth.uid());
  return token;
end;
$$;
revoke all on function public.create_supplier_upload_link(uuid, uuid) from public, anon;
grant execute on function public.create_supplier_upload_link(uuid, uuid) to authenticated;

create function public.revoke_supplier_upload_link(target_company uuid, target_link uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager', 'procurement_manager']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  update public.supplier_upload_links set revoked_at = coalesce(revoked_at, now())
    where company_id = target_company and id = target_link;
  if not found then
    raise exception 'Link not found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.revoke_supplier_upload_link(uuid, uuid) from public, anon;
grant execute on function public.revoke_supplier_upload_link(uuid, uuid) to authenticated;

create function public._store_document_version(
  target_company uuid, target_item uuid, new_version uuid, file_name text,
  media_type text, file_size bigint, expiration date, actor uuid
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
      values (target_company, target_item, previous_version, 'superseded', actor);
  end if;
  insert into public.document_versions
    (id, company_id, item_id, version_number, storage_path, filename, content_type, size_bytes, expires_on, submitted_by)
    values (new_version, target_company, target_item, next_number, object_path, file_name, media_type, file_size, expiration, actor);
  insert into public.document_review_events (company_id, item_id, version_id, status, actor_id, expires_on)
    values (target_company, target_item, new_version, 'submitted', actor, expiration);
  update public.document_request_items set status = 'submitted', expires_on = expiration
    where company_id = target_company and id = target_item;
  return new_version;
end;
$$;
revoke all on function public._store_document_version(uuid, uuid, uuid, text, text, bigint, date, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.record_document_upload(
  target_company uuid, target_item uuid, new_version uuid, file_name text,
  media_type text, file_size bigint, expiration date, submitted_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.company_memberships
    where company_id = target_company and user_id = submitted_by
      and role in ('owner', 'admin', 'quality_manager', 'procurement_manager')
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return public._store_document_version(target_company, target_item, new_version, file_name,
    media_type, file_size, expiration, submitted_by);
end;
$$;

create function public.record_supplier_document_upload(
  target_company uuid, target_item uuid, new_version uuid, file_name text,
  media_type text, file_size bigint, expiration date, link_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitted_request uuid;
begin
  select request_id into permitted_request from public.supplier_upload_links
    where company_id = target_company and token_hash = link_hash and revoked_at is null
      and expires_at > clock_timestamp() for share;
  if not found or not exists (
    select 1 from public.document_request_items
    where company_id = target_company and id = target_item and request_id = permitted_request
  ) then
    raise exception 'Invalid supplier upload link' using errcode = '42501';
  end if;
  return public._store_document_version(target_company, target_item, new_version, file_name,
    media_type, file_size, expiration, null);
end;
$$;
revoke all on function public.record_supplier_document_upload(uuid, uuid, uuid, text, text, bigint, date, text)
  from public, anon, authenticated;
grant execute on function public.record_supplier_document_upload(uuid, uuid, uuid, text, text, bigint, date, text)
  to service_role;
