import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { GoogleCloudTranslation } from "../lib/googleCloud.js";

const router = express.Router();

router.use(protectRoute);

router.get("/languages", async (req, res) => {
  try {
    console.log('[GoogleRoutes] Fetching supported languages...');
    
    // Check if Google Cloud credentials are available
    if (!process.env.GOOGLE_CLOUD_API_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error('[GoogleRoutes] Missing Google Cloud credentials');
      return res.status(500).json({ 
        message: "Google Cloud credentials not configured",
        details: "Missing GOOGLE_CLOUD_API_KEY or GOOGLE_APPLICATION_CREDENTIALS"
      });
    }
    
    const target = String(req.query.target || "en");
    console.log('[GoogleRoutes] Target language:', target);
    
    const translationService = new GoogleCloudTranslation();
    const languages = await translationService.listSupportedLanguages(target);
    
    console.log('[GoogleRoutes] Successfully fetched', languages.length, 'languages');
    res.status(200).json({ count: languages.length, languages });
  } catch (error) {
    console.error('[GoogleRoutes] Error fetching supported languages:', error);
    console.error('[GoogleRoutes] Error stack:', error.stack);
    
    // Send more detailed error information in development
    const errorResponse = { 
      message: "Failed to list supported languages",
      error: error.message
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
      errorResponse.details = error.details || error.code;
    }
    
    res.status(500).json(errorResponse);
  }
});

export default router;
