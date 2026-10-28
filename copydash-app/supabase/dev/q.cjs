// DEV ONLY — see rebuild.sh.
// Runs SQL (argv[2] or a .sql file path) against DEV_DATABASE_URL only.
const { Client } = require("pg");
const fs = require("fs");
const url = process.env.DEV_DATABASE_URL;
if (!url || url.includes("yprspsttxqzuxujmtapf")) { console.error("Refusing: DEV_DATABASE_URL missing or points at production"); process.exit(1); }
const sql = fs.existsSync(process.argv[2] || "") ? fs.readFileSync(process.argv[2], "utf8") : process.argv[2];
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(sql);
    const results = Array.isArray(r) ? r : [r];
    for (const x of results) if (x.rows?.length) console.table(x.rows); else console.log(x.command, x.rowCount ?? "");
  } finally { await c.end(); }
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
