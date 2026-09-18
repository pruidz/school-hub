// =============================================================================
// SCHOOL-HUB — supabase/test/harness.mjs
//
// Boots a throwaway PostgreSQL 18 (embedded-postgres, no Docker), applies
// supabase/test/bootstrap.sql, then migrations 0001..0010 in order, then
// seed.sql, then a small second-family fixture that the seed does not provide.
//
// Everything here is test infrastructure. Nothing in this file is shipped.
// =============================================================================

import { existsSync } from 'node:fs';
import { readFile, rm, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgresNS from 'embedded-postgres';

const EmbeddedPostgres = EmbeddedPostgresNS.default ?? EmbeddedPostgresNS;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SUPABASE_DIR = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(SUPABASE_DIR, '..');
const DATA_DIR = path.join(REPO_ROOT, '.tmp', 'pgdata');
const PORT = Number(process.env.SCHOOLHUB_TEST_PG_PORT ?? 54999);

// -----------------------------------------------------------------------------
// Fixed ids from supabase/seed.sql, plus the second family this harness adds.
// -----------------------------------------------------------------------------
export const ID = {
  // --- family 1 (from seed.sql) ---
  family1: 'f0000000-0000-4000-8000-000000000001',
  parent1User: 'a0000000-0000-4000-8000-000000000001',
  childAUser: 'a0000000-0000-4000-8000-000000000002', // ნიკა, show_own_stats = false
  childBUser: 'a0000000-0000-4000-8000-000000000003', // ანა,  show_own_stats = true
  childA: 'c0000000-0000-4000-8000-000000000001',
  childB: 'c0000000-0000-4000-8000-000000000002',

  // assignments (see seed.sql section 8)
  aAssigned: '91000000-0000-4000-8000-000000000006', // child A, status 'assigned'
  aSubmitted: '91000000-0000-4000-8000-000000000003', // child A, status 'submitted'
  aRedo: '91000000-0000-4000-8000-000000000005', // child A, status 'redo'
  aApproved: '91000000-0000-4000-8000-000000000001', // child A, status 'approved'
  aInProgress: '91000000-0000-4000-8000-000000000004', // child A, status 'in_progress'
  bAssigned: '92000000-0000-4000-8000-000000000006', // child B, status 'assigned'
  bSubmitted: '92000000-0000-4000-8000-000000000001', // child B, status 'submitted'

  aLesson: '81000000-0000-4000-8000-000000000001',
  bLesson: '82000000-0000-4000-8000-000000000001',
  aSubject: '51000000-0000-4000-8000-000000000001',
  bSubject: '52000000-0000-4000-8000-000000000001',
  aTopic: '61000000-0000-4000-8000-000000000002',
  bTopic: '62000000-0000-4000-8000-000000000001',
  bMessage: 'd2000000-0000-4000-8000-000000000001',
  bAttachment: 'a2000000-0000-4000-8000-000000000001',

  // --- family 2 (added by this harness, see FIXTURE_SQL) ---
  family2: 'f0000000-0000-4000-8000-000000000002',
  parent2User: 'b0000000-0000-4000-8000-000000000001',
  childCUser: 'b0000000-0000-4000-8000-000000000002',
  childC: 'c0000000-0000-4000-8000-000000000003',
  cSubject: '53000000-0000-4000-8000-000000000001',
  cTopic: '63000000-0000-4000-8000-000000000001',
  cLesson: '83000000-0000-4000-8000-000000000001',
  cAssignment: '93000000-0000-4000-8000-000000000001',
  cMessage: 'd3000000-0000-4000-8000-000000000001',
  cAttachment: 'a3000000-0000-4000-8000-000000000001',
  cGrade: 'e3000000-0000-4000-8000-000000000001',

  // --- the helper persona (0010), built inside family 2 ---------------------
  // Deliberately NOT family 1: test 14 asserts that parent 1 sees exactly three
  // profiles and three memberships, and three extra adults there would turn a
  // meaningful assertion into a number nobody maintains.
  //
  // Family 2 therefore has two children, C and D, and three helpers, all three
  // assigned to child C and none of them to child D:
  //   helperViewUser     view + comment, no review
  //   helperReviewUser   view + comment + review
  //   helperRevokedUser  the same grant, with permissions.revoked_at stamped
  childD: 'c0000000-0000-4000-8000-000000000004',
  childDUser: 'b0000000-0000-4000-8000-000000000006',
  dSubject: '54000000-0000-4000-8000-000000000001',
  dLesson: '84000000-0000-4000-8000-000000000001',
  dAssignment: '94000000-0000-4000-8000-000000000001',
  dMessage: 'd4000000-0000-4000-8000-000000000001',
  dAttachment: 'a4000000-0000-4000-8000-000000000001',
  dGrade: 'e4000000-0000-4000-8000-000000000001',

  helperViewUser: 'b0000000-0000-4000-8000-000000000003',
  helperReviewUser: 'b0000000-0000-4000-8000-000000000004',
  helperRevokedUser: 'b0000000-0000-4000-8000-000000000005',

  // A message the viewing helper already posted on child C's thread. Revoking
  // them must not remove it.
  helperMessage: 'd5000000-0000-4000-8000-000000000001',

  // Pending invitations, one per family, so the cross-family walks have a row
  // to find in family 1 and a row to fail to find in family 2.
  invite1: '70000000-0000-4000-8000-000000000001',
  invite2: '70000000-0000-4000-8000-000000000002',
};

// -----------------------------------------------------------------------------
// A second family. seed.sql only builds one, so "a parent of family 1 can reach
// nothing in family 2" has nothing to fail against without this.
// Runs as the bootstrap superuser (auth.uid() is null => the service path in
// every trigger), which is what `supabase db reset` does for seed.sql too.
// -----------------------------------------------------------------------------
const FIXTURE_SQL = `
delete from public.families where id = '${ID.family2}';
delete from auth.users where id in ('${ID.parent2User}', '${ID.childCUser}');

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '${ID.parent2User}',
   'authenticated', 'authenticated', 'parent2@school-hub.test', now(),
   '{"provider":"email","providers":["email"],"role":"parent"}'::jsonb,
   '{"role":"parent","display_name":"Other Parent"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '${ID.childCUser}',
   'authenticated', 'authenticated', 'childc@school-hub.test', now(),
   '{"provider":"email","providers":["email"],"role":"child"}'::jsonb,
   '{"role":"child","display_name":"Other Child"}'::jsonb,
   now(), now(), '', '', '', '');

insert into public.families (id, name, owner_id)
values ('${ID.family2}', 'Other family', '${ID.parent2User}');

insert into public.family_members (family_id, user_id, role, permissions) values
  ('${ID.family2}', '${ID.parent2User}', 'parent', '{"can_review": true}'::jsonb),
  ('${ID.family2}', '${ID.childCUser}',  'child',  '{}'::jsonb);

insert into public.children (id, family_id, profile_id, name, grade, color,
                             is_active, ui_mode, show_own_stats)
values ('${ID.childC}', '${ID.family2}', '${ID.childCUser}',
        'Other Child', 5, '#059669', true, 'full', true);

insert into public.subjects (id, child_id, name, color, sort_order)
values ('${ID.cSubject}', '${ID.childC}', 'Other subject', '#059669', 0);

insert into public.topics (id, subject_id, name)
values ('${ID.cTopic}', '${ID.cSubject}', 'Other topic');

insert into public.schedule_slots (child_id, subject_id, weekday, start_time, end_time)
values ('${ID.childC}', '${ID.cSubject}', 1, '09:00', '09:45');

insert into public.lessons (id, child_id, subject_id, date, topic, created_by)
values ('${ID.cLesson}', '${ID.childC}', '${ID.cSubject}', current_date,
        'Other lesson', '${ID.parent2User}');

insert into public.assignments (id, lesson_id, child_id, subject_id, topic_id,
                                title, source_ref, due_date, status, priority, created_by)
values ('${ID.cAssignment}', '${ID.cLesson}', '${ID.childC}', '${ID.cSubject}',
        '${ID.cTopic}', 'Other assignment', 'Other book p.1', current_date,
        'submitted', 2, '${ID.parent2User}');

insert into public.messages (id, assignment_id, child_id, author_id, body)
values ('${ID.cMessage}', '${ID.cAssignment}', '${ID.childC}',
        '${ID.parent2User}', 'other family message');

insert into public.attachments (id, assignment_id, child_id, kind, storage_path,
                                mime, uploaded_by)
values ('${ID.cAttachment}', '${ID.cAssignment}', '${ID.childC}', 'solution',
        '${ID.childC}/${ID.cAssignment}/other.webp', 'image/webp', '${ID.childCUser}');

insert into public.grades (id, child_id, subject_id, date, value, max_value, source)
values ('${ID.cGrade}', '${ID.childC}', '${ID.cSubject}', current_date, 8, 10, 'teacher');

insert into public.topic_mastery (child_id, topic_id, level, samples)
values ('${ID.childC}', '${ID.cTopic}', 50, 2)
on conflict (child_id, topic_id) do update set level = excluded.level;

insert into public.notifications (user_id, type, payload)
values ('${ID.parent2User}', 'assignment_submitted',
        jsonb_build_object('assignment_id', '${ID.cAssignment}'));

insert into public.message_reads (message_id, user_id)
values ('${ID.cMessage}', '${ID.parent2User}');

-- Storage objects for both families, so the storage tests have something to
-- SELECT as well as something to fail to insert.
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('evidence', '${ID.childA}/${ID.aAssigned}/seed-a.webp', '${ID.childAUser}',
   '{"mimetype":"image/webp","size":1234}'::jsonb),
  ('evidence', '${ID.childA}/lesson/${ID.aLesson}/seed-a-lesson.webp', '${ID.childAUser}',
   '{"mimetype":"image/webp","size":1234}'::jsonb),
  ('evidence', '${ID.childB}/${ID.bAssigned}/seed-b.webp', '${ID.childBUser}',
   '{"mimetype":"image/webp","size":1234}'::jsonb),
  ('evidence', '${ID.childB}/lesson/${ID.aLesson}/seed-b-lesson.webp', '${ID.childBUser}',
   '{"mimetype":"image/webp","size":1234}'::jsonb),
  ('evidence', '${ID.childC}/${ID.cAssignment}/seed-c.webp', '${ID.childCUser}',
   '{"mimetype":"image/webp","size":1234}'::jsonb),
  ('evidence', '${ID.childD}/${ID.dAssignment}/seed-d.webp', '${ID.childDUser}',
   '{"mimetype":"image/webp","size":1234}'::jsonb)
on conflict (bucket_id, name) do nothing;
`;

// -----------------------------------------------------------------------------
// The helper persona (migration 0010). Kept in its own fixture so the block
// above stays exactly what it was before the helper role existed.
//
// Second child in family 2 + three helpers, all assigned to child C only.
// -----------------------------------------------------------------------------
const HELPER_FIXTURE_SQL = `
delete from auth.users where id in (
  '${ID.childDUser}', '${ID.helperViewUser}',
  '${ID.helperReviewUser}', '${ID.helperRevokedUser}');
delete from public.helper_invitations where id in ('${ID.invite1}', '${ID.invite2}');

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '${ID.childDUser}',
   'authenticated', 'authenticated', 'childd@school-hub.test', now(),
   '{"provider":"email","providers":["email"],"role":"child"}'::jsonb,
   '{"role":"child","display_name":"Second Child"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '${ID.helperViewUser}',
   'authenticated', 'authenticated', 'helper-view@school-hub.test', now(),
   '{"provider":"email","providers":["email"],"role":"helper"}'::jsonb,
   '{"role":"helper","display_name":"Viewing Helper"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '${ID.helperReviewUser}',
   'authenticated', 'authenticated', 'helper-review@school-hub.test', now(),
   '{"provider":"email","providers":["email"],"role":"helper"}'::jsonb,
   '{"role":"helper","display_name":"Reviewing Helper"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '${ID.helperRevokedUser}',
   'authenticated', 'authenticated', 'helper-revoked@school-hub.test', now(),
   '{"provider":"email","providers":["email"],"role":"helper"}'::jsonb,
   '{"role":"helper","display_name":"Revoked Helper"}'::jsonb,
   now(), now(), '', '', '', '');

insert into public.children (id, family_id, profile_id, name, grade, color,
                             is_active, ui_mode, show_own_stats,
                             invite_code, pin_hash)
values ('${ID.childD}', '${ID.family2}', '${ID.childDUser}',
        'Second Child', 3, '#b45309', true, 'full', false,
        'QQ7XZ4', 'not-a-real-hash');

update public.children
   set invite_code = 'RR8YW5', pin_hash = 'not-a-real-hash-either'
 where id = '${ID.childC}';

insert into public.subjects (id, child_id, name, color, sort_order)
values ('${ID.dSubject}', '${ID.childD}', 'Second subject', '#b45309', 0);

insert into public.schedule_slots (child_id, subject_id, weekday, start_time, end_time)
values ('${ID.childD}', '${ID.dSubject}', 2, '10:00', '10:45');

insert into public.lessons (id, child_id, subject_id, date, topic, created_by)
values ('${ID.dLesson}', '${ID.childD}', '${ID.dSubject}', current_date,
        'Second lesson', '${ID.parent2User}');

insert into public.assignments (id, lesson_id, child_id, subject_id,
                                title, source_ref, due_date, status, priority, created_by)
values ('${ID.dAssignment}', '${ID.dLesson}', '${ID.childD}', '${ID.dSubject}',
        'Second assignment', 'Other book p.2', current_date,
        'submitted', 2, '${ID.parent2User}');

insert into public.messages (id, assignment_id, child_id, author_id, body)
values ('${ID.dMessage}', '${ID.dAssignment}', '${ID.childD}',
        '${ID.parent2User}', 'second child message');

insert into public.attachments (id, assignment_id, child_id, kind, storage_path,
                                mime, uploaded_by)
values ('${ID.dAttachment}', '${ID.dAssignment}', '${ID.childD}', 'solution',
        '${ID.childD}/${ID.dAssignment}/seed-d.webp', 'image/webp', '${ID.childDUser}');

insert into public.grades (id, child_id, subject_id, date, value, max_value, source)
values ('${ID.dGrade}', '${ID.childD}', '${ID.dSubject}', current_date, 9, 10, 'teacher');

insert into public.family_members (family_id, user_id, role, permissions) values
  ('${ID.family2}', '${ID.childDUser}', 'child', '{}'::jsonb),
  ('${ID.family2}', '${ID.helperViewUser}', 'helper',
   jsonb_build_object('children', jsonb_build_array('${ID.childC}'),
                      'can_comment', true, 'can_review', false)),
  ('${ID.family2}', '${ID.helperReviewUser}', 'helper',
   jsonb_build_object('children', jsonb_build_array('${ID.childC}'),
                      'can_comment', true, 'can_review', true)),
  ('${ID.family2}', '${ID.helperRevokedUser}', 'helper',
   jsonb_build_object('children', jsonb_build_array('${ID.childC}'),
                      'can_comment', true, 'can_review', true,
                      'revoked_at', now()));

-- A message the viewing helper posted while they still had access.
insert into public.messages (id, assignment_id, child_id, author_id, body)
values ('${ID.helperMessage}', '${ID.cAssignment}', '${ID.childC}',
        '${ID.helperViewUser}', 'helper said this before being removed');

insert into public.helper_invitations
  (id, family_id, email, token, child_ids, can_comment, can_review,
   invited_by, expires_at)
values
  -- names child B on purpose: it makes the "child A sees zero sibling rows"
  -- walk over helper_invitations a real denial rather than a vacuous one.
  ('${ID.invite1}', '${ID.family1}', 'grandma@school-hub.test',
   'INVITE1TOKEN0000000000000000AAAA', array['${ID.childB}']::uuid[],
   true, false, '${ID.parent1User}', now() + interval '7 days'),
  ('${ID.invite2}', '${ID.family2}', 'tutor@school-hub.test',
   'INVITE2TOKEN0000000000000000BBBB', array['${ID.childC}']::uuid[],
   true, true, '${ID.parent2User}', now() + interval '7 days');
`;

// -----------------------------------------------------------------------------
// Every table in the public schema, in dependency-free order. Test 1 and test 13
// walk this list, so adding a table to 0002 without adding it here would be a
// silent coverage hole -- assertAllTablesCovered() below catches that.
// -----------------------------------------------------------------------------
export const PUBLIC_TABLES = [
  'profiles',
  'families',
  'family_members',
  'children',
  'subjects',
  'schedule_slots',
  'lessons',
  'topics',
  'assignments',
  'assignment_events',
  'messages',
  'message_reads',
  'attachments',
  'grades',
  'topic_mastery',
  'notifications',
  'helper_invitations',
];

/**
 * For each public table: the SQL predicate that selects rows belonging to
 * child B (the sibling), and the one for child A. Tables that are not
 * per-child (profiles, families, ...) get the closest equivalent "belongs to
 * someone else" predicate. Used by the cross-child SELECT walk.
 */
export const OTHER_CHILD_PREDICATE = {
  profiles: `id = '${ID.childBUser}'`,
  // families is family-scoped, not child-scoped: family 1 is legitimately
  // shared between the siblings. "Belonging to child B" therefore means the
  // family child A has nothing to do with.
  families: `id = '${ID.family2}'`,
  family_members: `user_id = '${ID.childBUser}'`,
  children: `id = '${ID.childB}'`,
  subjects: `child_id = '${ID.childB}'`,
  schedule_slots: `child_id = '${ID.childB}'`,
  lessons: `child_id = '${ID.childB}'`,
  topics: `subject_id in (select id from public.subjects where child_id = '${ID.childB}')`,
  assignments: `child_id = '${ID.childB}'`,
  assignment_events: `assignment_id in (select id from public.assignments where child_id = '${ID.childB}')`,
  messages: `child_id = '${ID.childB}'`,
  // message_reads / notifications are per-user, not per-child. The sibling has
  // no rows in the seed, so asking for theirs would pass vacuously; ask for the
  // PARENT's instead -- rows that definitely exist and that the child must
  // still not see.
  message_reads: `user_id = '${ID.parent1User}'`,
  attachments: `child_id = '${ID.childB}'`,
  grades: `child_id = '${ID.childB}'`,
  topic_mastery: `child_id = '${ID.childB}'`,
  notifications: `user_id = '${ID.parent1User}'`,
  // Not per-child either: an invitation belongs to the family. "Belongs to the
  // sibling" is therefore the invitation that names child B among its children.
  helper_invitations: `child_ids @> array['${ID.childB}']::uuid[]`,
};

export const FAMILY2_PREDICATE = {
  profiles: `id in ('${ID.parent2User}', '${ID.childCUser}')`,
  families: `id = '${ID.family2}'`,
  family_members: `family_id = '${ID.family2}'`,
  children: `id = '${ID.childC}'`,
  subjects: `child_id = '${ID.childC}'`,
  schedule_slots: `child_id = '${ID.childC}'`,
  lessons: `child_id = '${ID.childC}'`,
  topics: `subject_id = '${ID.cSubject}'`,
  assignments: `child_id = '${ID.childC}'`,
  assignment_events: `assignment_id = '${ID.cAssignment}'`,
  messages: `child_id = '${ID.childC}'`,
  message_reads: `user_id = '${ID.parent2User}'`,
  attachments: `child_id = '${ID.childC}'`,
  grades: `child_id = '${ID.childC}'`,
  topic_mastery: `child_id = '${ID.childC}'`,
  notifications: `user_id = '${ID.parent2User}'`,
  helper_invitations: `family_id = '${ID.family2}'`,
};

export const FAMILY1_PREDICATE = {
  profiles: `id = '${ID.parent1User}'`,
  families: `id = '${ID.family1}'`,
  family_members: `family_id = '${ID.family1}'`,
  children: `family_id = '${ID.family1}'`,
  subjects: `child_id in ('${ID.childA}', '${ID.childB}')`,
  schedule_slots: `child_id in ('${ID.childA}', '${ID.childB}')`,
  lessons: `child_id in ('${ID.childA}', '${ID.childB}')`,
  topics: `subject_id in (select id from public.subjects where child_id in ('${ID.childA}','${ID.childB}'))`,
  assignments: `child_id in ('${ID.childA}', '${ID.childB}')`,
  assignment_events: `assignment_id in (select id from public.assignments where child_id in ('${ID.childA}','${ID.childB}'))`,
  messages: `child_id in ('${ID.childA}', '${ID.childB}')`,
  message_reads: `user_id = '${ID.parent1User}'`,
  attachments: `child_id in ('${ID.childA}', '${ID.childB}')`,
  grades: `child_id in ('${ID.childA}', '${ID.childB}')`,
  topic_mastery: `child_id in ('${ID.childA}', '${ID.childB}')`,
  notifications: `user_id = '${ID.parent1User}'`,
  helper_invitations: `family_id = '${ID.family1}'`,
};

// =============================================================================
// Boot + apply
// =============================================================================

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Row count of every public table plus auth.users, as a plain object. */
async function tableCounts(client) {
  const out = {};
  for (const t of PUBLIC_TABLES) {
    const r = await client.query(`select count(*)::int as n from public.${t}`);
    out[t] = r.rows[0].n;
  }
  const u = await client.query('select count(*)::int as n from auth.users');
  out['auth.users'] = u.rows[0].n;
  return out;
}

/** Boots the server and applies bootstrap -> 0001..0007 -> seed -> fixtures. */
export async function startDatabase({ log = () => {} } = {}) {
  const { default: pg } = await import('pg');

  // Windows can hold a handle on the previous run's data directory for a
  // while after the postmaster exits (indexer, defender, an editor watching
  // the tree). `rm` then throws EBUSY and the whole suite fails in `before()`
  // with an error that has nothing to do with the SQL. Retry, and if the
  // directory genuinely will not go, run in a fresh one instead of dying.
  let dataDir = DATA_DIR;
  let removed = false;
  for (let attempt = 0; attempt < 5 && !removed; attempt += 1) {
    try {
      await rm(path.join(REPO_ROOT, '.tmp'), { recursive: true, force: true });
      removed = true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (!removed) {
    dataDir = `${DATA_DIR}-${process.pid}-${Date.now()}`;
    log(`  .tmp is locked; using ${path.basename(dataDir)} instead`);
  }
  await mkdir(dataDir, { recursive: true });

  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    // Supabase clusters are UTF8. Without this, initdb inherits the Windows
    // locale (WIN1252 here) and every Georgian string in seed.sql fails with
    // "has no equivalent in encoding WIN1252" -- a harness artefact, not a
    // defect in the SQL.
    initdbFlags: ['--encoding=UTF8', '--no-locale'],
    onLog: (m) => log(String(m).trimEnd()),
    onError: () => {},
  });

  await server.initialise();
  await server.start();

  const admin = new pg.Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await admin.connect();

  const applied = [];
  const run = async (label, file) => {
    const sql = await readFile(file, 'utf8');
    try {
      await admin.query(sql);
      applied.push({ label, ok: true });
      log(`  applied ${label}`);
    } catch (error) {
      applied.push({ label, ok: false, error });
      throw new Error(
        `${label} failed to apply: ${error.message}` +
          (error.position ? ` (character ${error.position})` : '') +
          (error.detail ? `\n  detail: ${error.detail}` : '') +
          (error.hint ? `\n  hint: ${error.hint}` : ''),
        { cause: error },
      );
    }
  };

  await run('bootstrap.sql', path.join(HERE, 'bootstrap.sql'));

  const migrationsDir = path.join(SUPABASE_DIR, 'migrations');
  const migrations = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (migrations.length === 0) throw new Error('no migrations found');
  for (const file of migrations) {
    await run(`migrations/${file}`, path.join(migrationsDir, file));
  }

  const seedPath = path.join(SUPABASE_DIR, 'seed.sql');
  if (!existsSync(seedPath)) throw new Error('supabase/seed.sql is missing');
  await run('seed.sql', seedPath);
  const seedCountsFirst = await tableCounts(admin);

  // Prove the seed is genuinely re-runnable, exactly as README.md promises.
  // Re-runnable means "lands on the same data", not merely "does not raise" --
  // a seed that doubled every row would still not raise.
  await run('seed.sql (second run)', seedPath);
  const seedCountsSecond = await tableCounts(admin);

  await admin.query(FIXTURE_SQL);
  log('  applied test fixtures (second family + storage objects)');

  await admin.query(HELPER_FIXTURE_SQL);
  log('  applied helper fixtures (second child in family 2 + three helpers)');

  return {
    admin,
    migrations,
    applied,
    seedCountsFirst,
    seedCountsSecond,
    async stop() {
      try {
        await admin.end();
      } catch {
        /* already closed */
      }
      // `persistent: false` makes embedded-postgres delete the data directory
      // inside stop(), and on Windows that races the handle the postmaster has
      // only just released — it throws EBUSY and node:test reports the whole
      // file as failed even though every assertion passed. The server is down
      // either way; cleaning up is our job below.
      try {
        await server.stop();
      } catch (error) {
        if (error?.code !== 'EBUSY' && error?.code !== 'ENOTEMPTY') throw error;
      }
      // Windows keeps a handle on the data directory for a moment after the
      // postmaster exits; a failed cleanup must not fail the test run.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await rm(path.join(REPO_ROOT, '.tmp'), { recursive: true, force: true });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    },
  };
}

// =============================================================================
// Impersonation
// =============================================================================

/**
 * Wraps a pg Client with the impersonation the tests need.
 *
 * Every test runs inside one transaction that is rolled back at the end, so the
 * seeded database is identical for the next test. `set local` is used for both
 * ROLE and the JWT claims, so both revert with the transaction.
 */
export class Session {
  constructor(client) {
    this.client = client;
    this.open = false;
  }

  async begin() {
    await this.client.query('begin');
    this.open = true;
  }

  async rollback() {
    if (!this.open) return;
    await this.client.query('rollback');
    this.open = false;
  }

  /**
   * Impersonate a signed-in Supabase user, the way PostgREST does per request:
   *   set local role authenticated;
   *   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
   * auth.uid() then returns <uuid> and every helper in 0003 follows from it.
   */
  async asUser(userId) {
    const claims = JSON.stringify({
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
    });
    await this.client.query('reset role');
    await this.client.query(
      `set local request.jwt.claims = ${sqlLiteral(claims)}`,
    );
    await this.client.query('set local role authenticated');
    return this;
  }

  /** Unauthenticated PostgREST request: role anon, an anon JWT, no sub. */
  async asAnon() {
    const claims = JSON.stringify({ role: 'anon', aud: 'authenticated' });
    await this.client.query('reset role');
    await this.client.query(
      `set local request.jwt.claims = ${sqlLiteral(claims)}`,
    );
    await this.client.query('set local role anon');
    return this;
  }

  /**
   * The service_role escape hatch, used for test setup only.
   * BYPASSRLS + no jwt claims, so auth.uid() is null -- which is exactly the
   * "service context" branch every trigger in 0003/0007 checks for.
   */
  async asService() {
    await this.client.query('reset role');
    await this.client.query(`set local request.jwt.claims = ''`);
    await this.client.query('set local role service_role');
    return this;
  }

  async q(sql, params) {
    return this.client.query(sql, params);
  }

  async rows(sql, params) {
    return (await this.client.query(sql, params)).rows;
  }

  async count(sql, params) {
    return (await this.client.query(sql, params)).rows.length;
  }

  /**
   * Runs `sql` expecting PostgreSQL to REJECT it. Returns the error.
   * Throws if the statement succeeded -- a silent success is precisely the
   * failure mode these tests exist to catch.
   *
   * A savepoint keeps the surrounding transaction usable afterwards.
   */
  async expectError(sql, params) {
    await this.client.query('savepoint sp_expect');
    try {
      const result = await this.client.query(sql, params);
      await this.client.query('release savepoint sp_expect');
      throw new ExpectedRejection(sql, result);
    } catch (error) {
      if (error instanceof ExpectedRejection) throw error;
      await this.client.query('rollback to savepoint sp_expect');
      return error;
    }
  }

  /** Runs `sql` expecting it to succeed but touch zero rows (RLS filtered it). */
  async expectZeroRows(sql, params) {
    const result = await this.client.query(sql, params);
    return result.rowCount;
  }
}

export class ExpectedRejection extends Error {
  constructor(sql, result) {
    super(
      `Statement was expected to be REJECTED but succeeded ` +
        `(rowCount=${result.rowCount}): ${sql.replace(/\s+/g, ' ').trim()}`,
    );
    this.name = 'ExpectedRejection';
  }
}
