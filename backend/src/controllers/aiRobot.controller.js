import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import axios from "axios";

const DEFAULT_MODULE = "general";

// NVIDIA Configuration
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Primary DeepSeek model slugs for NVIDIA
const PRIMARY_MODEL = "deepseek-ai/deepseek-v3.2";
const SECONDARY_MODEL = "deepseek-ai/deepseek-v3";
const SANITY_CHECK_MODEL = "meta/llama-3.1-8b-instruct"; // Guaranteed model for NIMs

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
  const logPrefix = `[AI-ASSISTANT][NVIDIA-DEEPSEEK][${new Date().toISOString()}]`;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ message: "message is required" });

    const module = normalizeModule(req.body?.module);
    const language = String(req.body?.language || "English").trim();

    const history = await AiRobotHistory.findOne({ userId, module }).select("messages");
    const priorMessages = Array.isArray(history?.messages) ? history.messages : [];

    const systemPrompt = buildSystemPrompt({ module, language });
    const trimmedContext = priorMessages.slice(-15).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    // Support both keys from .env
    const apiKey = (process.env.DEEPSEEK_V3_2 || process.env["DEEPSEEK_V3.2"] || "").trim();

    if (!apiKey) {
      console.error(`${logPrefix} Missing NVIDIA/DeepSeek API Key in environment`);
      return res.status(500).json({
        message: "AI service key (DEEPSEEK_V3_2) is missing on server.",
        error: "MISSING_KEY"
      });
    }

    const performCall = async (model, useThinking = false) => {
      const payload = {
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedContext,
          { role: "user", content: message },
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 4096,
      };

      if (useThinking) {
        payload.chat_template_kwargs = { thinking: true };
      }

      console.log(`${logPrefix} Attempting: ${model} (Thinking: ${useThinking})`);

      return axios.post(`${NVIDIA_BASE_URL}/chat/completions`, payload, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 90000
      });
    };

    let response;
    try {
      // Round 1: Primary + Thinking
      response = await performCall(PRIMARY_MODEL, true);
    } catch (e1) {
      console.warn(`${logPrefix} R1 Failed: ${e1.response?.data?.error?.message || e1.message}`);
      try {
        // Round 2: Secondary + Thinking
        response = await performCall(SECONDARY_MODEL, true);
      } catch (e2) {
        console.warn(`${logPrefix} R2 Failed: Trying without thinking parameter...`);
        try {
          // Round 3: Secondary (No extras)
          response = await performCall(SECONDARY_MODEL, false);
        } catch (e3) {
          console.warn(`${logPrefix} R3 Failed: Trying Sanity Check Model (Llama 8B)...`);
          try {
            // Round 4: Sanity Check
            response = await performCall(SANITY_CHECK_MODEL, false);
          } catch (e4) {
            console.error(`${logPrefix} ALL ATTEMPTS FAILED.`);
            const lastError = e4.response?.data || e4.message;
            console.error(`${logPrefix} Last Error Content:`, JSON.stringify(lastError));

            return res.status(e4.response?.status || 502).json({
              message: "The AI service rejected the request. Please verify your NVIDIA API key and account status.",
              details: lastError
            });
          }
        }
      }
    }

    const reply = response.data?.choices?.[0]?.message?.content?.trim() || "";
    const reasoning = response.data?.choices?.[0]?.message?.reasoning_content;

    if (reasoning) {
      console.log(`${logPrefix} Reasoning Captured (Partial): ${reasoning.substring(0, 100)}...`);
    }

    if (!reply) throw new Error("Received empty response from NVIDIA");

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
    console.error(`${logPrefix} Controller Overflow:`, error);
    return res.status(500).json({ message: "Internal Server Emergency Error" });
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
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendConversationMessage(req, res) { return sendMessage(req, res); }
