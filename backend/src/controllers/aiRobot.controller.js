import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import axios from "axios";

const DEFAULT_MODULE = "general";

// OpenCode AI Zen / Ollama Cloud Configuration
// Based on search results, OpenCode Zen provides an OpenAI-compatible endpoint for these models.
const AI_BASE_URL = "https://opencode.ai/zen/v1";
const AI_MODEL = "gemini-3-flash-preview";

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
  const logPrefix = `[AI-ASSISTANT][ZEN-GEMINI][${new Date().toISOString()}]`;
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
      console.error(`${logPrefix} Missing Ollama_API_KEY (used for OpenCode) in environment`);
      return res.status(500).json({
        message: "API configuration missing on server (Ollama_API_KEY).",
        error: "MISSING_KEY"
      });
    }

    try {
      console.log(`${logPrefix} Calling OpenCode Zen API (${AI_MODEL})...`);

      // Using axios for better control over the endpoint structure
      const response = await axios.post(`${AI_BASE_URL}/chat/completions`, {
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedContext,
          { role: "user", content: message },
        ],
        stream: false
      }, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      });

      const reply = response.data?.choices?.[0]?.message?.content?.trim() || "";

      if (!reply) {
        console.error(`${logPrefix} Empty response:`, JSON.stringify(response.data));
        throw new Error("Received empty reply from AI service");
      }

      console.log(`${logPrefix} AI Reply generated successfully using Gemini 3 via OpenCode`);

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
      console.error(`${logPrefix} API Error:`, apiErr.response?.data || apiErr.message);

      // Handle the "Not Found" case gracefully if the endpoint changed
      if (apiErr.response?.status === 404) {
        return res.status(502).json({
          message: "Cloud endpoint misconfiguration. The model service URL was not found.",
          details: "Endpoint 404: Verify OLLAMA_HOST or OpenCode API status."
        });
      }

      return res.status(apiErr.response?.status || 502).json({
        message: "The AI service (OpenCode/Gemini 3) rejected the request. Please check your API key.",
        details: apiErr.response?.data || apiErr.message
      });
    }

  } catch (error) {
    console.error(`${logPrefix} Unhandled Error:`, error);
    return res.status(500).json({ message: "Internal server error during Gemini 3 processing." });
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
