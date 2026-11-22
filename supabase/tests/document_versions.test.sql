begin;
select plan(23);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
 ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'version-owner@example.test', now()),
 ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'version-viewer@example.test', now()),
 ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'version-other@example.test', now());
insert into public.companies (id, name, country, business_details)
values ('31000000-0000-0000-0000-000000000001', 'Version A', 'AT', 'Test'),
       ('31000000-0000-0000-0000-000000000002', 'Version B', 'AT', 'Test');
insert into public.company_memberships (company_id, user_id, role)
values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'owner'),
       ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'viewer'),
       ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'owner');
insert into public.suppliers (id, company_id, name)
values ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'Supplier');
insert into public.document_requirements (id, company_id, name, renewal_months)
values ('33000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'Certificate', 12);
insert into public.document_requests (id, company_id, supplier_id)
values ('34000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001');
insert into public.document_request_items (id, company_id, request_id, requirement_id)
values ('35000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001',
        '34000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name, metadata)
values
 ('supplierdesk-documents', '31000000-0000-0000-0000-000000000001/35000000-0000-0000-0000-000000000001/36000000-0000-0000-0000-000000000001', '{"size": 6, "mimetype": "application/pdf"}'),
 ('supplierdesk-documents', '31000000-0000-0000-0000-000000000001/35000000-0000-0000-0000-000000000001/36000000-0000-0000-0000-000000000002', '{"size": 6, "mimetype": "application/pdf"}');

select is((select public from storage.buckets where id = 'supplierdesk-documents'), false, 'document bucket is private');
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is((select count(*) from storage.objects where bucket_id = 'supplierdesk-documents'), 0::bigint, 'members cannot read objects directly');
select throws_ok(
 $$select public.record_document_upload('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,'30000000-0000-0000-0000-000000000001')$$,
 '42501', null, 'members cannot forge trusted upload metadata');
reset role;
set local role service_role;
select throws_ok(
 $$select public.record_document_upload('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,'30000000-0000-0000-0000-000000000002')$$,
 '42501', null, 'trusted upload checks actor permissions');
select throws_ok(
 $$select public.record_document_upload('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','file.pdf','application/pdf',7,null,'30000000-0000-0000-0000-000000000001')$$,
 '22023', null, 'object metadata must match');
select lives_ok(
 $$select public.record_document_upload('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,'2027-01-01','30000000-0000-0000-0000-000000000001')$$,
 'trusted service records the first version');
reset role;
set local role authenticated;
select is((select status from public.document_request_items where id = '35000000-0000-0000-0000-000000000001'), 'submitted', 'upload submits item');
select is((select count(*) from public.document_versions), 1::bigint, 'first version exists');
select lives_ok(
 $$select public.review_document('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','under_review',null,null)$$,
 'owner starts review');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select throws_ok(
 $$select public.review_document('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','approved',null,null)$$,
 '42501', null, 'viewer cannot review');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select throws_ok(
 $$select public.review_document('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','approved',null,null)$$,
 '42501', null, 'other company cannot review');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
 $$select public.review_document('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','rejected','  ',null)$$,
 '22023', null, 'rejection requires a reason');
select lives_ok(
 $$select public.review_document('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','rejected','Incomplete',null)$$,
 'owner rejects with reason');
select throws_ok(
 $$select public.review_document('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000002','under_review',null,null)$$,
 '40001', null, 'stale version cannot be reviewed');
reset role;
set local role service_role;
select lives_ok(
 $$select public.record_document_upload('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000002','file.pdf','application/pdf',6,null,'30000000-0000-0000-0000-000000000001')$$,
 'rejected document can be resubmitted');
reset role;
set local role authenticated;
select is((select max(version_number) from public.document_versions), 2, 'replacement increments version');
select is((select count(*) from public.document_review_events), 4::bigint, 'history records each action');
select throws_ok(
 $$update public.document_versions set filename = 'changed.pdf'$$,
 '42501', null, 'versions cannot be edited directly');
select throws_ok(
 $$delete from public.document_review_events$$,
 '42501', null, 'history cannot be deleted directly');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.document_versions), 0::bigint, 'other company cannot see versions');
select is((select count(*) from public.document_review_events), 0::bigint, 'other company cannot see review history');
reset role;
set local role service_role;
select throws_ok(
 $$select public.record_document_upload('31000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','36000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,'30000000-0000-0000-0000-000000000001')$$,
 '22023', null, 'pending version cannot be replaced');
reset role;
select is((select count(*) from public.document_versions), 2::bigint, 'failed replacement leaves no additional version');
select * from finish();
rollback;
