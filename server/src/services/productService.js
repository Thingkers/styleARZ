const productModel = require("../models/productModel");

function getProducts(filters = {}) {
  const {
    q = "",
    category = "",
    occasion = "",
    audience = "",
    featured = "",
  } = filters;

  let products = productModel.getAllProducts();

  // Search products by name, category, and description
  if (q) {
    const searchTerm = String(q).trim().toLowerCase();

    products = products.filter((product) =>
      `${product.name} ${product.category} ${product.description}`
        .toLowerCase()
        .includes(searchTerm)
    );
  }

  // Filter by category
  if (category) {
    products = products.filter(
      (product) => product.category === category
    );
  }

  // Filter by occasion
  if (occasion) {
    products = products.filter(
      (product) => product.occasions.includes(occasion)
    );
  }

  // Filter by audience
  if (audience) {
    products = products.filter(
      (product) => product.audience === audience
    );
  }

  // Filter featured products
  if (featured === "1") {
    products = products.filter(
      (product) => product.featured
    );
  }

  // Sort products
  products = products.slice().sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
    const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;

    if (ao !== bo) return ao - bo;

    return String(a.name).localeCompare(String(b.name));
  });

  return products;
}

function getProductById(productId) {
  return productModel.getProductById(productId);
}

module.exports = {
  getProducts,
  getProductById,
  getProductDetails,
};

function getProductDetails(productId) {
  const found = productModel.getProductById(productId);

  if (!found) {
    return null;
  }

  const catalog = productModel.getAllProducts();

  const related = catalog
    .filter(
      (entry) =>
        entry.id !== found.product.id &&
        (entry.category === found.product.category ||
          entry.slot === found.product.slot)
    )
    .slice(0, 4);

  return {
    product: found.product,
    related,
  };
}