exports.ensureAuth = (req, res, next) => {
  if (req.session?.admin?.id) return next();
  return res.redirect("/admin/a/sign/in");
};

exports.ensureGuest = (req, res, next) => {
  if (!req.session?.admin?.id) return next();
  return res.redirect("/admin/a/dashboard");
};
function authCheck(req, res, next) {
    if (!req.session?.userId) {
        return res.redirect("/sign/in");
    }
    next();
}


exports.authCheck = authCheck;