create function public.workspace_report_page(
  target_company uuid,
  requested_kind text,
  page_size integer,
  page_offset integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_company_role(
    target_company, array['owner', 'admin', 'quality_manager', 'procurement_manager', 'viewer']
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if requested_kind is null or requested_kind not in ('compliance', 'expiry', 'outstanding')
    or page_size is null or page_size not between 1 and 10000
    or page_offset is null or page_offset not between 0 and 1000000 then
    raise exception 'Invalid report page' using errcode = '22023';
  end if;

  return (
    with company_day as materialized (
      select c.id, timezone(c.time_zone, now())::date as today
      from public.companies c
      where c.id = target_company
    ),
    latest_items as materialized (
      select distinct on (r.supplier_id, i.requirement_id)
        i.id, i.request_id, i.requirement_id, i.status, i.expires_on,
        r.supplier_id, r.created_at, r.id as request_id_order, r.deadline
      from public.document_request_items i
      join public.document_requests r
        on r.company_id = i.company_id and r.id = i.request_id
      join public.suppliers s
        on s.company_id = r.company_id and s.id = r.supplier_id
      where i.company_id = target_company and s.archived_at is null
      order by r.supplier_id, i.requirement_id, r.created_at desc, r.id desc
    ),
    current_items as materialized (
      select i.*, s.name as supplier_name, req.name as requirement_name, d.today
      from latest_items i
      join public.suppliers s on s.id = i.supplier_id and s.company_id = target_company
      join public.document_requirements req on req.id = i.requirement_id and req.company_id = target_company
      cross join company_day d
      where i.status <> 'cancelled'
    ),
    compliance_rows as (
      select 'compliance'::text as kind,
        lower(s.name) as sort_one, ''::text as sort_two, s.id::text as tie_breaker,
        jsonb_build_object(
          'supplier', s.name,
          'required', count(i.id),
          'approved', count(i.id) filter (
            where i.status = 'approved' and (i.expires_on is null or i.expires_on >= d.today)
          ),
          'missing', count(i.id) filter (where i.status = 'requested'),
          'expired', count(i.id) filter (
            where i.status = 'expired' or (i.status = 'approved' and i.expires_on < d.today)
          ),
          'status', case
            when count(i.id) = 0 then 'Not assessed'
            else case min(case
              when i.status = 'rejected' then 1
              when i.status = 'expired' or (i.status = 'approved' and i.expires_on < d.today) then 2
              when i.status = 'requested' then 3
              when i.status in ('submitted', 'under_review') then 4
              when i.status = 'approved' and i.expires_on between d.today and d.today + 90 then 5
              else 6
            end)
              when 1 then 'Action required'
              when 2 then 'Expired'
              when 3 then 'Incomplete'
              when 4 then 'Pending review'
              when 5 then 'Expiring'
              else 'Complete'
            end
          end
        ) as row_data
      from public.suppliers s
      cross join company_day d
      left join current_items i on i.supplier_id = s.id
      where s.company_id = target_company and s.archived_at is null
      group by s.id, s.name, d.today
    ),
    expiry_rows as (
      select 'expiry'::text as kind,
        coalesce(i.expires_on::text, '') as sort_one,
        lower(i.supplier_name) as sort_two,
        i.id::text as tie_breaker,
        jsonb_build_object(
          'document', i.requirement_name,
          'supplier', i.supplier_name,
          'date', i.expires_on,
          'days', case when i.expires_on is null then null else i.expires_on - i.today end,
          'status', case
            when i.status = 'expired' or i.expires_on < i.today then 'Expired'
            when i.expires_on <= i.today + 90 then 'Expiring'
            else 'Valid'
          end
        ) as row_data
      from current_items i
      where i.status in ('approved', 'expired')
        and (i.expires_on is not null or i.status = 'expired')
    ),
    outstanding_rows as (
      select 'outstanding'::text as kind,
        coalesce(i.deadline::text, '9999-12-31') as sort_one,
        lower(i.supplier_name) as sort_two,
        i.id::text as tie_breaker,
        jsonb_build_object(
          'supplier', i.supplier_name,
          'document', i.requirement_name,
          'requested', i.created_at,
          'deadline', i.deadline,
          'status', case
            when i.deadline < i.today then 'Overdue'
            when i.status = 'rejected' then 'Action required'
            else 'Outstanding'
          end
        ) as row_data
      from current_items i
      where i.status in ('requested', 'rejected')
    ),
    all_rows as materialized (
      select * from compliance_rows
      union all select * from expiry_rows
      union all select * from outstanding_rows
    )
    select jsonb_build_object(
      'total', (select count(*) from all_rows where kind = requested_kind),
      'rows', coalesce((
        select jsonb_agg(p.row_data order by p.sort_one, p.sort_two, p.tie_breaker)
        from (
          select row_data, sort_one, sort_two, tie_breaker
          from all_rows
          where kind = requested_kind
          order by sort_one, sort_two, tie_breaker
          limit page_size offset page_offset
        ) p
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.workspace_report_page(uuid, text, integer, integer) from public, anon;
grant execute on function public.workspace_report_page(uuid, text, integer, integer) to authenticated;
