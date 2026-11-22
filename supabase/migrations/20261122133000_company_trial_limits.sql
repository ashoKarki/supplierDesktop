create table public.company_trials (
  company_id uuid primary key references public.companies(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '30 days'),
  check (ends_at > started_at)
);

alter table public.company_trials enable row level security;
revoke all on public.company_trials from public, anon, authenticated;
grant select on public.company_trials to authenticated;

create policy company_trials_select on public.company_trials for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']));

create function public.start_company_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_trials (company_id) values (new.id);
  return new;
end;
$$;

revoke all on function public.start_company_trial() from public, anon, authenticated;
create trigger start_company_trial
  after insert on public.companies
  for each row execute function public.start_company_trial();

-- Existing workspaces receive a full trial from the time this feature is installed.
insert into public.company_trials (company_id)
select id from public.companies;

create function public.enforce_company_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count bigint;
begin
  if tg_op = 'UPDATE' and new.company_id = old.company_id then
    return new;
  end if;

  if tg_table_name = 'suppliers' and auth.uid() is not null
    and not public.has_company_role(new.company_id, array['owner', 'admin', 'procurement_manager']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Serialize capacity checks for each workspace, including privileged writes.
  perform 1 from public.companies where id = new.company_id for update;
  if not found then
    raise exception 'Company not found' using errcode = '23503';
  end if;

  if tg_table_name = 'suppliers' then
    select count(*) into current_count from public.suppliers where company_id = new.company_id;
    if current_count >= 100 then
      raise exception 'Company supplier limit reached' using errcode = 'P1001';
    end if;
  else
    select count(*) into current_count from public.company_memberships where company_id = new.company_id;
    if current_count >= 10 then
      raise exception 'Company member limit reached' using errcode = 'P1002';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_company_capacity() from public, anon, authenticated;
create trigger enforce_supplier_capacity
  before insert or update of company_id on public.suppliers
  for each row execute function public.enforce_company_capacity();
create trigger enforce_member_capacity
  before insert or update of company_id on public.company_memberships
  for each row execute function public.enforce_company_capacity();
