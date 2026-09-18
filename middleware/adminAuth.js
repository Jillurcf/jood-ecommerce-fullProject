"use strict";

module.exports = (req, res, next) => {
  const admin =
    req.session?.admin ||
    (req.session?.adminId
      ? {
          id: req.session.adminId,
          role: req.session.adminRole,
          email: req.session.adminEmail,
        }
      : null);

  if (!admin?.id) {
    return res.redirect("/admin/a/sign/in");
  }

  res.locals.admin = admin;
  next();
};