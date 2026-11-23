create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  request_id uuid not null,
  item_id uuid,
  recipient_email text not null check (char_length(recipient_email) between 3 and 254),
  recipient_kind text not null check (recipient_kind in ('supplier', 'staff')),
  reminder_kind text not null check (reminder_kind in (
    'deadline_7_days', 'deadline_1_day_overdue',
    'expiry_90_days', 'expiry_60_days', 'expiry_30_days', 'expiry_7_days'
  )),
  scheduled_on date not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  foreign key (company_id, request_id) references public.document_requests(company_id, id) on delete cascade,
  foreign key (company_id, item_id) references public.document_request_items(company_id, id) on delete cascade,
  unique nulls not distinct (company_id, request_id, item_id, recipient_email, reminder_kind, scheduled_on)
);

create index reminder_deliveries_claim_idx
  on public.reminder_deliveries(next_attempt_at, created_at)
  where status in ('pending', 'processing');
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from public, anon, authenticated, service_role;

create function public.enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  delete from public.reminder_deliveries
  where status in ('sent', 'failed', 'skipped') and created_at < now() - interval '180 days';

  with company_dates as materialized (
    select c.id, c.time_zone, timezone(c.time_zone, clock_timestamp())::date as today
    from public.companies c
  ),
  deadline_events as (
    select c.id as company_id, r.id as request_id, null::uuid as item_id,
      case
        when r.deadline = c.today + 7 then 'deadline_7_days'
        else 'deadline_1_day_overdue'
      end as reminder_kind,
      c.today as scheduled_on
    from company_dates c
    join public.document_requests r on r.company_id = c.id
    join public.suppliers s on s.company_id = r.company_id and s.id = r.supplier_id
    where s.archived_at is null
      and r.deadline in (c.today + 7, c.today - 1)
      and exists (
        select 1
        from public.document_request_items i
        where i.company_id = r.company_id and i.request_id = r.id
          and i.status in ('requested', 'rejected')
          and not exists (
            select 1
            from public.document_request_items newer_item
            join public.document_requests newer_request
              on newer_request.company_id = newer_item.company_id
              and newer_request.id = newer_item.request_id
            where newer_request.company_id = r.company_id
              and newer_request.supplier_id = r.supplier_id
              and newer_item.requirement_id = i.requirement_id
              and (newer_request.created_at, newer_request.id) > (r.created_at, r.id)
          )
      )
  ),
  expiry_events as (
    select c.id as company_id, r.id as request_id, i.id as item_id,
      case i.expires_on - c.today
        when 90 then 'expiry_90_days'
        when 60 then 'expiry_60_days'
        when 30 then 'expiry_30_days'
        when 7 then 'expiry_7_days'
      end as reminder_kind,
      c.today as scheduled_on
    from company_dates c
    join public.document_request_items i on i.company_id = c.id and i.status = 'approved'
    join public.document_requests r on r.company_id = i.company_id and r.id = i.request_id
    join public.suppliers s on s.company_id = r.company_id and s.id = r.supplier_id
    where s.archived_at is null
      and i.expires_on - c.today in (90, 60, 30, 7)
      and not exists (
        select 1
        from public.document_request_items newer_item
        join public.document_requests newer_request
          on newer_request.company_id = newer_item.company_id
          and newer_request.id = newer_item.request_id
        where newer_request.company_id = r.company_id
          and newer_request.supplier_id = r.supplier_id
          and newer_item.requirement_id = i.requirement_id
          and (newer_request.created_at, newer_request.id) > (r.created_at, r.id)
      )
  ),
  events as (
    select * from deadline_events
    union all
    select * from expiry_events
  ),
  recipients as (
    select e.company_id, e.request_id, e.item_id, e.reminder_kind, e.scheduled_on,
      s.contact_email as email, 'supplier'::text as recipient_kind
    from events e
    join public.document_requests r on r.company_id = e.company_id and r.id = e.request_id
    join public.suppliers s on s.company_id = r.company_id and s.id = r.supplier_id
    where s.contact_email is not null
    union
    select e.company_id, e.request_id, e.item_id, e.reminder_kind, e.scheduled_on,
      u.email, 'staff'::text as recipient_kind
    from events e
    join public.company_memberships m on m.company_id = e.company_id and m.role in ('owner', 'admin')
    join auth.users u on u.id = m.user_id
    where u.email is not null and u.email_confirmed_at is not null
  )
  insert into public.reminder_deliveries
    (company_id, request_id, item_id, recipient_email, recipient_kind, reminder_kind, scheduled_on)
  select company_id, request_id, item_id, email, recipient_kind, reminder_kind, scheduled_on
  from recipients
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_due_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_due_reminders() to service_role;

