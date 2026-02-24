import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export async function DELETE(request, { params }) {
  const resolvedParams = await params;
  const commissionId = resolvedParams?.id?.toString();
  if (!commissionId) {
    return NextResponse.json({ error: "Comision invalida." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    return NextResponse.json({ error: "Se requiere rol admin." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const client = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;

  const { count: enrolledCount, error: countError } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("commission_id", commissionId);

  if (countError) {
    return NextResponse.json({ error: countError.message || "No se pudo validar alumnos." }, { status: 500 });
  }

  const total = enrolledCount || 0;
  if (!force && total > 0) {
    return NextResponse.json({ canDelete: false, enrolledCount: total }, { status: 200 });
  }

  if (total > 0) {
    const { error: detachError } = await client
      .from("profiles")
      .update({ commission_id: null, commission_assigned_at: null, modality_key: null })
      .eq("commission_id", commissionId);
    if (detachError) {
      return NextResponse.json(
        { error: detachError.message || "No se pudieron liberar alumnos." },
        { status: 409 }
      );
    }
  }

  const { error: deleteError } = await client.from("course_commissions").delete().eq("id", commissionId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "No se pudo eliminar la comision." }, { status: 409 });
  }

  return NextResponse.json({ success: true, enrolledCount: total }, { status: 200 });
}
