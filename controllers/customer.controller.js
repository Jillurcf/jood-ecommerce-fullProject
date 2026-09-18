// controllers/customer.controller.js
const discountController = require("./discount.controller");

const BRAND_NAME = "JOOD";
const SITE_URL = process.env.SITE_URL || "http://localhost:4000";
const SUPPORT_EMAIL = "support@jood.com";
const LEGAL_EMAIL = "legal@jood.com";
const DPO_EMAIL = "dpo@jood.com";
const CONTACT_PHONE = "+971-55-555-5555";
const CONTACT_ADDRESS = "Al Reem Tower, Dubai, UAE";
const BUSINESS_HOURS = "Sun–Thu, 09:00–21:00 GST";

exports.index = async (req, res) => {
  try {
    const result = await discountController.getDiscountProductsAPI(req, null, true);

    const discountData = result?.data || {
      carousel: [],
      top2: [],
      grid3: [],
    };

    res.render("customer/index", {
      pageTitle: "About Us — JOOD",
      metaTitle: "About Us — JOOD",
      metaDescription:
        "Discover JOOD — our mission, vision, values, team, and commitment to delivering exceptional e-commerce experiences.",
      metaKeywords:
        "JOOD, About Us, Ecommerce, Online Store, Quality Goods, Products, Team, Mission, Vision, Values",
      siteName: BRAND_NAME,
      siteUrl: SITE_URL,

      heroImage: "/customer/images/about-hero.jpg",
      heroSubtitle:
        "Delivering quality goods & products and exceptional service with integrity, transparency, and passion.",

      stats: [
        { value: "10k+", label: "Customers served" },
        { value: "95%", label: "Customer satisfaction" },
        { value: "30+", label: "Trusted partners" },
      ],

      summary:
        "JOOD is an e-commerce platform dedicated to providing quality goods & products, transparency, and excellent customer support.",

      mission:
        "To deliver high-quality goods & products with clear policies and responsive service that delight our customers.",

      vision:
        "To be the most trusted online store in the region, recognized for quality, reliability, and customer satisfaction.",

      values: [
        { title: "Integrity", description: "We act transparently and honor our commitments." },
        { title: "Customer Obsession", description: "Decisions are guided by our customers' needs." },
        { title: "Quality", description: "We partner with suppliers who meet rigorous standards." },
        { title: "Sustainability", description: "We minimize environmental impact in sourcing and logistics." },
      ],

      team: [
        {
          name: "John Doe",
          title: "CEO",
          photo: "/customer/images/team/john.jpg",
          bio: "John leads the company with over 15 years of experience in retail and e-commerce.",
        },
        {
          name: "Jane Smith",
          title: "COO",
          photo: "/customer/images/team/jane.jpg",
          bio: "Jane oversees operations and logistics to ensure smooth fulfillment and customer satisfaction.",
        },
      ],

      partners: [
        { name: "Partner A", logo: "/customer/images/partners/partner-a.png" },
        { name: "Partner B", logo: "/customer/images/partners/partner-b.png" },
      ],

      contactEmail: SUPPORT_EMAIL,
      contactPhone: CONTACT_PHONE,

      csr:
        "We are committed to ethical sourcing, fair labor practices, and reducing environmental impact through smarter packaging and logistics.",

      ctaLink: "/customer/shop",
      ctaButton: "Explore Our Catalog",

      milestones: [
        {
          date: "2018",
          title: "Founded",
          description: "JOOD was founded with a vision to provide quality goods & products online.",
        },
        {
          date: "2020",
          title: "Expanded",
          description: "Expanded operations to multiple regions and increased product variety.",
        },
        {
          date: "2023",
          title: "Trusted by 10k+ customers",
          description: "Reached over 10,000 satisfied customers worldwide.",
        },
      ],

      discountData,
    });
  } catch (err) {
    console.error("Index Page Error:", err);

    res.render("customer/index", {
      pageTitle: "JOOD",
      metaTitle: "JOOD",
      metaDescription: "Quality goods & products from JOOD.",
      metaKeywords: "JOOD, ecommerce, quality goods, products",
      siteName: BRAND_NAME,
      siteUrl: SITE_URL,
      discountData: {
        carousel: [],
        top2: [],
        grid3: [],
      },
    });
  }
};

