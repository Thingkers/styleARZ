const store = require("../store");
const inventory = require("../inventory");

// Get all products from the shop catalog
function getAllProducts() {
  const db = store.get();
  return inventory.shopCatalog(db);
}

// Find a single product by ID
function getProductById(productId) {
  const db = store.get();
  return inventory.findShopProduct(db, productId);
}

module.exports = {
  getAllProducts,
  getProductById,
};