// DEV ONLY — see rebuild.sh.
// Review-flow tests for migration 0008 on the dev DB. Each case runs inside a
// transaction that is rolled back: optional setup as the DB owner, then the
// checked statements as the given user.
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
  const page = (await db.query("select id from pages where name='Accueil'")).rows[0].id;
  const setStatus = (s) => [null, "update pages set status=$2 where id=$1", [page, s]];
  // Start each round from a page with no history (browser tests leave some).
  const fresh = [null, "delete from page_handoffs where page_id=$1", [page]];
  const edit = (text) => ["client1", "insert into design_edits (page_id, block_id, content) values ($1,'b1',$2) on conflict (page_id, block_id) do update set content = excluded.content returning updated_by_name", [page, text]];

  let r;
  r = await run([["client1", "update pages set status='Pending Review' where id=$1", [page]]]);
  check("client NE peut PAS soumettre une page en brouillon", !!r.error, r);
  r = await run([edit("x")]);
  check("client NE peut PAS modifier une page en brouillon", !!r.error, r);

  r = await run([setStatus("In Progress"), edit("Bonjour")]);
  check("client modifie une page qui est chez lui (auteur enregistré)", !r.error && r.rows[0]?.updated_by_name, r);
  r = await run([setStatus("In Progress"), ["client1", "update pages set status='Pending Review' where id=$1", [page]]]);
  check("client soumet une page qui est chez lui", !r.error && r.count === 1, r);
  r = await run([setStatus("In Progress"), ["client1", "update pages set status='Completed' where id=$1", [page]]]);
  check("client NE peut PAS approuver", !!r.error, r);
  r = await run([setStatus("In Progress"), ["client1", "update pages set name='Renommée' where id=$1", [page]]]);
  check("client NE peut PAS renommer la page", !!r.error, r);
  r = await run([setStatus("Pending Review"), edit("x")]);
  check("client NE peut PAS modifier pendant la relecture", !!r.error, r);

  r = await run([["editor1", "update pages set status='Completed' where id=$1", [page]]]);
  check("éditeur approuve", !r.error && r.count === 1, r);

  // A full round: agency sends, client edits and submits → the last round shows the client's edit.
  r = await run([
    [null, "update pages set status='Draft' where id=$1", [page]],
    fresh,
    setStatus("In Progress"),
    edit("Texte du client"),
    ["client1", "update pages set status='Pending Review' where id=$1", [page]],
    ["pm1", "select e.prev_baseline, e.baseline, e.updated_by_name, (select count(*) from page_handoffs h where h.page_id=e.page_id) as handoffs from design_edits e where page_id=$1 and block_id='b1'", [page]],
  ]);
  const row = r.rows?.[0];
  check("le dernier tour montre l'avant/après et l'auteur", row && row.prev_baseline === null && row.baseline === "Texte du client" && row.updated_by_name && Number(row.handoffs) === 2, r);
  r = await run([[null, "update pages set status='Draft' where id=$1", [page]], fresh, setStatus("In Progress"), ["client1", "select count(*)::int as n from page_handoffs where page_id=$1", [page]]]);
  check("client voit l'historique des passages de main", r.rows?.[0]?.n === 1, r);

  await db.end();
  console.log(fails ? `\n${fails} échec(s)` : "\nTous les tests de relecture passent");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
