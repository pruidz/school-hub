-- 0006_lesson_no_homework.sql
--
-- Screen C2 ("დავალება არ მოგვცეს"): the child confirms that a lesson produced no
-- homework. This has to be an explicit fact, not an inference — "no assignments yet"
-- and "no homework was given" are different states, and only the second one means the
-- child is done for that lesson.
--
-- Also adds the uniqueness that makes lesson materialisation safe: materialiseDayLessons
-- is read-then-insert, so two concurrent first loads of /kid/today could otherwise
-- create the same lesson twice.

alter table public.lessons
  add column if not exists no_homework boolean not null default false;

comment on column public.lessons.no_homework is
  'Child confirmed that this lesson produced no homework (screen C2).';

create unique index if not exists uq_lessons_child_slot_date
  on public.lessons (child_id, slot_id, date)
  where slot_id is not null;
