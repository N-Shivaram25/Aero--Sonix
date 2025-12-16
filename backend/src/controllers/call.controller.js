import User from "../models/User.js";
import { getElevenLabsClient } from "../lib/elevenlabsClient.js";
import { getOpenAIClient } from "../lib/openaiClient.js";
import { toElevenLabsLanguageCode } from "../lib/languageCodes.js";

const getSpeakerUser = async ({ speakerUserId, fallbackUser }) => {
  const resolvedId = speakerUserId || fallbackUser?.id;
  if (!resolvedId) return null;
  const user = await User.findById(resolvedId).select("nativeLanguage elevenLabsVoiceId fullName");
  return user;
};

export async function getVoiceProfile(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const user = await User.findById(userId).select("nativeLanguage elevenLabsVoiceId");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      success: true,
      nativeLanguage: user.nativeLanguage || "",
      elevenLabsVoiceId: user.elevenLabsVoiceId || "",
    });
  } catch (error) {
    console.error("Error in getVoiceProfile controller", error);
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

    const voiceId = speaker.elevenLabsVoiceId;
    if (!voiceId) {
      return res.status(400).json({
        message: "Speaker has not uploaded voice",
      });
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
