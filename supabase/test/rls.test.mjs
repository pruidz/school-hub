// =============================================================================
// SCHOOL-HUB — supabase/test/rls.test.mjs
//
//   npm run test:db
//
// Applies supabase/migrations/0001..* and supabase/seed.sql to a throwaway
// PostgreSQL 18 (embedded-postgres, no Docker) shaped like a Supabase project
// by supabase/test/bootstrap.sql, then attacks it.
//
// Every assertion carries the sentence it proves. "No error" is never good
// enough on its own: a policy that silently returns zero rows and a policy that
// raises are different outcomes, and both are asserted explicitly where they
// differ.
//
// Isolation: each test runs inside one transaction that is rolled back, so the
// seeded database is byte-identical for the next one.
// =============================================================================

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  startDatabase,
  Session,
  ID,
  PUBLIC_TABLES,
  OTHER_CHILD_PREDICATE,
  FAMILY1_PREDICATE,
  FAMILY2_PREDICATE,
} from './harness.mjs';

let db;
let s;

before(async () => {
  db = await startDatabase({ log: () => {} });
  s = new Session(db.admin);
}, { timeout: 180_000 });

after(async () => {
  await db?.stop();
});

/** Wraps a test body in a transaction that is always rolled back. */
function tx(fn) {
  return async (t) => {
    await s.begin();
    try {
      await fn(t);
    } finally {
      await s.rollback();
    }
  };
}

const ALLOWED_TRANSITIONS = new Set([
  'assigned->in_progress',
  'assigned->submitted',
  'in_progress->submitted',
  'redo->in_progress',
]);
const REVIEWER_ONLY_TRANSITIONS = new Set([
  'submitted->approved',
  'submitted->redo',
  'approved->redo',
  'approved->in_progress',
]);
const STATUSES = ['assigned', 'in_progress', 'submitted', 'approved', 'redo'];

// =============================================================================
// 0. The harness itself
// =============================================================================
describe('0. migrations and seed', () => {
  test('every migration and seed.sql applies, in numeric order', () => {
    const labels = db.applied.filter((a) => a.ok).map((a) => a.label);
    assert.ok(
      labels.includes('bootstrap.sql'),
      'proves: the Supabase-shaped bootstrap applied',
    );
    const migrationLabels = labels.filter((l) => l.startsWith('migrations/'));
    assert.deepEqual(
      migrationLabels,
      [...migrationLabels].sort(),
      'proves: migrations were applied in numeric order, as the README requires',
    );
    assert.ok(
      migrationLabels.length >= 8,
      `proves: all ${migrationLabels.length} migration files executed against a real Postgres, ` +
        'not just a reading of them',
    );
    assert.ok(
      labels.includes('seed.sql'),
      'proves: seed.sql runs against the migrated schema',
    );
  });

  test('seed.sql is genuinely re-runnable and lands on identical data', () => {
    assert.deepEqual(
      db.seedCountsSecond,
      db.seedCountsFirst,
      'proves: running seed.sql a second time neither raises nor duplicates a single row ' +
        '(README.md: "running it twice is safe and always lands on the same data")',
    );
    assert.equal(
      db.seedCountsFirst.assignments,
      14,
      'proves: the seed really produced the 14 assignments the README advertises, ' +
        'so the counts above are not both zero',
    );
  });

  test('RLS is enabled on every public table', async () => {
    const { rows } = await db.admin.query(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1`,
    );
    const names = rows.map((r) => r.relname);
    assert.deepEqual(
      [...names].sort(),
      [...PUBLIC_TABLES].sort(),
      'proves: the test list of tables is the actual list of tables, so the ' +
        '"walk every table" tests below really do walk every table',
    );
    for (const row of rows) {
      assert.equal(
        row.relrowsecurity,
        true,
        `proves: RLS is ON for public.${row.relname} — without it every policy below is decoration`,
      );
    }
  });
});

// =============================================================================
// 1. Cross-child reads
// =============================================================================
describe('1. a child cannot read a sibling', () => {
  test(
    'child A sees zero of child B rows on every public table',
    tx(async () => {
      await s.asUser(ID.childAUser);
      for (const table of PUBLIC_TABLES) {
        const predicate = OTHER_CHILD_PREDICATE[table];
        assert.ok(predicate, `no sibling predicate defined for ${table}`);
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${predicate}`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: signed in as child A, public.${table} yields no row belonging to ` +
            `child B (predicate: ${predicate})`,
        );
      }
    }),
  );

  test(
    'the same walk finds child A own rows, so the zeroes above are not an empty database',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const own = {
        profiles: `id = '${ID.childAUser}'`,
        families: `id = '${ID.family1}'`,
        family_members: `user_id = '${ID.childAUser}'`,
        children: `id = '${ID.childA}'`,
        subjects: `child_id = '${ID.childA}'`,
        schedule_slots: `child_id = '${ID.childA}'`,
        lessons: `child_id = '${ID.childA}'`,
        topics: `subject_id = '${ID.aSubject}'`,
        assignments: `child_id = '${ID.childA}'`,
        assignment_events: `assignment_id = '${ID.aApproved}'`,
        messages: `child_id = '${ID.childA}'`,
        attachments: `child_id = '${ID.childA}'`,
      };
      for (const [table, predicate] of Object.entries(own)) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${predicate}`,
        );
        assert.ok(
          rows[0].n > 0,
          `proves: child A really can read their own public.${table} rows ` +
            `(${rows[0].n} found), so test 1 is a real denial and not a broken query`,
        );
      }
    }),
  );

  test(
    'child A sees nothing at all from family 2',
    tx(async () => {
      await s.asUser(ID.childAUser);
      for (const table of PUBLIC_TABLES) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${FAMILY2_PREDICATE[table]}`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: child A cannot read public.${table} rows belonging to an unrelated family`,
        );
      }
    }),
  );
});

// =============================================================================
// 2. Privilege escalation — the 0007 fix
// =============================================================================
describe('2. profiles.role is not self-writable', () => {
  test(
    "child A cannot UPDATE their own profiles.role to 'parent'",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `update public.profiles set role = 'parent' where id = '${ID.childAUser}'`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: the escalation is rejected with insufficient_privilege, not silently ' +
          `ignored (got ${error.code}: ${error.message})`,
      );
      assert.match(
        error.message,
        /permission denied for table profiles/,
        'proves: it is the COLUMN-LEVEL GRANT from 0007 section 1 that stops it — the ' +
          'UPDATE never even reaches a policy or a trigger',
      );

      const { rows } = await s.q(
        `select role from public.profiles where id = '${ID.childAUser}'`,
      );
      assert.equal(
        rows[0].role,
        'child',
        'proves: the role on disk is unchanged, so public.is_parent() is still false for them',
      );
    }),
  );

  test(
    'the trigger still refuses the role change even with the column grant widened back',
    tx(async () => {
      // 0007 deliberately installs TWO guards. If a future migration re-runs
      // 0004 (which hands `authenticated` a table-wide UPDATE), the grant is
      // gone but profiles_guard_identity() must still hold the line. This is
      // the second guard on its own.
      await s.q('reset role');
      await s.q('grant update on public.profiles to authenticated');

      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `update public.profiles set role = 'parent' where id = '${ID.childAUser}'`,
      );
      assert.equal(error.code, '42501');
      assert.match(
        error.message,
        /profiles\.role can only be changed by the service role/,
        'proves: public.profiles_guard_identity() is an independent second guard — ' +
          're-running 0004 after 0007 does not reopen the hole',
      );
    }),
  );

  test(
    'child A can still update their own display_name, which is the whole point of the column grant',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const result = await s.q(
        `update public.profiles set display_name = 'ნიკუშა' where id = '${ID.childAUser}'`,
      );
      assert.equal(
        result.rowCount,
        1,
        'proves: locking role did not lock the user out of their own profile',
      );
    }),
  );

  test(
    'child A cannot change another user profiles row either',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const result = await s.q(
        `update public.profiles set display_name = 'x' where id = '${ID.parent1User}'`,
      );
      assert.equal(
        result.rowCount,
        0,
        'proves: profiles_update_self confines the write to id = auth.uid()',
      );
    }),
  );

  test(
    'handle_new_user() takes the role from app metadata, not from forgeable user metadata',
    tx(async () => {
      // 0007 section 4. raw_user_meta_data is whatever the client passed to
      // signUp(); raw_app_meta_data needs the service role.
      await s.q('reset role');
      const id = '0a000000-0000-4000-8000-0000000000aa';
      await s.q(
        `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data,
                                 raw_user_meta_data, created_at, updated_at)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated',
                 'authenticated', 'forged@school-hub.test',
                 '{"role":"child"}'::jsonb,
                 '{"role":"parent","display_name":"Forged"}'::jsonb, now(), now())`,
        [id],
      );
      const { rows } = await s.q(
        'select role from public.profiles where id = $1',
        [id],
      );
      assert.equal(
        rows[0].role,
        'child',
        'proves: a signup that claims {"role":"parent"} in user metadata still lands as ' +
          "'child' when app metadata says child — the forgeable field loses",
      );
    }),
  );
});

// =============================================================================
// 3. Approve / redo are reviewer-only
// =============================================================================
describe('3. a child cannot review their own work', () => {
  for (const target of ['approved', 'redo']) {
    test(
      `child A cannot set their own submitted assignment to '${target}'`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const error = await s.expectError(
          `update public.assignments set status = '${target}' where id = '${ID.aSubmitted}'`,
        );
        assert.equal(
          error.code,
          '42501',
          `proves: '${target}' is refused with insufficient_privilege`,
        );
        assert.match(
          error.message,
          /Only a parent \(or a helper with review rights\) may set status to/,
          'proves: it is assignments_status_guard() that refuses, by role, not by luck',
        );

        const { rows } = await s.q(
          `select status, reviewed_by, reviewed_at from public.assignments where id = '${ID.aSubmitted}'`,
        );
        assert.equal(rows[0].status, 'submitted');
        assert.equal(
          rows[0].reviewed_by,
          null,
          'proves: no half-applied review — status, reviewed_by and reviewed_at are untouched',
        );
      }),
    );
  }

  test(
    'child A cannot reopen an assignment their parent already approved',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `update public.assignments set status = 'in_progress' where id = '${ID.aApproved}'`,
      );
      assert.equal(error.code, '42501');
      assert.match(
        error.message,
        /may reopen an approved assignment/,
        'proves: approved work is final for the child — only a reviewer may correct it',
      );
    }),
  );
});

// =============================================================================
// 4. The column lock — both halves
// =============================================================================
describe('4. what a child may and may not change on their own assignment', () => {
  const FORBIDDEN = {
    due_date: `date '2030-01-01'`,
    title: `'homework I invented'`,
    source_ref: `'book p.1, exercise 1'`,
    subject_id: `'${ID.aSubject}'::uuid`,
    priority: `1`,
    description: `'rewritten'`,
    due_time: `time '23:59'`,
    topic_id: `null`,
    lesson_id: `'${ID.aLesson}'::uuid`,
    review_comment: `'looks great to me'`,
    reviewed_by: `'${ID.childAUser}'::uuid`,
    reviewed_at: `now()`,
    redo_count: `9`,
    submitted_at: `now()`,
  };
  // NOTE: every value above is deliberately DIFFERENT from what the seeded row
  // holds. The guard compares with IS DISTINCT FROM, so writing a column's own
  // current value back is a no-op and is allowed — see the test at the end of
  // this block, which pins that behaviour down rather than leaving it a trap
  // for the next person to write `set redo_count = 0` and see it pass.

  for (const [column, value] of Object.entries(FORBIDDEN)) {
    test(
      `child A cannot change assignments.${column} on their own assignment`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const before = await s.q(
          `select ${column} from public.assignments where id = '${ID.aAssigned}'`,
        );
        const error = await s.expectError(
          `update public.assignments set ${column} = ${value} where id = '${ID.aAssigned}'`,
        );
        assert.equal(
          error.code,
          '42501',
          `proves: assignments.${column} is immutable for the child it belongs to ` +
            `(got ${error.code}: ${error.message})`,
        );
        const after = await s.q(
          `select ${column} from public.assignments where id = '${ID.aAssigned}'`,
        );
        assert.deepEqual(
          after.rows[0],
          before.rows[0],
          `proves: assignments.${column} is byte-identical afterwards`,
        );
      }),
    );
  }

  test(
    "child A CAN hand in homework: status='submitted' plus self_rating, difficulty_note, minutes_spent",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows, rowCount } = await s.q(
        `update public.assignments
            set status = 'submitted',
                self_rating = 4,
                difficulty_note = 'the third one was hard',
                minutes_spent = 33
          where id = '${ID.aAssigned}'
        returning status, self_rating, difficulty_note, minutes_spent,
                  submitted_at is not null as stamped`,
      );
      assert.equal(rowCount, 1, 'proves: the update was not filtered away by RLS');
      assert.deepEqual(
        rows[0],
        {
          status: 'submitted',
          self_rating: 4,
          difficulty_note: 'the third one was hard',
          minutes_spent: 33,
          stamped: true,
        },
        'proves: a nine-year-old can actually hand in homework — the column lock does not ' +
          'catch the one write the whole app exists for, and submitted_at is stamped by the trigger',
      );
    }),
  );

  test(
    'child A can set self_rating / difficulty_note / minutes_spent without touching status',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `update public.assignments
            set self_rating = 2, difficulty_note = 'still stuck', minutes_spent = 5
          where id = '${ID.aInProgress}'`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: the self-assessment fields are writable mid-flight, not only at submission',
      );
    }),
  );

  test(
    "child A cannot start work on a SIBLING's assignment",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `update public.assignments set status = 'in_progress' where id = '${ID.bAssigned}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: assignments_update_own filters the sibling row out of the UPDATE entirely ' +
          '(0 rows, no trigger involved)',
      );
    }),
  );

  test(
    'child A cannot DELETE their own assignment',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from public.assignments where id = '${ID.aAssigned}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: there is no DELETE policy for a child on assignments, so homework cannot ' +
          'be made to disappear',
      );
    }),
  );

  test(
    'writing a locked column back to its own current value is a no-op and is allowed',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `update public.assignments set redo_count = 0, lesson_id = null
          where id = '${ID.aAssigned}'`,
      );
      assert.equal(
        rowCount,
        1,
        'proves (and documents): the column lock is IS DISTINCT FROM, so a client that ' +
          'round-trips the whole row unchanged is not rejected. No value changes, so this ' +
          'is not a hole — but a test that sets a locked column to the value it already ' +
          'has proves nothing, and this is the note saying so',
      );
    }),
  );

  test(
    'child A cannot insert an assignment that starts life reviewed',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `insert into public.assignments (child_id, title, status)
         values ('${ID.childA}', 'already done', 'approved')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: assignments_insert_own pins a child-created assignment to ' +
          "status='assigned', so the status machine cannot be skipped at INSERT time",
      );
    }),
  );
});

// =============================================================================
// 5. children is read-only for the child
// =============================================================================
describe('5. a child cannot touch their own children row', () => {
  const ATTACKS = {
    'clear the PIN lockout counter': `pin_attempts = 0`,
    'clear the PIN lockout expiry': `pin_locked_until = null`,
    'turn their own statistics on': `show_own_stats = true`,
    'switch out of the simple UI': `ui_mode = 'full'`,
    'mint themselves an invite code': `invite_code = 'AAAAAA'`,
    'overwrite their PIN hash': `pin_hash = 'x'`,
  };

  for (const [what, assignment] of Object.entries(ATTACKS)) {
    test(
      `child A cannot ${what}`,
      tx(async () => {
        await s.asService();
        await s.q(
          `update public.children
              set pin_attempts = 5, pin_locked_until = now() + interval '15 minutes'
            where id = '${ID.childA}'`,
        );

        await s.asUser(ID.childAUser);
        const { rowCount } = await s.q(
          `update public.children set ${assignment} where id = '${ID.childA}'`,
        );
        assert.equal(
          rowCount,
          0,
          `proves: the UPDATE matches ZERO rows — a child has no UPDATE policy on children ` +
            `at all, so "${assignment}" is filtered out before it is evaluated`,
        );

        // Zero rows is the mechanism; unchanged data is the guarantee. Assert both.
        await s.asService();
        const { rows } = await s.q(
          `select pin_attempts, pin_locked_until is not null as locked,
                  show_own_stats, ui_mode, invite_code, pin_hash is not null as has_pin
             from public.children where id = '${ID.childA}'`,
        );
        assert.deepEqual(
          rows[0],
          {
            pin_attempts: 5,
            locked: true,
            show_own_stats: false,
            ui_mode: 'simple',
            invite_code: null,
            has_pin: true,
          },
          'proves: the lockout still stands and every parent-controlled column is unchanged',
        );
      }),
    );
  }

  test(
    'the PARENT can clear the same lockout, which is what /parent/children relies on',
    tx(async () => {
      await s.asService();
      await s.q(
        `update public.children
            set pin_attempts = 5, pin_locked_until = now() + interval '15 minutes'
          where id = '${ID.childA}'`,
      );
      await s.asUser(ID.parent1User);
      const { rowCount } = await s.q(
        `update public.children set pin_attempts = 0, pin_locked_until = null
          where id = '${ID.childA}'`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: test 5 blocks the child specifically, not everyone — the parent-side ' +
          'unlock flow still works',
      );
    }),
  );

  test(
    'child A can read their own children row (the app needs ui_mode and name)',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(
        `select ui_mode from public.children where id = '${ID.childA}'`,
      );
      assert.equal(
        rows.length,
        1,
        'proves: children_select_self still grants the read the kid UI depends on',
      );
    }),
  );
});

