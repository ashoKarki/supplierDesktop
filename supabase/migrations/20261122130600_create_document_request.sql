revoke insert on public.document_requests, public.document_request_items from authenticated;

create function public.create_document_request(
  target_company uuid,
  target_supplier uuid,
  requirement_ids uuid[]
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

  insert into public.document_requests (company_id, supplier_id)
    values (target_company, target_supplier) returning id into request_id;
  insert into public.document_request_items (company_id, request_id, requirement_id)
    select target_company, request_id, value from unnest(requirement_ids) as value;
  return request_id;
end;
$$;

revoke all on function public.create_document_request(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.create_document_request(uuid, uuid, uuid[]) to authenticated;
