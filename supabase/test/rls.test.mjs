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
