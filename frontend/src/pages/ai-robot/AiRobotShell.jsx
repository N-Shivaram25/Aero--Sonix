import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import toast from "react-hot-toast";
import { Mic, MicOff } from "lucide-react";
import { LANGUAGES } from "../../constants";
import {
  aiRobotSendConversationMessage,
  aiRobotStt,
  aiRobotTranslate,
  aiRobotTts,
  createAiRobotConversation,
  deleteAiRobotConversation,
  getAiRobotConversation,
  getAiRobotConversations,
  getAiRobotVoices,
  uploadAiRobotVoice,
} from "../../lib/api";

const ROUTES = [
  { path: "/ai-robot/home", key: "general", label: "Home" },
  { path: "/ai-robot/interview", key: "interview", label: "Interview" },
  { path: "/ai-robot/english-fluency", key: "english_fluency", label: "English Fluency" },
  { path: "/ai-robot/language-learning", key: "language_learning", label: "Language Learning" },
  { path: "/ai-robot/programming", key: "programming", label: "Programming" },
];

const mimePreference = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];

const VOICE_CHAT_MAX_MS = 30_000;
const VOICE_CLONE_MIN_SECONDS = 60;
const VOICE_CLONE_CLIP_MAX_MS = 30_000;
const VOICE_CLONE_TOTAL_MAX_SECONDS = 60;

const TRANSLATE_LANGUAGE_OPTIONS = [
  "Auto",
  "English",
  "Telugu",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Tamil",
  "Kannada",
  "Malayalam",
];

const toSpeechRecognitionLang = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v || v === "auto") return "en-US";
  const map = {
    english: "en-US",
    telugu: "te-IN",
    hindi: "hi-IN",
    spanish: "es-ES",
    french: "fr-FR",
    german: "de-DE",
    tamil: "ta-IN",
    kannada: "kn-IN",
    malayalam: "ml-IN",
  };
  return map[v] || "en-US";
};

const getSupportedMimeType = () => {
  for (const t of mimePreference) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // ignore
    }
  }
  return "";
};

const blobToFile = (blob, name) => {
  try {
    return new File([blob], name, { type: blob.type || "audio/webm" });
  } catch {
    return blob;
  }
};

