begin;
select plan(18);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'link-owner@example.test', now()),
       ('40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'link-viewer@example.test', now()),
       ('40000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'link-other@example.test', now());
insert into public.companies (id, name, country, business_details)
values ('41000000-0000-0000-0000-000000000001', 'Link A', 'AT', 'Test'),
       ('41000000-0000-0000-0000-000000000002', 'Link B', 'AT', 'Test');
insert into public.company_memberships (company_id, user_id, role)
values ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'owner'),
       ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'viewer'),
       ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'owner');
insert into public.suppliers (id, company_id, name)
values ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Supplier');
insert into public.document_requirements (id, company_id, name, renewal_months)
values ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Certificate', 12);
insert into public.document_requests (id, company_id, supplier_id)
values ('44000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001'),
       ('44000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001');
insert into public.document_request_items (id, company_id, request_id, requirement_id)
values ('45000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001'),
       ('45000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name, metadata)
values ('supplierdesk-documents', '41000000-0000-0000-0000-000000000001/45000000-0000-0000-0000-000000000001/46000000-0000-0000-0000-000000000001', '{"size": 6, "mimetype": "application/pdf"}'),
       ('supplierdesk-documents', '41000000-0000-0000-0000-000000000001/45000000-0000-0000-0000-000000000002/46000000-0000-0000-0000-000000000002', '{"size": 6, "mimetype": "application/pdf"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('test.supplier_token', public.create_supplier_upload_link('41000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001'), true);
select is(length(current_setting('test.supplier_token')), 64, 'link token has 256 bits');
select is((select count(*) from public.supplier_upload_links), 1::bigint, 'owner can list link metadata');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.supplier_upload_links), 'link expires after seven days');
select throws_ok($$select token_hash from public.supplier_upload_links$$, '42501', null, 'authenticated users cannot read token hashes');
select throws_ok($$insert into public.supplier_upload_links (company_id, request_id, token_hash, expires_at, created_by) values (gen_random_uuid(), gen_random_uuid(), 'x', now(), gen_random_uuid())$$, '42501', null, 'link records cannot be forged directly');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.create_supplier_upload_link('41000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001')$$, '42501', null, 'viewer cannot issue links');
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.supplier_upload_links), 0::bigint, 'other company cannot list links');
select throws_ok($$select public.create_supplier_upload_link('41000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001')$$, '42501', null, 'other company cannot issue link');
reset role;
set local role service_role;
select throws_ok(
 $$select public.record_supplier_document_upload('41000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,repeat('0',64))$$,
 '42501', null, 'invalid token is rejected');
select throws_ok(
 $$select public.record_supplier_document_upload('41000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002','46000000-0000-0000-0000-000000000002','file.pdf','application/pdf',6,null,encode(extensions.digest(current_setting('test.supplier_token'),'sha256'),'hex'))$$,
 '42501', null, 'token cannot upload to another request');
select lives_ok(
 $$select public.record_supplier_document_upload('41000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,'2027-01-01',encode(extensions.digest(current_setting('test.supplier_token'),'sha256'),'hex'))$$,
 'supplier can upload to its request');
reset role;
select is((select submitted_by from public.document_versions where id = '46000000-0000-0000-0000-000000000001'), null::uuid, 'supplier upload is not attributed to an employee');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.revoke_supplier_upload_link('41000000-0000-0000-0000-000000000001', (select id from public.supplier_upload_links limit 1))$$, 'owner revokes link');
reset role;
set local role service_role;
select throws_ok(
 $$select public.record_supplier_document_upload('41000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,encode(extensions.digest(current_setting('test.supplier_token'),'sha256'),'hex'))$$,
 '42501', null, 'revoked token is rejected');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('test.expired_token', public.create_supplier_upload_link('41000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001'), true);
reset role;
update public.supplier_upload_links set expires_at = now() - interval '1 second'
  where token_hash = encode(extensions.digest(current_setting('test.expired_token'),'sha256'),'hex');
set local role service_role;
select is((select count(*) from public.resolve_supplier_upload_link(encode(extensions.digest(current_setting('test.expired_token'),'sha256'),'hex'))), 0::bigint, 'expired token does not resolve');
select throws_ok(
 $$select public.record_supplier_document_upload('41000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,encode(extensions.digest(current_setting('test.expired_token'),'sha256'),'hex'))$$,
 '42501', null, 'expired token cannot submit');
reset role;
set local role anon;
select throws_ok($$select public.create_supplier_upload_link('41000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001')$$, '42501', null, 'anonymous users cannot issue links');
select throws_ok(
 $$select public.record_supplier_document_upload('41000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','file.pdf','application/pdf',6,null,repeat('0',64))$$,
 '42501', null, 'anonymous users cannot call trusted upload function');
select * from finish();
rollback;
