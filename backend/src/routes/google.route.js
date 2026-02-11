import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { GoogleCloudTranslation } from "../lib/googleCloud.js";

const router = express.Router();

router.use(protectRoute);

router.get("/languages", async (req, res) => {
  try {
    const target = String(req.query.target || "en");
    const translationService = new GoogleCloudTranslation();
    const languages = await translationService.listSupportedLanguages(target);
    res.status(200).json({ count: languages.length, languages });
  } catch {
    res.status(500).json({ message: "Failed to list supported languages" });
  }
});

export default router;
