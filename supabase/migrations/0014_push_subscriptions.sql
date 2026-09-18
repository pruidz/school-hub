-- =============================================================================
-- SCHOOL-HUB — 0014_push_subscriptions.sql
-- Web Push: one row per browser per user, plus the outbox marker that stops a
-- collapsed notification from buzzing twice.
-- Depends on: 0002_core_tables.sql, 0004_rls.sql, 0009_realtime_notifications.sql
--
-- WHY THIS EXISTS
-- The bell works, and it works only while a tab is open. The child hands work
-- in at 20:15 from another building and the parent learns about it whenever
-- they next look at the site. Since iOS 16.4 a web app added to the Home Screen
-- can receive a real push, so the whole of "tell the parent now" is one table
-- and a service worker — no App Store, no native build, no extra service.
--
-- WHAT IS *NOT* HERE
-- No recipient logic. 0009/0011 already decide who is told about what, and
-- duplicating that in a second place is how the two drift apart. This migration
-- stores devices and marks rows as delivered; `src/features/notifications/push`
-- reads an already-written `notifications` row and posts it to that user's
-- devices. The table below is a mailbox, not a rule.
--
-- THREE THINGS LIVE IN HERE
--   1. public.push_subscriptions — the devices (section 1).
--   2. notifications.pushed_at   — the once-only marker (section 2).
--   3. The update guard from 0009, extended to cover it (section 3).
-- =============================================================================


-- =============================================================================
-- 1. public.push_subscriptions
--
-- A Web Push subscription is a triple: an opaque https endpoint at the push
-- service (FCM, Apple, Mozilla), and two keys the browser generated that the
-- sender encrypts to. All three come from the browser; none of them is a
-- credential of ours, and none of them is ever rendered in the UI or written to
-- a log. `user_agent` exists solely so the settings screen can say
-- "iPhone · Safari" instead of showing 300 characters of endpoint.
--
-- COLUMN NAMING
-- The browser calls the second key `auth`. It is stored as `auth_key` here
-- deliberately: a column literally named `auth` in a table every policy
-- interrogates with `auth.uid()` is a schema-vs-column ambiguity waiting to
-- happen, and no policy is worth that risk. `src/features/notifications/push`
-- maps it back on the way out.
--
-- ENDPOINT IS THE IDENTITY
-- `endpoint` is unique across the whole table, not per user. The endpoint IS
-- the browser: two rows for one endpoint would mean the same device buzzing
-- twice, and an endpoint that moved to a different user (a parent signing in on
-- the phone a child was using) must MOVE, not be duplicated. Re-subscribing
-- therefore upserts on this constraint. See `subscribeDeviceAction`.
--
-- ON DELETE CASCADE from profiles: an account that goes away takes its devices
-- with it, exactly as `notifications` does.
-- =============================================================================
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth_key      text not null,
  -- Free text from the browser, shown to its owner and to nobody else.
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  -- Length caps, not validation: they keep a hostile client from parking
  -- megabytes in a table whose whole point is to be cheap to scan, and they
  -- keep `endpoint` comfortably inside the btree index tuple limit.
  constraint push_subscriptions_endpoint_len check (length(endpoint) between 8 and 2000),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_p256dh_len check (length(p256dh) between 1 and 255),
  constraint push_subscriptions_auth_len check (length(auth_key) between 1 and 255),
  constraint push_subscriptions_ua_len check (user_agent is null or length(user_agent) <= 400)
);

comment on table public.push_subscriptions is
  'One Web Push subscription per browser per user. Written by the owner, read '
  'by the delivery path (service role). Never exposed to another user (0014).';

-- The delivery path's only question is "every device belonging to this user",
-- asked once per notification. This is that index. The unique constraint on
-- `endpoint` already covers the upsert.
create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id);

-- -----------------------------------------------------------------------------
-- 1a. RLS — strictly personal, in the same shape as `notifications`.
--
-- A subscription is not family data. A parent has no business reading their
-- child's device list, and a helper has no business reading anybody's: the
-- endpoint is a capability, and whoever holds it can make that phone buzz.
-- So the fence is `user_id = auth.uid()` on every verb, with no family clause
-- anywhere in this file.
-- -----------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- WITH CHECK only, and it pins `user_id` to the caller: a client cannot
-- register a device in somebody else's name and start reading their homework
-- notifications off a lock screen.
drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