exports.aboutUs = (req, res) => {
  res.render("customer/company/about-us", {
    pageTitle: "About Us — JOOD",
    metaTitle: "About Us - JOOD",
    metaDescription:
      "Learn about JOOD, our mission, values, history, and how we deliver exceptional e-commerce experiences.",
    metaKeywords: "JOOD, About Us, ecommerce, online store, quality goods, products",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,
    heroImage: "/images/about-hero.jpg",
    heroSubtitle: "We deliver quality goods & products and excellent service with passion and integrity.",
    stats: [
      { value: "10k+", label: "Customers served" },
      { value: "95%", label: "Customer satisfaction" },
      { value: "30+", label: "Trusted partners" },
    ],
    summary:
      "JOOD is an e-commerce platform dedicated to quality, transparency, and customer satisfaction.",
    mission: "To provide high-quality goods & products with transparent policies and responsive support.",
    vision: "To be the most trusted online store for our customers.",
    values: [
      { title: "Integrity", description: "We act transparently and honor our commitments." },
      { title: "Customer Obsession", description: "Decisions are guided by our customers' needs." },
      { title: "Quality", description: "We partner with suppliers who meet rigorous standards." },
      { title: "Sustainability", description: "We strive to minimize environmental impact." },
    ],
    team: [
      {
        name: "John Doe",
        title: "CEO",
        photo: "/images/team/john.jpg",
        bio: "John leads the company with over 15 years of retail and e-commerce experience.",
      },
      {
        name: "Jane Smith",
        title: "COO",
        photo: "/images/team/jane.jpg",
        bio: "Jane oversees operations and logistics ensuring smooth fulfillment.",
      },
    ],
    partners: [
      { name: "Partner A", logo: "/images/partners/partner-a.png" },
      { name: "Partner B", logo: "/images/partners/partner-b.png" },
    ],
    contactEmail: SUPPORT_EMAIL,
    contactPhone: CONTACT_PHONE,
    csr:
      "We are committed to ethical sourcing, fair labor practices, and reducing environmental impact through smarter packaging and logistics.",
    ctaLink: "/customer/shop",
    ctaButton: "Explore Our Catalog",
    milestones: [
      {
        date: "2018",
        title: "Founded",
        description: "JOOD was founded with a vision to provide quality goods & products online.",
      },
      {
        date: "2020",
        title: "Expanded",
        description: "Expanded to multiple regions and increased product variety.",
      },
      {
        date: "2023",
        title: "Trusted by 10k+ customers",
        description: "Reached over 10,000 satisfied customers worldwide.",
      },
    ],
  });
};

exports.contactUs = (req, res) => {
  res.render("customer/support-and-help/contact-us", {
    pageTitle: "Contact Us",
    metaTitle: "Contact Us - JOOD",
    metaDescription:
      "Get in touch with JOOD. Visit us at our Dubai office, call, email, or use the contact form to reach our support team.",
    metaKeywords: "JOOD, Contact, Dubai, support, phone, email, contact form",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,
    heroImage: "/images/contact-hero.jpg",
    heroSubtitle: "We’re here to help you with any questions or support you need.",

    contactAddress: CONTACT_ADDRESS,
    contactPhone: "+971 4 337 2440",
    contactEmail: SUPPORT_EMAIL,

    mapEmbed: `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3609.456893327637!2d55.283012!3d25.197638!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3e5f5d0a0b3c2a6b%3A0x123456789abcdef!2sAl%20Reem%20Tower%2C%20Dubai!5e0!3m2!1sen!2sae!4v1697021234567!5m2!1sen!2sae`,

    formAction: "/customer/support-and-help/contact-submit",
    ctaLink: "/customer/shop",
    ctaButton: "Explore Our Catalog",
  });
};

exports.privacyPolicy = (req, res) => {
  res.render("customer/legal-and-compliance/privacy-policy", {
    pageTitle: "Privacy Policy",
    metaTitle: "Privacy Policy - JOOD",
    metaDescription:
      "JOOD Privacy Policy — how we collect, use, protect, and share your personal information. Your privacy matters to us.",
    metaKeywords: "JOOD, Privacy Policy, Data Protection, Cookies, Personal Data",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,
    heroImage: "/images/privacy-hero.jpg",
    heroSubtitle: "Your privacy is important. Learn how we collect, use, and protect your information.",

    sections: [
      {
        title: "Information We Collect",
        content: [
          "Account & contact information: name, email, phone, shipping and billing address.",
          "Payment data: limited payment information processed by secure third-party providers.",
          "Order history & preferences: products purchased and user preferences.",
          "Support & communications: messages exchanged with our support team.",
          "Technical & usage data: IP, device, browser info, cookies, and analytics.",
        ],
      },
      {
        title: "How We Use Your Information",
        content: [
          "Process and deliver orders, including payments and shipping.",
          "Communicate about orders, account, and support requests.",
          "Personalize content and product recommendations.",
          "Prevent fraud, abuse, and maintain security.",
          "Comply with legal obligations and enforce policies.",
          "Improve website, products, and marketing through analytics.",
        ],
      },
      {
        title: "Cookies & Tracking",
        content: [
          "We use cookies to improve functionality, remember preferences, and collect analytics.",
          "You can manage cookies via your browser settings.",
        ],
      },
      {
        title: "Your Rights",
        content: [
          "Access, correct, delete, or restrict processing of your personal data.",
          "Object to certain uses. Contact us to exercise your rights.",
        ],
      },
    ],

    contactEmail: SUPPORT_EMAIL,
    contactPhone: CONTACT_PHONE,
    contactAddress: CONTACT_ADDRESS,
  });
};

