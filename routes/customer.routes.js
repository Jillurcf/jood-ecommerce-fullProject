// routes/customer.routes.js
const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customer.controller");

// About Us page
// redirect /customer → /customer/index
// customer.routes.js
router.get("/", customerController.index);

router.get("/company/about-us", customerController.aboutUs);
router.get("/support-and-help/contact-us", customerController.contactUs);
router.get("/legal-and-compliance/privacy-policy", customerController.privacyPolicy);
router.get("/legal-and-compliance/terms-of-service", customerController.termOfServices);
router.get("/legal-and-compliance/cookie-policy", customerController.cookiePolicy);
router.get("/legal-and-compliance/term-and-condition", customerController.termAndCondition);
router.get("/support-and-help/help-support", customerController.helpSupport);
router.get("/support-and-help/faq", customerController.faq);
router.get("/support-and-help/return-policy", customerController.returnPolicy);
router.get("/support-and-help/shipping-delivery-policy", customerController.shippingDeliveryPolicy);
router.get("/legal-and-compliance/disclaimer", customerController.disclaimer);
router.get("/sitemap", customerController.SiteMap);
router.get("/support-and-help/warranty", customerController.warranty);

module.exports = router;
