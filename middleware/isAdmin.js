// middleware/isAdmin.js
module.exports = (req, res, next) => {
  // Check if logged in
  if (!req.session?.adminId) {
    return res.status(401).json({ success: false, message: "Unauthorized: Please login" });
  }

  // Optional: check role if stored
  if (req.session.adminRole && req.session.adminRole !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden: Admin only" });
  }

  // Admin is valid
  next();
};
