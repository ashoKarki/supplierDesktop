begin;
select plan(14);

set local role anon;
select throws_ok(
  $$select public.consume_supplier_portal_limit(repeat('a',64), repeat('b',64))$$,
  '42501', null, 'anonymous users cannot call the rate limiter'
);
set local role authenticated;
select throws_ok(
  $$select public.consume_supplier_portal_limit(repeat('a',64), repeat('b',64))$$,
  '42501', null, 'authenticated users cannot call the rate limiter'
);
select throws_ok('select * from public.supplier_portal_rate_limits',
  '42501', null, 'clients cannot read rate limit keys');
reset role;
set local role service_role;
select throws_ok('select * from public.supplier_portal_rate_limits',
  '42501', null, 'service role cannot read rate limit keys directly');
select throws_ok($$select public.consume_supplier_portal_limit('invalid', null)$$,
  '22023', null, 'invalid IP keys are rejected');
select throws_ok($$select public.consume_supplier_portal_limit(repeat('a',64), 'invalid')$$,
  '22023', null, 'invalid token keys are rejected');
select is(public.consume_supplier_portal_limit(repeat('f',64), null), true,
  'malformed tokens can still be counted against an IP');
select ok((select bool_and(public.consume_supplier_portal_limit(repeat('a',64), repeat('b',64)))
  from generate_series(1,30)), 'thirty requests for a token are permitted');
select is(public.consume_supplier_portal_limit(repeat('a',64), repeat('b',64)), false,
  'requests above the token limit are denied');
select is(public.consume_supplier_portal_limit(repeat('c',64), repeat('b',64)), false,
  'the token limit applies across IP addresses');
select ok((select bool_and(public.consume_supplier_portal_limit(
  repeat('d',64), md5('rate-token-' || n) || md5('rate-token-' || n)))
  from generate_series(1,60) n), 'sixty distinct tokens from one IP are permitted');
select is(public.consume_supplier_portal_limit(repeat('d',64), repeat('e',64)), false,
  'requests above the IP limit are denied even with a new token');
reset role;
update public.supplier_portal_rate_limits set window_started_at = clock_timestamp() - interval '6 minutes'
  where (kind = 'ip' and key_hash = repeat('a',64))
    or (kind = 'token' and key_hash = repeat('b',64));
insert into public.supplier_portal_rate_limits (kind, key_hash, window_started_at, request_count)
values ('ip', repeat('0',64), clock_timestamp() - interval '2 hours', 1);
set local role service_role;
select is(public.consume_supplier_portal_limit(repeat('a',64), repeat('b',64)), true,
  'limits reset after the five-minute window');
reset role;
select is((select count(*) from public.supplier_portal_rate_limits where key_hash = repeat('0',64)),
  0::bigint, 'old counters are cleaned up opportunistically');
select * from finish();
rollback;
