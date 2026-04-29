import test from "node:test";
import assert from "node:assert/strict";
import { isExternalIngestMergeCandidate } from "../lib/crm/integrations/external-lead-merge-policy.js";

test("external ingestion may merge into a normal open lead", () => {
  assert.equal(
    isExternalIngestMergeCandidate({
      id: "lead-open",
      lead_status: "open",
      current_pre_enrollment_status: "PAYMENT_SUBMITTED",
      approved_payment_count: 0,
      approved_revenue_soles: 0,
    }),
    true
  );
});

test("external ingestion does not merge into won or approved leads", () => {
  const closedCandidates = [
    { id: "lead-won", lead_status: "won" },
    { id: "lead-approved-status", lead_status: "open", current_pre_enrollment_status: "APPROVED" },
    { id: "lead-won-at", lead_status: "open", won_at: "2026-04-20T10:00:00.000Z" },
    {
      id: "lead-approved-at",
      lead_status: "open",
      approved_pre_enrollment_at: "2026-04-20T10:00:00.000Z",
    },
    { id: "lead-revenue", lead_status: "open", approved_payment_count: 1, approved_revenue_soles: 120 },
  ];

  for (const lead of closedCandidates) {
    assert.equal(isExternalIngestMergeCandidate(lead), false, lead.id);
  }
});
