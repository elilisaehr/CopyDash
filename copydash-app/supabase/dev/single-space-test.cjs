// DEV ONLY — see rebuild.sh.
// Tests for migration 0009 on the dev DB. Each case runs inside a transaction
// that is rolled back: optional setup as the DB owner, then the checked
// statements as the given user. Runs after rls-test.cjs, whose setup makes
// editor1 an editor on 'Site Lovely Bakd'.
const { Client } = require("pg");
const ids = require("./ids.json");
if (process.env.DEV_DATABASE_URL.includes("yprspsttxqzuxujmtapf")) throw new Error("prod!");
const db = new Client({ connectionString: process.env.DEV_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const asUser = async (user) => {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[user], role: "authenticated" })]);
};

async function run(steps) {
  await db.query("begin");
  try {
    let last;
    for (const [user, sql, params] of steps) {
      if (user) await asUser(user);
      else await db.query("reset role");
      last = await db.query(sql, params || []);
    }
    return { rows: last.rows, count: last.rowCount };
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

  const role = (user, project) => [user, "select public.project_role($1) as role", [project]];
  const addMember = (project, user, r = "client") => [null, "insert into project_members (project_id,user_id,role) values ($1,$2,$3) on conflict do nothing", [project, ids[user], r]];
  const setLimit = (n) => [null, "update plan_limits set max_contributors=$1 where plan=(select plan from workspaces where id=$2)", [n, ws1]];
  const invite = (email) => [null, "insert into invitations (workspace_id,email,role,project_ids) values ($1,$2,'client',$3) returning id", [ws1, email, [p1]]];

  let r;
  // ── Company
  r = await run([[null, "select company from projects where id=$1", [p1]]]);
  check("le projet reprend le nom de la société du client", r.rows?.[0]?.company === "Lovely Bakd", r);
  r = await run([[null, "select company from projects where id=$1", [p2]]]);
  check("projet sans client : société vide", r.rows?.[0]?.company === "", r);

  // ── Role per project
  r = await run([role("pm1", p1)]);
  check("rôle sur un projet : admin", r.rows?.[0]?.role === "admin", r);
  r = await run([role("editor1", p1)]);
  check("rôle sur un projet : éditeur", r.rows?.[0]?.role === "editor", r);
  r = await run([role("client1", p1)]);
  check("rôle sur un projet : contributeur", r.rows?.[0]?.role === "client", r);
  r = await run([role("client1", p2)]);
  check("aucun rôle sur un projet où on n'est pas", r.rows?.[0]?.role === null, r);
  r = await run([addMember(pPierre, "pm1"), role("pm1", pPierre)]);
  check("admin chez lui, contributeur chez une autre agence", r.rows?.[0]?.role === "client", r);

  // ── A person can be on several projects, across workspaces
  r = await run([addMember(p2, "client1"), ["client1", "select id from projects"]]);
  check("contributeur sur 2 projets : les voit tous les deux", r.count === 2, r);
  r = await run([addMember(pPierre, "pm1"), ["pm1", "select id from projects"]]);
  check("admin invité ailleurs voit aussi ce projet", r.count === 3, r);
  r = await run([addMember(pPierre, "pm1"), ["pm1", "update pages set name='Intrus' where project_id=$1", [pPierre]]]);
  check("mais n'y a que les droits de contributeur", !!r.error || r.count === 0, r);

  // ── Removal really cuts access, even after a profile save
  const remove = [null, "delete from project_members where project_id=$1 and user_id=$2", [p1, ids.client1]];
  r = await run([remove, ["client1", "select id from projects"]]);
  check("retiré d'un projet : il n'y a plus accès", r.count === 0, r);
  r = await run([remove, ["client1", "update profiles set email=email where id=$1", [ids.client1]], ["client1", "select id from projects"]]);
  check("enregistrer son profil ne rend pas l'accès", r.count === 0, r);
  r = await run([[null, "insert into client_emails (client_id,address) select client_id,'newpm@copydash.test' from projects where id=$1", [p1]], [null, "update profiles set role='client' where id=$1", [ids.newpm]], ["newpm", "select id from projects"]]);
  check("un email sur une fiche client ne donne plus d'accès", r.count === 0, r);

  // ── Only people who manage a project see its members (Contributor side stays closed)
  r = await run([["client1", "select user_id from project_members where project_id=$1", [p1]]]);
  check("contributeur ne voit que sa propre ligne de membre", r.count === 1, r);
  r = await run([["client1", "select id from invitations"]]);
  check("contributeur ne voit aucune invitation", r.count === 0, r);
  r = await run([["editor1", "select id from invitations"]]);
  check("éditeur ne lit pas les invitations (les liens restent secrets)", r.count === 0, r);
  r = await run([["editor1", "insert into invitations (workspace_id,email,role,project_ids) values ($1,'x@y.z','client',$2)", [ws1, [p1]]]]);
  check("éditeur NE peut PAS écrire d'invitation en direct", !!r.error, r);

  // ── Contributor limit
  r = await run([invite("a@test.dev"), invite("b@test.dev")]);
  check("sans limite : invitations libres", !r.error, r);
  r = await run([setLimit(1), invite("new@test.dev")]);
  check("limite atteinte : invitation refusée", /PLAN_LIMIT_CONTRIBUTORS/.test(r.error || ""), r);
  r = await run([setLimit(1), invite("CLIENT1@copydash.test")]);
  check("limite atteinte : réinviter un contributeur existant passe", !r.error, r);
  r = await run([setLimit(2), invite("new@test.dev")]);
  check("sous la limite : invitation acceptée", !r.error, r);
  r = await run([setLimit(2), invite("new@test.dev"), invite("other@test.dev")]);
  check("une invitation en attente compte dans la limite", /PLAN_LIMIT_CONTRIBUTORS/.test(r.error || ""), r);
  r = await run([setLimit(1), [null, "insert into invitations (workspace_id,email,role) values ($1,'colleague@test.dev','editor')", [ws1]]]);
  check("la limite ne concerne pas les éditeurs", !r.error, r);

  await db.end();
  console.log(fails ? `\n${fails} échec(s)` : "\nTous les tests d'espace unique passent");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
