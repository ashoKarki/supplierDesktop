begin;
select plan(18);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
 ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'documents-owner-a@example.test', now(),
  '{"enrollment_type":"owner","administrator_name":"Owner A","company_name":"Documents A","country":"AT","business_details":"Manufacturer A"}'),
 ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'documents-owner-b@example.test', now(),
  '{"enrollment_type":"owner","administrator_name":"Owner B","company_name":"Documents B","country":"AT","business_details":"Manufacturer B"}'),
 ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'documents-viewer@example.test', now(), '{}');
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
 ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'documents-quality@example.test', now(), '{}'),
 ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'documents-procurement@example.test', now(), '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('test.documents_company_a', public.create_owner_workspace()::text, true);
insert into public.suppliers (company_id, name) values (current_setting('test.documents_company_a')::uuid, 'Supplier A');
select set_config('test.documents_supplier_a', (select id::text from public.suppliers where name = 'Supplier A'), true);
select lives_ok(
 $$insert into public.document_requirements (company_id, name, renewal_months) values (current_setting('test.documents_company_a')::uuid, 'ISO 9001', 12)$$,
 'owner A creates a requirement'
);
select set_config('test.requirement_a', (select id::text from public.document_requirements where name = 'ISO 9001'), true);
select lives_ok(
 $$select public.create_document_request(current_setting('test.documents_company_a')::uuid, current_setting('test.documents_supplier_a')::uuid, array[current_setting('test.requirement_a')::uuid])$$,
 'owner A creates a request for its supplier and requirement'
);
select set_config('test.request_a', (select id::text from public.document_requests), true);
select throws_ok(
 $$insert into public.document_request_items (company_id, request_id, requirement_id) values (current_setting('test.documents_company_a')::uuid, current_setting('test.request_a')::uuid, current_setting('test.requirement_a')::uuid)$$,
 '42501', null, 'direct request item inserts are denied'
);
select throws_ok(
 $$insert into public.document_requirements (company_id, name, renewal_months) values (current_setting('test.documents_company_a')::uuid, 'Invalid', 0)$$,
 '23514', null, 'invalid renewal period is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('test.documents_company_b', public.create_owner_workspace()::text, true);
select is((select count(*) from public.document_requirements), 0::bigint, 'company B cannot read company A requirements');
select is((select count(*) from public.document_requests), 0::bigint, 'company B cannot read company A requests');
select is((select count(*) from public.document_request_items), 0::bigint, 'company B cannot read company A items');
select throws_ok(
 $$select public.create_document_request(current_setting('test.documents_company_b')::uuid, current_setting('test.documents_supplier_a')::uuid, array[current_setting('test.requirement_a')::uuid])$$,
 '22023', null, 'company B cannot attach company A supplier to its request'
);
select throws_ok(
 $$insert into public.document_request_items (company_id, request_id, requirement_id) values (current_setting('test.documents_company_b')::uuid, current_setting('test.request_a')::uuid, current_setting('test.requirement_a')::uuid)$$,
 '42501', null, 'company B cannot directly insert request items'
);
select throws_ok(
 $$insert into public.document_requirements (company_id, name, renewal_months) values (current_setting('test.documents_company_a')::uuid, 'Cross tenant', 12)$$,
 '42501', null, 'company B cannot write company A requirements'
);
select throws_ok($$update public.document_requests set supplier_id = current_setting('test.documents_supplier_a')::uuid$$,
 '42501', null, 'direct request updates are unavailable');

reset role;
insert into public.company_memberships (company_id, user_id, role)
values (current_setting('test.documents_company_a')::uuid, '10000000-0000-0000-0000-000000000003', 'viewer');
insert into public.company_memberships (company_id, user_id, role)
values
 (current_setting('test.documents_company_a')::uuid, '10000000-0000-0000-0000-000000000004', 'quality_manager'),
 (current_setting('test.documents_company_a')::uuid, '10000000-0000-0000-0000-000000000005', 'procurement_manager');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.document_request_items), 1::bigint, 'viewer can read its company request items');
select throws_ok(
 $$insert into public.document_requirements (company_id, name, renewal_months) values (current_setting('test.documents_company_a')::uuid, 'Viewer write', 12)$$,
 '42501', null, 'viewer cannot create requirements'
);
select throws_ok(
 $$insert into public.document_requests (company_id, supplier_id) values (current_setting('test.documents_company_a')::uuid, current_setting('test.documents_supplier_a')::uuid)$$,
 '42501', null, 'viewer cannot create requests'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
 $$insert into public.document_requirements (company_id, name, renewal_months) values (current_setting('test.documents_company_a')::uuid, 'Quality requirement', 12)$$,
 'quality manager can create requirements'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok(
 $$insert into public.document_requirements (company_id, name, renewal_months) values (current_setting('test.documents_company_a')::uuid, 'Procurement requirement', 12)$$,
 '42501', null, 'procurement manager cannot create requirements'
);
select lives_ok(
 $$select public.create_document_request(current_setting('test.documents_company_a')::uuid, current_setting('test.documents_supplier_a')::uuid, array[current_setting('test.requirement_a')::uuid])$$,
 'procurement manager can create requests'
);
reset role;
set local role anon;
select throws_ok('select * from public.document_requests', '42501', null, 'anonymous users cannot read requests');
select * from finish();
rollback;
