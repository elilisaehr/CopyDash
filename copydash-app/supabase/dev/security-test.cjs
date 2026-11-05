// DEV ONLY — see rebuild.sh.
// Attempts someone could make directly against the database with the public
// key, bypassing the app. Each case runs in a transaction that is rolled back.
const { Client } = require("pg");
const ids = require("./ids.json");
if (process.env.DEV_DATABASE_URL.includes("yprspsttxqzuxujmtapf")) throw new Error("prod!");
const db = new Client({ connectionString: process.env.DEV_DATABASE_URL, ssl: { rejectUnauthorized: false } });

const asUser = async (user) => {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[user], role: "authenticated" })]);
};

// Steps: [user | null (DB owner), sql, params]. Returns the last step's rows.
async function run(steps) {
  await db.query("begin");
  try {
    let last;
    for (const [user, sql, params] of steps) {
      if (user) await asUser(user);
      else {
        await db.query("reset role");
        await db.query("select set_config('request.jwt.claims', '', true)");
      }
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
  const page = (await one("select id from pages where project_id=$1 limit 1", [p1])).id;
  const otherPage = (await one("select id from pages where project_id<>$1 limit 1", [p1])).id;
  const comment = "11111111-1111-4111-8111-111111111111";

  const withTurn = [null, "update pages set status='In Progress' where id=$1", [page]];
  const withComment = [null, "insert into comments (id,project_id,page_id,field_key,author_id,author_name,role,body) values ($1,$2,$3,'hero',$4,'Admin','pm','Original')", [comment, p1, page, ids.pm1]];
  const withField = [null, "insert into fields (id,page_id,field_key,label,content,baseline) values ($1,$2,'sec_test','Original label','Text','Base')", [comment, page]];
  const withEdit = [null, "insert into design_edits (page_id,block_id,content,baseline) values ($1,'sec_test','Text','Base')", [page]];
  const insertComment = (author, name, role) => ["client1", "insert into comments (project_id,page_id,field_key,author_id,author_name,role,body) values ($1,$2,'hero',$3,$4,$5,'Hello') returning author_name, role", [p1, page, author, name, role]];

  let r;

  // ── Every table is protected
  r = await run([[null, "select tablename from pg_tables where schemaname='public' and not rowsecurity"]]);
  check("toutes les tables ont des règles d'accès (RLS)", r.rows?.length === 0, r);

  // ── Comments
  r = await run([withComment, ["client1", "update comments set body='Forged' where id=$1", [comment]], [null, "select body from comments where id=$1", [comment]]]);
  check("un contributeur ne peut pas réécrire le commentaire d'un autre", r.error || r.rows?.[0]?.body === "Original", r);
  r = await run([withComment, ["client1", "update comments set author_name='Someone else' where id=$1", [comment]], [null, "select author_name from comments where id=$1", [comment]]]);
  check("un contributeur ne peut pas changer l'auteur d'un commentaire", r.error || r.rows?.[0]?.author_name === "Admin", r);
  r = await run([insertComment(ids.client1, "Fake Admin", "pm")]);
  check("le nom et le rôle d'un nouveau commentaire ne se falsifient pas", r.rows?.[0]?.author_name !== "Fake Admin" && r.rows?.[0]?.role === "client", r);
  r = await run([["client1", "insert into comments (project_id,page_id,field_key,author_id,author_name,role,body) values ($1,$2,'hero',$3,'x','client','Hi')", [p1, otherPage, ids.client1]]]);
  check("un commentaire ne peut pas viser la page d'un autre projet", !!r.error, r);
  r = await run([withComment, ["client1", "update comments set resolved=true where id=$1", [comment]], [null, "select resolved from comments where id=$1", [comment]]]);
  check("un contributeur peut toujours résoudre un commentaire", r.rows?.[0]?.resolved === true, r);

  // ── Copy: contributors change the text and nothing else
  r = await run([withTurn, withField, ["client1", "update fields set content='New' where id=$1", [comment]], [null, "select content from fields where id=$1", [comment]]]);
  check("un contributeur peut modifier le texte à son tour", r.rows?.[0]?.content === "New", r);
  r = await run([withTurn, withField, ["client1", "update fields set label='Hacked' where id=$1", [comment]], [null, "select label from fields where id=$1", [comment]]]);
  check("un contributeur ne peut pas renommer un champ", r.error || r.rows?.[0]?.label === "Original label", r);
  r = await run([withTurn, withField, ["client1", "update fields set baseline='Hidden' where id=$1", [comment]], [null, "select baseline from fields where id=$1", [comment]]]);
  check("un contributeur ne peut pas falsifier « ce qui a changé » (champ)", r.error || r.rows?.[0]?.baseline === "Base", r);
  r = await run([withTurn, withEdit, ["client1", "update design_edits set baseline='Hidden' where page_id=$1 and block_id='sec_test'", [page]], [null, "select baseline from design_edits where page_id=$1 and block_id='sec_test'", [page]]]);
  check("un contributeur ne peut pas falsifier « ce qui a changé » (maquette)", r.error || r.rows?.[0]?.baseline === "Base", r);
  r = await run([withTurn, withEdit, ["client1", "update design_edits set updated_by_name='Someone else' where page_id=$1 and block_id='sec_test'", [page]], [null, "select updated_by_name from design_edits where page_id=$1 and block_id='sec_test'", [page]]]);
  check("un contributeur ne peut pas attribuer une modification à un autre", r.error || r.rows?.[0]?.updated_by_name !== "Someone else", r);
  r = await run([withTurn, ["client1", "insert into design_edits (page_id,block_id,content,baseline) values ($1,'sec_new','Text','Forged') returning baseline", [page]]]);
  check("un contributeur ne peut pas créer un texte avec un faux historique", r.error || r.rows?.[0]?.baseline === null, r);
  r = await run([withTurn, withEdit, ["client1", "update pages set status='Pending Review' where id=$1", [page]], [null, "select baseline from design_edits where page_id=$1 and block_id='sec_test'", [page]]]);
  check("soumettre une page met toujours l'historique à jour", r.rows?.[0]?.baseline === "Text", r);

  // ── Profiles
  r = await run([["client1", "update profiles set email='ceo@bigcompany.com' where id=$1", [ids.client1]], [null, "select email from profiles where id=$1", [ids.client1]]]);
  check("on ne peut pas afficher l'email de quelqu'un d'autre sur son profil", r.rows?.[0]?.email !== "ceo@bigcompany.com", r);
  r = await run([["client1", "update profiles set role='pm' where id=$1", [ids.client1]], [null, "select role from profiles where id=$1", [ids.client1]]]);
  check("on ne peut pas changer son type de compte", r.rows?.[0]?.role === "client", r);
  r = await run([["client1", "update profiles set name='New name' where id=$1", [ids.client1]], [null, "select name from profiles where id=$1", [ids.client1]]]);
  check("on peut toujours changer son nom", r.rows?.[0]?.name === "New name", r);

  // ── No access through an email address
  r = await run([
    [null, "delete from project_members where user_id=$1", [ids.client1]],
    [null, "insert into clients (id,pm_id,name,workspace_id) values ($1,$2,'Victim',$3)", [comment, ids.pm1, ws1]],
    [null, "insert into client_emails (client_id,address,is_primary) values ($1,'victim@acme.com',true)", [comment]],
    [null, "update projects set client_id=$1 where id=$2", [comment, p2]],
    ["client1", "update profiles set email='victim@acme.com', role='client' where id=$1", [ids.client1]],
    ["client1", "select public.project_role($1) as role", [p2]],
  ]);
  check("prendre l'email d'un client ne donne pas accès à ses projets", r.rows?.[0]?.role === null, r);

  // ── A former admin keeps nothing
  r = await run([
    [null, "insert into workspace_members (workspace_id,user_id,role) values ($1,$2,'admin') on conflict (workspace_id,user_id) do update set role='admin'", [ws1, ids.editor1]],
    [null, "update projects set pm_id=$1 where id=$2", [ids.editor1, p2]],
    [null, "delete from workspace_members where workspace_id=$1 and user_id=$2", [ws1, ids.editor1]],
    ["editor1", "select public.project_role($1) as role", [p2]],
  ]);
  check("un admin retiré perd l'accès aux projets qu'il a créés", r.rows?.[0]?.role === null, r);
  r = await run([
    [null, "insert into workspace_members (workspace_id,user_id,role) values ($1,$2,'admin') on conflict (workspace_id,user_id) do update set role='admin'", [ws1, ids.editor1]],
    [null, "update projects set pm_id=$1 where id=$2", [ids.editor1, p2]],
    [null, "update workspace_members set role='editor' where workspace_id=$1 and user_id=$2", [ws1, ids.editor1]],
    ["editor1", "select public.project_role($1) as role", [p2]],
  ]);
  check("un admin rétrogradé perd ses droits d'admin sur ses projets", r.rows?.[0]?.role === null, r);

  // ── Access stays closed
  r = await run([["client1", "insert into project_members (project_id,user_id,role) values ($1,$2,'editor')", [p2, ids.client1]]]);
  check("un contributeur ne peut pas s'ajouter à un projet", !!r.error, r);
  r = await run([["client1", "update project_members set role='editor' where user_id=$1", [ids.client1]], [null, "select role from project_members where user_id=$1 and project_id=$2", [ids.client1, p1]]]);
  check("un contributeur ne peut pas se promouvoir éditeur", r.rows?.[0]?.role === "client", r);
  r = await run([["client1", "select token from invitations"]]);
  check("un contributeur ne voit aucun lien d'invitation", r.rows?.length === 0, r);
  r = await run([["editor1", "select token from invitations"]]);
  check("un éditeur ne lit pas directement les liens d'invitation", r.rows?.length === 0, r);
  r = await run([["pm1", "update workspaces set plan='agency' where id=$1", [ws1]]]);
  check("un admin ne peut pas s'offrir un plan payant", !!r.error, r);
  r = await run([["client1", "select access_token from figma_connections"]]);
  check("les jetons Figma des autres restent invisibles", r.rows?.length === 0, r);

  await db.end();
  console.log(fails ? `\n${fails} échec(s)` : "\nTout passe.");
  if (fails) process.exitCode = 1;
})();
