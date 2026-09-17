-- =============================================================================
-- SCHOOL-HUB — 0002_core_tables.sql
-- All application tables, constraints, indexes, updated_at triggers and the
-- auth.users -> public.profiles bridge.
-- Depends on: 0001_extensions.sql
-- =============================================================================

-- =============================================================================
-- profiles
-- One row per auth user (parent, child or helper).
-- =============================================================================
create table if not exists public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  role          text        not null default 'parent'
                            check (role in ('parent', 'child', 'helper')),
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Application profile for every auth.users row.';

-- =============================================================================
-- families
-- =============================================================================
create table if not exists public.families (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (length(btrim(name)) > 0),
  owner_id    uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_families_owner_id on public.families (owner_id);

-- =============================================================================
-- family_members
-- Membership + per-member permissions. permissions jsonb shape (phase 2 helper):
--   { "can_review": true, "children": ["<child uuid>", ...] }
-- "children": null / absent  => all children in the family.
-- =============================================================================
create table if not exists public.family_members (
  id           uuid        primary key default gen_random_uuid(),
  family_id    uuid        not null references public.families (id) on delete cascade,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  role         text        not null check (role in ('parent', 'child', 'helper')),
  permissions  jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint family_members_unique unique (family_id, user_id)
);

create index if not exists idx_family_members_user_id on public.family_members (user_id);
create index if not exists idx_family_members_family_id on public.family_members (family_id);

-- =============================================================================
-- children
-- profile_id is the child's OWN auth user; null until the invite code is redeemed.
-- =============================================================================
create table if not exists public.children (
  id                uuid        primary key default gen_random_uuid(),
  family_id         uuid        not null references public.families (id) on delete cascade,
  profile_id        uuid        unique references public.profiles (id) on delete set null,
  name              text        not null check (length(btrim(name)) > 0),
  grade             int         check (grade between 1 and 12),
  school            text,
  birth_date        date,
  avatar_url        text,
  color             text        not null default '#4f46e5',
  is_active         boolean     not null default true,

  -- invite / PIN login (see SPEC section 1)
  invite_code       text        unique
                                check (invite_code is null
                                       or length(invite_code) between 4 and 12),
  invite_expires_at timestamptz,
  pin_hash          text,
  pin_attempts      int         not null default 0 check (pin_attempts >= 0),
  pin_locked_until  timestamptz,

  -- per-child UI preferences, set by the parent
  ui_mode           text        not null default 'full'
                                check (ui_mode in ('simple', 'full')),
  show_own_stats    boolean     not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_children_family_id on public.children (family_id);
create index if not exists idx_children_profile_id on public.children (profile_id);
create index if not exists idx_children_invite_code on public.children (invite_code)
  where invite_code is not null;

comment on column public.children.show_own_stats is
  'Parent-controlled: may the child see their own statistics/progress. Default off.';
comment on column public.children.ui_mode is
  'simple = oversized, reduced kid UI; full = normal kid UI.';

-- =============================================================================
-- subjects
-- =============================================================================
create table if not exists public.subjects (
  id            uuid        primary key default gen_random_uuid(),
  child_id      uuid        not null references public.children (id) on delete cascade,
  name          text        not null check (length(btrim(name)) > 0),
  color         text        not null default '#64748b',
  teacher_name  text,
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint subjects_child_name_unique unique (child_id, name)
);

create index if not exists idx_subjects_child_id on public.subjects (child_id, sort_order);

-- =============================================================================
-- schedule_slots
-- weekday: 1 = Monday ... 7 = Sunday (ISO 8601 / extract(isodow)).
-- =============================================================================
create table if not exists public.schedule_slots (
  id              uuid        primary key default gen_random_uuid(),
  child_id        uuid        not null references public.children (id) on delete cascade,
  subject_id      uuid        not null references public.subjects (id) on delete cascade,
  weekday         int         not null check (weekday between 1 and 7),
  start_time      time        not null,
  end_time        time        not null,
  effective_from  date        not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint schedule_slots_time_order check (end_time > start_time),
  constraint schedule_slots_date_order check (effective_to is null
                                              or effective_to >= effective_from)
);

create index if not exists idx_schedule_slots_child_weekday
  on public.schedule_slots (child_id, weekday, start_time);
create index if not exists idx_schedule_slots_subject_id
  on public.schedule_slots (subject_id);

-- =============================================================================
-- lessons  -- "what we covered" on a given day
-- =============================================================================
create table if not exists public.lessons (
  id          uuid        primary key default gen_random_uuid(),
  child_id    uuid        not null references public.children (id) on delete cascade,
  subject_id  uuid        references public.subjects (id) on delete set null,
  date        date        not null default current_date,
  topic       text,
  notes       text,
  slot_id     uuid        references public.schedule_slots (id) on delete set null,
  created_by  uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- SPEC index: lessons(child_id, date)
create index if not exists idx_lessons_child_date on public.lessons (child_id, date desc);
create index if not exists idx_lessons_subject_id on public.lessons (subject_id);
create index if not exists idx_lessons_slot_id on public.lessons (slot_id);

-- =============================================================================
-- topics  (self-referencing tree under a subject)
-- =============================================================================
create table if not exists public.topics (
  id              uuid        primary key default gen_random_uuid(),
  subject_id      uuid        not null references public.subjects (id) on delete cascade,
  name            text        not null check (length(btrim(name)) > 0),
  parent_topic_id uuid        references public.topics (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint topics_not_self_parent check (parent_topic_id is null or parent_topic_id <> id)
);

create index if not exists idx_topics_subject_id on public.topics (subject_id);
create index if not exists idx_topics_parent_topic_id on public.topics (parent_topic_id);

-- =============================================================================
-- assignments
-- status machine enforced by the trigger in 0003_functions.sql.
-- priority: 1 = low, 2 = normal, 3 = high.
-- =============================================================================
create table if not exists public.assignments (
  id              uuid        primary key default gen_random_uuid(),
  lesson_id       uuid        references public.lessons (id) on delete set null,
  child_id        uuid        not null references public.children (id) on delete cascade,
  subject_id      uuid        references public.subjects (id) on delete set null,
  topic_id        uuid        references public.topics (id) on delete set null,

  title           text        not null check (length(btrim(title)) > 0),
  description     text,
  source_ref      text,                       -- "წიგნი გვ. 45, სავარჯიშო 3"

  due_date        date,
  due_time        time,

  status          text        not null default 'assigned'
                              check (status in ('assigned', 'in_progress',
                                                'submitted', 'approved', 'redo')),
  priority        int         not null default 2 check (priority between 1 and 3),

  self_rating     int         check (self_rating between 1 and 5),
  difficulty_note text,
  minutes_spent   int         check (minutes_spent >= 0),
  redo_count      int         not null default 0 check (redo_count >= 0),

  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid        references public.profiles (id) on delete set null,
  review_comment  text,

  ai_check        jsonb,                      -- phase 3

  created_by      uuid        references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- SPEC indexes
create index if not exists idx_assignments_child_status
  on public.assignments (child_id, status);
create index if not exists idx_assignments_child_due_date
  on public.assignments (child_id, due_date);
-- supporting indexes
create index if not exists idx_assignments_lesson_id on public.assignments (lesson_id);
create index if not exists idx_assignments_subject_id on public.assignments (subject_id);
create index if not exists idx_assignments_topic_id on public.assignments (topic_id);
create index if not exists idx_assignments_status_submitted_at
  on public.assignments (status, submitted_at desc);

-- =============================================================================
-- assignment_events  -- append-only audit trail, written by the status trigger
-- =============================================================================
create table if not exists public.assignment_events (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id uuid        not null references public.assignments (id) on delete cascade,
  actor_id      uuid        references public.profiles (id) on delete set null,
  from_status   text        check (from_status in ('assigned', 'in_progress',
                                                   'submitted', 'approved', 'redo')),
  to_status     text        not null
                            check (to_status in ('assigned', 'in_progress',
                                                 'submitted', 'approved', 'redo')),
  comment       text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_assignment_events_assignment
  on public.assignment_events (assignment_id, created_at desc);

comment on table public.assignment_events is
  'Append-only. Rows are inserted only by public.assignments_status_guard() / _log_insert().';

-- =============================================================================
-- messages
-- child_id is denormalised from the parent assignment/lesson so that RLS on
-- messages (and attachments) stays a single-column comparison. Maintained by a
-- BEFORE INSERT trigger; see public.resolve_message_child_id().
-- =============================================================================
create table if not exists public.messages (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id uuid        references public.assignments (id) on delete cascade,
  lesson_id     uuid        references public.lessons (id) on delete cascade,
  child_id      uuid        not null references public.children (id) on delete cascade,
  author_id     uuid        references public.profiles (id) on delete set null,
  body          text,
  voice_path    text,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  constraint messages_one_parent check (num_nonnulls(assignment_id, lesson_id) = 1),
  constraint messages_has_content check (num_nonnulls(body, voice_path) >= 1)
);

-- SPEC index: messages(assignment_id, created_at)
create index if not exists idx_messages_assignment_created
  on public.messages (assignment_id, created_at);
create index if not exists idx_messages_lesson_created
  on public.messages (lesson_id, created_at);
create index if not exists idx_messages_child_id on public.messages (child_id);
create index if not exists idx_messages_author_id on public.messages (author_id);

-- =============================================================================
-- message_reads
-- =============================================================================
create table if not exists public.message_reads (
  message_id  uuid        not null references public.messages (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists idx_message_reads_user_id on public.message_reads (user_id);

-- =============================================================================
-- attachments
-- child_id denormalised for the same reason as messages.
-- storage_path is the object name inside the private "evidence" bucket:
--   {child_id}/{assignment_id}/{uuid}.webp
-- =============================================================================
create table if not exists public.attachments (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id uuid        references public.assignments (id) on delete cascade,
  lesson_id     uuid        references public.lessons (id) on delete cascade,
  message_id    uuid        references public.messages (id) on delete cascade,
  child_id      uuid        not null references public.children (id) on delete cascade,
  kind          text        not null
                            check (kind in ('task_source', 'solution', 'review', 'chat')),
  storage_path  text        not null unique,
  thumb_path    text,
  mime          text        not null default 'image/webp',
  size_bytes    bigint      check (size_bytes is null or size_bytes >= 0),
  width         int         check (width is null or width > 0),
  height        int         check (height is null or height > 0),
  sort_order    int         not null default 0,
  uploaded_by   uuid        references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint attachments_has_owner_row
    check (num_nonnulls(assignment_id, lesson_id, message_id) >= 1)
);

-- SPEC index: attachments(assignment_id, kind)
create index if not exists idx_attachments_assignment_kind
  on public.attachments (assignment_id, kind, sort_order);
create index if not exists idx_attachments_lesson_id on public.attachments (lesson_id);
create index if not exists idx_attachments_message_id on public.attachments (message_id);
create index if not exists idx_attachments_child_id on public.attachments (child_id);

-- =============================================================================
-- grades  -- parent-only data (children must never be able to select this)
-- =============================================================================
create table if not exists public.grades (
  id            uuid        primary key default gen_random_uuid(),
  child_id      uuid        not null references public.children (id) on delete cascade,
  subject_id    uuid        references public.subjects (id) on delete set null,
  date          date        not null default current_date,
  value         numeric(5,2) not null check (value >= 0),
  max_value     numeric(5,2) not null default 10 check (max_value > 0),
  source        text        not null default 'teacher'
                            check (source in ('teacher', 'internal')),
  note          text,
  attachment_id uuid        references public.attachments (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint grades_value_within_max check (value <= max_value)
);

create index if not exists idx_grades_child_date on public.grades (child_id, date desc);
create index if not exists idx_grades_subject_id on public.grades (subject_id);
create index if not exists idx_grades_attachment_id on public.grades (attachment_id);

-- =============================================================================
-- topic_mastery  -- phase 2
-- =============================================================================
create table if not exists public.topic_mastery (
  id         uuid        primary key default gen_random_uuid(),
  child_id   uuid        not null references public.children (id) on delete cascade,
  topic_id   uuid        not null references public.topics (id) on delete cascade,
  level      int         not null default 0 check (level between 0 and 100),
  samples    int         not null default 0 check (samples >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_mastery_unique unique (child_id, topic_id)
);

create index if not exists idx_topic_mastery_child_id on public.topic_mastery (child_id);
create index if not exists idx_topic_mastery_topic_id on public.topic_mastery (topic_id);

-- =============================================================================
-- notifications  -- phase 2
-- =============================================================================
create table if not exists public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  type       text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc) where read_at is null;

-- =============================================================================
-- updated_at triggers
-- =============================================================================
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'families', 'family_members', 'children', 'subjects',
    'schedule_slots', 'lessons', 'topics', 'assignments', 'grades', 'topic_mastery'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- =============================================================================
-- auth.users -> public.profiles bridge
-- Runs as the definer so it can write to profiles regardless of RLS.
-- raw_user_meta_data may carry { "role": "...", "display_name": "..." }.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data ->> 'role', 'parent');
  if v_role not in ('parent', 'child', 'helper') then
    v_role := 'parent';
  end if;

  insert into public.profiles (id, role, display_name, avatar_url)
  values (
    new.id,
    v_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Backfill profiles for auth users that predate this migration.
-- =============================================================================
insert into public.profiles (id, role, display_name)
select u.id,
       'parent',
       coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'user')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
