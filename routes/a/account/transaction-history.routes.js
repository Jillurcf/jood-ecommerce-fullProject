'use strict';

const express = require('express');
const router = express.Router();

const transactionHistoryController = require('../../../controllers/a/account/transaction-history.controller');

/**
 * Strict admin-only access.
 * Accepts the same admin session shapes used across your admin controllers:
 * - req.session.admin
 * - req.session.adminId / adminRole / adminEmail
 * - req.user
 */
function requireAdmin(req, res, next) {
  const actor =
    req.session?.admin ||
    (req.session?.adminId
      ? {
          id: req.session.adminId,
          role: req.session.adminRole || req.session.role || 'admin',
          email: req.session.adminEmail || null,
          full_name: req.session.adminName || null,
        }
      : null) ||
    (req.user?.id
      ? {
          id: req.user.id,
          role: req.user.role || req.user.type || 'admin',
          email: req.user.email || null,
          full_name: req.user.full_name || req.user.name || null,
        }
      : null);

  const role = String(
    actor?.role ||
      req.session?.adminRole ||
      req.session?.role ||
      req.user?.role ||
      req.user?.type ||
      ''
  ).toLowerCase();

  const isAdmin = Boolean(
    req.session?.isAdmin === true ||
      req.user?.isAdmin === true ||
      role === 'admin' ||
      role === 'superadmin' ||
      role === 'super_admin' ||
      role === 'master_admin' ||
      role === 'staff' ||
      role === 'sub_admin'
  );

  if (!isAdmin) {
    if (req.xhr || String(req.headers?.accept || '').includes('application/json')) {
      return res.status(401).json({
        ok: false,
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Admin access required.',
      });
    }

    return res.redirect('/admin/a/sign/in');
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
      if (req.xhr || String(req.headers?.accept || '').includes('application/json')) {
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
  safe(
    transactionHistoryController.getTransactionHistorySummary,
    'getTransactionHistorySummary'
  )
);

/**
 * Single transaction detail
 * Example:
 * /admin/a/account/transaction-history/item/order/ORD-20260424-ABC123
 * /admin/a/account/transaction-history/item/payment/57
 */
router.get(
  '/item/:item_type/:item_id',
  requireAdmin,
  safe(
    transactionHistoryController.getTransactionHistoryItem,
    'getTransactionHistoryItem'
  )
);

/**
 * Export all visible transaction history rows
 * Use POST to reduce accidental triggering and improve CSRF protection.
 */
router.post(
  '/export',
  requireAdmin,
  safe(
    transactionHistoryController.exportTransactionHistory,
    'exportTransactionHistory'
  )
);

module.exports = router;