exports.termOfServices = (req, res) => {
  res.render("customer/legal-and-compliance/terms-of-service", {
    pageTitle: "Terms of Service",
    metaTitle: "Terms of Service - JOOD",
    metaDescription:
      "JOOD Terms of Service — rules and conditions for using our website, services, and products. By using our services, you agree to these terms.",
    metaKeywords: "JOOD, Terms of Service, User Agreement, Rules, Legal",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,
    heroImage: "/images/terms-hero.jpg",
    heroSubtitle: "By using JOOD, you agree to the following rules and conditions.",

    sections: [
      {
        title: "1. Acceptance of Terms",
        content: [
          "By accessing or using our website and services, you agree to comply with these Terms of Service.",
          "If you do not agree, please do not use our services.",
        ],
      },
      {
        title: "2. User Accounts",
        content: [
          "You may need to create an account to use certain services.",
          "You are responsible for maintaining the confidentiality of your account information and password.",
          "Notify us immediately of any unauthorized use of your account.",
        ],
      },
      {
        title: "3. Acceptable Use",
        content: [
          "You may not use our services for unlawful purposes or in ways that could harm others.",
          "Prohibited activities include unauthorized access, hacking, spam, or interfering with our systems.",
        ],
      },
      {
        title: "4. Intellectual Property",
        content: [
          "All content, trademarks, and materials on this website are owned by JOOD or its licensors.",
          "You may not reproduce, distribute, or create derivative works without our permission.",
        ],
      },
      {
        title: "5. Purchases and Payments",
        content: [
          "All product purchases are subject to our Terms & Conditions (including payment, shipping, and refund rules).",
          "Pricing, availability, and promotions may change without notice.",
        ],
      },
      {
        title: "6. Limitation of Liability",
        content: [
          "JOOD is not liable for damages arising from use of our website or products, except as required by law.",
          "We provide services 'as is' and make no warranties beyond those stated in these Terms.",
        ],
      },
      {
        title: "7. Governing Law",
        content: [
          "These Terms are governed by the laws of the UAE.",
          "Any disputes will be resolved in UAE courts, unless otherwise agreed.",
        ],
      },
      {
        title: "8. Changes to Terms",
        content: [
          "We may update these Terms from time to time.",
          "Material changes will be communicated on our website, and continued use of our services indicates acceptance.",
        ],
      },
    ],

    contactEmail: SUPPORT_EMAIL,
    contactPhone: CONTACT_PHONE,
    contactAddress: CONTACT_ADDRESS,
  });
};

exports.cookiePolicy = (req, res) => {
  res.render("customer/legal-and-compliance/cookie-policy", {
    pageTitle: "Cookie Policy",
    metaTitle: "Cookie Policy - JOOD",
    metaDescription:
      "JOOD Cookie Policy — how we use cookies and similar technologies on our website to improve your experience and provide personalized content.",
    metaKeywords: "JOOD, Cookie Policy, Cookies, Tracking, Analytics",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,
    heroImage: "/images/cookie-hero.jpg",
    heroSubtitle: "This policy explains how we use cookies and similar technologies on JOOD.",

    sections: [
      {
        title: "1. What are Cookies?",
        content: [
          "Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences, improve functionality, and provide analytical data.",
          "Similar technologies include pixels, local storage, and beacons.",
        ],
      },
      {
        title: "2. Types of Cookies We Use",
        content: [
          "Essential cookies: Required for shopping cart, login, and secure sessions.",
          "Performance cookies: Collect anonymous usage data to improve site speed and reliability.",
          "Functional cookies: Remember preferences and settings like language or display options.",
          "Advertising/Marketing cookies: Track user interactions to deliver personalized offers, ads, and promotions.",
          "Analytics cookies: Help us understand how users interact with the site and which areas need improvement.",
        ],
      },
      {
        title: "3. Why We Use Cookies",
        content: [
          "Provide a consistent and seamless browsing experience.",
          "Remember login credentials, preferences, and settings.",
          "Analyze traffic, improve website functionality, and perform troubleshooting.",
          "Deliver targeted marketing, ads, and promotional content with consent.",
          "Ensure security and prevent fraudulent activity.",
        ],
      },
      {
        title: "4. Managing & Controlling Cookies",
        content: [
          "You can manage cookies using your browser settings or our cookie banner.",
          "Options include blocking or deleting specific cookies, setting browser preferences, or opting out of targeted advertising via industry-standard platforms.",
          "You may adjust settings for individual cookie categories through our website interface.",
        ],
      },
      {
        title: "5. Third-Party Cookies",
        content: [
          "We may allow trusted third-party partners to use cookies for analytics, advertising, or marketing services.",
          "These cookies are governed by the third-party’s own policies. We recommend reviewing their policies to understand how they use your information.",
        ],
      },
      {
        title: "6. Changes to this Policy",
        content: [
          "We may update this Cookie Policy to reflect operational, legal, or technological changes.",
          "Material changes will be communicated on this page and/or via email. Please check the effective date at the top of the page.",
        ],
      },
      {
        title: "7. Contact Information",
        content: [
          "For questions or concerns regarding our Cookie Policy, contact our Data Protection Officer:",
          `Email: ${DPO_EMAIL}`,
          `Phone: ${CONTACT_PHONE}`,
          `Address: ${CONTACT_ADDRESS}`,
        ],
      },
    ],

    contactEmail: DPO_EMAIL,
    contactPhone: CONTACT_PHONE,
    contactAddress: CONTACT_ADDRESS,
  });
};

