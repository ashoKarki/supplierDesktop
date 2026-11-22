create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid not null,
  version_id uuid not null unique,
  kind text not null check (kind = 'supplier_document_submitted'),
  created_at timestamptz not null default now(),
  foreign key (company_id, item_id, version_id)
    references public.document_versions(company_id, item_id, id) on delete cascade
);

create index notifications_company_created_idx on public.notifications(company_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));

create function public.notify_supplier_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (company_id, item_id, version_id, kind)
    values (new.company_id, new.item_id, new.id, 'supplier_document_submitted');
  return new;
end;
$$;
revoke all on function public.notify_supplier_submission() from public, anon, authenticated;
create trigger notify_supplier_submission
  after insert on public.document_versions
  for each row when (new.submitted_by is null)
  execute function public.notify_supplier_submission();
