"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../../controllers/u/orders.controller");

function requireCustomer(req, res, next) {
  if (!req.session?.user?.id) {
    return res.redirect("/customer/sign/in");
  }

  next();
}

// Orders List
router.get(
  "/",
  requireCustomer,
  controller.getOrders
);

// Order Details
router.get(
  "/:id",
  requireCustomer,
  controller.getOrderById
);

// Cancel Order
router.post(
  "/:id/cancel",
  requireCustomer,
  controller.cancelOrder
);

module.exports = router;