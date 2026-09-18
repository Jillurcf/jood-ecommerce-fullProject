"use strict";

const pool = require("../../../includes/conn");

/**
 * =====================================================
 * DASHBOARD PAGE (SSR)
 * =====================================================
 */
exports.getDashboard = async (req, res, next) => {
  try {
    return res.render("admin/a/account/dashboard", {
      title: "Admin Dashboard",
      activePage: "dashboard",
      user: res.locals.user || req.user || null,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return next(error);
  }
};