exports.termAndCondition = (req, res) => {
  res.render("customer/legal-and-compliance/term-and-condition", {
    pageTitle: "Terms & Conditions",
    metaTitle: "Terms & Conditions - JOOD",
    metaDescription:
      "JOOD Terms & Conditions — rules, guidelines, and conditions for using our website, products, and services.",
    metaKeywords: "JOOD, Terms and Conditions, Legal, Policies, User Agreement",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/term-of-service/term-of-service.png",
    heroSubtitle:
      "These Terms & Conditions govern your use of JOOD services, website, and applications.",

    sections: [
      {
        title: "1. Acceptance of Terms",
        content: [
          "By accessing or using JOOD services, you agree to be bound by these Terms & Conditions and all applicable laws and regulations.",
          "If you do not agree with any part of these terms, you must not use our services.",
        ],
      },
      {
        title: "2. Definitions",
        content: [
          "\"Services\" refers to JOOD’s website, mobile applications, and related offerings.",
          "\"User\", \"you\", and \"your\" refer to any individual accessing or using the services.",
        ],
      },
      {
        title: "3. Modifications to Terms",
        content: [
          "JOOD reserves the right to update or modify these Terms at any time.",
          "Changes become effective immediately upon posting on the website.",
          "Continued use of the services constitutes acceptance of the updated Terms.",
        ],
      },
      {
        title: "4. Eligibility",
        content: [
          "You must be at least 18 years old or the legal age of majority in your jurisdiction to use our services.",
          "By using the services, you confirm that you meet these eligibility requirements.",
        ],
      },
      {
        title: "5. User Responsibilities",
        content: [
          "Provide accurate and complete information when creating an account or placing an order.",
          "Maintain the confidentiality of your login credentials.",
          "Use the services only for lawful purposes and in compliance with these Terms.",
        ],
      },
      {
        title: "6. Purchases, Payments & Taxes",
        content: [
          "All purchases are subject to product availability.",
          "Prices displayed on the website include applicable taxes unless stated otherwise.",
          "Payments are securely processed through trusted third-party providers.",
        ],
      },
      {
        title: "7. Shipping & Delivery",
        content: [
          "Delivery timelines are estimates and may vary based on location and logistics.",
          "Additional charges such as customs or duties may apply for international orders.",
        ],
      },
      {
        title: "8. Returns & Refunds",
        content: [
          "Returns and refunds are governed by our Returns & Refund Policy.",
          "We reserve the right to refuse returns that do not comply with our policy.",
        ],
      },
      {
        title: "9. User-Generated Content",
        content: [
          "Users retain ownership of content they submit.",
          "By submitting content, you grant JOOD a license to use and display it for service operation and promotion.",
        ],
      },
      {
        title: "10. Intellectual Property",
        content: [
          "All trademarks, logos, and website content are the property of JOOD or its licensors.",
          "You may not copy, reproduce, or distribute content without prior written permission.",
        ],
      },
      {
        title: "11. Disclaimer of Warranties",
        content: [
          "Services are provided on an 'as is' and 'as available' basis.",
          "We do not guarantee that the website will always be secure, error-free, or uninterrupted.",
        ],
      },
      {
        title: "12. Limitation of Liability",
        content: [
          "JOOD is not liable for indirect, incidental, or consequential damages.",
          "Our total liability is limited to the amount paid by you for our services within the last 12 months.",
        ],
      },
      {
        title: "13. Termination",
        content: [
          "We reserve the right to suspend or terminate accounts that violate these Terms.",
          "Termination does not limit our legal rights or remedies.",
        ],
      },
      {
        title: "14. Governing Law",
        content: [
          "These Terms are governed by the laws of the United Arab Emirates.",
          "Any disputes shall be resolved in the courts of Dubai, UAE.",
        ],
      },
      {
        title: "15. Contact Information",
        content: [
          "For any questions regarding these Terms & Conditions, please contact us:",
          `Email: ${SUPPORT_EMAIL}`,
          `Phone: ${CONTACT_PHONE}`,
          `Address: ${CONTACT_ADDRESS}`,
        ],
      },
    ],

    contactEmail: SUPPORT_EMAIL,
    contactPhone: CONTACT_PHONE,
    contactAddress: CONTACT_ADDRESS,
  });
};

