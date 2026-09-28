-- Subscriptions: 7-day free trial (no card), then £4.99/month via Stripe.
--
-- Security model
--   • public.billing is readable by its owner, never writable by users.
--     Only the Stripe webhook (service role) changes a subscription.
--   • Access is enforced in the database: once the trial/subscription has ended,
--     inserts and updates to reminders/notes/updates are refused by RLS.
--     Reading (export) and deleting stay available.
--   • Background notifications only go to people with access.

create table public.billing (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  trial_ends_at          timestamptz not null default now() + interval '7 days',
  status                 text not null default 'trialing'
                           check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.billing enable row level security;
create policy "Own billing: read" on public.billing for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.billing from anon;
revoke insert, update, delete on public.billing from authenticated;

-- Existing people get a fresh 7-day trial from today.
insert into public.billing (user_id) select id from auth.users on conflict do nothing;

-- New sign-ups: profile + trial.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80));
  insert into public.billing (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- Does this person currently have access? (trial, paid, or paid-until-period-end)
create or replace function public.billing_has_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select b.trial_ends_at > now()
        or b.status in ('active', 'past_due')          -- past_due: Stripe is retrying the card
        or (b.current_period_end is not null and b.current_period_end > now() and b.status <> 'incomplete_expired')
      from public.billing b where b.user_id = p_user
  ), false)
$$;
revoke execute on function public.billing_has_access(uuid) from public, anon;
grant execute on function public.billing_has_access(uuid) to authenticated, service_role;

create or replace function public.has_access()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.billing_has_access((select auth.uid())) $$;
revoke execute on function public.has_access() from public, anon;
grant execute on function public.has_access() to authenticated;

-- Writes require access (read + delete stay open so people can export or leave).
drop policy "Own reminders: insert" on public.reminders;
drop policy "Own reminders: update" on public.reminders;
drop policy "Own notes: insert" on public.notes;
drop policy "Own notes: update" on public.notes;
drop policy "Own updates: insert" on public.updates;
drop policy "Own updates: update" on public.updates;

create policy "Own reminders: insert" on public.reminders for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_access()));
create policy "Own reminders: update" on public.reminders for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (select public.has_access()));
create policy "Own notes: insert" on public.notes for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_access()));
create policy "Own notes: update" on public.notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (select public.has_access()));
create policy "Own updates: insert" on public.updates for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_access()));
create policy "Own updates: update" on public.updates for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (select public.has_access()));

-- Only push to people with access.
create or replace function public.claim_due_pushes()
returns table (id uuid, user_id uuid, title text, notes text, date date, "time" text, notify_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  update public.reminders r
     set pushed_for = r.notify_at
   where r.done = false
     and r.notify_at is not null
     and r.notify_at <= now()
     and r.notify_at > now() - interval '12 hours'
     and r.pushed_for is distinct from r.notify_at
     and public.billing_has_access(r.user_id)
  returning r.id, r.user_id, r.title, r.notes, r.date, r.time, r.notify_at
$$;
revoke execute on function public.claim_due_pushes() from public, anon, authenticated;
grant execute on function public.claim_due_pushes() to service_role;

-- Stripe setup that the Edge Functions create themselves on first use
-- (price id, webhook endpoint + its signing secret). Server-only.
create table private.billing_config (
  id              integer primary key default 1 check (id = 1),
  price_id        text,
  webhook_id      text,
  webhook_secret  text
);
insert into private.billing_config (id) values (1);

create or replace function public.billing_config_get()
returns table (price_id text, webhook_id text, webhook_secret text)
language sql security definer set search_path = ''
as $$ select price_id, webhook_id, webhook_secret from private.billing_config where id = 1 $$;

create or replace function public.billing_config_set(p_price_id text, p_webhook_id text, p_webhook_secret text)
returns void
language sql security definer set search_path = ''
as $$
  update private.billing_config
     set price_id = coalesce(p_price_id, price_id),
         webhook_id = coalesce(p_webhook_id, webhook_id),
         webhook_secret = coalesce(p_webhook_secret, webhook_secret)
   where id = 1
$$;
revoke execute on function public.billing_config_get() from public, anon, authenticated;
revoke execute on function public.billing_config_set(text, text, text) from public, anon, authenticated;
grant execute on function public.billing_config_get() to service_role;
grant execute on function public.billing_config_set(text, text, text) to service_role;

alter publication supabase_realtime add table public.billing;
