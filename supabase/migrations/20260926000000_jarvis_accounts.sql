-- Jarvis — multi-user accounts
-- Every row belongs to exactly one user. Row Level Security makes the database
-- itself refuse any read or write of another user's rows, so the public
-- (publishable) key in the app is safe to ship.

-- ---------------------------------------------------------------------------
-- Profiles: one per user, created automatically at sign-up
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '' check (char_length(name) <= 80),
  signature     text not null default '' check (char_length(signature) <= 500),
  tone          text not null default 'friendly' check (tone in ('friendly', 'professional', 'brief', 'decline')),
  alert_minutes integer not null default 0 check (alert_minutes between -1 and 10080),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reminders, notes, updates
-- ids are generated on the device (uuid) so items work offline and sync later
-- ---------------------------------------------------------------------------
create table public.reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 500),
  date       date,
  time       text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  notes      text not null default '' check (char_length(notes) <= 5000),
  alert      integer check (alert is null or alert between -1 and 10080),
  done       boolean not null default false,
  done_at    timestamptz,
  sample     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 300),
  body       text not null default '' check (char_length(body) <= 50000),
  pinned     boolean not null default false,
  sample     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.updates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 5000),
  at         timestamptz not null default now(),
  sample     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_user_id_idx on public.reminders (user_id);
create index notes_user_id_idx     on public.notes (user_id);
create index updates_user_id_idx   on public.updates (user_id, at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: owners only
-- (select auth.uid()) is evaluated once per query rather than once per row.
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.reminders enable row level security;
alter table public.notes     enable row level security;
alter table public.updates   enable row level security;

create policy "Own profile: read"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Own profile: update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Own reminders: read"   on public.reminders for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own reminders: insert" on public.reminders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own reminders: update" on public.reminders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own reminders: delete" on public.reminders for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Own notes: read"   on public.notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own notes: insert" on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own notes: update" on public.notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own notes: delete" on public.notes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Own updates: read"   on public.updates for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own updates: insert" on public.updates for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own updates: update" on public.updates for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own updates: delete" on public.updates for delete to authenticated using ((select auth.uid()) = user_id);

-- Signed-out visitors get nothing at all.
revoke all on public.profiles, public.reminders, public.notes, public.updates from anon;

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch  before update on public.profiles  for each row execute function public.touch_updated_at();
create trigger reminders_touch before update on public.reminders for each row execute function public.touch_updated_at();
create trigger notes_touch     before update on public.notes     for each row execute function public.touch_updated_at();
create trigger updates_touch   before update on public.updates   for each row execute function public.touch_updated_at();

-- A row can never be moved to another user.
create or replace function public.lock_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger reminders_lock_owner before update on public.reminders for each row execute function public.lock_owner();
create trigger notes_lock_owner     before update on public.notes     for each row execute function public.lock_owner();
create trigger updates_lock_owner   before update on public.updates   for each row execute function public.lock_owner();

-- Create the profile when someone signs up (name comes from the sign-up form).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Let a signed-in user permanently delete their own account (and, via cascade, all their data).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: changes on one device appear instantly on your others
-- (Realtime respects the RLS policies above.)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.reminders, public.notes, public.updates, public.profiles;
