document.addEventListener("DOMContentLoaded", () => {
  const dropdown = document.getElementById("languageDropdown");
  if (!dropdown) return;

  const STORAGE_KEY = "site_lang";
  const translatedCache = new Map();
  const originalMap = new WeakMap();

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : "";
  }

  function setPageDirection(lang) {
    const isRTL = lang === "ar";
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.body.dir = isRTL ? "rtl" : "ltr";
  }

  function shouldSkipNode(node) {
    if (!node || !node.parentElement) return true;

    const parent = node.parentElement;

    return Boolean(
      parent.closest("script") ||
      parent.closest("style") ||
      parent.closest("noscript") ||
      parent.closest("textarea") ||
      parent.closest("input") ||
      parent.closest("button") ||
      parent.closest("select") ||
      parent.closest("option") ||
      parent.closest(".no-translate")
    );
  }

  async function translateText(text, lang) {
    const key = `${lang}::${text}`;

    if (translatedCache.has(key)) {
      return translatedCache.get(key);
    }

    const headers = {
      "Content-Type": "application/json"
    };

    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["CSRF-Token"] = csrfToken;
    }

    const res = await fetch("/api/translate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        text,
        target: lang
      })
    });

    if (!res.ok) {
      throw new Error(`Translate API failed: ${res.status}`);
    }

    const data = await res.json();
    const translated = data.translated || text;

    translatedCache.set(key, translated);
    return translated;
  }

  async function translatePage(lang) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const buckets = new Map();

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (shouldSkipNode(node)) continue;

      const rawText = node.nodeValue;
      if (!rawText || !rawText.trim()) continue;

      if (!originalMap.has(node)) {
        originalMap.set(node, rawText);
      }

      const original = originalMap.get(node);
      const trimmed = original.trim();

      if (!buckets.has(trimmed)) {
        buckets.set(trimmed, []);
      }

      buckets.get(trimmed).push(node);
    }

    if (lang === "en") {
      for (const [text, nodes] of buckets.entries()) {
        for (const node of nodes) {
          const original = originalMap.get(node) || node.nodeValue;
          node.nodeValue = original;
        }
      }
      return;
    }

    const uniqueTexts = [...buckets.keys()];
    const translatedPairs = await Promise.all(
      uniqueTexts.map(async (text) => {
        const translated = await translateText(text, lang);
        return [text, translated];
      })
    );

    const translatedMap = new Map(translatedPairs);

    for (const [originalText, nodes] of buckets.entries()) {
      const translated = translatedMap.get(originalText) || originalText;

      for (const node of nodes) {
        const original = originalMap.get(node) || node.nodeValue;
        const leading = original.match(/^\s*/)?.[0] || "";
        const trailing = original.match(/\s*$/)?.[0] || "";
        node.nodeValue = leading + translated + trailing;
      }
    }
  }

  function setCarouselDirection(lang) {
    if (typeof window.jQuery === "undefined") return;
    if (typeof $.fn.owlCarousel !== "function") return;

    const isRTL = lang === "ar";

    $(".slider-active").each(function () {
      const $carousel = $(this);

      if ($carousel.hasClass("owl-loaded")) {
        $carousel.trigger("destroy.owl.carousel");
        $carousel.removeClass("owl-loaded owl-hidden");
        $carousel.find(".owl-stage-outer").children().unwrap();
        $carousel.find(".owl-stage").children().unwrap();
      }

      setTimeout(() => {
        $carousel.owlCarousel({
          items: 1,
          loop: true,
          autoplay: true,
          nav: true,
          dots: true,
          rtl: isRTL
        });

        $carousel.trigger("refresh.owl.carousel");
      }, 100);
    });
  }

  async function applyLanguage(lang) {
    const cleanLang = lang === "ar" ? "ar" : "en";

    localStorage.setItem(STORAGE_KEY, cleanLang);
    dropdown.value = cleanLang;

    setPageDirection(cleanLang);
    await translatePage(cleanLang);
    setCarouselDirection(cleanLang);
  }

  dropdown.addEventListener("change", async () => {
    const lang = dropdown.value || "en";
    await applyLanguage(lang);
  });

  const savedLang = localStorage.getItem(STORAGE_KEY) || "en";
  dropdown.value = savedLang;

  setPageDirection(savedLang);
  applyLanguage(savedLang);

  window.applySiteLanguage = applyLanguage;
});