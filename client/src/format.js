export function money(value) {
  const amount = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(value || 0);
  return `৳${amount}`;
}

export function prettyDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function prettyDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
