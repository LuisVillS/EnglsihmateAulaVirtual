import { NextResponse } from "next/server";
import { submitCrmWebFormLead } from "@/lib/crm/integrations/web-form-ingestion";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function validatePayload(payload = {}) {
  const fullName = normalizeFreeText(payload.fullName || payload.full_name || payload.name);
  const email = normalizeFreeText(payload.email);
  const phone = normalizeFreeText(payload.phone || payload.phone_number);
  const siteKey = normalizeFreeText(payload.siteKey || payload.site_key);
  const formKey = normalizeFreeText(payload.formKey || payload.form_key);
  const formLabel = normalizeFreeText(payload.formLabel || payload.form_label);
  const pagePath = normalizeFreeText(payload.pagePath || payload.page_path);

  if (!fullName) {
    throw new Error("full_name is required.");
  }
  if (!email && !phone) {
    throw new Error("At least one of email or phone is required.");
  }
  if (!siteKey) {
    throw new Error("site_key is required.");
  }
  if (!formKey) {
    throw new Error("form_key is required.");
  }
  if (!formLabel) {
    throw new Error("form_label is required.");
  }
  if (!pagePath) {
    throw new Error("page_path is required.");
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    validatePayload(payload);

    const result = await submitCrmWebFormLead({
      payload,
      headers: request.headers,
    });

    return NextResponse.json({
      ok: true,
      lead_id: result.leadId || null,
      inbound_event_id: result.inboundEventId || null,
      message: "Lead captured successfully",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Lead submission failed.",
      },
      { status: 400 }
    );
  }
}
