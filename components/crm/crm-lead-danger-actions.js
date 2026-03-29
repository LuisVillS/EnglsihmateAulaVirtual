"use client";

import { useState } from "react";
import { archiveLeadAction, deleteLeadAction } from "@/app/admin/crm/actions";
import CrmModal from "@/components/crm/crm-modal";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

const SIZE_CLASSES = {
  sm: {
    archive:
      "inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.06)] px-4 text-sm font-semibold text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.1)]",
    delete:
      "inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(239,68,68,0.18)] bg-white px-4 text-sm font-semibold text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.08)]",
  },
  md: {
    archive:
      "inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.06)] px-4 text-sm font-semibold text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.1)]",
    delete:
      "inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(239,68,68,0.18)] bg-white px-4 text-sm font-semibold text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.08)]",
  },
};

export default function CrmLeadDangerActions({
  leadId,
  returnTo,
  size = "sm",
  archiveLabel = "Archive",
  deleteLabel = "Delete",
  deleteDescription = "Delete permanently removes the lead from the live CRM pipeline. Archive is the safer default.",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const classes = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  return (
    <div className={joinClasses("flex flex-wrap gap-2", className)}>
      <form action={archiveLeadAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button className={classes.archive}>{archiveLabel}</button>
      </form>

      <button type="button" onClick={() => setOpen(true)} className={classes.delete}>
        {deleteLabel}
      </button>

      <CrmModal
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        title="Delete this lead?"
        description={deleteDescription}
      >
        <div className="space-y-4">
          <div className="rounded-[20px] border border-[rgba(239,68,68,0.16)] bg-[rgba(254,242,242,0.92)] px-4 py-4 text-sm leading-6 text-[#7f1d1d]">
            This action requires confirmation. Archive keeps the lead out of the active pipeline without removing the live record.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancel
            </button>
            <form action={deleteLeadAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#b91c1c] px-4 text-sm font-semibold text-white transition hover:bg-[#991b1b]">
                Confirm delete
              </button>
            </form>
          </div>
        </div>
      </CrmModal>
    </div>
  );
}
