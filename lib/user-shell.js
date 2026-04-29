import { cache } from "react";
import { getRequestUserContext } from "@/lib/request-user-context";
import { getStudentUiLanguage } from "@/lib/student-ui-language";
import { getStudyWithMeAccess, getStudyWithMeLockMessage } from "@/lib/study-with-me-access";

export const getShellUser = cache(async function getShellUser() {
  const { user, displayName, avatarUrl, isAdmin, role, supabase, profile } = await getRequestUserContext();

  let studyWithMeUnlocked = false;
  let studyWithMeLockMessage = "Disponible para alumnos con curso activo.";

  if (user && !isAdmin) {
    const studyWithMeAccess = await getStudyWithMeAccess({ supabase, userId: user.id });
    studyWithMeUnlocked = Boolean(studyWithMeAccess?.canAccessPage);
    studyWithMeLockMessage = getStudyWithMeLockMessage(studyWithMeAccess);
  }

  return {
    user,
    displayName,
    avatarUrl,
    isAdmin,
    role,
    studentUiLanguage: getStudentUiLanguage(profile?.course_level || ""),
    studyWithMeUnlocked,
    studyWithMeLockMessage,
  };
});
