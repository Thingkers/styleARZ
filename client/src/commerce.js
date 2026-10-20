export const FREE_SHIPPING_FROM = 8000;
export const SHIPPING_FEE = 120;

export function shippingFor(subtotal) {
  if (!subtotal || subtotal >= FREE_SHIPPING_FROM) return 0;
  return SHIPPING_FEE;
}

export function defaultSize(product) {
  if (!product?.sizes?.length) return "";
  if (product.sizes.includes("M")) return "M";
  if (product.sizes.includes("6-7Y")) return "6-7Y";
  return product.sizes[Math.floor(product.sizes.length / 2)];
}
