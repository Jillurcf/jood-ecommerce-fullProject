# 01 — Auth Spec
## Customer + Admin Authentication (Unified JWT + HttpOnly Cookies)

**Milestone:** M2 · **SRS:** FR-3.x, FR-7.1–7.5 · **Legacy ref:** `routes/sign.routes.js`,
`controllers/sign.controller.js`, `routes/a/sign/sign.routes.js`,
`controllers/a/sign/sign.controller.js`, `middleware/auth.js`, `middleware/adminAuth.js`

---

## 1. Auth Model (new — replaces legacy manual dual sessions)

- **JWT access token** — short-lived (default 15m), sent on each request via
  `Authorization: Bearer <token>` **and/or** HttpOnly cookie.
- **JWT refresh token** — 30-day, in HttpOnly cookie `sameSite=lax`.
- **Unified mechanism** for both customer and admin; distinguishable by `sub`/`role`
  claims.
- **Session versioning:** each account has `session_version`; bumped on login/logout and
  on force-logout. A request whose token/claim `sessionVersion` < DB value ⇒ reject
  (401) and force re-login. This reproduces "log out everywhere".

## 2. OTP constants (port verbatim from legacy)
| Item | Value |
|------|-------|
| OTP digits | 6 |
| OTP expiry | 10 minutes |
| Max verify attempts | 5 → lock 15 minutes (`lock_until`) |
| Resend | allowed; regenerates OTP |
| Email verify token expiry | 24 hours |
| Reset password token expiry | 30 minutes |
| Admin strong-password (reset) | ≥8 chars, upper+lower+number+special |
| Admin idle timeout | 4 minutes (activity middleware) |
| Login rate limit | 20 req / 10 min |

---

## 3. Customer Auth Routes (new → legacy)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| POST | `/api/auth/customer/sign-in` | `POST /customer/sign/in` | public |
| POST | `/api/auth/customer/sign-up` | `POST /customer/sign/up` | public |
| POST | `/api/auth/customer/verify-otp` | `POST /customer/verify-otp` | public |
| POST | `/api/auth/customer/resend-otp` | `POST /customer/resend-otp` | public |
| GET | `/api/auth/customer/verify-email` | `GET /customer/verify-email` | public (token in query) |
| POST | `/api/auth/customer/resend-verification` | `POST /customer/resend-verification` | public |
| POST | `/api/auth/customer/forgot-password` | `POST /customer/forgot-password` | public |
| GET | `/api/auth/customer/reset-password` | `GET /customer/reset-password` | public (token) |
| POST | `/api/auth/customer/reset-password` | `POST /customer/reset-password` | public |
| GET | `/api/auth/customer/google` | `GET /customer/auth/google` | public |
| GET | `/api/auth/customer/google/callback` | `GET /customer/auth/google/callback` | public |
| POST | `/api/auth/customer/logout` | `GET /customer/logout` | auth: customer |
| GET | `/api/auth/me` | `GET /customer/current` | auth: customer |

## 4. Admin Auth Routes (new → legacy)

| Method | New path | Legacy | Auth |
|--------|----------|--------|------|
| POST | `/api/auth/admin/sign-in` | `POST /admin/a/sign/in` | public |
| POST | `/api/auth/admin/verify-otp` | `POST /admin/a/login/verify-otp` | public |
| POST | `/api/auth/admin/resend-otp` | `POST /admin/a/login/resend-otp` | public |
| POST | `/api/auth/admin/forgot-password` | `(a/password)` | public |
| POST | `/api/auth/admin/reset-password` | `(a/password)` | public |
| POST | `/api/auth/admin/logout` | `POST /admin/a/logout` | auth: admin |
| GET | `/api/auth/me` | `GET /admin/a/current` | auth: admin |

## 5. Flows (behavioral parity)

### 5.1 Customer sign-up (OTP)
1. Validate: `full_name` (2–80), `email` (valid), `phone` (unique), `password` (≥8),
   `confirm_password`, `agree_terms`.
2. Reject if email exists across **both** `customer_accounts` AND `admin_accounts`.
3. Generate 6-digit OTP; store `{ fullName, email, phone, password, otp, otpAttempts,
   expiresAt }` in a short-lived pending store (legacy used `req.session.pendingSignup` —
   new backend may use a fast in-memory/temp store or signed cookie; keep expiry 10-min).
