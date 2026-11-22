create function public.revoke_supplier_link_hash(target_company uuid, target_hash text)
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
    where company_id = target_company and token_hash = target_hash;
  if not found then
    raise exception 'Link not found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.revoke_supplier_link_hash(uuid, text) from public, anon;
grant execute on function public.revoke_supplier_link_hash(uuid, text) to authenticated;
