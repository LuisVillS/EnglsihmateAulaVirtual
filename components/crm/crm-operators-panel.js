"use client";

import { useActionState, useEffect, useRef } from "react";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import { createCrmOperatorAction } from "@/app/admin/crm/actions";
import { CrmBadge } from "@/components/crm/crm-ui";

const INITIAL_STATE = {
  success: false,
  error: null,
  message: null,
  tempPassword: null,
  email: null,
};

export default function CrmOperatorsPanel({ operators, canEdit }) {
  const [state, formAction, pending] = useActionState(createCrmOperatorAction, INITIAL_STATE);
  const formRef = useRef(null);

  useEffect(() => {
    if (state?.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state?.success]);

  return (
    <div className="space-y-4">
      <AdminCard className="space-y-4">
        <AdminSectionHeader
          eyebrow="Operator access"
          title="CRM operators"
          description="CRM admins and classic admins can create call agent users here. The account is created server-side and can sign in through /admin/login."
          meta={<CrmBadge tone="accent">{operators.length} operator(s)</CrmBadge>}
        />

        {canEdit ? (
          <form ref={formRef} action={formAction} className="space-y-4 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <input type="hidden" name="role" value="crm_operator" />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Full name</span>
                <input
                  name="fullName"
                  type="text"
                  placeholder="Call agent name"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="agent@example.com"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Phone</span>
                <input
                  name="phone"
                  type="text"
                  placeholder="+51 999 999 999"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Notes</span>
                <input
                  name="notes"
                  type="text"
                  placeholder="Shift, language, or coverage notes"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#64748b]">A new auth user gets a one-time password only if the email does not already exist in Supabase Auth.</p>
              <button
                disabled={pending}
                className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Creating..." : "Create operator"}
              </button>
            </div>

            {state?.error ? <p className="rounded-2xl border border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#b91c1c]">{state.error}</p> : null}
            {state?.success ? (
              <div className="space-y-2 rounded-2xl border border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.06)] px-4 py-3 text-sm text-[#065f46]">
                <p className="font-semibold">{state.message || "CRM operator saved."}</p>
                <p>Email: {state.email}</p>
                {state.tempPassword ? (
                  <p className="break-all rounded-xl bg-white px-3 py-2 font-mono text-sm text-[#0f172a]">
                    One-time password: {state.tempPassword}
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : (
          <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 text-sm text-[#475569]">
            Only CRM admins or classic admins can create or invite new operators.
          </div>
        )}
      </AdminCard>

      <AdminCard className="space-y-4 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-[#0f172a]">
            <thead>
              <tr className="bg-[#f8fafc] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                <th className="px-4 py-3 font-semibold">Operator</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((operator) => (
                <tr key={operator.user_id} className="border-t border-[rgba(15,23,42,0.08)] align-top">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-[#111827]">{operator.profile?.full_name || operator.email || "Unnamed operator"}</p>
                      <p className="text-xs text-[#64748b]">{operator.email}</p>
                      <p className="text-xs text-[#64748b]">User ID: {operator.user_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <CrmBadge tone={operator.role === "crm_admin" ? "accent" : "neutral"}>{operator.role}</CrmBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-[#334155]">{operator.profile?.phone || "No phone"}</p>
                      <p className="text-xs text-[#64748b]">{operator.profile?.notes || "No notes"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <CrmBadge tone={operator.is_active ? "success" : "neutral"}>{operator.is_active ? "Active" : "Inactive"}</CrmBadge>
                      <CrmBadge tone="neutral">{operator.profile?.is_active ? "Profile active" : "Profile inactive"}</CrmBadge>
                    </div>
                  </td>
                </tr>
              ))}
              {!operators.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#64748b]">
                    No CRM operators have been configured yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