exports.helpSupport = (req, res) => {
  res.render("customer/support-and-help/help-support", {
    pageTitle: "Help & Support",
    metaTitle: "Help & Support - JOOD",
    metaDescription:
      "Get help with orders, returns, payments, delivery, and technical support at JOOD. Our support team is here to assist you.",
    metaKeywords:
      "JOOD Help, Customer Support, Orders Help, Returns, Delivery Support, UAE Customer Care",

    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/help-support/help-support.png",
    heroSubtitle:
      "We're here to help you with orders, products, payments, returns, and any questions you may have.",

    sections: [
      {
        title: "1. Orders & Account Support",
        content: [
          "Track your current and past orders through your account dashboard.",
          "Update your personal details, shipping address, and contact information anytime.",
          "If you experience login issues or account access problems, contact our support team for assistance.",
        ],
      },
      {
        title: "2. Payments & Billing",
        content: [
          "We accept secure payments via debit/credit cards and trusted payment gateways.",
          "All transactions are encrypted and processed securely.",
          "If you notice any billing issue or duplicate charge, please contact us immediately.",
        ],
      },
      {
        title: "3. Shipping & Delivery",
        content: [
          "Delivery timelines vary depending on your location and shipping method.",
          "You will receive tracking details once your order is dispatched.",
          "For delayed or missing shipments, contact our support team with your order number.",
        ],
      },
      {
        title: "4. Returns, Refunds & Exchanges",
        content: [
          "You can request returns or exchanges according to our Returns Policy.",
          "Items must be unused and returned in original packaging.",
          "Refunds are processed to the original payment method within the stated processing time.",
        ],
      },
      {
        title: "5. Product & Technical Support",
        content: [
          "For product usage, warranty, or troubleshooting support, our team is ready to help.",
          "If you experience technical issues with the website, please report them with screenshots if possible.",
          "We continuously work to improve site performance and reliability.",
        ],
      },
      {
        title: "6. Business & Bulk Orders",
        content: [
          "We offer special pricing for corporate and bulk purchases.",
          "For partnership, wholesale, or distribution inquiries, contact our business team.",
          "Custom quotations can be provided upon request.",
        ],
      },
      {
        title: "7. Complaints & Escalations",
        content: [
          "If you are not satisfied with our service, you may escalate your concern.",
          "Our management team will review and respond within 2 business days.",
          "Customer satisfaction is our top priority.",
        ],
      },
      {
        title: "8. Contact Our Support Team",
        content: [
          "Our customer support team is available to assist you during working hours.",
          `Email: ${SUPPORT_EMAIL}`,
          `Phone: ${CONTACT_PHONE}`,
          `Address: ${CONTACT_ADDRESS}`,
        ],
      },
    ],

    contactEmail: SUPPORT_EMAIL,
    contactPhone: CONTACT_PHONE,
    contactAddress: CONTACT_ADDRESS,
  });
};

