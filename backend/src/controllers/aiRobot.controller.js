import AiRobotVoice from "../models/AiRobotVoice.js";
import AiRobotHistory from "../models/AiRobotHistory.js";
import User from "../models/User.js";
import { getElevenLabsClient } from "../lib/elevenlabsClient.js";
import { getOpenAIClient } from "../lib/openaiClient.js";

const DEFAULT_MODULE = "general";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (promise, timeoutMs) => {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const normalizeAudioMimeType = (value) => {
  if (!value || typeof value !== "string") return "audio/webm";
  const trimmed = value.trim();
  const semi = trimmed.indexOf(";");
  return semi === -1 ? trimmed : trimmed.slice(0, semi);
};

const createElevenLabsVoice = async ({ voiceName, files, removeBackgroundNoise, description }) => {
  const blobs = files.map(
    (f) =>
      new Blob([f.buffer], {
        type: normalizeAudioMimeType(f.mimetype) || "audio/webm",
      })
  );

  try {
    const elevenlabs = getElevenLabsClient();
    const created = await withTimeout(
      elevenlabs.voices.ivc.create({
        name: voiceName,
        files: blobs,
        remove_background_noise: removeBackgroundNoise,
        description: description || undefined,
      }),
      45000
    );
    const voiceId = created?.voiceId || created?.voice_id;
    if (voiceId) return voiceId;
  } catch {
    // ignore
  }

  const apiKeyFallback = process.env.ELEVENLABS_API_KEY;
  if (!apiKeyFallback) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  const controller = new AbortController();
  const abortId = setTimeout(() => controller.abort(), 45000);
  try {
    const form = new FormData();
    form.append("name", voiceName);
    if (description) form.append("description", description);
    form.append("remove_background_noise", String(removeBackgroundNoise));

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const blob = new Blob([f.buffer], { type: normalizeAudioMimeType(f.mimetype) || "audio/webm" });
      form.append("files", blob, f.originalname || `voice_${i + 1}.webm`);
    }

    const elevenRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: {
        "xi-api-key": apiKeyFallback,
      },
      body: form,
      signal: controller.signal,
    });

    const raw = await elevenRes.text();
    let json;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    if (!elevenRes.ok) {
      const details = json || raw || "";
      const asText = typeof details === "string" ? details : JSON.stringify(details);
      throw new Error(asText || "ElevenLabs voice cloning failed");
    }

    const voiceId = json?.voice_id;
    if (!voiceId) throw new Error("Voice cloning failed");
    return voiceId;
  } finally {
    clearTimeout(abortId);
  }
};

const createElevenLabsVoiceWithRetry = async (params) => {
  let lastError = "";
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await createElevenLabsVoice(params);
    } catch (e) {
      lastError = e?.message ? String(e.message) : "Voice cloning failed";
      if (attempt < attempts) await sleep(800 * attempt);
    }
  }
  throw new Error(lastError || "Voice cloning failed");
};

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
  const lang = String(language || "").trim();
  const langClause = lang ? `Respond in ${lang}.` : "Respond in the same language as the user.";

  if (module === "interview") {
    return `You are AI Robot on the ${pageName} page, an interview coach. Ask realistic interview questions, follow up based on the user's answers, and give concise feedback and improvement tips. ${langClause}`;
  }
  if (module === "english_fluency") {
    return `You are AI Robot on the ${pageName} page, an English fluency coach. Help the user speak clearly and naturally. Correct grammar gently, suggest better phrasing, and ask short follow-up questions to keep them speaking. ${langClause}`;
  }
  if (module === "language_learning") {
    return `You are AI Robot on the ${pageName} page, a language tutor. Teach step-by-step with examples, short exercises, and quick corrections. Keep responses concise and interactive. ${langClause}`;
  }
  if (module === "programming") {
    return `You are AI Robot on the ${pageName} page, a programming mentor. Ask clarifying questions, propose clean solutions, and explain concepts clearly. When giving code, keep it minimal and correct. ${langClause}`;
  }

  return `You are AI Robot on the ${pageName} page, a helpful assistant. ${langClause}`;
};

