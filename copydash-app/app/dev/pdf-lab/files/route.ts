import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

// Local test bench only: serves the reference PDFs (PDF_LAB_DIR, default
// ~/Desktop/Test) to /dev/pdf-lab so every file can be run in one click.
// Never served in production.
const dir = () => process.env.PDF_LAB_DIR || path.join(homedir(), "Desktop", "Test");

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const name = request.nextUrl.searchParams.get("name");
  try {
    if (!name) {
      const files = (await readdir(dir())).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
      return Response.json({ dir: dir(), files });
    }
    // A bare file name from the listing, nothing else.
    if (name !== path.basename(name) || !name.toLowerCase().endsWith(".pdf")) return new Response("Bad name", { status: 400 });
    const bytes = await readFile(path.join(dir(), name));
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/pdf" } });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
