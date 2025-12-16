import User from "../models/User.js";
import { getElevenLabsClient } from "../lib/elevenlabsClient.js";

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

    let voiceId;
    try {
      const elevenlabs = getElevenLabsClient();
      const blobs = files.map(
        (f) => new Blob([f.buffer], { type: f.mimetype || "audio/webm" })
      );

      const created = await elevenlabs.voices.ivc.create({
        name: voiceName,
        files: blobs,
        remove_background_noise: removeBackgroundNoise,
        description: description || undefined,
      });

      voiceId = created?.voiceId || created?.voice_id;
    } catch (sdkError) {
      // Fallback to direct multipart fetch for environments where SDK upload fails.
      const apiKeyFallback = process.env.ELEVENLABS_API_KEY;
      if (!apiKeyFallback) return res.status(500).json({ message: "ELEVENLABS_API_KEY is not set" });
      const form = new FormData();
      form.append("name", voiceName);
      if (description) form.append("description", description);
      form.append("remove_background_noise", String(removeBackgroundNoise));

      for (const f of files) {
        const blob = new Blob([f.buffer], { type: f.mimetype || "audio/webm" });
        form.append("files", blob, f.originalname || "voice.webm");
      }

      const elevenRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: {
          "xi-api-key": apiKeyFallback,
        },
        body: form,
      });

      const raw = await elevenRes.text();
      let json;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }

      if (!elevenRes.ok) {
        return res.status(elevenRes.status).json({
          message: "ElevenLabs voice cloning failed",
          details: json || raw,
        });
      }

      voiceId = json?.voice_id;
    }
    if (!voiceId) {
      return res.status(500).json({ message: "Voice cloning failed" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { elevenLabsVoiceId: voiceId },
      { new: true }
    ).select("-password");

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

    const user = await User.findById(userId).select("nativeLanguage elevenLabsVoiceId");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      success: true,
      nativeLanguage: user.nativeLanguage || "",
      elevenLabsVoiceId: user.elevenLabsVoiceId || "",
    });
  } catch (error) {
    console.error("Error in getMyVoiceProfile controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