4. Send OTP via email → respond `{ success, needsOtp: true }`.

### 5.2 Verify OTP (finalize registration)
1. On success: bcrypt(12)-hash password; generate `user_id` string
   (`<slug>_YYYYMMDD_<8random>`); insert `customer_accounts` with
   `email_verified=true, status='active', provider='local'`.
2. In a transaction: **merge guest cart rows** (by `guest_token` → set `user_id=email`)
   and **merge guest wishlist rows** (by `guest_id` → set `user_id=numericId`).
3. Issue tokens.

### 5.3 Customer login
1. Find by email; reject if deleted / locked (`lock_until` in future) / unverified.
2. Failed attempt increments `login_attempts`; at 5 → `lock_until = now + 15min`.
3. Success: reset attempts, `is_online=true`, `last_login_at=now`, bump `session_version`.
   Merge guest cart/wishlist (transaction). Issue tokens.
4. Remember me: refresh cookie 30 days; else browser-session.

### 5.4 Google OAuth
- Upsert by `google_id` then by email; create with `provider='google'`,
  `password_hash=null`, `email_verified=true`; or error if email already on another account.
- Same finalize-login + cart/wishlist merge as local login.

### 5.5 Password reset
1. Generate 32-byte token; store SHA-256 hash + `reset_password_expires` (30-min).
2. Link click validates hash+expiry → render reset. Reset clears token, resets attempts/lock.

### 5.6 Admin sign-in (password → OTP)
1. Validate email+password (exists, not deleted, `status='active'`, `email_verified`,
   not locked).
2. On success: reset attempts, generate OTP, store SHA-256 `otp_hash` + `otp_expires_at`
   (+10min), email OTP, stage `pendingAdminId`.
3. Verify OTP (≤5 attempts → 15-min lock). Finalize: bump `session_version`, regenerate
   session, set admin claims + role. Issue admin JWT.
4. Session hardening (parity): reject if login older than 7 days; idle-destroy after 4 min;
   `session_version` must match DB; status must be `active`.

## 6. Role model — Admin guards
| Guard | Allowed roles |
|-------|---------------|
| `requireAuth` | any authenticated (customer or admin) |
| `requireAdmin` / `isAdminUser` | any admin role (incl. aliases `superadmin`, `staff`) |
| `requireSuperOrMaster` | `super_admin`, `master_admin` |
| `requireAdminManager` | `super_admin`, `master_admin`, `admin` |
| `requireUserManager` | `super_admin`, `master_admin`, `admin`, `sub_admin` |
| `isMasterAdmin` | `master_admin` only |

## 7. Data model (Parity fields)
- `customer_accounts`: `id, user_id, full_name, email, phone, password_hash, google_id,
  provider, status, email_verified, phone_verified, login_attempts, last_attempt_time,
  lock_until, last_login_at, last_logout_at, last_activity_at, is_online, session_version,
  email_verification_token(+expires), reset_password_token(+expires), created_at, updated_at`.
- `admin_accounts`: `id, admin_id, full_name, email, phone, password, role, status,
  email_verified, otp_hash, otp_expires_at, otp_attempts, otp_sent_at, login_attempts,
  last_attempt_time, lock_until, last_login_at, last_logout_at, last_activity_at,
  is_online, session_version, reset_password_token(+expires), created_by, created_at,
  updated_at`.

> **Admin id conventions in legacy vary** (`admin_id` string vs `id` vs
> `req.session.adminId`). In the new auth, treat the DB PK `id` as the canonical id and
> expose `admin_id` as the business key — unify everywhere; do not replicate the legacy
> inconsistency.

## 8. Acceptance checklist (M2)
- [ ] All routes above respond with correct envelope and HTTP status.
- [ ] OTP: wrong code ≤5 fails then locks 15-min; correct code finalizes.
- [ ] Email duplicates rejected across customer + admin tables.
- [ ] Google sign-in creates and signs in; existing email path errors.
- [ ] Reset password link expires and is single-use (token cleared after use).
- [ ] Login bumps `session_version`; stale JWT rejected → re-login required.
- [ ] Admin role guards reject unauthorized roles (403) and redirect-or-401.
- [ ] Login endpoints rate-limited (20/10min).
