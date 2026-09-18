/**
 * Jood API Client — reads NEXT_PUBLIC_API_URL, includes credentials,
 * unwraps the { success, data, message, error_code } envelope.
 */

import {
  CartItem, WishlistData, ShopListing, MeResponse, SignUpPayload,
  AccountProfile, OrdersListResponse, OrderSummary, UserAddress,
  SavedPaymentMethod, BillingSummary, TransactionHistoryItem,
  CheckoutData, CodOrderResult, StripeSessionResult, CheckoutAddress,
  OrderSuccessData, OrderTrackingData,
} from './types';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error_code?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(statusCode: number, message: string, errorCode: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || BASE_URL;
  }

  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, init);
  }

  async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, { ...init, body: body ? JSON.stringify(body) : undefined });
  }

  async put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('PUT', path, { ...init, body: body ? JSON.stringify(body) : undefined });
  }

  async delete<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, init);
  }

  private async request<T>(method: string, path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) || {}),
    };

    const res = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      ...init,
    });

    const json: ApiResponse<T> = await res.json();

    if (!json.success) {
      throw new ApiError(res.status, json.message || 'Request failed', json.error_code || 'UNKNOWN');
    }

    return json.data as T;
  }
}

// ── Cart & wishlist client helpers ────────────────────────────────────────
// These must run in the browser so the HttpOnly guest cookie is sent with the
// request. The is_fav / in_cart_qty enrichment on listings is non-fatal.

export const api = new ApiClient();

export async function getCart(): Promise<CartItem[]> {
  return api.get<CartItem[]>('/cart');
}

export async function addToCart(
  payload: { product_id?: number; variant_id?: number; quantity?: number },
): Promise<CartItem[]> {
  return api.post<CartItem[]>('/cart/add', payload);
}

export async function updateCartQty(
  payload: { product_id?: number; variant_id?: number; quantity: number },
): Promise<CartItem[]> {
  return api.post<CartItem[]>('/cart/update', payload);
}

export async function removeCartItem(variantId: number): Promise<CartItem[]> {
  return api.post<CartItem[]>('/cart/remove', { variant_id: variantId });
}

export interface WishlistToggleResult {
  action: 'added' | 'removed';
  is_fav: boolean;
  data?: { id: number; variant_id: number } | null;
}

export async function getWishlist(): Promise<WishlistData> {
  return api.get<WishlistData>('/wishlist');
}

export async function toggleWishlist(variantId: number): Promise<WishlistToggleResult> {
  return api.post<WishlistToggleResult>('/wishlist/toggle', { variant_id: variantId });
}

