/**
 * Check a real Supabase project against what this app expects.
 *
 *   npm run doctor
 *
 * Reads .env.local, then asks the live project the questions that actually go
 * wrong on a first setup: are the keys the right way round, did every migration
 * run, is the bucket private, is `anon` really locked out. Read-only — it
 * creates nothing and changes nothing.
 *
 * Output is Georgian because the person running it is the person setting the
 * project up.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const ENV_FILE = path.join(REPO, ".env.local");

const PASS = "[32m✓[0m";
const FAIL = "[31m✗[0m";
const WARN = "[33m![0m";

let failures = 0;
const ok = (m) => console.log(`${PASS} ${m}`);
const bad = (m, hint) => {
  failures += 1;
  console.log(`${FAIL} ${m}`);
  if (hint) console.log(`    → ${hint}`);
};
const warn = (m, hint) => {
  console.log(`${WARN} ${m}`);
  if (hint) console.log(`    → ${hint}`);
};

// ---------------------------------------------------------------- env ------

if (!fs.existsSync(ENV_FILE)) {
  console.log(`${FAIL} .env.local ვერ მოიძებნა`);
  console.log("    → იხილე docs/SETUP.md, ნაბიჯი 2");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "CHILD_AUTH_SECRET",
];

console.log("\n[1mგარემოს ცვლადები[0m");
let envOk = true;
for (const key of REQUIRED) {
  if (!env[key]) {
    bad(`${key} ცარიელია`, "docs/SETUP.md, ნაბიჯი 2");
    envOk = false;
  }
}
if (!envOk) process.exit(1);

const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
  warn(
    "NEXT_PUBLIC_SUPABASE_URL უცნაურად გამოიყურება",
    "უნდა იყოს https://xxxxx.supabase.co, ბოლოში ხაზის გარეშე",
  );
} else {
  ok("Supabase-ის მისამართი");
}

/**
 * Which kind of key this is. Supabase has two formats in the wild: the legacy
 * JWTs, where the role sits in the payload, and the newer `sb_publishable_` /
 * `sb_secret_` keys, where the prefix says it outright.
 */
function keyRole(token) {
  if (!token) return null;
  if (token.startsWith("sb_publishable_")) return "anon";
  if (token.startsWith("sb_secret_")) return "service_role";
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return payload.role ?? null;
  } catch {
    return null;
  }
}

