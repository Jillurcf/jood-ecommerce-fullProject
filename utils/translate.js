const axios = require("axios");

const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;

async function translateText(text, targetLang = "ar") {
  try {
    const response = await axios.post(
      `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`,
      {
        q: text,
        target: targetLang,
        format: "text"
      }
    );

    return response.data.data.translations[0].translatedText;
  } catch (error) {
    console.error("Translation error:", error.response?.data || error.message);
    return text;
  }
}

module.exports = translateText;