// =============================================================================
// 6. Cross-child writes — the other 0007 fix
// =============================================================================
describe('6. a child cannot write into a sibling thread', () => {
  test(
    "child A cannot INSERT a message onto child B's assignment, even sending their own child_id",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `insert into public.messages (assignment_id, child_id, author_id, body)
         values ('${ID.bSubmitted}', '${ID.childA}', '${ID.childAUser}', 'planted')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: the exact payload 0007 section 2 describes — sibling assignment_id with ' +
          'my own child_id — is rejected, not accepted',
      );
      assert.match(
        error.message,
        /new row violates row-level security policy for table "messages"/,
        'proves: resolve_message_child_id() overwrote the submitted child_id with the ' +
          "OWNING child's id, and WITH CHECK then rejected it",
      );

      await s.asService();
      const { rows } = await s.q(
        `select count(*)::int as n from public.messages
          where assignment_id = '${ID.bSubmitted}' and body = 'planted'`,
      );
      assert.equal(rows[0].n, 0, "proves: nothing landed in child B's thread");
    }),
  );

  test(
    "child A cannot INSERT an attachment onto child B's assignment",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `insert into public.attachments (assignment_id, child_id, kind, storage_path)
         values ('${ID.bSubmitted}', '${ID.childA}', 'solution', 'planted/x/y.webp')`,
      );
      assert.equal(error.code, '42501');
      assert.match(
        error.message,
        /new row violates row-level security policy for table "attachments"/,
        'proves: a photo cannot be planted in a sibling submission',
      );
    }),
  );

  test(
    "child A cannot walk an existing attachment of theirs over to child B's assignment",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `update public.attachments set assignment_id = '${ID.bSubmitted}'
          where id = 'a1000000-0000-4000-8000-000000000002'`,
      );
      assert.equal(error.code, '42501');
      assert.match(
        error.message,
        /attachments ownership columns are immutable/,
        'proves: attachments_guard_owner() (0007) covers the UPDATE path that ' +
          'attachments_update_own alone would have let through',
      );
    }),
  );

  test(
    'child A CAN post on their own assignment, and child_id / author_id are derived',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(
        `insert into public.messages (assignment_id, child_id, author_id, body)
         values ('${ID.aSubmitted}', '${ID.childB}', '${ID.parent1User}', 'hi')
         returning child_id, author_id`,
      );
      assert.equal(
        rows[0].child_id,
        ID.childA,
        'proves: even a LYING child_id is discarded and re-derived from the assignment',
      );
      assert.equal(
        rows[0].author_id,
        ID.childAUser,
        'proves: a child cannot forge author_id to make a message look like the parent',
      );
    }),
  );

  test(
    'child A cannot edit a message their parent wrote',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `update public.messages set body = 'no homework today'
          where id = 'd1000000-0000-4000-8000-000000000002'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: messages_update_author requires author_id = auth.uid(), so the parent ' +
          "side of the chat cannot be rewritten",
      );
    }),
  );

  test(
    'nobody can INSERT into assignment_events by hand',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const childError = await s.expectError(
        `insert into public.assignment_events (assignment_id, to_status)
         values ('${ID.aAssigned}', 'approved')`,
      );
      assert.equal(childError.code, '42501');

      await s.asUser(ID.parent1User);
      const parentError = await s.expectError(
        `insert into public.assignment_events (assignment_id, to_status)
         values ('${ID.aAssigned}', 'approved')`,
      );
      assert.equal(
        parentError.code,
        '42501',
        'proves: assignment_events is append-only FOR EVERYONE — the audit trail can only ' +
          'be written by the SECURITY DEFINER triggers, so it cannot be doctored',
      );
    }),
  );
});

// =============================================================================
// 7. grades
// =============================================================================
describe('7. grades are invisible to a child', () => {
  test(
    'child A selects zero grades, including their own',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const all = await s.q('select count(*)::int as n from public.grades');
      assert.equal(
        all.rows[0].n,
        0,
        'proves: an unfiltered select on grades returns nothing for a child — there is no ' +
          'child policy of any kind on the table (SPEC section 2)',
      );
      const own = await s.q(
        `select count(*)::int as n from public.grades where child_id = '${ID.childA}'`,
      );
      assert.equal(
        own.rows[0].n,
        0,
        "proves: not even the child's OWN grades are readable",
      );
    }),
  );

  test(
    'the grades the child cannot see do exist',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const { rows } = await s.q(
        `select count(*)::int as n from public.grades where child_id = '${ID.childA}'`,
      );
      assert.ok(
        rows[0].n > 0,
        `proves: ${rows[0].n} grade rows exist for child A, so test 7 above is a real ` +
          'denial and not an empty table',
      );
    }),
  );

  test(
    'child A cannot write themselves a grade either',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `insert into public.grades (child_id, date, value)
         values ('${ID.childA}', current_date, 10)`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: grades is parent-only for writes as well as reads',
      );
    }),
  );
});

// =============================================================================
// 8. topic_mastery
// =============================================================================
describe('8. topic_mastery follows children.show_own_stats', () => {
  test(
    'child A (show_own_stats = false) sees no mastery rows',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(
        'select count(*)::int as n from public.topic_mastery',
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: with show_own_stats off, child_stats_visible() is false and the child sees ' +
          'nothing, even though their own mastery rows exist',
      );
    }),
  );

  test(
    'child B (show_own_stats = true) sees their own mastery rows and only those',
    tx(async () => {
      await s.asUser(ID.childBUser);
      const own = await s.q(
        `select count(*)::int as n from public.topic_mastery where child_id = '${ID.childB}'`,
      );
      assert.ok(
        own.rows[0].n > 0,
        'proves: flipping show_own_stats on really does reveal the rows — the test above is ' +
          'about the flag, not about an empty table',
      );
      const all = await s.q('select count(*)::int as n from public.topic_mastery');
      assert.equal(
        all.rows[0].n,
        own.rows[0].n,
        "proves: child B still sees none of child A's mastery rows",
      );
    }),
  );

  test(
    'flipping show_own_stats for child A changes the answer immediately',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const before = await s.q(
        'select count(*)::int as n from public.topic_mastery',
      );
      await s.asService();
      await s.q(
        `update public.children set show_own_stats = true where id = '${ID.childA}'`,
      );
      await s.asUser(ID.childAUser);
      const after = await s.q(
        'select count(*)::int as n from public.topic_mastery',
      );
      assert.equal(before.rows[0].n, 0);
      assert.ok(
        after.rows[0].n > 0,
        'proves: the policy reads children.show_own_stats live — it is the flag doing the ' +
          'work, not a coincidence of the seed data',
      );
    }),
  );
});

// =============================================================================
// 9. Storage
// =============================================================================
describe('9. storage: the first path segment is the fence', () => {
  const PATHS = {
    'assignment evidence {child}/{assignment}/x.webp': (child, second) =>
      `${child}/${second}/9-${Math.random().toString(16).slice(2)}.webp`,
    'lesson evidence {child}/lesson/{lesson}/x.webp': (child) =>
      `${child}/lesson/${ID.aLesson}/9-${Math.random().toString(16).slice(2)}.webp`,
  };

  for (const [shape, build] of Object.entries(PATHS)) {
    test(
      `child A can INSERT under their own prefix — ${shape}`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const name = build(ID.childA, ID.aAssigned);
        const { rowCount } = await s.q(
          `insert into storage.objects (bucket_id, name, owner)
           values ('evidence', $1, '${ID.childAUser}')`,
          [name],
        );
        assert.equal(
          rowCount,
          1,
          `proves: a child can upload their own evidence at ${name} — storage_child_id() ` +
            'reads the first segment and it matches my_child_id()',
        );
      }),
    );

    test(
      `child A cannot INSERT under child B prefix — ${shape}`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const name = build(ID.childB, ID.bAssigned);
        const error = await s.expectError(
          `insert into storage.objects (bucket_id, name, owner)
           values ('evidence', $1, '${ID.childAUser}')`,
          [name],
        );
        assert.equal(
          error.code,
          '42501',
          `proves: ${name} is refused — both path shapes are covered by the single ` +
            'first-segment policy, as 0005 claims',
        );
      }),
    );
  }

  test(
    'child A can SELECT their own objects and none of child B objects',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const own = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childA}/%'`,
      );
      assert.ok(
        own.rows[0].n >= 2,
        `proves: child A reads their own evidence (${own.rows[0].n} objects, covering both ` +
          'path shapes)',
      );
      const sibling = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childB}/%'`,
      );
      assert.equal(
        sibling.rows[0].n,
        0,
        "proves: child B's photos are invisible to child A (TESTING.md check ბ.6)",
      );
      const total = await s.q('select count(*)::int as n from storage.objects');
      assert.equal(
        total.rows[0].n,
        own.rows[0].n,
        'proves: an unfiltered listing shows child A nothing but their own objects',
      );
    }),
  );

  test(
    'child A cannot rename one of their own objects into child B prefix',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `update storage.objects set name = $1 where name = $2`,
        [
          `${ID.childB}/${ID.bAssigned}/stolen.webp`,
          `${ID.childA}/${ID.aAssigned}/seed-a.webp`,
        ],
      );
      assert.equal(
        error.code,
        '42501',
        'proves: evidence_child_update WITH CHECK re-evaluates the NEW name, so the fence ' +
          'cannot be crossed by renaming',
      );
    }),
  );

  test(
    'child A cannot DELETE child B objects',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from storage.objects where name like '${ID.childB}/%'`,
      );
      assert.equal(
        rowCount,
        0,
        "proves: a child cannot delete a sibling's evidence",
      );
    }),
  );

  test(
    'the parent reaches both children evidence and nothing from family 2',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const a = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childA}/%'`,
      );
      const b = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childB}/%'`,
      );
      const c = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childC}/%'`,
      );
      assert.ok(a.rows[0].n > 0 && b.rows[0].n > 0, 'proves: evidence_parent_all spans the family');
      assert.equal(
        c.rows[0].n,
        0,
        'proves: it stops at the family boundary',
      );
    }),
  );
});

// =============================================================================
// 10. The full status machine, driven from a table
// =============================================================================
describe('10. the status machine, every from x to x role', () => {
  const CASES = [];
  for (const actor of ['child', 'parent']) {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to) continue;
        const key = `${from}->${to}`;
        let expected;
        if (ALLOWED_TRANSITIONS.has(key)) expected = 'allowed';
        else if (REVIEWER_ONLY_TRANSITIONS.has(key))
          expected = actor === 'parent' ? 'allowed' : 'reviewer-only';
        else expected = 'illegal';
        CASES.push({ actor, from, to, key, expected });
      }
    }
  }

  for (const c of CASES) {
    const title =
      `${c.actor}: ${c.key} is ` +
      { allowed: 'ALLOWED', 'reviewer-only': 'refused (reviewer only)', illegal: 'refused (not in the machine)' }[
        c.expected
      ];

    test(
      title,
      tx(async () => {
        // A brand-new assignment in the `from` state. Built with INSERT rather
        // than by UPDATEing a seeded row, because UPDATE would itself have to
        // pass the status machine to get there.
        await s.asService();
        const inserted = await s.q(
          `insert into public.assignments (child_id, subject_id, title, status, created_by)
           values ($1, $2, $3, $4, $5) returning id`,
          [ID.childA, ID.aSubject, `matrix ${c.actor} ${c.key}`, c.from, ID.parent1User],
        );
        const id = inserted.rows[0].id;

        await s.asUser(c.actor === 'child' ? ID.childAUser : ID.parent1User);

        if (c.expected === 'allowed') {
          const { rowCount, rows } = await s.q(
            `update public.assignments set status = $1 where id = $2 returning status`,
            [c.to, id],
          );
          assert.equal(rowCount, 1, `proves: a ${c.actor} may perform ${c.key}`);
          assert.equal(
            rows[0].status,
            c.to,
            `proves: the row really is in '${c.to}' afterwards`,
          );
        } else {
          const error = await s.expectError(
            `update public.assignments set status = $1 where id = $2`,
            [c.to, id],
          );
          const expectedCode = c.expected === 'illegal' ? '23514' : '42501';
          assert.equal(
            error.code,
            expectedCode,
            `proves: ${c.key} raises ${expectedCode} for a ${c.actor} ` +
              `(${c.expected === 'illegal' ? 'not a legal edge of the machine' : 'legal edge, wrong role'}) ` +
              `— got ${error.code}: ${error.message}`,
          );
          const { rows } = await s.q(
            'select status from public.assignments where id = $1',
            [id],
          );
          assert.equal(
            rows[0].status,
            c.from,
            `proves: the assignment is still '${c.from}' — the refusal rolled the whole statement back`,
          );
        }
      }),
    );
  }
});

// =============================================================================
// 11. redo_count and the audit trail
// =============================================================================
describe('11. redo_count and assignment_events', () => {
  test(
    'redo -> in_progress increments redo_count by exactly one',
    tx(async () => {
      await s.asService();
      const before = await s.q(
        `select redo_count from public.assignments where id = '${ID.aRedo}'`,
      );
      await s.asUser(ID.childAUser);
      const after = await s.q(
        `update public.assignments set status = 'in_progress'
          where id = '${ID.aRedo}' returning redo_count`,
      );
      assert.equal(
        after.rows[0].redo_count,
        before.rows[0].redo_count + 1,
        `proves: redo_count went ${before.rows[0].redo_count} -> ${after.rows[0].redo_count}, ` +
          'computed by the trigger even though the child may not write the column itself',
      );
    }),
  );

  test(
    'an assignment_events row is appended for every transition, with actor and from/to',
    tx(async () => {
      await s.asService();
      await s.q(
        `delete from public.assignment_events where assignment_id = '${ID.aAssigned}'`,
      );

      await s.asUser(ID.childAUser);
      await s.q(
        `update public.assignments set status = 'in_progress' where id = '${ID.aAssigned}'`,
      );
      await s.q(
        `update public.assignments set status = 'submitted' where id = '${ID.aAssigned}'`,
      );
      await s.asUser(ID.parent1User);
      await s.q(
        `update public.assignments set status = 'approved', review_comment = 'well done'
          where id = '${ID.aAssigned}'`,
      );

      await s.asService();
      // Ordered by physical insertion order: every event in one transaction gets
      // the same created_at (now() is the transaction timestamp), so created_at
      // cannot order them. See the report note on this.
      const { rows } = await s.q(
        `select from_status, to_status, comment, actor_id
           from public.assignment_events
          where assignment_id = '${ID.aAssigned}' order by ctid`,
      );
      assert.deepEqual(
        rows.map((r) => `${r.from_status}->${r.to_status}`),
        ['assigned->in_progress', 'in_progress->submitted', 'submitted->approved'],
        'proves: one audit row per transition, in order, none skipped',
      );
      assert.deepEqual(
        rows.map((r) => r.actor_id),
        [ID.childAUser, ID.childAUser, ID.parent1User],
        'proves: the audit records WHO — the child for the two kid steps, the parent for the review',
      );
      assert.equal(
        rows[2].comment,
        'well done',
        'proves: the review comment is captured on the decision row',
      );
    }),
  );

  test(
    'a second redo with IDENTICAL wording still logs its comment',
    tx(async () => {
      const COMMENT = 'გაასწორე მესამე მაგალითი.';
      await s.asService();
      await s.q(
        `delete from public.assignment_events where assignment_id = '${ID.aSubmitted}'`,
      );

      await s.asUser(ID.parent1User);
      await s.q(
        `update public.assignments set status = 'redo', review_comment = $1 where id = $2`,
        [COMMENT, ID.aSubmitted],
      );
      await s.asUser(ID.childAUser);
      await s.q(
        `update public.assignments set status = 'in_progress' where id = $1`,
        [ID.aSubmitted],
      );
      await s.q(`update public.assignments set status = 'submitted' where id = $1`, [
        ID.aSubmitted,
      ]);
      await s.asUser(ID.parent1User);
      // review_comment is byte-identical to the one already on the row, so
      // `new.review_comment is distinct from old.review_comment` is FALSE.
      await s.q(
        `update public.assignments set status = 'redo', review_comment = $1 where id = $2`,
        [COMMENT, ID.aSubmitted],
      );

      await s.asService();
      const { rows } = await s.q(
        `select from_status, to_status, comment from public.assignment_events
          where assignment_id = $1 order by ctid`,
        [ID.aSubmitted],
      );
      const redos = rows.filter((r) => r.to_status === 'redo');
      assert.equal(
        redos.length,
        2,
        'proves: both rejections are on the record',
      );
      assert.deepEqual(
        redos.map((r) => r.comment),
        [COMMENT, COMMENT],
        'proves: the SECOND redo logs its comment even though the wording did not change — ' +
          'de-duplicating it would have hidden the second rejection from the parent ' +
          '(the trigger fix in 0003/0007: on a review decision the comment is always recorded)',
      );

      const rc = await s.q(
        'select redo_count from public.assignments where id = $1',
        [ID.aSubmitted],
      );
      assert.equal(
        rc.rows[0].redo_count,
        1,
        'proves: redo_count counted the one redo->in_progress that actually happened, ' +
          'not the number of redo decisions',
      );
    }),
  );
});

