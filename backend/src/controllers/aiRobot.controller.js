import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import axios from "axios";
import Cerebras from '@cerebras/cerebras_cloud_sdk';

const DEFAULT_MODULE = "general";
const CEREBRAS_MODEL = "gpt-oss-120b";

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

  const formattingClause = `
FORMATTING RULES:
1. Use clear, concise bullet points for key explanations.
2. Use Markdown headers (###) for steps or sections.
3. Use triple backticks (\`\`\`python) for all code snippets.
4. Always put a blank line between paragraphs and sections.
5. Keep explanations simple and beginner-friendly.
6. If the user asks for code, provide a clear step-by-step implementation guide with simple examples.
7. Use bold text for important terms.
  `;

  if (module === "interview") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, an expert interview coach. Ask realistic questions, provide concise feedback, and keep the user engaged. ${langClause} ${formattingClause}`;
  }
  if (module === "english_fluency") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, a fluency coach. Correct grammar naturally and suggest better phrasing. ${langClause} ${formattingClause}`;
  }
  if (module === "language_learning") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, a dedicated language tutor. Teach with examples and corrections. ${langClause} ${formattingClause}`;
  }
  if (module === "programming") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, a technical mentor. Provide clean, correct code and explain concepts simply. ${langClause} ${formattingClause}`;
  }

  return `You are AeroSonix AI Assistant, a helpful and professional assistant. ${langClause} ${formattingClause}`;
};

export async function getVoices(req, res) {
  const speakers = [
    { voiceId: "shubh", voiceName: "Shubh (Male) - Default", isDefault: true },
    { voiceId: "ritu", voiceName: "Ritu (Female)", isDefault: false },
    { voiceId: "aditya", voiceName: "Aditya (Male)", isDefault: false },
    { voiceId: "priya", voiceName: "Priya (Female)", isDefault: false },
    { voiceId: "amit", voiceName: "Amit (Male)", isDefault: false },
    { voiceId: "simran", voiceName: "Simran (Female)", isDefault: false },
    { voiceId: "sumit", voiceName: "Sumit (Male)", isDefault: false },
    { voiceId: "kavya", voiceName: "Kavya (Female)", isDefault: false },
  ];
  return res.status(200).json({ success: true, voices: speakers });
}

export async function uploadVoice(req, res) {
  return res.status(501).json({ message: "Voice cloning not supported" });
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
  const logPrefix = `[AEROSONIX-AI][CEREBRAS-GPT-OSS][${new Date().toISOString()}]`;
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

    const apiKey = (process.env.CEREBRAS_API_KEY || "").trim();
    if (!apiKey) {
      console.error(`${logPrefix} Missing CEREBRAS_API_KEY in environment`);
      return res.status(500).json({
        message: "AeroSonix AI configuration missing on server.",
        error: "MISSING_KEY"
      });
    }

    const cerebras = new Cerebras({ apiKey });

    try {
      console.log(`${logPrefix} Calling Cerebras ${CEREBRAS_MODEL}...`);
      const response = await cerebras.chat.completions.create({
        model: CEREBRAS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedContext,
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_completion_tokens: 4096,
      });

      const reply = response.choices?.[0]?.message?.content?.trim() || "";

      if (!reply) {
        console.error(`${logPrefix} Empty response from Cerebras`);
        throw new Error("Received empty reply from AI service");
      }

      console.log(`${logPrefix} AI Reply generated successfully via Cerebras (Speed: ~3k t/s)`);

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
      console.error(`${logPrefix} Cerebras API Error:`, apiErr.message);
      return res.status(502).json({
        message: "AeroSonix AI service (Cerebras) is temporarily unavailable.",
        details: apiErr.message
      });
    }

  } catch (error) {
    console.error(`${logPrefix} Unhandled Error:`, error);
    return res.status(500).json({ message: "Internal server error during processing." });
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
  const logPrefix = `[AEROSONIX-AI][SARVAM-TTS][${new Date().toISOString()}]`;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, languageCode, speaker } = req.body || {};
    const apiKey = (process.env.SARVAM_API_KEY || "").trim();

    if (!apiKey) {
      console.error(`${logPrefix} Missing SARVAM_API_KEY`);
      return res.status(500).json({ message: "Sarvam API configuration missing." });
    }

    console.log(`${logPrefix} Calling Sarvam Bulbul V3: Speaker="${speaker || 'shubh'}", Length=${text?.length}`);

    const sarvamRes = await axios.post("https://api.sarvam.ai/text-to-speech", {
      text: text,
      target_language_code: languageCode || "en-IN",
      model: "bulbul:v3",
      speaker: speaker || "shubh",
      pace: 1.1,
      speech_sample_rate: 22050,
      enable_preprocessing: true
    }, {
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json"
      }
    });

    if (sarvamRes.data?.audios && sarvamRes.data.audios.length > 0) {
      // Decode the base64 response from Sarvam AI
      const audioBase64 = sarvamRes.data.audios[0];
      const audioBuffer = Buffer.from(audioBase64, 'base64');

      res.setHeader("Content-Type", "audio/mpeg");
      return res.status(200).send(audioBuffer);
    } else {
      console.error(`${logPrefix} Invalid response from Sarvam:`, sarvamRes.data);
      return res.status(500).json({ message: "Failed to generate audio from AI service." });
    }

  } catch (error) {
    const status = error.response?.status || 500;
    const errData = error.response?.data?.error || {};
    console.error(`${logPrefix} Sarvam API Error [${status}]:`, errData.message || error.message);

    return res.status(status).json({
      message: errData.message || "AeroSonix Voice service is temporarily unavailable.",
      code: errData.code
    });
  }
}

export async function sendConversationMessage(req, res) { return sendMessage(req, res); }
