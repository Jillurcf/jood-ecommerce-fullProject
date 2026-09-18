import { ZodError } from "zod";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error_code: err.errorCode
    });
  }
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      error_code: "VALIDATION_ERROR",
      details: messages
    });
  }
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error_code: "INTERNAL_ERROR"
  });
}
export {
  errorHandler
};