/** Client-side shop listing fetch (raw JSON — not envelope-wrapped). */
export async function getShopListingClient(query: URLSearchParams, subPath = '/shop'): Promise<ShopListing> {
  const url = `${BASE_URL}${subPath}${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  return (await res.json()) as ShopListing;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function getMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/auth/me');
}

export async function signIn(payload: {
  email: string;
  password: string;
  remember_me?: boolean;
}): Promise<{ user?: Record<string, unknown>; admin?: Record<string, unknown> }> {
  return api.post('/auth/customer/sign-in', payload);
}

export async function signUp(payload: SignUpPayload): Promise<{ needsOtp: boolean }> {
  return api.post('/auth/customer/sign-up', payload);
}

export async function verifyOtp(email: string, otp: string): Promise<{ user: Record<string, unknown> }> {
  return api.post('/auth/customer/verify-otp', { email, otp });
}

export async function resendOtp(email: string): Promise<{ message: string }> {
  return api.post('/auth/customer/resend-otp', { email });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return api.post('/auth/customer/forgot-password', { email });
}

export async function resetPassword(token: string, password: string, confirm_password: string): Promise<{ email: string }> {
  return api.post('/auth/customer/reset-password', { token, password, confirm_password });
}

export async function validateResetToken(token: string): Promise<{ email: string }> {
  return api.get<{ email: string }>(`/auth/customer/reset-password?token=${encodeURIComponent(token)}`);
}

export async function logout(): Promise<void> {
  await api.post('/auth/customer/logout');
}

export async function refreshAuth(): Promise<{ type: string; id: number; role: string }> {
  return api.post('/auth/refresh');
}

// ── Account ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<AccountProfile> {
  return api.get<AccountProfile>('/account/profile');
}

export async function updateProfile(data: Partial<AccountProfile>): Promise<AccountProfile> {
  return api.put<AccountProfile>('/account/profile', data);
}

export async function getOrders(page = 1, limit = 20): Promise<OrdersListResponse> {
  return api.get<OrdersListResponse>(`/account/orders?page=${page}&limit=${limit}`);
}

export async function getOrderDetail(orderNumber: string): Promise<OrderSummary> {
  return api.get<OrderSummary>(`/account/orders/${encodeURIComponent(orderNumber)}`);
}

export async function getAddresses(): Promise<UserAddress[]> {
  return api.get<UserAddress[]>('/account/addresses');
}

export async function createAddress(data: Partial<UserAddress>): Promise<UserAddress> {
  return api.post<UserAddress>('/account/addresses', data);
}

export async function updateAddress(id: number, data: Partial<UserAddress>): Promise<UserAddress> {
  return api.put<UserAddress>(`/account/addresses/${id}`, data);
}

export async function deleteAddress(id: number): Promise<{ deleted: boolean }> {
  return api.delete(`/account/addresses/${id}`);
}

export async function setDefaultAddress(id: number): Promise<{ success: boolean }> {
  return api.post(`/account/addresses/${id}/default`);
}

export async function getPaymentMethods(): Promise<SavedPaymentMethod[]> {
  return api.get<SavedPaymentMethod[]>('/account/payment-methods');
}

export async function deletePaymentMethod(id: number): Promise<{ deleted: boolean }> {
  return api.delete(`/account/payment-methods/${id}`);
}

export async function getBilling(): Promise<BillingSummary> {
  return api.get<BillingSummary>('/account/billing');
}

export async function getTransactionHistory(params?: Record<string, string>): Promise<TransactionHistoryItem[]> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get<TransactionHistoryItem[]>(`/account/transaction-history${q}`);
}

export async function requestEmailChange(newEmail: string): Promise<{ message: string }> {
  return api.post('/account/security/update-email', { new_email: newEmail });
}

export async function resendEmailOtp(): Promise<{ message: string }> {
  return api.post('/account/security/update-email/resend-otp');
}

export async function verifyEmailChange(otp: string): Promise<{ email_updated: boolean }> {
  return api.post('/account/security/update-email/verify', { otp });
}

export async function updatePassword(data: {
  current_password: string;
  new_password: string;
  confirm_password: string;
}): Promise<{ password_updated: boolean }> {
  return api.post('/account/security/update-password', data);
}

// ── Checkout ────────────────────────────────────────────────────────────────

export async function getCheckoutData(): Promise<CheckoutData> {
  return api.get<CheckoutData>('/checkout/data');
}

export async function placeCodOrder(data: {
  payment_method: 'cod';
  billing_address: CheckoutAddress;
  shipping_address: CheckoutAddress;
  notes?: string;
  save_billing?: boolean;
  save_shipping?: boolean;
}): Promise<CodOrderResult> {
  return api.post<CodOrderResult>('/checkout', data);
}

export async function createStripeSession(data: {
  payment_method: 'card';
  gateway_provider: 'stripe';
  billing_address: CheckoutAddress;
  shipping_address: CheckoutAddress;
  notes?: string;
  save_billing?: boolean;
  save_shipping?: boolean;
}): Promise<StripeSessionResult> {
  return api.post<StripeSessionResult>('/checkout/create-payment-session', data);
}

export async function getOrderSuccess(orderNumber: string): Promise<OrderSuccessData> {
  return api.get<OrderSuccessData>(`/checkout/success/${encodeURIComponent(orderNumber)}`);
}

export async function getOrderTracking(orderNumber: string): Promise<OrderTrackingData> {
  return api.get<OrderTrackingData>(`/checkout/track/${encodeURIComponent(orderNumber)}`);
}

export async function getSavedAddresses(): Promise<UserAddress[]> {
  return api.get<UserAddress[]>('/checkout/saved-addresses');
}

export async function getSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
  return api.get<SavedPaymentMethod[]>('/checkout/saved-payment-methods');
}

// ── Admin Auth ───────────────────────────────────────────────────────────

export async function adminSignIn(payload: {
  email: string;
  password: string;
}): Promise<{ needsOtp: boolean }> {
  return api.post('/auth/admin/sign-in', payload);
}

export async function adminVerifyOtp(email: string, otp: string): Promise<{ admin: Record<string, unknown>; role: string }> {
  return api.post('/auth/admin/verify-otp', { email, otp });
}

export async function adminResendOtp(email: string): Promise<{ message: string }> {
  return api.post('/auth/admin/resend-otp', { email });
}

export async function adminForgotPassword(email: string): Promise<{ message: string }> {
  return api.post('/auth/admin/forgot-password', { email });
}

export async function adminVerifyRecoveryOtp(email: string, otp: string): Promise<{ reset_token: string }> {
  return api.post('/auth/admin/verify-recovery-otp', { email, otp });
}

export async function adminResendRecoveryOtp(email: string): Promise<{ message: string }> {
  return api.post('/auth/admin/resend-recovery-otp', { email });
}

export async function adminResetPassword(token: string, password: string, confirm_password: string): Promise<{ email: string }> {
  return api.post('/auth/admin/reset-password', { token, password, confirm_password });
}

export async function adminLogout(): Promise<void> {
  await api.post('/auth/admin/logout');
}

// ── Admin Profile ────────────────────────────────────────────────────────

export async function getAdminProfile(): Promise<import('./types').AuthAdmin> {
  return api.get('/admin/profile');
}

export async function updateAdminProfile(data: { full_name?: string; phone?: string }): Promise<import('./types').AuthAdmin> {
  return api.put('/admin/profile', data);
}

export async function adminHeartbeat(): Promise<{ ok: boolean }> {
  return api.post('/admin/heartbeat');
}

export async function adminOffline(): Promise<{ ok: boolean }> {
  return api.post('/admin/offline');
}

export async function adminUpdateEmail(newEmail: string): Promise<{ message: string }> {
  return api.post('/admin/update-email', { new_email: newEmail });
}

export async function adminUpdatePassword(data: {
  current_password: string;
  new_password: string;
  confirm_password: string;
}): Promise<{ password_updated: boolean }> {
  return api.post('/admin/update-password', data);
}

// ── Admin Dashboard ──────────────────────────────────────────────────────

export async function getAdminDashboard(): Promise<import('./types').AdminDashboardData> {
  return api.get('/admin/dashboard');
}

// ── Admin Products ───────────────────────────────────────────────────────

export async function getAdminProducts(params?: Record<string, string>): Promise<import('./types').AdminProductListResponse> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/products${q}`);
}

