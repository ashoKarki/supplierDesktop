begin;
select plan(19);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
 ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'workflow-a@example.test', now(),
  '{"enrollment_type":"owner","administrator_name":"Owner A","company_name":"Workflow A","country":"AT","business_details":"Manufacturer A"}'),
 ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'workflow-b@example.test', now(),
  '{"enrollment_type":"owner","administrator_name":"Owner B","company_name":"Workflow B","country":"AT","business_details":"Manufacturer B"}'),
 ('20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'workflow-viewer@example.test', now(), '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('test.workflow_a', public.create_owner_workspace()::text, true);
insert into public.suppliers (company_id, name) values (current_setting('test.workflow_a')::uuid, 'Supplier A');
insert into public.document_requirements (company_id, name, renewal_months)
values (current_setting('test.workflow_a')::uuid, 'ISO 9001', 12),
       (current_setting('test.workflow_a')::uuid, 'Insurance', 12);
select set_config('test.workflow_supplier', (select id::text from public.suppliers where name = 'Supplier A'), true);
select set_config('test.workflow_requirement', (select id::text from public.document_requirements where name = 'ISO 9001'), true);
select set_config('test.workflow_requirement_2', (select id::text from public.document_requirements where name = 'Insurance'), true);
select lives_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid,
   array[current_setting('test.workflow_requirement')::uuid,current_setting('test.workflow_requirement_2')::uuid])$$,
 'owner creates a request and its items together'
);
select is((select count(*) from public.document_requests), 1::bigint, 'one request was created');
select is((select deadline from public.document_requests), null::date, 'existing callers can omit a deadline');
select is((select count(*) from public.document_request_items), 2::bigint, 'both request items were created');
select is(jsonb_array_length(public.workspace_document_snapshot(current_setting('test.workflow_a')::uuid)->'items'), 2,
  'snapshot contains the company request items');
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid], 'infinity'::date)$$,
 '23514', null, 'non-calendar deadlines are rejected'
);
select is((select count(*) from public.document_requests), 1::bigint, 'invalid deadline leaves no partial request');
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[]::uuid[])$$,
 '22023', null, 'empty request is rejected'
);
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid, gen_random_uuid()])$$,
 '22023', null, 'unknown requirement is rejected'
);
select is((select count(*) from public.document_requests), 1::bigint, 'failed request leaves no partial record');
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid,current_setting('test.workflow_requirement')::uuid])$$,
 '22023', null, 'duplicate requirements are rejected'
);
select throws_ok(
 $$insert into public.document_requests (company_id, supplier_id) values (current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid)$$,
 '42501', null, 'direct request inserts are denied'
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('test.workflow_b', public.create_owner_workspace()::text, true);
select throws_ok(
 $$select public.workspace_document_snapshot(current_setting('test.workflow_a')::uuid)$$,
 '42501', null, 'another company cannot load the workspace snapshot'
);
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid])$$,
 '42501', null, 'another company cannot create requests for company A'
);
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_b')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid])$$,
 '22023', null, 'cross-company supplier and requirements are rejected'
);
reset role;
insert into public.company_memberships (company_id, user_id, role)
values (current_setting('test.workflow_a')::uuid, '20000000-0000-0000-0000-000000000003', 'viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select is(jsonb_array_length(public.workspace_document_snapshot(current_setting('test.workflow_a')::uuid)->'items'), 2,
  'viewer can read a workspace snapshot');
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid])$$,
 '42501', null, 'viewer cannot create requests'
);
reset role;
set local role anon;
select throws_ok(
 $$select public.workspace_document_snapshot(current_setting('test.workflow_a')::uuid)$$,
 '42501', null, 'anonymous users cannot load a workspace snapshot'
);
select throws_ok(
 $$select public.create_document_request(current_setting('test.workflow_a')::uuid, current_setting('test.workflow_supplier')::uuid, array[current_setting('test.workflow_requirement')::uuid])$$,
 '42501', null, 'anonymous users cannot create requests'
);
select * from finish();
rollback;
