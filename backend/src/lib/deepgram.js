import { WebSocket } from "ws";

const requireDeepgramKey = () => {
  const key = String(process.env.DEEPGRAM_API_KEY || "").trim();
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
  return key;
};

export const createDeepgramConnection = ({ language }) => {
  const key = requireDeepgramKey();
  const lang = String(language || "").trim() || "multi";

  const url = new URL("wss://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-2");
  url.searchParams.set("language", lang);
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("endpointing", "300");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("channels", "1");

  const connection = new WebSocket(url.toString(), {
    headers: {
      Authorization: `Token ${key}`,
    },
  });

  // Expose a stable event-name mapping for server.js
  const LiveTranscriptionEvents = {
    Open: "open",
    Close: "close",
    Error: "error",
    Transcript: "message",
    Metadata: "message",
  };

  return { connection, LiveTranscriptionEvents };
};
