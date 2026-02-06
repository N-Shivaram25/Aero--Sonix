import express from "express";
import multer from "multer";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  sendConversationMessage,
} from "../controllers/aiRobotConversations.controller.js";
import {
  getHistory,
  getVoices,
  renameVoice,
  sendMessage,
  stt,
  translate,
  tts,
  uploadVoice,
} from "../controllers/aiRobot.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protectRoute);

router.get("/voices", getVoices);
router.post("/voices/upload", upload.array("audioFiles", 10), uploadVoice);
router.put("/voices/:voiceId", renameVoice);

router.get("/history", getHistory);
router.post("/message", sendMessage);
router.post("/stt", upload.single("audio"), stt);
router.post("/translate", translate);
router.post("/tts", tts);

router.get("/conversations", listConversations);
router.post("/conversations", createConversation);
router.get("/conversations/:conversationId", getConversation);
router.delete("/conversations/:conversationId", deleteConversation);
router.post("/conversations/:conversationId/message", sendConversationMessage);

export default router;