const anonRole = keyRole(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const svcRole = keyRole(env.SUPABASE_SERVICE_ROLE_KEY);

if (anonRole === "service_role" || svcRole === "anon") {
  bad(
    "გასაღებები ადგილებია გადანაცვლებული",
    "anon და service_role ერთმანეთშია აღრეული — გაასწორე .env.local-ში",
  );
} else if (anonRole && svcRole) {
  ok("გასაღებები სწორ ადგილასაა (anon / service_role)");
} else {
  warn("გასაღებების ამოცნობა ვერ მოხერხდა (ახალი ფორმატი?) — ვაგრძელებ");
}

if (env.CHILD_AUTH_SECRET.length < 32) {
  bad(
    "CHILD_AUTH_SECRET ძალიან მოკლეა",
    'დააგენერირე: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"',
  );
} else {
  ok("CHILD_AUTH_SECRET");
}

// ------------------------------------------------------------- schema ------

const rest = `${url}/rest/v1`;
const svc = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
const anon = {
  apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
};

async function head(table, headers) {
  const res = await fetch(`${rest}/${table}?select=*&limit=1`, {
    headers: { ...headers, Prefer: "count=exact" },
  });
  return res;
}

const TABLES = [
  "profiles",
  "families",
  "family_members",
  "children",
  "subjects",
  "schedule_slots",
  "lessons",
  "topics",
  "assignments",
  "assignment_events",
  "attachments",
  "messages",
  "message_reads",
  "grades",
  "topic_mastery",
  "notifications",
  "helper_invitations",
  "push_subscriptions",
];

console.log("\n[1mბაზა[0m");

let reachable = true;
try {
  const res = await head("profiles", svc);
  if (res.status === 401 || res.status === 403) {
    bad("service_role გასაღები არ მიიღება", "გადაამოწმე .env.local");
    reachable = false;
  }
} catch (err) {
  bad(`პროექტს ვერ დავუკავშირდი: ${err.message}`, "მისამართი და ინტერნეტი");
  reachable = false;
}

if (reachable) {
  const missing = [];
  for (const table of TABLES) {
    const res = await head(table, svc);
    if (res.status === 404 || res.status === 400) missing.push(table);
  }
  if (missing.length === 0) {
    ok(`ყველა ${TABLES.length} ცხრილი ადგილზეა`);
  } else {
    bad(
      `ცხრილები აკლია: ${missing.join(", ")}`,
      "supabase/APPLY_ALL.sql სრულად არ გაშვებულა — იხილე docs/SETUP.md, ნაბიჯი 3",
    );
  }

  const view = await head("helper_children", svc);
  if (view.ok) ok("helper_children ხედი (მიგრაცია 0010)");
  else
    bad(
      "helper_children ხედი არ არსებობს",
      "ბოლო მიგრაციები არ გაშვებულა — გაუშვი supabase/APPLY_ALL.sql თავიდან",
    );

  // The single most important check: an unauthenticated caller must be refused
  // by privilege, not merely return an empty list.
  const anonRes = await head("children", anon);
  if (anonRes.status === 401 || anonRes.status === 403) {
    ok("გაუვლელ მომხმარებელს წვდომა არ აქვს (უფლება ჩამორთმეულია)");
  } else if (anonRes.ok) {
    const body = await anonRes.text();
    bad(
      "გაუვლელი მომხმარებელი ცხრილს კითხულობს!",
      `პასუხი: ${body.slice(0, 80)} — მიგრაცია 0004 არ გაშვებულა. ნუ შეიყვან ნამდვილ მონაცემებს.`,
    );
  } else {
    warn(`მოულოდნელი პასუხი anon-ისთვის: ${anonRes.status}`);
  }
}

// ------------------------------------------------------------ storage ------

console.log("\n[1mფაილების საცავი[0m");
try {
  const res = await fetch(`${url}/storage/v1/bucket/evidence`, {
    headers: svc,
  });
  if (res.ok) {
    const bucket = await res.json();
    if (bucket.public) {
      bad(
        "evidence bucket საჯაროა",
        "ბავშვების ფოტოები ბმულით ხელმისაწვდომი იქნება — Supabase → Storage → evidence → private",
      );
    } else {
      ok("evidence bucket არსებობს და დახურულია");
    }
  } else {
    bad(
      "evidence bucket ვერ მოიძებნა",
      "მიგრაცია 0005 არ გაშვებულა",
    );
  }
} catch (err) {
  bad(`საცავს ვერ დავუკავშირდი: ${err.message}`);
}

// --------------------------------------------------------------- site ------

console.log("\n[1mმისამართები[0m");
if (env.NEXT_PUBLIC_SITE_URL.startsWith("http://localhost")) {
  ok("NEXT_PUBLIC_SITE_URL — ლოკალური (სწორია განვითარებისთვის)");
  warn(
    "Vercel-ზე ატანისას შეცვალე",
    "და იგივე მისამართი დაამატე Supabase → Authentication → URL Configuration",
  );
} else {
  ok(`NEXT_PUBLIC_SITE_URL — ${env.NEXT_PUBLIC_SITE_URL}`);
}

// ------------------------------------------------------------- verdict -----

console.log("");
if (failures === 0) {
  console.log("[32m[1mყველაფერი წესრიგშია. გაუშვი: npm run dev[0m\n");
} else {
  console.log(
    `[31m[1m${failures} პრობლემა. გაასწორე და გაუშვი თავიდან: npm run doctor[0m\n`,
  );
  process.exitCode = 1;
}