// =============================================================================
// 12. Family boundary for a parent
// =============================================================================
describe('12. a parent is confined to their own family', () => {
  test(
    'parent 1 reads every table in family 1',
    tx(async () => {
      await s.asUser(ID.parent1User);
      for (const table of PUBLIC_TABLES) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${FAMILY1_PREDICATE[table]}`,
        );
        assert.ok(
          rows[0].n > 0,
          `proves: the parent reaches public.${table} for their own family (${rows[0].n} rows)`,
        );
      }
    }),
  );

  test(
    'parent 1 reads nothing from family 2, on any table',
    tx(async () => {
      await s.asUser(ID.parent1User);
      for (const table of PUBLIC_TABLES) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${FAMILY2_PREDICATE[table]}`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: public.${table} leaks no row of an unrelated family to parent 1`,
        );
      }
    }),
  );

  test(
    'family 2 is not empty, so the zeroes above mean something',
    tx(async () => {
      await s.asUser(ID.parent2User);
      for (const table of PUBLIC_TABLES) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${FAMILY2_PREDICATE[table]}`,
        );
        assert.ok(
          rows[0].n > 0,
          `proves: public.${table} does hold family-2 rows, and parent 2 can see them ` +
            '(so test 12 is symmetric, not an artefact of missing fixtures)',
        );
      }
    }),
  );

  test(
    'parent 1 cannot WRITE into family 2 either',
    tx(async () => {
      await s.asUser(ID.parent1User);

      for (const [what, sql] of [
        ['rename their child', `update public.children set name = 'x' where id = '${ID.childC}'`],
        ['retitle an assignment', `update public.assignments set title = 'x' where id = '${ID.cAssignment}'`],
        ['approve their homework', `update public.assignments set status = 'approved' where id = '${ID.cAssignment}'`],
        ['delete their child', `delete from public.children where id = '${ID.childC}'`],
        ['edit their chat', `update public.messages set body = 'x' where id = '${ID.cMessage}'`],
        ['clear their PIN lockout', `update public.children set pin_attempts = 0 where id = '${ID.childC}'`],
      ]) {
        const { rowCount } = await s.q(sql);
        assert.equal(
          rowCount,
          0,
          `proves: parent 1 cannot ${what} in family 2 — the row is not visible to the ` +
            'UPDATE/DELETE at all',
        );
      }

      for (const [what, sql] of [
        ['add a subject', `insert into public.subjects (child_id, name) values ('${ID.childC}', 'x')`],
        ['add a grade', `insert into public.grades (child_id, date, value) values ('${ID.childC}', current_date, 5)`],
        ['add an assignment', `insert into public.assignments (child_id, title) values ('${ID.childC}', 'x')`],
        ['add a child', `insert into public.children (family_id, name) values ('${ID.family2}', 'x')`],
      ]) {
        const error = await s.expectError(sql);
        assert.equal(
          error.code,
          '42501',
          `proves: parent 1 cannot ${what} in family 2 — WITH CHECK rejects it outright`,
        );
      }
    }),
  );

  test(
    'parent 1 cannot make themselves a member of family 2',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const error = await s.expectError(
        `insert into public.family_members (family_id, user_id, role)
         values ('${ID.family2}', '${ID.parent1User}', 'parent')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: family_members_insert_parent requires ownership of the target family, so ' +
          'a parent cannot join their way into someone else data',
      );
    }),
  );
});

// =============================================================================
// 13. anon
// =============================================================================
describe('13. anon is denied, not merely empty', () => {
  for (const table of PUBLIC_TABLES) {
    test(
      `anon gets permission denied on public.${table}`,
      tx(async () => {
        await s.asAnon();
        const error = await s.expectError(`select * from public.${table} limit 1`);
        assert.equal(
          error.code,
          '42501',
          `proves: public.${table} raises insufficient_privilege for an unauthenticated ` +
            'PostgREST request — the privilege is revoked, not merely unmatched by a policy. ' +
            'An empty 200 would tell an attacker the table exists and is readable-in-principle; ' +
            `this is a 401/403. Got ${error.code}: ${error.message}`,
        );
        assert.match(
          error.message,
          new RegExp(`permission denied for table ${table}`),
          `proves: the refusal names public.${table} specifically`,
        );
      }),
    );
  }

  test(
    'anon cannot write to any public table either',
    tx(async () => {
      await s.asAnon();
      for (const sql of [
        `insert into public.profiles (id, role) values (gen_random_uuid(), 'parent')`,
        `update public.children set show_own_stats = true`,
        `delete from public.assignments`,
      ]) {
        const error = await s.expectError(sql);
        assert.equal(
          error.code,
          '42501',
          `proves: anon has no write privilege anywhere (${sql.split(' ')[0]})`,
        );
      }
    }),
  );

  test(
    'the anon denial is a privilege, so it survives any future policy mistake',
    tx(async () => {
      const { rows } = await s.q(
        `select t.table_name, p.privilege_type
           from information_schema.tables t
           left join information_schema.role_table_grants p
             on p.table_schema = t.table_schema
            and p.table_name = t.table_name
            and p.grantee = 'anon'
          where t.table_schema = 'public' and t.table_type = 'BASE TABLE'`,
      );
      const leaked = rows.filter((r) => r.privilege_type !== null);
      assert.deepEqual(
        leaked,
        [],
        `proves: the anon role holds ZERO table privileges in the public schema. Bootstrap ` +
          'granted it ALL (as Supabase does by default) and 0004_rls.sql revoked them, so ' +
          'this is the revoke being tested, not an ungranted role. Leaked: ' +
          JSON.stringify(leaked),
      );
    }),
  );
});

// =============================================================================
// 14. Sibling identity (the 0008 fix)
// =============================================================================
describe('14. sibling identity is not enumerable (0008)', () => {
  test(
    "child A cannot read child B's profiles row",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.childBUser}'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: 0008 removed the sibling from profiles_select_self_or_family — before it, ' +
          "child A could read child B's auth user id, role and display_name",
      );
    }),
  );

  test(
    "child A cannot read child B's family_members row",
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.family_members where user_id = '${ID.childBUser}'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: 0008 removed the sibling from family_members_select',
      );
    }),
  );

  test(
    'child A can still read their own profile and the parent profile, which the chat UI needs',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const self = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.childAUser}'`,
      );
      const parent = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.parent1User}'`,
      );
      assert.equal(self.rows[0].n, 1, 'proves: the child still sees their own profile');
      assert.equal(
        parent.rows[0].n,
        1,
        'proves: the parent display_name is still readable, so message and ' +
          'assignment_events author names still render (src/features/messages/queries.ts)',
      );
    }),
  );

  test(
    'the parent still sees every profile and membership in the family',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const profiles = await s.q(
        'select count(*)::int as n from public.profiles',
      );
      const members = await s.q(
        'select count(*)::int as n from public.family_members',
      );
      assert.equal(
        profiles.rows[0].n,
        3,
        'proves: 0008 narrowed the CHILD path only — the parent still sees all three profiles',
      );
      assert.equal(
        members.rows[0].n,
        3,
        'proves: the parent still sees all three memberships',
      );
    }),
  );
});

