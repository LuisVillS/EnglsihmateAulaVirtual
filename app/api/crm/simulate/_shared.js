import { NextResponse } from "next/server";
import { requireCrmRouteAccess } from "@/lib/admin/access";

function buildSuffix() {
  return String(Date.now()).slice(-6);
}

function buildPeruTestPhone() {
  return `+51971${buildSuffix()}`;
}

export async function requireCrmSimulationAccess(label) {
  const access = await requireCrmRouteAccess({ label });
  if (access.errorResponse) {
    return access;
  }

  if (!access.accessState?.isClassicAdmin && !access.accessState?.isCrmAdmin) {
    return {
      ...access,
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return access;
}

export function buildMetaSimulationPayload(overrides = {}) {
  const suffix = buildSuffix();
  const phone = overrides.phone || buildPeruTestPhone();
  return {
    object: "leadgen",
    entry: [
      {
        changes: [
          {
            value: {
              leadgen_id: overrides.externalEventId || `meta-sim-${suffix}`,
              form_name: overrides.formName || "Meta simulation",
              ad_name: overrides.adName || "CRM test ad",
              created_time: new Date().toISOString(),
              field_data: [
                { name: "full_name", values: [overrides.fullName || `Meta Test ${suffix}`] },
                { name: "email", values: [overrides.email || `meta-sim-${suffix}@example.com`] },
                { name: "phone_number", values: [phone] },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function buildWebFormSimulationPayload(overrides = {}) {
  const suffix = buildSuffix();
  const phone = overrides.phone || buildPeruTestPhone();
  return {
    fullName: overrides.fullName || `WebForm Test ${suffix}`,
    email: overrides.email || `webform-sim-${suffix}@example.com`,
    phone,
    siteKey: overrides.siteKey || "main_site",
    formKey: overrides.formKey || "crm_simulation",
    formLabel: overrides.formName || "WebForm simulation",
    pagePath: overrides.pagePath || "/admin/crm",
  };
}
