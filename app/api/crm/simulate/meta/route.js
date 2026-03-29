import { NextResponse } from "next/server";
import { normalizeMetaWebhookPayload } from "@/lib/crm/integrations/meta";
import { ingestCrmWebhookLead } from "@/lib/crm/integrations/webhook-ingestion";
import { buildMetaSimulationPayload, requireCrmSimulationAccess } from "@/app/api/crm/simulate/_shared";

export async function POST(request) {
  const access = await requireCrmSimulationAccess("crm-simulate-meta");
  if (access.errorResponse) {
    return access.errorResponse;
  }

  try {
    const overrides = await request.json().catch(() => ({}));
    const payload = buildMetaSimulationPayload(overrides);
    const normalized = normalizeMetaWebhookPayload(payload);
    const result = await ingestCrmWebhookLead(normalized);

    return NextResponse.json({
      ok: true,
      provider: "meta",
      temporary: true,
      normalized,
      ...result,
    });
  } catch (error) {
    console.error("[CRM] Meta simulation failed", error);
    return NextResponse.json(
      { error: error?.message || "Meta simulation failed." },
      { status: 400 }
    );
  }
}
