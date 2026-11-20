import type { NextRequest } from "next/server";

// Google Fonts, fetched by our server for the font detection at PDF import
// (lib/font-detect): ?css=<css2 family spec> → the stylesheet, ?file=<url> →
// a font file from fonts.gstatic.com. Only those two hosts, nothing else;
// responses are cached by the CDN for a day.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CACHE = "public, max-age=86400, s-maxage=86400";

export async function GET(request: NextRequest) {
  const css = request.nextUrl.searchParams.get("css");
  const file = request.nextUrl.searchParams.get("file");
  try {
    if (css) {
      // A family name with an optional weight axis: "Open+Sans:wght@300..800".
      if (!/^[A-Za-z0-9+ ]{1,60}(:wght@[0-9.;]{1,60})?$/.test(css)) return new Response("Bad request", { status: 400 });
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${css}&display=swap`, { headers: { "user-agent": UA } });
      if (!res.ok) return new Response("Not found", { status: res.status });
      return new Response(await res.text(), { headers: { "content-type": "text/css; charset=utf-8", "cache-control": CACHE } });
    }
    if (file) {
      const url = new URL(file);
      if (url.protocol !== "https:" || url.hostname !== "fonts.gstatic.com") return new Response("Bad request", { status: 400 });
      const res = await fetch(url);
      if (!res.ok) return new Response("Not found", { status: res.status });
      return new Response(await res.arrayBuffer(), { headers: { "content-type": res.headers.get("content-type") || "font/woff2", "cache-control": CACHE } });
    }
    return new Response("Bad request", { status: 400 });
  } catch {
    return new Response("Font service unavailable", { status: 502 });
  }
}