export async function getAdminProduct(id: number): Promise<import('./types').AdminProduct> {
  return api.get(`/admin/products/${id}`);
}

export async function createAdminProduct(data: Record<string, unknown>): Promise<import('./types').AdminProduct> {
  return api.post('/admin/products', data);
}

export async function updateAdminProduct(id: number, data: Record<string, unknown>): Promise<import('./types').AdminProduct> {
  return api.put(`/admin/products/${id}`, data);
}

export async function deleteAdminProduct(id: number): Promise<{ deleted: boolean }> {
  return api.delete(`/admin/products/${id}`);
}

// ── Admin Categories ─────────────────────────────────────────────────────

export async function getAdminParentCategories(): Promise<import('./types').AdminParentCategory[]> {
  return api.get('/admin/parent-categories');
}

export async function getAdminParentCategory(id: number): Promise<import('./types').AdminParentCategory> {
  return api.get(`/admin/parent-categories/${id}`);
}

export async function createAdminParentCategory(data: Record<string, unknown>): Promise<import('./types').AdminParentCategory> {
  return api.post('/admin/parent-categories', data);
}

export async function updateAdminParentCategory(id: number, data: Record<string, unknown>): Promise<import('./types').AdminParentCategory> {
  return api.put(`/admin/parent-categories/${id}`, data);
}

export async function deleteAdminParentCategory(id: number): Promise<{ deleted: boolean }> {
  return api.delete(`/admin/parent-categories/${id}`);
}

export async function getAdminCategories(params?: Record<string, string>): Promise<import('./types').AdminCategoryListResponse> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/categories${q}`);
}

export async function getAdminCategory(id: number): Promise<import('./types').AdminCategory> {
  return api.get(`/admin/categories/${id}`);
}

export async function createAdminCategory(data: Record<string, unknown>): Promise<import('./types').AdminCategory> {
  return api.post('/admin/categories', data);
}

export async function updateAdminCategory(id: number, data: Record<string, unknown>): Promise<import('./types').AdminCategory> {
  return api.put(`/admin/categories/${id}`, data);
}

export async function deleteAdminCategory(id: number): Promise<{ deleted: boolean }> {
  return api.delete(`/admin/categories/${id}`);
}

// ── Admin Orders ─────────────────────────────────────────────────────────

export async function getAdminOrders(params?: Record<string, string>): Promise<import('./types').AdminOrdersData> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/orders${q}`);
}

