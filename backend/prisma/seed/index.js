import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  console.log("Seeding database...");
  const electronics = await prisma.parentCategory.upsert({
    where: { slug: "electronics" },
    update: {},
    create: {
      name: "Electronics",
      slug: "electronics",
      displayOrder: 1,
      status: true,
      metaTitle: "Electronics | Jood",
      metaDescription: "Browse our range of electronics"
    }
  });
  const fashion = await prisma.parentCategory.upsert({
    where: { slug: "fashion" },
    update: {},
    create: {
      name: "Fashion",
      slug: "fashion",
      displayOrder: 2,
      status: true,
      metaTitle: "Fashion | Jood",
      metaDescription: "Latest fashion trends"
    }
  });
  const homeGarden = await prisma.parentCategory.upsert({
    where: { slug: "home-garden" },
    update: {},
    create: {
      name: "Home & Garden",
      slug: "home-garden",
      displayOrder: 3,
      status: true
    }
  });
  const smartphones = await prisma.category.upsert({
    where: { slug: "smartphones" },
    update: {},
    create: {
      parentId: electronics.id,
      name: "Smartphones",
      slug: "smartphones",
      description: "Latest smartphones from top brands",
      status: true
    }
  });
  const laptops = await prisma.category.upsert({
    where: { slug: "laptops" },
    update: {},
    create: {
      parentId: electronics.id,
      name: "Laptops",
      slug: "laptops",
      description: "Laptops for work and play",
      status: true
    }
  });
  const mensWear = await prisma.category.upsert({
    where: { slug: "mens-wear" },
    update: {},
    create: {
      parentId: fashion.id,
      name: "Men's Wear",
      slug: "mens-wear",
      status: true
    }
  });
  const kitchen = await prisma.category.upsert({
    where: { slug: "kitchen" },
    update: {},
    create: {
      parentId: homeGarden.id,
      name: "Kitchen",
      slug: "kitchen",
      status: true
    }
  });
  const colorAttr = await prisma.attribute.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Color", slug: "color", scopeType: "variant" }
  });
  const sizeAttr = await prisma.attribute.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: "Size", slug: "size", scopeType: "variant" }
  });
  const ramAttr = await prisma.attribute.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, name: "RAM", slug: "ram", scopeType: "variant" }
  });
  const storageAttr = await prisma.attribute.upsert({
    where: { id: 4 },
    update: {},
    create: { id: 4, name: "Storage", slug: "storage", scopeType: "variant" }
  });
  const colorBlack = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: colorAttr.id, value: "Black" } },
    update: {},
    create: { attributeId: colorAttr.id, value: "Black", slug: "black", sortOrder: 1 }
  });
  const colorWhite = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: colorAttr.id, value: "White" } },
    update: {},
    create: { attributeId: colorAttr.id, value: "White", slug: "white", sortOrder: 2 }
  });
  const colorBlue = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: colorAttr.id, value: "Blue" } },
    update: {},
    create: { attributeId: colorAttr.id, value: "Blue", slug: "blue", sortOrder: 3 }
  });
  const sizeM = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: sizeAttr.id, value: "M" } },
    update: {},
    create: { attributeId: sizeAttr.id, value: "M", slug: "m", sortOrder: 1 }
  });
  const sizeL = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: sizeAttr.id, value: "L" } },
    update: {},
    create: { attributeId: sizeAttr.id, value: "L", slug: "l", sortOrder: 2 }
  });
  const ram8 = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: ramAttr.id, value: "8GB" } },
    update: {},
    create: { attributeId: ramAttr.id, value: "8GB", slug: "8gb", sortOrder: 1 }
  });
  const ram12 = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: ramAttr.id, value: "12GB" } },
    update: {},
    create: { attributeId: ramAttr.id, value: "12GB", slug: "12gb", sortOrder: 2 }
  });
  const storage128 = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: storageAttr.id, value: "128GB" } },
    update: {},
    create: { attributeId: storageAttr.id, value: "128GB", slug: "128gb", sortOrder: 1 }
  });
  const storage256 = await prisma.attributeValue.upsert({
    where: { attributeId_value: { attributeId: storageAttr.id, value: "256GB" } },
    update: {},
    create: { attributeId: storageAttr.id, value: "256GB", slug: "256gb", sortOrder: 2 }
  });
  const galaxyS24 = await prisma.product.upsert({
    where: { slug: "samsung-galaxy-s24" },
    update: {},
    create: {
      productId: "PROD-20260901-00000001",
      name: "Samsung Galaxy S24",
      slug: "samsung-galaxy-s24",
      productType: "simple",
      brand: "Samsung",
      mpn: "SM-S921B",
      bullets: '6.2" Dynamic AMOLED 2X | 50MP Camera | Snapdragon 8 Gen 3',
      description: "Samsung Galaxy S24 \u2014 AI-powered smartphone with stunning display and pro-grade camera.",
      shortDescription: "Flagship Samsung smartphone with AI features",
      parentCategoryId: electronics.id,
      categoryId: smartphones.id,
      visibility: "visible",
      status: "published",
      mainImage: "/uploads/products/galaxy-s24-main.jpg"
    }
  });
  const galaxyVariant1 = await prisma.productVariant.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      productId: galaxyS24.id,
      name: "128GB Black",
      displayName: "Samsung Galaxy S24 \u2014 128GB Black",
      sku: "SAM-S24-128-BLK",
      price: 3199,
      stock: 50,
      lowStockThreshold: 5,
      discountType: "percent",
      discountValue: 10,
      vatRate: 5,
      vatIncluded: true,
      isActive: true,
      isDefault: true,
      sortOrder: 1
    }
  });
  const galaxyVariant2 = await prisma.productVariant.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      productId: galaxyS24.id,
      name: "256GB Blue",
      displayName: "Samsung Galaxy S24 \u2014 256GB Blue",
      sku: "SAM-S24-256-BLU",
      price: 3799,
      salePrice: 3499,
      stock: 30,
      lowStockThreshold: 5,
      vatRate: 5,
      vatIncluded: true,
      isActive: true,
      isDefault: false,
      sortOrder: 2
    }
  });
  await prisma.variantMedia.createMany({
    data: [
      { variantId: 1, filename: "galaxy-s24-128blk-main.jpg", originalname: "main.jpg", mimetype: "image/jpeg", size: 245e3 },
      { variantId: 1, filename: "galaxy-s24-128blk-back.jpg", originalname: "back.jpg", mimetype: "image/jpeg", size: 198e3 },
      { variantId: 2, filename: "galaxy-s24-256blu-main.jpg", originalname: "main.jpg", mimetype: "image/jpeg", size: 251e3 }
    ],
    skipDuplicates: true
  });
  await prisma.productVariantAttribute.createMany({
    data: [
      { variantId: 1, attributeId: colorAttr.id, attributeValueId: colorBlack.id },
      { variantId: 1, attributeId: ramAttr.id, attributeValueId: ram8.id },
      { variantId: 1, attributeId: storageAttr.id, attributeValueId: storage128.id },
      { variantId: 2, attributeId: colorAttr.id, attributeValueId: colorBlue.id },
      { variantId: 2, attributeId: ramAttr.id, attributeValueId: ram12.id },
      { variantId: 2, attributeId: storageAttr.id, attributeValueId: storage256.id }
    ],
    skipDuplicates: true
  });
  const macbookPro = await prisma.product.upsert({
    where: { slug: "macbook-pro-14" },
    update: {},
    create: {
      productId: "PROD-20260901-00000002",
      name: 'MacBook Pro 14"',
      slug: "macbook-pro-14",
      productType: "simple",
      brand: "Apple",
      mpn: "MPHH3LL/A",
      bullets: "M3 Pro chip | 18GB RAM | 512GB SSD | Liquid Retina XDR",
      description: "Apple MacBook Pro 14-inch with M3 Pro \u2014 blazing performance for pros.",
      shortDescription: "Apple M3 Pro laptop",
      parentCategoryId: electronics.id,
      categoryId: laptops.id,
      mainImage: "/uploads/products/macbook-pro-14-main.jpg"
    }
  });
  const macbookVariant = await prisma.productVariant.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      productId: macbookPro.id,
      name: "18GB / 512GB",
      displayName: 'MacBook Pro 14" \u2014 18GB / 512GB',
      sku: "APL-MBP14-18-512",
      price: 7499,
      stock: 20,
      vatRate: 5,
      vatIncluded: true,
      isActive: true,
      isDefault: true,
      sortOrder: 1
    }
  });
  await prisma.variantMedia.createMany({
    data: [
      { variantId: 3, filename: "macbook-pro-14-main.jpg", originalname: "main.jpg", mimetype: "image/jpeg", size: 31e4 }
    ],
    skipDuplicates: true
  });
  const cottonTee = await prisma.product.upsert({
    where: { slug: "premium-cotton-tee" },
    update: {},
    create: {
      productId: "PROD-20260901-00000003",
      name: "Premium Cotton T-Shirt",
      slug: "premium-cotton-tee",
      productType: "simple",
      brand: "Jood Basics",
      bullets: "100% Organic Cotton | Relaxed Fit | Pre-shrunk",
      description: "Soft premium cotton tee, available in multiple colors and sizes.",
      shortDescription: "Organic cotton t-shirt",
      parentCategoryId: fashion.id,
      categoryId: mensWear.id,
      mainImage: "/uploads/products/cotton-tee-main.jpg"
    }
  });
  const teeVariantM = await prisma.productVariant.upsert({
    where: { id: 4 },
    update: {},
    create: {
      id: 4,
      productId: cottonTee.id,
      name: "Black / M",
      displayName: "Premium Cotton T-Shirt \u2014 Black / M",
      sku: "JWD-TEE-BLK-M",
      price: 89,
      stock: 120,
      discountType: "fixed",
      discountValue: 15,
      vatRate: 5,
      vatIncluded: true,
      isActive: true,
      isDefault: true,
      sortOrder: 1
    }
  });
  const teeVariantL = await prisma.productVariant.upsert({
    where: { id: 5 },
    update: {},
    create: {
      id: 5,
      productId: cottonTee.id,
      name: "White / L",
      displayName: "Premium Cotton T-Shirt \u2014 White / L",
      sku: "JWD-TEE-WHT-L",
      price: 89,
      stock: 95,
      vatRate: 5,
      vatIncluded: true,
      isActive: true,
      isDefault: false,
      sortOrder: 2
    }
  });
  await prisma.variantMedia.createMany({
    data: [
      { variantId: 4, filename: "cotton-tee-blk-main.jpg", originalname: "main.jpg", mimetype: "image/jpeg", size: 18e4 },
      { variantId: 5, filename: "cotton-tee-wht-main.jpg", originalname: "main.jpg", mimetype: "image/jpeg", size: 175e3 }
    ],
    skipDuplicates: true
  });
  await prisma.productVariantAttribute.createMany({
    data: [
      { variantId: 4, attributeId: colorAttr.id, attributeValueId: colorBlack.id },
      { variantId: 4, attributeId: sizeAttr.id, attributeValueId: sizeM.id },
      { variantId: 5, attributeId: colorAttr.id, attributeValueId: colorWhite.id },
      { variantId: 5, attributeId: sizeAttr.id, attributeValueId: sizeL.id }
    ],
    skipDuplicates: true
  });
  const airFryer = await prisma.product.upsert({
    where: { slug: "digital-air-fryer-5l" },
    update: {},
    create: {
      productId: "PROD-20260901-00000004",
      name: "Digital Air Fryer 5L",
      slug: "digital-air-fryer-5l",
      productType: "simple",
      brand: "KitchenPro",
      bullets: "5L Capacity | 1700W | 8 Preset Programs | Digital Touchscreen",
      description: "Healthier frying with rapid air technology. 5L family size.",
      shortDescription: "5L digital air fryer",
      parentCategoryId: homeGarden.id,
      categoryId: kitchen.id,
      mainImage: "/uploads/products/air-fryer-main.jpg"
    }
  });
  await prisma.productVariant.upsert({
    where: { id: 6 },
    update: {},
    create: {
      id: 6,
      productId: airFryer.id,
      name: "Black",
      displayName: "Digital Air Fryer 5L \u2014 Black",
      sku: "KP-AF5L-BLK",
      price: 349,
      stock: 40,
      discountType: "percentage",
      discountValue: 15,
      vatRate: 5,
      vatIncluded: true,
      isActive: true,
      isDefault: true,
      sortOrder: 1
    }
  });
  const passwordHash = await bcrypt.hash("Admin@12345", 12);
  const customerHash = await bcrypt.hash("Customer@12345", 12);
  const masterAdmin = await prisma.adminAccount.upsert({
    where: { email: "admin@jood.com" },
    update: {},
    create: {
      adminId: "ADM-MASTER-001",
      fullName: "Jood Admin",
      email: "admin@jood.com",
      phone: "+971500000000",
      password: passwordHash,
      role: "master_admin",
      status: "active",
      emailVerified: true,
      sessionVersion: 1
    }
  });
  const testCustomer = await prisma.customerAccount.upsert({
    where: { email: "customer@jood.com" },
    update: {},
    create: {
      userId: "CUST-20260901-00000001",
      fullName: "Test Customer",
      email: "customer@jood.com",
      phone: "+971500000001",
      passwordHash: customerHash,
      provider: "local",
      status: "active",
      emailVerified: true,
      sessionVersion: 1
    }
  });
  await prisma.productCrossSell.createMany({
    data: [
      { productId: galaxyS24.id, relatedProductId: macbookPro.id, score: 0.8 },
      { productId: macbookPro.id, relatedProductId: galaxyS24.id, score: 0.7 }
    ],
    skipDuplicates: true
  });
  await prisma.productFBT.createMany({
    data: [
      { productId: cottonTee.id, relatedProductId: airFryer.id, score: 0.3 }
    ],
    skipDuplicates: true
  });
  console.log("Seed complete.");
  console.log("  Master admin: admin@jood.com / Admin@12345");
  console.log("  Customer:     customer@jood.com / Customer@12345");
  console.log(`  Categories:   ${electronics.name}, ${fashion.name}, ${homeGarden.name}`);
  console.log(`  Products:     ${galaxyS24.name}, ${macbookPro.name}, ${cottonTee.name}, ${airFryer.name}`);
}
main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
