// Shared TypeScript models matching the backend API contracts (02-catalog.spec.md
// and 03-cart-wishlist.spec.md). Kept in sync with backend/src/modules responses.

export interface MenuCategory {
  id: number;
  name: string;
  slug: string;
}

export interface MenuParent {
  id: number;
  name: string;
  slug: string;
  display_order: number;
  status: boolean;
  meta_title: string | null;
  meta_description: string | null;
  image: string | null;
  children: MenuCategory[];
}

export interface MenuData {
  parents: MenuParent[];
}

export interface ParentCategory {
  id: number;
  name: string;
  slug: string;
  display_order: number;
  status: boolean;
  meta_title: string | null;
  meta_description: string | null;
  image: string | null;
}

export interface Category {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string | null;
  status: boolean;
  image: string | null;
}

export interface AttributeGroupEntry {
  attribute_id: string | null;
  attribute_name: string;
  attribute_slug: string;
  attribute_value_id: string | null;
  attribute_value: string;
  attribute_value_slug: string;
  key: string;
}

export interface VariantCard {
  id: string;
  cart_key: string;
  type: string;
  scope_type: string;
  product_id: string;
  master_id: string;
  variant_id: string;
  wishlist_id: string;
  name: string;
  slug: string;
  product_name: string;
  product_slug: string;
  master_product_code: string;
  original_price: string;
  sale_price: string;
  final_price: string;
  discount_value: string;
  discount_percent: number;
  vat_value: number;
  vat_rate: number;
  image: string;
  main_image: string;
  brand: string;
  model: string;
  mpn: string;
  product_type: string;
  stock: number;
  low_stock_threshold: number;
  stock_status: string;
  rating: number;
  condition: string;
  size: string;
  color: string;
  variant_options: Record<string, unknown>;
  attributes: AttributeGroupEntry[];
  attribute_groups: Record<string, { heading: string; key: string; values: string[] }>;
  created_at: string;
  is_fav: boolean;
  in_cart_qty: number;
  parent_category_id: string | null;
  parent_category_name: string;
  parent_category_slug: string;
  category_id: string | null;
  category_name: string;
  category_slug: string;
  total_ordered_quantity?: number;
}

export interface ShopGroup {
  heading: string;
  parent_category_id: string | null;
  parent_category_slug: string;
  items: VariantCard[];
}

