import express from "express";
import multer from "multer";
import { protectRoute } from "../middleware/auth.middleware.js";
import { cloneVoice, getMyVoiceProfile } from "../controllers/profile.controller.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB upper bound; Vercel limits still apply
  },
});

router.use(protectRoute);

router.get("/me", getMyVoiceProfile);
router.post("/clone-voice", upload.array("files", 10), cloneVoice);

export default router;
