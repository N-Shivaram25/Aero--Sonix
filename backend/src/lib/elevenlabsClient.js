import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const getElevenLabsClient = () => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  return new ElevenLabsClient({ apiKey });
};