export interface ScopeInfo {
  scopeType: string;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  parentCategorySlug: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  subgroupId: string | null;
  subgroupName: string | null;
  subgroupSlug: string | null;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface AttributeFilter {
  heading: string;
  key: string;
  values: FilterOption[];
}

export interface ShopFilters {
  parent_categories: { id: string | null; name: string; slug: string; count: number }[];
  categories: { id: string | null; parent_id: string | null; name: string; slug: string; count: number }[];
  brands: FilterOption[];
  models: FilterOption[];
  ratings?: FilterOption[];
  conditions?: FilterOption[];
  attributes: AttributeFilter[];
  price_range: { min: number | null; max: number | null };
  base_price_range: { min: number | null; max: number | null };
  selected: Record<string, unknown>;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ShopListing {
  success: boolean;
  scope: ScopeInfo;
  filters: ShopFilters;
  pagination: Pagination;
  data: ShopGroup[];
  cards: VariantCard[];
  flat: VariantCard[];
}

export interface ProductDetail {
  success: boolean;
  message: string;
  product: Record<string, unknown> | null;
  variants: VariantCard[];
  variantsForState: VariantCard[];
  selectedVariant: VariantCard | null;
  selected_variant_id: string | null;
  gallery: string[];
  relatedProducts: VariantCard[];
  frequentlyBoughtTogether: VariantCard[];
  customersAlsoViewed: VariantCard[];
  sameModelVariants: VariantCard[];
  compareItems: VariantCard[];
  breadcrumbs: { label: string; href: string }[];
}

export interface SearchItem {
  type: 'parent' | 'category' | 'product';
  id: number;
  name: string;
  slug: string;
  brand: string | null;
}

export interface CartItem {
  id: number;
  cart_key: string;
  type: 'variant' | 'product';
  tracking_id: string;
  product_id: number | null;
  master_id: number | null;
  variant_id: number | null;
  name: string | null;
  slug: string | null;
  brand: string | null;
  sku: string | null;
  image: string | null;
  quantity: number;
  original_price: number;
  sale_price: number;
  final_price: number;
  discount_type: string | null;
  discount_value: number;
  vat_rate: number;
  vat_included: boolean;
  stock: number | null;
  created_at: string;
  updated_at: string;
}

export interface WishlistItem {
  wishlist_id: number;
  variant_id: number;
  product_id: number | null;
  name: string | null;
  brand: string | null;
  sku: string | null;
  variant_image: string;
}

export interface WishlistData {
  data: number[];
  items: WishlistItem[];
  total: number;
  guestId: string | null;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  google_id: string | null;
  provider: string;
  status: string;
  email_verified: boolean;
  phone_verified: boolean | null;
  is_online: boolean;
  last_login_at: string | null;
  session_version: number;
}

export interface AuthAdmin {
  id: number;
  admin_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  email_verified: boolean;
  is_online: boolean;
  last_login_at: string | null;
  last_activity_at: string | null;
  session_version: number;
}

export interface MeResponse {
  type: 'customer' | 'admin';
  user?: AuthUser;
  admin?: AuthAdmin;
}

export interface SignUpPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
  agree_terms: boolean;
}

// ── Account ─────────────────────────────────────────────────────────────────

export interface AccountProfile {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  provider: string;
  created_at: string;
}

export interface OrderSummary {
  id: number;
  order_number: string;
  tracking_id: string;
  customer_name: string;
  email: string;
  phone: string | null;
  currency: string;
  subtotal_amount: number;
  discount_amount: number;
  vat_amount: number;
  grand_total: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  gateway_provider: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  payments?: OrderPayment[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string | null;
  sku: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  vat_amount: number;
  line_total: number;
  created_at: string;
}

export interface OrderPayment {
  id: number;
  order_id: number;
  provider: string | null;
  payment_method: string;
  transaction_reference: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrdersListResponse {
  orders: OrderSummary[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface UserAddress {
  id: number;
  user_id: number;
  email: string | null;
  address_type: string | null;
  is_default: boolean;
  address: string | null;
  address_line1: string | null;
  landmark: string | null;
  city: string | null;
  emirate: string | null;
  country: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedPaymentMethod {
  id: number;
  method_type: string;
  provider: string | null;
  cardholder_name: string | null;
  card_brand: string | null;
  card_last4: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  display_name: string | null;
  is_default: boolean;
  created_at: string;
}

export interface BillingSummary {
  total_spent: number;
  paid_orders: number;
  pending_payments: number;
  refund_total: number;
  this_month_spent: number;
  last_paid_at: string | null;
  first_order_at: string | null;
}

export interface TransactionHistoryItem {
  id: number;
  order_id: number;
  order_number: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  grand_total: number;
  payment_status: string;
  order_status: string;
  payment_method: string;
  currency: string;
  created_at: string;
}

// ── Checkout ────────────────────────────────────────────────────────────────

export interface CheckoutAddress {
  country: string;
  emirate: string;
  city: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  formatted_address?: string;
  location_label?: string;
  location_source?: string;
}

export interface CheckoutData {
  cart: CartItem[];
  subtotal: number;
  total_items: number;
  saved_addresses: UserAddress[];
  saved_payment_methods: SavedPaymentMethod[];
}

export interface CodOrderResult {
  order_id: number;
  order_number: string;
  tracking_id: string;
  payment_reference: string;
  grand_total: number;
  currency: string;
  payment_status: string;
  order_status: string;
}

export interface StripeSessionResult {
  session_id: string;
  checkout_url: string;
  order_id: number;
  order_number: string;
}

export interface OrderSuccessData {
  order_number: string;
  tracking_id: string;
  payment_reference: string;
  customer_name: string;
  email: string;
  grand_total: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  items: OrderItem[];
  billing_address: CheckoutAddress | null;
  shipping_address: CheckoutAddress | null;
  created_at: string;
}

export interface OrderTrackingData {
  order_number: string;
  tracking_id: string;
  order_status: string;
  payment_status: string;
  grand_total: number;
  currency: string;
  payment_method: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface AdminDashboardData {
  totalUsers: number;
  usersWithOrders: number;
  paidUsers: number;
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  totalRefunds: number;
  pendingPayments: number;
  totalVisitors: number;
  latestOrders: OrderSummary[];
}

export interface AdminOrdersData {
  orders: OrderSummary[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  summary: {
    total_orders: number;
    total_revenue: number;
    total_refunds: number;
    pending_payments: number;
    paid_count: number;
    pending_count: number;
    refunded_count: number;
    cancelled_count: number;
  };
  weekly_series: { date: string; revenue: number; orders: number }[];
  monthly_series: { month: string; revenue: number; orders: number }[];
}

export interface AdminProduct {
  id: number;
  product_id: string;
  name: string;
  slug: string;
  product_type: string;
  brand: string | null;
  mpn: string | null;
  description: string | null;
  short_description: string | null;
  parent_category_id: number | null;
  category_id: number | null;
  visibility: boolean;
  status: string;
  main_image: string | null;
  created_at: string;
  updated_at: string;
  variants?: AdminVariant[];
  _count?: { variants: number };
}

export interface AdminVariant {
  id: number;
  product_id: number;
  name: string;
  display_name: string | null;
  sku: string | null;
  price: number;
  sale_price: number | null;
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  track_inventory: boolean;
  allow_backorders: boolean;
  discount_type: string | null;
  discount_value: number | null;
  vat_rate: number;
  vat_included: boolean;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  media?: AdminVariantMedia[];
  attributes?: AdminVariantAttribute[];
}

export interface AdminVariantMedia {
  id: number;
  variant_id: number;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AdminVariantAttribute {
  id: number;
  attribute_id: number;
  attribute_name: string;
  attribute_slug: string;
  attribute_value_id: number;
  attribute_value: string;
}

export interface AdminParentCategory {
  id: number;
  name: string;
  slug: string;
  display_order: number;
  status: boolean;
  meta_title: string | null;
  meta_description: string | null;
  image: string | null;
  _count?: { categories: number };
  categories?: AdminCategory[];
}

export interface AdminCategory {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  status: boolean;
  image: string | null;
}

export interface AdminOrderDetail {
  id: number;
  order_number: string;
  tracking_id: string;
  payment_reference: string | null;
  customer_name: string;
  email: string;
  phone: string | null;
  currency: string;
  subtotal_amount: number;
  discount_amount: number;
  vat_amount: number;
  grand_total: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  gateway_provider: string | null;
  billing_address: Record<string, unknown> | null;
  shipping_address: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  payments: OrderPayment[];
}

export interface AdminCustomer {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  email_verified: boolean;
  is_online: boolean;
  last_login_at: string | null;
  created_at: string;
  _count?: { orders: number };
}

export interface AdminAccount {
  id: number;
  admin_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  email_verified: boolean;
  is_online: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AdminBillingData {
  totalUsers: number;
  usersWithOrders: number;
  paidUsers: number;
  totalRevenue: number;
  totalRefunds: number;
  pendingPayments: number;
  totalOrders: number;
  totalAddresses: number;
  thisMonthRevenue: number;
  monthlyRevenue: { month: string; revenue: number }[];
  users: {
    id: number;
    full_name: string;
    email: string;
    total_spent: number;
    total_orders_paid: number;
    pending_payments: number;
    refund_total: number;
    this_month_spent: number;
    last_paid_at: string | null;
    first_order_at: string | null;
    last_order: OrderSummary | null;
    address_count: number;
  }[];
}

export interface AdminTransaction {
  id: number;
  order_id: number;
  order_number: string;
  customer_name: string;
  email: string;
  grand_total: number;
  payment_status: string;
  order_status: string;
  payment_method: string;
  currency: string;
  created_at: string;
}

export interface AdminVisitor {
  id: number;
  visitor_key: string;
  ip_address: string | null;
  country: string | null;
  city: string | null;
  area: string | null;
  first_visit: string;
  last_visit: string;
  visit_count: number;
  recent_urls?: string[];
}

export interface AdminSupportItem {
  id: number;
  type: 'support' | 'contact';
  subject: string | null;
  name: string;
  email: string;
  message: string;
  status: string | null;
  created_at: string;
}

export interface AdminSupportDetail extends AdminSupportItem {
  phone: string | null;
  order_number: string | null;
  category: string | null;
  priority: string | null;
}

export interface AdminProductListResponse {
  products: AdminProduct[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface AdminCategoryListResponse {
  categories: AdminCategory[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}
