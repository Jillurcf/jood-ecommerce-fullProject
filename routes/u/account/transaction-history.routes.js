'use strict';

const express = require('express');
const router = express.Router();

const transactionHistoryController = require('../../../controllers/u/account/transaction-history.controller');

/**
 * Require authenticated user OR valid guest token.
 * For HTML requests, the controller can still decide to redirect.
 * This middleware only blocks fully anonymous access.
 */
function requireAuthOrGuest(req, res, next) {
  const userId =
    req.session?.user?.id ||
    req.session?.userId ||
    req.user?.id ||
    null;

  const guestToken =
    req.headers['x-guest-token'] ||
    req.query?.guest_token ||
    req.cookies?.guest_token ||
    req.cookies?.guest_wishlist_token ||
    null;

  if (!userId && !guestToken) {
    if (
      req.xhr ||
      String(req.headers?.accept || '').includes('application/json')
    ) {
      return res.status(401).json({
        ok: false,
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Authentication or guest access required.',
      });
    }

    return res.redirect('/');
  }

  return next();
}

/**
 * Prevent app crash if a controller export is missing.
 */
function safe(handler, name) {
  if (typeof handler !== 'function') {
    console.error(`Missing controller method: ${name}`);
    return (req, res) => {
      if (
        req.xhr ||
        String(req.headers?.accept || '').includes('application/json')
      ) {
        return res.status(500).json({
          ok: false,
          success: false,
          error: 'ROUTE_HANDLER_MISSING',
          message: `Handler "${name}" is not implemented.`,
        });
      }

      return res.status(500).send(`Handler "${name}" is not implemented.`);
    };
  }

  return handler;
}

/**
 * Transaction history page
 */
router.get(
  '/',
  requireAuthOrGuest,
  safe(
    transactionHistoryController.getTransactionHistoryPage,
    'getTransactionHistoryPage'
  )
);

/**
 * Transaction history data (AJAX / JSON)
 */
router.get(
  '/data',
  requireAuthOrGuest,
  safe(
    transactionHistoryController.getTransactionHistoryData,
    'getTransactionHistoryData'
  )
);

/**
 * Transaction summary only
 */
router.get(
  '/summary',
  requireAuthOrGuest,
  safe(
    transactionHistoryController.getTransactionHistorySummary,
    'getTransactionHistorySummary'
  )
);

/**
 * Single transaction detail
 * Example:
 * /customer/u/account/transaction-history/item/order/ORD-20260424-ABC123
 * /customer/u/account/transaction-history/item/payment/57
 */
router.get(
  '/item/:item_type/:item_id',
  requireAuthOrGuest,
  safe(
    transactionHistoryController.getTransactionHistoryItem,
    'getTransactionHistoryItem'
  )
);

/**
 * Export all visible transaction history rows
 */
router.get(
  '/export',
  requireAuthOrGuest,
  safe(
    transactionHistoryController.exportTransactionHistory,
    'exportTransactionHistory'
  )
);

module.exports = router;