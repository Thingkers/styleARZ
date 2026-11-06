const store = require("../store");
const inventory = require("../inventory");

function getAllowedProductIds() {
  const db = store.get();

  return new Set(
    inventory.shopCatalog(db).map((product) => product.id),
  );
}

function saveWishlist(user, productIds) {
  user.wishlist = productIds;
  store.save();

  return user.wishlist;
}

module.exports = {
  getAllowedProductIds,
  saveWishlist,
};