export const USER_ROLES = {
  ADMIN: "admin",
  STUDENT: "student",
  NON_STUDENT: "non_student",
};

export function isAdminRole(role) {
  return role === USER_ROLES.ADMIN;
}

export function isStudentRole(role) {
  return role === USER_ROLES.STUDENT;
}

export function isNonStudentRole(role) {
  return role === USER_ROLES.NON_STUDENT;
}

export function resolveProfileRole({ role, status }) {
  if (role === USER_ROLES.ADMIN) return USER_ROLES.ADMIN;
  if (role === USER_ROLES.STUDENT) return USER_ROLES.STUDENT;
  if (status === "enrolled") return USER_ROLES.STUDENT;
  return USER_ROLES.NON_STUDENT;
}
