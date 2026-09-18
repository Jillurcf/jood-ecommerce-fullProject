const express = require("express");
const router = express.Router();
const translateText = require("../utils/translate");

router.post("/", async (req, res) => {
  try {
    const { text, target } = req.body;

    if (!text || !target) {
      return res.status(400).json({
        success: false,
        error: "text and target are required"
      });
    }

    const translated = await translateText(text, target);

    return res.json({
      success: true,
      original: text,
      translated
    });
  } catch (err) {
    console.error("Translation route error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Translation failed"
    });
  }
});

module.exports = router;