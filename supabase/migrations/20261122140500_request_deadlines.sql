alter table public.document_requests
  add column deadline date
  check (deadline between date '1000-01-01' and date '9999-12-31');

drop function public.create_document_request(uuid, uuid, uuid[]);

create function public.create_document_request(
  target_company uuid,
  target_supplier uuid,
  requirement_ids uuid[],
  submission_deadline date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager', 'procurement_manager']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  if requirement_ids is null or cardinality(requirement_ids) not between 1 and 100
    or array_position(requirement_ids, null) is not null
    or (select count(distinct value) from unnest(requirement_ids) as value) <> cardinality(requirement_ids)
    or not exists (
      select 1 from public.suppliers
      where company_id = target_company and id = target_supplier and archived_at is null
    )
    or (select count(*) from public.document_requirements
      where company_id = target_company and id = any(requirement_ids)) <> cardinality(requirement_ids)
  then
    raise exception 'Invalid request details' using errcode = '22023';
  end if;

  insert into public.document_requests (company_id, supplier_id, deadline)
    values (target_company, target_supplier, submission_deadline) returning id into request_id;
  insert into public.document_request_items (company_id, request_id, requirement_id)
    select target_company, request_id, value from unnest(requirement_ids) as value;
  return request_id;
end;
$$;

revoke all on function public.create_document_request(uuid, uuid, uuid[], date) from public, anon;
grant execute on function public.create_document_request(uuid, uuid, uuid[], date) to authenticated;
