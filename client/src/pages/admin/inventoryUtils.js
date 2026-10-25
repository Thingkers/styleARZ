import { api } from "../../api";

// Stock at or below this count is flagged as low (zero is "out").
export const LOW_STOCK = 3;

export const CATEGORIES = ["Shirts", "Knitwear", "Trousers", "Outerwear", "Dresses", "Sets", "Accessories"];
export const QUICK_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One"];

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
