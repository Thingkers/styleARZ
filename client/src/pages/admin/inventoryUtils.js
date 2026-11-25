import { api } from "../../api";

// Stock at or below this count is flagged as low (zero is "out").
export const LOW_STOCK = 3;

export const AUDIENCES = ["Men", "Women", "Children", "Unisex"];
export const CATEGORY_AUDIENCE_RULES = {
  Saree: ["Women"],
  Sharee: ["Women"],
  Panjabi: ["Men", "Children"],
  Punjabi: ["Men", "Children"],
  Dress: ["Women", "Children"],
  Dresses: ["Women", "Children"],
  Jeans: ["Men", "Women", "Children", "Unisex"],
  Shirt: ["Men", "Women", "Children", "Unisex"],
  Shirts: ["Men", "Women", "Children", "Unisex"],
  "T-Shirt": ["Men", "Women", "Children", "Unisex"],
  "T-Shirts": ["Men", "Women", "Children", "Unisex"],
  Knitwear: ["Men", "Women", "Children", "Unisex"],
  Trousers: ["Men", "Women", "Children", "Unisex"],
  Outerwear: ["Men", "Women", "Children", "Unisex"],
  Sets: ["Children", "Unisex"],
  Accessories: ["Men", "Women", "Children", "Unisex"],
};
export const CATEGORIES = Object.keys(CATEGORY_AUDIENCE_RULES);
export const QUICK_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One", "Free"];

export function categoryName(entry) {
  return typeof entry === "string" ? entry : entry?.name || "";
}

export function allowedAudiencesForCategory(name, rules = CATEGORY_AUDIENCE_RULES) {
  const clean = String(name || "").trim();
  if (!clean) return AUDIENCES.slice();
  if (rules[clean]) return rules[clean].slice();
  const match = Object.keys(rules).find((key) => key.toLowerCase() === clean.toLowerCase());
  return match ? rules[match].slice() : AUDIENCES.slice();
}

export function categoriesForAudience(categories, audience, rules = CATEGORY_AUDIENCE_RULES) {
  const list = Array.isArray(categories) ? categories : [];
  if (!audience) return list.map(categoryName).filter(Boolean);
  return list
    .filter((entry) => {
      const name = categoryName(entry);
      const allowed =
        typeof entry === "object" && Array.isArray(entry.audiences) && entry.audiences.length
          ? entry.audiences
          : allowedAudiencesForCategory(name, rules);
      return allowed.includes(audience);
    })
    .map(categoryName)
    .filter(Boolean);
}

const BATCH_LIMIT = 200;

function validStock(stock) {
  if (typeof stock !== "number" && typeof stock !== "string") return null;
  if (typeof stock === "string" && !stock.trim()) return null;
  const value = Number(stock);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function stockLevel(stock) {
  const value = validStock(stock);
  if (value === null) return "unknown";
  if (value === 0) return "out";
  if (value <= LOW_STOCK) return "low";
  return "ok";
}

export function stockText(stock) {
  const value = validStock(stock);
  if (value === null) return "Stock unavailable";
  return value === 0 ? "Out of stock" : `${value} in stock`;
}

export function variantText(item) {
  return [item?.color, item?.size]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .join(" · ");
}

export function barcodeSrc(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// <img src="/api/.../barcode.svg"> can't send the admin token, so labels come back as SVG strings.
export async function fetchBarcodes(ids) {
  const batches = [];
  for (let start = 0; start < ids.length; start += BATCH_LIMIT) {
    batches.push(ids.slice(start, start + BATCH_LIMIT));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      api("/api/inventory/barcodes/batch", {
        method: "POST",
        body: { ids: batch },
      })
    )
  );

  return results.reduce(
    (combined, data) => ({
      items: combined.items.concat(data.items),
      missing: combined.missing.concat(data.missing),
    }),
    { items: [], missing: [] }
  );
}