// =============================================================================
// 15. The helper role (the 0010 migration)
//
// Family 2 has two children, C and D, and three helpers. All three are assigned
// to child C and none to child D, so every "a helper sees only their child"
// assertion below has a real row in the same family to fail against — not an
// empty table and not another family, which the earlier sections already cover.
//
//   helperViewUser     view + comment
//   helperReviewUser   view + comment + review
//   helperRevokedUser  the same as the reviewer, with permissions.revoked_at set
// =============================================================================
describe('15. a helper is scoped to the children they were given (0010)', () => {
  /** The assigned child's rows, per table. */
  const ASSIGNED = {
    subjects: `child_id = '${ID.childC}'`,
    schedule_slots: `child_id = '${ID.childC}'`,
    lessons: `child_id = '${ID.childC}'`,
    topics: `subject_id = '${ID.cSubject}'`,
    assignments: `child_id = '${ID.childC}'`,
    assignment_events: `assignment_id = '${ID.cAssignment}'`,
    messages: `child_id = '${ID.childC}'`,
    attachments: `child_id = '${ID.childC}'`,
  };
  /** The other child of the SAME family. */
  const UNASSIGNED = {
    profiles: `id = '${ID.childDUser}'`,
    family_members: `user_id = '${ID.childDUser}'`,
    children: `id = '${ID.childD}'`,
    subjects: `child_id = '${ID.childD}'`,
    schedule_slots: `child_id = '${ID.childD}'`,
    lessons: `child_id = '${ID.childD}'`,
    topics: `subject_id = '${ID.dSubject}'`,
    assignments: `child_id = '${ID.childD}'`,
    assignment_events: `assignment_id = '${ID.dAssignment}'`,
    messages: `child_id = '${ID.childD}'`,
    attachments: `child_id = '${ID.childD}'`,
    grades: `child_id = '${ID.childD}'`,
  };

  // ---------------------------------------------------------------- 15.1 scope
  test(
    'a helper reads the child they were assigned, on every table that matters',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      for (const [table, predicate] of Object.entries(ASSIGNED)) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${predicate}`,
        );
        assert.ok(
          rows[0].n > 0,
          `proves: the helper really can read public.${table} for child C ` +
            `(${rows[0].n} rows), so every zero below is a denial and not an empty fixture`,
        );
      }
    }),
  );

  test(
    'a helper sees nothing at all belonging to the OTHER child of the same family',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      for (const [table, predicate] of Object.entries(UNASSIGNED)) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${predicate}`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: public.${table} yields no child-D row to a helper invited for child C ` +
            `(predicate: ${predicate}). Same family, same parent, still invisible.`,
        );
      }
    }),
  );

  test(
    'a helper sees nothing at all from an unrelated family',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      for (const table of PUBLIC_TABLES) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${FAMILY1_PREDICATE[table]}`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: public.${table} leaks no family-1 row to a family-2 helper`,
        );
      }
    }),
  );

  test(
    'grades and topic_mastery are invisible to a helper even for their OWN child',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      for (const table of ['grades', 'topic_mastery']) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where child_id = '${ID.childC}'`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: public.${table} has no helper policy at all — a tutor supervises the ` +
            'homework, they are not shown what the school thinks of the child',
        );
      }
    }),
  );

  // ------------------------------------------------- 15.2 children / the view
  test(
    'a helper has no access to public.children at all, so no PIN and no invite code',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      const { rows } = await s.q('select count(*)::int as n from public.children');
      assert.equal(
        rows[0].n,
        0,
        'proves: there is no helper SELECT policy on public.children. RLS is row-level, so ' +
          'any such policy would hand over invite_code (which redeems into the child account) ' +
          'and pin_hash along with the name',
      );
    }),
  );

  test(
    'the helper_children view gives them their child, and carries no secret column',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      const rows = await s.rows('select * from public.helper_children');
      assert.equal(rows.length, 1, 'proves: exactly the one assigned child, not the family');
      assert.equal(rows[0].id, ID.childC, 'proves: and it is child C');

      const columns = Object.keys(rows[0]);
      for (const forbidden of [
        'invite_code',
        'invite_expires_at',
        'pin_hash',
        'pin_attempts',
        'pin_locked_until',
        'ui_mode',
        'show_own_stats',
      ]) {
        assert.ok(
          !columns.includes(forbidden),
          `proves: helper_children does not select children.${forbidden}. It cannot leak ` +
            'through a "select *" in future app code, because the column is not in the view',
        );
      }
      assert.ok(
        columns.includes('name'),
        'proves: the view still carries what the UI needs, so this is a narrowing not a removal',
      );
    }),
  );

  test(
    'the helper_children view is empty for everyone who is not an active helper',
    tx(async () => {
      for (const [who, uid] of [
        ['the family owner', ID.parent2User],
        ['the child themselves', ID.childCUser],
        ['a parent of another family', ID.parent1User],
        ['a revoked helper', ID.helperRevokedUser],
      ]) {
        await s.asUser(uid);
        const { rows } = await s.q(
          'select count(*)::int as n from public.helper_children',
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: helper_children is not a back door for ${who} — its WHERE clause is ` +
            'helper_child_ids(), which is empty for everyone who is not an active helper',
        );
      }
    }),
  );

  // ---------------------------------------------------------- 15.3 reviewing
  test(
    'a helper WITHOUT review rights cannot approve or return work',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      for (const status of ['approved', 'redo']) {
        const { rowCount } = await s.q(
          `update public.assignments set status = '${status}', review_comment = 'x'
            where id = '${ID.cAssignment}'`,
        );
        assert.equal(
          rowCount,
          0,
          `proves: setting ${status} touches no row — assignments_helper_review requires ` +
            'can_review(child_id), so the UPDATE never matches and the trigger is not even reached',
        );
      }
      const { rows } = await s.q(
        `select status from public.assignments where id = '${ID.cAssignment}'`,
      );
      assert.equal(
        rows[0].status,
        'submitted',
        'proves: the assignment is still waiting for a real reviewer',
      );
    }),
  );

  test(
    'a helper WITH review rights can approve, and the audit names them',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      const { rowCount } = await s.q(
        `update public.assignments set status = 'approved', review_comment = 'kargia'
          where id = '${ID.cAssignment}'`,
      );
      assert.equal(rowCount, 1, 'proves: permissions.can_review really does grant the decision');

      const { rows } = await s.q(
        `select status, reviewed_by, reviewed_at, review_comment
           from public.assignments where id = '${ID.cAssignment}'`,
      );
      assert.equal(rows[0].status, 'approved');
      assert.equal(
        rows[0].reviewed_by,
        ID.helperReviewUser,
        'proves: the trigger stamps the helper as the reviewer, so the record names the ' +
          'person who actually decided rather than the parent',
      );
      assert.ok(rows[0].reviewed_at, 'proves: reviewed_at was stamped');

      const events = await s.rows(
        `select actor_id, comment from public.assignment_events
          where assignment_id = '${ID.cAssignment}' and to_status = 'approved'`,
      );
      assert.equal(events.length, 1, 'proves: the decision is in the append-only audit table');
      assert.equal(events[0].actor_id, ID.helperReviewUser);
      assert.equal(events[0].comment, 'kargia');
    }),
  );

  test(
    'review rights are per child: the reviewer cannot approve the child they were not given',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      const { rowCount } = await s.q(
        `update public.assignments set status = 'approved' where id = '${ID.dAssignment}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: can_review() checks the explicit children array, so review rights for ' +
          'child C say nothing about child D',
      );
    }),
  );

  test(
    'a reviewing helper may move the status and write a comment, and nothing else',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      for (const [what, sql] of [
        [
          'retitle the homework',
          `update public.assignments set title = 'my own homework' where id = '${ID.cAssignment}'`,
        ],
        [
          'move the deadline',
          `update public.assignments set due_date = current_date + 30 where id = '${ID.cAssignment}'`,
        ],
        [
          'rewrite the source reference',
          `update public.assignments set source_ref = 'page 1' where id = '${ID.cAssignment}'`,
        ],
        [
          "rewrite the child's self-assessment",
          `update public.assignments set self_rating = 5 where id = '${ID.cAssignment}'`,
        ],
        [
          'rewrite the redo counter',
          `update public.assignments set redo_count = 3 where id = '${ID.cAssignment}'`,
        ],
      ]) {
        const error = await s.expectError(sql);
        assert.equal(
          error.code,
          '42501',
          `proves: a helper cannot ${what}. The row policy lets the UPDATE through — the ` +
            `column lock in assignments_status_guard() is what refuses it (${error.message})`,
        );
        assert.match(
          error.message,
          /A helper may only change status and review_comment/,
          'proves: the refusal names the helper rule specifically',
        );
      }
    }),
  );

  test(
    'a helper can neither delete an assignment nor create one',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      const { rowCount } = await s.q(
        `delete from public.assignments where id = '${ID.cAssignment}'`,
      );
      assert.equal(rowCount, 0, 'proves: there is no helper DELETE policy on assignments');

      const error = await s.expectError(
        `insert into public.assignments (child_id, title) values ('${ID.childC}', 'x')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: and no helper INSERT policy either — a helper supervises homework, ' +
          'they do not set it',
      );
    }),
  );

  // ----------------------------------------------------- 15.4 the never list
  test(
    'a helper can touch neither the PIN/invite columns nor anything else the parent owns',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);

      for (const [what, sql] of [
        ['issue themselves an invite code', `update public.children set invite_code = 'AAAAAA' where id = '${ID.childC}'`],
        ['clear the PIN lockout', `update public.children set pin_attempts = 0 where id = '${ID.childC}'`],
        ['reset the PIN', `update public.children set pin_hash = null where id = '${ID.childC}'`],
        ['switch the UI mode', `update public.children set ui_mode = 'simple' where id = '${ID.childC}'`],
        ['turn on the stats the parent turned off', `update public.children set show_own_stats = true where id = '${ID.childC}'`],
        ['rename the child', `update public.children set name = 'x' where id = '${ID.childC}'`],
        ['archive the child', `update public.children set is_active = false where id = '${ID.childC}'`],
        ['rename a subject', `update public.subjects set name = 'x' where child_id = '${ID.childC}'`],
        ['move a lesson in the timetable', `update public.schedule_slots set start_time = '07:00' where child_id = '${ID.childC}'`],
        ['rewrite a lesson', `update public.lessons set topic = 'x' where child_id = '${ID.childC}'`],
        ['change a grade', `update public.grades set value = 10 where child_id = '${ID.childC}'`],
        ['delete the evidence', `delete from public.attachments where child_id = '${ID.childC}'`],
        ['delete a subject', `delete from public.subjects where child_id = '${ID.childC}'`],
        ['delete the timetable', `delete from public.schedule_slots where child_id = '${ID.childC}'`],
      ]) {
        const { rowCount } = await s.q(sql);
        assert.equal(
          rowCount,
          0,
          `proves: a helper cannot ${what} — with no policy for that verb the row is not ` +
            'visible to the statement at all',
        );
      }

      for (const [what, sql] of [
        ['add a subject', `insert into public.subjects (child_id, name) values ('${ID.childC}', 'x')`],
        ['add a timetable slot', `insert into public.schedule_slots (child_id, weekday, start_time, end_time) values ('${ID.childC}', 3, '08:00', '08:45')`],
        ['record a lesson', `insert into public.lessons (child_id, date) values ('${ID.childC}', current_date)`],
        ['record a grade', `insert into public.grades (child_id, date, value) values ('${ID.childC}', current_date, 10)`],
        ['add a child', `insert into public.children (family_id, name) values ('${ID.family2}', 'x')`],
        ['attach a photo', `insert into public.attachments (assignment_id, kind, storage_path, mime) values ('${ID.cAssignment}', 'review', '${ID.childC}/${ID.cAssignment}/planted.webp', 'image/webp')`],
      ]) {
        const error = await s.expectError(sql);
        assert.equal(
          error.code,
          '42501',
          `proves: a helper cannot ${what} — WITH CHECK rejects it outright`,
        );
      }
    }),
  );

  test(
    'a helper cannot widen their own grant, invite another helper, or start a family',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);

      const widen = await s.q(
        `update public.family_members
            set permissions = jsonb_build_object(
                  'children', jsonb_build_array('${ID.childC}', '${ID.childD}'),
                  'can_review', true, 'can_comment', true)
          where user_id = '${ID.helperReviewUser}'`,
      );
      assert.equal(
        widen.rowCount,
        0,
        'proves: family_members has no helper UPDATE policy, so a helper cannot add a child ' +
          'to their own permissions jsonb — the single write that would undo all of 0010',
      );

      const promote = await s.q(
        `update public.family_members set role = 'parent' where user_id = '${ID.helperReviewUser}'`,
      );
      assert.equal(promote.rowCount, 0, 'proves: nor promote their membership to parent');

      const resign = await s.q(
        `delete from public.family_members where user_id = '${ID.helperRevokedUser}'`,
      );
      assert.equal(resign.rowCount, 0, 'proves: nor remove a rival helper');

      for (const [what, sql] of [
        [
          'join a second family',
          `insert into public.family_members (family_id, user_id, role)
           values ('${ID.family1}', '${ID.helperReviewUser}', 'helper')`,
        ],
        [
          'invite another helper',
          `insert into public.helper_invitations
             (family_id, email, token, child_ids, invited_by, expires_at)
           values ('${ID.family2}', 'x@school-hub.test', 'TOKENTOKENTOKENTOKEN',
                   array['${ID.childC}']::uuid[], '${ID.helperReviewUser}',
                   now() + interval '1 day')`,
        ],
        [
          'start their own family',
          `insert into public.families (name, owner_id)
           values ('mine', '${ID.helperReviewUser}')`,
        ],
      ]) {
        const error = await s.expectError(sql);
        assert.equal(
          error.code,
          '42501',
          `proves: a helper cannot ${what} — every one of those policies requires is_parent()`,
        );
      }
    }),
  );

  test(
    'a helper cannot escalate through profiles.role — the 0007 guard holds for them too',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      const error = await s.expectError(
        `update public.profiles set role = 'parent' where id = '${ID.helperReviewUser}'`,
      );
      assert.equal(error.code, '42501');
      assert.match(
        error.message,
        /permission denied for table profiles/,
        'proves: the 0007 column-level REVOKE is role-wide and 0010 grants nothing back, so ' +
          'a helper hits exactly the wall a child hits. Were this to succeed, is_parent() ' +
          'would become true and every parent policy in 0004 would open',
      );
    }),
  );

  test(
    'a helper cannot enumerate the family: not the other child, not the other helpers',
    tx(async () => {
      await s.asUser(ID.helperViewUser);

      const childProfile = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.childDUser}'`,
      );
      assert.equal(
        childProfile.rows[0].n,
        0,
        'proves: the 0008 reasoning extended outwards — a grandparent invited for one child ' +
          'is not told that the other one exists',
      );

      const others = await s.q(
        `select count(*)::int as n from public.family_members
          where user_id <> '${ID.helperViewUser}'`,
      );
      assert.equal(
        others.rows[0].n,
        0,
        'proves: a helper sees only their own membership row, so they cannot read another ' +
          "helper's permissions jsonb or discover who else is watching",
      );

      const own = await s.q(
        `select count(*)::int as n from public.family_members
          where user_id = '${ID.helperViewUser}'`,
      );
      assert.equal(
        own.rows[0].n,
        1,
        'proves: their own row is still readable, which is what requireParent() reads to ' +
          'resolve family_id',
      );

      const parentProfile = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.parent2User}'`,
      );
      assert.equal(
        parentProfile.rows[0].n,
        1,
        'proves: the parent profile is still readable, so message author names render',
      );

      const invites = await s.q(
        'select count(*)::int as n from public.helper_invitations',
      );
      assert.equal(
        invites.rows[0].n,
        0,
        'proves: a helper cannot read helper_invitations, so they cannot lift a pending ' +
          "token and redeem somebody else's invitation",
      );
    }),
  );

  test(
    'a child is not turned into a helper by 0010, and 0008 still holds after the rewrite',
    tx(async () => {
      await s.asUser(ID.childCUser);
      const view = await s.q('select count(*)::int as n from public.helper_children');
      assert.equal(view.rows[0].n, 0, 'proves: is_helper() is false for a child');

      const sibling = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.childDUser}'`,
      );
      assert.equal(
        sibling.rows[0].n,
        0,
        'proves: 0010 rewrote profiles_select_self_or_family and carried the 0008 sibling ' +
          'clause through verbatim — child C still cannot enumerate child D',
      );

      const siblingMember = await s.q(
        `select count(*)::int as n from public.family_members where user_id = '${ID.childDUser}'`,
      );
      assert.equal(
        siblingMember.rows[0].n,
        0,
        'proves: the same for family_members, which 0010 also rewrote',
      );
    }),
  );

  // ----------------------------------------------------------- 15.5 comments
  test(
    'a helper with comment rights may post on their child, and only on their child',
    tx(async () => {
      await s.asUser(ID.helperViewUser);

      const { rows } = await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.cAssignment}', 'gamarjoba') returning id, child_id, author_id`,
      );
      assert.equal(rows.length, 1, 'proves: can_comment lets the helper into the thread');
      assert.equal(rows[0].child_id, ID.childC);
      assert.equal(rows[0].author_id, ID.helperViewUser);

      const error = await s.expectError(
        `insert into public.messages (assignment_id, body)
         values ('${ID.dAssignment}', 'not for you')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: the other child of the same family is out of reach for comments too',
      );
    }),
  );

  test(
    'sending an assigned child_id with an unassigned assignment smuggles nothing across',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      const error = await s.expectError(
        `insert into public.messages (assignment_id, child_id, body)
         values ('${ID.dAssignment}', '${ID.childC}', 'planted')`,
      );
      assert.equal(
        error.code,
        '42501',
        "proves: 0007's resolve_message_child_id() overwrites the client's child_id with the " +
          'one derived from the assignment, so the forged value is discarded and the ' +
          'WITH CHECK then sees child D',
      );
    }),
  );

  test(
    'a helper WITHOUT comment rights can read the thread and cannot write to it',
    tx(async () => {
      await s.asService();
      await s.q(
        `update public.family_members
            set permissions = permissions || '{"can_comment": false}'::jsonb
          where user_id = '${ID.helperViewUser}'`,
      );

      await s.asUser(ID.helperViewUser);
      const read = await s.q(
        `select count(*)::int as n from public.messages where child_id = '${ID.childC}'`,
      );
      assert.ok(read.rows[0].n > 0, 'proves: reading the thread is part of "view"');

      const error = await s.expectError(
        `insert into public.messages (assignment_id, body)
         values ('${ID.cAssignment}', 'should not land')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: commenting is a separate, revocable right — view does not imply it',
      );
    }),
  );

  test(
    "a helper cannot edit anybody else's message, and cannot delete any",
    tx(async () => {
      await s.asUser(ID.helperViewUser);

      const edit = await s.q(
        `update public.messages set body = 'rewritten' where id = '${ID.cMessage}'`,
      );
      assert.equal(
        edit.rowCount,
        0,
        "proves: messages_helper_update_own requires author_id = auth.uid() — the parent's " +
          'words are not editable by the helper',
      );

      const remove = await s.q(
        `delete from public.messages where id = '${ID.helperMessage}'`,
      );
      assert.equal(
        remove.rowCount,
        0,
        'proves: a helper has no DELETE policy on messages, not even for their own',
      );
    }),
  );

  // ------------------------------------------------------------ 15.6 storage
  test(
    'storage: a helper may read their child evidence and may not write any',
    tx(async () => {
      await s.asUser(ID.helperViewUser);

      const mine = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childC}/%'`,
      );
      assert.ok(
        mine.rows[0].n > 0,
        'proves: the point of the role — a helper can actually look at the photo of the work',
      );

      const theirs = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childD}/%'`,
      );
      assert.equal(
        theirs.rows[0].n,
        0,
        'proves: 0005 scoped the helper to the whole family; 0010 scopes them to their child',
      );

      const insert = await s.expectError(
        `insert into storage.objects (bucket_id, name, owner, metadata)
         values ('evidence', '${ID.childC}/${ID.cAssignment}/planted.webp',
                 '${ID.helperViewUser}', '{"mimetype":"image/webp"}'::jsonb)`,
      );
      assert.equal(
        insert.code,
        '42501',
        'proves: a helper cannot plant evidence — there is no helper INSERT policy on ' +
          'storage.objects',
      );

      const update = await s.q(
        `update storage.objects set name = '${ID.childC}/moved.webp'
          where name = '${ID.childC}/${ID.cAssignment}/seed-c.webp'`,
      );
      assert.equal(update.rowCount, 0, 'proves: nor rename one');

      const remove = await s.q(
        `delete from storage.objects where name like '${ID.childC}/%'`,
      );
      assert.equal(
        remove.rowCount,
        0,
        'proves: nor delete one. Read yes, write no — the photo is the record the parent ' +
          'reviews, and a helper must not be able to edit the record',
      );
    }),
  );

  // --------------------------------------------------------- 15.7 revocation
  test(
    'revoking a helper cuts access on the very next statement',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      const before = await s.q(
        `select count(*)::int as n from public.assignments where child_id = '${ID.childC}'`,
      );
      assert.ok(before.rows[0].n > 0, 'proves: they had access a moment ago');

      await s.asService();
      await s.q(
        `update public.family_members
            set permissions = permissions || jsonb_build_object('revoked_at', now())
          where user_id = '${ID.helperViewUser}'`,
      );

      await s.asUser(ID.helperViewUser);
      for (const [table, predicate] of Object.entries(ASSIGNED)) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${predicate}`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: public.${table} closed immediately — helper_child_ids() is STABLE, so it ` +
            'is re-evaluated per statement and there is no cached session to wait out',
        );
      }

      const view = await s.q('select count(*)::int as n from public.helper_children');
      assert.equal(view.rows[0].n, 0, 'proves: the view closed too');

      const storage = await s.q(
        `select count(*)::int as n from storage.objects where name like '${ID.childC}/%'`,
      );
      assert.equal(storage.rows[0].n, 0, 'proves: and so did the evidence bucket');
    }),
  );

  test(
    'the pre-stamped revoked helper has nothing, including review rights',
    tx(async () => {
      await s.asUser(ID.helperRevokedUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.assignments where child_id = '${ID.childC}'`,
      );
      assert.equal(rows[0].n, 0, 'proves: revoked_at alone is enough to close everything');

      const { rowCount } = await s.q(
        `update public.assignments set status = 'approved' where id = '${ID.cAssignment}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: can_review() filters revoked memberships too, so a stale can_review:true in ' +
          'the jsonb grants nothing',
      );
    }),
  );

  test(
    'a revoked helper messages survive, with the author name still resolvable',
    tx(async () => {
      await s.asService();
      await s.q(
        `update public.family_members
            set permissions = permissions || jsonb_build_object('revoked_at', now())
          where user_id = '${ID.helperViewUser}'`,
      );

      await s.asUser(ID.parent2User);
      const message = await s.rows(
        `select id, body, author_id from public.messages where id = '${ID.helperMessage}'`,
      );
      assert.equal(
        message.length,
        1,
        'proves: revoking access does not delete what the person said. Removing a ' +
          'grandparent must not silently rewrite three months of chat',
      );
      assert.equal(message[0].author_id, ID.helperViewUser);

      const author = await s.q(
        `select count(*)::int as n from public.profiles where id = '${ID.helperViewUser}'`,
      );
      assert.equal(
        author.rows[0].n,
        1,
        'proves: the membership row is kept (stamped, not deleted), so my_family_user_ids() ' +
          'still contains them and the old message renders with a name instead of "unknown"',
      );
    }),
  );

  // ------------------------------------------------------- 15.8 fail-closed
  test(
    'an absent children list grants nothing — the 0003 fail-OPEN default is gone',
    tx(async () => {
      await s.asService();
      await s.q(
        `update public.family_members
            set permissions = '{"can_review": true, "can_comment": true}'::jsonb
          where user_id = '${ID.helperReviewUser}'`,
      );

      await s.asUser(ID.helperReviewUser);

      const visible = await s.q('select count(*)::int as n from public.helper_children');
      assert.equal(
        visible.rows[0].n,
        0,
        'proves: no children array, no children. 0003 read a missing array as "every child ' +
          'in the family", which is a fail-open default in the one function that decides who ' +
          "may mark a child's homework done",
      );

      const { rows } = await s.q(`select public.can_review('${ID.childC}') as ok`);
      assert.equal(
        rows[0].ok,
        false,
        'proves: can_review() is fail-closed as well, so the trigger would refuse even if a ' +
          'future policy let the UPDATE through',
      );

      const { rowCount } = await s.q(
        `update public.assignments set status = 'approved' where id = '${ID.cAssignment}'`,
      );
      assert.equal(rowCount, 0, 'proves: and the decision itself touches no row');
    }),
  );

  test(
    'an empty children list grants nothing either',
    tx(async () => {
      await s.asService();
      await s.q(
        `update public.family_members
            set permissions = '{"children": [], "can_review": true}'::jsonb
          where user_id = '${ID.helperReviewUser}'`,
      );

      await s.asUser(ID.helperReviewUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.assignments where child_id = '${ID.childC}'`,
      );
      assert.equal(rows[0].n, 0, 'proves: [] means none, not all');
    }),
  );

  test(
    'a child id from another family in the permissions jsonb resolves to nothing',
    tx(async () => {
      await s.asService();
      await s.q(
        `update public.family_members
            set permissions = jsonb_build_object(
                  'children', jsonb_build_array('${ID.childA}'),
                  'can_review', true, 'can_comment', true)
          where user_id = '${ID.helperReviewUser}'`,
      );

      await s.asUser(ID.helperReviewUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.assignments where child_id = '${ID.childA}'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: helper_child_ids() joins each listed id back to children.family_id = the ' +
          "membership family. A parent cannot grant away another family's child by pasting a " +
          'uuid, and an id left behind after a child moves resolves to nothing',
      );

      const { rows: review } = await s.q(`select public.can_review('${ID.childA}') as ok`);
      assert.equal(review[0].ok, false, 'proves: can_review() joins the same way');
    }),
  );

  test(
    'an invitation that names no child cannot be created at all',
    tx(async () => {
      await s.asUser(ID.parent2User);
      const error = await s.expectError(
        `insert into public.helper_invitations
           (family_id, email, token, child_ids, invited_by, expires_at)
         values ('${ID.family2}', 'nobody@school-hub.test',
                 'EMPTYTOKENEMPTYTOKENEMPTYTOKEN12', '{}'::uuid[],
                 '${ID.parent2User}', now() + interval '1 day')`,
      );
      assert.equal(
        error.code,
        '23514',
        'proves: the CHECK uses cardinality(), not array_length() — array_length on an ' +
          'empty array is NULL and a NULL CHECK passes, which would have let a parent ' +
          'issue an invitation that grants nothing and reads as a bug on both sides',
      );
    }),
  );

  test(
    'a parent of another family cannot read or revoke an invitation',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const read = await s.q(
        `select count(*)::int as n from public.helper_invitations
          where id = '${ID.invite2}'`,
      );
      assert.equal(read.rows[0].n, 0, 'proves: invitations are family-scoped');

      const { rowCount } = await s.q(
        `update public.helper_invitations set revoked_at = now()
          where id = '${ID.invite2}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: and only the owning family can revoke one, so a stranger cannot cancel ' +
          "someone else's tutor",
      );

      const own = await s.q(
        `select count(*)::int as n from public.helper_invitations
          where id = '${ID.invite1}'`,
      );
      assert.equal(
        own.rows[0].n,
        1,
        'proves: parent 1 does see their own, so the zero above is a denial',
      );
    }),
  );

  test(
    'a helper membership held by an account whose profile is not a helper grants nothing',
    tx(async () => {
      // The reverse of the usual worry: someone who is a parent in their OWN
      // family also holding a helper membership in this one. is_helper() and the
      // membership row must agree, or a stale row in either place would be enough.
      await s.asService();
      await s.q(
        `insert into public.family_members (family_id, user_id, role, permissions)
         values ('${ID.family2}', '${ID.parent1User}', 'helper',
                 jsonb_build_object('children', jsonb_build_array('${ID.childC}'),
                                    'can_review', true, 'can_comment', true))`,
      );

      await s.asUser(ID.parent1User);
      const { rows } = await s.q(
        `select count(*)::int as n from public.assignments where child_id = '${ID.childC}'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: every helper predicate starts from is_helper() (profiles.role), so a parent ' +
          'of another family cannot collect helper rights while keeping is_parent()',
      );

      const { rows: review } = await s.q(`select public.can_review('${ID.childC}') as ok`);
      assert.equal(
        review[0].ok,
        false,
        'proves: can_review() requires is_helper() on its helper branch for the same reason',
      );
    }),
  );
});

// =============================================================================
// 20. Notification triggers (0009)
//
// `public.notifications` has no INSERT policy on purpose (0004) and, since
// 0009, no INSERT grant either. Every row is written by a SECURITY DEFINER
// trigger. These tests are about WHO each trigger writes to, because a
// notification delivered to the wrong person is a privacy failure that no
// amount of RLS on the read path can undo -- the row is already addressed to
// them, so their own `user_id = auth.uid()` policy lets them read it.
// =============================================================================

/** Every notification row for one user, service-role so nothing is filtered. */
async function notificationsFor(userId) {
  await s.asService();
  const { rows } = await s.q(
    `select id, type, payload, read_at, created_at
       from public.notifications
      where user_id = $1
      order by created_at, id`,
    [userId],
  );
  return rows;
}

/** Rows of `type` for `userId` that are about `assignmentId`. */
async function notificationsAbout(userId, type, assignmentId) {
  const rows = await notificationsFor(userId);
  return rows.filter(
    (r) => r.type === type && r.payload?.assignment_id === assignmentId,
  );
}

describe('20. notification triggers reach exactly the right people', () => {
  test(
    'a child submitting notifies the parent, and neither the child nor the sibling',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `update public.assignments set status = 'submitted' where id = '${ID.aAssigned}'`,
      );

      const parent = await notificationsAbout(
        ID.parent1User,
        'assignment_submitted',
        ID.aAssigned,
      );
      assert.equal(
        parent.length,
        1,
        'proves: the parent is told, exactly once, that work was handed in',
      );

      const author = await notificationsAbout(
        ID.childAUser,
        'assignment_submitted',
        ID.aAssigned,
      );
      assert.equal(
        author.length,
        0,
        'proves: nobody is notified about their own action',
      );

      const sibling = await notificationsFor(ID.childBUser);
      assert.equal(
        sibling.filter((r) => r.payload?.assignment_id === ID.aAssigned).length,
        0,
        "proves: a child is never told anything about a sibling's assignment -- " +
          'the recipient list is the family PARENTS plus the owning child, never ' +
          'every child in the family',
      );
    }),
  );

  test(
    'child A receives nothing when child B submits, even though they share a family',
    tx(async () => {
      const before = (await notificationsFor(ID.childAUser)).length;

      await s.asUser(ID.childBUser);
      await s.q(
        `update public.assignments set status = 'submitted' where id = '${ID.bAssigned}'`,
      );

      const after = await notificationsFor(ID.childAUser);
      assert.equal(
        after.length,
        before,
        "proves: the sibling's submission produced not one row addressed to child A. " +
          'This is the same boundary the realtime subscription relies on: Realtime ' +
          "evaluates notifications' own `user_id = auth.uid()` policy per subscriber, " +
          'so a row that was never addressed to child A can never be broadcast to them',
      );

      const parent = await notificationsAbout(
        ID.parent1User,
        'assignment_submitted',
        ID.bAssigned,
      );
      assert.equal(parent.length, 1, 'proves: the parent still got theirs');
    }),
  );

  test(
    'approving notifies the child and not the parent who clicked it',
    tx(async () => {
      await s.asUser(ID.parent1User);
      await s.q(
        `update public.assignments set status = 'approved' where id = '${ID.aSubmitted}'`,
      );

      const child = await notificationsAbout(
        ID.childAUser,
        'assignment_approved',
        ID.aSubmitted,
      );
      assert.equal(child.length, 1, 'proves: the child hears the good news');
      assert.equal(
        child[0].payload.audience,
        'child',
        'proves: the payload says which shell to link into, so the UI needs no ' +
          'extra query and no route table in SQL',
      );

      const reviewer = await notificationsAbout(
        ID.parent1User,
        'assignment_approved',
        ID.aSubmitted,
      );
      assert.equal(
        reviewer.length,
        0,
        'proves: the reviewer is not notified of their own decision',
      );

      const sibling = await notificationsAbout(
        ID.childBUser,
        'assignment_approved',
        ID.aSubmitted,
      );
      assert.equal(sibling.length, 0, 'proves: the sibling hears nothing');
    }),
  );

  test(
    'returning work for redo notifies the child and carries the comment',
    tx(async () => {
      await s.asUser(ID.parent1User);
      await s.q(
        `update public.assignments
            set status = 'redo', review_comment = 'ორი უჯრა დარჩა'
          where id = '${ID.aSubmitted}'`,
      );

      const child = await notificationsAbout(
        ID.childAUser,
        'assignment_redo',
        ID.aSubmitted,
      );
      assert.equal(child.length, 1, 'proves: the child is told to redo it');
      assert.equal(
        child[0].payload.preview,
        'ორი უჯრა დარჩა',
        'proves: the reason travels with the notification, so the row reads as a ' +
          'sentence without opening the assignment',
      );
    }),
  );

  test(
    'the payload is self-describing: the bell renders a row with no second query',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `update public.assignments set status = 'submitted' where id = '${ID.aAssigned}'`,
      );

      const [row] = await notificationsAbout(
        ID.parent1User,
        'assignment_submitted',
        ID.aAssigned,
      );
      const payload = row.payload;

      for (const key of [
        'v',
        'audience',
        'count',
        'assignment_id',
        'child_id',
        'child_name',
        'subject_name',
        'title',
      ]) {
        assert.ok(
          key in payload,
          `proves: payload carries "${key}", so src/features/notifications ` +
            'never has to join back to assignments/children/subjects',
        );
      }
      assert.equal(payload.child_id, ID.childA);
      assert.equal(payload.audience, 'parent');
      assert.equal(payload.count, 1);
      assert.ok(
        typeof payload.child_name === 'string' && payload.child_name.length > 0,
        'proves: the name is denormalised at write time, not looked up at read time',
      );
    }),
  );

  test(
    "a child's message notifies the parents only",
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'დედა, ვერ გავიგე')`,
      );

      const parent = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aAssigned,
      );
      assert.equal(
        parent.length,
        1,
        'proves: the other side of the thread hears it',
      );
      assert.equal(parent[0].payload.audience, 'parent');
      assert.equal(
        parent[0].payload.preview,
        'დედა, ვერ გავიგე',
        'proves: the preview is in the row, so the bell shows the message text',
      );

      assert.equal(
        (await notificationsAbout(ID.childAUser, 'message_posted', ID.aAssigned))
          .length,
        0,
        'proves: the author is not notified',
      );
      assert.equal(
        (await notificationsAbout(ID.childBUser, 'message_posted', ID.aAssigned))
          .length,
        0,
        "proves: a sibling is never told about a message in somebody else's thread",
      );
    }),
  );

  test(
    "a parent's message notifies the child only",
    tx(async () => {
      await s.asUser(ID.parent1User);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'ჯერ მაგალითი ნახე')`,
      );

      const child = await notificationsAbout(
        ID.childAUser,
        'message_posted',
        ID.aAssigned,
      );
      assert.equal(child.length, 1, 'proves: the child is told');
      assert.equal(child[0].payload.audience, 'child');

      assert.equal(
        (
          await notificationsAbout(
            ID.parent1User,
            'message_posted',
            ID.aAssigned,
          )
        ).length,
        0,
        'proves: the author is not notified',
      );
      assert.equal(
        (await notificationsAbout(ID.childBUser, 'message_posted', ID.aAssigned))
          .length,
        0,
        'proves: the sibling is not notified',
      );
    }),
  );

  test(
    'a lesson-scoped message notifies nobody (there is no screen to link to yet)',
    tx(async () => {
      const before = (await notificationsFor(ID.parent1User)).length;

      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (lesson_id, body)
         values ('${ID.aLesson}', 'lesson chat')`,
      );

      const after = await notificationsFor(ID.parent1User);
      assert.equal(
        after.length,
        before,
        'proves: 0009 skips messages with no assignment_id rather than delivering a ' +
          'notification whose link would go nowhere',
      );
    }),
  );
});

