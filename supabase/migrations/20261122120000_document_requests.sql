alter table public.suppliers add constraint suppliers_company_id_id_key unique (company_id, id);

create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  renewal_months integer not null check (renewal_months between 1 and 120),
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers(company_id, id)
);

create table public.document_request_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  requirement_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, request_id, requirement_id),
  foreign key (company_id, request_id) references public.document_requests(company_id, id),
  foreign key (company_id, requirement_id) references public.document_requirements(company_id, id)
);

create index document_requirements_company_idx on public.document_requirements(company_id);
create index document_requests_company_supplier_idx on public.document_requests(company_id, supplier_id);
create index document_request_items_request_idx on public.document_request_items(company_id, request_id);
create index document_request_items_requirement_idx on public.document_request_items(company_id, requirement_id);

alter table public.document_requirements enable row level security;
alter table public.document_requests enable row level security;
alter table public.document_request_items enable row level security;
revoke all on public.document_requirements, public.document_requests, public.document_request_items
  from public, anon, authenticated;

create policy requirements_select on public.document_requirements for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
create policy requirements_insert on public.document_requirements for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager']));

create policy requests_select on public.document_requests for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
create policy requests_insert on public.document_requests for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager']));

create policy request_items_select on public.document_request_items for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']));
create policy request_items_insert on public.document_request_items for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin', 'quality_manager', 'procurement_manager']));

grant select, insert on public.document_requirements, public.document_requests, public.document_request_items to authenticated;
