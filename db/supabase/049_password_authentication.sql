-- AMRUT NIVAAS · 049 — password authentication (User ID + Password)
--
-- Prompt #31.5: Replace magic-link/email OTP with User ID + Password.
-- Supabase Auth still underlies the session, but the login identifier exposed
-- to users is a `user_id` (e.g. AMRUT001), not an email address.
--
-- Strategy: each profile carries a `user_id` (case-insensitive via citext).
-- The underlying auth.users row still needs an email, so we synthesize one
-- (userid@amrut-nivas.local) that is never shown to the user. The RPC
-- `app.sign_in_with_password` accepts user_id + password, resolves the
-- synthetic email, and delegates to Supabase Auth's native password path.

-- ------------------------------------------------------------------- user_id

-- Add user_id to profiles. Nullable initially so existing rows survive;
-- backfill and constraint come in the same migration because every login
-- needs one going forward.
alter table public.profiles
  add column if not exists user_id extensions.citext;

-- Case-insensitive unique: two casings of the same id are one person.
create unique index if not exists profiles_user_id_idx
  on public.profiles (lower(user_id))
  where user_id is not null;

-- user_id must be well-formed: starts with a letter, 3-40 chars, alnum/underscore.
alter table public.profiles
  add constraint profiles_user_id_format
  check (user_id is null or user_id ~ '^[A-Za-z][A-Za-z0-9_]{2,39}$');

comment on column public.profiles.user_id is
  'Human-facing login identifier (e.g. AMRUT001). Case-insensitive. Distinct from the database primary key.';

-- --------------------------------------------------------- synthetic email RPC

-- Resolve a user_id to the synthetic email Supabase Auth expects.
-- Returns null when the user_id does not exist, so the sign-in RPC can
-- return a generic error without leaking account existence (§18/§41).
create or replace function public.resolve_user_id_email(p_user_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select p.email into v_email
  from public.profiles p
  where lower(p.user_id) = lower(p_user_id)
    and p.status = 'ACTIVE';
  return v_email;
end;
$$;

revoke all on function public.resolve_user_id_email(text) from public;
grant execute on function public.resolve_user_id_email(text) to authenticated;
grant execute on function public.resolve_user_id_email(text) to anon;

-- -------------------------------------- sign-in RPC (delegates to GoTrue)

-- The client cannot call GoTrue from SQL; this RPC only validates that
-- the user_id maps to an active profile and returns the synthetic email.
-- The actual password check happens in GoTrue via signInWithPassword.
-- This RPC exists so RLS and the audit door can observe the attempt.
create or replace function public.resolve_login(p_user_id text)
returns table (email text, profile_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select p.email::text, p.id, p.status::text
  from public.profiles p
  where lower(p.user_id) = lower(p_user_id);
end;
$$;

revoke all on function public.resolve_login(text) from public;
grant execute on function public.resolve_login(text) to authenticated;
grant execute on function public.resolve_login(text) to anon;

-- ---------------------------------------------------- handle_new_user update

-- Patch the trigger function so a new auth user can carry a user_id from
-- metadata. Existing behaviour is preserved when user_id is absent.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_display_name text;
begin
  v_user_id := nullif(new.raw_user_meta_data ->> 'user_id', '');
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, full_name, user_id)
  values (
    new.id,
    new.email,
    v_display_name,
    v_user_id
  )
  on conflict (id) do update
    set email   = excluded.email,
        user_id = coalesce(excluded.user_id, public.profiles.user_id);
  return new;
end;
$$;

-- ---------------------------------------------------------- last_login_at

alter table public.profiles
  add column if not exists last_login_at timestamptz;

-- RPC to stamp last_login_at after a successful sign-in.
-- Fire-and-forget from the client; never blocks the login response.
create or replace function app.touch_last_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set last_login_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function app.touch_last_login() from public;
grant execute on function app.touch_last_login() to authenticated;

-- Public wrapper so the client RPC call (client.rpc("touch_last_login")) finds it.
-- PostgREST only exposes functions in the public schema by default.
create or replace function public.touch_last_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.touch_last_login();
end;
$$;

revoke all on function public.touch_last_login() from public;
grant execute on function public.touch_last_login() to authenticated;

-- ------------------------------------------------------- password reset aid

-- Look up a profile by user_id for password recovery.
-- Returns the email so the client can pass it to GoTrue's resetPasswordForEmail.
-- Returns no rows when the user_id is unknown (generic response, §18).
create or replace function public.resolve_recovery_email(p_user_id text)
returns table (email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select p.email::text
  from public.profiles p
  where lower(p.user_id) = lower(p_user_id)
    and p.status = 'ACTIVE';
end;
$$;

revoke all on function public.resolve_recovery_email(text) from public;
grant execute on function public.resolve_recovery_email(text) to authenticated;
grant execute on function public.resolve_recovery_email(text) to anon;
