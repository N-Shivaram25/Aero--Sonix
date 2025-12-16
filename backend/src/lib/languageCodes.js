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