// =============================================================================
// 20b. Collapsing
// =============================================================================
describe('20b. a burst of messages collapses into one unread row', () => {
  test(
    'three messages in one thread produce ONE notification with count 3',
    tx(async () => {
      await s.asUser(ID.childAUser);
      for (const body of ['ერთი', 'ორი', 'სამი']) {
        await s.q(
          `insert into public.messages (assignment_id, body)
           values ('${ID.aAssigned}', '${body}')`,
        );
      }

      const rows = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aAssigned,
      );
      assert.equal(
        rows.length,
        1,
        'proves: the bell shows one conversation, not a column of three identical rows',
      );
      assert.equal(
        rows[0].payload.count,
        3,
        'proves: the collapsed row counts what it folded in, so the UI can say ' +
          '"3 new messages"',
      );
      assert.equal(
        rows[0].payload.preview,
        'სამი',
        'proves: the collapsed row shows the NEWEST message, not the first one',
      );
    }),
  );

  test(
    'collapsing never crosses threads',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'thread one')`,
      );
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aInProgress}', 'thread two')`,
      );

      const one = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aAssigned,
      );
      const two = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aInProgress,
      );
      assert.equal(one.length, 1);
      assert.equal(two.length, 1);
      assert.equal(one[0].payload.count, 1);
      assert.equal(two[0].payload.count, 1);
      // Two distinct conversations must stay two rows, or clicking the bell
      // would silently hide one of them.
      assert.notEqual(
        one[0].id,
        two[0].id,
        'proves: the collapse key includes assignment_id',
      );
    }),
  );

  test(
    'collapsing never folds into a row that has already been read',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'first')`,
      );

      // The parent opens the bell and marks it read, through their own policy.
      await s.asUser(ID.parent1User);
      const marked = await s.q(
        `update public.notifications set read_at = now()
          where user_id = '${ID.parent1User}' and read_at is null`,
      );
      assert.ok(marked.rowCount > 0, 'the owner can mark their own rows read');

      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'second')`,
      );

      const rows = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aAssigned,
      );
      assert.equal(
        rows.length,
        2,
        'proves: a message that arrives AFTER the user caught up starts a new unread ' +
          'row instead of resurrecting the one they just dismissed',
      );
      assert.equal(
        rows.filter((r) => r.read_at === null).length,
        1,
        'proves: exactly one of them is unread',
      );
    }),
  );

  test(
    'collapsing never merges two different recipients',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'to the parents')`,
      );
      await s.asUser(ID.parent1User);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'to the child')`,
      );

      const parent = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aAssigned,
      );
      const child = await notificationsAbout(
        ID.childAUser,
        'message_posted',
        ID.aAssigned,
      );
      assert.equal(parent.length, 1);
      assert.equal(child.length, 1);
      assert.equal(
        parent[0].payload.preview,
        'to the parents',
        'proves: the parent kept THEIR notification, not the one addressed to the child',
      );
      assert.equal(child[0].payload.preview, 'to the child');
    }),
  );
});

