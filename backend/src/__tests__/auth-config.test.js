import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  sanitizeText,
  normalizePhone,
  isValidEmail,
  isValidFullName,
  isValidPhone,
  isStrongPassword,
  isAdminStrongPassword,
  generateOtp,
  generateSecureToken,
  hashToken,
  safeHashEquals,
  generateUserIdFromName,
  minutesUntilUnlock,
  isLockedOut,
  lockoutMessage
} from "../modules/auth/auth.config.js";
describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });
  it("handles empty/null", () => {
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail(null)).toBe("");
  });
});
describe("sanitizeText", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeText("  Hello   World  ")).toBe("Hello World");
  });
  it("handles empty", () => {
    expect(sanitizeText("")).toBe("");
  });
});
describe("normalizePhone", () => {
  it("preserves leading +", () => {
    expect(normalizePhone("+971501234567")).toBe("+971501234567");
  });
  it("strips non-digit characters except +", () => {
    expect(normalizePhone("+971-501-234-567")).toBe("+971501234567");
  });
  it("returns empty for empty input", () => {
    expect(normalizePhone("")).toBe("");
  });
});
describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("user+tag@domain.co")).toBe(true);
  });
  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@no-local.com")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
  });
});
describe("isValidFullName", () => {
  it("accepts 2-80 chars", () => {
    expect(isValidFullName("Ab")).toBe(true);
    expect(isValidFullName("A".repeat(80))).toBe(true);
  });
  it("rejects too short or too long", () => {
    expect(isValidFullName("A")).toBe(false);
    expect(isValidFullName("A".repeat(81))).toBe(false);
  });
});
describe("isValidPhone", () => {
  it("accepts valid phone numbers", () => {
    expect(isValidPhone("+971501234567")).toBe(true);
    expect(isValidPhone("0501234567")).toBe(true);
  });
  it("accepts empty (optional field)", () => {
    expect(isValidPhone("")).toBe(true);
  });
  it("rejects too short", () => {
    expect(isValidPhone("123")).toBe(false);
  });
});
describe("isStrongPassword", () => {
  it("accepts 8+ chars", () => {
    expect(isStrongPassword("12345678")).toBe(true);
    expect(isStrongPassword("abcdefghij")).toBe(true);
  });
  it("rejects < 8 chars", () => {
    expect(isStrongPassword("1234567")).toBe(false);
  });
});
describe("isAdminStrongPassword", () => {
  it("accepts passwords meeting all criteria", () => {
    expect(isAdminStrongPassword("Admin@123")).toBe(true);
    expect(isAdminStrongPassword("P@ssw0rd!")).toBe(true);
  });
  it("rejects passwords missing uppercase", () => {
    expect(isAdminStrongPassword("admin@123")).toBe(false);
  });
  it("rejects passwords missing lowercase", () => {
    expect(isAdminStrongPassword("ADMIN@123")).toBe(false);
  });
  it("rejects passwords missing number", () => {
    expect(isAdminStrongPassword("Admin@abc")).toBe(false);
  });
  it("rejects passwords missing special char", () => {
    expect(isAdminStrongPassword("Admin1234")).toBe(false);
  });
  it("rejects < 8 chars", () => {
    expect(isAdminStrongPassword("Ad@1abc")).toBe(false);
  });
});
describe("generateOtp", () => {
  it("returns a 6-digit string", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});
describe("generateSecureToken", () => {
  it("returns a 64-char hex string (32 bytes)", () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});
describe("hashToken", () => {
  it("returns a SHA-256 hex digest", () => {
    const hash = hashToken("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is deterministic", () => {
    expect(hashToken("hello")).toBe(hashToken("hello"));
  });
  it("different inputs produce different hashes", () => {
    expect(hashToken("hello")).not.toBe(hashToken("world"));
  });
});
describe("safeHashEquals", () => {
  it("returns true for equal strings", () => {
    expect(safeHashEquals("abc", "abc")).toBe(true);
  });
  it("returns false for different strings", () => {
    expect(safeHashEquals("abc", "def")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(safeHashEquals("abc", "abcd")).toBe(false);
  });
  it("returns false for empty", () => {
    expect(safeHashEquals("", "")).toBe(false);
  });
});
describe("generateUserIdFromName", () => {
  it("generates a userId from full name", () => {
    const id = generateUserIdFromName("John Doe");
    expect(id).toMatch(/^johndoe_\d{8}_[0-9a-f]{8}$/);
  });
  it("uses fallback for empty name", () => {
    const id = generateUserIdFromName("");
    expect(id).toMatch(/^user_\d{8}_[0-9a-f]{8}$/);
  });
  it("strips special characters", () => {
    const id = generateUserIdFromName("O'Brien & Co.");
    expect(id).toMatch(/^obrienco_\d{8}_[0-9a-f]{8}$/);
  });
});
describe("minutesUntilUnlock", () => {
  it("returns 0 for null/undefined", () => {
    expect(minutesUntilUnlock(null)).toBe(0);
    expect(minutesUntilUnlock(void 0)).toBe(0);
  });
  it("returns 0 for past date", () => {
    expect(minutesUntilUnlock(new Date(Date.now() - 1e3))).toBe(0);
  });
  it("returns positive minutes for future date", () => {
    const future = new Date(Date.now() + 15 * 60 * 1e3);
    const result = minutesUntilUnlock(future);
    expect(result).toBeGreaterThanOrEqual(14);
    expect(result).toBeLessThanOrEqual(15);
  });
});
describe("isLockedOut", () => {
  it("returns false for null", () => {
    expect(isLockedOut(null)).toBe(false);
  });
  it("returns false for past date", () => {
    expect(isLockedOut(new Date(Date.now() - 1e3))).toBe(false);
  });
  it("returns true for future date", () => {
    expect(isLockedOut(new Date(Date.now() + 6e4))).toBe(true);
  });
});
describe("lockoutMessage", () => {
  it("returns generic message when not locked", () => {
    expect(lockoutMessage(null)).toContain("try again later");
  });
  it("returns minute count when locked", () => {
    const future = new Date(Date.now() + 10 * 60 * 1e3);
    const msg = lockoutMessage(future);
    expect(msg).toContain("minute");
  });
});
