import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import axios from "axios";

const DEFAULT_MODULE = "general";

// OpenRouter model IDs - Free models
const PRIMARY_MODEL = "google/gemma-3-4b-it:free";
const FALLBACK_MODEL = "google/gemma-2-9b-it:free";

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
  const logPrefix = `[AI-ASSISTANT][SEND_MESSAGE][${new Date().toISOString()}]`;
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
    const trimmedContext = priorMessages.slice(-15).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    // Securely pull and trim API Key
    const apiKeyRaw = process.env.OPEN_ROUTER_API_KEY || "";
    const apiKey = apiKeyRaw.trim();

    if (!apiKey) {
      console.error(`${logPrefix} Missing OPEN_ROUTER_API_KEY in environment`);
      return res.status(500).json({
        message: "AI service configuration missing on server",
        error: "MISSING_API_KEY"
      });
    }

    const tryModel = async (modelId) => {
      console.log(`${logPrefix} Attempting request to model: ${modelId}`);
      return axios.post("https://openrouter.ai/api/v1/chat/completions", {
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedContext,
          { role: "user", content: message },
        ],
        stream: false
      }, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aero-sonix.onrender.com",
          "X-Title": "AeroSonix"
        },
        timeout: 45000 // Increased to 45s for free models
      });
    };

    let response;
    try {
      response = await tryModel(PRIMARY_MODEL);
    } catch (primaryErr) {
      console.warn(`${logPrefix} Primary model (${PRIMARY_MODEL}) failed: ${primaryErr.response?.data?.error?.message || primaryErr.message}`);
      console.log(`${logPrefix} Attempting fallback to ${FALLBACK_MODEL}...`);
      try {
        response = await tryModel(FALLBACK_MODEL);
      } catch (fallbackErr) {
        console.error(`${logPrefix} Fallback model (${FALLBACK_MODEL}) also failed: ${fallbackErr.response?.data?.error?.message || fallbackErr.message}`);

        const errorDetails = fallbackErr.response?.data || fallbackErr.message;
        return res.status(fallbackErr.response?.status || 502).json({
          message: "AI service is currently busy or unavailable. Please try again in a few moments.",
          details: errorDetails
        });
      }
    }

    const reply = response.data?.choices?.[0]?.message?.content?.trim() || "";
    if (!reply) {
      throw new Error("Empty response received from OpenRouter");
    }

    console.log(`${logPrefix} AI Reply generated successfully (${reply.length} chars)`);

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

  } catch (error) {
    console.error(`${logPrefix} Unhandled Exception:`, error);
    return res.status(500).json({
      message: "An unexpected error occurred in the AI handler.",
      details: error.message
    });
  }
}

export async function stt(req, res) {
  const logPrefix = `[AI-ASSISTANT][STT][${new Date().toISOString()}]`;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ message: "Audio file is required" });

    const languageCode = String(req.body?.languageCode || "en-IN").trim();
    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    if (!apiKey) {
      console.error(`${logPrefix} Missing SARVAM_API_KEY`);
      return res.status(500).json({ message: "Speech service key missing" });
    }

    console.log(`${logPrefix} Processing audio for user ${userId}, langCode: ${languageCode}`);

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype || "audio/wav" });
    formData.append("file", blob, "audio.wav");
    formData.append("model", "saaras:v3");
    formData.append("language_code", languageCode);

    const sarvamRes = await axios.post("https://api.sarvam.ai/speech-to-text", formData, {
      headers: { "api-subscription-key": apiKey }
    });

    const text = String(sarvamRes.data?.transcript || "").trim();
    console.log(`${logPrefix} Transcript Result: "${text}"`);

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.response?.data || error.message);
    return res.status(500).json({
      message: "Could not transcribe audio. Please try speaking again.",
      details: error.response?.data || error.message
    });
  }
}

export async function translate(req, res) {
  const logPrefix = `[AI-ASSISTANT][TRANSLATE][${new Date().toISOString()}]`;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, targetLanguageCode, sourceLanguageCode } = req.body || {};
    if (!text) return res.status(400).json({ message: "text is required" });

    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    console.log(`${logPrefix} Translating text to ${targetLanguageCode}`);

    const sarvamRes = await axios.post("https://api.sarvam.ai/translate", {
      input: text,
      source_language_code: sourceLanguageCode || "auto",
      target_language_code: targetLanguageCode || "hi-IN",
      mode: "modern-colloquial"
    }, {
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json"
      }
    });

    return res.status(200).json({ success: true, translatedText: sarvamRes.data?.translated_text });
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.response?.data || error.message);
    return res.status(500).json({ message: "Translation failed" });
  }
}

export async function tts(req, res) {
  const logPrefix = `[AI-ASSISTANT][TTS][${new Date().toISOString()}]`;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, languageCode, speaker } = req.body || {};
    if (!text) return res.status(400).json({ message: "text is required" });

    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    console.log(`${logPrefix} Generating speech for text length: ${text.length}`);

    const sarvamRes = await axios.post("https://api.sarvam.ai/text-to-speech", {
      inputs: [text],
      target_language_code: languageCode || "en-IN",
      model: "bulbul:v3",
      speaker: speaker || "shubh"
    }, {
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json"
      }
    });

    if (sarvamRes.data?.audios?.[0]) {
      const buffer = Buffer.from(sarvamRes.data.audios[0], 'base64');
      res.setHeader("Content-Type", "audio/mpeg");
      return res.status(200).send(buffer);
    }

    console.error(`${logPrefix} No audio returned in responses`);
    return res.status(500).json({ message: "TTS audio generation failed" });
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.response?.data || error.message);
    return res.status(500).json({ message: "Internal Server Error in TTS" });
  }
}

export async function sendConversationMessage(req, res) { return sendMessage(req, res); }
