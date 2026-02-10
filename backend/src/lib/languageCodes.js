export const toElevenLabsLanguageCode = (nativeLanguage) => {
  if (!nativeLanguage || typeof nativeLanguage !== "string") return null;
  const key = nativeLanguage.trim().toLowerCase();

  const map = {
    english: "eng",
    hindi: "hin",
    telugu: "tel",
    spanish: "spa",
    french: "fra",
    german: "deu",
    arabic: "ara",
    portuguese: "por",
    russian: "rus",
    italian: "ita",
    japanese: "jpn",
    korean: "kor",
    mandarin: "cmn",
    turkish: "tur",
    dutch: "nld",
  };

  return map[key] || null;
};

export const toWhisperLanguageCode = (language) => {
  if (!language || typeof language !== "string") return null;
  const key = language.trim().toLowerCase();

  const map = {
    english: "en",
    hindi: "hi",
    telugu: "te",
    spanish: "es",
    french: "fr",
    german: "de",
    arabic: "ar",
    portuguese: "pt",
    russian: "ru",
    italian: "it",
    japanese: "ja",
    korean: "ko",
    mandarin: "zh",
    turkish: "tr",
    dutch: "nl",
    vietnamese: "vi",
    swedish: "sv",
    polish: "pl",
    greek: "el",
    hebrew: "he",
  };

  return map[key] || null;
};
