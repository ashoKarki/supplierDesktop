create table public.supplier_portal_rate_limits (
  kind text not null check (kind in ('ip', 'token')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (kind, key_hash)
);

create index supplier_portal_rate_limits_window_idx
  on public.supplier_portal_rate_limits (window_started_at);
alter table public.supplier_portal_rate_limits enable row level security;
revoke all on public.supplier_portal_rate_limits from public, anon, authenticated, service_role;

create function public.consume_supplier_portal_limit(ip_key text, token_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  check_time timestamptz := clock_timestamp();
  ip_count integer;
  token_count integer;
begin
  if ip_key is null or ip_key !~ '^[0-9a-f]{64}$'
    or (token_key is not null and token_key !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid rate limit key' using errcode = '22023';
  end if;

  delete from public.supplier_portal_rate_limits
    where (kind, key_hash) in (
      select kind, key_hash from public.supplier_portal_rate_limits
      where window_started_at < check_time - interval '1 hour'
      order by window_started_at
      limit 100 for update skip locked
    );

  insert into public.supplier_portal_rate_limits (kind, key_hash, window_started_at, request_count)
    values ('ip', ip_key, check_time, 1)
  on conflict (kind, key_hash) do update set
    window_started_at = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
      then check_time else supplier_portal_rate_limits.window_started_at end,
    request_count = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
      then 1 else least(supplier_portal_rate_limits.request_count + 1, 61) end
  returning request_count into ip_count;
  if ip_count > 60 then
    return false;
  end if;

  if token_key is null then
    return true;
  end if;
  insert into public.supplier_portal_rate_limits (kind, key_hash, window_started_at, request_count)
    values ('token', token_key, check_time, 1)
  on conflict (kind, key_hash) do update set
    window_started_at = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
      then check_time else supplier_portal_rate_limits.window_started_at end,
    request_count = case when supplier_portal_rate_limits.window_started_at <= check_time - interval '5 minutes'
      then 1 else least(supplier_portal_rate_limits.request_count + 1, 31) end
  returning request_count into token_count;
  return token_count <= 30;
end;
$$;

revoke all on function public.consume_supplier_portal_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_supplier_portal_limit(text, text) to service_role;
