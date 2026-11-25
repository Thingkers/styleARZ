const STAFF_ROLES = ["admin", "superadmin"];
const SUPER_ROLES = ["superadmin"];

function isStaff(user) {
  return Boolean(user && STAFF_ROLES.includes(user.role));
}

function isSuperAdmin(user) {
  return Boolean(user && SUPER_ROLES.includes(user.role));
}

/** If no shop owner exists yet, promote the oldest admin (or first user with admin access). */
function ensureSuperAdmin(db) {
  if (!db || !Array.isArray(db.users)) return false;
  if (db.users.some((user) => user && user.role === "superadmin")) return false;
  const admins = db.users.filter((user) => user && user.role === "admin");
  if (!admins.length) return false;
  const preferred =
    admins.find((user) => String(user.email || "").toLowerCase() === "admin@stylearz.com") ||
    admins.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))[0];
  if (!preferred) return false;
  preferred.role = "superadmin";
  return true;
}

module.exports = {
  STAFF_ROLES,
  SUPER_ROLES,
  isStaff,
  isSuperAdmin,
  ensureSuperAdmin,
};
