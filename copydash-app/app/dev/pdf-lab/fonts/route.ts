import type { NextRequest } from "next/server";

// Local test bench only: fetches Google Fonts for /dev/pdf-lab's font
// detection from the dev server (the browser's direct requests were
// unreliable). ?css=<family spec> → the css2 stylesheet; ?file=<url> → a
// font file from fonts.gstatic.com. Never served in production.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const css = request.nextUrl.searchParams.get("css");
  const file = request.nextUrl.searchParams.get("file");
  try {
    if (css) {
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${css}&display=swap`, { headers: { "user-agent": UA } });
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "text/css" } });
    }
    if (file && new URL(file).hostname === "fonts.gstatic.com") {
      const res = await fetch(file);
      return new Response(await res.arrayBuffer(), { status: res.status, headers: { "content-type": "font/woff2", "cache-control": "max-age=86400" } });
    }
    return new Response("Bad request", { status: 400 });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