// =============================================================================
// 21. Nothing but the trigger may write a notification
// =============================================================================
describe('21. a client cannot forge a notification', () => {
  for (const [label, user] of [
    ['a child', ID.childAUser],
    ['a parent', ID.parent1User],
  ]) {
    test(
      `${label} cannot INSERT a notification for themselves`,
      tx(async () => {
        await s.asUser(user);
        const error = await s.expectError(
          `insert into public.notifications (user_id, type, payload)
           values ('${user}', 'assignment_approved', '{}'::jsonb)`,
        );
        assert.equal(
          error.code,
          '42501',
          'proves: the write is refused. 0004 gives notifications no INSERT policy and ' +
            '0009 revokes the INSERT grant on top, so this fails at the privilege ' +
            'check before RLS is even consulted',
        );
      }),
    );

    test(
      `${label} cannot INSERT a notification addressed to somebody else`,
      tx(async () => {
        await s.asUser(user);
        const error = await s.expectError(
          `insert into public.notifications (user_id, type, payload)
           values ('${ID.parent2User}', 'assignment_redo', '{}'::jsonb)`,
        );
        assert.equal(error.code, '42501');
      }),
    );
  }

  test(
    'anon cannot INSERT a notification',
    tx(async () => {
      await s.asAnon();
      const error = await s.expectError(
        `insert into public.notifications (user_id, type, payload)
         values ('${ID.parent1User}', 'assignment_approved', '{}'::jsonb)`,
      );
      assert.equal(error.code, '42501');
    }),
  );

  test(
    'no client role holds the INSERT privilege at all',
    tx(async () => {
      await s.asService();
      // `has_table_privilege` rather than information_schema: that view only
      // shows grants the CURRENT user is party to, so it would answer "none"
      // for the wrong reason and this test would pass vacuously.
      const { rows } = await s.q(
        `select
           has_table_privilege('authenticated', 'public.notifications', 'INSERT') as authenticated_insert,
           has_table_privilege('anon',          'public.notifications', 'INSERT') as anon_insert,
           has_table_privilege('service_role',  'public.notifications', 'INSERT') as service_insert`,
      );
      assert.equal(
        rows[0].authenticated_insert,
        false,
        'proves: the grant itself is gone, not merely shadowed by a missing policy. ' +
          'Adding a permissive INSERT policy by accident would still not open this up',
      );
      assert.equal(rows[0].anon_insert, false);
      assert.equal(
        rows[0].service_insert,
        true,
        'proves: only the client roles lost it',
      );
    }),
  );

  test(
    'a client cannot call enqueue_notification() directly',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `select public.enqueue_notification(
           '${ID.childAUser}'::uuid, 'assignment_approved', '{}'::jsonb)`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: the SECURITY DEFINER writer is not exposed over PostgREST -- EXECUTE ' +
          'is revoked from public, anon and authenticated, so a client cannot borrow ' +
          "the trigger's privileges by calling it as an RPC",
      );
    }),
  );

  test(
    'a client cannot rewrite the content of a notification addressed to them',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'hello')`,
      );
      const [row] = await notificationsAbout(
        ID.parent1User,
        'message_posted',
        ID.aAssigned,
      );

      await s.asUser(ID.parent1User);
      const payloadError = await s.expectError(
        `update public.notifications set payload = '{"assignment_id":"x"}'::jsonb
          where id = '${row.id}'`,
      );
      assert.equal(
        payloadError.code,
        '42501',
        'proves: the owner may flip read_at and nothing else -- a notification is a ' +
          'record of what happened, not a scratchpad',
      );

      const typeError = await s.expectError(
        `update public.notifications set type = 'assignment_approved'
          where id = '${row.id}'`,
      );
      assert.equal(typeError.code, '42501');
    }),
  );

  test(
    'the owner can still mark their own notification read, which is the whole point',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const result = await s.q(
        `update public.notifications set read_at = now()
          where user_id = '${ID.parent1User}' and read_at is null`,
      );
      assert.ok(
        result.rowCount > 0,
        'proves: the column lock in 0009 did not break mark-as-read',
      );
    }),
  );

  test(
    "a parent cannot mark another family's notification read",
    tx(async () => {
      await s.asUser(ID.parent1User);
      const touched = await s.expectZeroRows(
        `update public.notifications set read_at = now()
          where user_id = '${ID.parent2User}'`,
      );
      assert.equal(
        touched,
        0,
        'proves: notifications_own_update (0004) filters by auth.uid(), so the ' +
          'statement succeeds against nothing rather than reaching another family',
      );
    }),
  );

  test(
    'the service role can still write one, which is how the triggers work',
    tx(async () => {
      await s.asService();
      const { rowCount } = await s.q(
        `insert into public.notifications (user_id, type, payload)
         values ('${ID.parent1User}', 'assignment_submitted', '{}'::jsonb)`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: the lockdown is aimed at client roles only; server-side delivery is ' +
          'unaffected',
      );
    }),
  );
});

// =============================================================================
// 22. Realtime publication membership (0009 section 1)
//
// Realtime is not a grant: Supabase re-broadcasts a change only to subscribers
// whose RLS SELECT policies accept the changed record. But the publication
// decides what the Realtime server gets to look at in the first place, so a
// table landing in it by accident is worth failing a test over.
// =============================================================================
describe('22. the realtime publication contains what 0009 intended', () => {
  test(
    'messages and notifications are published, and nothing sensitive is',
    tx(async () => {
      await s.asService();
      const { rows } = await s.q(
        `select tablename from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
          order by 1`,
      );
      const published = rows.map((r) => r.tablename);

      assert.ok(
        published.includes('messages'),
        'proves: a chat message reaches the other side without a page refresh',
      );
      assert.ok(
        published.includes('notifications'),
        'proves: the bell updates itself',
      );

      for (const table of [
        'grades',
        'children',
        'attachments',
        'message_reads',
        'profiles',
        'topic_mastery',
      ]) {
        assert.ok(
          !published.includes(table),
          `proves: ${table} is NOT streamed. Every published table is one more ` +
            'surface where a DELETE (whose old record Realtime does not filter the ' +
            'way it filters an insert) could leak a key, and none of these need to ' +
            'be live',
        );
      }
    }),
  );

  test(
    'replica identity is DEFAULT on both published tables, not FULL',
    tx(async () => {
      await s.asService();
      const { rows } = await s.q(
        `select c.relname, c.relreplident
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in ('messages', 'notifications')
          order by 1`,
      );
      assert.deepEqual(
        rows,
        [
          { relname: 'messages', relreplident: 'd' },
          { relname: 'notifications', relreplident: 'd' },
        ],
        "proves: 'd' = default (primary key). FULL would put the entire PREVIOUS row " +
          'into the WAL record of every UPDATE and DELETE, and the old record is not ' +
          'RLS-filtered the way the new one is -- deleting a message would then ' +
          'broadcast its body. With DEFAULT the worst case is a bare uuid',
      );
    }),
  );

  test(
    'authenticated still holds SELECT on both, which is what Realtime evaluates RLS with',
    tx(async () => {
      await s.asService();
      const { rows } = await s.q(
        `select
           has_table_privilege('authenticated', 'public.messages', 'SELECT') as messages,
           has_table_privilege('authenticated', 'public.notifications', 'SELECT') as notifications`,
      );
      assert.deepEqual(
        rows[0],
        { messages: true, notifications: true },
        'proves: 0009 revoked INSERT on notifications without taking SELECT with it. ' +
          'Realtime authorises a subscriber by running the SELECT policies as that ' +
          'role; no SELECT privilege would mean no events at all',
      );
    }),
  );

  test(
    'the sibling cannot pass the RLS check Realtime runs on a message row',
    tx(async () => {
      // Exactly what Supabase Realtime does before broadcasting: take the
      // changed record, and ask whether the subscribing user's SELECT policies
      // admit it.
      await s.asUser(ID.childAUser);
      const inserted = await s.q(
        `insert into public.messages (assignment_id, body)
         values ('${ID.aAssigned}', 'private to this thread')
         returning id, child_id`,
      );
      const messageId = inserted.rows[0].id;
      assert.equal(
        inserted.rows[0].child_id,
        ID.childA,
        'the BEFORE trigger stamped child_id from the assignment, so the WAL record ' +
          'carries it and the policy can be decided from the record alone',
      );

      await s.asUser(ID.childBUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.messages where id = '${messageId}'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: for child B, messages_parent_all fails (is_parent() is false), ' +
          'messages_helper_select fails (is_helper() is false) and messages_select_own ' +
          'fails (my_child_id() is child B, the row says child A). No policy admits the ' +
          'row, so Realtime has nothing to deliver -- the channel filter is irrelevant, ' +
          'and so is what the subscriber asked for',
      );

      await s.asUser(ID.parent1User);
      const parentSees = await s.q(
        `select count(*)::int as n from public.messages where id = '${messageId}'`,
      );
      assert.equal(
        parentSees.rows[0].n,
        1,
        'proves: the same check passes for the parent, so the test above is not ' +
          'passing because the row is invisible to everyone',
      );

      await s.asUser(ID.parent2User);
      const otherFamily = await s.q(
        `select count(*)::int as n from public.messages where id = '${messageId}'`,
      );
      assert.equal(
        otherFamily.rows[0].n,
        0,
        'proves: another family cannot receive it either',
      );
    }),
  );

  test(
    'a child cannot pass the RLS check on a notification addressed to someone else',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(
        `update public.assignments set status = 'submitted' where id = '${ID.aAssigned}'`,
      );
      const [parentRow] = await notificationsAbout(
        ID.parent1User,
        'assignment_submitted',
        ID.aAssigned,
      );

      for (const [label, user] of [
        ['the child who triggered it', ID.childAUser],
        ['the sibling', ID.childBUser],
        ['another family', ID.parent2User],
      ]) {
        await s.asUser(user);
        const { rows } = await s.q(
          `select count(*)::int as n from public.notifications where id = '${parentRow.id}'`,
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: ${label} fails notifications_own_select, so Realtime will not ` +
            'broadcast the row to them however they subscribe',
        );
      }
    }),
  );
});

describe('23. a parent is told when a helper decides (0011)', () => {
  test(
    'a helper approving notifies the child AND the parent, naming the helper',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      await s.q(
        `update public.assignments
            set status = 'approved', review_comment = 'kargia'
          where id = '${ID.cAssignment}'`,
      );

      const child = await notificationsAbout(
        ID.childCUser,
        'assignment_approved',
        ID.cAssignment,
      );
      assert.equal(
        child.length,
        1,
        'proves: the child still hears the decision exactly as before 0011',
      );

      const parent = await notificationsAbout(
        ID.parent2User,
        'assignment_approved_by_helper',
        ID.cAssignment,
      );
      assert.equal(
        parent.length,
        1,
        'proves: delegating "can review" does not mean the parent stops being told -- ' +
          'without this a tutor could close the loop with no parent in it',
      );
      assert.ok(
        parent[0].payload?.actor_name,
        'proves: the row names who decided, so the parent can tell it was not them',
      );
    }),
  );

  test(
    'a helper returning work notifies the parent and carries the comment',
    tx(async () => {
      await s.asUser(ID.helperReviewUser);
      await s.q(
        `update public.assignments
            set status = 'redo', review_comment = 'meore da mesame arasworia'
          where id = '${ID.cAssignment}'`,
      );

      const parent = await notificationsAbout(
        ID.parent2User,
        'assignment_redo_by_helper',
        ID.cAssignment,
      );
      assert.equal(parent.length, 1, 'proves: a return is reported too, not only an approval');
      assert.equal(
        parent[0].payload?.preview,
        'meore da mesame arasworia',
        'proves: the parent sees what the helper actually told the child',
      );
    }),
  );

  test(
    'a parent reviewing does NOT notify themselves or the other parent',
    tx(async () => {
      const before = (await notificationsFor(ID.parent2User)).length;

      await s.asUser(ID.parent2User);
      await s.q(
        `update public.assignments set status = 'approved' where id = '${ID.cAssignment}'`,
      );

      const after = await notificationsFor(ID.parent2User);
      assert.equal(
        after.length,
        before,
        'proves: the by_helper rows fire on the reviewer NOT being a parent, not on ' +
          'the review happening -- ordinary parent reviews stay as quiet as they were',
      );
    }),
  );
});

// =============================================================================
// 24. The child records the homework they were given (SPEC 3.1, migration 0012)
//
// `assignments_insert_own` existed from 0004 but nothing inserted through it:
// `createAssignmentAction` is requireParent(), so until the kid create screen
// landed the policy was dead code. 0012 closes the gap it had — the row's own
// identity was pinned, what the row POINTED AT was not — and this block is the
// proof, in both directions: the child can do the thing the screen exists for,
// and cannot reach across to a sibling while doing it.
// =============================================================================
describe('24. a child can add their own homework, and only their own (0012)', () => {
  /** Everything the kid form is allowed to send, all at once. */
  const FULL_INSERT = `
    insert into public.assignments
      (child_id, title, description, source_ref, due_date, subject_id, lesson_id)
    values
      ('${ID.childA}', 'masc. gv. 45, savarjisho 3', 'nika chaicera',
       'wigni gv. 45', current_date + 1,
       '${ID.aSubject}'::uuid, '${ID.aLesson}'::uuid)
    returning id, status, redo_count, created_by,
              reviewed_by, reviewed_at, review_comment, submitted_at`;

  test(
    'child A can insert an assignment for themselves, and it lands as assigned',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows, rowCount } = await s.q(FULL_INSERT);

      assert.equal(rowCount, 1, 'proves: the insert was not refused');
      assert.equal(
        rows[0].status,
        'assigned',
        'proves: the column default is what a child-created row starts on, so the ' +
          'status machine begins at the top — the action never sends a status at all',
      );
      assert.deepEqual(
        {
          redo_count: rows[0].redo_count,
          reviewed_by: rows[0].reviewed_by,
          reviewed_at: rows[0].reviewed_at,
          review_comment: rows[0].review_comment,
          submitted_at: rows[0].submitted_at,
        },
        {
          redo_count: 0,
          reviewed_by: null,
          reviewed_at: null,
          review_comment: null,
          submitted_at: null,
        },
        'proves: nothing about the row pretends work has already happened to it',
      );
    }),
  );

  test(
    'the fields the child legitimately sets at INSERT are the ones 0007 freezes afterwards',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(FULL_INSERT);
      const id = rows[0].id;

      const stored = await s.rows(
        `select title, source_ref, due_date, subject_id, lesson_id, description
           from public.assignments where id = '${id}'`,
      );
      assert.equal(
        stored[0].title,
        'masc. gv. 45, savarjisho 3',
        'proves: the 0007 column lock is a BEFORE UPDATE trigger and does not touch an ' +
          'INSERT — the child really can write the title, source and due date of the ' +
          'homework THEY were given',
      );
      assert.equal(stored[0].source_ref, 'wigni gv. 45');
      assert.equal(stored[0].subject_id, ID.aSubject);
      assert.equal(stored[0].lesson_id, ID.aLesson);

      const error = await s.expectError(
        `update public.assignments set title = 'something else' where id = '${id}'`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves (and this is the pair to the test above): create-time is the ONLY time ' +
          'those fields belong to the child. Once the row exists 0007 freezes them, which ' +
          'is why the screen collects them before the insert rather than offering an edit ' +
          'after it',
      );
    }),
  );

  test(
    'homework that belongs to no lesson, subject or topic is allowed',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `insert into public.assignments (child_id, title)
         values ('${ID.childA}', 'daval. koridorshi mogvces')`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: 0012 constrains the foreign keys only when they are given — the "+" on ' +
          '/kid/assignments, which has no lesson to infer anything from, still works',
      );
    }),
  );

  test(
    'the insert is recorded in the append-only audit trail',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rows } = await s.q(FULL_INSERT);

      const events = await s.rows(
        `select from_status, to_status, actor_id
           from public.assignment_events where assignment_id = '${rows[0].id}'`,
      );
      assert.equal(events.length, 1, 'proves: exactly one birth event, not zero and not two');
      assert.deepEqual(
        {
          from: events[0].from_status,
          to: events[0].to_status,
          actor: events[0].actor_id,
        },
        { from: null, to: 'assigned', actor: ID.childAUser },
        'proves: assignments_log_insert names the child as the author of the row, so the ' +
          'parent-side "who entered this" label has something true behind it',
      );
    }),
  );

  test(
    'child A cannot insert an assignment FOR a sibling',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(
        `insert into public.assignments (child_id, title)
         values ('${ID.childB}', 'homework for my sister')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: child_id = my_child_id() is checked on INSERT, so a child cannot ' +
          'put work on a sibling list',
      );
    }),
  );

  // ---------------------------------------------------------------- 0012 ----
  // The three foreign keys. Before 0012 every one of these SUCCEEDED: the row
  // was the child's own, in the right state, merely hanging off their sibling's
  // structure.
  const SIBLING_KEYS = {
    lesson_id: ID.bLesson,
    subject_id: ID.bSubject,
    topic_id: ID.bTopic,
  };

  for (const [column, value] of Object.entries(SIBLING_KEYS)) {
    test(
      `child A cannot point assignments.${column} at a sibling row (0012)`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const error = await s.expectError(
          `insert into public.assignments (child_id, title, ${column})
           values ('${ID.childA}', 'grafted onto my sister', '${value}'::uuid)`,
        );
        assert.equal(
          error.code,
          '42501',
          `proves: 0012 makes assignments.${column} resolve back to the same child. ` +
            'Before it, this insert passed — the child never SAW the sibling row, but ' +
            'their homework hung off it, and the per-subject filters and the ' +
            'redo-rate-by-subject report then counted it against the wrong child',
        );
      }),
    );
  }

  test(
    'a sibling topic is refused even though topics carry no child_id',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const owner = await s.rows(
        `select public.topic_child_id('${ID.bTopic}') as child_id`,
      );
      assert.equal(
        owner[0].child_id,
        ID.childB,
        'proves: the check really does walk topics -> subjects -> child_id (the only ' +
          'route there is; topics has no child_id column of its own), and the security ' +
          'definer helper sees the sibling row that RLS hides from this caller — which ' +
          'is why the policy reuses it instead of inlining a join that would evaluate ' +
          'to null here',
      );
    }),
  );

  test(
    'child A CAN use their own lesson, subject and topic together',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `insert into public.assignments
           (child_id, title, lesson_id, subject_id, topic_id)
         values ('${ID.childA}', 'my own everything',
                 '${ID.aLesson}'::uuid, '${ID.aSubject}'::uuid, '${ID.aTopic}'::uuid)`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: 0012 tightened the policy without breaking it — the three rejections ' +
          'above are about ownership, not about the columns being unusable',
      );
    }),
  );

  // -------------------------------------------------- the initial state -----
  const FORGED_STATE = {
    'already approved': ['status', `'approved'`],
    'already submitted': ['status', `'submitted'`],
    'carrying a review comment': ['review_comment', `'kargia, davamtkice'`],
    'naming a reviewer': ['reviewed_by', `'${ID.parent1User}'::uuid`],
    'stamped as reviewed': ['reviewed_at', `now()`],
    'with redo_count already spent': ['redo_count', `3`],
  };

  for (const [what, [column, value]] of Object.entries(FORGED_STATE)) {
    test(
      `child A cannot insert an assignment ${what}`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const error = await s.expectError(
          `insert into public.assignments (child_id, title, ${column})
           values ('${ID.childA}', 'born reviewed', ${value})`,
        );
        assert.equal(
          error.code,
          '42501',
          'proves: a child-created row cannot skip the status machine or invent a ' +
            'review at birth — the UPDATE-time guard in 0007 never sees an INSERT, so ' +
            'the INSERT policy has to say this itself',
        );
      }),
    );
  }

  // ------------------------------------------------------------- parent -----
  test(
    'a parent can still insert for any child in their own family',
    tx(async () => {
      await s.asUser(ID.parent1User);
      for (const childId of [ID.childA, ID.childB]) {
        const { rowCount } = await s.q(
          `insert into public.assignments (child_id, title, created_by)
           values ('${childId}', 'set by the parent', '${ID.parent1User}'::uuid)`,
        );
        assert.equal(
          rowCount,
          1,
          'proves: 0012 rewrote the CHILD policy only — assignments_parent_all is ' +
            'untouched and the parent create screen still works for every child',
        );
      }
    }),
  );

  test(
    'a parent still cannot insert for a child outside their family',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const error = await s.expectError(
        `insert into public.assignments (child_id, title)
         values ('${ID.childC}', 'not my child')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: the family fence on inserts is where it was before this migration',
      );
    }),
  );

  test(
    'a parent may set the fields a child may not',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const { rowCount } = await s.q(
        `insert into public.assignments
           (child_id, title, priority, due_time, topic_id, created_by)
         values ('${ID.childA}', 'parent-set', 3, time '18:00',
                 '${ID.aTopic}'::uuid, '${ID.parent1User}'::uuid)`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: priority, due_time and topic stay the parent choice — the child action ' +
          'omits them entirely so they fall to the column defaults, and this row is what ' +
          'shows the columns themselves were never the problem',
      );
    }),
  );
});

