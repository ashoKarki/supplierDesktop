begin;
select plan(24);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', now(),
   '{"enrollment_type":"owner","administrator_name":"Owner A","company_name":"Company A","country":"AT","business_details":"Manufacturer A"}'),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', now(),
   '{"enrollment_type":"owner","administrator_name":"Owner B","company_name":"Company B","country":"DE","business_details":"Manufacturer B"}'),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'unverified@example.test', null,
   '{"enrollment_type":"owner","administrator_name":"Unverified","company_name":"Company C","country":"AT","business_details":"Manufacturer C"}'),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'viewer@example.test', now(), '{}'),
  ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'quality@example.test', now(), '{}'),
  ('00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'procurement@example.test', now(), '{}'),
  ('00000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'admin@example.test', now(), '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select lives_ok('select public.create_owner_workspace()', 'verified owner A can create a workspace');
select lives_ok('select public.create_owner_workspace()', 'workspace creation is idempotent');
select is((select count(*) from public.companies), 1::bigint, 'owner A has one workspace');
select set_config('test.company_a', (select id::text from public.companies), true);
select lives_ok($$insert into public.suppliers (company_id, name) select id, 'Supplier A' from public.companies$$, 'owner A can add a supplier');
select lives_ok($$update public.suppliers set archived_at = now()$$, 'owner A can archive a supplier');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok('select public.create_owner_workspace()', 'verified owner B can create a workspace');
select is((select count(*) from public.companies), 1::bigint, 'owner B sees only its company');
select is((select count(*) from public.suppliers), 0::bigint, 'owner B cannot read company A suppliers');
select throws_ok(
  $$insert into public.suppliers (company_id, name) values (current_setting('test.company_a')::uuid, 'Cross-tenant')$$,
  '42501', null, 'owner B cannot insert into company A'
);
select is_empty($$update public.suppliers set name = 'Changed' returning id$$, 'owner B cannot update company A suppliers');
select throws_ok($$delete from public.suppliers$$, '42501', null, 'owner B cannot delete company A suppliers');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok('select public.create_owner_workspace()', '42501', null, 'unverified users cannot create a workspace');

reset role;
insert into public.company_memberships (company_id, user_id, role)
values
  (current_setting('test.company_a')::uuid, '00000000-0000-0000-0000-000000000004', 'viewer'),
  (current_setting('test.company_a')::uuid, '00000000-0000-0000-0000-000000000005', 'quality_manager'),
  (current_setting('test.company_a')::uuid, '00000000-0000-0000-0000-000000000006', 'procurement_manager'),
  (current_setting('test.company_a')::uuid, '00000000-0000-0000-0000-000000000007', 'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.suppliers), 1::bigint, 'viewer can read its company suppliers');
select throws_ok(
  $$insert into public.suppliers (company_id, name) values (current_setting('test.company_a')::uuid, 'Not allowed')$$,
  '42501', null, 'viewer cannot create suppliers'
);
select is_empty($$update public.suppliers set name = 'Not allowed' returning id$$, 'viewer cannot update suppliers');
select throws_ok($$update public.company_memberships set role = 'owner'$$, '42501', null, 'viewer cannot change roles');
select is_empty($$update public.companies set name = 'Not allowed' returning id$$, 'viewer cannot update its company');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$update public.suppliers set company_id = gen_random_uuid()$$, '42501', null, 'supplier tenant cannot be changed');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.suppliers), 1::bigint, 'quality manager can read company suppliers');
select throws_ok(
  $$insert into public.suppliers (company_id, name) values (current_setting('test.company_a')::uuid, 'Not allowed')$$,
  '42501', null, 'quality manager cannot create suppliers'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select lives_ok(
  $$insert into public.suppliers (company_id, name) values (current_setting('test.company_a')::uuid, 'Procurement supplier')$$,
  'procurement manager can create suppliers'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
select lives_ok($$update public.companies set name = 'Updated company'$$, 'administrator can update company profile');

reset role;
set local role anon;
select throws_ok('select * from public.companies', '42501', null, 'anonymous users cannot read companies');
select throws_ok('select * from public.suppliers', '42501', null, 'anonymous users cannot read suppliers');
select * from finish();
rollback;
