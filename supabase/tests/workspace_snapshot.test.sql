begin;
select plan(5);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'snapshot@example.test', now(),
  '{"enrollment_type":"owner","administrator_name":"Snapshot owner","company_name":"Snapshot company","country":"AT","business_details":"Test"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('test.snapshot_company', public.create_owner_workspace()::text, true);
reset role;

insert into public.suppliers (id, company_id, name, archived_at) values
  ('31000000-0000-0000-0000-000000000001', current_setting('test.snapshot_company')::uuid, 'Active', null),
  ('31000000-0000-0000-0000-000000000002', current_setting('test.snapshot_company')::uuid, 'Archived', now());
insert into public.document_requirements (id, company_id, name, renewal_months) values
  ('32000000-0000-0000-0000-000000000001', current_setting('test.snapshot_company')::uuid, 'Current', 12),
  ('32000000-0000-0000-0000-000000000002', current_setting('test.snapshot_company')::uuid, 'Cancelled', 12);
insert into public.document_requests (id, company_id, supplier_id, created_at) values
  ('33000000-0000-0000-0000-000000000001', current_setting('test.snapshot_company')::uuid, '31000000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00'),
  ('33000000-0000-0000-0000-000000000002', current_setting('test.snapshot_company')::uuid, '31000000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00'),
  ('33000000-0000-0000-0000-000000000003', current_setting('test.snapshot_company')::uuid, '31000000-0000-0000-0000-000000000002', '2026-01-01 00:00:00+00');
insert into public.document_request_items (company_id, request_id, requirement_id, status) values
  (current_setting('test.snapshot_company')::uuid, '33000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'requested'),
  (current_setting('test.snapshot_company')::uuid, '33000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', 'approved'),
  (current_setting('test.snapshot_company')::uuid, '33000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', 'requested'),
  (current_setting('test.snapshot_company')::uuid, '33000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002', 'cancelled'),
  (current_setting('test.snapshot_company')::uuid, '33000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000001', 'requested');

set local role authenticated;
select set_config('test.snapshot', public.workspace_document_snapshot(current_setting('test.snapshot_company')::uuid)::text, true);
select is(jsonb_array_length(current_setting('test.snapshot')::jsonb->'suppliers'), 2, 'total suppliers includes archived suppliers');
select is(jsonb_array_length(current_setting('test.snapshot')::jsonb->'items'), 1, 'snapshot excludes archived, cancelled and superseded obligations');
select is(current_setting('test.snapshot')::jsonb->'items'->0->>'status', 'approved', 'identical timestamps use the request ID tie-breaker');
select is(jsonb_array_length(current_setting('test.snapshot')::jsonb->'requests'), 1, 'snapshot excludes obsolete requests');
select is(jsonb_array_length(current_setting('test.snapshot')::jsonb->'requirements'), 1, 'snapshot excludes obsolete requirements');
select * from finish();
rollback;