exports.faq = (req, res) => {
  res.render("customer/support-and-help/faq", {
    pageTitle: "FAQ & Customer Support — JOOD",
    metaTitle: "FAQ & Customer Support — JOOD",
    metaDescription:
      "Find answers to frequently asked questions about orders, returns, payments, shipping, technical support, warranties, and corporate enquiries at JOOD.",
    metaKeywords:
      "FAQ, Help, Support, Orders, Returns, Payments, Billing, Delivery, Technical Support, Warranty, UAE Customer Care",

    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/faq/faq.png",
    heroSubtitle:
      "Clear, authoritative answers to your most common questions about orders, shipping, returns, payments, warranties, accounts, and technical support.",

    faqSections: [
      {
        id: "orders",
        question: "How do I place an order?",
        answer:
          "Select the desired items, add them to your cart, and proceed to checkout. Complete shipping and payment details, review, and confirm. You'll receive an email confirmation with order number and estimated delivery.",
      },
      {
        id: "tracking",
        question: "How can I track my order?",
        answer:
          "After shipping, you'll receive a tracking number via email. You can also visit the Track Order page and enter your order number and email to view current status.",
      },
      {
        id: "shipping",
        question: "What are the delivery options and costs?",
        answer:
          "Delivery options and costs are displayed at checkout based on your location. Estimated delivery times vary depending on carrier and shipping method.",
      },
      {
        id: "returns",
        question: "How do I request a return or refund?",
        answer:
          "Go to My Orders, select the relevant order, and click 'Request Return'. Follow the instructions to generate a return label and ship the item back within the return window.",
      },
      {
        id: "payments",
        question: "What payment methods are accepted?",
        answer:
          "We accept major credit/debit cards and trusted online payment methods. All transactions are securely processed through PCI-compliant providers.",
      },
      {
        id: "technical",
        question: "Who do I contact for technical support?",
        answer:
          "For website issues, login problems, or errors, submit a report via our Contact page with screenshots or error messages. Our technical support team will assist promptly.",
      },
      {
        id: "corporate",
        question: "How do I place a corporate or bulk order?",
        answer:
          "Provide company details, VAT/registration number, and estimated volumes via email. A dedicated account manager will assist with pricing, delivery, and invoicing.",
      },
      {
        id: "complaints",
        question: "How can I escalate a complaint?",
        answer:
          "Mark the ticket as 'Escalate' or email our Customer Experience Team. We acknowledge escalations within 24 hours and respond formally within 10 business days.",
      },
    ],

    contact: {
      email: SUPPORT_EMAIL,
      phone: CONTACT_PHONE,
      address: CONTACT_ADDRESS,
      businessHours: BUSINESS_HOURS,
    },
  });
};

exports.returnPolicy = (req, res) => {
  res.render("customer/support-and-help/return-policy", {
    pageTitle: "Refund & Returns Policy — JOOD",
    metaTitle: "Refund & Returns Policy — JOOD",
    metaDescription:
      "Comprehensive refund and returns policy for JOOD customers — eligibility, timeframes, procedures, and warranty claims explained in detail.",
    metaKeywords:
      "Refund Policy, Returns Policy, Refunds, Exchanges, Warranty, Customer Support, UAE JOOD",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/returns/returns-hero.png",
    heroSubtitle:
      "Detailed guidance on returns, refunds, cancellations, exchanges, and warranty claims to ensure a smooth and transparent customer experience.",
    faqSections: [
      {
        id: "eligibility",
        question: "Which items are eligible for return or refund?",
        answer:
          "Items must be unused, in original packaging, with proof of purchase. The standard return window is 14 calendar days from delivery unless stated otherwise.",
      },
      {
        id: "non-eligible",
        question: "Which items are not eligible for return?",
        answer:
          "Perishable goods, personalized/custom items, opened hygiene products, downloadable software, and final sale items are typically non-returnable unless faulty.",
      },
      {
        id: "process",
        question: "How do I initiate a return?",
        answer:
          "Sign in → My Orders → Request Return or submit via Contact page with order number, reason, and photos if required. Follow instructions to generate a return label or schedule pickup.",
      },
      {
        id: "inspection",
        question: "What happens after I return an item?",
        answer:
          "Returned items are inspected. Approved returns are refunded to the original payment method, or exchanged as requested. Non-compliant returns may incur deductions or be returned to the customer.",
      },
      {
        id: "refunds",
        question: "How long does it take to receive a refund?",
        answer:
          "Refunds are typically processed within 5–10 business days after we receive and inspect the item. Processing times may vary by bank or payment provider.",
      },
      {
        id: "faulty-items",
        question: "What if the item is faulty, damaged, or incorrect?",
        answer:
          "Contact support immediately with photos/videos. We will arrange repair, replacement, or full refund at no additional cost to you.",
      },
      {
        id: "shipping-costs",
        question: "Who pays for return shipping?",
        answer:
          "Returns due to our error are covered by us. Returns for change of mind are typically at the customer’s expense unless a free returns program applies.",
      },
      {
        id: "warranty",
        question: "How do I make a warranty claim?",
        answer:
          "Provide proof of purchase, product SKU, and photos/videos of the issue. Submit via the support form or warranty portal for repair, replacement, or refund according to manufacturer policy.",
      },
    ],
    contact: {
      email: SUPPORT_EMAIL,
      phone: CONTACT_PHONE,
      address: CONTACT_ADDRESS,
      businessHours: BUSINESS_HOURS,
    },
  });
};

