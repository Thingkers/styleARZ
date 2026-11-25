export function isStaff(user) {
  return Boolean(user && (user.role === "admin" || user.role === "superadmin"));
}

export function isSuperAdmin(user) {
  return Boolean(user && user.role === "superadmin");
}
