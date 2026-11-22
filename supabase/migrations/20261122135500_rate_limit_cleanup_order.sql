create or replace function public.consume_supplier_portal_limit(ip_key text, token_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  check_time timestamptz := clock_timestamp();
  ip_count integer;
  token_count integer := 0;
begin
  if ip_key is null or ip_key !~ '^[0-9a-f]{64}$'
    or (token_key is not null and token_key !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid rate limit key' using errcode = '22023';
  end if;

  insert into public.supplier_portal_rate_limits (kind, key_hash, window_started_at, request_count)
    values ('ip', ip_key, check_time, 1)
  on conflict (kind, key_hash) do update set
    window_started_at = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
      then check_time else supplier_portal_rate_limits.window_started_at end,
    request_count = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
      then 1 else least(supplier_portal_rate_limits.request_count + 1, 61) end
  returning request_count into ip_count;

  if ip_count <= 60 and token_key is not null then
    insert into public.supplier_portal_rate_limits (kind, key_hash, window_started_at, request_count)
      values ('token', token_key, check_time, 1)
    on conflict (kind, key_hash) do update set
      window_started_at = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
        then check_time else supplier_portal_rate_limits.window_started_at end,
      request_count = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
        then 1 else least(supplier_portal_rate_limits.request_count + 1, 31) end
    returning request_count into token_count;
  end if;

  delete from public.supplier_portal_rate_limits
    where (kind, key_hash) in (
      select kind, key_hash from public.supplier_portal_rate_limits
      where window_started_at < check_time - interval '1 hour'
      order by window_started_at
      limit 100 for update skip locked
    );
  return ip_count <= 60 and token_count <= 30;
end;
$$;
