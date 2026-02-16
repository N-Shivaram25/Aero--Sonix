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

export const toDeepgramLanguageCode = (language) => {
  if (!language || typeof language !== "string") return null;
  const key = language.trim().toLowerCase();

  const map = {
    english: "en",
    telugu: "te-IN",
    hindi: "hi-IN",
    spanish: "es",
    french: "fr",
    german: "de",
    mandarin: "zh",
    japanese: "ja",
    korean: "ko",
    russian: "ru",
    portuguese: "pt",
    arabic: "ar",
    italian: "it",
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

export const toGoogleSttLanguageCode = (language) => {
  if (!language || typeof language !== "string") return null;
  const key = language.trim().toLowerCase();

  const map = {
    english: "en-US",
    telugu: "te-IN",
    hindi: "hi-IN",
    spanish: "es-ES",
    french: "fr-FR",
    german: "de-DE",
    mandarin: "cmn-Hans-CN",
    japanese: "ja-JP",
    korean: "ko-KR",
    russian: "ru-RU",
    portuguese: "pt-BR",
    arabic: "ar-SA",
    italian: "it-IT",
    turkish: "tr-TR",
    dutch: "nl-NL",
    vietnamese: "vi-VN",
    swedish: "sv-SE",
    polish: "pl-PL",
    greek: "el-GR",
    hebrew: "he-IL",
  };

  return map[key] || null;
};

export const toMyMemoryLanguageCode = (language) => {
  if (!language || typeof language !== "string") return null;
  const key = language.trim().toLowerCase();

  const map = {
    english: "en",
    telugu: "te",
    hindi: "hi",
    spanish: "es",
    french: "fr",
    german: "de",
    mandarin: "zh",
    japanese: "ja",
    korean: "ko",
    russian: "ru",
    portuguese: "pt",
    arabic: "ar",
    italian: "it",
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
