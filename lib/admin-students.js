import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export const ADMIN_STUDENTS_PAGE_SIZE = 50;

const NON_APPROVED_PRE_ENROLLMENT_STATUSES = new Set([
  "PENDING_EMAIL_VERIFICATION",
  "EMAIL_VERIFIED",
  "IN_PROGRESS",
  "RESERVED",
  "PAYMENT_SUBMITTED",
  "PAID_AUTO",
  "REJECTED",
  "EXPIRED",
  "ABANDONED",
]);

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/'([^']+)'/);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function isMissingAdminStudentsRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("admin_list_students") && (
    message.includes("does not exist") ||
    message.includes("not found") ||
    message.includes("could not find")
  );
}

function normalizeRpcStudentRow(row) {
  return {
    id: row.id,
    full_name: row.full_name || "",
    email: row.email || "",
    dni: row.dni || "",
    phone: row.phone || "",
    birth_date: row.birth_date || null,
    email_verified_at: row.email_verified_at || null,
    student_code: row.student_code || "",
    course_level: row.course_level || "",
    is_premium: Boolean(row.is_premium),
    role: row.role || "",
    created_at: row.created_at || null,
    preferred_hour: row.preferred_hour ?? null,
    status: row.status || null,
    commission_id: row.commission_id || null,
    start_month: row.start_month || null,
    enrollment_date: row.enrollment_date || null,
    password_set: Boolean(row.password_set),
    commission: row.commission_id
      ? {
          id: row.commission_id,
          course_level: row.commission_course_level || "",
          commission_number: row.commission_number ?? null,
        }
      : null,
  };
}

async function loadAdminStudentsPageViaRpc({
  supabase,
  courseFilter = "",
  searchTerm = "",
  hourFilter = null,
  page = 1,
  pageSize = ADMIN_STUDENTS_PAGE_SIZE,
}) {
  const result = await supabase.rpc("admin_list_students", {
    p_course_level: courseFilter || null,
    p_search: searchTerm || null,
    p_preferred_hour: hourFilter,
    p_page: page,
    p_page_size: pageSize,
  });

  if (result.error) {
    return {
      students: [],
      totalCount: 0,
      error: result.error,
    };
  }

  const rows = result.data || [];
  const totalCount = Number(rows[0]?.total_count || 0) || 0;
  return {
    students: rows.map(normalizeRpcStudentRow),
    totalCount,
    error: null,
  };
}