// =============================================================================
// 25. Oral homework: a recording is solution evidence (SPEC 4 / C3)
//
// A large share of primary-school homework is oral â€” learn a poem, read a
// passage aloud, practise pronunciation â€” and a photo proves nothing about any
// of it. Audio therefore has to be a first-class second kind of solution
// evidence, which means two claims have to hold at the database level:
//
//   a) an `attachments` row whose mime is audio is an ordinary attachment. It
//      is not a new `kind`, it needs no new policy, and it is fenced by
//      child_id exactly like a photo â€” including the fact that the child_id it
//      claims is discarded and re-derived (0007);
//   b) the storage fence is about the PATH, not the extension. `.m4a` under a
//      sibling's prefix is refused for precisely the same reason `.webp` is.
//
// The first test also records why there is no `0013_*.sql`: the bucket 0005
// created already declares the audio mimes and a 10 MB ceiling, so nothing in
// the migrations had to be relaxed to make any of this work.
// =============================================================================
describe('25. a recording is solution evidence, fenced exactly like a photo', () => {
  /** What `src/lib/images.ts` labels an upload with, after canonicalisation. */
  const AUDIO_MIMES = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg'];

  /** `{child}/{second}/{uuid}.{ext}`, unique per call. */
  const objectName = (child, second, ext) =>
    `${child}/${second}/25-${Math.random().toString(16).slice(2)}.${ext}`;

  const INSERT_AUDIO_ROW = `
    insert into public.attachments
      (assignment_id, child_id, kind, storage_path, mime, size_bytes)
    values ($1, $2, $3, $4, $5, 900000)`;

  test(
    'the evidence bucket already accepts audio â€” no migration had to relax it',
    tx(async () => {
      await s.asService();
      const rows = await s.rows(
        `select allowed_mime_types, file_size_limit, public
           from storage.buckets where id = 'evidence'`,
      );
      assert.equal(rows.length, 1, 'proves: 0005 created the bucket');

      for (const mime of AUDIO_MIMES) {
        assert.ok(
          rows[0].allowed_mime_types.includes(mime),
          `proves: the bucket declares ${mime}, so a recording is refused by nothing in ` +
            'the schema â€” this is the assertion that makes a 0013 migration unnecessary ' +
            'rather than merely unwritten',
        );
      }
      assert.equal(
        Number(rows[0].file_size_limit),
        10485760,
        'proves: MAX_AUDIO_BYTES in src/lib/images.ts and the bucket agree on 10 MB, so ' +
          'the storage service refuses an oversized recording mid-upload and the ' +
          'server-side re-check in registerAttachmentAction is never the only guard',
      );
      assert.equal(
        rows[0].public,
        false,
        'proves: a recording of a child reading aloud sits behind a signed URL like every ' +
          'photo â€” audio did not quietly open the bucket',
      );
    }),
  );

  // ---------------------------------------------------------------- rows ----
  for (const mime of AUDIO_MIMES) {
    test(
      `child A can attach ${mime} to their own assignment as solution evidence`,
      tx(async () => {
        await s.asUser(ID.childAUser);
        const { rows, rowCount } = await s.q(
          `${INSERT_AUDIO_ROW} returning child_id, uploaded_by, mime, width, height`,
          [
            ID.aAssigned,
            ID.childA,
            'solution',
            objectName(ID.childA, ID.aAssigned, 'm4a'),
            mime,
          ],
        );

        assert.equal(
          rowCount,
          1,
          `proves: ${mime} needs no policy of its own â€” attachments_insert_own already ` +
            'covers it, because what it fences is the child and the kind, not the format',
        );
        assert.equal(rows[0].mime, mime, 'proves: the mime is stored as given');
        assert.deepEqual(
          { child: rows[0].child_id, by: rows[0].uploaded_by },
          { child: ID.childA, by: ID.childAUser },
          'proves: 0007 still derives child_id and uploaded_by for a recording',
        );
        assert.deepEqual(
          { w: rows[0].width, h: rows[0].height },
          { w: null, h: null },
          'proves: a recording carries no pixel size, which is what ' +
            'registerAttachmentAction forces to null rather than storing the browser claim',
        );
      }),
    );
  }

  test(
    'child A cannot attach a recording to a sibling assignment',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(INSERT_AUDIO_ROW, [
        ID.bAssigned,
        ID.childB,
        'solution',
        objectName(ID.childB, ID.bAssigned, 'm4a'),
        'audio/mp4',
      ]);
      assert.equal(
        error.code,
        '42501',
        'proves: a child cannot put a recording on a sibling homework row â€” refused for ' +
          'exactly the reason a photo would be',
      );
    }),
  );

  test(
    'claiming their own child_id does not smuggle a recording onto a sibling assignment',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(INSERT_AUDIO_ROW, [
        ID.bAssigned,
        ID.childA,
        'solution',
        objectName(ID.childA, ID.bAssigned, 'm4a'),
        'audio/mp4',
      ]);
      assert.equal(
        error.code,
        '42501',
        'proves: sending their OWN child_id while pointing at a sibling assignment fails ' +
          'too â€” 0007 overwrites the claim with the assignment owner before the policy is ' +
          'evaluated, so the forged value never helps',
      );
    }),
  );

  test(
    'a child cannot file a recording as review evidence',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const error = await s.expectError(INSERT_AUDIO_ROW, [
        ID.aAssigned,
        ID.childA,
        'review',
        objectName(ID.childA, ID.aAssigned, 'm4a'),
        'audio/mp4',
      ]);
      assert.equal(
        error.code,
        '42501',
        'proves: audio did not widen what a child may claim to be â€” `review` is still the ' +
          'reviewer kind, whatever the format',
      );
    }),
  );

  test(
    'a sibling cannot read the recording, the parent can',
    tx(async () => {
      const name = objectName(ID.childA, ID.aAssigned, 'm4a');

      await s.asUser(ID.childAUser);
      await s.q(INSERT_AUDIO_ROW, [
        ID.aAssigned,
        ID.childA,
        'solution',
        name,
        'audio/mp4',
      ]);

      await s.asUser(ID.childBUser);
      const sibling = await s.rows(
        `select id from public.attachments where storage_path = $1`,
        [name],
      );
      assert.equal(
        sibling.length,
        0,
        'proves: a child reading a poem aloud is not audible to their sibling',
      );

      await s.asUser(ID.parent1User);
      const parent = await s.rows(
        `select id from public.attachments where storage_path = $1`,
        [name],
      );
      assert.equal(
        parent.length,
        1,
        'proves: the person who actually has to listen to it does see it',
      );
    }),
  );

  test(
    'an assignment whose only solution evidence is audio is submittable',
    tx(async () => {
      await s.asUser(ID.childAUser);
      await s.q(INSERT_AUDIO_ROW, [
        ID.aAssigned,
        ID.childA,
        'solution',
        objectName(ID.childA, ID.aAssigned, 'm4a'),
        'audio/mp4',
      ]);

      // Exactly the query submitAssignmentAction runs before it allows a
      // submission: kind = 'solution', deliberately NOT narrowed by mime.
      const counted = await s.rows(
        `select count(*)::int as n from public.attachments
          where assignment_id = $1 and kind = 'solution'`,
        [ID.aAssigned],
      );
      assert.ok(
        counted[0].n >= 1,
        'proves: the "at least one piece of solution evidence" gate is satisfied by a ' +
          'recording alone. While that gate asked for a photo, a child literally could ' +
          'not hand in oral homework at all',
      );

      const { rowCount } = await s.q(
        `update public.assignments set status = 'submitted' where id = $1`,
        [ID.aAssigned],
      );
      assert.equal(
        rowCount,
        1,
        'proves: and the status machine itself never cared about the format',
      );
    }),
  );

  // ------------------------------------------------------------- storage ----
  for (const ext of ['m4a', 'mp3', 'ogg', 'webm']) {
    test(
      `child A can INSERT their own .${ext} object, and not one under child B prefix`,
      tx(async () => {
        await s.asUser(ID.childAUser);

        const mine = objectName(ID.childA, ID.aAssigned, ext);
        const { rowCount } = await s.q(
          `insert into storage.objects (bucket_id, name, owner)
           values ('evidence', $1, $2)`,
          [mine, ID.childAUser],
        );
        assert.equal(
          rowCount,
          1,
          `proves: ${mine} is accepted â€” storage_child_id() reads the first segment and ` +
            'has no opinion whatsoever about the extension',
        );

        const theirs = objectName(ID.childB, ID.bAssigned, ext);
        const error = await s.expectError(
          `insert into storage.objects (bucket_id, name, owner)
           values ('evidence', $1, $2)`,
          [theirs, ID.childAUser],
        );
        assert.equal(
          error.code,
          '42501',
          `proves: ${theirs} is refused. The audio fence is the SAME single ` +
            'first-segment policy test 9 proves for photos â€” a new format did not add a ' +
            'way around it',
        );
      }),
    );
  }

  test(
    'a lesson-shaped audio path is fenced too',
    tx(async () => {
      await s.asUser(ID.childAUser);

      const suffix = () => Math.random().toString(16).slice(2);
      const mine = `${ID.childA}/lesson/${ID.aLesson}/25-${suffix()}.m4a`;
      const { rowCount } = await s.q(
        `insert into storage.objects (bucket_id, name, owner)
         values ('evidence', $1, $2)`,
        [mine, ID.childAUser],
      );
      assert.equal(
        rowCount,
        1,
        'proves: the four-segment shape works for audio as well',
      );

      const theirs = `${ID.childB}/lesson/${ID.bLesson}/25-${suffix()}.m4a`;
      const error = await s.expectError(
        `insert into storage.objects (bucket_id, name, owner)
         values ('evidence', $1, $2)`,
        [theirs, ID.childAUser],
      );
      assert.equal(
        error.code,
        '42501',
        'proves: both path shapes stay covered by the one policy, for audio as for images',
      );
    }),
  );

  test(
    'child A cannot rename their own recording into child B prefix',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const mine = objectName(ID.childA, ID.aAssigned, 'm4a');
      await s.q(
        `insert into storage.objects (bucket_id, name, owner)
         values ('evidence', $1, $2)`,
        [mine, ID.childAUser],
      );

      const error = await s.expectError(
        `update storage.objects set name = $1 where name = $2`,
        [objectName(ID.childB, ID.bAssigned, 'm4a'), mine],
      );
      assert.equal(
        error.code,
        '42501',
        'proves: evidence_child_update re-evaluates the NEW name for a recording too, so ' +
          'a child cannot plant audio in a sibling folder by renaming their own',
      );
    }),
  );

  test(
    'child A cannot delete a sibling recording, and the parent reaches both',
    tx(async () => {
      const aName = objectName(ID.childA, ID.aAssigned, 'm4a');
      const bName = objectName(ID.childB, ID.bAssigned, 'm4a');

      await s.asService();
      await s.q(
        `insert into storage.objects (bucket_id, name, owner)
         values ('evidence', $1, $2), ('evidence', $3, $4)`,
        [aName, ID.childAUser, bName, ID.childBUser],
      );

      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from storage.objects where name = $1`,
        [bName],
      );
      assert.equal(
        rowCount,
        0,
        'proves: a child cannot delete a sibling recording',
      );

      await s.asUser(ID.parent1User);
      const seen = await s.rows(
        `select name from storage.objects where name in ($1, $2) order by 1`,
        [aName, bName],
      );
      assert.equal(
        seen.length,
        2,
        'proves: evidence_parent_all spans both children for audio, which is what lets the ' +
          'review screen play a recitation from either of them',
      );
    }),
  );
});

// =============================================================================
// 26. The delete window: a bad take is removable, handed-in work is not (0013)
//
// Audio made this urgent. A first take of a recitation is almost always
// scrapped, and until 0013 a child who reloaded the page could not take one
// back — `PhotoUploader` only offers an X on tiles it uploaded in the current
// session. The review screen now offers the child a delete on their own
// solution evidence, so the question "when is that legitimate?" has to have an
// answer in the database and not only in a React prop.
//
// The rule 0013 writes down:
//
//   assigned | in_progress | redo   -> the child may delete their own evidence
//   submitted | approved            -> only a parent may
//
// and, in every status: never a `review` annotation, and `chat` images are not
// fenced at all (a photo in a conversation is a message, it hangs off the
// assignment only so RLS can find its child).
//
// The interesting failure mode here is silence. RLS turns a forbidden DELETE
// into "0 rows affected", not an error, so every refusal below asserts BOTH the
// row count AND that the row is still present afterwards — a policy that
// deleted the row and reported nothing, and a policy that refused, are
// otherwise indistinguishable.
// =============================================================================
describe('26. a child may take back evidence only before handing it in (0013)', () => {
  const objectName = (child, assignment) =>
    `${child}/${assignment}/26-${Math.random().toString(16).slice(2)}.webp`;

  /** Insert one attachment with service rights, returning its id. */
  async function seedAttachment({
    assignment = null,
    lesson = null,
    message = null,
    child = ID.childA,
    kind = 'solution',
    uploadedBy = ID.childAUser,
  } = {}) {
    await s.asService();
    const { rows } = await s.q(
      `insert into public.attachments
         (assignment_id, lesson_id, message_id, child_id, kind, storage_path,
          mime, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, 'image/webp', 12345, $7)
       returning id`,
      [
        assignment,
        lesson,
        message,
        child,
        kind,
        objectName(child, assignment ?? lesson ?? message ?? 'x'),
        uploadedBy,
      ],
    );
    return rows[0].id;
  }

  async function stillThere(id) {
    await s.asService();
    const rows = await s.rows(
      `select id from public.attachments where id = $1`,
      [id],
    );
    return rows.length === 1;
  }

  // ------------------------------------------------------------- open ------
  for (const [label, assignment] of [
    ['assigned', ID.aAssigned],
    ['in_progress', ID.aInProgress],
    ['redo', ID.aRedo],
  ]) {
    test(
      `child A can delete their own solution evidence while the work is ${label}`,
      tx(async () => {
        const id = await seedAttachment({ assignment });

        await s.asUser(ID.childAUser);
        const { rowCount } = await s.q(
          `delete from public.attachments where id = $1`,
          [id],
        );

        assert.equal(
          rowCount,
          1,
          `proves: while the assignment is ${label} the evidence is still the child's to ` +
            'change, which is the whole point of the affordance — a scrapped first take ' +
            'must not survive a page reload',
        );
        assert.equal(
          await stillThere(id),
          false,
          'proves: the row really went, rather than the delete being reported and ignored',
        );
      }),
    );
  }

  // ------------------------------------------------------------ closed -----
  for (const [label, assignment] of [
    ['submitted', ID.aSubmitted],
    ['approved', ID.aApproved],
  ]) {
    test(
      `child A cannot delete their own solution evidence once the work is ${label}`,
      tx(async () => {
        const id = await seedAttachment({ assignment });

        await s.asUser(ID.childAUser);
        const { rowCount } = await s.q(
          `delete from public.attachments where id = $1`,
          [id],
        );

        assert.equal(
          rowCount,
          0,
          `proves: from ${label} onwards what the parent is looking at is what the child ` +
            'sent — the evidence cannot be edited out from under a review, and the UI ' +
            'hiding the button is not the only thing stopping it',
        );
        assert.equal(
          await stillThere(id),
          true,
          'proves: the refusal is a refusal, not a silent delete',
        );
      }),
    );
  }

  test(
    'the same child can still delete their own TASK photo only before submission',
    tx(async () => {
      const open = await seedAttachment({
        assignment: ID.aInProgress,
        kind: 'task_source',
      });
      const closed = await seedAttachment({
        assignment: ID.aSubmitted,
        kind: 'task_source',
      });

      await s.asUser(ID.childAUser);
      const openDelete = await s.q(
        `delete from public.attachments where id = $1`,
        [open],
      );
      const closedDelete = await s.q(
        `delete from public.attachments where id = $1`,
        [closed],
      );

      assert.equal(
        openDelete.rowCount,
        1,
        'proves: a child who photographed the wrong page of the book can replace it',
      );
      assert.equal(
        closedDelete.rowCount,
        0,
        'proves: the fence covers task_source too — deleting the photo of what was set, ' +
          'after handing in work against it, would rewrite the record of the assignment',
      );
    }),
  );

  test(
    'a child cannot delete a review annotation, even while the work is open',
    tx(async () => {
      // uploaded_by is deliberately the CHILD here. A real review attachment is
      // uploaded by the parent and the `uploaded_by = auth.uid()` clause alone
      // would refuse it; forging that clause away is what isolates the new
      // `kind <> 'review'` one and proves it is doing work of its own.
      const id = await seedAttachment({
        assignment: ID.aInProgress,
        kind: 'review',
        uploadedBy: ID.childAUser,
      });

      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from public.attachments where id = $1`,
        [id],
      );

      assert.equal(
        rowCount,
        0,
        "proves: the parent's own annotation of the work is never the child's to remove, " +
          'whatever status the assignment is in',
      );
      assert.equal(await stillThere(id), true, 'proves: the row survived');
    }),
  );

  test(
    'a chat image is not fenced by the status of the assignment it hangs off',
    tx(async () => {
      await s.asService();
      const { rows: message } = await s.q(
        `insert into public.messages (assignment_id, child_id, author_id, body)
         values ($1, $2, $3, 'gamarjoba') returning id`,
        [ID.aSubmitted, ID.childA, ID.childAUser],
      );
      const id = await seedAttachment({
        assignment: ID.aSubmitted,
        message: message[0].id,
        kind: 'chat',
      });

      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from public.attachments where id = $1`,
        [id],
      );

      assert.equal(
        rowCount,
        1,
        'proves: 0013 fences evidence OF the work, not the conversation about it — a ' +
          'submitted assignment must not make the thread partly immutable',
      );
    }),
  );

  test(
    'a lesson photo carries no assignment status and is untouched',
    tx(async () => {
      const id = await seedAttachment({
        assignment: null,
        lesson: ID.aLesson,
        kind: 'task_source',
      });

      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from public.attachments where id = $1`,
        [id],
      );

      assert.equal(
        rowCount,
        1,
        'proves: the `assignment_id is null` branch keeps A3 lesson screens working ' +
          'exactly as they did',
      );
    }),
  );

  test(
    'a parent still deletes evidence in any status, which is the escape hatch',
    tx(async () => {
      const submitted = await seedAttachment({ assignment: ID.aSubmitted });
      const approved = await seedAttachment({ assignment: ID.aApproved });

      await s.asUser(ID.parent1User);
      const { rowCount } = await s.q(
        `delete from public.attachments where id in ($1, $2)`,
        [submitted, approved],
      );

      assert.equal(
        rowCount,
        2,
        'proves: attachments_parent_all is untouched by 0013 — a mis-shot photo is still ' +
          'fixable after submission, by the one person the fence is protecting',
      );
    }),
  );

  test(
    'a child still cannot reach a sibling recording through the new clause',
    tx(async () => {
      const id = await seedAttachment({
        assignment: ID.bSubmitted,
        child: ID.childB,
        uploadedBy: ID.childBUser,
      });

      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `delete from public.attachments where id = $1`,
        [id],
      );

      assert.equal(
        rowCount,
        0,
        'proves: adding a status branch did not widen the child fence — child_id is still ' +
          'the first thing the policy checks',
      );
      assert.equal(await stillThere(id), true, 'proves: the row survived');
    }),
  );

  test(
    'the status lookup the policy uses is security definer and closed to anon',
    tx(async () => {
      await s.asService();
      const rows = await s.rows(
        `select p.prosecdef, p.provolatile,
                has_function_privilege('anon', p.oid, 'execute')          as anon_ok,
                has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'assignment_status'`,
      );

      assert.equal(rows.length, 1, 'proves: 0013 created the lookup');
      assert.equal(
        rows[0].prosecdef,
        true,
        'proves: it is security definer — a policy body runs as the caller, so a plain ' +
          'select inside it would be filtered by the assignments policies and evaluate to ' +
          'null, which reads as "deny" and would hide the real rule',
      );
      assert.equal(
        rows[0].provolatile,
        's',
        'proves: STABLE, so the planner may call it once per statement rather than per row',
      );
      assert.deepEqual(
        { anon: rows[0].anon_ok, authenticated: rows[0].auth_ok },
        { anon: false, authenticated: true },
        'proves: the grant matches every other helper in 0003 — anon can execute nothing',
      );
    }),
  );
});

// =============================================================================
// 27. Push subscriptions: a device list is personal, not family data (0014)
//
// `push_subscriptions` is the second table in the schema whose RLS has no
// family clause at all, and the reason is sharper than it is for
// `notifications`. An endpoint is a CAPABILITY: whoever holds it plus the two
// keys can make that phone light up, at any hour, with any text they like. A
// parent has no business reading their child's, a helper has no business
// reading anybody's, and the only correct scope is `user_id = auth.uid()` on
// every verb.
//
// The five questions that matter:
//   a. can I see my own?                                          yes
//   b. can I see somebody else's — child, parent, other family?   no
//   c. can I register a device in somebody else's name?           refused
//   d. can I delete or hijack somebody else's row?                zero / refused
//   e. is anon refused rather than merely empty?                  42501
//
// Block 13 already walks anon across every table including this one; (e) here
// is the write side of the same question. The last two tests cover the other
// half of 0014: the `pushed_at` marker that keeps a collapsed burst to one buzz.
// =============================================================================
describe('27. a push subscription belongs to one user and nobody else (0014)', () => {
  test(
    'the table exists, has RLS on, and grants anon nothing',
    tx(async () => {
      await s.asService();
      const [table] = await s.rows(
        `select c.relrowsecurity
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'push_subscriptions'`,
      );
      assert.ok(table, 'proves: migration 0014 created public.push_subscriptions');
      assert.equal(
        table.relrowsecurity,
        true,
        'proves: RLS is ON — without it the four policies below are decoration',
      );

      const grants = await s.rows(
        `select privilege_type
           from information_schema.role_table_grants
          where table_schema = 'public'
            and table_name = 'push_subscriptions'
            and grantee = 'anon'`,
      );
      assert.deepEqual(
        grants,
        [],
        'proves: 0014 revoked the ALL that bootstrap default-privileges hands every new ' +
          'table, so an unauthenticated request is a privilege failure and not an empty 200. ' +
          `Leaked: ${JSON.stringify(grants)}`,
      );
    }),
  );

  test(
    'a user reads their own subscriptions and only those',
    tx(async () => {
      await s.asUser(ID.parent1User);

      const mine = await s.rows(
        `select id, user_id from public.push_subscriptions order by id`,
      );
      assert.equal(
        mine.length,
        1,
        'proves: an unqualified select returns exactly the caller own row — three exist in ' +
          `the fixture (parent 1, child A, parent 2) and the policy hides two. Got ${mine.length}`,
      );
      assert.equal(
        mine[0].user_id,
        ID.parent1User,
        'proves: the one row visible is the caller own',
      );
    }),
  );

  test(
    'a parent cannot read the device their own child registered',
    tx(async () => {
      await s.asUser(ID.parent1User);
      const { rows } = await s.q(
        `select count(*)::int as n from public.push_subscriptions
          where user_id = '${ID.childAUser}'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: this is NOT family data. The parent reads every assignment, message and ' +
          'photo of this child and still cannot read the endpoint that would let them push ' +
          'arbitrary text to the phone. The fence is per user, deliberately tighter than ' +
          'every other table in the schema.',
      );
    }),
  );

  test(
    'a child cannot read a parent, or anyone in another family',
    tx(async () => {
      await s.asUser(ID.childAUser);

      for (const [who, userId] of [
        ['their own parent', ID.parent1User],
        ['a parent of another family', ID.parent2User],
      ]) {
        const { rows } = await s.q(
          `select count(*)::int as n from public.push_subscriptions where user_id = $1`,
          [userId],
        );
        assert.equal(
          rows[0].n,
          0,
          `proves: child A sees no subscription belonging to ${who}`,
        );
      }

      const { rows: own } = await s.q(
        `select count(*)::int as n from public.push_subscriptions
          where user_id = '${ID.childAUser}'`,
      );
      assert.ok(
        own[0].n > 0,
        'proves: child A really can read their OWN row, so the two zeroes above are a ' +
          'denial and not an empty table',
      );
    }),
  );

  test(
    'a helper sees nothing, not even for the child they were given',
    tx(async () => {
      await s.asUser(ID.helperViewUser);
      const { rows } = await s.q(
        `select count(*)::int as n from public.push_subscriptions`,
      );
      assert.equal(
        rows[0].n,
        0,
        'proves: a helper with full view+comment rights over child C reads zero rows here. ' +
          '0010 widened several tables for helpers; this one was not among them and must ' +
          'not be widened later by accident.',
      );
    }),
  );

  test(
    'a user cannot register a device in somebody else name',
    tx(async () => {
      await s.asUser(ID.childAUser);

      const error = await s.expectError(
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
         values ('${ID.parent1User}',
                 'https://fcm.googleapis.test/fcm/send/forged', 'k', 'a')`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: push_subscriptions_own_insert pins user_id to auth.uid() in its WITH CHECK, ' +
          'so a child cannot point their parent notifications at a device they hold. ' +
          `Got ${error.code}: ${error.message}`,
      );
    }),
  );

  test(
    'a user CAN register a device in their own name, so the refusal above is the policy',
    tx(async () => {
      await s.asUser(ID.childAUser);
      const { rowCount } = await s.q(
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
         values ('${ID.childAUser}',
                 'https://fcm.googleapis.test/fcm/send/childa-second', 'k', 'a')`,
      );
      assert.equal(
        rowCount,
        1,
        'proves: the insert path works for the caller own user_id — the test above is a ' +
          'fence, not a broken statement',
      );
    }),
  );

  test(
    'a user cannot delete somebody else device',
    tx(async () => {
      await s.asUser(ID.childAUser);

      const { rowCount } = await s.q(
        `delete from public.push_subscriptions where id = '${ID.pushParent1}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: the parent row is not visible to the DELETE at all — a child cannot ' +
          'silence their parent phone',
      );

      await s.asService();
      const { rows } = await s.q(
        `select count(*)::int as n from public.push_subscriptions
          where id = '${ID.pushParent1}'`,
      );
      assert.equal(
        rows[0].n,
        1,
        'proves: the row really is still there — the zero above is RLS, not a missing row',
      );
    }),
  );

  test(
    'a user cannot hand their own device to another account, or steal one',
    tx(async () => {
      await s.asUser(ID.childAUser);

      // USING passes (the row is mine) but WITH CHECK must reject the new owner.
      const error = await s.expectError(
        `update public.push_subscriptions set user_id = '${ID.parent1User}'
          where id = '${ID.pushChildA}'`,
      );
      assert.equal(
        error.code,
        '42501',
        'proves: push_subscriptions_own_update carries WITH CHECK as well as USING, so a row ' +
          'cannot be re-pointed at another account and start delivering their notifications ' +
          `to a device the caller holds. Got ${error.code}`,
      );

      const { rowCount } = await s.q(
        `update public.push_subscriptions set p256dh = 'stolen'
          where id = '${ID.pushParent1}'`,
      );
      assert.equal(
        rowCount,
        0,
        'proves: the other direction is closed too — somebody else row is invisible to an UPDATE',
      );
    }),
  );

  test(
    'anon is refused on write as well as on read',
    tx(async () => {
      await s.asAnon();
      for (const sql of [
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
         values ('${ID.parent1User}', 'https://fcm.googleapis.test/fcm/send/anon', 'k', 'a')`,
        `update public.push_subscriptions set p256dh = 'x'`,
        `delete from public.push_subscriptions`,
      ]) {
        const error = await s.expectError(sql);
        assert.equal(
          error.code,
          '42501',
          `proves: anon holds no privilege on push_subscriptions (${sql.trim().split(' ')[0]}) — ` +
            'the refusal is a privilege failure, so it survives any future policy mistake',
        );
      }
    }),
  );

  test(
    'the endpoint is unique table-wide, so a device that changes hands moves',
    tx(async () => {
      await s.asService();
      const error = await s.expectError(
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
         values ('${ID.parent2User}',
                 'https://fcm.googleapis.test/fcm/send/parent1-endpoint', 'k', 'a')`,
      );
      assert.equal(
        error.code,
        '23505',
        'proves: endpoint is unique across the whole table, not per user. The endpoint IS the ' +
          'browser: two rows for one endpoint would mean one phone buzzing twice, and a phone ' +
          'that changes owner must MOVE rather than gain a second row that keeps delivering ' +
          `the previous owner family notifications. Got ${error.code}`,
      );

      // ... and the upsert the server action actually performs does move it.
      const { rowCount } = await s.q(
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
         values ('${ID.parent2User}',
                 'https://fcm.googleapis.test/fcm/send/parent1-endpoint', 'k2', 'a2')
         on conflict (endpoint) do update
            set user_id = excluded.user_id,
                p256dh = excluded.p256dh,
                auth_key = excluded.auth_key`,
      );
      assert.equal(rowCount, 1, 'proves: the upsert the server action uses succeeds');

      const { rows } = await s.q(
        `select user_id from public.push_subscriptions where id = '${ID.pushParent1}'`,
      );
      assert.equal(
        rows[0].user_id,
        ID.parent2User,
        'proves: re-subscribing REPLACED the row rather than accumulating a duplicate',
      );
    }),
  );

  test(
    'notifications.pushed_at is claimed once, atomically, and is frozen against its owner',
    tx(async () => {
      await s.asService();
      const { rows: created } = await s.q(
        `insert into public.notifications (user_id, type, payload)
         values ('${ID.parent1User}', 'assignment_submitted',
                 jsonb_build_object('assignment_id', '${ID.aSubmitted}'))
         returning id, pushed_at`,
      );
      assert.equal(
        created[0].pushed_at,
        null,
        'proves: 0014 added the column with no default — a fresh notification is undelivered',
      );

      const claimed = await s.rows(
        `update public.notifications set pushed_at = now()
          where id = $1 and pushed_at is null
         returning id`,
        [created[0].id],
      );
      assert.equal(
        claimed.length,
        1,
        'proves: the claim is one UPDATE ... WHERE pushed_at IS NULL ... RETURNING, so it is ' +
          'atomic and two racing server actions cannot both win the same row',
      );

      const again = await s.rows(
        `update public.notifications set pushed_at = now()
          where id = $1 and pushed_at is null
         returning id`,
        [created[0].id],
      );
      assert.deepEqual(
        again,
        [],
        'proves: a second attempt claims nothing — the delivery path sends one push per row ' +
          'and no more',
      );

      await s.asUser(ID.parent1User);
      const error = await s.expectError(
        `update public.notifications set pushed_at = null where id = $1`,
        [created[0].id],
      );
      assert.equal(
        error.code,
        '42501',
        'proves: notifications_owner_update_guard, extended by 0014, freezes pushed_at against ' +
          `the owner exactly as it freezes payload and type. Got ${error.code}`,
      );

      const { rowCount } = await s.q(
        `update public.notifications set read_at = now() where id = $1`,
        [created[0].id],
      );
      assert.equal(
        rowCount,
        1,
        'proves: read_at is still the one column the owner may write — the guard was extended, ' +
          'not tightened into uselessness',
      );
    }),
  );

  test(
    'the 0009 collapse does not clear pushed_at, which is the whole anti-buzz mechanism',
    tx(async () => {
      await s.asService();

      const [first] = await s.rows(
        `select public.enqueue_notification(
                  '${ID.parent1User}', 'message_posted',
                  jsonb_build_object('assignment_id', '${ID.aSubmitted}',
                                     'preview', 'first')) as id`,
      );
      await s.q(`update public.notifications set pushed_at = now() where id = $1`, [
        first.id,
      ]);

      // The seed may already hold an unread message_posted row for this pair, in
      // which case the call above collapsed into it. Measure the delta, not an
      // absolute — the point is that the SECOND message adds to the same row.
      const [before] = await s.rows(
        `select coalesce((payload ->> 'count')::int, 1) as count
           from public.notifications where id = $1`,
        [first.id],
      );

      const [second] = await s.rows(
        `select public.enqueue_notification(
                  '${ID.parent1User}', 'message_posted',
                  jsonb_build_object('assignment_id', '${ID.aSubmitted}',
                                     'preview', 'second')) as id`,
      );
      assert.equal(
        second.id,
        first.id,
        'proves: 0009 collapsed the second message into the same unread row',
      );

      const [row] = await s.rows(
        `select pushed_at, payload ->> 'count' as count
           from public.notifications where id = $1`,
        [first.id],
      );
      assert.equal(
        Number(row.count),
        before.count + 1,
        'proves: the collapse did happen — the second message was folded into the same row ' +
          'and bumped its count rather than creating a row of its own',
      );
      assert.notEqual(
        row.pushed_at,
        null,
        'proves: and it left pushed_at alone. The delivery path therefore claims nothing for ' +
          'the second message, so the parent phone buzzes once for a conversation rather ' +
          'than once per line. THIS is why three messages are not three buzzes.',
      );
    }),
  );
});
