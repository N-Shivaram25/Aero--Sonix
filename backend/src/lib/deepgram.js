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

  // Deepgram language parameters are model-dependent. Some languages (like Hindi/Telugu)
  // are specified without region in Deepgram's STT models.
  const sttLanguage = (() => {
    if (lang === "multi") return "multi";
    if (baseLang === "hi") return "hi";
    if (baseLang === "te") return "te";
    return lang;
  })();

  // Telugu is supported by nova-3. Prefer nova-3 for te / te-IN.
  const forceNova3 = baseLang === "te";

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

  // Default to nova-2 for supported base languages; fallback to nova-3 for others.
  const preferredModel = forceNova3 ? "nova-3" : (NOVA2_LANGS.has(baseLang) ? "nova-2" : "nova-3");

  const url = new URL("wss://api.deepgram.com/v1/listen");
  url.searchParams.set("model", preferredModel);
  url.searchParams.set("language", sttLanguage);
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  // A slightly longer endpointing produces more natural sentence boundaries.
  url.searchParams.set("endpointing", "700");
  // Ask Deepgram to emit sentence/utterance-level boundaries (best for captions).
  url.searchParams.set("utterances", "true");
  url.searchParams.set("vad_events", "true");
  url.searchParams.set("utterance_end_ms", "1200");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("channels", "1");

  // Optional: keyword boosting for names/terms to improve recognition.
  // Format: DEEPGRAM_KEYWORDS="Shiva:2,Shreekar:2,Aero Sonix:3"
  const keywordsRaw = String(process.env.DEEPGRAM_KEYWORDS || "").trim();
  if (keywordsRaw) {
    try {
      for (const raw of keywordsRaw.split(",")) {
        const item = String(raw || "").trim();
        if (!item) continue;
        url.searchParams.append("keywords", item);
      }
    } catch {
    }
  }

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
