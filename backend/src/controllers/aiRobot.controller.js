import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import axios from "axios";
import Cerebras from '@cerebras/cerebras_cloud_sdk';

const DEFAULT_MODULE = "general";
const CEREBRAS_MODEL = "llama3.1-8b";

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
    // MALE VOICES 
    { voiceId: "shubh", voiceName: "Shubh (Male) - Default", isDefault: true },
    { voiceId: "aditya", voiceName: "Aditya (Male)", isDefault: false },
    { voiceId: "rahul", voiceName: "Rahul (Male)", isDefault: false },
    { voiceId: "rohan", voiceName: "Rohan (Male)", isDefault: false },
    { voiceId: "amit", voiceName: "Amit (Male)", isDefault: false },
    { voiceId: "dev", voiceName: "Dev (Male)", isDefault: false },
    { voiceId: "ratan", voiceName: "Ratan (Male)", isDefault: false },
    { voiceId: "varun", voiceName: "Varun (Male)", isDefault: false },
    { voiceId: "manan", voiceName: "Manan (Male)", isDefault: false },
    { voiceId: "sumit", voiceName: "Sumit (Male)", isDefault: false },
    { voiceId: "kabir", voiceName: "Kabir (Male)", isDefault: false },
    { voiceId: "aayan", voiceName: "Aayan (Male)", isDefault: false },
    { voiceId: "ashutosh", voiceName: "Ashutosh (Male)", isDefault: false },
    { voiceId: "advait", voiceName: "Advait (Male)", isDefault: false },
    { voiceId: "anand", voiceName: "Anand (Male)", isDefault: false },
    { voiceId: "tarun", voiceName: "Tarun (Male)", isDefault: false },
    { voiceId: "sunny", voiceName: "Sunny (Male)", isDefault: false },
    { voiceId: "mani", voiceName: "Mani (Male)", isDefault: false },
    { voiceId: "gokul", voiceName: "Gokul (Male)", isDefault: false },
    { voiceId: "vijay", voiceName: "Vijay (Male)", isDefault: false },
    { voiceId: "mohit", voiceName: "Mohit (Male)", isDefault: false },
    { voiceId: "rehan", voiceName: "Rehan (Male)", isDefault: false },
    { voiceId: "soham", voiceName: "Soham (Male)", isDefault: false },

    // FEMALE VOICES
    { voiceId: "ritu", voiceName: "Ritu (Female)", isDefault: false },
    { voiceId: "priya", voiceName: "Priya (Female)", isDefault: false },
    { voiceId: "neha", voiceName: "Neha (Female)", isDefault: false },
    { voiceId: "pooja", voiceName: "Pooja (Female)", isDefault: false },
    { voiceId: "simran", voiceName: "Simran (Female)", isDefault: false },
    { voiceId: "kavya", voiceName: "Kavya (Female)", isDefault: false },
    { voiceId: "ishita", voiceName: "Ishita (Female)", isDefault: false },
    { voiceId: "shreya", voiceName: "Shreya (Female)", isDefault: false },
    { voiceId: "roopa", voiceName: "Roopa (Female)", isDefault: false },
    { voiceId: "amelia", voiceName: "Amelia (Female)", isDefault: false },
    { voiceId: "sophia", voiceName: "Sophia (Female)", isDefault: false },
    { voiceId: "tanya", voiceName: "Tanya (Female)", isDefault: false },
    { voiceId: "shruti", voiceName: "Shruti (Female)", isDefault: false },
    { voiceId: "suhani", voiceName: "Suhani (Female)", isDefault: false },
    { voiceId: "kavitha", voiceName: "Kavitha (Female)", isDefault: false },
    { voiceId: "rupali", voiceName: "Rupali (Female)", isDefault: false },
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
      console.error(`${logPrefix} !!! CRITICAL: SARVAM_API_KEY IS MISSING IN ENVIRONMENT !!!`);
      return res.status(500).json({
        success: false,
        message: "Sarvam AI key is not set. Check Render ENV variables.",
        error: "MISSING_KEY"
      });
    }

    if (!text) {
      return res.status(400).json({ success: false, message: "No text provided for TTS." });
    }

    // CHUNKING LOGIC: Sarvam has a 2500 limit. We use 2000 for safety.
    const MAX_LENGTH = 2000;
    const chunks = [];
    let remainingText = text;

    while (remainingText.length > 0) {
      if (remainingText.length <= MAX_LENGTH) {
        chunks.push(remainingText);
        break;
      }
      // Look for last period, newline or space within the MAX_LENGTH boundary
      let splitIdx = remainingText.lastIndexOf(". ", MAX_LENGTH);
      if (splitIdx === -1) splitIdx = remainingText.lastIndexOf("\n", MAX_LENGTH);
      if (splitIdx === -1) splitIdx = remainingText.lastIndexOf(" ", MAX_LENGTH);
      if (splitIdx === -1) splitIdx = MAX_LENGTH;

      chunks.push(remainingText.substring(0, splitIdx + 1).trim());
      remainingText = remainingText.substring(splitIdx + 1).trim();
    }

    console.log(`${logPrefix} Processing ${chunks.length} chunks for long-form text (Total: ${text.length} chars)`);

    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`${logPrefix} Processing Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);

      const payload = {
        text: chunks[i],
        target_language_code: languageCode || "en-IN",
        model: "bulbul:v3",
        speaker: speaker || "shubh",
        pace: 1.1,
        speech_sample_rate: 22050,
        enable_preprocessing: true
      };

      const sarvamRes = await axios.post("https://api.sarvam.ai/text-to-speech", payload, {
        headers: {
          "api-subscription-key": apiKey,
          "Content-Type": "application/json"
        },
        timeout: 15000
      });

      if (sarvamRes.data?.audios?.[0]) {
        audioBuffers.push(Buffer.from(sarvamRes.data.audios[0], 'base64'));
      } else {
        console.error(`${logPrefix} Chunk ${i + 1} failed: Empty audio response.`);
        throw new Error(`Empty audio response for chunk ${i + 1}`);
      }
    }

    const buffer = Buffer.concat(audioBuffers);
    console.log(`${logPrefix} Success: Combined ${chunks.length} chunks into a single ${buffer.length} byte stream.`);
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(buffer);

  } catch (error) {
    const status = error.response?.status || 500;
    const errBody = error.response?.data || {};
    const errorMsg = errBody.error?.message || errBody.message || error.message;

    console.error(`${logPrefix} !!! SARVAM API ERROR [${status}] !!!`);
    console.error(`${logPrefix} Full Error Response:`, JSON.stringify(errBody));

    return res.status(status).json({
      success: false,
      message: `Sarvam AI Error: ${errorMsg}`,
      details: errorMsg,
      code: errBody.error?.code || "TTS_UNKNOWN"
    });
  }
}

export async function sendConversationMessage(req, res) { return sendMessage(req, res); }