const getDefaultVoices = () => {
  const male = process.env.MALE_VOICE_ID || "";
  const female = process.env.FEMALE_VOICE_ID || "";

  const defaults = [];
  if (male) defaults.push({ voiceId: male, voiceName: "Default Male", isDefault: true });
  if (female) defaults.push({ voiceId: female, voiceName: "Default Female", isDefault: true });

  return defaults;
};

const isDefaultVoiceId = (voiceId) => {
  const defaults = getDefaultVoices();
  return defaults.some((v) => v.voiceId === voiceId);
};

export async function getVoices(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const userVoices = await AiRobotVoice.find({ userId })
      .select("voiceId voiceName createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      voices: [...getDefaultVoices(), ...userVoices.map((v) => ({
        voiceId: v.voiceId,
        voiceName: v.voiceName,
        createdAt: v.createdAt,
        isDefault: false,
      }))],
    });
  } catch (error) {
    console.error("Error in getVoices controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function uploadVoice(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const voiceName = String(req.body?.voiceName || req.body?.name || "").trim();
    if (!voiceName) {
      return res.status(400).json({ message: "voiceName is required" });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: "Voice file(s) are required" });
    }

    const removeBackgroundNoise = String(req.body?.remove_background_noise || "false") === "true";
    const description = String(req.body?.description || "").trim();

    let voiceId;
    try {
      voiceId = await createElevenLabsVoiceWithRetry({
        voiceName,
        files: files.map((f) => ({
          buffer: f.buffer,
          mimetype: f.mimetype,
          originalname: f.originalname,
        })),
        removeBackgroundNoise,
        description,
      });
    } catch (e) {
      return res.status(502).json({
        message: "ElevenLabs voice cloning failed",
        details: e?.message || "Voice cloning failed",
      });
    }

    const createdVoice = await AiRobotVoice.create({
      userId,
      voiceName,
      voiceId,
    });

    // Keep Profile page in sync with the most recently created voice.
    try {
      await User.findByIdAndUpdate(userId, {
        elevenLabsVoiceId: voiceId,
        elevenLabsVoiceCloneStatus: "ready",
        elevenLabsVoiceCloneError: "",
        elevenLabsVoiceCloneCompletedAt: new Date(),
      });
    } catch {
      // ignore
    }

    return res.status(201).json({
      success: true,
      voice: {
        voiceId: createdVoice.voiceId,
        voiceName: createdVoice.voiceName,
        createdAt: createdVoice.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Voice already exists" });
    }
    console.error("Error in uploadVoice controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function renameVoice(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const voiceId = String(req.params?.voiceId || "").trim();
    if (!voiceId) return res.status(400).json({ message: "voiceId is required" });
    if (isDefaultVoiceId(voiceId)) {
      return res.status(400).json({ message: "Default voices cannot be renamed" });
    }

    const voiceName = String(req.body?.voiceName || "").trim();
    if (!voiceName) return res.status(400).json({ message: "voiceName is required" });

    const updated = await AiRobotVoice.findOneAndUpdate(
      { userId, voiceId },
      { voiceName },
      { new: true }
    ).select("voiceId voiceName createdAt");

    if (!updated) return res.status(404).json({ message: "Voice not found" });

    return res.status(200).json({
      success: true,
      voice: {
        voiceId: updated.voiceId,
        voiceName: updated.voiceName,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    console.error("Error in renameVoice controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
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
    const language = String(req.body?.language || "").trim();

    const history = await AiRobotHistory.findOne({ userId, module }).select("messages");
    const priorMessages = Array.isArray(history?.messages) ? history.messages : [];

    const systemPrompt = buildSystemPrompt({ module, language });

    const openai = getOpenAIClient();
    const trimmedContext = priorMessages.slice(-20).map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [{ role: "system", content: systemPrompt }, ...trimmedContext, { role: "user", content: message }],
    });

    const reply = completion?.choices?.[0]?.message?.content?.trim() || "";

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "OPENAI_API_KEY is not set" });

    const form = new FormData();
    form.append("model", "whisper-1");
    form.append(
      "file",
      new Blob([file.buffer], { type: file.mimetype || "audio/webm" }),
      file.originalname || "audio.webm"
    );

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const json = await openaiRes.json().catch(() => null);
    if (!openaiRes.ok) {
      const retryAfter = openaiRes.headers?.get?.("retry-after");
      if (openaiRes.status === 429 && retryAfter) {
        try {
          res.setHeader("Retry-After", retryAfter);
        } catch {
          // ignore
        }
      }

      return res.status(openaiRes.status).json({
        message: openaiRes.status === 429 ? "Rate limit reached. Please wait and try again." : "Transcription failed",
        details: json,
      });
    }

    const text = String(json?.text || "").trim();

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("Error in aiRobot stt controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function translate(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, targetLanguage, sourceLanguage } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "text is required" });
    }
    if (!targetLanguage || typeof targetLanguage !== "string") {
      return res.status(400).json({ message: "targetLanguage is required" });
    }

    const cleanedText = String(text).trim();
    if (!cleanedText) return res.status(200).json({ success: true, translatedText: "" });

    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "GOOGLE_CLOUD_API_KEY is not set" });

    const toGoogleLanguageCode = (value) => {
      const v = String(value || "").trim();
      if (!v) return "";
      const key = v.toLowerCase();
      const map = {
        auto: "auto",
        telugu: "te",
        hindi: "hi",
        spanish: "es",
        french: "fr",
        german: "de",
        tamil: "ta",
        kannada: "kn",
        malayalam: "ml",
        english: "en",
      };
      if (map[key]) return map[key];
      if (/^[a-z]{2}(-[a-z]{2})?$/i.test(v)) return v;
      return "";
    };

    const source = toGoogleLanguageCode(sourceLanguage);
    const target = toGoogleLanguageCode(targetLanguage);
    if (!target) {
      return res.status(400).json({ message: "Unsupported targetLanguage" });
    }
    if (sourceLanguage && !source) {
      return res.status(400).json({ message: "Unsupported sourceLanguage" });
    }

    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
    const googleRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: cleanedText,
        ...(source && source !== "auto" ? { source } : {}),
        target,
        format: "text",
      }),
    });

    const json = await googleRes.json().catch(() => null);
    if (!googleRes.ok) {
      return res.status(googleRes.status).json({
        message: "Translation failed",
        details: json,
      });
    }

    const translatedText = String(json?.data?.translations?.[0]?.translatedText || "");
    return res.status(200).json({ success: true, translatedText });
  } catch (error) {
    console.error("Error in aiRobot translate controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

const readerToBuffer = async (reader) => {
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
};

export async function tts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { text, voiceId, voiceGender } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "text is required" });
    }

    const explicitVoiceId = String(voiceId || "").trim();
    const gender = String(voiceGender || "").trim().toLowerCase();
    const selectedVoiceId = explicitVoiceId
      ? explicitVoiceId
      : gender === "male"
        ? String(process.env.MALE_VOICE_ID || "").trim()
        : gender === "female"
          ? String(process.env.FEMALE_VOICE_ID || "").trim()
          : "";

    if (!selectedVoiceId) {
      return res.status(400).json({ message: "voiceId or voiceGender is required" });
    }

    // Only enforce ownership if the user provided a specific voiceId (custom voice).
    if (explicitVoiceId) {
      if (!isDefaultVoiceId(selectedVoiceId)) {
        const owned = await AiRobotVoice.findOne({ userId, voiceId: selectedVoiceId }).select("_id");
        if (!owned) return res.status(404).json({ message: "Voice not found" });
      }
    }

    let audio;
    try {
      const elevenlabs = getElevenLabsClient();
      audio = await elevenlabs.textToSpeech.convert(selectedVoiceId, {
        text,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      });
    } catch (e) {
      const status = e?.statusCode || e?.status || e?.response?.status;
      const details = e?.response?.data || e?.body || e?.message;
      return res.status(status || 502).json({
        message: "ElevenLabs TTS failed",
        details,
      });
    }

    const reader = audio.getReader();
    const buffer = await readerToBuffer(reader);

    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Error in aiRobot tts controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
