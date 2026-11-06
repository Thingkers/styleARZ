const wishlistModel = require("../models/wishlistModel");

function getWishlist(user) {
  return user.wishlist || [];
}

function updateWishlist(user, productIds) {
  const ids = Array.isArray(productIds) ? productIds : [];

  const allowed = wishlistModel.getAllowedProductIds();

  const filteredIds = [
    ...new Set(
      ids.map(String).filter((productId) => allowed.has(productId)),
    ),
  ];

  return wishlistModel.saveWishlist(user, filteredIds);
}

module.exports = {
  getWishlist,
  updateWishlist,
};