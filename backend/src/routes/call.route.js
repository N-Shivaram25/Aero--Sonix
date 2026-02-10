import express from "express";
import multer from "multer";
import { protectRoute } from "../middleware/auth.middleware.js";
import { deepgramStt, getVoiceProfile, googleStt, stt, translate, tts, whisperStt } from "../controllers/call.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protectRoute);

router.get("/voice-profile/:userId", getVoiceProfile);
router.post("/deepgram-stt", upload.single("audio"), deepgramStt);
router.post("/google-stt", upload.single("audio"), googleStt);
router.post("/stt", upload.single("audio"), stt);
router.post("/whisper-stt", upload.single("audio"), whisperStt);
router.post("/translate", translate);
router.post("/tts", tts);

export default router;
