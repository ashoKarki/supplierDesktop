begin;
select plan(14);

insert into public.companies (id, name, country, business_details) values
  ('10000000-0000-0000-0000-000000000001', 'Limit test A', 'AT', 'Local test'),
  ('10000000-0000-0000-0000-000000000002', 'Limit test B', 'AT', 'Local test');
insert into auth.users (id, aud, role, email, email_confirmed_at)
select md5('limit-test-' || n)::uuid, 'authenticated', 'authenticated',
  'limit-test-' || n || '@example.test', now()
from generate_series(1, 11) as n;
insert into public.company_memberships (company_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', md5('limit-test-1')::uuid, 'owner'),
  ('10000000-0000-0000-0000-000000000001', md5('limit-test-2')::uuid, 'viewer'),
  ('10000000-0000-0000-0000-000000000002', md5('limit-test-3')::uuid, 'owner');

select is((select count(*) from public.company_trials where company_id in
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')),
  2::bigint, 'each new company has a trial');
select is((select ends_at - started_at from public.company_trials where company_id = '10000000-0000-0000-0000-000000000001'),
  interval '30 days', 'trial lasts 30 days');
set local role authenticated;
select set_config('request.jwt.claim.sub', md5('limit-test-1')::uuid::text, true);
select is((select count(*) from public.company_trials), 1::bigint, 'owner sees only own trial');
select throws_ok($$update public.company_trials set ends_at = now() + interval '1 year'$$,
  '42501', null, 'owner cannot modify trial');
select set_config('request.jwt.claim.sub', md5('limit-test-2')::uuid::text, true);
select is((select count(*) from public.company_trials), 0::bigint, 'viewer cannot read trial details');
select set_config('request.jwt.claim.sub', md5('limit-test-1')::uuid::text, true);
select lives_ok($$insert into public.suppliers (company_id, name, archived_at)
  select '10000000-0000-0000-0000-000000000001', 'Supplier ' || n,
    case when n = 1 then now() else null end from generate_series(1, 100) n$$,
  'owner can create 100 suppliers');
select throws_ok($$insert into public.suppliers (company_id, name)
  values ('10000000-0000-0000-0000-000000000001', 'Over limit')$$,
  'P1001', null, 'archived suppliers count toward the cap');
select throws_ok($$insert into public.suppliers (company_id, name)
  values ('10000000-0000-0000-0000-000000000002', 'Cross-tenant')$$,
  '42501', null, 'capacity check does not bypass tenant authorization');

reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.company_memberships (company_id, user_id, role)
select '10000000-0000-0000-0000-000000000001', md5('limit-test-' || n)::uuid, 'viewer'
from generate_series(3, 10) n;
select is((select count(*) from public.company_memberships where company_id = '10000000-0000-0000-0000-000000000001'),
  10::bigint, 'member cap includes the owner');
select throws_ok($$insert into public.company_memberships (company_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000001', md5('limit-test-11')::uuid, 'viewer')$$,
  'P1002', null, 'eleventh member is rejected even for privileged writes');
select lives_ok($$insert into public.suppliers (company_id, name)
  values ('10000000-0000-0000-0000-000000000002', 'Independent supplier')$$,
  'other company has its own supplier capacity');
select lives_ok($$insert into public.company_memberships (company_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000002', md5('limit-test-11')::uuid, 'viewer')$$,
  'other company has its own member capacity');
select throws_ok($$update public.suppliers set company_id = '10000000-0000-0000-0000-000000000001'
  where company_id = '10000000-0000-0000-0000-000000000002'$$,
  'P1001', null, 'moving a supplier cannot bypass the target cap');
select throws_ok($$update public.company_memberships set company_id = '10000000-0000-0000-0000-000000000001'
  where company_id = '10000000-0000-0000-0000-000000000002' and user_id = md5('limit-test-11')::uuid$$,
  'P1002', null, 'moving a membership cannot bypass the target cap');
select * from finish();
rollback;
