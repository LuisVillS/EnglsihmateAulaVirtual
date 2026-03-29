import Link from "next/link";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function cleanDialCharacters(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const withoutProtocol = raw.replace(/^tel:/i, "");
  const hasLeadingPlus = withoutProtocol.startsWith("+");
  const digitsOnly = withoutProtocol.replace(/\D/g, "");
  if (!digitsOnly) return "";
  return `${hasLeadingPlus ? "+" : ""}${digitsOnly}`;
}

export function resolveCrmDialNumber(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return cleanDialCharacters(value) || null;
  }

  const phoneCountryCode = String(value.phone_country_code || "").replace(/\D/g, "");
  const phoneNationalNumber = String(
    value.phone_national_number || value.phone_local_number || value.phone_number || ""
  ).replace(/\D/g, "");
  const sourceMetadata = value.source_metadata && typeof value.source_metadata === "object" ? value.source_metadata : {};
  const metadataCountryCode = String(
    sourceMetadata.phone_country_code ||
      sourceMetadata.phoneInfo?.countryCode ||
      sourceMetadata.canonical_phone?.country_code ||
      ""
  ).replace(/\D/g, "");
  const metadataNationalNumber = String(
    sourceMetadata.phone_national_number ||
      sourceMetadata.phoneInfo?.nationalNumber ||
      sourceMetadata.canonical_phone?.national_number ||
      ""
  ).replace(/\D/g, "");

  if (phoneCountryCode && phoneNationalNumber) {
    return `+${phoneCountryCode}${phoneNationalNumber}`;
  }

  if (metadataCountryCode && metadataNationalNumber) {
    return `+${metadataCountryCode}${metadataNationalNumber}`;
  }

  const candidates = [
    value.phone_dialable,
    value.phone_e164,
    value.phone_normalized,
    value.phone_full,
    sourceMetadata.phone_dialable,
    sourceMetadata.phone_e164,
    sourceMetadata.phoneInfo?.dialable,
    sourceMetadata.canonical_phone?.dialable,
    value.phone,
  ];

  for (const candidate of candidates) {
    const normalized = cleanDialCharacters(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function buildCrmDialHref(value) {
  const dialNumber = resolveCrmDialNumber(value);
  return dialNumber ? `tel:${dialNumber}` : null;
}

export function formatCrmPhoneDisplay(value) {
  const dialNumber = resolveCrmDialNumber(value);
  if (dialNumber) return dialNumber;
  const fallback = typeof value === "string" ? value : value?.phone;
  return String(fallback || "").trim() || "No phone";
}

export function formatCrmDateTime(value) {
  if (!value) return "No timestamp";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCrmDate(value) {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatLeadStatusLabel(value) {
  const map = {
    open: "Open",
    won: "Won",
    lost: "Lost",
    archived: "Archived",
  };
  return map[value] || value || "Unknown";
}

export function formatLeadSourceLabel(value) {
  const map = {
    pre_enrollment: "Virtual classroom",
    classroom_pre_enrollment: "Classroom",
    meta: "Meta",
    meta_lead: "Meta",
    meta_lead_ad: "Meta",
    web_form: "WebForm",
    formspree: "Formspree",
    manual: "Manual",
    other: "Other",
  };
  return map[value] || value || "Unknown";
}

export function resolveToneByLeadSource(value) {
  if (value === "pre_enrollment" || value === "classroom_pre_enrollment") return "accent";
  if (value === "meta" || value === "meta_lead" || value === "meta_lead_ad") return "success";
  if (value === "web_form") return "warning";
  if (value === "formspree") return "warning";
  return "neutral";
}

export function resolveLeadSourceValue(lead) {
  return lead?.source_origin || lead?.source_type || "other";
}

const APPROVED_CARD_TAG_LABELS = new Set(["Virtual classroom", "Meta", "WebForm", "Formspree"]);

function normalizeTagValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized;
}

function resolveSourceTagLabel(tag) {
  if (!tag || typeof tag !== "object") return null;
  return (
    normalizeTagValue(tag.source_label) ||
    normalizeTagValue(formatLeadSourceLabel(tag.source_origin || tag.source_type)) ||
    normalizeTagValue(tag.source_origin) ||
    normalizeTagValue(tag.source_type)
  );
}

function resolveApprovedCardTagLabel(tag) {
  if (!tag || typeof tag !== "object") return null;

  const originLabel = formatLeadSourceLabel(tag.source_origin || tag.source_type);
  if (originLabel === "Classroom") {
    return "Virtual classroom";
  }
  if (APPROVED_CARD_TAG_LABELS.has(originLabel)) {
    return originLabel;
  }

  const sourceLabel = normalizeTagValue(tag.source_label);
  if (sourceLabel === "Classroom") return "Virtual classroom";
  if (APPROVED_CARD_TAG_LABELS.has(sourceLabel)) return sourceLabel;

  return null;
}

export function deriveLeadSourceTags(lead) {
  if (!lead || typeof lead !== "object") return [];

  const sourceMetadata = lead.source_metadata && typeof lead.source_metadata === "object" ? lead.source_metadata : {};
  const tags = [];
  const push = (value) => {
    const normalized = normalizeTagValue(value);
    if (!normalized || tags.includes(normalized) || tags.length >= 3) return;
    tags.push(normalized);
  };

  if (Array.isArray(lead.source_tags)) {
    for (const tag of lead.source_tags) {
      push(resolveSourceTagLabel(tag));
      if (tags.length >= 3) return tags;
    }
  }

  const sourceTags = sourceMetadata.source_tags;
  if (Array.isArray(sourceTags)) {
    for (const tag of sourceTags) {
      push(typeof tag === "string" ? tag : resolveSourceTagLabel(tag));
      if (tags.length >= 3) return tags;
    }
  }

  push(lead.source_label);
  push(lead.form_label);
  push(formatLeadSourceLabel(resolveLeadSourceValue(lead)));
  push(lead.site_key);
  push(lead.page_path);
  push(lead.source_origin);
  push(lead.source_type);
  push(sourceMetadata.provider);
  push(sourceMetadata.source_label);
  push(sourceMetadata.raw_source_type);

  return tags.slice(0, 3);
}

export function formatCrmLeadSourceSummary(lead) {
  if (!lead || typeof lead !== "object") return "Unknown source";

  const parts = [];
  const sourceLabel = formatLeadSourceLabel(resolveLeadSourceValue(lead));
  if (sourceLabel) parts.push(sourceLabel);

  const formLabel =
    String(lead.form_label || lead.source_label || lead.meta_form_id || "").trim() || null;
  if (formLabel && formLabel !== sourceLabel) {
    parts.push(formLabel);
  }

  const siteLabel =
    lead.host ||
    (lead.site_key === "virtual_site"
      ? "virtual.englishmate.com.pe"
      : lead.site_key === "main_site"
        ? "englishmate.com.pe"
        : null);
  if (siteLabel) {
    parts.push(siteLabel);
  }

  if (lead.page_path) {
    parts.push(lead.page_path);
  }

  return parts.filter(Boolean).join(" · ") || sourceLabel || "Unknown source";
}

export function isStudentLead(lead) {
  if (!lead || typeof lead !== "object") return false;

  const profileStatus = String(lead?.profile?.status || "").trim().toLowerCase();
  return Boolean(
    lead.lead_status === "won" ||
      lead.current_pre_enrollment_status === "APPROVED" ||
      lead.approved_pre_enrollment_at ||
      ["active", "enrolled", "approved"].includes(profileStatus)
  );
}

export function deriveLeadCardTags(lead) {
  if (!lead || typeof lead !== "object") return [];

  const sourceMetadata = lead.source_metadata && typeof lead.source_metadata === "object" ? lead.source_metadata : {};
  const tags = [];
  const push = (value) => {
    const normalized = normalizeTagValue(value);
    if (!normalized || tags.includes(normalized)) return;
    if (normalized === "Student") {
      tags.push(normalized);
      return;
    }
    if (tags.filter((tag) => tag !== "Student").length >= 3) return;
    tags.push(normalized);
  };

  if (Array.isArray(lead.source_tags)) {
    for (const tag of lead.source_tags) {
      push(resolveApprovedCardTagLabel(tag));
    }
  }

  const sourceTags = sourceMetadata.source_tags;
  if (Array.isArray(sourceTags)) {
    for (const tag of sourceTags) {
      push(resolveApprovedCardTagLabel(typeof tag === "string" ? { source_label: tag } : tag));
    }
  }

  push(resolveApprovedCardTagLabel({
    source_origin: lead.source_origin,
    source_type: lead.source_type,
    source_label: lead.source_label,
  }));

  if (isStudentLead(lead)) {
    push("Student");
  }

  return tags.filter(Boolean).slice(0, 4);
}

export function CrmTagRow({ tags = [], className = "" }) {
  const visibleTags = (Array.isArray(tags) ? tags : []).filter(Boolean).slice(0, 4);
  if (!visibleTags.length) return null;

  return (
    <div className={joinClasses("flex flex-wrap gap-2", className)}>
      {visibleTags.map((tag) => (
        <CrmBadge key={tag} tone="neutral">
          {tag}
        </CrmBadge>
      ))}
    </div>
  );
}

export function formatPreEnrollmentStatus(value) {
  const map = {
    PENDING_EMAIL_VERIFICATION: "Pending email verification",
    EMAIL_VERIFIED: "Email verified",
    IN_PROGRESS: "In progress",
    RESERVED: "Reserved",
    PAYMENT_SUBMITTED: "Payment submitted",
    PAID_AUTO: "Paid automatically",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    EXPIRED: "Expired",
    ABANDONED: "Abandoned",
  };
  return map[value] || value || "Unknown";
}

export function formatCallOutcomeLabel(value) {
  const map = {
    attempted: "Attempted",
    connected: "Connected",
    no_answer: "No answer",
    voicemail: "Voicemail",
    callback_requested: "Callback requested",
    wrong_number: "Wrong number",
    not_interested: "Not interested",
  };
  return map[value] || value || "Unknown";
}

export function resolveToneByStatus(value) {
  if (value === "won" || value === "APPROVED") return "success";
  if (value === "lost" || ["REJECTED", "EXPIRED", "ABANDONED"].includes(value)) return "danger";
  if (value === "PAYMENT_SUBMITTED" || value === "PAID_AUTO" || value === "RESERVED") return "warning";
  return "accent";
}

export function CrmBadge({ children, tone = "neutral", className = "" }) {
  const toneClasses = {
    neutral: "border-[rgba(15,23,42,0.08)] bg-[#f8fafc] text-[#475569]",
    accent: "border-[rgba(16,52,116,0.16)] bg-[#eef3ff] text-[#103474]",
    success: "border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.08)] text-[#047857]",
    warning: "border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] text-[#b45309]",
    danger: "border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] text-[#b91c1c]",
  };

  return (
    <span
      className={joinClasses(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        toneClasses[tone] || toneClasses.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

export function CrmMetric({ label, value, hint }) {
  return (
    <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0f172a]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#64748b]">{hint}</p> : null}
    </div>
  );
}

export function CrmNotice({ searchParams }) {
  const pairs = [
    ["claimed", "Lead claimed from the queue.", "success"],
    ["advanced", "Outcome saved and the next lead was claimed.", "success"],
    ["saved", "Changes saved.", "success"],
    ["operator_created", "CRM operator created.", "success"],
    ["stage_saved", "Stage saved.", "success"],
    ["stage_moved", "Stage reordered.", "success"],
    ["stage_toggled", "Stage status updated.", "success"],
    ["automation_saved", "Stage automation saved.", "success"],
    ["stage_error", "Stage configuration needs attention.", "warning"],
    ["lead_archived", "Lead archived safely.", "success"],
    ["lead_deleted", "Lead deleted permanently.", "success"],
    ["history_deleted", "Contact-history entry deleted.", "success"],
    ["manual_created", "Manual lead created.", "success"],
    ["edited", "Quick edit saved.", "success"],
    ["moved", "Stage updated.", "success"],
    ["noted", "Note added.", "success"],
    ["left", "Campaign released safely.", "success"],
    ["empty", "No eligible lead is ready in the queue right now.", "warning"],
  ];

  const simulatedProvider = searchParams?.simulated;
  if (simulatedProvider) {
    const label =
      simulatedProvider === "meta" ? "Meta" : simulatedProvider === "web_form" ? "WebForm" : "External";
    return (
      <div className="rounded-[20px] border border-[rgba(16,52,116,0.1)] bg-white px-4 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
        <CrmBadge tone="success">{label} test lead created through the CRM ingestion flow.</CrmBadge>
      </div>
    );
  }

  const entry = pairs.find(([key]) => searchParams?.[key]);
  if (!entry) return null;

  return (
    <div className="rounded-[20px] border border-[rgba(16,52,116,0.1)] bg-white px-4 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
      <CrmBadge tone={entry[2]}>{entry[1]}</CrmBadge>
    </div>
  );
}

export function CrmSectionLink({ href, label, meta }) {
  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_18px_38px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[rgba(16,52,116,0.16)] hover:shadow-[0_22px_44px_rgba(16,52,116,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#111827]">{label}</p>
          <p className="mt-1 text-sm text-[#64748b]">{meta}</p>
        </div>
        <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-[11px] font-semibold text-[#103474] transition group-hover:bg-[#103474] group-hover:text-white">
          Open
        </span>
      </div>
    </Link>
  );
}
