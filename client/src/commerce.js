import commerceRules from "../../shared/commerce.json";

export const FREE_SHIPPING_FROM = commerceRules.freeShippingFrom;
export const SHIPPING_FEE = commerceRules.shippingFee;

export function shippingFor(subtotal) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError("Subtotal must be a non-negative number.");
  }
  return subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
}

export function defaultSize(product) {
  if (!Array.isArray(product?.sizes)) return "";
  const sizes = product.sizes.filter((size) => typeof size === "string" && size.trim());
  if (sizes.includes("M")) return "M";
  if (sizes.includes("6-7Y")) return "6-7Y";
  return sizes[0] || "";
}
