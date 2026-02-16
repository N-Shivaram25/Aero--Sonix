import express from "express";
import axios from "axios";

const router = express.Router();

router.post("/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    if (!sourceLang || typeof sourceLang !== "string") {
      return res.status(400).json({ error: "sourceLang is required" });
    }
    if (!targetLang || typeof targetLang !== "string") {
      return res.status(400).json({ error: "targetLang is required" });
    }

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    console.log("[MyMemory] Translating", { text: text.substring(0, 80), sourceLang, targetLang });

    const response = await axios.get(url, { timeout: 8000 });
    const translatedText = response.data?.responseData?.translatedText;

    if (!translatedText) {
      console.error("[MyMemory] Invalid response:", response.data);
      return res.status(500).json({ error: "Translation failed: missing translatedText" });
    }

    console.log("[MyMemory] Translation result:", { original: text.substring(0, 80), translated: translatedText.substring(0, 80) });
    res.json({ translatedText });
  } catch (error) {
    console.error("[MyMemory] Translation error:", error.message);
    if (error.response) {
      console.error("[MyMemory] Response data:", error.response.data);
      console.error("[MyMemory] Response status:", error.response.status);
    }
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