exports.shippingDeliveryPolicy = (req, res) => {
  res.render("customer/support-and-help/shipping-delivery-policy", {
    pageTitle: "Shipping & Delivery Policy — JOOD",
    metaTitle: "Shipping & Delivery Policy — JOOD",
    metaDescription:
      "Comprehensive shipping and delivery policy for JOOD customers — delivery times, shipping fees, tracking, customs, and international shipping explained in detail.",
    metaKeywords:
      "Shipping Policy, Delivery Policy, Shipping Fees, Order Tracking, International Shipping, UAE Delivery, JOOD",

    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/shipping/shipping-hero.png",
    heroSubtitle:
      "Everything you need to know about delivery timelines, shipping costs, tracking, and international logistics.",

    faqSections: [
      {
        id: "delivery-time",
        question: "How long does delivery take?",
        answer:
          "Standard delivery within the UAE typically takes 2–5 business days. Express delivery options may be available at checkout. International shipping timelines vary by destination and customs clearance.",
      },
      {
        id: "shipping-fees",
        question: "How are shipping fees calculated?",
        answer:
          "Shipping costs depend on destination, package weight, dimensions, and delivery speed selected. Final shipping cost is displayed at checkout before payment.",
      },
      {
        id: "tracking",
        question: "How can I track my order?",
        answer:
          "Once dispatched, you will receive a tracking number via email. You can also track your shipment via the Track Order page using your order number.",
      },
      {
        id: "customs",
        question: "Are customs duties included?",
        answer:
          "For international shipments, customs duties and taxes may apply depending on local regulations. These charges are the responsibility of the recipient unless otherwise stated.",
      },
      {
        id: "failed-delivery",
        question: "What happens if delivery fails?",
        answer:
          "If delivery attempts fail, the courier may reattempt or hold the package at a local facility. Contact support promptly to arrange redelivery.",
      },
    ],

    contact: {
      email: SUPPORT_EMAIL,
      phone: CONTACT_PHONE,
      address: CONTACT_ADDRESS,
      businessHours: BUSINESS_HOURS,
    },
  });
};

exports.disclaimer = (req, res) => {
  res.render("customer/legal-and-compliance/disclaimer", {
    pageTitle: "Disclaimer — JOOD",
    metaTitle: "Legal Disclaimer — JOOD",
    metaDescription:
      "Official legal disclaimer of JOOD — limitation of liability, third-party links, intellectual property, warranties and user responsibilities.",
    metaKeywords:
      "Disclaimer, Legal Notice, Limitation of Liability, Website Terms, UAE Ecommerce Disclaimer, JOOD",

    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/legal/disclaimer-hero.png",
    heroSubtitle:
      "Important legal information regarding website use, liability limitations, third-party content, and intellectual property rights.",

    faqSections: [
      {
        id: "no-warranty",
        question: "Is the website provided with warranties?",
        answer:
          "All content and services are provided 'as is' and 'as available' without warranties of any kind, either express or implied.",
      },
      {
        id: "liability",
        question: "Is JOOD liable for damages?",
        answer:
          "To the fullest extent permitted by UAE law, JOOD shall not be liable for indirect, incidental, special, or consequential damages arising from the use of the website.",
      },
      {
        id: "third-party",
        question: "Are third-party links endorsed?",
        answer:
          "Links to third-party websites are provided for convenience only. JOOD does not control or endorse third-party content.",
      },
      {
        id: "ip-rights",
        question: "Who owns website content?",
        answer:
          "All trademarks, logos, images, content, and designs are the intellectual property of JOOD unless otherwise stated.",
      },
      {
        id: "governing-law",
        question: "Which law governs this disclaimer?",
        answer:
          "This disclaimer is governed by the laws of the United Arab Emirates, and disputes are subject to UAE jurisdiction.",
      },
    ],

    contact: {
      email: LEGAL_EMAIL,
      phone: CONTACT_PHONE,
      address: CONTACT_ADDRESS,
      businessHours: BUSINESS_HOURS,
    },
  });
};

