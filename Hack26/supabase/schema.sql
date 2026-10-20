/* ==========================================================================
   Hack-O-Week — Supabase database schema
   --------------------------------------------------------------------------
   HOW TO RUN THIS FILE (README step 6):
   1. Create your NEW Supabase project.
   2. Open  Supabase Dashboard → SQL Editor  (left sidebar).
   3. Click "New query", paste this entire file, then click "Run".
   4. Confirm the message: "Success. No rows returned".

   DESIGN SUMMARY
     profiles            → who is an administrator (Supabase Auth identity)
     events              → the public event line-up (publish/unpublish)
     registrations       → one row per participant submission (private)
     registration_events → which events a registration covers (many-to-many)
     submit_registration → a database function that saves a registration and
                           its event links atomically, validating everything
                           server-side. This is the ONLY way the public can
                           write data — there is no open insert policy.

   SECURITY SUMMARY (Row Level Security = RLS)
     • Public can read ONLY published, non-archived events.
     • Nobody but an authorised admin can read registrations.
     • No public insert/update/delete policies exist at all.
     • The browser only ever uses the publishable (anon) key.
   ========================================================================== */

-- Extensions ----------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

/* ==========================================================================
   1. ADMINISTRATOR AUTHORISATION
   ========================================================================== */

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'participant'
              check (role in ('participant', 'admin')),
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helper used by every policy below.
-- SECURITY DEFINER so the check works without exposing other tables' rows.
-- ONLY a row with role = 'admin' passes this — logging in is NOT enough.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Auto-create a profile row for every new Auth user (default: participant).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ==========================================================================
   2. EVENTS  (public data, admin-managed)
   ========================================================================== */

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 140),
  category          text not null default 'hackathon'
                    check (category in ('hackathon', 'technical', 'showcase',
                                        'gaming', 'cultural', 'arts', 'workshop')),
  description       text check (description is null or char_length(description) <= 1200),
  eligibility       text check (eligibility is null or char_length(eligibility) <= 300),
  participation     text not null default 'individual'
                    check (participation in ('individual', 'team', 'both')),
  venue             text check (venue is null or char_length(venue) <= 200),
  starts_at         timestamptz,                     -- null until the schedule is confirmed
  is_published      boolean not null default false,  -- visible on the public site
  registration_open boolean not null default true,   -- accepts new registrations
  is_archived       boolean not null default false,  -- hidden entirely
  sort_order        integer not null default 0 check (sort_order >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists events_public_idx
  on public.events (is_published, is_archived, sort_order);
create index if not exists events_starts_at_idx
  on public.events (starts_at)
  where starts_at is not null;

/* ==========================================================================
   3. REGISTRATIONS  (PRIVATE — admin read only)
   ========================================================================== */

create table if not exists public.registrations (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null check (char_length(full_name) between 2 and 120),
  email              text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone              text not null check (phone ~* '^\+?[0-9][0-9 ()-]{6,18}$'),
  college            text not null check (char_length(college) between 2 and 200),
  department         text not null check (char_length(department) between 2 and 160),
  year               text not null
                     check (year in ('1st year', '2nd year', '3rd year', '4th year',
                                     'Postgraduate', 'Other')),
  participation_type text not null default 'individual'
                     check (participation_type in ('individual', 'team')),
  team_name          text check (team_name is null or char_length(team_name) between 2 and 120),
  team_members       jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(team_members) = 'array'),
  status             text not null default 'pending'
                     check (status in ('pending', 'confirmed', 'waitlist', 'cancelled')),
  consent            boolean not null check (consent = true),
  -- A team entry must carry a team name.
  constraint team_requires_name check (participation_type <> 'team' or team_name is not null),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Idempotency / duplicate prevention: one registration per email address.
create unique index if not exists registrations_email_key
  on public.registrations (lower(email));

create index if not exists registrations_created_at_idx
  on public.registrations (created_at desc);
create index if not exists registrations_status_idx
  on public.registrations (status);
create index if not exists registrations_name_idx
  on public.registrations (lower(full_name));

/* ==========================================================================
   4. REGISTRATION ⇄ EVENT  (a participant may join several events)
   ========================================================================== */

create table if not exists public.registration_events (
  registration_id uuid not null references public.registrations (id) on delete cascade,
  event_id        uuid not null references public.events (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (registration_id, event_id)
);

create index if not exists registration_events_event_idx
  on public.registration_events (event_id);

/* ==========================================================================
   5. KEEP updated_at CURRENT
   ========================================================================== */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch on public.events;
create trigger events_touch
  before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists registrations_touch on public.registrations;
create trigger registrations_touch
  before update on public.registrations
  for each row execute function public.touch_updated_at();

/* ==========================================================================
   6. ATOMIC PUBLIC REGISTRATION FUNCTION
   --------------------------------------------------------------------------
   Why a function instead of letting the browser INSERT directly?
   A participant registers for several events at once. Doing it as two open
   writes could leave a half-finished entry if the second write fails. This
   function validates everything and writes both tables in ONE transaction —
   all or nothing. It is the only path the public has into these tables.
   ========================================================================== */

create or replace function public.submit_registration(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name     text    := trim(coalesce(payload ->> 'full_name', ''));
  v_email         text    := lower(trim(coalesce(payload ->> 'email', '')));
  v_phone         text    := trim(coalesce(payload ->> 'phone', ''));
  v_college       text    := trim(coalesce(payload ->> 'college', ''));
  v_department    text    := trim(coalesce(payload ->> 'department', ''));
  v_year          text    := trim(coalesce(payload ->> 'year', ''));
  v_participation text    := trim(coalesce(payload ->> 'participation_type', 'individual'));
  v_team_name     text    := nullif(trim(coalesce(payload ->> 'team_name', '')), '');
  v_consent       boolean := coalesce((payload ->> 'consent')::boolean, false);
  v_event_ids     uuid[];
  v_members       text[];
  v_id            uuid;
  v_event_id      uuid;
  v_event         public.events%rowtype;
begin
  /* ---- validate the participant's details (friendly messages) ---- */
  if char_length(v_full_name) < 2 then
    raise exception 'Please provide your full name.';
  end if;
  if v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Please provide a valid email address.';
  end if;
  if v_phone !~* '^\+?[0-9][0-9 ()-]{6,18}$' then
    raise exception 'Please provide a valid phone number.';
  end if;
  if char_length(v_college) < 2 then
    raise exception 'Please provide your college or institution.';
  end if;
  if char_length(v_department) < 2 then
    raise exception 'Please provide your department or course.';
  end if;
  if v_year not in ('1st year', '2nd year', '3rd year', '4th year', 'Postgraduate', 'Other') then
    raise exception 'Please select a valid year of study.';
  end if;
  if v_participation not in ('individual', 'team') then
    raise exception 'Participation must be individual or team.';
  end if;
  if v_participation = 'team' and v_team_name is null then
    raise exception 'Team registrations need a team name.';
  end if;
  if not v_consent then
    raise exception 'You must accept the privacy notice to register.';
  end if;

  /* ---- parse selected event ids ---- */
  begin
    select array_agg(value::uuid)
    into v_event_ids
    from jsonb_array_elements_text(coalesce(payload -> 'event_ids', '[]'::jsonb)) as value;
  exception
    when invalid_text_representation then
      raise exception 'One of the selected events is invalid. Please try again.';
  end;

  if v_event_ids is null or array_length(v_event_ids, 1) = 0 then
    raise exception 'Select at least one event.';
  end if;

  /* ---- every selected event must exist, be published, unarchived and open ---- */
  foreach v_event_id in array v_event_ids loop
    select * into v_event from public.events where id = v_event_id;
    if not found then
      raise exception 'One of the selected events no longer exists.';
    end if;
    if v_event.is_archived or not v_event.is_published then
      raise exception format('"%s" is not open for registration.', v_event.name);
    end if;
    if not v_event.registration_open then
      raise exception format('Registration for "%s" is currently closed.', v_event.name);
    end if;
  end loop;

  /* ---- duplicate prevention (idempotent behaviour) ---- */
  if exists (select 1 from public.registrations r where lower(r.email) = v_email) then
    raise exception 'A registration with this email address already exists.'
      using errcode = '23505';
  end if;

  /* ---- team members (array of short strings) ---- */
  select coalesce(array_agg(value), '{}')
  into v_members
  from (
    select trim(value) as value
    from jsonb_array_elements_text(coalesce(payload -> 'team_members', '[]'::jsonb)) as value
  ) cleaned
  where char_length(trim(value)) between 1 and 120;

  /* ---- write everything in one transaction ---- */
  begin
    insert into public.registrations
      (full_name, email, phone, college, department, year,
       participation_type, team_name, team_members, consent)
    values
      (v_full_name, v_email, v_phone, v_college, v_department, v_year,
       v_participation, v_team_name, to_jsonb(v_members), true)
    returning id into v_id;

    insert into public.registration_events (registration_id, event_id)
    select v_id, unnest(v_event_ids)
    on conflict do nothing;
  exception
    when unique_violation then
      raise exception 'A registration with this email address already exists.'
        using errcode = '23505';
  end;

  return v_id;
end;
$$;

revoke execute on function public.submit_registration(jsonb) from public;
revoke execute on function public.submit_registration(jsonb) from anon;
revoke execute on function public.submit_registration(jsonb) from authenticated;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

/* ==========================================================================
   7. ROW LEVEL SECURITY  (the actual protection)
   ========================================================================== */

alter table public.profiles            enable row level security;
alter table public.events              enable row level security;
alter table public.registrations       enable row level security;
alter table public.registration_events enable row level security;

-- 7a. profiles: users may read ONLY their own row. Nothing else. No writes
--     from the client — admin rows are managed in the SQL editor (step 8).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 7b. events: public reads published events; admins read and manage everything.
drop policy if exists events_select_published on public.events;
create policy events_select_published
  on public.events
  for select
  to anon, authenticated
  using (is_published = true and is_archived = false);

drop policy if exists events_select_admin on public.events;
create policy events_select_admin
  on public.events
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists events_insert_admin on public.events;
create policy events_insert_admin
  on public.events
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists events_update_admin on public.events;
create policy events_update_admin
  on public.events
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin
  on public.events
  for delete
  to authenticated
  using (public.is_admin());

-- 7c. registrations: NO policy for anon at all (the public writes only
--     through submit_registration). Administrators can do everything.
drop policy if exists registrations_select_admin on public.registrations;
create policy registrations_select_admin
  on public.registrations
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists registrations_update_admin on public.registrations;
create policy registrations_update_admin
  on public.registrations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists registrations_delete_admin on public.registrations;
create policy registrations_delete_admin
  on public.registrations
  for delete
  to authenticated
  using (public.is_admin());

-- 7d. registration_events: same rule — admin only, no public access.
drop policy if exists registration_events_select_admin on public.registration_events;
create policy registration_events_select_admin
  on public.registration_events
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists registration_events_insert_admin on public.registration_events;
create policy registration_events_insert_admin
  on public.registration_events
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists registration_events_delete_admin on public.registration_events;
create policy registration_events_delete_admin
  on public.registration_events
  for delete
  to authenticated
  using (public.is_admin());

/* ==========================================================================
   8. FIRST ADMINISTRATOR  (run AFTER creating the account — README step 8)
   --------------------------------------------------------------------------
   a) Supabase Dashboard → Authentication → Users → "Add user"
      → enter an email + strong password → tick "Auto Confirm User".
      (Do NOT share this password anywhere. It lives only in Supabase Auth.)
   b) Copy the user's UUID shown in the table.
   c) Run this with the real UUID replacing THE_USER_UUID_HERE:

   insert into public.profiles (user_id, role)
   values ('THE_USER_UUID_HERE', 'admin')
   on conflict (user_id) do update set role = 'admin';

   Verify with:
   select user_id, role from public.profiles;
   ========================================================================== */

/* ==========================================================================
   9. OPTIONAL SAMPLE EVENTS (uncomment to test the site, then delete)
   ==========================================================================

insert into public.events (name, category, participation, description, eligibility, is_published) values
  ('Idea Sprint Hackathon', 'hackathon', 'team',
   'A timed build sprint where teams turn a problem statement into a working prototype.',
   'Open to all students', true),
  ('Tech Quiz', 'technical', 'both',
   'Rounds covering computing fundamentals, general technology and current innovations.',
   'Open to all students', true),
  ('Dance Night', 'cultural', 'both',
   'Solo, duet and group performances across classical and contemporary styles.',
   'Open to all students', true);

   ========================================================================== */