const AiRobotShell = ({ moduleKey, title, subtitle }) => {
  const location = useLocation();

  const [language, setLanguage] = useState("English");

  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [loadingConversation, setLoadingConversation] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  const [voiceModeOn, setVoiceModeOn] = useState(false);
  const voiceModeTokenRef = useRef(0);
  const voiceModeOnRef = useRef(false);

  const aiSpeakingRef = useRef(false);

  const stopTimerRef = useRef(null);
  const audioRef = useRef(null);

  const voiceCloneTimerRef = useRef(null);
  const [voiceCloneSeconds, setVoiceCloneSeconds] = useState(0);

  const [voiceModalName, setVoiceModalName] = useState("");
  const [voiceSampleRecorder, setVoiceSampleRecorder] = useState(null);
  const [voiceSampleIsRecording, setVoiceSampleIsRecording] = useState(false);
  const [voiceSamples, setVoiceSamples] = useState([]);
  const [creatingVoiceId, setCreatingVoiceId] = useState(false);

  // New states for UI redesign
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState("");
  const [showTranscription, setShowTranscription] = useState(false);

  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [translateSourceLanguage, setTranslateSourceLanguage] = useState("Auto");
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState("Telugu");
  const [translateVoiceGender, setTranslateVoiceGender] = useState("Male");
  const [latestUtterance, setLatestUtterance] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const translateReqTokenRef = useRef(0);
  const [translateSettingsModalOpen, setTranslateSettingsModalOpen] = useState(false);

  const translateAudioRef = useRef(null);
  const translateSpeakTokenRef = useRef(0);
  const lastSpokenTranslationRef = useRef("");
  const [translationCountdown, setTranslationCountdown] = useState(0);
  const countdownIntervalRef = useRef(null);

  const [voiceStartModalOpen, setVoiceStartModalOpen] = useState(false);
  const [voiceStartWantsTranslate, setVoiceStartWantsTranslate] = useState(false);

  const liveTranscriptFinalRef = useRef("");

  // Web Speech API for real-time transcription display
  const recognitionRef = useRef(null);
  const recognitionSessionTokenRef = useRef(0);
  const voiceSampleStopTimerRef = useRef(null);

  const voiceSamplesTotalSeconds = useMemo(() => {
    return (voiceSamples || []).reduce((sum, s) => sum + (s?.seconds || 0), 0);
  }, [voiceSamples]);

  const activeTab = useMemo(() => {
    const path = String(location?.pathname || "");
    return ROUTES.find((r) => path.startsWith(r.path))?.path || "/ai-robot/home";
  }, [location]);

  const moduleLabel = useMemo(() => {
    return ROUTES.find((r) => r.key === moduleKey)?.label || "Home";
  }, [moduleKey]);

  const playAudioBuffer = (buffer) => {
    try {
      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        aiSpeakingRef.current = true;
        setIsResponding(true);
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.src = url;
        const p = audioRef.current.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            aiSpeakingRef.current = false;
            setIsResponding(false);
            toast.error("Audio playback blocked by browser. Tap Voice ON again to enable sound.");
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const stopSpeaking = () => {
    try {
      if (!audioRef.current) return;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      aiSpeakingRef.current = false;
      setIsResponding(false);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    voiceModeOnRef.current = voiceModeOn;
  }, [voiceModeOn]);

  useEffect(() => {
    try {
      if (!voiceModeOnRef.current) return;
      if (!isRecording) return;
      const rec = recorder;
      if (!rec || rec.state === "inactive") return;
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      // Restart recognition so the new language takes effect.
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }

      const sessionToken = Date.now();
      recognitionSessionTokenRef.current = sessionToken;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = toSpeechRecognitionLang(translateSourceLanguage);

      recognition.onstart = () => {
        setShowTranscription(true);
      };

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const t = result?.[0]?.transcript || "";
          if (result?.isFinal) {
            liveTranscriptFinalRef.current = `${liveTranscriptFinalRef.current} ${t}`.trim();
            const utter = String(t || "").trim();
            if (utter) setLatestUtterance(utter);
          } else {
            interim += t;
          }
        }
        const combined = `${liveTranscriptFinalRef.current} ${interim}`.trim();
        setLiveTranscription(combined);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
      };

      recognition.onend = () => {
        try {
          if (!voiceModeOnRef.current) return;
          if (recognitionSessionTokenRef.current !== sessionToken) return;
          if (rec.state === "inactive") return;
          setTimeout(() => {
            try {
              if (!voiceModeOnRef.current) return;
              if (recognitionSessionTokenRef.current !== sessionToken) return;
              if (rec.state === "inactive") return;
              recognition.start();
            } catch {
              // ignore
            }
          }, 250);
        } catch {
          // ignore
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // ignore
    }
  }, [translateSourceLanguage, isRecording, recorder]);

  useEffect(() => {
    if (!showTranscription) {
      setTranslatedText("");
      setIsTranslating(false);
      return;
    }
    if (!translateEnabled) {
      setTranslatedText("");
      setIsTranslating(false);
      return;
    }

    const text = String(latestUtterance || "").trim();
    if (!text) {
      setTranslatedText("");
      setIsTranslating(false);
      return;
    }

    const token = ++translateReqTokenRef.current;
    const id = setTimeout(async () => {
      try {
        setIsTranslating(true);
        const res = await aiRobotTranslate({
          text,
          targetLanguage: translateTargetLanguage,
          sourceLanguage: translateSourceLanguage,
        });
        if (translateReqTokenRef.current !== token) return;
        const next = String(res?.translatedText || "");
        setTranslatedText(next);
        lastSpokenTranslationRef.current = "";
      } catch {
        if (translateReqTokenRef.current !== token) return;
        setTranslatedText("");
      } finally {
        if (translateReqTokenRef.current !== token) return;
        setIsTranslating(false);
      }
    }, 150);

    return () => clearTimeout(id);
  }, [latestUtterance, translateTargetLanguage, translateSourceLanguage, translateEnabled, showTranscription]);

  useEffect(() => {
    if (!translateEnabled) return;
    if (!showTranscription) return;
    if (isTranslating) return;
    const text = String(translatedText || "").trim();
    if (!text) return;
    if (text === lastSpokenTranslationRef.current) return;

    const token = ++translateSpeakTokenRef.current;
    const id = setTimeout(async () => {
      try {
        if (translateSpeakTokenRef.current !== token) return;

        try {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        } catch {
          // ignore
        }

        // Countdown is purely indicative; it does not add artificial delay.
        setTranslationCountdown(3);
        countdownIntervalRef.current = setInterval(() => {
          setTranslationCountdown((v) => {
            if (v <= 1) return 1;
            return v - 1;
          });
        }, 1000);

        const buf = await aiRobotTts({
          text,
          voiceGender: translateVoiceGender,
        });
        if (translateSpeakTokenRef.current !== token) return;
        if (!buf) return;

        try {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        } catch {
          // ignore
        }
        setTranslationCountdown(-1);
        setTimeout(() => setTranslationCountdown(0), 500);

        const blob = new Blob([buf], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const el = translateAudioRef.current;
        if (!el) return;

        try {
          el.pause();
          el.currentTime = 0;
        } catch {
          // ignore
        }

        el.src = url;
        el.onended = () => {
          URL.revokeObjectURL(url);
        };
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {
              // ignore
            }
          });
        }

        lastSpokenTranslationRef.current = text;
      } catch {
        // ignore
      } finally {
        try {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        } catch {
          // ignore
        }
      }
    }, 800);

    return () => clearTimeout(id);
  }, [translatedText, translateEnabled, showTranscription, isTranslating, translateVoiceGender]);

  useEffect(() => {
    return () => {
      try {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (voiceCloneTimerRef.current) {
          clearInterval(voiceCloneTimerRef.current);
          voiceCloneTimerRef.current = null;
        }
      } catch {
        // ignore
      }
    };
  }, []);

  const loadVoices = async () => {
    try {
      const res = await getAiRobotVoices();
      const list = Array.isArray(res?.voices) ? res.voices : [];
      setVoices(list);
      if (!selectedVoiceId && list.length) {
        setSelectedVoiceId(String(list[0]?.voiceId || ""));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to load voices");
    }
  };

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const res = await getAiRobotConversations({ module: moduleKey });
      const list = Array.isArray(res?.conversations) ? res.conversations : [];
      setConversations(list);
      if (!conversationId && list.length) {
        setConversationId(String(list[0]?.id || ""));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to load chats");
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadConversation = async (id) => {
    try {
      if (!id) {
        setMessages([]);
        return;
      }
      setLoadingConversation(true);
      const res = await getAiRobotConversation({ conversationId: id });
      const convo = res?.conversation;
      const msgs = Array.isArray(convo?.messages) ? convo.messages : [];
      setMessages(msgs);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to open chat");
    } finally {
      setLoadingConversation(false);
    }
  };

  useEffect(() => {
    loadVoices();
  }, []);

  useEffect(() => {
    setConversationId("");
    setMessages([]);
    loadConversations();
  }, [moduleKey]);

  useEffect(() => {
    loadConversation(conversationId);
  }, [conversationId]);

  const ensureConversation = async () => {
    if (conversationId) return conversationId;
    const res = await createAiRobotConversation({ module: moduleKey, title: "New chat" });
    const id = String(res?.conversation?.id || "");
    if (!id) throw new Error("Failed to create conversation");
    setConversationId(id);
    await loadConversations();
    return id;
  };

  const handleNewChat = async () => {
    try {
      const res = await createAiRobotConversation({ module: moduleKey, title: "New chat" });
      const id = String(res?.conversation?.id || "");
      if (!id) throw new Error("Failed to create chat");
      setConversationId(id);
      await loadConversations();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to create chat");
    }
  };

  const handleDeleteChat = async (id) => {
    try {
      if (!id) return;
      await deleteAiRobotConversation({ conversationId: id });
      if (conversationId === id) {
        setConversationId("");
        setMessages([]);
      }
      await loadConversations();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to delete chat");
    }
  };

  const startRecording = async ({ force } = {}) => {
    try {
      if (isRecording) return;
      if (isTranscribing || isResponding) return;
      if (!force && !voiceModeOnRef.current) return;
      if (!selectedVoiceId) {
        toast.error("Please choose a voice");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = getSupportedMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = async () => {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }

        try {
          if (stopTimerRef.current) {
            clearTimeout(stopTimerRef.current);
            stopTimerRef.current = null;
          }
        } catch {
          // ignore
        }

        // Stop Web Speech API
        try {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
          }
        } catch {
          // ignore
        }

        setIsRecording(false);
        setRecorder(null);

        if (!voiceModeOnRef.current) return;

        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        if (!blob || !blob.size) {
          toast.error("Recording failed");
          setShowTranscription(false);
          setLiveTranscription("");
          return;
        }
        await processVoiceChat(blob);
      };

      rec.start();
      setRecorder(rec);
      setIsRecording(true);

      // Start Web Speech API for real-time transcription display
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const sessionToken = Date.now();
          recognitionSessionTokenRef.current = sessionToken;

          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = toSpeechRecognitionLang(translateSourceLanguage);

          recognition.onstart = () => {
            setShowTranscription(true);
            // Do not clear transcript here; browsers can auto-restart recognition.
            // Clearing would look like the text is getting stuck / restarting.
          };

          recognition.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const result = event.results[i];
              const t = result?.[0]?.transcript || "";
              if (result?.isFinal) {
                liveTranscriptFinalRef.current = `${liveTranscriptFinalRef.current} ${t}`.trim();
                const utter = String(t || "").trim();
                if (utter) setLatestUtterance(utter);
              } else {
                interim += t;
              }
            }
            const combined = `${liveTranscriptFinalRef.current} ${interim}`.trim();
            setLiveTranscription(combined);
          };

          recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            // Don't show error to user, just continue with audio recording
          };

          recognition.onend = () => {
            // Some browsers auto-stop recognition after a while even with `continuous=true`.
            // If voice mode is still ON and we are still recording, restart recognition.
            try {
              if (!voiceModeOnRef.current) return;
              if (recognitionSessionTokenRef.current !== sessionToken) return;
              if (rec.state === "inactive") return;
              setTimeout(() => {
                try {
                  if (!voiceModeOnRef.current) return;
                  if (recognitionSessionTokenRef.current !== sessionToken) return;
                  if (rec.state === "inactive") return;
                  recognition.start();
                } catch {
                  // ignore
                }
              }, 250);
            } catch {
              // ignore
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } else {
          console.warn('Web Speech API not supported, transcription will show after recording');
        }
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        // Continue with audio recording even if speech recognition fails
      }

      if (!voiceModeOnRef.current && VOICE_CHAT_MAX_MS > 0) {
        stopTimerRef.current = setTimeout(() => {
          try {
            if (rec.state !== "inactive") rec.stop();
          } catch {
            // ignore
          }
        }, VOICE_CHAT_MAX_MS);
      }
    } catch (e) {
      toast.error(e?.message || "Microphone access denied");
      setShowTranscription(false);
      setLiveTranscription("");
    }
  };

  const stopRecording = () => {
    try {
      if (!recorder) return;
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }

      // Stop Web Speech API
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
      } catch {
        // ignore
      }

      recorder.stop();
    } catch {
      // ignore
    } finally {
      // state is finalized in onstop
    }
  };

  const processVoiceChat = async (blob) => {
    try {
      const token = voiceModeTokenRef.current;
      if (!voiceModeOn) return;

      // Avoid spamming STT with tiny recordings
      if (!blob || blob.size < 1500) {
        console.warn("⚠️ Recording too small, skipping...");
        if (voiceModeOn && token === voiceModeTokenRef.current) {
          setTimeout(() => {
            if (!voiceModeOn) return;
            if (isRecording || isTranscribing || isResponding) return;
            startRecording();
          }, 250);
        }
        return;
      }

      console.log("🎤 Starting voice chat process...");
      console.log("📦 Audio blob size:", blob.size, "bytes");

      setIsTranscribing(true);
      setShowTranscription(true);

      const sttRes = await (async () => {
        const maxAttempts = 3;
        let delayMs = 1200;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`📝 Attempt ${attempt}: Sending to OpenAI Whisper...`);
            const result = await aiRobotStt({ audioBlob: blob });
            console.log("✅ Whisper transcription successful");
            return result;
          } catch (err) {
            console.error(`❌ Whisper attempt ${attempt} failed:`, err);
            const status = err?.response?.status;
            if (status === 429 && attempt < maxAttempts) {
              const waitTime = Math.round(delayMs / 1000);
              toast.error(`Too many requests. Retrying in ${waitTime}s...`);
              await new Promise((r) => setTimeout(r, delayMs));
              delayMs *= 2;
              continue;
            }
            throw err;
          }
        }
        return null;
      })();

      const text = String(sttRes?.text || "").trim();
      console.log("📝 Transcribed text:", text);

      // Display transcription in the horizontal bar
      setLiveTranscription(text);

      if (!text) {
        console.error("❌ No text transcribed from audio");
        toast.error("Could not transcribe audio. Please speak clearly and try again.");
        setShowTranscription(false);
        setLiveTranscription("");
        if (voiceModeOn && token === voiceModeTokenRef.current) {
          setTimeout(() => {
            if (!voiceModeOn) return;
            if (isRecording || isTranscribing || isResponding) return;
            startRecording();
          }, 250);
        }
        return;
      }

      console.log("💬 Creating/getting conversation...");
      let id;
      try {
        id = await ensureConversation();
        console.log("✅ Conversation ID:", id);
      } catch (convError) {
        console.error("❌ Failed to create conversation:", convError);
        toast.error("Failed to create conversation. Please try again.");
        setShowTranscription(false);
        setLiveTranscription("");
        return;
      }

      setMessages((prev) => [...prev, { role: "user", text }]);
      console.log("✅ Added user message to chat");

      setIsResponding(true);
      console.log("🤖 Sending to ChatGPT...");
      console.log("   - Conversation ID:", id);
      console.log("   - Message:", text);
      console.log("   - Language:", language);

      let chatRes;
      try {
        chatRes = await aiRobotSendConversationMessage({
          conversationId: id,
          message: text,
          language
        });
        console.log("✅ ChatGPT response received");
      } catch (chatError) {
        console.error("❌ ChatGPT API error:", chatError);
        console.error("   - Status:", chatError?.response?.status);
        console.error("   - Message:", chatError?.response?.data?.message);
        console.error("   - Full error:", chatError);

        const errorMsg = chatError?.response?.data?.message || chatError?.message || "Failed to get AI response";
        toast.error(`AI Error: ${errorMsg}`);

        setShowTranscription(false);
        setLiveTranscription("");
        setIsResponding(false);
        return;
      }

      const reply = String(chatRes?.reply || "").trim();
      console.log("🤖 AI Reply:", reply);

      if (!reply) {
        console.warn("⚠️ Empty reply from AI");
        toast.error("AI returned empty response. Please try again.");
        setShowTranscription(false);
        setLiveTranscription("");
        setIsResponding(false);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      console.log("✅ Added AI response to chat");

      await loadConversations();

      // Hide transcription immediately after getting response
      setShowTranscription(false);
      setLiveTranscription("");

      if (!voiceModeOn || voiceModeTokenRef.current !== token) {
        setIsResponding(false);
        return;
      }

      // Try to play TTS, but don't fail if it doesn't work
      try {
        if (selectedVoiceId) {
          console.log("🔊 Playing TTS with voice:", selectedVoiceId);
          const ttsRes = await aiRobotTts({ text: reply, voiceId: selectedVoiceId });
          if (voiceModeOn && voiceModeTokenRef.current === token) {
            playAudioBuffer(ttsRes);
            console.log("✅ TTS playback started");
          }
        } else {
          console.warn("⚠️ No voice selected, skipping TTS");
        }
      } catch (ttsError) {
        console.error("❌ TTS failed:", ttsError);
        // Continue without audio - the text response is already shown
        setIsResponding(false);
      }
    } catch (e) {
      console.error("❌ Voice chat error:", e);
      console.error("   - Error type:", e?.constructor?.name);
      console.error("   - Error message:", e?.message);
      console.error("   - Response status:", e?.response?.status);
      console.error("   - Response data:", e?.response?.data);
      console.error("   - Full error object:", e);

      const status = e?.response?.status;
      if (status === 429) {
        toast.error("Too many requests. Please wait a moment, then turn Voice ON again.");
        setVoiceModeOn(false);
        voiceModeTokenRef.current += 1;
        stopSpeaking();
        setShowTranscription(false);
        setLiveTranscription("");
        return;
      }

      const errorMessage = e?.response?.data?.message || e?.message || "Voice chat failed";
      toast.error(`Error: ${errorMessage}`);
      console.error("🔴 Showing error to user:", errorMessage);

      setShowTranscription(false);
      setLiveTranscription("");
    } finally {
      setIsTranscribing(false);
      if (!aiSpeakingRef.current) {
        setIsResponding(false);
      }
      console.log("🏁 Voice chat process completed");
    }
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      aiSpeakingRef.current = false;
      setIsResponding(false);
      if (!voiceModeOn) return;
      if (isRecording || isTranscribing || isResponding) return;
      setTimeout(() => {
        if (!voiceModeOn) return;
        startRecording();
      }, 250);
    };
    const onPause = () => {
      if (!aiSpeakingRef.current) return;
      aiSpeakingRef.current = false;
      setIsResponding(false);
    };
    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("pause", onPause);
    };
  }, [voiceModeOn, isRecording, isTranscribing, isResponding]);

  const toggleVoiceMode = async () => {
    if (voiceModeOn) {
      setVoiceModeOn(false);
      voiceModeOnRef.current = false;
      voiceModeTokenRef.current += 1;
      try {
        if (isRecording) stopRecording();
      } catch {
        // ignore
      }

      // Clean up Web Speech API
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
      } catch {
        // ignore
      }

      stopSpeaking();
      setShowTranscription(false);
      setLiveTranscription("");
      liveTranscriptFinalRef.current = "";
      setLatestUtterance("");
      setTranslateEnabled(false);
      setTranslatedText("");
      setTranslationCountdown(0);
      return;
    }

    if (!selectedVoiceId) {
      toast.error("Please choose a voice");
      return;
    }

    setVoiceStartWantsTranslate(false);
    setVoiceStartModalOpen(true);
  };

  const confirmVoiceStart = async () => {
    try {
      setVoiceStartModalOpen(false);
      setTranslateEnabled(voiceStartWantsTranslate);
      setTranslatedText("");
      setShowTranscription(true);
      setLiveTranscription("");
      liveTranscriptFinalRef.current = "";
      setLatestUtterance("");
      setVoiceModeOn(true);
      voiceModeOnRef.current = true;
      voiceModeTokenRef.current += 1;
      stopSpeaking();
      await startRecording({ force: true });
    } catch (e) {
      toast.error(e?.message || "Failed to start voice");
      setVoiceModeOn(false);
      voiceModeOnRef.current = false;
    }
  };

  const openVoiceModal = () => {
    try {
      const modal = document.getElementById("ai_robot_voice_modal");
      if (modal?.showModal) modal.showModal();
    } catch {
      // ignore
    }
  };

  const closeVoiceModal = () => {
    try {
      const modal = document.getElementById("ai_robot_voice_modal");
      if (modal?.close) modal.close();
    } catch {
      // ignore
    }
  };

  const startVoiceSampleRecording = async () => {
    try {
      if (voiceSampleIsRecording) return;
      if (voiceSamplesTotalSeconds >= VOICE_CLONE_TOTAL_MAX_SECONDS) {
        toast.error("You already recorded enough audio.");
        return;
      }

      setVoiceCloneSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = getSupportedMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = () => {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }

        try {
          if (voiceCloneTimerRef.current) {
            clearInterval(voiceCloneTimerRef.current);
            voiceCloneTimerRef.current = null;
          }
        } catch {
          // ignore
        }

        try {
          if (voiceSampleStopTimerRef.current) {
            clearTimeout(voiceSampleStopTimerRef.current);
            voiceSampleStopTimerRef.current = null;
          }
        } catch {
          // ignore
        }

        setVoiceSampleIsRecording(false);
        setVoiceSampleRecorder(null);
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        if (blob && blob.size) {
          setVoiceSamples((prev) => {
            const next = [...(prev || []), { blob, seconds: voiceCloneSeconds || 0 }];
            const capped = [];
            let total = 0;
            for (const s of next) {
              if (!s?.seconds) continue;
              if (total >= VOICE_CLONE_TOTAL_MAX_SECONDS) break;
              capped.push(s);
              total += s.seconds;
            }
            return capped;
          });
        }
      };

      rec.start();
      setVoiceSampleRecorder(rec);
      setVoiceSampleIsRecording(true);

      if (voiceCloneTimerRef.current) {
        clearInterval(voiceCloneTimerRef.current);
        voiceCloneTimerRef.current = null;
      }

      const startedAt = Date.now();
      voiceCloneTimerRef.current = setInterval(() => {
        setVoiceCloneSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);

      voiceSampleStopTimerRef.current = setTimeout(() => {
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          // ignore
        }
      }, VOICE_CLONE_CLIP_MAX_MS);
    } catch (e) {
      toast.error(e?.message || "Microphone access denied");
    }
  };

  const stopVoiceSampleRecording = () => {
    try {
      if (!voiceSampleRecorder) return;
      if (voiceSampleStopTimerRef.current) {
        clearTimeout(voiceSampleStopTimerRef.current);
        voiceSampleStopTimerRef.current = null;
      }
      voiceSampleRecorder.stop();
    } catch {
      // ignore
    } finally {
      // state is finalized in onstop
    }
  };

  const handleCreateVoiceId = async () => {
    try {
      const name = String(voiceModalName || "").trim();
      if (!name) {
        toast.error("Please enter a voice name");
        return;
      }
      if (!Array.isArray(voiceSamples) || voiceSamples.length === 0) {
        toast.error("Please record your voice");
        return;
      }

      if (voiceSamplesTotalSeconds < VOICE_CLONE_MIN_SECONDS) {
        toast.error(`Please record at least ${VOICE_CLONE_MIN_SECONDS} seconds (total).`);
        return;
      }

      setCreatingVoiceId(true);

      // Upload multiple valid container files for better results.
      const files = voiceSamples
        .filter((s) => s?.blob && s.blob.size)
        .map((s, idx) => blobToFile(s.blob, `voice_${idx + 1}.webm`));
      const res = await uploadAiRobotVoice({ voiceName: name, audioFiles: files });

      const voiceId = String(res?.voice?.voiceId || "");
      if (voiceId) {
        toast.success(`Voice ID generated: ${voiceId}`);
        setSelectedVoiceId(voiceId);
      } else {
        toast.success("Voice ID generated");
      }

      setVoiceModalName("");
      setVoiceSamples([]);
      setVoiceCloneSeconds(0);
      closeVoiceModal();
      await loadVoices();
    } catch (e) {
      const details = e?.response?.data?.details;
      const msg = e?.response?.data?.message || e?.message || "Failed to create Voice ID";
      const detailText =
        typeof details === "string"
          ? details
          : details
            ? JSON.stringify(details)
            : "";
      const preview = detailText && detailText.length > 180 ? `${detailText.slice(0, 180)}...` : detailText;
      toast.error(preview ? `${msg}: ${preview}` : msg);
    } finally {
      setCreatingVoiceId(false);
    }
  };

  return (
    <div className="min-h-full h-full">
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm opacity-70">{subtitle}</p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center justify-end">
            <button type="button" className="btn btn-outline" onClick={openVoiceModal}>
              Upload your Voice
            </button>
          </div>
        </div>



        <div className={`flex flex-col lg:flex-row gap-4 min-h-[70vh] transition-all duration-300`}>
          {/* Sidebar - Suggestions */}
          <div className={`${sidebarMinimized ? 'lg:w-16' : 'lg:w-80'} w-full transition-all duration-300`}>
            <div className="card bg-base-200 border border-base-300 h-full">
              <div className="card-body p-4 gap-3">
                <div className="flex items-center justify-between">
                  <h2 className={`font-semibold ${sidebarMinimized ? 'hidden' : 'block'}`}>AI Robot</h2>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setSidebarMinimized(!sidebarMinimized)}
                    title={sidebarMinimized ? "Expand sidebar" : "Minimize sidebar"}
                  >
                    {sidebarMinimized ? '→' : '←'}
                  </button>
                </div>

                {!sidebarMinimized && (
                  <div className="space-y-3">
                    <p className="text-xs opacity-50 mb-2">Suggestions:</p>
                    {ROUTES.map((r) => (
                      <Link
                        key={r.path}
                        to={r.path}
                        className={`block text-sm transition-opacity hover:opacity-100 ${activeTab === r.path ? 'opacity-90 font-medium' : 'opacity-60'
                          }`}
                      >
                        {r.label === "Home" ? "Job Interview" :
                          r.label === "Interview" ? "Exercises" :
                            r.label === "English Fluency" ? "English Proficiency" :
                              r.label === "Language Learning" ? "Mathematics" :
                                r.label === "Programming" ? "Programming" : r.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 relative">
            <div className="card bg-base-200 border border-base-300 h-full">
              <div className="card-body p-4 gap-4">
                {/* Voice Button - Fixed Right */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-center">
                  <button
                    type="button"
                    className={`btn btn-circle ${voiceModeOn ? "btn-error ring ring-error ring-offset-2 ring-offset-base-200" : "btn-primary"}`}
                    disabled={isTranscribing || isResponding}
                    onClick={toggleVoiceMode}
                    aria-pressed={voiceModeOn}
                    title={voiceModeOn ? "Voice OFF" : "Voice ON"}
                  >
                    {voiceModeOn ? (
                      <span className="relative">
                        {isRecording ? (
                          <span className="absolute -inset-2 rounded-full bg-error/30 animate-ping" />
                        ) : null}
                        <Mic className="size-5 relative" />
                      </span>
                    ) : (
                      <MicOff className="size-5" />
                    )}
                  </button>

                  {/* Completed Button - Shows when recording */}
                  {isRecording && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={stopRecording}
                      title="Complete and get AI response"
                    >
                      Completed
                    </button>
                  )}
                </div>

                {/* Live Transcription Bar */}
                {showTranscription && liveTranscription && (
                  <div className="bg-base-300 rounded-lg p-3 border border-base-content/10 animate-fade-in">
                    <p className="text-xs opacity-50 mb-1">You said:</p>
                    <div className="text-sm opacity-80 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {liveTranscription}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`btn btn-sm ${translateEnabled ? "btn-error" : "btn-outline"}`}
                        onClick={() => {
                          if (translateEnabled) {
                            setTranslateEnabled(false);
                            setTranslatedText("");
                            lastSpokenTranslationRef.current = "";
                            return;
                          }
                          setTranslateSettingsModalOpen(true);
                        }}
                      >
                        Translate
                      </button>

                      <div className="dropdown">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          disabled={!translateEnabled}
                          tabIndex={0}
                        >
                          From: {translateSourceLanguage}
                        </button>
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow"
                        >
                          {TRANSLATE_LANGUAGE_OPTIONS.map((lang) => (
                            <li key={`tr-${lang}`}>
                              <button
                                type="button"
                                onClick={() => setTranslateSourceLanguage(lang)}
                              >
                                {lang}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="dropdown">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          disabled={!translateEnabled}
                          tabIndex={0}
                        >
                          To: {translateTargetLanguage}
                        </button>
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow"
                        >
                          {TRANSLATE_LANGUAGE_OPTIONS.filter((l) => l !== "Auto").map((lang) => (
                            <li key={`tr-to-${lang}`}>
                              <button type="button" onClick={() => setTranslateTargetLanguage(lang)}>
                                {lang}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {translateEnabled ? (
                      <div className="mt-2">
                        <p className="text-xs opacity-50 mb-1">
                          {translateSourceLanguage} → {translateTargetLanguage}:
                        </p>
                        {translationCountdown ? (
                          <div className="text-xs font-semibold opacity-70 mb-1">
                            {translationCountdown === -1 ? "Go" : `Speaking in ${translationCountdown}...`}
                          </div>
                        ) : null}
                        <div className="text-sm opacity-90 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                          {isTranslating ? "Translating..." : translatedText}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Chat Messages Area */}
                <div className="min-h-[45vh] max-h-[65vh] overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-3 space-y-2">
                  {loadingConversation ? (
                    <div className="flex justify-center py-10">
                      <span className="loading loading-spinner loading-lg" />
                    </div>
                  ) : messages.length ? (
                    messages.map((m, idx) => (
                      <div key={`${m.role}-${idx}`} className={`chat ${m.role === "user" ? "chat-end" : "chat-start"}`}>
                        <div className={`chat-bubble ${m.role === "user" ? "chat-bubble-primary" : ""}`}>{m.text}</div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-lg opacity-40 text-center">Get your chatting Here</p>
                    </div>
                  )}
                </div>

                <audio ref={audioRef} />
                <audio ref={translateAudioRef} />
              </div>
            </div>
          </div>
        </div>

        <dialog id="ai_robot_voice_modal" className="modal">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Upload your Voice</h3>
            <p className="text-sm opacity-70 mt-1">
              Record 2 clips (30s + 30s) to reach 60 seconds. We will generate your Voice ID and save it.
            </p>

            <div className="mt-4 space-y-3">
              <label className="form-control">
                <div className="label">
                  <span className="label-text">Voice Name</span>
                </div>
                <input
                  className="input input-bordered"
                  value={voiceModalName}
                  onChange={(e) => setVoiceModalName(e.target.value)}
                  placeholder="My Voice"
                />
              </label>

              <div className="flex items-center gap-2">
                {!voiceSampleIsRecording ? (
                  <button type="button" className="btn btn-primary" onClick={startVoiceSampleRecording}>
                    Record
                  </button>
                ) : (
                  <button type="button" className="btn btn-error" onClick={stopVoiceSampleRecording}>
                    Stop
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={voiceSampleIsRecording}
                  onClick={() => {
                    setVoiceSamples([]);
                    setVoiceCloneSeconds(0);
                  }}
                >
                  Clear
                </button>

                <div className="text-sm opacity-70">
                  {voiceSampleIsRecording
                    ? `Recording clip (${voiceCloneSeconds}s / 30s)`
                    : voiceSamples.length
                      ? `Clips: ${voiceSamples.length}, Total: ${voiceSamplesTotalSeconds}s / ${VOICE_CLONE_MIN_SECONDS}s`
                      : ""}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-outline w-full"
                disabled={creatingVoiceId}
                onClick={handleCreateVoiceId}
              >
                {creatingVoiceId ? "Generating Voice ID..." : "Generate Voice ID"}
              </button>
            </div>

            <div className="modal-action">
              <form method="dialog">
                <button
                  className="btn"
                  onClick={() => {
                    setVoiceModalName("");
                    setVoiceSampleBlob(null);
                    if (voiceSampleIsRecording) {
                      try {
                        stopVoiceSampleRecording();
                      } catch {
                        // ignore
                      }
                    }
                  }}
                >
                  Close
                </button>
              </form>
            </div>
          </div>
        </dialog>

        {voiceStartModalOpen ? (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg">Voice Settings</h3>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Translation</div>
                  <div className="text-xs opacity-60">Do you need translation while speaking?</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={voiceStartWantsTranslate}
                  onChange={(e) => setVoiceStartWantsTranslate(e.target.checked)}
                />
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Target language</div>
                <select
                  className="select select-bordered w-full"
                  value={translateTargetLanguage}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value)}
                  disabled={!voiceStartWantsTranslate}
                >
                  {TRANSLATE_LANGUAGE_OPTIONS.filter((l) => l !== "Auto").map((lang) => (
                    <option key={`voice-start-${lang}`} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Input language</div>
                <select
                  className="select select-bordered w-full"
                  value={translateSourceLanguage}
                  onChange={(e) => setTranslateSourceLanguage(e.target.value)}
                  disabled={!voiceStartWantsTranslate}
                >
                  {TRANSLATE_LANGUAGE_OPTIONS.map((lang) => (
                    <option key={`voice-start-src-${lang}`} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Default Translation</div>
                <div className="join w-full">
                  <button
                    type="button"
                    className={`btn join-item flex-1 ${translateVoiceGender === "Male" ? "btn-primary" : "btn-outline"}`}
                    disabled={!voiceStartWantsTranslate}
                    onClick={() => setTranslateVoiceGender("Male")}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    className={`btn join-item flex-1 ${translateVoiceGender === "Female" ? "btn-primary" : "btn-outline"}`}
                    disabled={!voiceStartWantsTranslate}
                    onClick={() => setTranslateVoiceGender("Female")}
                  >
                    Female
                  </button>
                </div>
              </div>

              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={() => setVoiceStartModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={confirmVoiceStart}>
                  Start
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop">
              <button type="button" onClick={() => setVoiceStartModalOpen(false)}>
                close
              </button>
            </form>
          </dialog>
        ) : null}

        {translateSettingsModalOpen ? (
          <dialog className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg">Translation Settings</h3>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Input language</div>
                <select
                  className="select select-bordered w-full"
                  value={translateSourceLanguage}
                  onChange={(e) => setTranslateSourceLanguage(e.target.value)}
                >
                  {TRANSLATE_LANGUAGE_OPTIONS.map((lang) => (
                    <option key={`tr-modal-src-${lang}`} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Target language</div>
                <select
                  className="select select-bordered w-full"
                  value={translateTargetLanguage}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value)}
                >
                  {TRANSLATE_LANGUAGE_OPTIONS.filter((l) => l !== "Auto").map((lang) => (
                    <option key={`tr-modal-to-${lang}`} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Default Translation</div>
                <div className="join w-full">
                  <button
                    type="button"
                    className={`btn join-item flex-1 ${translateVoiceGender === "Male" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setTranslateVoiceGender("Male")}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    className={`btn join-item flex-1 ${translateVoiceGender === "Female" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setTranslateVoiceGender("Female")}
                  >
                    Female
                  </button>
                </div>
              </div>

              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={() => setTranslateSettingsModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setTranslateSettingsModalOpen(false);
                    setTranslateEnabled(true);
                    setTranslatedText("");
                    lastSpokenTranslationRef.current = "";
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop">
              <button type="button" onClick={() => setTranslateSettingsModalOpen(false)}>
                close
              </button>
            </form>
          </dialog>
        ) : null}
      </div>
    </div>
  );
};

export default AiRobotShell;
