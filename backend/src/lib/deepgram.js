import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const requireDeepgramKey = () => {
  const key = String(process.env.DEEPGRAM_API_KEY || "").trim();
  if (!key) {
    throw new Error("DEEPGRAM_API_KEY is not set");
  }
  return key;
};

export const createDeepgramConnection = ({ language }) => {
  const deepgram = createClient(requireDeepgramKey());

  const lang = String(language || "").trim();
  const connection = deepgram.listen.live({
    model: "nova-2",
    language: lang || "multi",
    interim_results: true,
    smart_format: true,
    punctuate: true,
    endpointing: 300,
    encoding: "linear16",
    sample_rate: 16000,
    channels: 1,
  });

  return { connection, LiveTranscriptionEvents };
};
