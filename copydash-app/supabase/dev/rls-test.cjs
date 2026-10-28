// DEV ONLY — see rebuild.sh.
// Permission tests for migration 0007 on the dev DB. Each case runs as a given
// user inside a transaction that is rolled back, so cases are independent.
const { Client } = require("pg");
const ids = require("./ids.json");
if (process.env.DEV_DATABASE_URL.includes("yprspsttxqzuxujmtapf")) throw new Error("prod!");
const db = new Client({ connectionString: process.env.DEV_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function as(user, sql, params = []) {
  await db.query("begin");
  try {
    if (user) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[user], role: "authenticated" })]);
    }
    const r = await db.query(sql, params);
    return { rows: r.rows, count: r.rowCount };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.query("rollback");
  }
}

let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  → " + JSON.stringify(detail)}`);
}

(async () => {
  await db.connect();
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const ws1 = (await one("select id from workspaces where owner_id=$1", [ids.pm1])).id;
  const p1 = (await one("select id from projects where name='Site Lovely Bakd'")).id;
  const p2 = (await one("select id from projects where name='Projet interne'")).id;
  const pPierre = (await one("select id from projects where name='Projet de Pierre'")).id;

  // Setup (committed): editor1 = editor in pm1's workspace on p1 only;
  // newpm/editor1 lose their backfilled workspaces (= brand-new users).
  await db.query("delete from workspaces where owner_id = any($1)", [[ids.newpm, ids.editor1]]);
  await db.query("insert into workspace_members (workspace_id,user_id,role) values ($1,$2,'editor') on conflict do nothing", [ws1, ids.editor1]);
  await db.query("insert into project_members (project_id,user_id,role) values ($1,$2,'editor') on conflict do nothing", [p1, ids.editor1]);

  let r;
  // ── Admin (pm1)
  r = await as("pm1", "select name from projects order by name");
  check("admin voit ses 2 projets, pas celui de Pierre", r.count === 2, r);
  r = await as("pm1", "insert into projects (pm_id, workspace_id, name) values ($1,$2,'Nouveau') returning id", [ids.pm1, ws1]);
  check("admin crée un projet", !r.error, r);
  r = await as("pm1", "update workspaces set plan='agency' where id=$1", [ws1]);
  check("admin NE peut PAS changer son plan", !!r.error, r);
  r = await as("pm1", "update workspaces set name='Studio Paula' where id=$1", [ws1]);
  check("admin renomme son espace", !r.error && r.count === 1, r);
  r = await as("pm1", "select name, email from profiles where id=$1", [ids.editor1]);
  check("admin voit le profil de son éditeur", r.count === 1, r);
  r = await as("pm1", "delete from workspace_members where workspace_id=$1 and user_id=$2", [ws1, ids.pm1]);
  check("le propriétaire ne peut pas être retiré", !r.error && r.count === 0, r);

  // ── Editor (editor1)
  r = await as("editor1", "select name from projects order by name");
  check("éditeur voit seulement le projet où il est invité", r.count === 1 && r.rows[0].name === "Site Lovely Bakd", r);
  r = await as("editor1", "select name from clients");
  check("éditeur voit le client de son projet", r.count === 1, r);
  r = await as("editor1", "insert into pages (project_id, name) values ($1,'Nouvelle page') returning id", [p1]);
  check("éditeur ajoute une page à son projet", !r.error, r);
  r = await as("editor1", "delete from pages where project_id=$1 and name='Contact'", [p1]);
  check("éditeur supprime une page de son projet", !r.error && r.count === 1, r);
  r = await as("editor1", "insert into pages (project_id, name) values ($1,'Intrus') returning id", [p2]);
  check("éditeur NE peut PAS ajouter de page à un autre projet", !!r.error, r);
  r = await as("editor1", "insert into projects (pm_id, workspace_id, name) values ($1,$2,'Projet éditeur')", [ids.editor1, ws1]);
  check("éditeur NE peut PAS créer de projet", !!r.error, r);
  r = await as("editor1", "update workspaces set name='Hack' where id=$1", [ws1]);
  check("éditeur NE peut PAS renommer l'espace", !r.error && r.count === 0, r);
  r = await as("editor1", "insert into workspace_members (workspace_id,user_id,role) values ($1,$2,'admin')", [ws1, ids.newpm]);
  check("éditeur NE peut PAS ajouter de membre", !!r.error, r);
  r = await as("editor1", "update workspace_members set role='admin' where user_id=$1", [ids.editor1]);
  check("éditeur NE peut PAS se promouvoir admin", !r.error && r.count === 0, r);

  // ── Client (client1)
  r = await as("client1", "select name from pages where project_id=$1", [p1]);
  check("client lit les pages de son projet", r.count === 3, r);
  r = await as("client1", "insert into pages (project_id, name) values ($1,'Page client')", [p1]);
  check("client NE peut PAS ajouter de page", !!r.error, r);
  r = await as("client1", "select id from workspaces");
  check("client ne voit aucun espace", r.count === 0, r);

  r = await as("editor1", "insert into projects (pm_id, name) values ($1,'Projet perso') returning workspace_id", [ids.editor1]);
  check("éditeur sans espace précisé → projet dans SON propre espace (pas celui de Paula)", !r.error && r.rows[0].workspace_id !== ws1, r);
  r = await as("pm2", "insert into projects (pm_id, workspace_id, name) values ($1,$2,'Intrusion')", [ids.pm2, ws1]);
  check("autre PM NE peut PAS créer un projet dans l'espace de Paula", !!r.error, r);
  r = await as("pm2", "insert into clients (pm_id, workspace_id, name) values ($1,$2,'Intrusion')", [ids.pm2, ws1]);
  check("autre PM NE peut PAS créer un client dans l'espace de Paula", !!r.error, r);
  r = await as("pm2", "update projects set workspace_id=$1 where id=$2", [ws1, pPierre]);
  check("autre PM NE peut PAS déplacer son projet chez Paula", !!r.error || r.count === 0, r);
  r = await as("pm1", "insert into clients (pm_id, name) values ($1,'Client ancien code') returning workspace_id", [ids.pm1]);
  check("ancien code : client rangé dans l'espace de l'admin", r.rows?.[0]?.workspace_id === ws1, r);
  r = await as("pm1", "insert into projects (pm_id, name) values ($1,'Projet ancien code') returning workspace_id", [ids.pm1]);
  check("ancien code : projet rangé dans l'espace de l'admin", r.rows?.[0]?.workspace_id === ws1, r);

  // ── Another PM (pm2)
  r = await as("pm2", "select name from projects");
  check("autre PM ne voit que son projet", r.count === 1 && r.rows[0].name === "Projet de Pierre", r);
  r = await as("pm2", "select id from pages where project_id=$1", [p1]);
  check("autre PM ne voit pas les pages de Paula", r.count === 0, r);

  // ── Brand-new user, old-style insert (no workspace_id) → free plan limits
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.newpm, role: "authenticated" })]);
    const pr = (await db.query(`insert into projects (pm_id, name) values ('${ids.newpm}', 'Premier') returning id`)).rows[0].id;
    const plan = (await db.query("select w.plan from projects p join workspaces w on w.id=p.workspace_id where p.id=$1", [pr])).rows[0]?.plan;
    check("nouvel inscrit : espace gratuit créé automatiquement", plan === "free", plan);
    await db.query("insert into pages (project_id, name) values ($1,'Page 1'),($1,'Page 2')", [pr]);
    let e3 = null; try { await db.query("savepoint s"); await db.query("insert into pages (project_id, name) values ($1,'Page 3')", [pr]); } catch (e) { e3 = e.message; await db.query("rollback to savepoint s"); }
    check("gratuit : 3e page refusée", /PLAN_LIMIT_PAGES/.test(e3 || ""), e3);
    let e2 = null; try { await db.query("savepoint s2"); await db.query(`insert into projects (pm_id, name) values ('${ids.newpm}', 'Deuxième')`); } catch (e) { e2 = e.message; await db.query("rollback to savepoint s2"); }
    check("gratuit : 2e projet refusé", /PLAN_LIMIT_PROJECTS/.test(e2 || ""), e2);
    let ok = null; try { await db.query("update projects set archived_at = now() where id=$1", [pr]); await db.query(`insert into projects (pm_id, name) values ('${ids.newpm}', 'Après archivage')`); ok = true; } catch (e) { ok = e.message; }
    check("gratuit : après archivage, un nouveau projet est possible", ok === true, ok);
    let e4 = null; try { await db.query("update projects set archived_at = null where id=$1", [pr]); } catch (e) { e4 = e.message; }
    check("gratuit : restaurer au-delà de la limite est refusé", /PLAN_LIMIT_PROJECTS/.test(e4 || ""), e4);
  } finally { await db.query("rollback"); }

  console.log(fails ? `\n${fails} échec(s)` : "\nTous les tests passent");
  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
