import type { VariantCard } from './types';

/* ------------------------------------------------------------------ */
/*  Static categories                                                  */
/* ------------------------------------------------------------------ */
export interface StaticCategory {
  id: number;
  name: string;
  slug: string;
  image: string;
  children?: StaticSubcategory[];
}

export interface StaticSubcategory {
  name: string;
  slug: string;
  children?: StaticSubcategory[];
}

export const STATIC_CATEGORIES: StaticCategory[] = [
  {
    id: 1,
    name: 'Fashion & Garments',
    slug: 'fashion-garments',
    image: '/product/large-size/1.jpg',
    children: [
      {
        name: "Men's Fashion",
        slug: 'fashion-garments/mens-fashion',
        children: [
          { name: 'Kandura', slug: 'fashion-garments/mens-fashion/kandura' },
          { name: 'T-Shirts', slug: 'fashion-garments/mens-fashion/t-shirts' },
          { name: 'Polo Shirts', slug: 'fashion-garments/mens-fashion/polo-shirts' },
          { name: 'Shirts', slug: 'fashion-garments/mens-fashion/shirts' },
          { name: 'Pants & Trousers', slug: 'fashion-garments/mens-fashion/pants-trousers' },
          { name: 'Jackets', slug: 'fashion-garments/mens-fashion/jackets' },
          { name: 'Sportswear', slug: 'fashion-garments/mens-fashion/sportswear' },
          { name: 'Undergarments', slug: 'fashion-garments/mens-fashion/undergarments' },
        ],
      },
      {
        name: "Women's Fashion",
        slug: 'fashion-garments/womens-fashion',
        children: [
          { name: 'Abayas', slug: 'fashion-garments/womens-fashion/abayas' },
          { name: 'Jalabiyas', slug: 'fashion-garments/womens-fashion/jalabiyas' },
          { name: 'Dresses', slug: 'fashion-garments/womens-fashion/dresses' },
          { name: 'Tops & Tunics', slug: 'fashion-garments/womens-fashion/tops-tunics' },
          { name: 'Modest Wear', slug: 'fashion-garments/womens-fashion/modest-wear' },
          { name: 'Sportswear', slug: 'fashion-garments/womens-fashion/sportswear' },
          { name: 'Undergarments', slug: 'fashion-garments/womens-fashion/undergarments' },
        ],
      },
      {
        name: 'Kids Fashion',
        slug: 'fashion-garments/kids-fashion',
        children: [
          { name: 'Boys Clothing', slug: 'fashion-garments/kids-fashion/boys-clothing' },
          { name: 'Girls Clothing', slug: 'fashion-garments/kids-fashion/girls-clothing' },
          { name: 'Newborn Essentials', slug: 'fashion-garments/kids-fashion/newborn-essentials' },
          { name: 'School Wear', slug: 'fashion-garments/kids-fashion/school-wear' },
        ],
      },
      {
        name: 'Fashion Accessories',
        slug: 'fashion-garments/fashion-accessories',
        children: [
          { name: 'Scarves & Hijabs', slug: 'fashion-garments/fashion-accessories/scarves-hijabs' },
          { name: 'Handbags', slug: 'fashion-garments/fashion-accessories/handbags' },
          { name: 'Wallets', slug: 'fashion-garments/fashion-accessories/wallets' },
          { name: 'Belts', slug: 'fashion-garments/fashion-accessories/belts' },
          { name: 'Sunglasses', slug: 'fashion-garments/fashion-accessories/sunglasses' },
          { name: 'Watches', slug: 'fashion-garments/fashion-accessories/watches' },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Footwear',
    slug: 'footwear',
    image: '/product/large-size/2.jpg',
    children: [
      {
        name: "Men's Footwear",
        slug: 'footwear/mens-footwear',
        children: [
          { name: 'Sandals', slug: 'footwear/mens-footwear/sandals' },
          { name: 'Formal Shoes', slug: 'footwear/mens-footwear/formal-shoes' },
          { name: 'Casual Shoes', slug: 'footwear/mens-footwear/casual-shoes' },
          { name: 'Sports Shoes', slug: 'footwear/mens-footwear/sports-shoes' },
          { name: 'Slippers', slug: 'footwear/mens-footwear/slippers' },
        ],
      },
      {
        name: "Women's Footwear",
        slug: 'footwear/womens-footwear',
        children: [
          { name: 'Sandals', slug: 'footwear/womens-footwear/sandals' },
          { name: 'Heels', slug: 'footwear/womens-footwear/heels' },
          { name: 'Flats', slug: 'footwear/womens-footwear/flats' },
          { name: 'Sports Shoes', slug: 'footwear/womens-footwear/sports-shoes' },
          { name: 'Slippers', slug: 'footwear/womens-footwear/slippers' },
        ],
      },
      {
        name: "Kids Footwear",
        slug: 'footwear/kids-footwear',
        children: [
          { name: 'School Shoes', slug: 'footwear/kids-footwear/school-shoes' },
          { name: 'Casual Shoes', slug: 'footwear/kids-footwear/casual-shoes' },
          { name: 'Sandals', slug: 'footwear/kids-footwear/sandals' },
        ],
      },
    ],
  },
  {
    id: 3,
    name: 'Home Décor',
    slug: 'home-decor',
    image: '/product/large-size/3.jpg',
    children: [
      {
        name: 'Wall Décor',
        slug: 'home-decor/wall-decor',
        children: [
          { name: 'Islamic Wall Art', slug: 'home-decor/wall-decor/islamic-wall-art' },
          { name: 'Paintings', slug: 'home-decor/wall-decor/paintings' },
          { name: 'Decorative Frames', slug: 'home-decor/wall-decor/decorative-frames' },
          { name: 'Wall Clocks', slug: 'home-decor/wall-decor/wall-clocks' },
        ],
      },
      {
        name: 'Living Room Décor',
        slug: 'home-decor/living-room-decor',
        children: [
          { name: 'Cushions', slug: 'home-decor/living-room-decor/cushions' },
          { name: 'Throws', slug: 'home-decor/living-room-decor/throws' },
          { name: 'Decorative Items', slug: 'home-decor/living-room-decor/decorative-items' },
          { name: 'Artificial Plants', slug: 'home-decor/living-room-decor/artificial-plants' },
        ],
      },
      {
        name: 'Lighting',
        slug: 'home-decor/lighting',
        children: [
          { name: 'Table Lamps', slug: 'home-decor/lighting/table-lamps' },
          { name: 'Floor Lamps', slug: 'home-decor/lighting/floor-lamps' },
          { name: 'Decorative Lights', slug: 'home-decor/lighting/decorative-lights' },
          { name: 'Lanterns', slug: 'home-decor/lighting/lanterns' },
        ],
      },
      {
        name: 'Home Fragrance',
        slug: 'home-decor/home-fragrance',
        children: [
          { name: 'Bakhoor', slug: 'home-decor/home-fragrance/bakhoor' },
          { name: 'Incense Holders', slug: 'home-decor/home-fragrance/incense-holders' },
          { name: 'Air Fresheners', slug: 'home-decor/home-fragrance/air-fresheners' },
          { name: 'Essential Oils', slug: 'home-decor/home-fragrance/essential-oils' },
        ],
      },
      {
        name: 'Islamic Décor',
        slug: 'home-decor/islamic-decor',
        children: [
          { name: 'Quran Stands', slug: 'home-decor/islamic-decor/quran-stands' },
          { name: 'Calligraphy Art', slug: 'home-decor/islamic-decor/calligraphy-art' },
          { name: 'Decorative Lanterns', slug: 'home-decor/islamic-decor/decorative-lanterns' },
          { name: 'Ramadan Decorations', slug: 'home-decor/islamic-decor/ramadan-decorations' },
        ],
      },
    ],
  },
  {
    id: 4,
    name: 'Home Appliances',
    slug: 'home-appliances',
    image: '/product/large-size/4.jpg',
    children: [
      {
        name: 'Kitchen Appliances',
        slug: 'home-appliances/kitchen-appliances',
        children: [
          { name: 'Air Fryers', slug: 'home-appliances/kitchen-appliances/air-fryers' },
          { name: 'Blenders', slug: 'home-appliances/kitchen-appliances/blenders' },
          { name: 'Coffee Machines', slug: 'home-appliances/kitchen-appliances/coffee-machines' },
          { name: 'Mixers', slug: 'home-appliances/kitchen-appliances/mixers' },
          { name: 'Electric Kettles', slug: 'home-appliances/kitchen-appliances/electric-kettles' },
        ],
      },
      {
        name: 'Home Cleaning Appliances',
        slug: 'home-appliances/home-cleaning-appliances',
        children: [
          { name: 'Vacuum Cleaners', slug: 'home-appliances/home-cleaning-appliances/vacuum-cleaners' },
          { name: 'Steam Cleaners', slug: 'home-appliances/home-cleaning-appliances/steam-cleaners' },
          { name: 'Robot Vacuums', slug: 'home-appliances/home-cleaning-appliances/robot-vacuums' },
        ],
      },
      {
        name: 'Personal Care Appliances',
        slug: 'home-appliances/personal-care-appliances',
        children: [
          { name: 'Hair Dryers', slug: 'home-appliances/personal-care-appliances/hair-dryers' },
          { name: 'Trimmers', slug: 'home-appliances/personal-care-appliances/trimmers' },
          { name: 'Grooming Kits', slug: 'home-appliances/personal-care-appliances/grooming-kits' },
        ],
      },
      {
        name: 'Cooling & Comfort',
        slug: 'home-appliances/cooling-comfort',
        children: [
          { name: 'Fans', slug: 'home-appliances/cooling-comfort/fans' },
          { name: 'Air Coolers', slug: 'home-appliances/cooling-comfort/air-coolers' },
          { name: 'Humidifiers', slug: 'home-appliances/cooling-comfort/humidifiers' },
        ],
      },
    ],
  },
  {
    id: 5,
    name: 'Healthy Products',
    slug: 'healthy-products',
    image: '/product/large-size/5.jpg',
    children: [],
  },
  {
    id: 6,
    name: 'Occasions & Islamic Gifts',
    slug: 'occasions-islamic-gifts',
    image: '/product/large-size/6.jpg',
    children: [
      {
        name: 'Prayer Essentials',
        slug: 'occasions-islamic-gifts/prayer-essentials',
        children: [
          { name: 'Prayer Mats', slug: 'occasions-islamic-gifts/prayer-essentials/prayer-mats' },
          { name: 'Tasbeeh', slug: 'occasions-islamic-gifts/prayer-essentials/tasbeeh' },
          { name: 'Quran', slug: 'occasions-islamic-gifts/prayer-essentials/quran' },
          { name: 'Quran Holders', slug: 'occasions-islamic-gifts/prayer-essentials/quran-holders' },
        ],
      },
      {
        name: 'Islamic Gifts',
        slug: 'occasions-islamic-gifts/islamic-gifts',
        children: [
          { name: 'Gift Sets', slug: 'occasions-islamic-gifts/islamic-gifts/gift-sets' },
          { name: 'Islamic Décor', slug: 'occasions-islamic-gifts/islamic-gifts/islamic-decor' },
          { name: 'Ramadan Gifts', slug: 'occasions-islamic-gifts/islamic-gifts/ramadan-gifts' },
          { name: 'Eid Gifts', slug: 'occasions-islamic-gifts/islamic-gifts/eid-gifts' },
        ],
      },
      {
        name: 'National Day Collection',
        slug: 'occasions-islamic-gifts/national-day-collection',
        children: [
          { name: 'UAE Flags', slug: 'occasions-islamic-gifts/national-day-collection/uae-flags' },
          { name: 'Car Flags', slug: 'occasions-islamic-gifts/national-day-collection/car-flags' },
          { name: 'Hand Flags', slug: 'occasions-islamic-gifts/national-day-collection/hand-flags' },
          { name: 'Decorative Flags', slug: 'occasions-islamic-gifts/national-day-collection/decorative-flags' },
        ],
      },
      {
        name: 'Ramadan & Eid',
        slug: 'occasions-islamic-gifts/ramadan-eid',
        children: [
          { name: 'Ramadan Decorations', slug: 'occasions-islamic-gifts/ramadan-eid/ramadan-decorations' },
          { name: 'Lanterns', slug: 'occasions-islamic-gifts/ramadan-eid/lanterns' },
          { name: 'Gift Boxes', slug: 'occasions-islamic-gifts/ramadan-eid/gift-boxes' },
          { name: 'Party Supplies', slug: 'occasions-islamic-gifts/ramadan-eid/party-supplies' },
        ],
      },
      {
        name: 'Hajj & Umrah Essentials',
        slug: 'occasions-islamic-gifts/hajj-umrah-essentials',
        children: [
          { name: 'Ihram', slug: 'occasions-islamic-gifts/hajj-umrah-essentials/ihram' },
          { name: 'Travel Prayer Mats', slug: 'occasions-islamic-gifts/hajj-umrah-essentials/travel-prayer-mats' },
          { name: 'Tasbeeh', slug: 'occasions-islamic-gifts/hajj-umrah-essentials/tasbeeh' },
          { name: 'Zamzam Accessories', slug: 'occasions-islamic-gifts/hajj-umrah-essentials/zamzam-accessories' },
        ],
      },
    ],
  },
  {
    id: 7,
    name: 'Fish & Seafood',
    slug: 'fish-seafood',
    image: '/product/large-size/7.jpg',
    children: [],
  },
  {
    id: 8,
    name: 'Dairy Products',
    slug: 'dairy-products',
    image: '/product/large-size/8.jpg',
    children: [],
  },
  {
    id: 9,
    name: 'Sweets & Desserts',
    slug: 'sweets-desserts',
    image: '/product/large-size/9.jpg',
    children: [],
  },
];

/* ------------------------------------------------------------------ */
/*  Static hero banners (carousel slides)                              */
/* ------------------------------------------------------------------ */
export const STATIC_BANNERS = [
  {
    id: 1,
    image: '/slider/1.jpg?v=3',
    title: 'New Season Collection',
    subtitle: 'Discover the latest trends — up to 40% off',
    cta: 'Shop Now',
    href: '/shop',
  },
  {
    id: 2,
    image: '/slider/2.jpg?v=3',
    title: 'Electronics Mega Sale',
    subtitle: 'Top brands at unbeatable prices',
    cta: 'Explore Deals',
    href: '/shop/fashion-garments',
  },
  {
    id: 3,
    image: '/slider/3.jpg?v=3',
    title: 'Free Delivery Weekend',
    subtitle: 'On all orders over AED 200',
    cta: 'Start Shopping',
    href: '/shop',
  },
  {
    id: 4,
    image: '/slider/4.jpg',
    title: 'Home & Kitchen Essentials',
    subtitle: 'Upgrade your space for less',
    cta: 'Browse Collection',
    href: '/shop/home-decor',
  },
];

/* ------------------------------------------------------------------ */
/*  Static products (matches VariantCard shape)                        */
/* ------------------------------------------------------------------ */
function makeVariantCard(overrides: Partial<VariantCard> & { id: string; product_id: string; variant_id: string; product_name: string }): VariantCard {
  const price = Number(overrides.final_price ?? '99.00');
  const orig = Number(overrides.original_price ?? overrides.final_price ?? '99.00');
  const discount = orig > price ? Math.round(((orig - price) / orig) * 100) : 0;
  const stock = overrides.stock ?? 25;

  return {
    cart_key: `${overrides.product_id}_${overrides.variant_id}`,
    type: 'simple',
    scope_type: 'variant',
    master_id: overrides.product_id,
    wishlist_id: overrides.product_id,
    name: overrides.product_name,
    slug: overrides.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    product_slug: overrides.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    master_product_code: `PROD-${overrides.product_id}`,
    original_price: String(orig),
    sale_price: discount > 0 ? String(price) : '0',
    final_price: String(price),
    discount_value: discount > 0 ? String(discount) : '0',
    discount_percent: discount,
    vat_value: price * 0.05,
    vat_rate: 5,
    image: overrides.image ?? overrides.main_image ?? '/product/small-size/1.jpg',
    main_image: overrides.main_image ?? overrides.image ?? '/product/small-size/1.jpg',
    brand: overrides.brand ?? '',
    model: overrides.model ?? '',
    mpn: overrides.mpn ?? '',
    product_type: 'simple',
    stock,
    low_stock_threshold: overrides.low_stock_threshold ?? 5,
    stock_status: stock <= 0 ? 'Out of Stock' : stock <= 5 ? `${stock} (Limited Stock!)` : `${stock} available`,
    rating: overrides.rating ?? 4,
    condition: 'new',
    size: '',
    color: '',
    variant_options: {},
    attributes: [],
    attribute_groups: {},
    created_at: new Date().toISOString(),
    is_fav: false,
    in_cart_qty: 0,
    parent_category_id: overrides.parent_category_id ?? null,
    parent_category_name: overrides.parent_category_name ?? '',
    parent_category_slug: overrides.parent_category_slug ?? '',
    category_id: overrides.category_id ?? null,
    category_name: overrides.category_name ?? '',
    category_slug: overrides.category_slug ?? '',
    ...overrides,
  };
}

export const STATIC_PRODUCTS: VariantCard[] = [
  makeVariantCard({
    id: '1', product_id: '1001', variant_id: '2001', product_name: 'Wireless Bluetooth Headphones Pro',
    brand: 'SoundMax', final_price: '189.00', original_price: '299.00', stock: 42,
    image: '/product/large-size/1.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.5,
  }),
  makeVariantCard({
    id: '2', product_id: '1002', variant_id: '2002', product_name: 'Men\'s Kandura Classic — Premium Thobe',
    brand: 'Tailored', final_price: '149.00', original_price: '219.00', stock: 18,
    image: '/product/large-size/2.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.3,
  }),
  makeVariantCard({
    id: '3', product_id: '1003', variant_id: '2003', product_name: 'Running Sneakers — Lightweight Mesh',
    brand: 'StrideX', final_price: '129.00', original_price: '199.00', stock: 35,
    image: '/product/large-size/3.jpg', parent_category_name: 'Footwear', parent_category_slug: 'footwear',
    rating: 4.1,
  }),
  makeVariantCard({
    id: '4', product_id: '1004', variant_id: '2004', product_name: 'Hand-painted Islamic Wall Art — Framed',
    brand: 'ArtHouse', final_price: '145.00', original_price: '205.00', stock: 12,
    image: '/product/large-size/4.jpg', parent_category_name: 'Home Décor', parent_category_slug: 'home-decor',
    rating: 4.7,
  }),
  makeVariantCard({
    id: '5', product_id: '1005', variant_id: '2005', product_name: 'Embroidered Abaya — Modern Cut',
    brand: 'Elegance', final_price: '189.00', original_price: '260.00', stock: 3,
    image: '/product/large-size/5.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.8, low_stock_threshold: 5,
  }),
  makeVariantCard({
    id: '6', product_id: '1006', variant_id: '2006', product_name: 'Digital Air Fryer — 5.5L Family Size',
    brand: 'KitchenElite', final_price: '259.00', original_price: '399.00', stock: 14,
    image: '/product/large-size/6.jpg', parent_category_name: 'Home Appliances', parent_category_slug: 'home-appliances',
    rating: 4.4,
  }),
  makeVariantCard({
    id: '7', product_id: '1007', variant_id: '2007', product_name: 'Portable Bluetooth Speaker — Waterproof',
    brand: 'SoundMax', final_price: '139.00', original_price: '199.00', stock: 28,
    image: '/product/large-size/7.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.2,
  }),
  makeVariantCard({
    id: '8', product_id: '1008', variant_id: '2008', product_name: 'Decorative Lantern Set — Ramadan Series',
    brand: 'Lumina', final_price: '89.00', original_price: '129.00', stock: 50,
    image: '/product/large-size/8.jpg', parent_category_name: 'Occasions & Islamic Gifts', parent_category_slug: 'occasions-islamic-gifts',
    rating: 4.6,
  }),
  makeVariantCard({
    id: '9', product_id: '1009', variant_id: '2009', product_name: 'Ceramic Plant Pot Set — 3 Sizes',
    brand: 'GreenThumb', final_price: '39.00', original_price: '55.00', stock: 60,
    image: '/product/large-size/9.jpg', parent_category_name: 'Home Décor', parent_category_slug: 'home-decor',
    rating: 4.0,
  }),
  makeVariantCard({
    id: '10', product_id: '1010', variant_id: '2010', product_name: 'Classic Leather Wallet — RFID Blocking',
    brand: 'UrbanCraft', final_price: '89.00', original_price: '149.00', stock: 22,
    image: '/product/large-size/10.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.3,
  }),
  makeVariantCard({
    id: '11', product_id: '1011', variant_id: '2011', product_name: 'LED Table Lamp — Dimmable & USB Port',
    brand: 'BrightHome', final_price: '69.00', original_price: '99.00', stock: 33,
    image: '/product/large-size/11.jpg', parent_category_name: 'Home Décor', parent_category_slug: 'home-decor',
    rating: 4.5,
  }),
  makeVariantCard({
    id: '12', product_id: '1012', variant_id: '2012', product_name: 'Tasbeeh — 99-Bead Premium Finish',
    brand: 'Amana', final_price: '35.00', original_price: '0', stock: 0,
    image: '/product/large-size/12.jpg', parent_category_name: 'Occasions & Islamic Gifts', parent_category_slug: 'occasions-islamic-gifts',
    rating: 4.9,
  }),
  makeVariantCard({
    id: '13', product_id: '1013', variant_id: '2013', product_name: 'Cordless Vacuum Cleaner — 25KPa Suction',
    brand: 'CleanMax', final_price: '249.00', original_price: '349.00', stock: 45,
    image: '/product/large-size/13.jpg', parent_category_name: 'Home Appliances', parent_category_slug: 'home-appliances',
    rating: 4.1,
  }),
  makeVariantCard({
    id: '14', product_id: '1014', variant_id: '2014', product_name: 'Girls Party Dress — Elegant Collection',
    brand: 'LittleFashion', final_price: '75.00', original_price: '110.00', stock: 70,
    image: '/product/small-size/1.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.6,
  }),
  makeVariantCard({
    id: '15', product_id: '1015', variant_id: '2015', product_name: 'Notebook Journal — Hardcover A5',
    brand: 'PaperCraft', final_price: '25.00', original_price: '0', stock: 100,
    image: '/product/small-size/2.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.2,
  }),
  makeVariantCard({
    id: '16', product_id: '1016', variant_id: '2016', product_name: 'Luxury Gift Box Set — Eid Collection',
    brand: 'GiftCraft', final_price: '129.00', original_price: '189.00', stock: 55,
    image: '/product/small-size/3.jpg', parent_category_name: 'Occasions & Islamic Gifts', parent_category_slug: 'occasions-islamic-gifts',
    rating: 4.0,
  }),
  makeVariantCard({
    id: '17', product_id: '1017', variant_id: '2017', product_name: 'Woven Cushion Covers — Set of 4',
    brand: 'CozyHome', final_price: '49.00', original_price: '79.00', stock: 20,
    image: '/product/small-size/4.jpg', parent_category_name: 'Home Décor', parent_category_slug: 'home-decor',
    rating: 4.7,
  }),
  makeVariantCard({
    id: '18', product_id: '1018', variant_id: '2018', product_name: 'Travel Prayer Mat — Compact & Portable',
    brand: 'Amana', final_price: '42.00', original_price: '65.00', stock: 80,
    image: '/product/small-size/5.jpg', parent_category_name: 'Occasions & Islamic Gifts', parent_category_slug: 'occasions-islamic-gifts',
    rating: 4.3,
  }),
  makeVariantCard({
    id: '19', product_id: '1019', variant_id: '2019', product_name: 'Sunglasses Polarized UV400 — Aviator',
    brand: 'UrbanCraft', final_price: '69.00', original_price: '119.00', stock: 2,
    image: '/product/small-size/6.jpg', parent_category_name: 'Fashion & Garments', parent_category_slug: 'fashion-garments',
    rating: 4.4, low_stock_threshold: 5,
  }),
  makeVariantCard({
    id: '20', product_id: '1020', variant_id: '2020', product_name: 'Essential Oil Diffuser — 300ml Ultrasonic',
    brand: 'GlowNaturals', final_price: '85.00', original_price: '120.00', stock: 15,
    image: '/product/large-size/9.jpg', parent_category_name: 'Home Décor', parent_category_slug: 'home-decor',
    rating: 4.5,
  }),
];

/* ------------------------------------------------------------------ */
/*  Derived helpers                                                     */
/* ------------------------------------------------------------------ */
export const DEAL_PRODUCTS = STATIC_PRODUCTS.filter((p) => p.discount_percent >= 25 && p.stock > 0);

export const PRODUCTS_BY_CATEGORY = (slug: string) =>
  STATIC_PRODUCTS.filter((p) => p.parent_category_slug === slug && p.stock > 0);
