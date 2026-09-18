-- 0011_notify_parent_on_helper_review.sql
--
-- A helper with review rights (0010) can close the whole loop with no parent in
-- it: the tutor approves, the child moves on, and the parent finds out never.
-- `assignments.reviewed_by` records who decided, but nothing surfaces it, and a
-- parent who delegated "can review" to a grandmother did not thereby agree to
-- stop knowing what happened to their child's homework.
--
-- So: when the reviewer is not a parent of the family, the parents are told too.
-- The child's own notification is unchanged.
--
-- This replaces `notify_assignment_status()` from 0009. Everything up to the
-- approved/redo branch is carried over verbatim.

create or replace function public.notify_assignment_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor        uuid := auth.uid();
  v_child_name   text;
  v_family_id    uuid;
  v_child_user   uuid;
  v_subject      text;
  v_payload      jsonb;
  v_recipient    uuid;
  v_actor_name   text;
  v_actor_parent boolean;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status not in ('submitted', 'approved', 'redo') then
    return null;
  end if;

  select c.name, c.family_id, c.profile_id
    into v_child_name, v_family_id, v_child_user
    from public.children c
   where c.id = new.child_id;

  if v_family_id is null then
    return null;
  end if;

  select s.name into v_subject
    from public.subjects s
   where s.id = new.subject_id;

  if new.status = 'submitted' then
    v_payload := jsonb_build_object(
      'v',            1,
      'audience',     'parent',
      'count',        1,
      'assignment_id', new.id,
      'child_id',     new.child_id,
      'child_name',   v_child_name,
      'subject_name', v_subject,
      'title',        left(new.title, 120)
    );

    for v_recipient in
      select u from public.family_parent_ids(v_family_id) as u
    loop
      if v_recipient is distinct from v_actor then
        perform public.enqueue_notification(v_recipient, 'assignment_submitted', v_payload);
      end if;
    end loop;

    return null;
  end if;

  -- approved | redo -> the child whose work it is
  if v_child_user is not null and v_child_user is distinct from v_actor then
    v_payload := jsonb_build_object(
      'v',            1,
      'audience',     'child',
      'count',        1,
      'assignment_id', new.id,
      'child_id',     new.child_id,
      'child_name',   v_child_name,
      'subject_name', v_subject,
      'title',        left(new.title, 120),
      'preview',      nullif(left(coalesce(new.review_comment, ''), 120), '')
    );

    perform public.enqueue_notification(
      v_child_user,
      case when new.status = 'approved' then 'assignment_approved' else 'assignment_redo' end,
      v_payload
    );
  end if;

  -- ... and the parents, when somebody other than a parent decided.
  --
  -- `family_parent_ids()` is the definition of "a parent of this family", so
  -- membership in it is the test — not `profiles.role`, which a helper in one
  -- family could hold as a parent of another. A null actor is the service role
  -- (seed, admin script) and is treated as privileged, matching 0003.
  if v_actor is null then
    return null;
  end if;

  select exists (
    select 1 from public.family_parent_ids(v_family_id) as u where u = v_actor
  ) into v_actor_parent;

  if v_actor_parent then
    return null;
  end if;

  select p.display_name into v_actor_name
    from public.profiles p
   where p.id = v_actor;

  v_payload := jsonb_build_object(
    'v',            1,
    'audience',     'parent',
    'count',        1,
    'assignment_id', new.id,
    'child_id',     new.child_id,
    'child_name',   v_child_name,
    'subject_name', v_subject,
    'title',        left(new.title, 120),
    'actor_name',   v_actor_name,
    'preview',      nullif(left(coalesce(new.review_comment, ''), 120), '')
  );

  for v_recipient in
    select u from public.family_parent_ids(v_family_id) as u
  loop
    perform public.enqueue_notification(
      v_recipient,
      case when new.status = 'approved'
             then 'assignment_approved_by_helper'
           else 'assignment_redo_by_helper'
      end,
      v_payload
    );
  end loop;

  return null;
end;
$$;

comment on function public.notify_assignment_status() is
  'Notifies on submit/approve/redo. When a non-parent (a helper with review '
  'rights) decides, the parents are notified as well as the child.';
