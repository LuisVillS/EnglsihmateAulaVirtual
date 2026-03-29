import { NextResponse } from "next/server";
import { requireCrmSimulationAccess } from "@/app/api/crm/simulate/_shared";
import { submitCrmWebFormLead } from "@/lib/crm/integrations/web-form-ingestion";

function buildWebFormSimulationPayload(overrides = {}) {
  const stamp = String(Date.now()).slice(-6);
  return {
    fullName: overrides.fullName || `WebForm Test ${stamp}`,
    email: overrides.email || `webform-sim-${stamp}@example.com`,
    phone: overrides.phone || "+51971000111",
    siteKey: overrides.siteKey || "main_site",
    formKey: overrides.formKey || "crm_simulation",
    formLabel: overrides.formLabel || "CRM Simulation",
    pagePath: overrides.pagePath || "/admin/crm",
    landingUrl: overrides.landingUrl || "https://englishmate.com.pe/admin/crm",
    referrerUrl: overrides.referrerUrl || "https://englishmate.com.pe/",
    utmSource: overrides.utmSource || "crm_simulation",
  };
}

export async function POST(request) {
  const access = await requireCrmSimulationAccess("crm-simulate-web-form");
  if (access.errorResponse) {
    return access.errorResponse;
  }

  try {
    const overrides = await request.json().catch(() => ({}));
    const payload = buildWebFormSimulationPayload(overrides);
    const result = await submitCrmWebFormLead({
      payload,
      headers: {},
      skipTurnstile: true,
    });

    return NextResponse.json({
      ok: true,
      provider: "web_form",
      temporary: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "WebForm simulation failed." },
      { status: 400 }
    );
  }
}
