function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function hasApprovedRevenue(lead) {
  return Number(lead?.approved_payment_count || 0) > 0 || Number(lead?.approved_revenue_soles || 0) > 0;
}

export function isExternalIngestMergeCandidate(lead) {
  if (!lead?.id) return false;
  if (String(lead.lead_status || "").toLowerCase() !== "open") return false;
  if (String(lead.current_pre_enrollment_status || "").toUpperCase() === "APPROVED") return false;
  if (normalizeFreeText(lead.won_at) || normalizeFreeText(lead.approved_pre_enrollment_at)) return false;
  if (hasApprovedRevenue(lead)) return false;
  return true;
}
