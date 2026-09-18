// routes/cart.routes.js
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');

/**
 * Cart Routes
 * ----------------
 * POST   /customer/cart/add       -> Add a product or variant to the cart
 * GET    /customer/cart/api       -> Get current cart items
 * POST   /customer/cart/update    -> Update quantity of a cart item
 * POST   /customer/cart/remove    -> Remove an item from the cart
 */
router.get("/", (req, res) => {
  try {
    return res.render("customer/cart");
  } catch (err) {
    console.error("Cart page render error:", err);
    return res.status(500).send("Failed to load cart page");
  }
});
// Add to cart
router.post('/add', cartController.addToCart);

// Get cart contents
router.get('/api', cartController.getCart);

// Update cart quantity
router.post('/update', cartController.updateCartQty);

// Remove from cart
router.post('/remove', cartController.removeFromCart);

module.exports = router;