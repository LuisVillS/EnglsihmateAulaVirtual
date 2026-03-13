import { cache } from "react";
import { getRequestUserContext } from "@/lib/request-user-context";
import { getStudyWithMeAccess, getStudyWithMeLockMessage } from "@/lib/study-with-me-access";

export const getShellUser = cache(async function getShellUser() {
  const { user, displayName, avatarUrl, isAdmin, role, supabase } = await getRequestUserContext();

  let studyWithMeUnlocked = false;
  let studyWithMeLockMessage = "Disponible solo para alumnos Premium.";

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
    studyWithMeUnlocked,
    studyWithMeLockMessage,
  };
});
