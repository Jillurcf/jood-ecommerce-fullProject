"use strict";

const crypto = require("crypto");

module.exports = (req, res, next) => {
  try {
    // Try to get guest token from multiple sources (in priority order)
    let guestToken = 
      req.headers["x-guest-token"] ||                    // From custom header
      req.body?.guest_token ||                          // From form submission
      req.query?.guest_token ||                         // From query param
      req.cookies?.guest_token ||                       // From cookie
      req.session?.guestToken ||
      null;

    // Only generate a new token if none exists
    if (!guestToken) {
      guestToken = crypto.randomUUID();
      // Send back so frontend can store it
      res.setHeader("x-guest-token", guestToken);
    }

    // Attach to request for use in controllers
    req.guestToken = guestToken;
    if (req.session && !req.session.guestToken) {
      req.session.guestToken = guestToken;
    }

    next();
  } catch (err) {
    console.error("Guest middleware error:", err);
    next(err);
  }
  
  console.log("GUEST MIDDLEWARE");
console.log({
  sessionUser: req.session?.user,
  guestTokenHeader: req.headers["x-guest-token"],
  guestTokenBody: req.body?.guest_token,
  guestTokenCookie: req.cookies?.guest_token,
  assignedGuestToken: req.guestToken
});
};
