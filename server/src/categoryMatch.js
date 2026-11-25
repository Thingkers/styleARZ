/** Icon / shop category aliases so banner filters resolve to real products. */
const GROUPS = [
  ["Saree", "Sharee"],
  ["Panjabi", "Punjabi"],
  ["Dress", "Dresses"],
  ["Jeans", "Jean", "Denim"],
  ["Shirt", "Shirts"],
  ["T-Shirt", "T-Shirts", "Tee", "Tees"],
  ["Trousers", "Trouser", "Chinos", "Chino"],
  ["Knitwear", "Knit"],
  ["Outerwear", "Overshirt"],
  ["Sets", "Set"],
  ["Accessories", "Accessory"],
];

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function hasToken(blob, token) {
  const needle = normalize(token);
  if (!needle) return false;
  return new RegExp(`(?:^|-)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-|$)`).test(`-${blob}-`);
}

function categoryGroup(name) {
  const needle = normalize(name);
  if (!needle) return [];
  const found = GROUPS.find((group) => group.some((entry) => normalize(entry) === needle));
  return found ? found.slice() : [String(name || "").trim()].filter(Boolean);
}

function categoriesMatch(a, b) {
  if (!a || !b) return false;
  const left = new Set(categoryGroup(a).map(normalize));
  return categoryGroup(b).some((entry) => left.has(normalize(entry)));
}

function productMatchesCategory(product, categoryQuery) {
  const query = String(categoryQuery || "").trim();
  if (!query) return true;
  if (categoriesMatch(product.category, query)) return true;

  const q = normalize(query);
  const name = normalize(product.name || "");

  // Name-only fallbacks for banner icons — keep these strict to avoid false hits.
  if (q === "jeans" || q === "jean" || q === "denim") {
    return hasToken(name, "jeans") || hasToken(name, "jean") || hasToken(name, "denim");
  }
  if (q === "t-shirt" || q === "t-shirts" || q === "tee" || q === "tees") {
    return hasToken(name, "t-shirt") || hasToken(name, "t-shirts") || hasToken(name, "tee") || hasToken(name, "tees");
  }
  if (q === "saree" || q === "sharee") {
    return hasToken(name, "saree") || hasToken(name, "sharee");
  }
  if (q === "panjabi" || q === "punjabi") {
    return hasToken(name, "panjabi") || hasToken(name, "punjabi") || hasToken(name, "kurta");
  }
  if (q === "dress" || q === "dresses") {
    return hasToken(name, "dress") || hasToken(name, "dresses") || name.includes("shirt-dress") || name.includes("shirtdress");
  }
  if (q === "shirt" || q === "shirts") {
    if (
      hasToken(name, "t-shirt") ||
      hasToken(name, "t-shirts") ||
      name.includes("overshirt") ||
      hasToken(name, "dress") ||
      name.includes("shirt-dress") ||
      name.includes("shirtdress")
    ) {
      return false;
    }
    return hasToken(name, "shirt") || hasToken(name, "shirts");
  }
  return false;
}

module.exports = {
  GROUPS,
  normalize,
  categoryGroup,
  categoriesMatch,
  productMatchesCategory,
};
