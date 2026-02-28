import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import axios from "axios";
import { Ollama } from "ollama";

const DEFAULT_MODULE = "general";

// Ollama / OpenCode Configuration
const OLLAMA_HOST = "https://api.opencode.ai/v1"; // Common cloud base for OpenCode Ollama
const OLLAMA_MODEL = "gemini-3-flash-preview";

const normalizeModule = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return DEFAULT_MODULE;
  const allowed = new Set([
    "general",
    "interview",
    "english_fluency",
    "language_learning",
    "programming",
  ]);
  return allowed.has(v) ? v : DEFAULT_MODULE;
};

const moduleLabel = (module) => {
  if (module === "interview") return "Interview";
  if (module === "english_fluency") return "English Fluency";
  if (module === "language_learning") return "Language Learning";
  if (module === "programming") return "Programming";
  return "Home";
};

const buildSystemPrompt = ({ module, language }) => {
  const pageName = moduleLabel(module);
  const lang = String(language || "English").trim();
  const langClause = `You MUST respond only in ${lang}. DO NOT speak in English unless specifically asked. Respond in the native script of the selected language.`;

  if (module === "interview") {
    return `You are AI Assistant (Jarvis) on the ${pageName} page, an interview coach. Ask realistic interview questions, follow up based on the user's answers, and give concise feedback and improvement tips. ${langClause}`;
  }
  if (module === "english_fluency") {
    return `You are AI Assistant (Jarvis) on the ${pageName} page, an English fluency coach. Help the user speak clearly and naturally. Correct grammar gently, suggest better phrasing, and ask short follow-up questions to keep them speaking. ${langClause}`;
  }
  if (module === "language_learning") {
    return `You are AI Assistant (Jarvis) on the ${pageName} page, a language tutor. Teach step-by-step with examples, short exercises, and quick corrections. Keep responses concise and interactive. ${langClause}`;
  }
  if (module === "programming") {
    return `You are AI Assistant (Jarvis) on the ${pageName} page, a programming mentor. Ask clarifying questions, propose clean solutions, and explain concepts clearly. When giving code, keep it minimal and correct. ${langClause}`;
  }

  return `You are AI Assistant (Jarvis) on the ${pageName} page, a helpful assistant. ${langClause}`;
};

export async function getVoices(req, res) {
  const speakers = [
    { voiceId: "shubh", voiceName: "Shubh (Male)", isDefault: true },
    { voiceId: "aditya", voiceName: "Aditya (Male)", isDefault: true },
    { voiceId: "ritu", voiceName: "Ritu (Female)", isDefault: true },
    { voiceId: "priya", voiceName: "Priya (Female)", isDefault: true },
  ];
  return res.status(200).json({ success: true, voices: speakers });
}

export async function uploadVoice(req, res) {
  return res.status(501).json({ message: "Voice cloning not supported with Sarvam AI" });
}

export async function renameVoice(req, res) {
  return res.status(501).json({ message: "Not implemented" });
}

export async function getHistory(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const module = normalizeModule(req.query?.module);
    const history = await AiRobotHistory.findOne({ userId, module }).select("messages updatedAt");

    return res.status(200).json({
      success: true,
      module,
      messages: history?.messages || [],
      updatedAt: history?.updatedAt || null,
    });
  } catch (error) {
    console.error("Error in getHistory controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendMessage(req, res) {
  const logPrefix = `[AI-ASSISTANT][OLLAMA-GEMINI][${new Date().toISOString()}]`;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ message: "message is required" });

    const module = normalizeModule(req.body?.module);
    const language = String(req.body?.language || "English").trim();

    console.log(`${logPrefix} User: ${userId}, Message: "${message}", Language: "${language}"`);

    const history = await AiRobotHistory.findOne({ userId, module }).select("messages");
    const priorMessages = Array.isArray(history?.messages) ? history.messages : [];

    const systemPrompt = buildSystemPrompt({ module, language });
    const trimmedContext = priorMessages.slice(-10).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const apiKey = (process.env.Ollama_API_KEY || "").trim();
    if (!apiKey) {
      console.error(`${logPrefix} Missing Ollama_API_KEY in environment`);
      return res.status(500).json({
        message: "Ollama configuration missing on server.",
        error: "MISSING_KEY"
      });
    }

    // Initialize Ollama with Cloud Host and API Key
    const ollama = new Ollama({
      host: OLLAMA_HOST,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    try {
      console.log(`${logPrefix} Calling Ollama ${OLLAMA_MODEL}...`);
      const response = await ollama.chat({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedContext,
          { role: "user", content: message },
        ],
        stream: false
      });

      const reply = response.message?.content?.trim() || "";

      if (!reply) throw new Error("Empty reply from Ollama service");

      console.log(`${logPrefix} AI Reply generated using Ollama Gemini 3 Flash Preview`);

      await AiRobotHistory.findOneAndUpdate(
        { userId, module },
        {
          $push: {
            messages: {
              $each: [
                { role: "user", text: message },
                { role: "assistant", text: reply },
              ],
            },
          },
        },
        { upsert: true, new: true }
      );

      return res.status(200).json({ success: true, module, reply });

    } catch (apiErr) {
      console.error(`${logPrefix} Ollama Error:`, apiErr);
      // Fallback or detailed error
      return res.status(502).json({
        message: "Ollama service (Gemini 3) rejected the request. Verify server status.",
        details: apiErr.message
      });
    }

  } catch (error) {
    console.error(`${logPrefix} Unhandled Error in sendMessage:`, error);
    return res.status(500).json({ message: "Internal server error during AI processing." });
  }
}

export async function stt(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ message: "Audio file is required" });

    const languageCode = String(req.body?.languageCode || "en-IN").trim();
    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype || "audio/wav" });
    formData.append("file", blob, "audio.wav");
    formData.append("model", "saaras:v3");
    formData.append("language_code", languageCode);

    const sarvamRes = await axios.post("https://api.sarvam.ai/speech-to-text", formData, {
      headers: { "api-subscription-key": apiKey }
    });

    const text = String(sarvamRes.data?.transcript || "").trim();
    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("STT Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Transcription failed" });
  }
}

export async function translate(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, targetLanguageCode, sourceLanguageCode } = req.body || {};
    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    const sarvamRes = await axios.post("https://api.sarvam.ai/translate", {
      input: text,
      source_language_code: sourceLanguageCode || "auto",
      target_language_code: targetLanguageCode || "hi-IN",
      mode: "modern-colloquial"
    }, {
      headers: { "api-subscription-key": apiKey }
    });

    return res.status(200).json({ success: true, translatedText: sarvamRes.data?.translated_text });
  } catch (error) {
    return res.status(500).json({ message: "Translation failed" });
  }
}

export async function tts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, languageCode, speaker } = req.body || {};
    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    const sarvamRes = await axios.post("https://api.sarvam.ai/text-to-speech", {
      inputs: [text],
      target_language_code: languageCode || "en-IN",
      model: "bulbul:v3",
      speaker: speaker || "shubh"
    }, {
      headers: { "api-subscription-key": apiKey }
    });

    if (sarvamRes.data?.audios?.[0]) {
      const buffer = Buffer.from(sarvamRes.data.audios[0], 'base64');
      res.setHeader("Content-Type", "audio/mpeg");
      return res.status(200).send(buffer);
    }
    return res.status(500).json({ message: "TTS failed" });
  } catch (error) {
    console.error("TTS Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendConversationMessage(req, res) { return sendMessage(req, res); }
