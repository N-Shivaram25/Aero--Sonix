import User from "../models/User.js";
import { getElevenLabsClient } from "../lib/elevenlabsClient.js";

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

const processCloneVoiceJob = async ({ userId, files, voiceName, description, removeBackgroundNoise }) => {
  let lastError = "";
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const voiceId = await createElevenLabsVoice({
        voiceName,
        files,
        removeBackgroundNoise,
        description,
      });

      await User.findByIdAndUpdate(userId, {
        elevenLabsVoiceId: voiceId,
        elevenLabsVoiceCloneStatus: "ready",
        elevenLabsVoiceCloneError: "",
        elevenLabsVoiceCloneCompletedAt: new Date(),
      });
      return voiceId;
    } catch (e) {
      lastError = e?.message ? String(e.message) : "Voice cloning failed";
      if (attempt < attempts) {
        await sleep(800 * attempt);
      }
    }
  }

  await User.findByIdAndUpdate(userId, {
    elevenLabsVoiceCloneStatus: "failed",
    elevenLabsVoiceCloneError: lastError || "Voice cloning failed",
    elevenLabsVoiceCloneCompletedAt: new Date(),
  });
  throw new Error(lastError || "Voice cloning failed");
};

export async function cloneVoice(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: "Voice file(s) are required" });
    }

    const voiceName = req.body?.name || req.user?.fullName || "Aerosonix Voice";
    const description = req.body?.description || "";
    const removeBackgroundNoise = String(req.body?.remove_background_noise || "false") === "true";

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ message: "ELEVENLABS_API_KEY is not set" });

    const existing = await User.findById(userId).select(
      "elevenLabsVoiceCloneStatus elevenLabsVoiceCloneStartedAt"
    );
    if (existing?.elevenLabsVoiceCloneStatus === "processing") {
      const startedAt = existing?.elevenLabsVoiceCloneStartedAt
        ? new Date(existing.elevenLabsVoiceCloneStartedAt).getTime()
        : 0;
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      if (elapsed < 5 * 60 * 1000) {
        return res.status(202).json({ success: true, status: "processing" });
      }
    }

    const now = new Date();
    await User.findByIdAndUpdate(userId, {
      elevenLabsVoiceId: "",
      elevenLabsVoiceCloneStatus: "processing",
      elevenLabsVoiceCloneError: "",
      elevenLabsVoiceCloneStartedAt: now,
      elevenLabsVoiceCloneCompletedAt: null,
    });

    const filePayloads = files.map((f) => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      originalname: f.originalname,
    }));

    let voiceId;
    try {
      voiceId = await processCloneVoiceJob({
        userId,
        files: filePayloads,
        voiceName,
        description,
        removeBackgroundNoise,
      });
    } catch (e) {
      const msg = e?.message ? String(e.message) : "Voice cloning failed";
      return res.status(502).json({
        message: "ElevenLabs voice cloning failed",
        details: msg,
      });
    }

    const updatedUser = await User.findById(userId).select("-password");
    return res.status(200).json({ success: true, voiceId, user: updatedUser });
  } catch (error) {
    console.error("Error in cloneVoice controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getMyVoiceProfile(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId).select(
      "nativeLanguage elevenLabsVoiceId elevenLabsVoiceCloneStatus elevenLabsVoiceCloneError"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      success: true,
      nativeLanguage: user.nativeLanguage || "",
      elevenLabsVoiceId: user.elevenLabsVoiceId || "",
      elevenLabsVoiceCloneStatus: user.elevenLabsVoiceCloneStatus || "idle",
      elevenLabsVoiceCloneError: user.elevenLabsVoiceCloneError || "",
    });
  } catch (error) {
    console.error("Error in getMyVoiceProfile controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
