'use strict';

const express = require('express');
const router = express.Router();

const ordersController = require('../../controllers/a/orders.controller');

/*
|--------------------------------------------------------------------------
| ADMIN ORDERS ROUTES
|--------------------------------------------------------------------------
*/

/**
 * Orders page
 */
router.get(
  '/',
  ordersController.getAdminOrdersPage
);

/**
 * Orders JSON data
 */
router.get(
  '/data',
  ordersController.getAdminOrdersData
);

/**
 * Orders summary
 */
router.get(
  '/summary',
  ordersController.getAdminOrdersSummary
);

/**
 * Live search
 */
router.get(
  '/live-search',
  ordersController.getAdminOrdersLiveSearch
);

/**
 * Export orders
 */
router.get(
  '/export',
  ordersController.exportAdminOrders
);

/**
 * Single order detail
 */
router.get(
  '/:orderNumber',
  ordersController.getAdminOrderDetails
);

module.exports = router;