exports.SiteMap = (req, res) => {
  res.render("customer/sitemap", {
    pageTitle: "Sitemap — JOOD",
    metaTitle: "Sitemap — JOOD",
    metaDescription:
      "Full HTML sitemap of JOOD — categories, collections, products, support pages, account pages, and legal pages.",
    metaKeywords:
      "sitemap, site map, ecommerce sitemap, JOOD, categories, products, pages",
    siteName: BRAND_NAME,
    siteUrl: SITE_URL,
    heroImage: "/customer/images/sitemap/sitemap-hero.png",
    heroSubtitle:
      "Browse a full, human-readable site map to find categories, collections, products, support, and legal pages quickly.",
    sitemapSections: [
      {
        title: "Core",
        links: [
          { name: "Home", url: "/" },
          { name: "Shop / Catalog", url: "/shop" },
          { name: "New Arrivals", url: "/collections/new-arrivals" },
          { name: "Best Sellers", url: "/collections/best-sellers" },
          { name: "Clearance", url: "/collections/clearance" },
          { name: "Brands", url: "/brands" },
          { name: "Offers & Promotions", url: "/offers" },
          { name: "Flash Sale", url: "/flash-sale" },
        ],
      },
      {
        title: "Categories",
        links: [
          { name: "Electronics", url: "/category/electronics" },
          { name: "Fashion & Accessories", url: "/category/fashion" },
          { name: "Home & Living", url: "/category/home-living" },
          { name: "Beauty & Health", url: "/category/beauty-health" },
          { name: "Baby & Toys", url: "/category/baby-toys" },
          { name: "Sports & Outdoors", url: "/category/sports-outdoors" },
          { name: "Automotive & Parts", url: "/category/auto" },
          { name: "Grocery & Essentials", url: "/category/grocery" },
        ],
      },
      {
        title: "Account & Checkout",
        links: [
          { name: "Login", url: "/account/login" },
          { name: "Register", url: "/account/register" },
          { name: "My Account Dashboard", url: "/account" },
          { name: "Orders", url: "/account/orders" },
          { name: "Wishlist", url: "/account/wishlist" },
          { name: "Cart", url: "/cart" },
          { name: "Checkout", url: "/checkout" },
        ],
      },
      {
        title: "Support & Help",
        links: [
          { name: "FAQ", url: "/customer/faq" },
          { name: "Contact Us", url: "/customer/contact-us" },
          { name: "Track Order", url: "/customer/track-order" },
          { name: "Shipping & Delivery", url: "/customer/shipping-delivery-policy" },
          { name: "Returns & Refunds", url: "/customer/returns-policy" },
          { name: "Warranty", url: "/customer/warranty" },
        ],
      },
      {
        title: "Legal",
        links: [
          { name: "Terms & Conditions", url: "/customer/terms-conditions" },
          { name: "Privacy Policy", url: "/customer/privacy-policy" },
          { name: "Cookie Policy", url: "/customer/cookie-policy" },
          { name: "Disclaimer", url: "/customer/disclaimer" },
        ],
      },
    ],
    contact: {
      email: SUPPORT_EMAIL,
      phone: CONTACT_PHONE,
      address: CONTACT_ADDRESS,
      businessHours: BUSINESS_HOURS,
    },
  });
};

exports.warranty = (req, res) => {
  res.render("customer/support-and-help/warranty", {
    pageTitle: "Warranty & Guarantees — JOOD",
    metaTitle: "Warranty & Guarantees — JOOD",
    metaDescription:
      "Official warranty and guarantee information for JOOD products — coverage details, limitations, and user responsibilities.",
    metaKeywords: "Warranty, Guarantee, Product Warranty, Coverage, Returns, JOOD",

    siteName: BRAND_NAME,
    siteUrl: SITE_URL,

    heroImage: "/customer/images/legal/warranty-hero.png",
    heroSubtitle:
      "Comprehensive warranty and guarantee information for JOOD products, including coverage, limitations, and support.",

    faqSections: [
      {
        id: "coverage",
        question: "What products are covered under warranty?",
        answer:
          "All eligible JOOD products come with a warranty period specified at the time of purchase. Check the product page for specific coverage details.",
      },
      {
        id: "duration",
        question: "How long does the warranty last?",
        answer:
          "Warranty duration varies by product type. Refer to the product details or the warranty card provided with your purchase.",
      },
      {
        id: "claims",
        question: "How do I make a warranty claim?",
        answer:
          "Submit a warranty request through our customer support portal with proof of purchase and product details.",
      },
      {
        id: "limitations",
        question: "Are there any limitations to the warranty?",
        answer:
          "Warranty does not cover misuse, accidental damage, or unauthorized repairs. Full terms are available in the warranty section.",
      },
      {
        id: "contact-support",
        question: "Who can I contact for warranty support?",
        answer:
          "Reach out to our customer support team via email or phone for any warranty-related assistance.",
      },
    ],

    contact: {
      email: SUPPORT_EMAIL,
      phone: CONTACT_PHONE,
      address: CONTACT_ADDRESS,
      businessHours: BUSINESS_HOURS,
    },
  });
};