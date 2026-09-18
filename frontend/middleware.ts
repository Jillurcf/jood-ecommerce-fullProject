import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * Edge authorization gate (P0-3).
 *
 * Guards the customer (`/account`, `/checkout`) and admin (`/admin`) sections at the
 * edge, server-side, so a brand-new unauthenticated visitor is never even served the
 * protected layout — closing the "client-only AuthGuard/AdminGuard" gap.
 *
 * Design notes (must stay consistent with the backend token flow):
 *  - The backend sets `jood_access` on path `/` and `jood_refresh` on path `/api/auth`.
 *    This middleware can therefore only ever see the ACCESS cookie; the refresh cookie
 *    never travels with a page navigation.
 *  - `jood_access` is short-lived (15m). We do NOT hard-redirect when the access cookie
 *    is merely expired — the client `AuthContext` refreshes it and the backend stays
 *    authoritative. We only block the unambiguous "not signed in at all" case (no access
 *    cookie) and the "wrong account type for this route" case.
 *  - If no middleware secret is configured, fail-open (allow) so misconfigured local
 *    dev can't lock users out; the backend API and client guards still enforce.
 */

const ACCESS_COOKIE = 'jood_access';
const SECRET = process.env.JWT_ACCESS_SECRET;

const PUBLIC_ADMIN_PATHS = new Set([
  '/admin/sign-in',
  '/admin/sign-in/verify-otp',
  '/admin/sign-in/forgot-password',
]);

interface AccessClaims {
  type?: 'customer' | 'admin';
}

function readAccessToken(req: NextRequest): string | undefined {
  return req.cookies.get(ACCESS_COOKIE)?.value;
}

/** Returns null if the token is absent/invalid/expired; otherwise the claims. */
function verifyAccess(token: string | undefined): AccessClaims | null {
  if (!token || !SECRET) return null;
  // Distinguish "invalid signature/expired" from "no token at all" downstream.
  // `jwt.verify` throws on bad signature or expiry — catch and return null.
  try {
    return jwt.verify(token, SECRET, { issuer: 'jood-api' }) as AccessClaims;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public admin auth pages are never gated.
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = readAccessToken(req);

  // No access cookie at all ⇒ the visitor is not signed in. Redirect to sign-in.
  if (!token) {
    const isAdminArea = pathname.startsWith('/admin');
    const login = isAdminArea ? '/admin/sign-in' : '/auth/sign-in';
    const url = req.nextUrl.clone();
    url.pathname = login;
    return NextResponse.redirect(url);
  }

  const claims = verifyAccess(token);

  // Token present but valid ⇒ enforce account type for the section.
  if (claims?.type) {
    const isAdminArea = pathname.startsWith('/admin');
    if (isAdminArea && claims.type !== 'admin') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/sign-in';
      return NextResponse.redirect(url);
    }
    if (!isAdminArea && claims.type !== 'customer') {
      const url = req.nextUrl.clone();
      url.pathname = '/auth/sign-in';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Access cookie present but expired/invalid ⇒ the user has an active session that
  // the client will refresh. Allow through; client AuthContext + backend re-validate.
  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*', '/admin/:path*', '/checkout/:path*'],
};
