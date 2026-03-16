import { redirect } from "next/navigation";
import MatriculaPage from "@/app/matricula/page";
import MonthlyPaymentCard from "@/components/monthly-payment-card";
import { getRequestUserContext } from "@/lib/request-user-context";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import {
  resolveCourseRenewalContext,
} from "@/lib/payments";

function formatDate(date) {
  if (!(date instanceof Date)) return "-";
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const metadata = {
  title: "Mi matrícula | Aula Virtual",
};

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/'([^']+)'/);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

async function getPaymentsForMonths(service, studentId, billingMonths) {
  const baseColumns = [
    "id",
    "student_id",
    "billing_month",
    "amount_soles",
    "status",
    "receipt_url",
    "created_at",
    "approved_at",
    "approved_screen_seen",
    "approved_screen_seen_at",
  ];

  let columns = [...baseColumns];
  let hasApprovedAt = true;
  let hasApprovedScreenSeen = true;
  let hasApprovedScreenSeenAt = true;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await service
      .from("payments")
      .select(columns.join(","))
      .eq("student_id", studentId)
      .in("billing_month", billingMonths);

    if (!result.error) {
      return (result.data || []).map((payment) => ({
        ...payment,
        approved_at: hasApprovedAt ? payment.approved_at || null : null,
        approved_screen_seen: hasApprovedScreenSeen ? payment.approved_screen_seen : true,
        approved_screen_seen_at: hasApprovedScreenSeenAt ? payment.approved_screen_seen_at || null : null,
      }));
    }

    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !columns.includes(missingColumn)) {
      console.error("No se pudieron listar pagos mensuales", result.error);
      return [];
    }

    if (missingColumn === "approved_at") hasApprovedAt = false;
    if (missingColumn === "approved_screen_seen") hasApprovedScreenSeen = false;
    if (missingColumn === "approved_screen_seen_at") hasApprovedScreenSeenAt = false;
    columns = columns.filter((column) => column !== missingColumn);
  }

  return [];
}

function getMissingColumnFromSessionsError(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/'([^']+)'/);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

async function getCommissionSessionsForRenewal(service, commissionId) {
  if (!commissionId) return [];
  const baseColumns = ["id", "cycle_month", "session_in_cycle", "session_date", "starts_at", "ends_at"];
  let columns = [...baseColumns];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const query = service.from("course_sessions").select(columns.join(",")).eq("commission_id", commissionId);
    if (columns.includes("starts_at")) {
      query.order("starts_at", { ascending: true, nullsFirst: false });
    }
    if (columns.includes("session_date")) {
      query.order("session_date", { ascending: true });
    }
    const result = await query;
    if (!result.error) {
      return result.data || [];
    }
    const missingColumn = getMissingColumnFromSessionsError(result.error);
    if (!missingColumn || !columns.includes(missingColumn)) {
      console.error("No se pudieron listar sesiones para renovacion", result.error);
      return [];
    }
    columns = columns.filter((column) => column !== missingColumn);
  }
  return [];
}

