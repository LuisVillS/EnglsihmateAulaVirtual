import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSignedUploadUrl, getPublicAssetUrl } from "@/lib/r2";

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: adminRecord } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!adminRecord?.id) {
      return NextResponse.json({ error: "Solo admins" }, { status: 403 });
    }

    const body = await request.json();
    const { fileName, contentType, visibility = "public" } = body;

    if (!fileName || !contentType) {
      return NextResponse.json(
        { error: "fileName y contentType son obligatorios" },
        { status: 400 }
      );
    }

    const sanitizedName = fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
    const key = `audios/${Date.now()}-${sanitizedName}`;
    const uploadUrl = await getSignedUploadUrl(key, contentType);

    const responsePayload = { key, uploadUrl };

    if (visibility === "public") {
      responsePayload.publicUrl = getPublicAssetUrl(key);
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error al firmar el upload" }, { status: 500 });
  }
}

