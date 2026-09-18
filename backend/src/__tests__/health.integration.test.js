import { describe, it, expect } from "vitest";
import request from "supertest";
process.env.JWT_ACCESS_SECRET = "test-access-secret-min-16-chars!";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-min-16-chars!";
process.env.ACCESS_TOKEN_TTL = "15m";
process.env.REFRESH_TOKEN_TTL = "30d";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
process.env.FRONTEND_URL = "http://localhost:3000";
import app from "../app.js";
describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.timestamp).toBeTruthy();
    expect(typeof res.body.data.uptime).toBe("number");
  });
});
describe("404 catch-all", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe("NOT_FOUND");
  });
});
describe("GET /api/auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
describe("POST /api/auth/customer/sign-in", () => {
  it("returns validation error for missing fields", async () => {
    const res = await request(app).post("/api/auth/customer/sign-in").send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe("VALIDATION_ERROR");
  });
  it("returns error for invalid credentials", async () => {
    const res = await request(app).post("/api/auth/customer/sign-in").send({ email: "nobody@example.com", password: "wrongpass" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe("INVALID_CREDENTIALS");
  });
});
describe("POST /api/auth/customer/sign-up", () => {
  it("returns validation error for missing fields", async () => {
    const res = await request(app).post("/api/auth/customer/sign-up").send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
  it("returns validation error for short password", async () => {
    const res = await request(app).post("/api/auth/customer/sign-up").send({
      full_name: "Test User",
      email: "test@example.com",
      password: "short",
      confirm_password: "short",
      agree_terms: true
    });
    expect(res.status).toBe(422);
  });
  it("returns validation error when terms not agreed", async () => {
    const res = await request(app).post("/api/auth/customer/sign-up").send({
      full_name: "Test User",
      email: "test@example.com",
      password: "password123",
      confirm_password: "password123",
      agree_terms: false
    });
    expect(res.status).toBe(422);
  });
  it("returns validation error when passwords do not match", async () => {
    const res = await request(app).post("/api/auth/customer/sign-up").send({
      full_name: "Test User",
      email: "test@example.com",
      password: "password123",
      confirm_password: "different123",
      agree_terms: true
    });
    expect(res.status).toBe(422);
  });
});
describe("POST /api/auth/admin/sign-in", () => {
  it("returns validation error for missing fields", async () => {
    const res = await request(app).post("/api/auth/admin/sign-in").send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
  it("returns error for invalid credentials", async () => {
    const res = await request(app).post("/api/auth/admin/sign-in").send({ email: "fake@admin.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
