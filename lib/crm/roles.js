export const CRM_ROLE_VALUES = Object.freeze(["crm_admin", "crm_operator"]);

const CRM_ROLE_SET = new Set(CRM_ROLE_VALUES);

export function normalizeCrmRole(role) {
  const normalized = role?.toString().trim().toLowerCase();
  if (!normalized) return null;
  return CRM_ROLE_SET.has(normalized) ? normalized : null;
}

export function isCrmRole(role) {
  return Boolean(normalizeCrmRole(role));
}

export function isCrmAdminRole(role) {
  return normalizeCrmRole(role) === "crm_admin";
}

export function isCrmOperatorRole(role) {
  return normalizeCrmRole(role) === "crm_operator";
}

export function isCrmPath(pathname) {
  const normalized = pathname?.toString().trim() || "";
  if (!normalized) return false;
  return normalized === "/admin/crm" || normalized.startsWith("/admin/crm/");
}
