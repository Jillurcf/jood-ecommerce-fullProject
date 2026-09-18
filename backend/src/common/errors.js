class AppError extends Error {
  statusCode;
  errorCode;
  constructor(statusCode, message, errorCode) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
const ERRORS = {
  UNAUTHORIZED: { status: 401, code: "UNAUTHORIZED", message: "Unauthorized" },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "Forbidden" },
  NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Not found" },
  CONFLICT: { status: 409, code: "CONFLICT", message: "Resource already exists" },
  VALIDATION: { status: 422, code: "VALIDATION_ERROR", message: "Validation failed" },
  INSUFFICIENT_STOCK: { status: 409, code: "INSUFFICIENT_STOCK", message: "Insufficient stock" },
  PRODUCT_NOT_FOUND: { status: 404, code: "PRODUCT_NOT_FOUND", message: "Product not found" },
  RATE_LIMITED: { status: 429, code: "RATE_LIMITED", message: "Too many requests" },
  INTERNAL: { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" }
};
function createAppError(status, code, message) {
  return new AppError(status, message, code);
}
export {
  AppError,
  ERRORS,
  createAppError
};