-- USING *and* WITH CHECK: the row must already be mine, and must still be mine
-- afterwards. Without the WITH CHECK half, a user could hand their own row to
-- another account and have that account's notifications delivered to a device
-- they hold.
drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
create policy push_subscriptions_own_update on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());


-- =============================================================================
-- 2. notifications.pushed_at — one buzz per unread conversation
--
-- 0009's `enqueue_notification()` collapses a burst: three messages in one
-- thread become ONE unread row whose `count` climbs and whose `created_at`
-- moves to now(). The bell honours that for free — it renders rows. A push
-- does not: "send a push whenever a notification row changes" would turn the
-- collapsing back into three buzzes, which is precisely the behaviour the
-- collapsing exists to prevent.
--
-- So delivery is an outbox claim rather than a broadcast. `pushed_at` is
-- stamped the first time a row is handed to the push services and is never
-- cleared — not even by the collapse UPDATE, which does not mention this column
-- (0009 section 2b, unchanged). The sequence is therefore:
--
--   20:15  message 1  -> row inserted, pushed_at null  -> claimed, ONE buzz
--   20:16  message 2  -> same row, count 2             -> pushed_at set, no buzz
--   20:17  message 3  -> same row, count 3             -> pushed_at set, no buzz
--   parent opens it   -> read_at set
--   20:40  message 4  -> read_at is not null, so 0009 starts a FRESH row,
--                        pushed_at null                -> claimed, one buzz
--
-- which is exactly the bell's own definition of "this is one new thing".
--
-- The claim is a single UPDATE ... WHERE pushed_at IS NULL ... RETURNING, so
-- two server actions racing over the same row cannot both win it and no push
-- is sent twice.
--
-- Nullable with no default and no backfill: every notification that exists
-- before this migration is history, and history must not buzz.
-- =============================================================================
alter table public.notifications
  add column if not exists pushed_at timestamptz;

comment on column public.notifications.pushed_at is
  'When this row was handed to the push services. Set once, never cleared, so '
  'a collapsed burst is one buzz. NULL means "not yet delivered" (0014).';

-- The delivery path asks exactly one question: "unclaimed rows about this
-- assignment". Partial on `pushed_at is null` keeps the index the size of the
-- backlog (usually zero rows) rather than the size of the table.
create index if not exists idx_notifications_unpushed
  on public.notifications ((payload ->> 'assignment_id'))
  where pushed_at is null;


-- =============================================================================
-- 3. The 0009 owner-update guard, extended
--
-- 0009 froze `user_id`, `type`, `payload` and `created_at` against the owner's
-- own UPDATE, leaving them `read_at` and nothing else. `pushed_at` belongs in
-- that list for the same reason: it is delivery bookkeeping, not something the
-- recipient gets a vote on. A client who could NULL it out would be able to
-- make their own device buzz again for a row they had already been sent —
-- self-inflicted, but it is one line to close and the table's whole contract is
-- "the row you were sent is the row you see".
--
-- Everything else about the function is carried over verbatim from 0009,
-- including the service-context escape (auth.uid() is null, which is how the
-- delivery path stamps the column) and the transaction-local writer flag that
-- `enqueue_notification()` raises around its collapse UPDATE.
-- =============================================================================
create or replace function public.notifications_owner_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('schoolhub.notification_writer', true), '') = 'on'
  then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'notifications.user_id cannot be changed' using errcode = '42501';
  end if;
  if new.type is distinct from old.type then
    raise exception 'notifications.type cannot be changed' using errcode = '42501';
  end if;
  if new.payload is distinct from old.payload then
    raise exception 'notifications.payload cannot be changed' using errcode = '42501';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'notifications.created_at cannot be changed' using errcode = '42501';
  end if;
  if new.pushed_at is distinct from old.pushed_at then
    raise exception 'notifications.pushed_at cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.notifications_owner_update_guard() is
  'The owner of a notification may change read_at and nothing else. Extended in '
  '0014 to cover pushed_at, the delivery marker.';
