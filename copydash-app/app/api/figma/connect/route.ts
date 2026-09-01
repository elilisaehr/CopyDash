import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyFigmaToken } from "@/lib/figma";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { token } = (await request.json()) as { token?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Jeton manquant." }, { status: 400 });

  const identity = await verifyFigmaToken(token.trim());
  if (!identity) {
    return NextResponse.json({ error: "Ce jeton Figma est invalide ou a expiré." }, { status: 400 });
  }

  const { error } = await supabase.from("figma_connections").upsert({
    pm_id: user.id,
    access_token: token.trim(),
    figma_user_name: identity.name,
    figma_user_email: identity.email,
    connected_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ name: identity.name, email: identity.email });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.from("figma_connections").delete().eq("pm_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
