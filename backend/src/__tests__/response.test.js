import { describe, it, expect } from "vitest";
import { sendSuccess, sendError } from "../common/response.js";
function mockRes() {
  const state = { status: 200, body: null };
  const res = {
    status(code) {
      state.status = code;
      return res;
    },
    json(body) {
      state.body = body;
      return res;
    },
    __state: state
  };
  return res;
}
describe("sendSuccess", () => {
  it("returns success envelope with data", () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, "OK", 200);
    expect(res.__state.status).toBe(200);
    const body = res.__state.body;
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 1 });
    expect(body.message).toBe("OK");
  });
  it("returns 200 by default", () => {
    const res = mockRes();
    sendSuccess(res, null);
    expect(res.__state.status).toBe(200);
  });
  it("omits data and message when not provided", () => {
    const res = mockRes();
    sendSuccess(res);
    const body = res.__state.body;
    expect(body).toEqual({ success: true });
    expect(body.data).toBeUndefined();
    expect(body.message).toBeUndefined();
  });
});
describe("sendError", () => {
  it("returns error envelope", () => {
    const res = mockRes();
    sendError(res, 404, "Not found", "NOT_FOUND");
    expect(res.__state.status).toBe(404);
    const body = res.__state.body;
    expect(body.success).toBe(false);
    expect(body.message).toBe("Not found");
    expect(body.error_code).toBe("NOT_FOUND");
  });
});
