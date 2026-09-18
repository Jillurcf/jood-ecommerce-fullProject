import { describe, it, expect, vi, afterEach } from "vitest";
import {
  revokeRefreshJti,
  isRefreshJtiRevoked,
  REFRESH_ROTATION_GRACE_MS
} from "../modules/auth/pending.store.js";
afterEach(() => {
  vi.useRealTimers();
});
describe("refresh-token rotation ledger", () => {
  it("returns null for a jti that was never rotated", () => {
    expect(isRefreshJtiRevoked("never-used-jti")).toBeNull();
    expect(isRefreshJtiRevoked(void 0)).toBeNull();
  });
  it("classifies a just-rotated jti as benign grace reuse", () => {
    revokeRefreshJti("just-rotated");
    expect(isRefreshJtiRevoked("just-rotated")).toBe("grace");
  });
  it("classifies a long-ago rotated jti as revoked (real replay)", () => {
    vi.useFakeTimers();
    revokeRefreshJti("old-jti");
    vi.setSystemTime(Date.now() + REFRESH_ROTATION_GRACE_MS + 1e3);
    expect(isRefreshJtiRevoked("old-jti")).toBe("revoked");
    vi.useRealTimers();
  });
  it("ignores revoking empty/falsy jti values", () => {
    revokeRefreshJti("");
    revokeRefreshJti(null);
    revokeRefreshJti(void 0);
    expect(isRefreshJtiRevoked("")).toBeNull();
  });
});
