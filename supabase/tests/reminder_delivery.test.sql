begin;
select plan(12);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values ('35000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'reminder-owner@example.test', now(),
  '{"enrollment_type":"owner","administrator_name":"Reminder owner","company_name":"Reminder company","country":"AT","business_details":"Test"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000001', true);
select set_config('test.reminder_company', public.create_owner_workspace()::text, true);
select throws_ok('select * from public.reminder_deliveries',
  '42501', null, 'authenticated users cannot read reminder recipients');
select throws_ok('select public.enqueue_due_reminders()',
  '42501', null, 'authenticated users cannot enqueue reminders');
reset role;

insert into public.suppliers (id, company_id, name, contact_email)
values ('35100000-0000-0000-0000-000000000001',
  current_setting('test.reminder_company')::uuid, 'Reminder supplier', 'Supplier@example.test');
insert into public.document_requirements (id, company_id, name, renewal_months)
values ('35200000-0000-0000-0000-000000000001',
  current_setting('test.reminder_company')::uuid, 'Safety certificate', 12);
insert into public.document_requests (id, company_id, supplier_id, deadline)
values ('35300000-0000-0000-0000-000000000001',
  current_setting('test.reminder_company')::uuid, '35100000-0000-0000-0000-000000000001',
  timezone('Europe/Vienna', now())::date + 7);
insert into public.document_request_items (company_id, request_id, requirement_id, status)
values (current_setting('test.reminder_company')::uuid,
  '35300000-0000-0000-0000-000000000001', '35200000-0000-0000-0000-000000000001', 'requested');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.enqueue_due_reminders(), 2, 'supplier and confirmed workspace staff receive reminders');
select is(public.enqueue_due_reminders(), 0, 'repeated enqueueing does not duplicate deliveries');
select is((select count(*) from public.claim_due_reminders(10)), 2::bigint, 'worker atomically claims due deliveries');
select is((select count(*) from public.claim_due_reminders(10)), 0::bigint, 'a concurrent claim cannot take an active lease');
select is((select status from public.reminder_deliveries
  where recipient_kind = 'supplier'), 'processing', 'claimed delivery is marked processing');

select is(public.create_reminder_supplier_upload_link(
  (select id from public.reminder_deliveries where recipient_kind = 'supplier'), repeat('a', 64)),
  repeat('a', 64), 'supplier link is issued for the claimed job');
select is(public.create_reminder_supplier_upload_link(
  (select id from public.reminder_deliveries where recipient_kind = 'supplier'), repeat('a', 64)),
  repeat('a', 64), 'retry reuses the same bearer link');
select is((select count(*) from public.supplier_upload_links
  where token_hash = encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex')),
  1::bigint, 'the retry token is stored only once as a hash');

select public.complete_reminder_delivery(
  (select id from public.reminder_deliveries where recipient_kind = 'supplier'), 'failed', 'delivery_failed');
select is((select status from public.reminder_deliveries where recipient_kind = 'supplier'),
  'pending', 'failed delivery is returned to the retry queue');
select is((select attempts from public.reminder_deliveries where recipient_kind = 'supplier'),
  1, 'attempt count is preserved for exponential backoff');

reset role;
select * from finish();
rollback;
