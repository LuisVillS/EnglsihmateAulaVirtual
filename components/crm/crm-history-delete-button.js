"use client";

import { useState } from "react";
import { deleteCrmInteractionAction } from "@/app/admin/crm/actions";
import CrmModal from "@/components/crm/crm-modal";

export default function CrmHistoryDeleteButton({
  interactionId,
  leadId,
  returnTo,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(239,68,68,0.18)] bg-white px-3 text-xs font-semibold text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.08)]"
      >
        Delete
      </button>

      <CrmModal
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        title="Delete this history item?"
        description="This removes the selected contact-history entry from the Calling Hub timeline."
      >
        <div className="space-y-4">
          <div className="rounded-[20px] border border-[rgba(239,68,68,0.16)] bg-[rgba(254,242,242,0.92)] px-4 py-4 text-sm leading-6 text-[#7f1d1d]">
            Delete only this entry if it is noise or no longer useful. The lead itself will remain in the CRM.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancel
            </button>
            <form action={deleteCrmInteractionAction}>
              <input type="hidden" name="interactionId" value={interactionId} />
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#b91c1c] px-4 text-sm font-semibold text-white transition hover:bg-[#991b1b]">
                Confirm delete
              </button>
            </form>
          </div>
        </div>
      </CrmModal>
    </>
  );
}