export async function getAdminOrderDetail(orderNumber: string): Promise<import('./types').AdminOrderDetail> {
  return api.get(`/admin/orders/${encodeURIComponent(orderNumber)}`);
}

export async function cancelAdminOrder(id: number): Promise<{ cancelled: boolean }> {
  return api.post(`/admin/orders/${id}/cancel`);
}

export async function getAdminOrderStatusOptions(): Promise<string[]> {
  return api.get('/admin/orders/status-options');
}

// ── Admin Customers ──────────────────────────────────────────────────────

export async function getAdminCustomers(params?: Record<string, string>): Promise<{
  users: import('./types').AdminCustomer[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/users${q}`);
}

export async function getAdminCustomer(id: number): Promise<import('./types').AdminCustomer> {
  return api.get(`/admin/users/${id}`);
}

export async function createAdminCustomer(data: Record<string, unknown>): Promise<import('./types').AdminCustomer> {
  return api.post('/admin/users', data);
}

export async function updateAdminCustomer(id: number, data: Record<string, unknown>): Promise<import('./types').AdminCustomer> {
  return api.put(`/admin/users/${id}`, data);
}

export async function blockAdminCustomer(id: number): Promise<{ blocked: boolean }> {
  return api.post(`/admin/users/${id}/block`);
}

export async function freezeAdminCustomer(id: number): Promise<{ frozen: boolean }> {
  return api.post(`/admin/users/${id}/freeze`);
}

export async function deleteAdminCustomer(id: number): Promise<{ deleted: boolean }> {
  return api.post(`/admin/users/${id}/delete`);
}

// ── Admin Accounts ───────────────────────────────────────────────────────

export async function getAdminOverview(): Promise<import('./types').AdminAccount[]> {
  return api.get('/admin/overview');
}

export async function getAdminAdmins(params?: Record<string, string>): Promise<{
  admins: import('./types').AdminAccount[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/admins${q}`);
}

export async function requestCreateAdmin(email: string, role: string): Promise<{ message: string }> {
  return api.post('/admin/create', { email, role });
}

export async function suspendAdmin(id: number): Promise<{ suspended: boolean }> {
  return api.post('/admin/suspend', { id });
}

export async function activateAdmin(id: number): Promise<{ activated: boolean }> {
  return api.post('/admin/activate', { id });
}

export async function forceLogoutAdmin(id: number): Promise<{ force_logged_out: boolean }> {
  return api.post('/admin/force-logout', { id });
}

// ── Admin Billing ────────────────────────────────────────────────────────

export async function getAdminBilling(): Promise<import('./types').AdminBillingData> {
  return api.get('/admin/billing');
}

export async function getAdminBillingChart(): Promise<{ month: string; revenue: number }[]> {
  return api.get('/admin/billing/chart');
}

export async function getAdminBillingDetail(id: number): Promise<Record<string, unknown>> {
  return api.get(`/admin/billing/detail/${id}`);
}

// ── Admin Transactions ───────────────────────────────────────────────────

export async function getAdminTransactions(params?: Record<string, string>): Promise<{
  transactions: import('./types').AdminTransaction[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/transactions${q}`);
}

export async function getAdminTransactionSummary(): Promise<Record<string, unknown>> {
  return api.get('/admin/transactions/summary');
}

export async function getAdminTransactionChart(): Promise<{ month: string; revenue: number }[]> {
  return api.get('/admin/transactions/chart');
}

// ── Admin Visitors ───────────────────────────────────────────────────────

export async function getAdminVisitors(params?: Record<string, string>): Promise<{
  visitors: import('./types').AdminVisitor[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/visitors${q}`);
}

export async function getAdminVisitorChart(params?: Record<string, string>): Promise<{ label: string; visitors: number; page_views: number }[]> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/visitors/chart${q}`);
}

export async function getAdminVisitorDetail(key: string): Promise<{ visitor: import('./types').AdminVisitor; visits: Record<string, unknown>[] }> {
  return api.get(`/admin/visitors/${encodeURIComponent(key)}/visits`);
}

// ── Admin Support ────────────────────────────────────────────────────────

export async function getAdminSupport(params?: Record<string, string>): Promise<{
  items: import('./types').AdminSupportItem[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}> {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return api.get(`/admin/support${q}`);
}

export async function getAdminSupportDetail(id: number): Promise<import('./types').AdminSupportDetail> {
  return api.get(`/admin/support/${id}`);
}

export async function updateAdminSupportStatus(id: number, status: string): Promise<{ updated: boolean }> {
  return api.post(`/admin/support/${id}/status`, { status });
}
