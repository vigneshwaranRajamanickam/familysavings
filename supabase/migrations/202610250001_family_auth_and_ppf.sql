create extension if not exists pgcrypto with schema extensions;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id),
  check (email is not null or phone is not null)
);

create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invitee_name text not null,
  invitee_email text,
  invitee_phone text,
  role text not null default 'member' check (role = 'member'),
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  check ((invitee_email is not null) <> (invitee_phone is not null))
);

create unique index if not exists family_invitations_pending_email_idx
  on public.family_invitations (family_id, lower(invitee_email))
  where accepted_at is null and invitee_email is not null;
create unique index if not exists family_invitations_pending_phone_idx
  on public.family_invitations (family_id, invitee_phone)
  where accepted_at is null and invitee_phone is not null;

create table if not exists public.ppf_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  account_number text not null,
  holder_name text not null,
  bank_name text not null,
  total_deposit numeric(14, 2) not null default 0 check (total_deposit >= 0),
  total_interest numeric(14, 2) not null default 0 check (total_interest >= 0),
  total_value numeric(14, 2) not null default 0 check (total_value >= 0),
  tenure_years integer not null default 15 check (tenure_years > 0),
  created_at timestamptz not null default now(),
  unique (family_id, account_number)
);

create table if not exists public.ppf_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ppf_accounts(id) on delete cascade,
  deposit_month date not null,
  amount numeric(14, 2) not null check (amount > 0),
  interest_rate numeric(6, 3) not null check (interest_rate >= 0),
  min_balance numeric(14, 2) not null default 0,
  monthly_interest numeric(14, 2) not null default 0,
  yearly_interest numeric(14, 2),
  balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists ppf_transactions_one_row_per_month_idx
  on public.ppf_transactions (account_id, date_trunc('month', deposit_month::timestamp));

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = target_family_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_family_admin(target_family_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = target_family_id and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.create_family(family_name text, admin_name text)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  new_family_id uuid;
  auth_email text;
  auth_phone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception 'This user already belongs to a family';
  end if;
  if length(trim(family_name)) not between 1 and 100 or length(trim(admin_name)) not between 1 and 100 then
    raise exception 'Enter a valid family name and admin name';
  end if;

  select email, phone into auth_email, auth_phone from auth.users where id = auth.uid();
  insert into public.families (name) values (trim(family_name)) returning id into new_family_id;
  insert into public.family_members (family_id, user_id, display_name, email, phone, role)
  values (new_family_id, auth.uid(), trim(admin_name), lower(auth_email), auth_phone, 'admin');
  return new_family_id;
end;
$$;

create or replace function public.create_family_invitation(
  invitee_name text,
  invitee_email text default null,
  invitee_phone text default null
)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  admin_family_id uuid;
  invitation_id uuid;
begin
  select family_id into admin_family_id from public.family_members
  where user_id = auth.uid() and role = 'admin';
  if admin_family_id is null then raise exception 'Only a family admin can invite members'; end if;
  if length(trim(invitee_name)) not between 1 and 100 then raise exception 'Enter a member name'; end if;
  if (invitee_email is null) = (invitee_phone is null) then
    raise exception 'Provide exactly one email address or phone number';
  end if;

  insert into public.family_invitations (family_id, invitee_name, invitee_email, invitee_phone, invited_by)
  values (admin_family_id, trim(invitee_name), lower(nullif(trim(invitee_email), '')), nullif(trim(invitee_phone), ''), auth.uid())
  returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.accept_family_invitation()
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  auth_email text;
  auth_phone text;
  invitation public.family_invitations%rowtype;
  user_family_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select email, phone into auth_email, auth_phone from auth.users where id = auth.uid();

  select * into invitation from public.family_invitations
  where accepted_at is null and expires_at > now()
    and ((invitee_email is not null and lower(invitee_email) = lower(auth_email))
      or (invitee_phone is not null and invitee_phone = auth_phone))
  order by created_at desc limit 1 for update;

  if invitation.id is null then return null; end if;
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception 'This user already belongs to a family';
  end if;

  insert into public.family_members (family_id, user_id, display_name, email, phone, role)
  values (invitation.family_id, auth.uid(), invitation.invitee_name, lower(auth_email), auth_phone, 'member');
  update public.family_invitations set accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;
  user_family_id := invitation.family_id;
  return user_family_id;
end;
$$;

create or replace function public.remove_family_member(member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target public.family_members%rowtype;
begin
  select * into target from public.family_members where id = member_id for update;
  if target.id is null then raise exception 'Family member not found'; end if;
  if target.role = 'admin' then raise exception 'The family admin cannot be removed'; end if;
  if not public.is_family_admin(target.family_id) then raise exception 'Admin access required'; end if;
  delete from public.family_members where id = member_id;
end;
$$;

create or replace function public.update_family_logo(logo_url text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  admin_family_id uuid;
begin
  select family_id into admin_family_id from public.family_members
  where user_id = auth.uid() and role = 'admin';
  if admin_family_id is null then raise exception 'Admin access required'; end if;
  update public.families set logo_url = $1 where id = admin_family_id;
end;
$$;

create or replace function public.save_ppf_account(p_account jsonb, p_transactions jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  current_family_id uuid;
  account_uuid uuid;
begin
  select family_id into current_family_id from public.family_members
  where user_id = auth.uid() and role = 'admin';
  if current_family_id is null then raise exception 'Admin access required'; end if;

  account_uuid := (p_account->>'id')::uuid;
  insert into public.ppf_accounts (
    id, family_id, account_number, holder_name, bank_name,
    total_deposit, total_interest, total_value, tenure_years
  ) values (
    account_uuid, current_family_id, p_account->>'account_number', p_account->>'holder_name', p_account->>'bank_name',
    (p_account->>'total_deposit')::numeric, (p_account->>'total_interest')::numeric,
    (p_account->>'total_value')::numeric, (p_account->>'tenure_years')::integer
  ) on conflict (id) do update set
    account_number = excluded.account_number,
    holder_name = excluded.holder_name,
    bank_name = excluded.bank_name,
    total_deposit = excluded.total_deposit,
    total_interest = excluded.total_interest,
    total_value = excluded.total_value,
    tenure_years = excluded.tenure_years
  where public.ppf_accounts.family_id = current_family_id;

  if not found then raise exception 'PPF account not found in the current family'; end if;

  delete from public.ppf_transactions where account_id = account_uuid;
  insert into public.ppf_transactions (
    account_id, deposit_month, amount, interest_rate, min_balance,
    monthly_interest, yearly_interest, balance
  )
  select account_uuid, tx.deposit_month, tx.amount, tx.interest_rate, tx.min_balance,
    tx.monthly_interest, tx.yearly_interest, tx.balance
  from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as tx(
    deposit_month date,
    amount numeric,
    interest_rate numeric,
    min_balance numeric,
    monthly_interest numeric,
    yearly_interest numeric,
    balance numeric
  );
end;
$$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.ppf_accounts enable row level security;
alter table public.ppf_transactions enable row level security;

create policy families_select_member on public.families for select to authenticated
  using (public.is_family_member(id));
create policy families_update_admin on public.families for update to authenticated
  using (public.is_family_admin(id)) with check (public.is_family_admin(id));

create policy family_members_select_family on public.family_members for select to authenticated
  using (public.is_family_member(family_id));

create policy family_invitations_select_admin on public.family_invitations for select to authenticated
  using (public.is_family_admin(family_id));

create policy ppf_accounts_select_family on public.ppf_accounts for select to authenticated
  using (public.is_family_member(family_id));
create policy ppf_accounts_insert_admin on public.ppf_accounts for insert to authenticated
  with check (public.is_family_admin(family_id));
create policy ppf_accounts_update_admin on public.ppf_accounts for update to authenticated
  using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy ppf_accounts_delete_admin on public.ppf_accounts for delete to authenticated
  using (public.is_family_admin(family_id));

create policy ppf_transactions_select_family on public.ppf_transactions for select to authenticated
  using (exists (
    select 1 from public.ppf_accounts account
    where account.id = account_id and public.is_family_member(account.family_id)
  ));
create policy ppf_transactions_insert_admin on public.ppf_transactions for insert to authenticated
  with check (exists (
    select 1 from public.ppf_accounts account
    where account.id = account_id and public.is_family_admin(account.family_id)
  ));
create policy ppf_transactions_update_admin on public.ppf_transactions for update to authenticated
  using (exists (
    select 1 from public.ppf_accounts account
    where account.id = account_id and public.is_family_admin(account.family_id)
  )) with check (exists (
    select 1 from public.ppf_accounts account
    where account.id = account_id and public.is_family_admin(account.family_id)
  ));
create policy ppf_transactions_delete_admin on public.ppf_transactions for delete to authenticated
  using (exists (
    select 1 from public.ppf_accounts account
    where account.id = account_id and public.is_family_admin(account.family_id)
  ));

insert into storage.buckets (id, name, public)
values ('family-logos', 'family-logos', true)
on conflict (id) do nothing;

create policy family_logo_public_read on storage.objects for select
  using (bucket_id = 'family-logos');
create policy family_logo_admin_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-logos'
    and public.is_family_admin((storage.foldername(name))[1]::uuid)
  );
create policy family_logo_admin_update on storage.objects for update to authenticated
  using (
    bucket_id = 'family-logos'
    and public.is_family_admin((storage.foldername(name))[1]::uuid)
  ) with check (
    bucket_id = 'family-logos'
    and public.is_family_admin((storage.foldername(name))[1]::uuid)
  );
create policy family_logo_admin_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'family-logos'
    and public.is_family_admin((storage.foldername(name))[1]::uuid)
  );

grant select on public.families, public.family_members, public.family_invitations,
  public.ppf_accounts, public.ppf_transactions to authenticated;
grant insert, update, delete on public.ppf_accounts, public.ppf_transactions to authenticated;

revoke all on function public.is_family_member(uuid) from public, anon;
revoke all on function public.is_family_admin(uuid) from public, anon;
revoke all on function public.create_family(text, text) from public, anon;
revoke all on function public.create_family_invitation(text, text, text) from public, anon;
revoke all on function public.accept_family_invitation() from public, anon;
revoke all on function public.remove_family_member(uuid) from public, anon;
revoke all on function public.update_family_logo(text) from public, anon;
revoke all on function public.save_ppf_account(jsonb, jsonb) from public, anon;

grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.create_family_invitation(text, text, text) to authenticated;
grant execute on function public.accept_family_invitation() to authenticated;
grant execute on function public.remove_family_member(uuid) to authenticated;
grant execute on function public.update_family_logo(text) to authenticated;
grant execute on function public.save_ppf_account(jsonb, jsonb) to authenticated;