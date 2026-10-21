import { api } from "../../api";

// Stock at or below this count is flagged as low (zero is "out").
export const LOW_STOCK = 3;

export const CATEGORIES = ["Shirts", "Knitwear", "Trousers", "Outerwear", "Dresses", "Sets", "Accessories"];
export const QUICK_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One"];

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
