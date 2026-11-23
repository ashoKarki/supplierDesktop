create or replace function public.workspace_document_snapshot(target_company uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  with current_items as materialized (
    select distinct on (r.supplier_id, i.requirement_id)
      i.id, i.request_id, i.requirement_id, i.status, i.expires_on
    from public.document_request_items i
    join public.document_requests r
      on r.company_id = i.company_id and r.id = i.request_id
    join public.suppliers s
      on s.company_id = r.company_id and s.id = r.supplier_id
    where i.company_id = target_company and s.archived_at is null
    order by r.supplier_id, i.requirement_id, r.created_at desc, r.id desc
  ),
  relevant_items as materialized (
    select * from current_items where status <> 'cancelled'
  )
  select jsonb_build_object(
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'archived_at', s.archived_at) order by s.id)
      from public.suppliers s where s.company_id = target_company
    ), '[]'::jsonb),
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.id)
      from public.document_requirements r
      where r.company_id = target_company and exists (
        select 1 from relevant_items i where i.requirement_id = r.id
      )
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'supplier_id', r.supplier_id,
        'created_at', r.created_at, 'deadline', r.deadline) order by r.id)
      from public.document_requests r
      where r.company_id = target_company and exists (
        select 1 from relevant_items i where i.request_id = r.id
      )
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'request_id', i.request_id,
        'requirement_id', i.requirement_id, 'status', i.status, 'expires_on', i.expires_on) order by i.id)
      from relevant_items i
    ), '[]'::jsonb)
  ) into snapshot;
  return snapshot;
end;
$$;
