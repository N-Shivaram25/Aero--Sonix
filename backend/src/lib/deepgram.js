import { WebSocket } from "ws";

const requireDeepgramKey = () => {
  const key = String(process.env.DEEPGRAM_API_KEY || "").trim();
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
  return key;
};

export const createDeepgramConnection = ({ language }) => {
  const key = requireDeepgramKey();
  const lang = String(language || "").trim() || "multi";
  const baseLang = lang.split("-")[0];

  // Deepgram models have language availability constraints. Some languages (e.g. Telugu)
  // may not be supported by nova-2 and will cause a 400 during WS handshake.
  // We pick a safer fallback model for those cases.
  const NOVA2_LANGS = new Set([
    "en",
    "hi",
    "es",
    "fr",
    "de",
    "pt",
    "it",
    "nl",
    "sv",
    "pl",
    "ru",
    "ja",
    "ko",
    "zh",
    "ar",
    "tr",
    "vi",
    "el",
    "he",
    "multi",
  ]);

  // Telugu is supported by nova-3. Prefer nova-3 for te / te-IN.
  const forceNova3 = baseLang === "te";

  // Deepgram's /v1/listen is streaming-only. Use a streaming-capable model.
  const preferredModel = forceNova3 ? "nova-3" : (NOVA2_LANGS.has(lang) ? "nova-2" : "nova-3");

  const url = new URL("wss://api.deepgram.com/v1/listen");
  url.searchParams.set("model", preferredModel);
  url.searchParams.set("language", lang);
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("endpointing", "300");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("channels", "1");

  try {
    console.log("[Deepgram] listen url", url.toString());
  } catch {
  }

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
