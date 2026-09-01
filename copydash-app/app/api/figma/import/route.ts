import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importFigmaFrame, parseFigmaUrl } from "@/lib/figma";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { pageId, figmaUrl } = (await request.json()) as { pageId?: string; figmaUrl?: string };
  if (!pageId || !figmaUrl) {
    return NextResponse.json({ error: "Page et lien Figma requis." }, { status: 400 });
  }

  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    return NextResponse.json(
      { error: "Lien Figma non reconnu. Copiez le lien d'un cadre précis (clic droit sur le cadre → Copy link)." },
      { status: 400 },
    );
  }

  const { data: connection } = await supabase
    .from("figma_connections")
    .select("access_token")
    .eq("pm_id", user.id)
    .maybeSingle();
  if (!connection) {
    return NextResponse.json(
      { error: "Connectez d'abord votre compte Figma dans Paramètres." },
      { status: 400 },
    );
  }

  const result = await importFigmaFrame(connection.access_token, parsed.fileKey, parsed.nodeId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // RLS ("figma_designs: pm full access" / "pages: pm full access") scopes
  // both writes to pages this signed-in PM actually owns.
  const { error: designError } = await supabase.from("figma_designs").upsert({
    page_id: pageId,
    file_key: result.fileKey,
    node_id: result.nodeId,
    file_name: result.fileName,
    frame_name: result.frameName,
    image_url: result.imageUrl,
    width: result.width,
    height: result.height,
    blocks: result.blocks,
    fetched_at: new Date().toISOString(),
  });
  if (designError) return NextResponse.json({ error: designError.message }, { status: 500 });

  const { error: pageError } = await supabase
    .from("pages")
    .update({ design_source: "figma", has_pdf_design: true })
    .eq("id", pageId);
  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });

  return NextResponse.json({ ok: true, frameName: result.frameName, blockCount: result.blocks.length });
}
