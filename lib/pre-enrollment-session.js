import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getPreEnrollSessionUserIdFromRequest } from "@/lib/pre-enroll-auth";

export async function resolvePreEnrollmentUserId(request) {
  const cookieUserId = getPreEnrollSessionUserIdFromRequest(request);
  if (cookieUserId) {
    return cookieUserId;
  }

  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}
