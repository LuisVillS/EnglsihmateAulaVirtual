export async function isUserInPreEnrollmentFlow(client, userId, knownStatus = null) {
  if (!userId) return false;
  if (knownStatus === "enrolled") return false;
  if (knownStatus === "pre_registered") return true;

  try {
    const { count: enrollmentsCount } = await client
      .from("course_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((enrollmentsCount || 0) > 0) {
      return false;
    }
  } catch {
    // Ignore missing table/permissions and keep fallback checks.
  }

  try {
    const { data: latestPre } = await client
      .from("pre_enrollments")
      .select("status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestPre) return false;
    return latestPre.status !== "APPROVED";
  } catch {
    return false;
  }
}
