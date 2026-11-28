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
export const WAIST_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42", "44"];

const WAIST_CATEGORY = /pant|trouser|jean|chino|bottom/i;

/** Pants, trousers and jeans use waist inches. Shirts keep letter sizes. */
export function sizesForCategory(category) {
  return WAIST_CATEGORY.test(String(category || "")) ? WAIST_SIZES : QUICK_SIZES;
}

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

export function stockLevel(stock) {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK) return "low";
  return "ok";
}

export function stockText(stock) {
  return stock <= 0 ? "Out of stock" : `${stock} in stock`;
}

export function variantText(item) {
  return [item.color, item.size].filter(Boolean).join(" · ");
}

export function barcodeSrc(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// <img src="/api/.../barcode.svg"> can't send the admin token, so labels come back as SVG strings.
export async function fetchBarcodes(ids) {
  const items = [];
  const missing = [];
  for (let start = 0; start < ids.length; start += BATCH_LIMIT) {
    const data = await api("/api/inventory/barcodes/batch", {
      method: "POST",
      body: { ids: ids.slice(start, start + BATCH_LIMIT) },
    });
    items.push(...data.items);
    missing.push(...data.missing);
  }
  return { items, missing };
}
