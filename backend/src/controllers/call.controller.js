import User from "../models/User.js";
import { getElevenLabsClient } from "../lib/elevenlabsClient.js";
import { getOpenAIClient } from "../lib/openaiClient.js";
import { toFile } from "openai/uploads";
import {
  toDeepgramLanguageCode,
  toElevenLabsLanguageCode,
  toGoogleSttLanguageCode,
  toWhisperLanguageCode,
} from "../lib/languageCodes.js";

const getFallbackVoiceId = (gender) => {
  const g = String(gender || "").toLowerCase();
  const male = process.env.MALE_VOICE_ID || "";
  const female = process.env.FEMALE_VOICE_ID || "";
  if (g === "male") return male;
  if (g === "female") return female;
  return male || female;
};

const getSpeakerUser = async ({ speakerUserId, fallbackUser }) => {
  const resolvedId = speakerUserId || fallbackUser?.id;
  if (!resolvedId) return null;
  const user = await User.findById(resolvedId).select(
    "nativeLanguage elevenLabsVoiceId fullName gender"
  );
  return user;
};

export async function getVoiceProfile(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const user = await User.findById(userId).select("nativeLanguage elevenLabsVoiceId gender");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      success: true,
      nativeLanguage: user.nativeLanguage || "",
      elevenLabsVoiceId: user.elevenLabsVoiceId || "",
      gender: user.gender || "",
    });
  } catch (error) {
    console.error("Error in getVoiceProfile controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function deepgramStt(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "DEEPGRAM_API_KEY is not set" });
    }

    const language = toDeepgramLanguageCode(req.body?.language);
    const mimetype = String(file.mimetype || "application/octet-stream");

    const url = new URL("https://api.deepgram.com/v1/listen");
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    if (language) url.searchParams.set("language", language);

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimetype,
      },
      body: file.buffer,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error || data?.message || "Deepgram STT request failed";
      return res.status(500).json({ message: msg });
    }

    const text =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      data?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
      "";

    return res.status(200).json({ success: true, text: String(text || "").trim() });
  } catch (error) {
    console.error("Error in deepgramStt controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function googleStt(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "GOOGLE_CLOUD_API_KEY is not set" });
    }

    const languageCode = toGoogleSttLanguageCode(req.body?.language) || "en-US";

    const mimetype = String(file.mimetype || "").toLowerCase();
    let encoding = "ENCODING_UNSPECIFIED";
    if (mimetype.includes("ogg")) encoding = "OGG_OPUS";
    else if (mimetype.includes("webm")) encoding = "WEBM_OPUS";

    const content = Buffer.from(file.buffer).toString("base64");

    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          languageCode,
          encoding,
          enableAutomaticPunctuation: true,
          model: "latest_long",
        },
        audio: { content },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error?.message || "Google STT request failed";
      return res.status(500).json({ message: msg });
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    const best = results?.[0]?.alternatives?.[0]?.transcript || "";
    const text = String(best || "").trim();

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("Error in googleStt controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function stt(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    const speakerUserId = req.body?.speakerUserId;
    const speaker = await getSpeakerUser({ speakerUserId, fallbackUser: req.user });
    if (!speaker) return res.status(404).json({ message: "Speaker user not found" });

    const languageCode = toElevenLabsLanguageCode(speaker.nativeLanguage);

    const elevenlabs = getElevenLabsClient();
    const audioBlob = new Blob([file.buffer], { type: file.mimetype || "audio/webm" });

    const transcription = await elevenlabs.speechToText.convert({
      file: audioBlob,
      modelId: "scribe_v2",
      languageCode: languageCode || null,
      diarize: false,
      tagAudioEvents: false,
    });

    const text = transcription?.text || transcription?.transcript || transcription?.transcription || "";

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("Error in stt controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function translate(req, res) {
  try {
    const { text, targetLanguage, speakerUserId } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "text is required" });
    }
    if (!targetLanguage || typeof targetLanguage !== "string") {
      return res.status(400).json({ message: "targetLanguage is required" });
    }

    const speaker = await getSpeakerUser({ speakerUserId, fallbackUser: req.user });
    if (!speaker) return res.status(404).json({ message: "Speaker user not found" });

    const sourceLanguage = speaker.nativeLanguage || "";

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a translation engine. Translate the user's text exactly and naturally. Return only the translated text with no extra words.",
        },
        {
          role: "user",
          content: `Translate from ${sourceLanguage || "the source language"} to ${targetLanguage}. Text: ${text}`,
        },
      ],
    });

    const translatedText = completion?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ success: true, translatedText });
  } catch (error) {
    console.error("Error in translate controller", error);
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
    const { text, speakerUserId } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "text is required" });
    }

    const speaker = await getSpeakerUser({ speakerUserId, fallbackUser: req.user });
    if (!speaker) return res.status(404).json({ message: "Speaker user not found" });

    const voiceId = speaker.elevenLabsVoiceId || getFallbackVoiceId(speaker.gender);
    if (!voiceId) {
      return res.status(500).json({ message: "No voice configured for TTS" });
    }

    const elevenlabs = getElevenLabsClient();
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });

    const reader = audio.getReader();
    const buffer = await readerToBuffer(reader);

    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Error in tts controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function whisperStt(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    const openai = getOpenAIClient();

    const language = toWhisperLanguageCode(req.body?.language);
    const translate = String(req.body?.translate || "").toLowerCase() === "true";
    const audioFile = await toFile(file.buffer, file.originalname || "audio.webm", {
      type: file.mimetype || "audio/webm",
    });

    let text = "";
    if (translate) {
      const translation = await openai.audio.translations.create({
        file: audioFile,
        model: "whisper-1",
      });
      text = translation?.text || "";
    } else {
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        ...(language ? { language } : {}),
      });
      text = transcription?.text || "";
    }

    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error("Error in whisperStt controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
