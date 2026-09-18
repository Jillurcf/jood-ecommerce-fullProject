import { getIO } from "./socket.js";
function safeEmit(event, payload) {
  try {
    const io = getIO();
    if (io) io.emit(event, payload);
  } catch {
  }
}
function safeEmitToRoom(room, event, payload) {
  try {
    const io = getIO();
    if (io) io.to(room).emit(event, payload);
  } catch {
  }
}
function emitCartUpdated(payload) {
  safeEmit("cartUpdated", payload);
}
function emitWishlistUpdated(payload) {
  safeEmit("wishlistUpdated", payload);
}
function emitOrderCreated(payload) {
  safeEmit("orderCreated", payload);
  safeEmitToRoom("/admin", "orderCreated", payload);
}
function emitOrderTrackingUpdated(payload) {
  safeEmit("orderTrackingUpdated", payload);
}
function emitOrderTrackingViewed(payload) {
  safeEmit("orderTrackingViewed", payload);
}
function emitProductCreated(payload) {
  safeEmit("product:created", payload);
  safeEmitToRoom("/admin", "product:created", payload);
  safeEmit("recentProductAdded", payload);
  safeEmit("recentProductsUpdated", payload);
}
function emitProductUpdated(payload) {
  safeEmit("product:updated", payload);
  safeEmitToRoom("/admin", "product:updated", payload);
  safeEmit("recentProductUpdated", payload);
  safeEmit("recentProductsUpdated", payload);
}
function emitProductDeleted(payload) {
  safeEmit("product:deleted", payload);
  safeEmitToRoom("/admin", "product:deleted", payload);
  safeEmit("recentProductDeleted", payload);
  safeEmit("recentProductsUpdated", payload);
}
function emitCategoryAddedOrUpdated(payload) {
  safeEmit("categoryAddedOrUpdated", payload);
  safeEmitToRoom("/admin", "categoryAddedOrUpdated", payload);
}
function emitCategoryDeleted(payload) {
  safeEmit("categoryDeleted", payload);
  safeEmitToRoom("/admin", "categoryDeleted", payload);
}
function emitDiscountProductsUpdated(payload) {
  safeEmit("discountProductsUpdated", payload);
  safeEmitToRoom("/admin", "discountProductsUpdated", payload);
}
function emitFrequentProductsUpdated(payload) {
  safeEmit("frequentProductsUpdated", payload);
}
function emitFrequentProductAdded(payload) {
  safeEmit("frequentProductAdded", payload);
}
function emitAdminEvent(eventName, payload) {
  safeEmitToRoom("/admin", eventName, payload);
  safeEmitToRoom("/admin", "admin:realtime", payload);
}
function emitUserEvent(eventName, payload) {
  safeEmitToRoom("/admin", eventName, payload);
  safeEmitToRoom("/admin", "user:realtime", payload);
}
function emitPageVisit(payload) {
  safeEmit("page_visit", payload);
}
export {
  emitAdminEvent,
  emitCartUpdated,
  emitCategoryAddedOrUpdated,
  emitCategoryDeleted,
  emitDiscountProductsUpdated,
  emitFrequentProductAdded,
  emitFrequentProductsUpdated,
  emitOrderCreated,
  emitOrderTrackingUpdated,
  emitOrderTrackingViewed,
  emitPageVisit,
  emitProductCreated,
  emitProductDeleted,
  emitProductUpdated,
  emitUserEvent,
  emitWishlistUpdated
};
