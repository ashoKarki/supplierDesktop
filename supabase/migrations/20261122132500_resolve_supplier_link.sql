create function public.resolve_supplier_upload_link(link_hash text)
returns table (company_id uuid, request_id uuid, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select l.company_id, l.request_id, l.expires_at from public.supplier_upload_links l
  where l.token_hash = link_hash and l.revoked_at is null and l.expires_at > clock_timestamp();
$$;
revoke all on function public.resolve_supplier_upload_link(text) from public, anon, authenticated;
grant execute on function public.resolve_supplier_upload_link(text) to service_role;
