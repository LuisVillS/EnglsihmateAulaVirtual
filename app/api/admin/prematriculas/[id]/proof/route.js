import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getSignedPaymentProofUrl, isSupabaseStorageKey } from "@/lib/proof-storage";

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const preEnrollmentId = resolvedParams?.id?.toString();
  if (!preEnrollmentId) {
    return NextResponse.json({ error: "Pre-matricula invalida." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
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

  if (!hasServiceRoleClient()) {
    return NextResponse.json({ error: "Configura SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const service = getServiceSupabaseClient();
  const { data: preEnrollment } = await service
    .from("pre_enrollments")
    .select("payment_proof_url")
    .eq("id", preEnrollmentId)
    .maybeSingle();

  if (!preEnrollment?.payment_proof_url) {
    return NextResponse.json({ error: "Comprobante no disponible." }, { status: 404 });
  }

  const proofUrl = preEnrollment.payment_proof_url;
  if (!isSupabaseStorageKey(proofUrl)) {
    return NextResponse.redirect(proofUrl);
  }

  const signedUrl = await getSignedPaymentProofUrl(proofUrl);
  return NextResponse.redirect(signedUrl);
}
