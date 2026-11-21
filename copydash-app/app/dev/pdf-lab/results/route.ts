import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

// Local test bench only: saves a lab run to disk. `?as=baseline` replaces the
// committed reference results (app/dev/pdf-lab/baseline.json); any other
// `?name=` goes to PDF_LAB_OUT (default <tmp>/copydash-pdf-lab/<name>.json)
// so runs can be compared outside the browser. Never served in production.
const outDir = () => process.env.PDF_LAB_OUT || path.join(tmpdir(), "copydash-pdf-lab");

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const as = request.nextUrl.searchParams.get("as");
  const name = request.nextUrl.searchParams.get("name") || "run";
  if (!/^[\w.-]{1,80}$/.test(name)) return new Response("Bad name", { status: 400 });
  try {
    const body = JSON.stringify(await request.json(), null, 2) + "\n";
    const file = as === "baseline" ? path.join(process.cwd(), "app", "dev", "pdf-lab", "baseline.json") : path.join(outDir(), `${name}.json`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return Response.json({ file });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
