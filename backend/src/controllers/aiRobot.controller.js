import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import { getOpenRouterClient } from "../lib/openRouterClient.js";
import { getSarvamAIClient } from "../lib/sarvamClient.js";
import axios from "axios";

const DEFAULT_MODULE = "general";

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
  const langClause = `Respond only in ${lang}.`;

  if (module === "interview") {
    return `You are AI Assistant on the ${pageName} page, an interview coach. Ask realistic interview questions, follow up based on the user's answers, and give concise feedback and improvement tips. ${langClause}`;
  }
  if (module === "english_fluency") {
    return `You are AI Assistant on the ${pageName} page, an English fluency coach. Help the user speak clearly and naturally. Correct grammar gently, suggest better phrasing, and ask short follow-up questions to keep them speaking. ${langClause}`;
  }
  if (module === "language_learning") {
    return `You are AI Assistant on the ${pageName} page, a language tutor. Teach step-by-step with examples, short exercises, and quick corrections. Keep responses concise and interactive. ${langClause}`;
  }
  if (module === "programming") {
    return `You are AI Assistant on the ${pageName} page, a programming mentor. Ask clarifying questions, propose clean solutions, and explain concepts clearly. When giving code, keep it minimal and correct. ${langClause}`;
  }

  return `You are AI Assistant on the ${pageName} page, a helpful assistant. ${langClause}`;
};

export async function getVoices(req, res) {
  // Simplified for Sarvam - they have predefined speakers
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

    const openrouter = getOpenRouterClient();
    const trimmedContext = priorMessages.slice(-20).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const response = await openrouter.chat.send({
      model: "google/gemma-3-4b-it:free",
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedContext,
        { role: "user", content: message },
      ],
    });

    const reply = response.choices?.[0]?.message?.content?.trim() || "";

    await AiRobotHistory.findOneAndUpdate(
      { userId, module },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", text: message },
              { role: "assistant", text: reply || "" },
            ],
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true, module, reply });
  } catch (error) {
    console.error("Error in sendMessage controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function stt(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    const languageCode = String(req.body?.languageCode || "en-IN").trim();

    const sarvam = getSarvamAIClient();

    // We'll use axios directly if SDK has issues or to ensure multi-part works well
    // But let's try Sarvam SDK first as per documentation
    const response = await sarvam.speechToText.transcribe({
      file: new Blob([file.buffer], { type: file.mimetype || "audio/wav" }),
      model: "saaras:v3",
      mode: "transcribe",
      "language-code": languageCode
    });

    const text = String(response.transcript || "").trim();
    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("Error in aiRobot stt controller", error);
    return res.status(500).json({ message: "Transcription failed", details: error.message });
  }
}

export async function translate(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, targetLanguageCode, sourceLanguageCode } = req.body || {};
    if (!text) return res.status(400).json({ message: "text is required" });

    const sarvam = getSarvamAIClient();
    const response = await sarvam.text.translate({
      input: text,
      source_language_code: sourceLanguageCode || "auto",
      target_language_code: targetLanguageCode || "hi-IN",
    });

    return res.status(200).json({ success: true, translatedText: response.translated_text });
  } catch (error) {
    console.error("Error in aiRobot translate controller", error);
    return res.status(500).json({ message: "Translation failed" });
  }
}

export async function tts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, languageCode, speaker } = req.body || {};
    if (!text) return res.status(400).json({ message: "text is required" });

    const sarvam = getSarvamAIClient();
    const response = await sarvam.textToSpeech.convert({
      text,
      target_language_code: languageCode || "en-IN",
      model: "bulbul:v3",
      speaker: speaker || "shubh"
    });

    // Sarvam SDK response might be a buffer or a JSON with base64 depending on version
    // Based on doc it seems to return the audio data
    if (response && response.audio) {
      const buffer = Buffer.from(response.audio, 'base64');
      res.setHeader("Content-Type", "audio/mpeg");
      return res.status(200).send(buffer);
    }

    return res.status(500).json({ message: "TTS failed" });
  } catch (error) {
    console.error("Error in aiRobot tts controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendConversationMessage(req, res) { return sendMessage(req, res); }
