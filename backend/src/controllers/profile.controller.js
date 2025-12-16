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

    const audioBlobs = files.map((f) => new Blob([f.buffer], { type: f.mimetype }));

    const elevenlabs = getElevenLabsClient();

    let response;
    try {
      response = await elevenlabs.voices.ivc.create({
        name: voiceName,
        files: audioBlobs,
        remove_background_noise: removeBackgroundNoise,
        description,
      });
    } catch (sdkErr) {
      // Some SDK versions have different param casing. Retry with camelCase.
      response = await elevenlabs.voices.ivc.create({
        name: voiceName,
        files: audioBlobs,
        removeBackgroundNoise,
        description,
      });
    }

    const voiceId = response?.voice_id || response?.voiceId || response?.voice_id;
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
