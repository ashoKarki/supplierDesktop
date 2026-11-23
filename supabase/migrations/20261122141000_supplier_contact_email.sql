alter table public.suppliers
  add column contact_email text
  check (
    contact_email is null
    or (
      char_length(contact_email) <= 254
      and contact_email = lower(btrim(contact_email))
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

grant update (contact_email) on public.suppliers to authenticated;
