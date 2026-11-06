const wishlistService = require("../services/wishlistService");

function getWishlist(req, res, next) {
  try {
    const productIds = wishlistService.getWishlist(req.user);

    return res.json({ productIds });
  } catch (error) {
    next(error);
  }
}

function updateWishlist(req, res, next) {
  try {
    const productIds = wishlistService.updateWishlist(
      req.user,
      req.body.productIds,
    );

    return res.json({ productIds });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWishlist,
  updateWishlist,
};