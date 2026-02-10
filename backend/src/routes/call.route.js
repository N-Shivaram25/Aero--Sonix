import express from "express";
import multer from "multer";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getVoiceProfile, stt, translate, tts, whisperStt } from "../controllers/call.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protectRoute);

router.get("/voice-profile/:userId", getVoiceProfile);
router.post("/stt", upload.single("audio"), stt);
router.post("/whisper-stt", upload.single("audio"), whisperStt);
router.post("/translate", translate);
router.post("/tts", tts);

export default router;
