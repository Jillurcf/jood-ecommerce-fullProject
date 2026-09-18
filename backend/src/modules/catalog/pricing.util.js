function resolveDiscountPercent(discountType, discountValue, price) {
  const dv = Number(discountValue) || 0;
  const p = Number(price) || 0;
  const t = String(discountType || "").toLowerCase();
  if (t === "percent" || t === "percentage") return dv;
  if (t === "fixed" || t === "amount") return p > 0 ? dv / p * 100 : 0;
  return 0;
}
function computePrices(price, salePrice, discountType, discountValue, vatRate, vatIncluded) {
  const p = Number(price) || 0;
  const sp = Number(salePrice) || 0;
  const vr = Number(vatRate) || 0;
  let discountPercent = resolveDiscountPercent(discountType, discountValue, p > 0 ? p : sp);
  if (!discountPercent && p > 0 && sp > 0 && sp < p) {
    discountPercent = (p - sp) / p * 100;
  }
  const basePrice = sp > 0 ? sp : p;
  const discountVal = basePrice * (discountPercent / 100);
  const afterDiscount = basePrice - discountVal;
  let vatVal = 0;
  let finalPrice = afterDiscount;
  if (!vatIncluded) {
    vatVal = afterDiscount * (vr / 100);
    finalPrice = afterDiscount + vatVal;
  }
  return {
    finalPrice: +finalPrice.toFixed(2),
    discountValue: +discountVal.toFixed(2),
    vatValue: +vatVal.toFixed(2)
  };
}
function getStockLabel(stock, lowStockThreshold) {
  const s = Number(stock) || 0;
  const t = Number(lowStockThreshold) || 5;
  if (s <= 0) return "Out of Stock";
  if (s <= t) return `${s} (Limited Stock!)`;
  return `${s} available`;
}
function getStockStatus(stock, lowStockThreshold) {
  const s = Number(stock) || 0;
  const t = Number(lowStockThreshold) || 5;
  if (s <= 0) return "out_of_stock";
  if (s <= t) return "low_stock";
  return "in_stock";
}
export {
  computePrices,
  getStockLabel,
  getStockStatus,
  resolveDiscountPercent
};