async function loadAdminStudentsPageLegacy({
  supabase,
  courseFilter = "",
  searchTerm = "",
  hourFilter = null,
  page = 1,
  pageSize = ADMIN_STUDENTS_PAGE_SIZE,
}) {
  const baseColumns = [
    "id",
    "full_name",
    "email",
    "dni",
    "phone",
    "birth_date",
    "email_verified_at",
    "student_code",
    "course_level",
    "is_premium",
    "start_month",
    "enrollment_date",
    "role",
    "password_set",
    "created_at",
    "preferred_hour",
    "status",
    "commission_id",
  ];
  let selectColumns = [...baseColumns];
  let hasStatusColumn = true;
  let hasCommissionColumn = true;
  let hasEmailVerifiedAtColumn = true;
  let studentsData = null;
  let studentsError = null;

  const runStudentsQuery = async () => {
    let query = supabase.from("profiles").select(selectColumns.join(","));

    if (courseFilter) {
      query = query.eq("course_level", courseFilter);
    }
    if (hourFilter != null) {
      query = query.eq("preferred_hour", hourFilter);
    }
    if (searchTerm) {
      const sanitized = searchTerm.replace(/%/g, "\\%").replace(/,/g, "\\,");
      query = query.or(
        `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,dni.ilike.%${sanitized}%,student_code.ilike.%${sanitized}%`
      );
    }
    return query.order("created_at", { ascending: false });
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await runStudentsQuery();
    studentsData = result.data;
    studentsError = result.error;
    if (!studentsError) break;

    const missingColumn = getMissingColumnFromError(studentsError);
    if (!missingColumn) break;

    if (missingColumn === "status") {
      hasStatusColumn = false;
      selectColumns = selectColumns.filter((col) => col !== "status");
      continue;
    }
    if (missingColumn === "commission_id") {
      hasCommissionColumn = false;
      selectColumns = selectColumns.filter((col) => col !== "commission_id");
      continue;
    }
    if (missingColumn === "email_verified_at") {
      hasEmailVerifiedAtColumn = false;
      selectColumns = selectColumns.filter((col) => col !== "email_verified_at");
      continue;
    }
    break;
  }

  if (studentsError) {
    return {
      students: [],
      totalCount: 0,
      error: studentsError,
    };
  }

  const unresolvedStudents = studentsData || [];
  const obviousStudentIds = new Set(
    unresolvedStudents
      .filter((student) => {
        const effectiveRole = resolveProfileRole({
          role: student.role,
          status: hasStatusColumn ? student.status : undefined,
        });
        if (effectiveRole === USER_ROLES.ADMIN) return false;
        return effectiveRole === USER_ROLES.STUDENT || Boolean(student.commission_id) || Boolean(student.course_level);
      })
      .map((student) => student.id)
      .filter(Boolean)
  );

  const ambiguousUserIds = unresolvedStudents
    .filter((student) => {
      if (!student?.id || obviousStudentIds.has(student.id)) return false;
      const effectiveRole = resolveProfileRole({
        role: student.role,
        status: hasStatusColumn ? student.status : undefined,
      });
      return effectiveRole !== USER_ROLES.ADMIN;
    })
    .map((student) => student.id);

  let enrolledUserIds = new Set();
  const latestPreEnrollmentStatusByUserId = new Map();
  if (ambiguousUserIds.length) {
    const [{ data: enrollmentsRows }, preEnrollmentResult] = await Promise.all([
      supabase
        .from("course_enrollments")
        .select("user_id")
        .in("user_id", ambiguousUserIds),
      supabase
        .from("pre_enrollments")
        .select("user_id, status, created_at")
        .in("user_id", ambiguousUserIds)
        .order("created_at", { ascending: false }),
    ]);

    enrolledUserIds = new Set((enrollmentsRows || []).map((row) => row.user_id));

    if (!preEnrollmentResult.error) {
      for (const row of preEnrollmentResult.data || []) {
        if (!row?.user_id || latestPreEnrollmentStatusByUserId.has(row.user_id)) continue;
        latestPreEnrollmentStatusByUserId.set(row.user_id, row.status || null);
      }
    }
  }

  const resolvedStudents = unresolvedStudents.filter((student) => {
    const effectiveRole = resolveProfileRole({
      role: student.role,
      status: hasStatusColumn ? student.status : undefined,
    });
    if (effectiveRole === USER_ROLES.ADMIN) return false;
    if (obviousStudentIds.has(student.id)) return true;

    const hasEnrollment = enrolledUserIds.has(student.id);
    const latestPreStatus = latestPreEnrollmentStatusByUserId.get(student.id) || null;
    const hasActivePreEnrollment =
      latestPreStatus &&
      latestPreStatus !== "APPROVED" &&
      NON_APPROVED_PRE_ENROLLMENT_STATUSES.has(latestPreStatus);
    const hasStudentSignals =
      effectiveRole === USER_ROLES.STUDENT ||
      hasEnrollment ||
      Boolean(student.commission_id) ||
      Boolean(student.course_level) ||
      latestPreStatus === "APPROVED";

    if (hasStudentSignals) return true;
    if (!hasStatusColumn) return !hasActivePreEnrollment;
    if (hasActivePreEnrollment) return false;
    return true;
  });

  const commissionIds = hasCommissionColumn
    ? Array.from(new Set(resolvedStudents.map((student) => student.commission_id).filter(Boolean)))
    : [];

  let commissionsById = new Map();
  if (commissionIds.length) {
    const { data: linkedCommissions } = await supabase
      .from("course_commissions")
      .select("id, course_level, commission_number")
      .in("id", commissionIds);
    commissionsById = new Map((linkedCommissions || []).map((item) => [item.id, item]));
  }

  const hydratedStudents = resolvedStudents.map((student) => ({
    ...student,
    email_verified_at: hasEmailVerifiedAtColumn ? student.email_verified_at : null,
    commission: student.commission_id ? commissionsById.get(student.commission_id) || null : null,
  }));

  const totalCount = hydratedStudents.length;
  const pageStart = Math.max(0, (page - 1) * pageSize);

  return {
    students: hydratedStudents.slice(pageStart, pageStart + pageSize),
    totalCount,
    error: null,
  };
}

export async function loadAdminStudentsPage(options) {
  const rpcResult = await loadAdminStudentsPageViaRpc(options);
  if (!rpcResult.error) {
    return rpcResult;
  }

  if (!isMissingAdminStudentsRpcError(rpcResult.error)) {
    console.error("No se pudo cargar alumnos via RPC admin_list_students; usando fallback legado", rpcResult.error);
  }

  return loadAdminStudentsPageLegacy(options);
}

export async function loadAdminStudentsExportRows({
  supabase,
  courseFilter = "",
  searchTerm = "",
  hourFilter = null,
}) {
  const pageSize = 500;
  let page = 1;
  let rows = [];

  while (true) {
    const result = await loadAdminStudentsPage({
      supabase,
      courseFilter,
      searchTerm,
      hourFilter,
      page,
      pageSize,
    });

    if (result.error) {
      return result;
    }

    rows = rows.concat(result.students);
    if (result.students.length < pageSize) {
      return {
        students: rows,
        totalCount: result.totalCount || rows.length,
        error: null,
      };
    }

    page += 1;
    if (rows.length >= (result.totalCount || 0)) {
      return {
        students: rows,
        totalCount: result.totalCount || rows.length,
        error: null,
      };
    }
  }
}
