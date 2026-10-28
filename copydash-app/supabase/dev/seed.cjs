// DEV ONLY — see rebuild.sh.
// Creates dev auth users + "pre-migration" data (dev project only).
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");
if (process.env.DEV_SUPABASE_URL.includes("yprspsttxqzuxujmtapf")) throw new Error("prod!");
const sb = createClient(process.env.DEV_SUPABASE_URL, process.env.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USERS = [
  ["pm1@copydash.test", "pm", "Paula PM"],
  ["pm2@copydash.test", "pm", "Pierre PM"],
  ["client1@copydash.test", "client", "Claire Client"],
  ["editor1@copydash.test", "pm", "Eddy Editor"],
  ["newpm@copydash.test", "pm", "Nina New"],
];
(async () => {
  const ids = {};
  const { data: existing } = await sb.auth.admin.listUsers();
  for (const [email, role, name] of USERS) {
    let u = existing.users.find((x) => x.email === email);
    if (!u) ({ data: { user: u } } = await sb.auth.admin.createUser({ email, password: "Test-1234!", email_confirm: true, user_metadata: { role, name } }));
    ids[email.split("@")[0]] = u.id;
  }
  const db = new Client({ connectionString: process.env.DEV_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  for (const [email, role, name] of USERS) {
    await db.query("insert into profiles (id, role, name, email) values ($1,$2,$3,$4) on conflict (id) do nothing", [ids[email.split("@")[0]], role, name, email]);
  }
  // pm1: a client company with client1's email, two projects, pages
  const c = await db.query("insert into clients (pm_id, name) values ($1, 'Lovely Bakd') returning id", [ids.pm1]);
  await db.query("insert into client_emails (client_id, address, is_primary) values ($1, 'client1@copydash.test', true)", [c.rows[0].id]);
  const p1 = await db.query("insert into projects (pm_id, client_id, name) values ($1,$2,'Site Lovely Bakd') returning id", [ids.pm1, c.rows[0].id]);
  const p2 = await db.query("insert into projects (pm_id, name) values ($1,'Projet interne') returning id", [ids.pm1]);
  for (const n of ["Accueil", "Boutique", "Contact"]) await db.query("insert into pages (project_id, name) values ($1,$2)", [p1.rows[0].id, n]);
  await db.query("insert into pages (project_id, name) values ($1,'Brief')", [p2.rows[0].id]);
  // relink: client1's profile existed before the client email → link now
  await db.query("update profiles set email = email where id = $1", [ids.client1]);
  await db.query("insert into projects (pm_id, name) values ($1,'Projet de Pierre')", [ids.pm2]);
  console.log(JSON.stringify(ids));
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
