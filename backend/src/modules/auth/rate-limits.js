import rateLimit from "express-rate-limit";
const rateLimitMessage = {
  success: false,
  message: "Too many requests. Please try again later.",
  error_code: "RATE_LIMITED"
};
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1e3,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitMessage
});
export {
  authLimiter,
  loginLimiter
};
