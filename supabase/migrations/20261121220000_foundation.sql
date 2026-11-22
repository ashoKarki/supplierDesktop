create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  country text not null check (country ~ '^[A-Z]{2}$'),
  business_details text not null check (char_length(btrim(business_details)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200)
);

create table public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_memberships_user_id_idx on public.company_memberships (user_id);

create table public.owner_enrollments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null unique references public.companies(id) on delete cascade
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index suppliers_company_id_idx on public.suppliers (company_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.owner_enrollments enable row level security;
alter table public.suppliers enable row level security;

revoke all on public.companies, public.profiles, public.company_memberships,
  public.owner_enrollments, public.suppliers from public, anon, authenticated;

create function public.has_company_role(target_company uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.has_company_role(uuid, text[]) from public, anon;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;

create policy companies_select on public.companies for select to authenticated
  using (public.has_company_role(id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
create policy companies_update on public.companies for update to authenticated
  using (public.has_company_role(id, array['owner', 'admin']))
  with check (public.has_company_role(id, array['owner', 'admin']));
grant select on public.companies to authenticated;
grant update (name, country, business_details) on public.companies to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.profiles to authenticated;

create policy memberships_select on public.company_memberships for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
grant select on public.company_memberships to authenticated;

create policy suppliers_select on public.suppliers for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin', 'procurement_manager']));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'procurement_manager']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'procurement_manager']));
grant select, insert on public.suppliers to authenticated;
grant update (name, archived_at) on public.suppliers to authenticated;

create function public.create_owner_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  metadata jsonb;
  verified_at timestamptz;
  company uuid;
  owner_name text;
  company_name text;
  country_code text;
  details text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select u.raw_user_meta_data, u.email_confirmed_at into metadata, verified_at
    from auth.users u where u.id = current_user_id for update;
  if not found or verified_at is null then
    raise exception 'Email verification required' using errcode = '42501';
  end if;

  select e.company_id into company
    from public.owner_enrollments e where e.user_id = current_user_id;
  if found then
    return company;
  end if;

  owner_name := coalesce(btrim(metadata ->> 'administrator_name'), '');
  company_name := coalesce(btrim(metadata ->> 'company_name'), '');
  country_code := coalesce(metadata ->> 'country', '');
  details := coalesce(btrim(metadata ->> 'business_details'), '');
  if metadata ->> 'enrollment_type' is distinct from 'owner'
    or char_length(owner_name) not between 1 and 200
    or char_length(company_name) not between 1 and 200
    or country_code !~ '^[A-Z]{2}$'
    or char_length(details) not between 1 and 2000 then
    raise exception 'Invalid enrollment details' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, name) values (current_user_id, owner_name)
    on conflict (user_id) do nothing;
  insert into public.companies (name, country, business_details)
    values (company_name, country_code, details) returning id into company;
  insert into public.company_memberships (company_id, user_id, role)
    values (company, current_user_id, 'owner');
  insert into public.owner_enrollments (user_id, company_id) values (current_user_id, company);
  return company;
end;
$$;

revoke all on function public.create_owner_workspace() from public, anon;
grant execute on function public.create_owner_workspace() to authenticated;
