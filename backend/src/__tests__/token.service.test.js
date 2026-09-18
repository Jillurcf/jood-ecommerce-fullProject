import { describe, it, expect } from "vitest";
process.env.JWT_ACCESS_SECRET = "test-access-secret-min-16-chars!";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-min-16-chars!";
process.env.ACCESS_TOKEN_TTL = "15m";
process.env.REFRESH_TOKEN_TTL = "30d";
process.env.NODE_ENV = "test";
import {
  issueTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  ttlToMs,
  cryptoRandomToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE
} from "../modules/auth/token.service.js";
describe("issueTokenPair", () => {
  it("returns access and refresh tokens", () => {
    const pair = issueTokenPair({
      id: 1,
      type: "customer",
      sessionVersion: 1
    });
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(typeof pair.accessToken).toBe("string");
    expect(typeof pair.refreshToken).toBe("string");
  });
  it("embeds correct claims", () => {
    const pair = issueTokenPair({
      id: 42,
      type: "admin",
      role: "super_admin",
      sessionVersion: 3,
      loginAt: Date.now()
    });
    const decoded = verifyAccessToken(pair.accessToken);
    expect(decoded).not.toBeNull();
    expect(decoded.sub).toBe(42);
    expect(decoded.type).toBe("admin");
    expect(decoded.role).toBe("super_admin");
    expect(decoded.sv).toBe(3);
  });
});
describe("verifyAccessToken", () => {
  it("verifies a valid token", () => {
    const pair = issueTokenPair({ id: 1, type: "customer", sessionVersion: 1 });
    const payload = verifyAccessToken(pair.accessToken);
    expect(payload).not.toBeNull();
    expect(payload.sub).toBe(1);
  });
  it("returns null for invalid token", () => {
    expect(verifyAccessToken("invalid-token")).toBeNull();
  });
  it("returns null for refresh token used as access", () => {
    const pair = issueTokenPair({ id: 1, type: "customer", sessionVersion: 1 });
    expect(verifyAccessToken(pair.refreshToken)).toBeNull();
  });
});
describe("verifyRefreshToken", () => {
  it("verifies a valid refresh token", () => {
    const pair = issueTokenPair({ id: 1, type: "customer", sessionVersion: 1 });
    const payload = verifyRefreshToken(pair.refreshToken);
    expect(payload).not.toBeNull();
    expect(payload.sub).toBe(1);
  });
  it("returns null for invalid token", () => {
    expect(verifyRefreshToken("garbage")).toBeNull();
  });
});
describe("decodeToken", () => {
  it("decodes without verification", () => {
    const pair = issueTokenPair({ id: 5, type: "customer", sessionVersion: 2 });
    const decoded = decodeToken(pair.accessToken);
    expect(decoded).not.toBeNull();
    expect(decoded.sub).toBe(5);
  });
});
describe("ttlToMs", () => {
  it("converts seconds", () => {
    expect(ttlToMs("30s", 0)).toBe(3e4);
  });
  it("converts minutes", () => {
    expect(ttlToMs("15m", 0)).toBe(9e5);
  });
  it("converts hours", () => {
    expect(ttlToMs("2h", 0)).toBe(72e5);
  });
  it("converts days", () => {
    expect(ttlToMs("30d", 0)).toBe(2592e6);
  });
  it("returns fallback for invalid", () => {
    expect(ttlToMs("invalid", 12345)).toBe(12345);
  });
});
describe("cryptoRandomToken", () => {
  it("returns hex string of specified byte length", () => {
    const token = cryptoRandomToken(16);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });
  it("returns different values each call", () => {
    const a = cryptoRandomToken(32);
    const b = cryptoRandomToken(32);
    expect(a).not.toBe(b);
  });
});
describe("cookie names", () => {
  it("exports expected cookie names", () => {
    expect(ACCESS_COOKIE).toBe("jood_access");
    expect(REFRESH_COOKIE).toBe("jood_refresh");
  });
});
