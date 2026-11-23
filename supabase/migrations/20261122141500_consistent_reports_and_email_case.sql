alter table public.suppliers drop constraint suppliers_contact_email_check;
alter table public.suppliers add constraint suppliers_contact_email_check check (
  contact_email is null
  or (
    char_length(contact_email) <= 254
    and contact_email = btrim(contact_email)
    and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create function public.workspace_document_snapshot(target_company uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'archived_at', s.archived_at) order by s.id)
      from public.suppliers s where s.company_id = target_company
    ), '[]'::jsonb),
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.id)
      from public.document_requirements r where r.company_id = target_company
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'supplier_id', r.supplier_id,
        'created_at', r.created_at, 'deadline', r.deadline) order by r.id)
      from public.document_requests r where r.company_id = target_company
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'request_id', i.request_id,
        'requirement_id', i.requirement_id, 'status', i.status, 'expires_on', i.expires_on) order by i.id)
      from public.document_request_items i where i.company_id = target_company
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.workspace_document_snapshot(uuid) from public, anon;
grant execute on function public.workspace_document_snapshot(uuid) to authenticated;
