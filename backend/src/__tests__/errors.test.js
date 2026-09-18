import { describe, it, expect } from "vitest";
import { AppError, ERRORS, createAppError } from "../common/errors.js";
describe("AppError", () => {
  it("creates an error with statusCode and errorCode", () => {
    const err = new AppError(404, "Not found", "NOT_FOUND");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe("NOT_FOUND");
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("AppError");
  });
});
describe("ERRORS constants", () => {
  it("has expected error codes", () => {
    expect(ERRORS.UNAUTHORIZED.status).toBe(401);
    expect(ERRORS.FORBIDDEN.status).toBe(403);
    expect(ERRORS.NOT_FOUND.status).toBe(404);
    expect(ERRORS.CONFLICT.status).toBe(409);
    expect(ERRORS.VALIDATION.status).toBe(422);
    expect(ERRORS.INSUFFICIENT_STOCK.status).toBe(409);
    expect(ERRORS.PRODUCT_NOT_FOUND.status).toBe(404);
    expect(ERRORS.RATE_LIMITED.status).toBe(429);
    expect(ERRORS.INTERNAL.status).toBe(500);
  });
});
describe("createAppError", () => {
  it("creates an AppError instance", () => {
    const err = createAppError(400, "BAD_REQUEST", "Bad request");
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe("BAD_REQUEST");
  });
});