create function public.claim_due_reminders(batch_size integer default 25)
returns table (
  id uuid,
  company_id uuid,
  request_id uuid,
  item_id uuid,
  recipient_email text,
  recipient_kind text,
  reminder_kind text,
  scheduled_on date,
  attempt integer,
  company_name text,
  supplier_name text,
  deadline date,
  requirement_name text,
  expires_on date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if batch_size is null or batch_size not between 1 and 100 then
    raise exception 'Invalid batch size' using errcode = '22023';
  end if;

  update public.reminder_deliveries
  set status = 'failed', locked_until = null, last_error = 'delivery_timeout'
  where status = 'processing' and (locked_until is null or locked_until < now()) and attempts >= 8;

  return query
  with candidates as (
    select d.id
    from public.reminder_deliveries d
    where d.attempts < 8 and d.next_attempt_at <= now()
      and (d.status = 'pending' or (
        d.status = 'processing' and (d.locked_until is null or d.locked_until < now())
      ))
      and exists (
        select 1 from public.document_requests active_request
        join public.suppliers active_supplier
          on active_supplier.company_id = active_request.company_id
          and active_supplier.id = active_request.supplier_id
        where active_request.company_id = d.company_id and active_request.id = d.request_id
          and active_supplier.archived_at is null
      )
      and (
        (d.reminder_kind in ('deadline_7_days', 'deadline_1_day_overdue') and exists (
          select 1 from public.document_request_items i
          where i.company_id = d.company_id and i.request_id = d.request_id
            and i.status in ('requested', 'rejected')
            and not exists (
              select 1 from public.document_request_items newer_item
              join public.document_requests newer_request
                on newer_request.company_id = newer_item.company_id and newer_request.id = newer_item.request_id
              join public.document_requests current_request
                on current_request.company_id = i.company_id and current_request.id = i.request_id
              where newer_request.company_id = i.company_id
                and newer_request.supplier_id = current_request.supplier_id
                and newer_item.requirement_id = i.requirement_id
                and (newer_request.created_at, newer_request.id) > (current_request.created_at, current_request.id)
            )
        ))
        or (d.reminder_kind like 'expiry_%' and d.item_id is not null and exists (
          select 1 from public.document_request_items i
          where i.company_id = d.company_id and i.id = d.item_id
            and i.status = 'approved' and i.expires_on is not null
            and not exists (
              select 1
              from public.document_requests current_request
              join public.document_requests newer_request
                on newer_request.company_id = current_request.company_id
                and newer_request.supplier_id = current_request.supplier_id
              join public.document_request_items newer_item
                on newer_item.company_id = newer_request.company_id
                and newer_item.request_id = newer_request.id
              where current_request.company_id = i.company_id
                and current_request.id = i.request_id
                and newer_item.requirement_id = i.requirement_id
                and (newer_request.created_at, newer_request.id) > (current_request.created_at, current_request.id)
            )
        ))
      )
    order by d.created_at, d.id
    for update skip locked
    limit batch_size
  ),
  claimed as (
    update public.reminder_deliveries d
    set status = 'processing', attempts = d.attempts + 1,
      locked_until = now() + interval '10 minutes', last_error = null
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select d.id, d.company_id, d.request_id, d.item_id, d.recipient_email,
    d.recipient_kind, d.reminder_kind, d.scheduled_on, d.attempts,
    c.name, s.name, r.deadline, req.name, i.expires_on
  from claimed d
  join public.companies c on c.id = d.company_id
  join public.document_requests r on r.company_id = d.company_id and r.id = d.request_id
  join public.suppliers s on s.company_id = r.company_id and s.id = r.supplier_id
  left join public.document_request_items i on i.company_id = d.company_id and i.id = d.item_id
  left join public.document_requirements req on req.company_id = i.company_id and req.id = i.requirement_id;
end;
$$;
revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

create function public.complete_reminder_delivery(
  delivery_id uuid,
  outcome text,
  failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if outcome is null or outcome not in ('sent', 'failed', 'skipped')
    or (outcome = 'failed' and (failure_reason is null or char_length(failure_reason) > 300)) then
    raise exception 'Invalid delivery outcome' using errcode = '22023';
  end if;

  update public.reminder_deliveries
  set status = case
      when outcome = 'failed' and attempts < 8 then 'pending'
      else outcome
    end,
    sent_at = case when outcome = 'sent' then now() else sent_at end,
    locked_until = null,
    next_attempt_at = case when outcome = 'failed'
      then now() + make_interval(secs => least(3600, 60 * power(2, attempts - 1)::integer))
      else next_attempt_at
    end,
    last_error = case when outcome = 'failed' then failure_reason else null end
  where id = delivery_id and status = 'processing';
  if not found then
    raise exception 'Reminder delivery is not claimed' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.complete_reminder_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_reminder_delivery(uuid, text, text) to service_role;

create function public.create_reminder_supplier_upload_link(delivery_id uuid, token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.reminder_deliveries%rowtype;
  actor_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select * into delivery from public.reminder_deliveries d
    where d.id = delivery_id and d.recipient_kind = 'supplier' and d.status = 'processing';
  if not found then
    raise exception 'Reminder delivery is not available' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.document_request_items i
    where i.company_id = delivery.company_id and i.request_id = delivery.request_id
      and (
        (delivery.reminder_kind in ('deadline_7_days', 'deadline_1_day_overdue') and i.status in ('requested', 'rejected'))
        or (
          delivery.reminder_kind like 'expiry_%'
          and i.id = delivery.item_id
          and i.status = 'approved'
          and i.expires_on is not null
        )
      )
  ) then
    return null;
  end if;
  if token is null or token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid reminder token' using errcode = '22023';
  end if;
  select m.user_id into actor_id from public.company_memberships m
    where m.company_id = delivery.company_id and m.role in ('owner', 'admin')
    order by case m.role when 'owner' then 0 else 1 end, m.created_at limit 1;
  if actor_id is null then
    return null;
  end if;

  if exists (
    select 1 from public.supplier_upload_links l
    where l.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
      and (l.company_id <> delivery.company_id or l.request_id <> delivery.request_id or l.revoked_at is not null or l.expires_at <= now())
  ) then
    return null;
  end if;
  if exists (
    select 1 from public.supplier_upload_links l
    where l.company_id = delivery.company_id and l.request_id = delivery.request_id
      and l.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
  ) then
    return token;
  end if;
  insert into public.supplier_upload_links (company_id, request_id, token_hash, expires_at, created_by)
    values (delivery.company_id, delivery.request_id,
      encode(extensions.digest(token, 'sha256'), 'hex'), now() + interval '7 days',
      actor_id);
  return token;
end;
$$;
revoke all on function public.create_reminder_supplier_upload_link(uuid, text) from public, anon, authenticated;
grant execute on function public.create_reminder_supplier_upload_link(uuid, text) to service_role;
