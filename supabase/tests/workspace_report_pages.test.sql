begin;
select plan(8);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values ('36000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'reports@example.test',
  now(), '{"enrollment_type":"owner","administrator_name":"Report owner","company_name":"Report company","country":"AT","business_details":"Test"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '36000000-0000-0000-0000-000000000001', true);
select set_config('test.report_company', public.create_owner_workspace()::text, true);
reset role;

insert into public.suppliers (id, company_id, name, archived_at) values
  ('36100000-0000-0000-0000-000000000001', current_setting('test.report_company')::uuid, 'Active supplier', null),
  ('36100000-0000-0000-0000-000000000002', current_setting('test.report_company')::uuid, 'No requirements', null),
  ('36100000-0000-0000-0000-000000000003', current_setting('test.report_company')::uuid, 'Archived supplier', now());
insert into public.document_requirements (id, company_id, name, renewal_months) values
  ('36200000-0000-0000-0000-000000000001', current_setting('test.report_company')::uuid, 'Current certificate', 12),
  ('36200000-0000-0000-0000-000000000002', current_setting('test.report_company')::uuid, 'Renewal certificate', 12);
insert into public.document_requests (id, company_id, supplier_id, created_at, deadline) values
  ('36300000-0000-0000-0000-000000000001', current_setting('test.report_company')::uuid,
    '36100000-0000-0000-0000-000000000001', now() - interval '2 days',
    timezone('Europe/Vienna', now())::date - 1),
  ('36300000-0000-0000-0000-000000000002', current_setting('test.report_company')::uuid,
    '36100000-0000-0000-0000-000000000001', now() - interval '1 day', null),
  ('36300000-0000-0000-0000-000000000003', current_setting('test.report_company')::uuid,
    '36100000-0000-0000-0000-000000000003', now(), null);
insert into public.document_request_items (company_id, request_id, requirement_id, status, expires_on) values
  (current_setting('test.report_company')::uuid, '36300000-0000-0000-0000-000000000001',
    '36200000-0000-0000-0000-000000000002', 'requested', null),
  (current_setting('test.report_company')::uuid, '36300000-0000-0000-0000-000000000002',
    '36200000-0000-0000-0000-000000000001', 'approved', timezone('Europe/Vienna', now())::date + 45),
  (current_setting('test.report_company')::uuid, '36300000-0000-0000-0000-000000000003',
    '36200000-0000-0000-0000-000000000001', 'requested', null);

set local role authenticated;
select set_config('test.compliance_first',
  public.workspace_report_page(current_setting('test.report_company')::uuid, 'compliance', 1, 0)::text, true);
select is((current_setting('test.compliance_first')::jsonb->>'total')::integer,
  2, 'compliance total excludes archived suppliers');
select is(current_setting('test.compliance_first')::jsonb->'rows'->0->>'status',
  'Incomplete', 'compliance uses priority across current obligations');
select is((current_setting('test.compliance_first')::jsonb->'rows'->0->>'required')::integer,
  2, 'compliance aggregates current requirement rows');
select is(public.workspace_report_page(current_setting('test.report_company')::uuid, 'compliance', 1, 1)
  ->'rows'->0->>'status', 'Not assessed', 'second page returns the unassessed supplier');
select is(public.workspace_report_page(current_setting('test.report_company')::uuid, 'expiry', 50, 0)
  ->'rows'->0->>'status', 'Expiring', 'expiry status uses company-local calendar dates');
select is(public.workspace_report_page(current_setting('test.report_company')::uuid, 'outstanding', 50, 0)
  ->'rows'->0->>'status', 'Overdue', 'outstanding status uses the company-local deadline');
select throws_ok($$select public.workspace_report_page(current_setting('test.report_company')::uuid, 'compliance', 0, 0)$$,
  '22023', null, 'invalid page sizes are rejected');
select throws_ok($$select public.workspace_report_page('36900000-0000-0000-0000-000000000001', 'compliance', 10, 0)$$,
  '42501', null, 'members cannot read another company report');
select * from finish();
rollback;
