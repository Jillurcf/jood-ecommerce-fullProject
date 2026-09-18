import { prisma } from "../../lib/prisma.js";
import { computePrices, getStockLabel, getStockStatus } from "./pricing.util.js";
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const sanitize = (v) => {
  if (v === null || v === void 0) return "";
  return String(v).replace(/[<>]/g, "").trim();
};
const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== void 0))];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const toLower = (v) => sanitize(v).toLowerCase();
const normalizeAttrKey = (name) => toLower(name).replace(/colour/g, "color").replace(/[^a-z0-9\s_-]/g, "").replace(/[\s-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
function parseList(value) {
  if (value === void 0 || value === null || value === "") return [];
  if (Array.isArray(value))
    return uniq(value.map((v) => sanitize(v)).filter(Boolean));
  return uniq(
    String(value).split(",").map((s) => sanitize(s)).filter(Boolean)
  );
}
function parseIntList(value) {
  if (value === void 0 || value === null || value === "") return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return uniq(
    raw.map((v) => {
      const n = Number.parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    }).filter((v) => v !== null)
  );
}
function parseBooleanQuery(value, defaultValue = true) {
  if (value === void 0 || value === null || value === "") return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}
function safeFloat(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function parseAttributeFilters(query) {
  const result = {};
  const add = (rawName, rawValue) => {
    const attrName = normalizeAttrKey(rawName);
    const values = parseList(rawValue).map((v) => sanitize(v)).filter(Boolean);
    if (!attrName || !values.length) return;
    if (!result[attrName]) result[attrName] = [];
    result[attrName].push(...values);
  };
  for (const [key, rawValue] of Object.entries(query || {})) {
    if (typeof key === "string" && key.startsWith("attr_")) add(key.replace(/^attr_/, ""), rawValue);
    if (typeof key === "string" && key.startsWith("attribute_")) add(key.replace(/^attribute_/, ""), rawValue);
  }
  const combined = query?.attributes ?? query?.attribute_filters;
  if (combined) {
    for (const chunk of String(combined).split(",")) {
      const part = sanitize(chunk);
      if (!part) continue;
      const sepIndex = part.indexOf(":") >= 0 ? part.indexOf(":") : part.indexOf("=");
      if (sepIndex === -1) continue;
      add(part.slice(0, sepIndex), part.slice(sepIndex + 1));
    }
  }
  const colorVal = query?.color ?? query?.colors ?? query?.colour ?? query?.colours;
  if (colorVal) add("color", colorVal);
  const sizeVal = query?.size ?? query?.sizes;
  if (sizeVal) add("size", sizeVal);
  for (const k of Object.keys(result)) {
    result[k] = uniq(result[k].map((v) => sanitize(v)).filter(Boolean));
    if (!result[k].length) delete result[k];
  }
  return result;
}
function resolveRouteScope(params, query) {
  const productSlug = params.productSlug ?? params.product_slug ?? query?.productSlug ?? query?.product_slug ?? query?.slug ?? query?.product;
  const subgroupSlug = params.subgroupSlug ?? params.subgroup_slug ?? params.subcategorySlug ?? params.subcategory_slug ?? query?.subgroupSlug ?? query?.subgroup_slug ?? query?.subcategory_slug;
  const groupSlug = params.groupSlug ?? params.group_slug ?? query?.groupSlug ?? query?.group_slug ?? query?.parent_slug;
  const productId = (() => {
    const v = params.productId ?? params.product_id ?? query?.productId ?? query?.product_id;
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  })();
  const subgroupId = (() => {
    const v = params.subgroupId ?? params.subgroup_id ?? query?.subgroupId ?? query?.subgroup_id;
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  })();
  const groupId = (() => {
    const v = params.groupId ?? params.group_id ?? query?.groupId ?? query?.group_id ?? query?.parent_category_id;
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  })();
  if (productSlug || productId) return { type: "product", productSlug: productSlug || null, productId: productId || null };
  if (subgroupSlug || subgroupId) return { type: "subgroup", subgroupSlug: subgroupSlug || null, subgroupId: subgroupId || null };
  if (groupSlug || groupId) return { type: "group", groupSlug: groupSlug || null, groupId: groupId || null };
  return { type: "shop" };
}
async function resolveScopeInfo(scope) {
  const scopeInfo = {
    scopeType: scope.type,
    parentCategoryId: null,
    parentCategoryName: null,
    parentCategorySlug: null,
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    subgroupId: null,
    subgroupName: null,
    subgroupSlug: null,
    productId: null,
    productName: null,
    productSlug: null
  };
  const productWhere = {};
  if (scope.type === "group") {
    if (scope.groupId) {
      const parent = await prisma.parentCategory.findUnique({ where: { id: scope.groupId } });
      if (parent) {
        productWhere.parentCategoryId = parent.id;
        scopeInfo.parentCategoryId = String(parent.id);
        scopeInfo.parentCategoryName = parent.name;
        scopeInfo.parentCategorySlug = parent.slug;
      }
    } else if (scope.groupSlug) {
      const parent = await prisma.parentCategory.findUnique({ where: { slug: scope.groupSlug } });
      if (parent) {
        productWhere.parentCategoryId = parent.id;
        scopeInfo.parentCategoryId = String(parent.id);
        scopeInfo.parentCategoryName = parent.name;
        scopeInfo.parentCategorySlug = parent.slug;
      }
    }
  }
  if (scope.type === "subgroup") {
    if (scope.subgroupId) {
      const cat = await prisma.category.findUnique({ where: { id: scope.subgroupId } });
      if (cat) {
        productWhere.categoryId = cat.id;
        scopeInfo.categoryId = String(cat.id);
        scopeInfo.categoryName = cat.name;
        scopeInfo.categorySlug = cat.slug;
        scopeInfo.subgroupId = String(cat.id);
        scopeInfo.subgroupName = cat.name;
        scopeInfo.subgroupSlug = cat.slug;
        if (cat.parentId) {
          scopeInfo.parentCategoryId = String(cat.parentId);
          const parent = await prisma.parentCategory.findUnique({ where: { id: cat.parentId } });
          if (parent) {
            scopeInfo.parentCategoryName = parent.name;
            scopeInfo.parentCategorySlug = parent.slug;
          }
        }
      }
    } else if (scope.subgroupSlug) {
      const cat = await prisma.category.findUnique({ where: { slug: scope.subgroupSlug } });
      if (cat) {
        productWhere.categoryId = cat.id;
        scopeInfo.categoryId = String(cat.id);
        scopeInfo.categoryName = cat.name;
        scopeInfo.categorySlug = cat.slug;
        scopeInfo.subgroupId = String(cat.id);
        scopeInfo.subgroupName = cat.name;
        scopeInfo.subgroupSlug = cat.slug;
        if (cat.parentId) {
          scopeInfo.parentCategoryId = String(cat.parentId);
          const parent = await prisma.parentCategory.findUnique({ where: { id: cat.parentId } });
          if (parent) {
            scopeInfo.parentCategoryName = parent.name;
            scopeInfo.parentCategorySlug = parent.slug;
          }
        }
      }
    }
  }
  if (scope.type === "product") {
    let product = null;
    if (scope.productId) {
      product = await prisma.product.findUnique({ where: { id: scope.productId }, select: { id: true, name: true } });
    } else if (scope.productSlug) {
      product = await prisma.product.findUnique({ where: { slug: scope.productSlug }, select: { id: true, name: true } });
    }
    if (product) {
      scopeInfo.productId = String(product.id);
      scopeInfo.productName = product.name;
    }
  }
  const variantWhere = {};
  const productFilters = { ...productWhere };
  if (Object.keys(productFilters).length > 0) {
    variantWhere.product = productFilters;
  }
  return { where: variantWhere, scopeInfo };
}
async function fetchVariantRows(where, limit = 1e3) {
  const rows = await prisma.productVariant.findMany({
    where: { ...where, isActive: true },
    include: {
      product: {
        include: {
          parentCategory: true,
          category: true
        }
      },
      media: { orderBy: { id: "desc" }, take: 1 }
    },
    orderBy: [
      { updatedAt: "desc" },
      { sortOrder: "asc" },
      { id: "desc" }
    ],
    take: limit
  });
  return rows.map((r) => {
    const p = r.product;
    return {
      id: r.id,
      productId: r.productId,
      name: r.name,
      displayName: r.displayName,
      sku: r.sku,
      price: r.price,
      salePrice: r.salePrice,
      costPrice: r.costPrice,
      stock: r.stock,
      lowStockThreshold: r.lowStockThreshold,
      trackInventory: r.trackInventory,
      allowBackorders: r.allowBackorders,
      discountType: r.discountType,
      discountValue: r.discountValue,
      vatRate: r.vatRate,
      vatIncluded: r.vatIncluded,
      barcode: r.barcode,
      barcodeType: r.barcodeType,
      weight: r.weight,
      weightUnit: r.weightUnit,
      length: r.length,
      width: r.width,
      height: r.height,
      dimensionUnit: r.dimensionUnit,
      shippingClass: r.shippingClass,
      isActive: r.isActive,
      isDefault: r.isDefault,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      product_name: p.name,
      product_slug: p.slug,
      master_product_code: p.productId,
      product_type: p.productType,
      brand: p.brand,
      mpn: p.mpn,
      bullets: p.bullets,
      description: p.description,
      short_description: p.shortDescription,
      visibility: p.visibility,
      meta_keywords: p.metaKeywords,
      meta_title: p.metaTitle,
      meta_description: p.metaDescription,
      main_image: p.mainImage,
      product_videos: p.productVideos,
      display_locations: p.displayLocations,
      display_timing: p.displayTiming,
      product_created_at: p.createdAt,
      product_updated_at: p.updatedAt,
      parent_category_id: p.parentCategoryId,
      parent_category_name: p.parentCategory?.name ?? "Uncategorized",
      parent_category_slug: p.parentCategory?.slug ?? "",
      category_id: p.categoryId,
      category_name: p.category?.name ?? "",
      category_slug: p.category?.slug ?? "",
      category_parent_id: p.category?.parentId ?? null,
      image: r.media[0]?.filename ?? p.mainImage ?? null
    };
  });
}
async function fetchVariantAttributesMap(variantIds) {
  const map = /* @__PURE__ */ new Map();
  if (!variantIds.length) return map;
  const rows = await prisma.productVariantAttribute.findMany({
    where: { variantId: { in: variantIds } },
    include: { attribute: true, attributeValue: true },
    orderBy: [{ attribute: { name: "asc" } }, { attributeValue: { sortOrder: "asc" } }]
  });
  for (const row of rows) {
    const vid = String(row.variantId);
    if (!map.has(vid)) map.set(vid, []);
    map.get(vid).push({
      attribute_id: String(row.attribute.id),
      attribute_name: sanitize(row.attribute.name),
      attribute_slug: sanitize(row.attribute.slug),
      attribute_value_id: String(row.attributeValue.id),
      attribute_value: sanitize(row.attributeValue.value),
      attribute_value_slug: sanitize(row.attributeValue.slug ?? ""),
      key: normalizeAttrKey(row.attribute.slug || row.attribute.name)
    });
  }
  return map;
}
async function fetchVariantMediaMap(variantIds) {
  const map = /* @__PURE__ */ new Map();
  if (!variantIds.length) return map;
  const rows = await prisma.variantMedia.findMany({
    where: { variantId: { in: variantIds } },
    orderBy: { id: "desc" },
    distinct: ["variantId"]
  });
  for (const row of rows) {
    map.set(String(row.variantId), sanitize(row.filename));
  }
  return map;
}
async function fetchVariantFullMediaMap(variantIds) {
  const map = /* @__PURE__ */ new Map();
  if (!variantIds.length) return map;
  const rows = await prisma.variantMedia.findMany({
    where: { variantId: { in: variantIds } },
    orderBy: { id: "asc" }
  });
  for (const row of rows) {
    const vid = String(row.variantId);
    if (!map.has(vid)) map.set(vid, []);
    map.get(vid).push({
      id: row.id,
      url: `/uploads/products/${sanitize(row.filename)}`,
      name: sanitize(row.originalname || row.filename),
      filename: sanitize(row.filename),
      mimetype: row.mimetype ?? null,
      size: row.size ?? null
    });
  }
  return map;
}
function buildVariantCard(row, wishlistSet, attributeMap, cartQtyMap) {
  const price = toNum(row.price);
  const salePrice = toNum(row.salePrice);
  const vatRate = toNum(row.vatRate);
  const { finalPrice, discountValue, vatValue } = computePrices(
    price,
    salePrice,
    row.discountType,
    row.discountValue != null ? toNum(row.discountValue) : null,
    vatRate,
    row.vatIncluded
  );
  const masterName = sanitize(row.product_name);
  const variantName = sanitize(row.displayName || row.name);
  const displayName = variantName ? `${masterName} ${variantName}`.trim() : masterName || variantName;
  const image = sanitize(row.image || row.main_image || "");
  const attrs = attributeMap.get(String(row.id)) || [];
  const attributeGroups = {};
  for (const attr of attrs) {
    const k = attr.key;
    if (!k) continue;
    if (!attributeGroups[k]) attributeGroups[k] = { heading: sanitize(attr.attribute_name), key: k, values: [] };
    attributeGroups[k].values.push(sanitize(attr.attribute_value));
  }
  for (const k of Object.keys(attributeGroups)) {
    attributeGroups[k].values = uniq(attributeGroups[k].values);
  }
  const cartKey = `${row.productId}:${row.id}`;
  const stock = toNum(row.stock);
  const baseForDiscount = price > 0 ? price : salePrice;
  let discountPercent = 0;
  if (row.discountType) {
    const t = row.discountType.toLowerCase();
    if (t === "percent" || t === "percentage") discountPercent = toNum(row.discountValue);
    else if (t === "fixed" || t === "amount") discountPercent = baseForDiscount > 0 ? toNum(row.discountValue) / baseForDiscount * 100 : 0;
  }
  if (!discountPercent && price > 0 && salePrice > 0 && salePrice < price) {
    discountPercent = (price - salePrice) / price * 100;
  }
  const candidateIds = [String(row.id), String(row.productId)];
  const isFav = candidateIds.some((id) => wishlistSet.has(id));
  const inCartQty = cartQtyMap.get(cartKey) ?? 0;
  let color = "";
  let size = "";
  for (const attr of attrs) {
    if (attr.key === "color") color = sanitize(attr.attribute_value);
    if (attr.key === "size") size = sanitize(attr.attribute_value);
  }
  return {
    id: String(row.id),
    cart_key: cartKey,
    type: "variant",
    scope_type: "variant",
    product_id: String(row.productId),
    master_id: String(row.productId),
    variant_id: String(row.id),
    wishlist_id: String(row.productId),
    name: sanitize(displayName || row.displayName || row.name || masterName),
    slug: sanitize(row.product_slug),
    product_name: masterName,
    product_slug: sanitize(row.product_slug),
    master_product_code: sanitize(row.master_product_code),
    original_price: Number(price > 0 ? price : salePrice > 0 ? salePrice : 0).toFixed(2),
    sale_price: Number(salePrice > 0 ? salePrice : 0).toFixed(2),
    final_price: Number(finalPrice).toFixed(2),
    discount_value: Number(discountValue).toFixed(2),
    discount_percent: +Number(discountPercent || 0).toFixed(2),
    vat_value: +Number(vatValue).toFixed(2),
    vat_rate: +Number(vatRate).toFixed(2),
    image,
    main_image: sanitize(row.main_image || ""),
    brand: sanitize(row.brand || ""),
    model: sanitize(row.mpn || ""),
    mpn: sanitize(row.mpn || ""),
    product_type: sanitize(row.product_type || ""),
    stock,
    low_stock_threshold: toNum(row.lowStockThreshold, 5),
    stock_status: getStockLabel(stock, row.lowStockThreshold),
    rating: 0,
    condition: "",
    size,
    color,
    variant_options: {
      sku: sanitize(row.sku || ""),
      barcode: sanitize(row.barcode || ""),
      barcode_type: sanitize(row.barcodeType || ""),
      weight: toNum(row.weight),
      weight_unit: sanitize(row.weightUnit || ""),
      length: toNum(row.length),
      width: toNum(row.width),
      height: toNum(row.height),
      dimension_unit: sanitize(row.dimensionUnit || ""),
      shipping_class: sanitize(row.shippingClass || ""),
      cost_price: toNum(row.costPrice)
    },
    attributes: attrs,
    attribute_groups: attributeGroups,
    created_at: row.createdAt,
    is_fav: isFav,
    in_cart_qty: inCartQty,
    parent_category_id: row.parent_category_id ? String(row.parent_category_id) : null,
    parent_category_name: sanitize(row.parent_category_name),
    parent_category_slug: sanitize(row.parent_category_slug),
    category_id: row.category_id ? String(row.category_id) : null,
    category_name: sanitize(row.category_name),
    category_slug: sanitize(row.category_slug)
  };
}
function cardMatchesAttributeFilters(card, selectedAttributes) {
  if (!Object.keys(selectedAttributes).length) return true;
  const cardAttrMap = {};
  for (const group of card.attributes || []) {
    const key = normalizeAttrKey(group.attribute_slug || group.attribute_name || group.key || "");
    if (!key) continue;
    if (!cardAttrMap[key]) cardAttrMap[key] = /* @__PURE__ */ new Set();
    cardAttrMap[key].add(toLower(group.attribute_value));
  }
  for (const [attrKey, wantedValues] of Object.entries(selectedAttributes)) {
    const normalizedKey = normalizeAttrKey(attrKey);
    const wanted = wantedValues.map((v) => toLower(v));
    const directMap = {
      model: card.model || card.mpn || "",
      mpn: card.mpn || card.model || "",
      brand: card.brand || "",
      color: card.color || "",
      size: card.size || ""
    };
    if (directMap[normalizedKey]) {
      if (wanted.includes(toLower(directMap[normalizedKey]))) continue;
    }
    const exists = cardAttrMap[normalizedKey];
    if (!exists) return false;
    if (!wanted.some((v) => exists.has(v))) return false;
  }
  return true;
}
function applyFilters(cards, query) {
  const selectedParents = uniq(parseIntList(query.parent_category_id ?? query.parent_id).map(String));
  const selectedCategories = uniq(parseIntList(query.category_id ?? query.subgroup_id).map(String));
  const selectedBrands = uniq(parseList(query.brand ?? query.brands).map(toLower));
  const selectedModels = uniq(parseList(query.model ?? query.models).map(toLower));
  const selectedRatings = uniq(parseList(query.rating ?? query.ratings).map((v) => String(toNum(v, 0))));
  const selectedConditions = uniq(parseList(query.condition ?? query.conditions).map(toLower));
  const selectedAttributes = parseAttributeFilters(query);
  const priceMin = query.price_min !== void 0 && query.price_min !== "" ? safeFloat(query.price_min) : null;
  const priceMax = query.price_max !== void 0 && query.price_max !== "" ? safeFloat(query.price_max) : null;
  const inStockOnly = parseBooleanQuery(query.in_stock_only, true);
  return cards.filter((card) => {
    if (inStockOnly && card.stock <= 0) return false;
    if (selectedParents.length && !selectedParents.includes(String(card.parent_category_id || ""))) return false;
    if (selectedCategories.length && !selectedCategories.includes(String(card.category_id || ""))) return false;
    if (selectedBrands.length && !selectedBrands.includes(toLower(card.brand))) return false;
    if (selectedModels.length && !selectedModels.includes(toLower(card.model || card.mpn))) return false;
    if (selectedConditions.length && !selectedConditions.includes(toLower(card.condition))) return false;
    if (selectedRatings.length && card.rating > 0) {
      const roundedRating = Math.round(Math.min(Math.max(card.rating, 0), 5) * 2) / 2;
      if (!selectedRatings.includes(String(roundedRating))) return false;
    }
    if (priceMin !== null && toNum(card.final_price) < priceMin) return false;
    if (priceMax !== null && toNum(card.final_price) > priceMax) return false;
    if (!cardMatchesAttributeFilters(card, selectedAttributes)) return false;
    return true;
  });
}
function applySearchFilter(cards, search) {
  const q = sanitize(search).toLowerCase();
  if (!q) return cards;
  return cards.filter(
    (card) => [card.name, card.brand, card.model, card.slug, card.category_name, card.parent_category_name, card.size, card.color].join(" ").toLowerCase().includes(q)
  );
}
function applySort(cards, sort) {
  const s = toLower(sort || "latest");
  const copy = [...cards];
  copy.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    switch (s) {
      case "oldest":
        if (ta !== tb) return ta - tb;
        return String(a.id).localeCompare(String(b.id));
      case "price_asc":
        if (toNum(a.final_price) !== toNum(b.final_price)) return toNum(a.final_price) - toNum(b.final_price);
        return tb - ta;
      case "price_desc":
        if (toNum(a.final_price) !== toNum(b.final_price)) return toNum(b.final_price) - toNum(a.final_price);
        return tb - ta;
      case "name_asc":
        return String(a.name || "").localeCompare(String(b.name || ""));
      case "name_desc":
        return String(b.name || "").localeCompare(String(a.name || ""));
      case "rating_desc":
        if (toNum(a.rating) !== toNum(b.rating)) return toNum(b.rating) - toNum(a.rating);
        return tb - ta;
      case "rating_asc":
        if (toNum(a.rating) !== toNum(b.rating)) return toNum(a.rating) - toNum(b.rating);
        return tb - ta;
      case "latest":
      default:
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    }
  });
  return copy;
}
function paginate(items, page = 1, limit = 24) {
  const p = Math.max(1, toNum(page, 1));
  const l = clamp(toNum(limit, 24), 1, 1e3);
  const start = (p - 1) * l;
  return {
    page: p,
    limit: l,
    total: items.length,
    total_pages: Math.max(1, Math.ceil(items.length / l)),
    items: items.slice(start, start + l)
  };
}
function groupByParentCategory(cards) {
  const map = /* @__PURE__ */ new Map();
  for (const card of cards) {
    const heading = card.parent_category_name || "Uncategorized";
    const parentId = card.parent_category_id || null;
    const key = `${heading}::${parentId ?? "null"}`;
    if (!map.has(key)) {
      map.set(key, { heading, parent_category_id: parentId, parent_category_slug: card.parent_category_slug, items: [] });
    }
    map.get(key).items.push(card);
  }
  return Array.from(map.values()).sort((a, b) => String(a.heading || "").localeCompare(String(b.heading || "")));
}
function buildFilterMeta(cards) {
  const parentMap = /* @__PURE__ */ new Map();
  const categoryMap = /* @__PURE__ */ new Map();
  const brandMap = /* @__PURE__ */ new Map();
  const modelMap = /* @__PURE__ */ new Map();
  let minPrice = null;
  let maxPrice = null;
  for (const card of cards) {
    const parentKey = `${card.parent_category_id || "null"}::${card.parent_category_name || "Uncategorized"}`;
    if (!parentMap.has(parentKey)) parentMap.set(parentKey, { id: card.parent_category_id, name: card.parent_category_name || "Uncategorized", slug: card.parent_category_slug, count: 0 });
    parentMap.get(parentKey).count += 1;
    if (card.category_id || card.category_name) {
      const categoryKey = `${card.category_id || "null"}::${card.category_name || ""}`;
      if (!categoryMap.has(categoryKey)) categoryMap.set(categoryKey, { id: card.category_id, parent_id: card.parent_category_id, name: card.category_name, slug: card.category_slug, count: 0 });
      categoryMap.get(categoryKey).count += 1;
    }
    const brand = sanitize(card.brand || "");
    if (brand) {
      const key = toLower(brand);
      if (!brandMap.has(key)) brandMap.set(key, { value: brand, count: 0 });
      brandMap.get(key).count += 1;
    }
    const model = sanitize(card.model || card.mpn || "");
    if (model) {
      const key = toLower(model);
      if (!modelMap.has(key)) modelMap.set(key, { value: model, count: 0 });
      modelMap.get(key).count += 1;
    }
    const price = toNum(card.final_price);
    if (price > 0) {
      if (minPrice === null || price < minPrice) minPrice = price;
      if (maxPrice === null || price > maxPrice) maxPrice = price;
    }
  }
  const attrGroupMap = /* @__PURE__ */ new Map();
  for (const card of cards) {
    for (const attr of card.attributes || []) {
      const heading = sanitize(attr.attribute_name || "");
      const key = normalizeAttrKey(attr.attribute_slug || attr.key || heading);
      const value = sanitize(attr.attribute_value || "");
      if (!heading || !key || !value) continue;
      if (!attrGroupMap.has(key)) attrGroupMap.set(key, { heading, key, values: /* @__PURE__ */ new Map() });
      const entry = attrGroupMap.get(key);
      const valueKey = toLower(value);
      if (!entry.values.has(valueKey)) entry.values.set(valueKey, { value, count: 0 });
      entry.values.get(valueKey).count += 1;
    }
  }
  const attributes = Array.from(attrGroupMap.values()).map((g) => ({
    heading: g.heading,
    key: g.key,
    values: Array.from(g.values.values()).sort((a, b) => String(a.value || "").localeCompare(String(b.value || "")))
  })).sort((a, b) => String(a.heading || "").localeCompare(String(b.heading || "")));
  return {
    parent_categories: Array.from(parentMap.values()),
    categories: Array.from(categoryMap.values()),
    brands: Array.from(brandMap.values()),
    models: Array.from(modelMap.values()),
    attributes,
    price_range: { min: minPrice, max: maxPrice }
  };
}
async function getMenu() {
  const parents = await prisma.parentCategory.findMany({
    where: { status: true },
    orderBy: [{ displayOrder: "asc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      displayOrder: true,
      status: true,
      metaTitle: true,
      metaDescription: true,
      image: true,
      categories: {
        where: { status: true },
        orderBy: { id: "desc" },
        select: { id: true, name: true, slug: true }
      }
    }
  });
  return {
    parents: parents.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      display_order: p.displayOrder,
      status: p.status,
      meta_title: p.metaTitle,
      meta_description: p.metaDescription,
      image: p.image,
      children: p.categories
    }))
  };
}
async function getParentCategories() {
  return prisma.parentCategory.findMany({
    where: { status: true },
    orderBy: [{ displayOrder: "asc" }, { id: "desc" }],
    select: { id: true, name: true, slug: true, displayOrder: true, status: true, metaTitle: true, metaDescription: true, image: true }
  });
}
async function getCategories(parentId) {
  const where = { status: true };
  if (parentId) where.parentId = parentId;
  return prisma.category.findMany({
    where,
    orderBy: { id: "desc" },
    select: { id: true, parentId: true, name: true, slug: true, description: true, status: true, image: true }
  });
}
async function getShopListing(params, query, wishlistIds = [], cartQtyMap = /* @__PURE__ */ new Map()) {
  try {
    const scope = resolveRouteScope(params, query);
    const { where: variantWhere, scopeInfo } = await resolveScopeInfo(scope);
    const page = clamp(toNum(query.page, 1), 1, 1e6);
    const limit = clamp(toNum(query.limit, 24), 1, 1e3);
    const sort = String(query.sort || "latest");
    const search = String(query.search ?? query.q ?? "");
    const wishlistSet = new Set(wishlistIds.map(String));
    const variantRows = await fetchVariantRows(variantWhere, 1e4);
    const variantIds = variantRows.map((r) => r.id);
    const [attributeMap, mediaMap] = await Promise.all([
      fetchVariantAttributesMap(variantIds),
      fetchVariantMediaMap(variantIds)
    ]);
    const allCards = variantRows.map(
      (row) => buildVariantCard(
        { ...row, image: mediaMap.get(String(row.id)) || row.image || row.main_image || "" },
        wishlistSet,
        attributeMap,
        cartQtyMap
      )
    );
    const filterMetaBase = buildFilterMeta(allCards);
    const searchedCards = applySearchFilter(allCards, search);
    const filteredCards = applyFilters(searchedCards, query);
    const sortedCards = applySort(filteredCards, sort);
    const paged = paginate(sortedCards, page, limit);
    const grouped = groupByParentCategory(paged.items);
    const filterMetaCurrent = buildFilterMeta(filteredCards);
    return {
      success: true,
      scope: scopeInfo,
      filters: {
        ...filterMetaCurrent,
        base_price_range: filterMetaBase.price_range,
        selected: {
          parent_category_id: uniq(parseIntList(query.parent_category_id ?? query.parent_id).map(String)),
          category_id: uniq(parseIntList(query.category_id ?? query.subgroup_id).map(String)),
          brand: parseList(query.brand ?? query.brands),
          model: parseList(query.model ?? query.models),
          rating: parseList(query.rating ?? query.ratings),
          condition: parseList(query.condition ?? query.conditions),
          price_min: query.price_min !== void 0 ? safeFloat(query.price_min) : null,
          price_max: query.price_max !== void 0 ? safeFloat(query.price_max) : null,
          search,
          attributes: parseAttributeFilters(query),
          in_stock_only: parseBooleanQuery(query.in_stock_only, true),
          sort,
          page,
          limit
        }
      },
      pagination: { page: paged.page, limit: paged.limit, total: paged.total, total_pages: paged.total_pages },
      data: grouped,
      cards: paged.items,
      flat: paged.items
    };
  } catch (err) {
    console.error("Shop API Error:", err);
    return {
      success: false,
      scope: { scopeType: "shop", parentCategoryId: null, parentCategoryName: null, parentCategorySlug: null, categoryId: null, categoryName: null, categorySlug: null, subgroupId: null, subgroupName: null, subgroupSlug: null, productId: null, productName: null, productSlug: null },
      filters: { parent_categories: [], categories: [], brands: [], models: [], attributes: [], price_range: { min: null, max: null }, base_price_range: { min: null, max: null }, selected: {} },
      pagination: { page: 1, limit: 24, total: 0, total_pages: 1 },
      data: [],
      cards: [],
      flat: []
    };
  }
}
const STORAGE_RE = /\b(\d+(?:\.\d+)?\s?(?:gb|tb|mb|kb))\b/gi;
const RAM_RE = /\b(\d+\s?gb\s?ram|\d+\s?ram)\b/gi;
const COLOR_RE = /\b(black|white|silver|gray|grey|gold|blue|red|green|yellow|pink|purple|orange|graphite|space gray|midnight|starlight|natural titanium|blue titanium|black titanium|white titanium|desert titanium|pearl|beige|bronze|mint|lavender|sky blue)\b/gi;
const COMMON_VARIANT_RE = /\b(5g|4g|lte|wifi|dual sim|single sim|e-sim|esim|unlocked|global|international|new|used|refurbished|sealed)\b/gi;
const EXTRA_PUNCT_RE = /[|/,:;]+/g;
function deriveModelKey(text = "") {
  return sanitize(text).toLowerCase().replace(/\([^)]*\)/g, " ").replace(STORAGE_RE, " ").replace(RAM_RE, " ").replace(COLOR_RE, " ").replace(COMMON_VARIANT_RE, " ").replace(EXTRA_PUNCT_RE, " ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
function getModelKeyFromRow(row) {
  const source = row.displayName || row.name || row.product_name || "";
  return deriveModelKey(source);
}
function emptyDetailResponse(message) {
  return {
    success: false,
    message,
    product: null,
    variants: [],
    variantsForState: [],
    selectedVariant: null,
    selected_variant_id: null,
    gallery: [],
    relatedProducts: [],
    categoryProducts: [],
    related: [],
    frequentlyBoughtTogether: [],
    frequently_bought_together: [],
    customersAlsoViewed: [],
    alsoViewed: [],
    modelVariants: [],
    sameModelVariants: [],
    compareItems: [],
    breadcrumbs: []
  };
}
function buildProductPayload(rows, wishlistSet) {
  if (!rows.length) return null;
  const merged = rows[0];
  const lightweightVariants = rows.map((row) => ({
    id: String(row.id),
    name: sanitize(row.displayName || row.name || row.product_name),
    display_name: sanitize(row.displayName || ""),
    price: toNum(row.price),
    final_price: toNum(row.price),
    stock: row.stock,
    image: sanitize(row.image || row.main_image || ""),
    is_default: row.isDefault,
    is_active: row.isActive,
    sort_order: toNum(row.sortOrder)
  }));
  const variantStock = lightweightVariants.reduce((sum, v) => sum + v.stock, 0);
  const prices = lightweightVariants.map((v) => v.final_price).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  return {
    id: String(merged.productId),
    type: "product",
    name: sanitize(merged.product_name),
    slug: sanitize(merged.product_slug),
    product_type: sanitize(merged.product_type),
    brand: sanitize(merged.brand),
    mpn: sanitize(merged.mpn),
    bullets: sanitize(merged.bullets),
    description: sanitize(merged.description),
    short_description: sanitize(merged.short_description),
    parent_category_id: merged.parent_category_id,
    category_id: merged.category_id,
    category_name: sanitize(merged.category_name),
    category_slug: sanitize(merged.category_slug),
    parent_category_name: sanitize(merged.parent_category_name),
    parent_category_slug: sanitize(merged.parent_category_slug),
    visibility: sanitize(merged.visibility),
    meta_keywords: sanitize(merged.meta_keywords),
    meta_title: sanitize(merged.meta_title),
    meta_description: sanitize(merged.meta_description),
    main_image: sanitize(merged.main_image || ""),
    product_videos: merged.product_videos,
    display_locations: merged.display_locations,
    display_timing: merged.display_timing,
    created_at: merged.product_created_at,
    updated_at: merged.product_updated_at,
    variants_count: lightweightVariants.length,
    variant_stock: variantStock,
    stock_status: getStockStatus(variantStock, merged.lowStockThreshold),
    min_price: +minPrice.toFixed(2),
    is_fav: wishlistSet.has(String(merged.productId)),
    in_cart_qty: 0
  };
}
function buildBreadcrumbs(product, selectedVariant) {
  const crumbs = [{ label: "Home", href: "/" }];
  if (product?.category_id != null) crumbs.push({ label: String(product.category_name || "Category"), href: `/category/${product.category_id}` });
  if (product?.name) crumbs.push({ label: String(product.name), href: product?.slug ? `/product/${product.slug}` : "" });
  if (selectedVariant?.name && selectedVariant.name !== product?.name) crumbs.push({ label: selectedVariant.name, href: "" });
  return crumbs;
}
function dedupeCardsByKey(cards, keyFn) {
  const unique = [];
  const seen = /* @__PURE__ */ new Set();
  for (const card of cards) {
    const key = sanitize(keyFn(card));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}
async function getProductDetail(productIdParam, variantIdParam, wishlistIds = [], cartQtyMap = /* @__PURE__ */ new Map()) {
  if (productIdParam === null && variantIdParam === null) return emptyDetailResponse("Missing productId or variantId");
  let resolvedProductId = productIdParam;
  if (resolvedProductId === null && variantIdParam !== null) {
    const lookup = await prisma.productVariant.findUnique({ where: { id: variantIdParam }, select: { productId: true } });
    resolvedProductId = lookup?.productId ?? null;
  }
  if (resolvedProductId === null) return emptyDetailResponse("Product not found");
  const rows = await fetchVariantRows({ productId: resolvedProductId }, 1e3);
  if (!rows.length) return emptyDetailResponse("Product not found");
  const wishlistSet = new Set(wishlistIds.map(String));
  const variantIds = rows.map((r) => r.id);
  const [attributeMap, mediaMap, fullMediaMap] = await Promise.all([
    fetchVariantAttributesMap(variantIds),
    fetchVariantMediaMap(variantIds),
    fetchVariantFullMediaMap(variantIds)
  ]);
  const lightweightVariants = rows.map((row) => ({
    id: String(row.id),
    name: sanitize(row.displayName || row.name || row.product_name),
    display_name: sanitize(row.displayName || ""),
    price: toNum(row.price),
    final_price: computePrices(toNum(row.price), toNum(row.salePrice), row.discountType, row.discountValue != null ? toNum(row.discountValue) : null, toNum(row.vatRate), row.vatIncluded).finalPrice,
    stock: row.stock,
    image: sanitize(mediaMap.get(String(row.id)) || row.image || row.main_image || ""),
    is_default: row.isDefault,
    is_active: row.isActive,
    sort_order: toNum(row.sortOrder)
  }));
  const variants = rows.map((row) => {
    const card = buildVariantCard(
      { ...row, image: mediaMap.get(String(row.id)) || row.image || row.main_image || "" },
      wishlistSet,
      attributeMap,
      cartQtyMap
    );
    const mediaItems = fullMediaMap.get(String(row.id)) || [];
    card.variant_media = mediaItems;
    card.images = mediaItems.map((m) => m.url);
    return card;
  });
  if (variantIdParam !== null) {
    variants.sort((a, b) => {
      if (String(a.id) === String(variantIdParam)) return -1;
      if (String(b.id) === String(variantIdParam)) return 1;
      const aDef = variants.find((v) => v.id === a.id);
      const bDef = variants.find((v) => v.id === b.id);
      if (aDef && bDef) {
        const aDefault = rows.find((r) => r.id === Number(a.id))?.isDefault ? 0 : 1;
        const bDefault = rows.find((r) => r.id === Number(b.id))?.isDefault ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
      }
      return String(b.id).localeCompare(String(a.id));
    });
  }
  const product = buildProductPayload(rows, wishlistSet);
  const selectedVariant = variants.find((v) => variantIdParam !== null && String(v.id) === String(variantIdParam)) || variants.find((v) => rows.find((r) => r.id === Number(v.id))?.isDefault) || variants[0] || null;
  const categoryId = rows[0]?.category_id ?? null;
  const currentModelKey = getModelKeyFromRow(rows[0]);
  const [relatedProducts, sameModelVariants, frequentlyBoughtTogether, customersAlsoViewed, compareItems] = await Promise.all([
    // Related: same category, different product
    categoryId !== null ? (async () => {
      const relatedRows = await fetchVariantRows({ product: { categoryId, id: { not: resolvedProductId } } }, 48);
      const rIds = relatedRows.map((r) => r.id);
      const [rAttr, rMedia] = await Promise.all([fetchVariantAttributesMap(rIds), fetchVariantMediaMap(rIds)]);
      const cards = relatedRows.map((row) => buildVariantCard({ ...row, image: rMedia.get(String(row.id)) || row.image || row.main_image || "" }, wishlistSet, rAttr, cartQtyMap));
      return dedupeCardsByKey(cards, (c) => c.product_id).slice(0, 12);
    })() : Promise.resolve([]),
    // Model variants: same category + same model key
    categoryId !== null && currentModelKey ? (async () => {
      const modelRows = await fetchVariantRows({ product: { categoryId }, id: { not: variantIdParam ?? void 0 } }, 72);
      const filtered = modelRows.filter((row) => deriveModelKey(row.displayName || row.name || row.product_name) === currentModelKey);
      const mIds = filtered.map((r) => r.id);
      const [mAttr, mMedia] = await Promise.all([fetchVariantAttributesMap(mIds), fetchVariantMediaMap(mIds)]);
      const cards = filtered.map((row) => buildVariantCard({ ...row, image: mMedia.get(String(row.id)) || row.image || row.main_image || "" }, wishlistSet, mAttr, cartQtyMap));
      return dedupeCardsByKey(cards, (c) => c.variant_id).slice(0, 12);
    })() : Promise.resolve([]),
    // FBT: from product_frequently_bought_together, fallback cross_sells, fallback same category/brand
    (async () => {
      const pid = resolvedProductId;
      let fbtRows = await prisma.productFBT.findMany({ where: { productId: pid }, take: 8, orderBy: { score: "desc" } });
      let fbtProductIds = fbtRows.map((r) => r.relatedProductId);
      if (!fbtProductIds.length) {
        const crossRows = await prisma.productCrossSell.findMany({ where: { productId: pid }, take: 8, orderBy: { score: "desc" } });
        fbtProductIds = crossRows.map((r) => r.relatedProductId);
      }
      if (!fbtProductIds.length && categoryId !== null) {
        const fallbackRows = await fetchVariantRows({ product: { categoryId, id: { not: pid }, brand: rows[0]?.brand ? { equals: rows[0].brand } : void 0 } }, 36);
        const fIds = fallbackRows.map((r) => r.id);
        const [fAttr, fMedia] = await Promise.all([fetchVariantAttributesMap(fIds), fetchVariantMediaMap(fIds)]);
        const cards = fallbackRows.map((row) => buildVariantCard({ ...row, image: fMedia.get(String(row.id)) || row.image || row.main_image || "" }, wishlistSet, fAttr, cartQtyMap));
        return dedupeCardsByKey(cards, (c) => c.product_id).slice(0, 4);
      }
      if (fbtProductIds.length) {
        const fbtVariantRows = await fetchVariantRows({ productId: { in: fbtProductIds } }, 48);
        const fIds = fbtVariantRows.map((r) => r.id);
        const [fAttr, fMedia] = await Promise.all([fetchVariantAttributesMap(fIds), fetchVariantMediaMap(fIds)]);
        const cards = fbtVariantRows.map((row) => buildVariantCard({ ...row, image: fMedia.get(String(row.id)) || row.image || row.main_image || "" }, wishlistSet, fAttr, cartQtyMap));
        return dedupeCardsByKey(cards, (c) => c.product_id).slice(0, 4);
      }
      return [];
    })(),
    // Customers also viewed: same category, different brand
    categoryId !== null ? (async () => {
      const viewedRows = await fetchVariantRows({
        product: { categoryId, id: { not: resolvedProductId }, brand: rows[0]?.brand ? { not: rows[0].brand } : void 0 }
      }, 48);
      const vIds = viewedRows.map((r) => r.id);
      const [vAttr, vMedia] = await Promise.all([fetchVariantAttributesMap(vIds), fetchVariantMediaMap(vIds)]);
      const cards = viewedRows.map((row) => buildVariantCard({ ...row, image: vMedia.get(String(row.id)) || row.image || row.main_image || "" }, wishlistSet, vAttr, cartQtyMap));
      return dedupeCardsByKey(cards, (c) => c.product_id).slice(0, 8);
    })() : Promise.resolve([]),
    // Compare: same category, different product
    categoryId !== null ? (async () => {
      const compareRows = await fetchVariantRows({ product: { categoryId, id: { not: resolvedProductId } } }, 24);
      const cIds = compareRows.map((r) => r.id);
      const [cAttr, cMedia] = await Promise.all([fetchVariantAttributesMap(cIds), fetchVariantMediaMap(cIds)]);
      const cards = compareRows.map((row) => buildVariantCard({ ...row, image: cMedia.get(String(row.id)) || row.image || row.main_image || "" }, wishlistSet, cAttr, cartQtyMap));
      return dedupeCardsByKey(cards, (c) => c.product_id).slice(0, 4);
    })() : Promise.resolve([])
  ]);
  const gallery = selectedVariant ? lightweightVariants.find((v) => v.id === selectedVariant.id)?.image ? [lightweightVariants.find((v) => v.id === selectedVariant.id).image] : [] : [];
  return {
    success: true,
    message: "Product details loaded",
    product,
    variants,
    variantsForState: variants,
    selectedVariant,
    selected_variant_id: selectedVariant ? selectedVariant.id : null,
    gallery,
    relatedProducts,
    categoryProducts: relatedProducts,
    related: relatedProducts,
    frequentlyBoughtTogether,
    frequently_bought_together: frequentlyBoughtTogether,
    customersAlsoViewed,
    alsoViewed: customersAlsoViewed,
    modelVariants: sameModelVariants,
    sameModelVariants,
    compareItems,
    breadcrumbs: buildBreadcrumbs(product, selectedVariant)
  };
}
async function universalSearch(q) {
  const qRaw = sanitize(q);
  if (!qRaw) return { items: [] };
  const searchTerm = `%${qRaw}%`;
  const [parents, categories, products] = await Promise.all([
    prisma.parentCategory.findMany({
      where: { status: true, name: { contains: qRaw } },
      orderBy: { displayOrder: "asc" },
      take: 5,
      select: { id: true, name: true, slug: true }
    }),
    prisma.category.findMany({
      where: { status: true, name: { contains: qRaw } },
      orderBy: { name: "asc" },
      take: 5,
      select: { id: true, name: true, slug: true }
    }),
    prisma.product.findMany({
      where: { status: "published", OR: [{ name: { contains: qRaw } }, { brand: { contains: qRaw } }] },
      orderBy: { name: "asc" },
      take: 10,
      select: { id: true, name: true, slug: true, brand: true }
    })
  ]);
  const items = [
    ...parents.map((r) => ({ type: "parent", id: r.id, name: r.name || "Unknown", slug: r.slug || "", brand: null })),
    ...categories.map((r) => ({ type: "category", id: r.id, name: r.name || "Unknown", slug: r.slug || "", brand: null })),
    ...products.map((r) => ({ type: "product", id: r.id, name: r.name || r.brand || "Unknown", slug: r.slug || r.brand || "", brand: r.brand }))
  ];
  return { items: items.slice(0, 10) };
}
async function getVariantCards(limit = 100, inStockOnly = true, grouped = false) {
  const where = {};
  if (inStockOnly) where.stock = { gt: 0 };
  const rows = await fetchVariantRows(where, clamp(limit, 1, 1e3));
  const variantIds = rows.map((r) => r.id);
  const [attributeMap, mediaMap] = await Promise.all([
    fetchVariantAttributesMap(variantIds),
    fetchVariantMediaMap(variantIds)
  ]);
  const cards = rows.map(
    (row) => buildVariantCard({ ...row, image: mediaMap.get(String(row.id)) || row.image || row.main_image || "" }, /* @__PURE__ */ new Set(), attributeMap, /* @__PURE__ */ new Map())
  );
  if (grouped) {
    const groups = groupByParentCategory(cards);
    return { success: true, data: groups };
  }
  return { success: true, data: cards };
}
async function getRecentProducts(limit = 30, inStockOnly = true) {
  const clampedLimit = clamp(limit, 1, 100);
  const where = {};
  if (inStockOnly) where.stock = { gt: 0 };
  const rows = await fetchVariantRows(where, clampedLimit);
  const variantIds = rows.map((r) => r.id);
  const [attributeMap, mediaMap] = await Promise.all([
    fetchVariantAttributesMap(variantIds),
    fetchVariantMediaMap(variantIds)
  ]);
  const cards = rows.map(
    (row) => buildVariantCard({ ...row, image: mediaMap.get(String(row.id)) || row.image || row.main_image || "" }, /* @__PURE__ */ new Set(), attributeMap, /* @__PURE__ */ new Map())
  );
  cards.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta || String(a.id).localeCompare(String(b.id));
  });
  return { success: true, data: cards.slice(0, clampedLimit) };
}
async function getFrequentProducts(limit = 30) {
  const clampedLimit = clamp(limit, 1, 100);
  const topProducts = await prisma.$queryRaw`
    SELECT product_id, SUM(quantity) AS total_qty
    FROM cart
    GROUP BY product_id
    ORDER BY total_qty DESC
    LIMIT ${clampedLimit}
  `;
  if (!topProducts.length) return { success: true, data: [] };
  const cards = [];
  for (const tp of topProducts) {
    const variantRow = await prisma.productVariant.findFirst({
      where: { productId: tp.product_id },
      include: {
        product: { include: { parentCategory: true, category: true } },
        media: { orderBy: { id: "desc" }, take: 1 }
      },
      orderBy: { isDefault: "desc" }
    });
    if (!variantRow) continue;
    const p = variantRow.product;
    const variantData = {
      id: variantRow.id,
      productId: variantRow.productId,
      name: variantRow.name,
      displayName: variantRow.displayName,
      sku: variantRow.sku,
      price: variantRow.price,
      salePrice: variantRow.salePrice,
      costPrice: variantRow.costPrice,
      stock: variantRow.stock,
      lowStockThreshold: variantRow.lowStockThreshold,
      trackInventory: variantRow.trackInventory,
      allowBackorders: variantRow.allowBackorders,
      discountType: variantRow.discountType,
      discountValue: variantRow.discountValue,
      vatRate: variantRow.vatRate,
      vatIncluded: variantRow.vatIncluded,
      barcode: variantRow.barcode,
      barcodeType: variantRow.barcodeType,
      weight: variantRow.weight,
      weightUnit: variantRow.weightUnit,
      length: variantRow.length,
      width: variantRow.width,
      height: variantRow.height,
      dimensionUnit: variantRow.dimensionUnit,
      shippingClass: variantRow.shippingClass,
      isActive: variantRow.isActive,
      isDefault: variantRow.isDefault,
      sortOrder: variantRow.sortOrder,
      createdAt: variantRow.createdAt,
      updatedAt: variantRow.updatedAt,
      product_name: p.name,
      product_slug: p.slug,
      master_product_code: p.productId,
      product_type: p.productType,
      brand: p.brand,
      mpn: p.mpn,
      bullets: p.bullets,
      description: p.description,
      short_description: p.shortDescription,
      visibility: p.visibility,
      meta_keywords: p.metaKeywords,
      meta_title: p.metaTitle,
      meta_description: p.metaDescription,
      main_image: p.mainImage,
      product_videos: p.productVideos,
      display_locations: p.displayLocations,
      display_timing: p.displayTiming,
      product_created_at: p.createdAt,
      product_updated_at: p.updatedAt,
      parent_category_id: p.parentCategoryId,
      parent_category_name: p.parentCategory?.name ?? "Uncategorized",
      parent_category_slug: p.parentCategory?.slug ?? "",
      category_id: p.categoryId,
      category_name: p.category?.name ?? "",
      category_slug: p.category?.slug ?? "",
      category_parent_id: p.category?.parentId ?? null,
      image: variantRow.media[0]?.filename ?? p.mainImage ?? null
    };
    const card = buildVariantCard(variantData, /* @__PURE__ */ new Set(), /* @__PURE__ */ new Map(), /* @__PURE__ */ new Map());
    card.total_ordered_quantity = Number(tp.total_qty);
    cards.push(card);
  }
  return { success: true, data: cards.slice(0, clampedLimit) };
}
async function getFiltersForScope(params, query) {
  const scope = resolveRouteScope(params, query);
  const shopData = await getShopListing(params, { ...query, limit: 1e4, page: 1 }, [], /* @__PURE__ */ new Map());
  return { success: true, attributes: shopData.filters.attributes };
}
export {
  applyFilters,
  getCategories,
  getFiltersForScope,
  getFrequentProducts,
  getMenu,
  getParentCategories,
  getProductDetail,
  getRecentProducts,
  getShopListing,
  getVariantCards,
  universalSearch
};