export default async function AppMatriculaPage({ searchParams }) {
  const resolvedSearchParams = (await searchParams) || {};
  const showLockedNotice = String(resolvedSearchParams.locked || "") === "1";
  const { user } = await getRequestUserContext();

  if (!user) {
    redirect("/login");
  }

  const service = getServiceSupabaseClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, role, is_premium, commission_id, commission:course_commissions(start_date,end_date)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    redirect("/login");
  }

  if (profile.role !== "student" || !profile.commission_id) {
    return (
      <div className="space-y-4">
        {showLockedNotice ? (
          <div className="student-panel-soft border-accent/40 bg-accent/10 px-4 py-4 text-sm text-foreground">
            <p className="text-xs uppercase tracking-[0.28em] text-primary">Acceso a matrícula</p>
            <p className="mt-2">
              Solo puedes usar <strong>Mi matrícula</strong> hasta completar tu registro como estudiante.
            </p>
          </div>
        ) : null}
        <MatriculaPage />
      </div>
    );
  }

  const now = new Date();
  const commissionSessions = await getCommissionSessionsForRenewal(service, profile.commission_id);
  const renewal = resolveCourseRenewalContext({
    now,
    courseStartDate: profile?.commission?.start_date || null,
    courseEndDate: profile?.commission?.end_date || null,
    sessions: commissionSessions,
    preOpenHours: 24,
  });
  const currentBillingMonth = renewal.currentBillingMonthKey;
  const nextBillingMonth = renewal.nextBillingMonthKey;
  const enabledFrom = renewal.enabledFrom;
  const canPayNow = renewal.canPayNow;
  const canRenewSameCourse = renewal.canRenewSameCourse;
  const canStartNewEnrollment = renewal.canStartNewEnrollment;
  const amount = profile.is_premium ? 139 : 99;

  const billingMonths = [currentBillingMonth, nextBillingMonth].filter(Boolean);
  const payments = await getPaymentsForMonths(service, profile.id, billingMonths);
  const paymentByMonth = new Map((payments || []).map((payment) => [payment.billing_month, payment]));
  const currentMonthPayment = paymentByMonth.get(currentBillingMonth) || null;
  const nextMonthPayment = paymentByMonth.get(nextBillingMonth) || null;
  const nextStatus = (nextMonthPayment?.status || "").toLowerCase();

  if (nextStatus === "submitted") {
    return (
      <MonthlyPaymentCard
        mode="submitted"
        amount={amount}
        billingMonth={nextBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        paymentRecord={nextMonthPayment}
      />
    );
  }

  if (nextStatus === "rejected") {
    return (
      <MonthlyPaymentCard
        mode="rejected"
        amount={amount}
        billingMonth={nextBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        paymentRecord={nextMonthPayment}
      />
    );
  }

  if (nextStatus === "approved" && nextMonthPayment?.approved_screen_seen === false) {
    return (
      <MonthlyPaymentCard
        mode="approvedOnce"
        amount={amount}
        billingMonth={nextBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        paymentRecord={nextMonthPayment}
      />
    );
  }

  if (nextStatus === "approved") {
    return (
      <MonthlyPaymentCard
        mode="renewalLocked"
        amount={amount}
        billingMonth={nextBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        paymentRecord={nextMonthPayment}
      />
    );
  }

  if (canRenewSameCourse && canPayNow && (!nextMonthPayment || nextStatus === "pending")) {
    return (
      <MonthlyPaymentCard
        mode="renewalPay"
        amount={amount}
        billingMonth={nextBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        canPayNow={canPayNow}
        paymentRecord={nextMonthPayment}
      />
    );
  }

  const hasCurrentApprovedRecord = currentMonthPayment?.status === "approved";
  if (hasCurrentApprovedRecord && currentMonthPayment.approved_screen_seen === false) {
    return (
      <MonthlyPaymentCard
        mode="approvedOnce"
        amount={amount}
        billingMonth={currentBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        paymentRecord={currentMonthPayment}
      />
    );
  }

  const hasLegacyApprovedEnrollment = !currentMonthPayment && Boolean(profile.commission_id);
  if (!canRenewSameCourse && canStartNewEnrollment) {
    return (
      <div className="space-y-4">
        <div className="student-panel px-5 py-5">
          <p className="text-xs uppercase tracking-[0.28em] text-primary">Mi matrícula</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">Tu curso actual está por finalizar.</p>
          <p className="mt-1 text-sm text-muted">
            Ya puedes iniciar una nueva matrícula para el siguiente ciclo usando el flujo existente de abajo.
          </p>
        </div>
        <MatriculaPage />
      </div>
    );
  }

  if (hasCurrentApprovedRecord || hasLegacyApprovedEnrollment) {
    return (
      <MonthlyPaymentCard
        mode="renewalLocked"
        amount={amount}
        billingMonth={nextBillingMonth}
        enabledFrom={formatDate(enabledFrom)}
        paymentRecord={nextMonthPayment}
      />
    );
  }

  return <MatriculaPage />;
}
