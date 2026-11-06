const productService = require("../services/productService");

// GET /api/products
function getProducts(req, res, next) {
  try {
    const products = productService.getProducts(req.query);

    return res.json({ products });
  } catch (error) {
    next(error);
  }
}

// GET /api/products/:id
function getProductById(req, res, next) {
  try {
    const result = productService.getProductDetails(req.params.id);

    if (!result) {
      return res.status(404).json({
        error: "Piece not found.",
      });
    }

    return res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProducts,
  getProductById,
};