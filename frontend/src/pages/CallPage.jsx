import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { callTts, getStreamToken, getUserVoiceProfile } from "../lib/api";
import { ArrowLeftIcon } from "lucide-react";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  PaginatedGridLayout,
  StreamTheme,
  CallingState,
  useCallStateHooks,
  useCall,
  hasAudio,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import toast from "react-hot-toast";
import PageLoader from "../components/PageLoader";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const CallPage = () => {
  const { id: callId } = useParams();
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);

  const navigate = useNavigate();

  const { authUser, isLoading } = useAuthUser();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    let cancelled = false;
    let localClient;
    let localCall;

    const initCall = async () => {
      if (!tokenData?.token || !authUser || !callId) return;

      try {
        console.log("Initializing Stream video client...");

        const user = {
          id: authUser._id,
          name: authUser.fullName,
          image: authUser.profilePic,
          custom: {
            nativeLanguage: authUser?.nativeLanguage || null,
          },
        };

        localClient = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user,
          token: tokenData.token,
        });

        localCall = localClient.call("default", callId);
        await localCall.join({ create: true });

        if (cancelled) return;

        console.log("Joined call successfully");
        setClient(localClient);
        setCall(localCall);
      } catch (error) {
        console.error("Error joining call:", error);
        toast.error("Could not join the call. Please try again.");
      } finally {
        if (!cancelled) setIsConnecting(false);
      }
    };

    initCall();

    return () => {
      cancelled = true;
      try {
        localCall?.leave();
      } catch {
        // ignore
      }
      try {
        localClient?.disconnectUser?.();
      } catch {
        // ignore
      }
    };
  }, [tokenData, authUser, callId]);

  if (isLoading || isConnecting) return <PageLoader />;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center">
      <div className="relative w-full h-full">
        <div className="absolute top-4 left-4 z-20">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              try {
                const last = localStorage.getItem("aerosonix_last_chat_user");
                if (last) return navigate(`/chat/${last}`);
              } catch {
                // ignore
              }
              return navigate("/");
            }}
          >
            <ArrowLeftIcon className="size-4 mr-2" />
            Back
          </button>
        </div>
        {client && call ? (
          <StreamVideo client={client}>
            <StreamCall call={call}>
              <CallContent callId={callId} />
            </StreamCall>
          </StreamVideo>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p>Could not initialize call. Please refresh or try again later.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const CallContent = ({ callId }) => {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const navigate = useNavigate();
  const { authUser } = useAuthUser();

  const [captions, setCaptions] = useState([]);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [showCaptions, setShowCaptions] = useState(false);
  const [interpretationMode, setInterpretationMode] = useState(false);
  const [captionMeta, setCaptionMeta] = useState({});
  const [peerMeta, setPeerMeta] = useState(null);
  const [spokenLanguage, setSpokenLanguage] = useState("english");
  const peerProfileFetchRef = useRef({ userId: null, inFlight: false });
  const warnedNoOpponentRef = useRef(false);

  useEffect(() => {
    const list = Array.isArray(participants) ? participants : [];
    const myId = String(authUser?._id || "");

    if (list.length < 2) {
      if (!warnedNoOpponentRef.current) {
        warnedNoOpponentRef.current = true;
        console.warn("[Captions] No opponent participant yet. participants:", list.length);
      }
      return;
    }

    warnedNoOpponentRef.current = false;

    const opponent = list.find((p) => String(p?.user?.id || p?.userId || "") !== myId);
    if (!opponent) {
      console.warn("[Captions] Could not resolve opponent from participants");
      return;
    }

    const opponentId = String(opponent?.user?.id || opponent?.userId || "");
    const opponentName = String(opponent?.user?.name || opponent?.name || "").trim() || "Opponent";
    const opponentNativeLanguage =
      String(opponent?.user?.custom?.nativeLanguage || opponent?.user?.nativeLanguage || "").trim() || null;

    setPeerMeta((prev) => {
      const next = {
        userId: opponentId,
        fullName: opponentName,
        nativeLanguage: opponentNativeLanguage,
      };

      // IMPORTANT: Stream participant objects often do not contain nativeLanguage.
      // If we already learned it from WebSocket/backend, don't overwrite it with null/"".
      if (prev?.userId === next.userId && prev?.nativeLanguage && !next.nativeLanguage) {
        if (prev.fullName !== next.fullName) {
          return { ...prev, fullName: next.fullName };
        }
        return prev;
      }

      if (
        prev?.userId === next.userId &&
        prev?.fullName === next.fullName &&
        prev?.nativeLanguage === next.nativeLanguage
      ) {
        return prev;
      }

      console.log("[Captions] Resolved opponent from participants:", next);
      return next;
    });
  }, [authUser?._id, participants]);

  useEffect(() => {
    const opponentId = String(peerMeta?.userId || "");
    if (!opponentId) return;
    const needsNativeLanguage = !peerMeta?.nativeLanguage;
    const needsGender = !peerMeta?.gender;
    if (!needsNativeLanguage && !needsGender) return;

    if (peerProfileFetchRef.current.inFlight) return;
    if (peerProfileFetchRef.current.userId === opponentId) return;

    peerProfileFetchRef.current = { userId: opponentId, inFlight: true };
    (async () => {
      try {
        const res = await getUserVoiceProfile(opponentId);
        const nativeLanguage = String(res?.nativeLanguage || "").trim();
        const gender = String(res?.gender || "").trim();
        setPeerMeta((prev) => {
          if (!prev || String(prev.userId || "") !== opponentId) return prev;
          const next = {
            ...prev,
            ...(nativeLanguage ? { nativeLanguage } : {}),
            ...(gender ? { gender } : {}),
          };

          if (prev.nativeLanguage !== next.nativeLanguage || prev.gender !== next.gender) {
            console.log("[Captions] Fetched opponent voice profile from backend:", next);
          }
          return next;
        });
      } catch (e) {
        console.error("[Captions] Failed to fetch opponent profile language", e);
      } finally {
        peerProfileFetchRef.current = { userId: opponentId, inFlight: false };
      }
    })();
  }, [peerMeta?.gender, peerMeta?.nativeLanguage, peerMeta?.userId]);

  useEffect(() => {
    const nextSpoken = String(authUser?.nativeLanguage || "english").toLowerCase();
    if (nextSpoken) setSpokenLanguage(nextSpoken);
  }, [authUser?.nativeLanguage]);

  const pushCaption = useCallback((c) => {
    setCaptions((prev) => {
      const replaceId = String(c?.replaceId || "").trim();
      if (replaceId) {
        const idx = prev.findIndex((x) => String(x?.replaceId || "").trim() === replaceId);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...prev[idx], ...c };
          return next;
        }
      }

      const next = [...prev, c];

      // Keep enough rows so that a full "utterance" (original + translation) can stay visible
      // until TTS completes, then we remove that utteranceKey.
      // Aggressively trimming here causes rows to disappear early.
      const max = 50;
      return next.length > max ? next.slice(next.length - max) : next;
    });
  }, []);

  useEffect(() => {
    if (callingState === CallingState.LEFT) {
      navigate("/");
    }
  }, [callingState, navigate]);

  if (callingState === CallingState.LEFT) return null;

  return (
    <StreamTheme>
      <CaptionControls
        callId={callId}
        authUser={authUser}
        peerMeta={peerMeta}
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={setCaptionsEnabled}
        showCaptions={showCaptions}
        setShowCaptions={setShowCaptions}
        interpretationMode={interpretationMode}
        setInterpretationMode={setInterpretationMode}
        spokenLanguage={spokenLanguage}
        setSpokenLanguage={setSpokenLanguage}
        pushCaption={pushCaption}
        setCaptionMeta={setCaptionMeta}
        setPeerMeta={setPeerMeta}
      />
      <div className="w-full h-[100dvh] flex flex-col bg-[#0b0f1a] text-base-content">
        <div className="flex-1 min-h-0 p-4">
          <div className="h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <PaginatedGridLayout />
          </div>
        </div>

        {showCaptions ? (
          <div className="shrink-0">
            <CaptionBar captions={captions} meta={captionMeta} peerMeta={peerMeta} />
          </div>
        ) : null}

        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-[820px] rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-3">
            <CallControls />
          </div>
        </div>
      </div>
    </StreamTheme>
  );
};

const CaptionControls = ({
  callId,
  authUser,
  peerMeta,
  captionsEnabled,
  setCaptionsEnabled,
  showCaptions,
  setShowCaptions,
  interpretationMode,
  setInterpretationMode,
  spokenLanguage,
  setSpokenLanguage,
  pushCaption,
  setCaptionMeta,
  setPeerMeta,
}) => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const call = useCall();

  const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
  const ELEVENLABS_MALE_VOICE_ID = import.meta.env.VITE_ELEVENLABS_MALE_VOICE_ID;
  const ELEVENLABS_FEMALE_VOICE_ID = import.meta.env.VITE_ELEVENLABS_FEMALE_VOICE_ID;

  const [restartSeq, setRestartSeq] = useState(0);

  const callRef = useRef(null);
  const authUserIdRef = useRef("");
  const peerGenderRef = useRef("");

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    authUserIdRef.current = String(authUser?._id || "");
  }, [authUser?._id]);

  useEffect(() => {
    peerGenderRef.current = String(peerMeta?.gender || "");
  }, [peerMeta?.gender]);

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const micStreamRef = useRef(null);
  const trackRef = useRef(null);
  const trackHandlersRef = useRef(null);
  const micMuteStateRef = useRef({ muted: null, lastRestartAtMs: 0 });
  const interimRef = useRef("");
  const silenceTimerRef = useRef(null);

  const ttsQueueRef = useRef([]);
  const ttsPlayingRef = useRef(false);
  const ttsAudioRef = useRef(null);
  const lastTtsTextRef = useRef("");
  const interpretationModeRef = useRef(false);
  const enqueueTtsRef = useRef(null);
  const ttsAbortRef = useRef(null);
  const pendingInterimTtsRef = useRef({ text: "", timer: null });
  const utteranceRef = useRef({});
  const ttsOnCompleteRef = useRef(null);

  const SOFT_PAUSE_MS = 1100;
  const HARD_PAUSE_MS = 3000;
  const MAX_WORDS = 10;

  const stopTts = useCallback(() => {
    try {
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
      }
    } catch {
    }
    ttsAbortRef.current = null;
    try {
      const a = ttsAudioRef.current;
      if (a) {
        a.onended = null;
        a.onerror = null;
        try {
          a.pause();
        } catch {
        }
      }
    } catch {
    }
    ttsAudioRef.current = null;
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    lastTtsTextRef.current = "";
  }, []);

  const streamElevenLabsTts = useCallback(
    async ({ text, voiceId, apiKey, onDone }) => {
      const mimeCandidates = ['audio/mpeg; codecs="mp3"', "audio/mpeg"];
      const supportedMime = mimeCandidates.find((m) => {
        try {
          return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(m);
        } catch {
          return false;
        }
      });

      if (typeof MediaSource === "undefined" || !supportedMime) {
        throw new Error("MediaSource streaming not supported");
      }

      try {
        if (ttsAbortRef.current) ttsAbortRef.current.abort();
      } catch {
      }
      const ac = new AbortController();
      ttsAbortRef.current = ac;

      const nowPerf = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
      const toSec = (ms) => Math.round((Number(ms) / 1000) * 100) / 100;
      const overallStart = nowPerf();
      const requestStart = nowPerf();
      console.log("[TTS] Translated text received", { text: String(text || "").slice(0, 300) });
      console.log("[TTS] Streaming request start", { voiceId });

      const audio = new Audio();
      audio.preload = "auto";
      ttsAudioRef.current = audio;
      ttsPlayingRef.current = true;

      const mediaSource = new MediaSource();
      const objectUrl = URL.createObjectURL(mediaSource);
      audio.src = objectUrl;

      const cleanup = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
        }
        try {
          if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
        } catch {
        }
        try {
          ttsPlayingRef.current = false;
        } catch {
        }
        try {
          ttsAbortRef.current = null;
        } catch {
        }
      };

      const donePromise = new Promise((resolve, reject) => {
        audio.onended = () => {
          try {
            console.log("[TTS] Play completed", { spokenText: String(text || "").slice(0, 600) });
          } catch {
          }
          try {
            const tEnd = nowPerf();
            const ms = Math.round(tEnd - overallStart);
            console.log("[TTS] Total time", { ms, s: toSec(ms) });
          } catch {
          }
          try {
            onDone?.();
          } catch {
          }
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("Audio playback error"));
        };
      });

      mediaSource.addEventListener(
        "sourceopen",
        async () => {
          let sourceBuffer;
          try {
            sourceBuffer = mediaSource.addSourceBuffer(supportedMime);
          } catch (e) {
            try {
              mediaSource.endOfStream();
            } catch {
            }
            cleanup();
            return;
          }

          const streamUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
          let response;
          try {
            response = await fetch(streamUrl, {
              method: "POST",
              headers: {
                "xi-api-key": String(apiKey),
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              signal: ac.signal,
              body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                },
              }),
            });
          } catch (e) {
            if (e?.name === "AbortError") return;
            try {
              mediaSource.endOfStream();
            } catch {
            }
            cleanup();
            return;
          }

          if (!response?.ok || !response.body) {
            const errText = await response?.text?.().catch(() => "");
            console.error("[TTS] ElevenLabs streaming HTTP error", {
              status: response?.status,
              body: errText,
            });
            try {
              mediaSource.endOfStream();
            } catch {
            }
            cleanup();
            return;
          }

          let firstChunkLogged = false;
          let playbackStartedLogged = false;
          const reader = response.body.getReader();

          const appendChunk = (chunk) =>
            new Promise((resolve, reject) => {
              const onEnd = () => {
                sourceBuffer.removeEventListener("updateend", onEnd);
                sourceBuffer.removeEventListener("error", onErr);
                resolve();
              };
              const onErr = () => {
                sourceBuffer.removeEventListener("updateend", onEnd);
                sourceBuffer.removeEventListener("error", onErr);
                reject(new Error("SourceBuffer error"));
              };
              sourceBuffer.addEventListener("updateend", onEnd);
              sourceBuffer.addEventListener("error", onErr);
              try {
                sourceBuffer.appendBuffer(chunk);
              } catch (e) {
                sourceBuffer.removeEventListener("updateend", onEnd);
                sourceBuffer.removeEventListener("error", onErr);
                reject(e);
              }
            });

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!firstChunkLogged) {
                firstChunkLogged = true;
                const tFirstByte = nowPerf();
                const ms = Math.round(tFirstByte - requestStart);
                console.log("[TTS] First audio byte", { ms, s: toSec(ms) });
                try {
                  const p = audio.play();
                  if (p && typeof p.catch === "function") p.catch(() => {});
                } catch {
                }
              }

              if (!playbackStartedLogged && audio && !audio.paused) {
                playbackStartedLogged = true;
                const tPlay = nowPerf();
                const ms = Math.round(tPlay - overallStart);
                console.log("[TTS] Playback started", { ms, s: toSec(ms) });
              }

              await appendChunk(value);
            }
            try {
              mediaSource.endOfStream();
            } catch {
            }
          } catch (e) {
            if (e?.name === "AbortError") return;
            try {
              mediaSource.endOfStream();
            } catch {
            }
          }
        },
        { once: true }
      );

      try {
        // Kick off playback pipeline; actual audio starts on first appended data.
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
      }

      return donePromise;
    },
    []
  );

  const playNextTts = useCallback(() => {
    if (!interpretationModeRef.current) {
      stopTts();
      return;
    }
    const next = ttsQueueRef.current.shift();
    if (!next) {
      ttsPlayingRef.current = false;
      return;
    }

    const { text, gender, meta } = next;
    const g = String(gender || "").toLowerCase();
    const voiceId = g === "female" ? ELEVENLABS_FEMALE_VOICE_ID : ELEVENLABS_MALE_VOICE_ID;

    if (!ELEVENLABS_API_KEY || !voiceId) {
      console.warn("[TTS] Missing VITE_ELEVENLABS_API_KEY or voice id; cannot play TTS");
      ttsPlayingRef.current = false;
      return;
    }

    ttsPlayingRef.current = true;
    lastTtsTextRef.current = String(text || "").trim();

    const onDone = () => {
      try {
        ttsOnCompleteRef.current?.(meta);
      } catch {
      }
      playNextTts();
    };

    streamElevenLabsTts({
      text,
      voiceId,
      apiKey: ELEVENLABS_API_KEY,
      onDone,
    }).catch((e) => {
      if (e?.name === "AbortError") return;
      console.error("[TTS] Streaming failed", e?.message || e);
      ttsPlayingRef.current = false;
      playNextTts();
    });
  }, [ELEVENLABS_API_KEY, ELEVENLABS_FEMALE_VOICE_ID, ELEVENLABS_MALE_VOICE_ID, stopTts, streamElevenLabsTts]);

  const enqueueTts = useCallback(async (text, gender, meta) => {
    if (!interpretationModeRef.current) return;
    const clean = String(text || "").trim();
    if (!clean) return;

    // Prevent repeating the same phrase.
    if (lastTtsTextRef.current === clean) return;

    try {
      console.log("[TTS] ON - ElevenLabs voice is using translated text", {
        text: clean.slice(0, 600),
      });
    } catch {
    }

    try {
      toast("ElevenLabs Voice is coming");
    } catch {
    }

    ttsQueueRef.current.push({ text: clean, gender, meta });
    if (!ttsPlayingRef.current) {
      playNextTts();
    }
  }, [playNextTts]);

  useEffect(() => {
    interpretationModeRef.current = Boolean(interpretationMode);
  }, [interpretationMode]);

  useEffect(() => {
    enqueueTtsRef.current = enqueueTts;
  }, [enqueueTts]);

  useEffect(() => {
    ttsOnCompleteRef.current = (meta) => {
      const utteranceKey = String(meta?.utteranceKey || "").trim();
      if (!utteranceKey) return;
      setCaptions((prev) => prev.filter((c) => String(c?.utteranceKey || "") !== utteranceKey));
    };
  }, []);

  const toDeepgramLanguage = (languageKey) => {
    const key = String(languageKey || "").trim().toLowerCase();
    if (key === "auto") return "auto";
    const map = {
      english: "en",
      telugu: "te",
      hindi: "hi",
      tamil: "ta",
      kannada: "kn",
      malayalam: "ml",
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
    return map[key] || "en";
  };

  const downsampleBuffer = (buffer, inputSampleRate, outputSampleRate) => {
    if (outputSampleRate === inputSampleRate) return buffer;
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = accum / (count || 1);
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const floatTo16BitPCM = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  const flushInterimAsLine = () => {
    const text = String(interimRef.current || "").trim();
    if (!text) return;
    pushCaption({
      id: `${Date.now()}-interim`,
      speaker: authUser?.fullName || "You",
      text,
      ts: Date.now(),
    });
    interimRef.current = "";
  };

  const scheduleSilenceFlush = () => {
    try {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } catch {
    }
    silenceTimerRef.current = setTimeout(() => {
      flushInterimAsLine();
    }, 3000);
  };

  useEffect(() => {
    if (!interpretationMode) {
      stopTts();
      return;
    }

    // Attempt to unlock audio playback (helps with autoplay policies)
    try {
      const a = new Audio();
      a.muted = true;
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
    }
  }, [interpretationMode, stopTts]);

  useEffect(() => {
    const list = Array.isArray(participants) ? participants : [];
    for (const p of list) {
      if (p?.isLocalParticipant) continue;

      try {
        const maybeStream = p?.audioStream || p?.audio?.stream || p?.audio?.mediaStream;
        if (maybeStream && typeof maybeStream.getAudioTracks === "function") {
          for (const t of maybeStream.getAudioTracks() || []) {
            try {
              t.enabled = !interpretationMode;
            } catch {
            }
          }
        }
      } catch {
      }

      try {
        const maybeTrack =
          p?.audioTrack ||
          p?.audio?.track ||
          p?.tracks?.audio ||
          p?.publishedTracks?.audio;
        if (maybeTrack && typeof maybeTrack === "object" && "enabled" in maybeTrack) {
          try {
            maybeTrack.enabled = !interpretationMode;
          } catch {
          }
        }
      } catch {
      }
    }
  }, [interpretationMode, participants]);

  useEffect(() => {
    if (!captionsEnabled) {
      micMuteStateRef.current = { muted: null, lastRestartAtMs: 0 };
      return;
    }

    const intervalId = setInterval(() => {
      const callObj = callRef.current;
      const mic = callObj?.microphone;
      const state = mic?.state;

      let muted = null;
      if (typeof state?.muted === "boolean") muted = state.muted;
      else if (typeof state?.enabled === "boolean") muted = !state.enabled;
      else if (typeof mic?.enabled === "boolean") muted = !mic.enabled;
      else if (typeof trackRef.current?.muted === "boolean") muted = trackRef.current.muted;

      if (muted === null) return;

      const prevMuted = micMuteStateRef.current.muted;
      if (prevMuted === null) {
        micMuteStateRef.current.muted = muted;
        return;
      }

      // If mic transitions from muted -> unmuted, restart captions pipeline.
      if (prevMuted === true && muted === false) {
        const now = Date.now();
        if (now - micMuteStateRef.current.lastRestartAtMs >= 1500) {
          micMuteStateRef.current.lastRestartAtMs = now;
          setRestartSeq((v) => v + 1);
        }
      }

      micMuteStateRef.current.muted = muted;
    }, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [captionsEnabled]);

  useEffect(() => {
    if (!captionsEnabled) return;

    const token = (() => {
      try {
        return localStorage.getItem("aerosonix_token") || "";
      } catch {
        return "";
      }
    })();

    if (!token) {
      setCaptionsEnabled(false);
      return;
    }

    const envBackend = import.meta.env.VITE_BACKEND_URL;
    const httpBase = envBackend
      ? String(envBackend).replace(/\/+$/, "")
      : import.meta.env.MODE === "development"
        ? "http://localhost:5001"
        : window.location.origin;

    const origin = httpBase.replace(/\/api\/?$/, "");
    const wsOrigin = origin.startsWith("https://")
      ? origin.replace(/^https:\/\//, "wss://")
      : origin.replace(/^http:\/\//, "ws://");

    const wsUrl = `${wsOrigin}/ws/google-cloud?token=${encodeURIComponent(token)}&callId=${encodeURIComponent(callId || "")}`;

    let stopped = false;

    const start = async () => {
      try {
        const callObj = callRef.current;
        try {
          await callObj?.microphone?.enable?.();
          // Add a small delay to ensure microphone is properly initialized
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch {
        }

        let stream;
        // Try multiple approaches to get the microphone track from Stream
        let publishedAudio = null;
        let maybeMediaStreamTrack = null;
        
        // Method 1: Try microphone state
        const microphoneState = callObj?.microphone?.state;
        console.log("[Captions] Microphone state:", microphoneState);
        
        if (microphoneState?.mediaStream) {
          publishedAudio = microphoneState.mediaStream;
          maybeMediaStreamTrack = publishedAudio.getAudioTracks()?.[0];
          console.log("[Captions] Using microphone.mediaStream method");
        } else if (microphoneState?.track) {
          publishedAudio = microphoneState.track;
          maybeMediaStreamTrack = publishedAudio;
          console.log("[Captions] Using microphone.track method");
        }
        
        // Method 2: Try accessing through call participants
        if (!maybeMediaStreamTrack) {
          const localParticipant = callObj?.state?.localParticipant;
          console.log("[Captions] Local participant:", localParticipant);
          
          if (localParticipant?.microphone?.track) {
            maybeMediaStreamTrack = localParticipant.microphone.track;
            console.log("[Captions] Using localParticipant.microphone.track method");
          }
        }
        
        const isUsableTrack =
          !!maybeMediaStreamTrack &&
          typeof maybeMediaStreamTrack === "object" &&
          maybeMediaStreamTrack.readyState !== "ended";
          
        console.log("[Captions] Stream audio track:", !!publishedAudio, "Track usable:", isUsableTrack, "Track state:", maybeMediaStreamTrack?.readyState);

        if (isUsableTrack) {
          trackRef.current = maybeMediaStreamTrack;
          try {
            if (trackHandlersRef.current?.track === maybeMediaStreamTrack) {
              // already attached
            } else {
              try {
                if (trackHandlersRef.current?.track && trackHandlersRef.current?.cleanup) {
                  trackHandlersRef.current.cleanup();
                }
              } catch {
              }

              const onUnmute = () => {
                if (stopped) return;
                setRestartSeq((v) => v + 1);
              };
              const onEnded = () => {
                if (stopped) return;
                setRestartSeq((v) => v + 1);
              };

              maybeMediaStreamTrack.addEventListener?.("unmute", onUnmute);
              maybeMediaStreamTrack.addEventListener?.("ended", onEnded);

              trackHandlersRef.current = {
                track: maybeMediaStreamTrack,
                cleanup: () => {
                  try {
                    maybeMediaStreamTrack.removeEventListener?.("unmute", onUnmute);
                  } catch {
                  }
                  try {
                    maybeMediaStreamTrack.removeEventListener?.("ended", onEnded);
                  } catch {
                  }
                },
              };
            }
          } catch {
          }

          stream = new MediaStream([maybeMediaStreamTrack]);
          console.log("[Captions] Using Stream audio track");
        } else {
          console.log("[Captions] Falling back to getUserMedia");
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            toast.error("Captions: could not access microphone. Please allow mic permissions.");
            throw new Error("getUserMedia failed");
          }
        }
        if (stopped) return;
        micStreamRef.current = stream;

        let reconnectAttempts = 0;
        const maxReconnectAttempts = 3;
        let fatalWsError = false;

        const connectWebSocket = () => {
          if (reconnectAttempts >= maxReconnectAttempts || stopped) return;
          
          const newWs = new WebSocket(wsUrl);
          socketRef.current = newWs;
          
          newWs.onopen = () => {
            console.log("[Captions] Google Cloud WS open");
            reconnectAttempts = 0; // Reset on successful connection
            toast.success("Live captions connected");
            
            // Request current room participants for instant opponent language
            try {
              newWs.send(JSON.stringify({ type: "request_peers" }));
            } catch (error) {
              console.error("[Captions] Error requesting peers:", error);
            }
          };

          newWs.onclose = (e) => {
            console.log("[Captions] Google Cloud WS close", e?.code, e?.reason);
            
            // Show appropriate messages based on close code
            if (e?.code === 1000) {
              toast("Live captions disconnected");
            } else if (e?.code === 1011) {
              toast.error("Live captions error: " + (e?.reason || "Unknown error"));
            } else {
              toast.error("Live captions connection lost");
            }
            
            // Attempt to reconnect if it's an abnormal closure and we haven't exceeded attempts
            if (!fatalWsError && e?.code !== 1000 && reconnectAttempts < maxReconnectAttempts && !stopped) {
              reconnectAttempts++;
              console.log(`[Captions] Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})`);
              toast(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
              setTimeout(connectWebSocket, 1000 * reconnectAttempts); // Exponential backoff
            }
          };

          newWs.onerror = (e) => {
            console.error("[Captions] Google Cloud WS error", e);
            if (reconnectAttempts === 0) { // Only show toast on first error
              toast.error("Failed to connect to live captions");
            }
          };

          newWs.onmessage = (evt) => {
            if (stopped) return;
            scheduleSilenceFlush();

            let data;
            try {
              data = JSON.parse(evt.data);
            } catch {
              return;
            }

            console.log("[Captions] Received Google Cloud WS message:", JSON.stringify(data, null, 2));

            if (data?.type === "meta") {
              try {
                setCaptionMeta?.({
                  speaker_profile_language_raw: data?.speaker_profile_language_raw,
                  target_language_raw: data?.target_language_raw,
                  call_id: data?.call_id,
                });
              } catch {
              }
              return;
            }

            if (data?.type === "peer") {
              try {
                setPeerMeta({
                  userId: data?.userId,
                  fullName: data?.fullName,
                  nativeLanguage: data?.nativeLanguage,
                });
              } catch {
              }
              return;
            }

            if (data?.type === "error") {
              const msg = String(data?.message || "");
              console.error('[Captions] Google Cloud error received:', msg);
              
              // Handle specific error types
              if (msg.includes('GOOGLE_CLOUD_API_KEY')) {
                toast.error("Google Cloud API key not configured");
                fatalWsError = true;
              } else if (msg.includes('quota') || msg.includes('limit')) {
                toast.error("Google Cloud quota exceeded");
                fatalWsError = true;
              } else if (msg.includes('Recognition error')) {
                toast.error("Speech recognition error");
              } else {
                toast.error(`Captions error: ${msg}`);
              }
              
              if (fatalWsError) {
                try {
                  newWs.close(1000, "Fatal error");
                } catch {
                }
                try {
                  setCaptionsEnabled(false);
                } catch {
                }
              }
              return;
            }

            if (data?.type !== "transcript") return;

            const isLocalSpeaker = String(data?.speaker_user_id || "") === String(authUserIdRef.current || "");

            const originalText = String(data?.original_text || "").trim();
            if (!originalText) return;

            const isFinal = data?.is_final === true;
            const speakerName = isLocalSpeaker
              ? "You"
              : String(data?.speaker_full_name || data?.speaker || "Speaker");
            const speakerUserId = String(data?.speaker_user_id || "").trim() || speakerName;

            // Pause-based utterance segmentation (per speaker).
            const segKey = String(speakerUserId || "");
            const seg = utteranceRef.current[segKey] || {
              idx: 0,
              pauseTimer: null,
              softTimer: null,
              hardTimer: null,
              lastOriginal: "",
              lastTranslated: "",
              lastUpdateAtMs: 0,
              wordCount: 0,
              spoken: false,
              rescheduleCount: 0,
            };

            const utteranceKey = `${segKey}::${seg.idx}`;

            const finalizeUtterance = () => {
              const translated = String(seg.lastTranslated || "").trim();
              const original = String(seg.lastOriginal || "").trim();
              if (!translated || !original) {
                // If translation isn't ready yet, retry briefly (avoid losing speech on slow translation).
                if (seg.rescheduleCount < 4) {
                  seg.rescheduleCount += 1;
                  seg.pauseTimer = setTimeout(finalizeUtterance, 250);
                  utteranceRef.current[segKey] = seg;
                }
                return;
              }
              if (seg.spoken) return;
              seg.spoken = true;
              seg.rescheduleCount = 0;
              utteranceRef.current[segKey] = seg;

              try {
                enqueueTtsRef.current?.(translated, peerGenderRef.current, { utteranceKey });
              } catch {
              }

              // Prepare next utterance slot.
              seg.idx += 1;
              seg.spoken = false;
              seg.lastOriginal = "";
              seg.lastTranslated = "";
              seg.lastUpdateAtMs = 0;
              seg.wordCount = 0;
              seg.rescheduleCount = 0;
              utteranceRef.current[segKey] = seg;
            };

            try {
              if (seg.pauseTimer) clearTimeout(seg.pauseTimer);
            } catch {
            }

            try {
              if (seg.softTimer) clearTimeout(seg.softTimer);
            } catch {
            }

            try {
              if (seg.hardTimer) clearTimeout(seg.hardTimer);
            } catch {
            }

            // Captions: overwrite the same line per current utterance.
            const originalCaption = {
              id: `${Date.now()}-o`,
              replaceId: `${utteranceKey}-original`,
              utteranceKey,
              speaker: speakerName,
              text: originalText,
              timestamp: new Date().toISOString(),
              type: "original",
              isFinal,
              language: data?.speaker_profile_language_raw || "Unknown",
              speaker_profile_language: data?.speaker_profile_language,
              speaker_profile_language_raw: data?.speaker_profile_language_raw,
              target_language: data?.target_language,
              target_language_raw: data?.target_language_raw,
            };
            pushCaption(originalCaption);

            seg.lastOriginal = originalText;
            seg.lastUpdateAtMs = Date.now();
            seg.wordCount = String(originalText || "")
              .trim()
              .split(/\s+/)
              .filter(Boolean).length;

            if (data?.translated_text) {
              const translatedCaption = {
                id: `${Date.now()}-t`,
                replaceId: `${utteranceKey}-translation`,
                utteranceKey,
                speaker: speakerName,
                text: String(data.translated_text || ""),
                timestamp: new Date().toISOString(),
                type: "translation",
                isFinal,
                language: data?.target_language_raw || "Unknown",
                speaker_profile_language: data?.speaker_profile_language,
                speaker_profile_language_raw: data?.speaker_profile_language_raw,
                target_language: data?.target_language,
                target_language_raw: data?.target_language_raw,
              };
              pushCaption(translatedCaption);

              seg.lastTranslated = String(data.translated_text || "");
            }

            // Speak only once per utterance (on final or pause), to avoid repeats and 429.
            if (!isLocalSpeaker && interpretationModeRef.current) {
              if (isFinal) {
                finalizeUtterance();
              } else {
                // Hybrid segmentation:
                // - Soft pause for low latency
                // - Hard pause for explicit sentence boundary
                // - Max words to avoid long buffering
                if (seg.wordCount >= MAX_WORDS && String(seg.lastTranslated || "").trim()) {
                  finalizeUtterance();
                } else {
                  seg.softTimer = setTimeout(finalizeUtterance, SOFT_PAUSE_MS);
                  seg.hardTimer = setTimeout(finalizeUtterance, HARD_PAUSE_MS);
                }
                utteranceRef.current[segKey] = seg;
              }
            }
          };
        };

        connectWebSocket();

        let audioChunkCount = 0;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          console.error("[Captions] AudioContext not supported");
          return;
        }
        const audioCtx = new AudioCtx({ sampleRate: 16000, latencyHint: "interactive" });
        audioCtxRef.current = audioCtx;
        console.log("[Captions] AudioContext created with sampleRate:", audioCtx.sampleRate);

        try {
          await audioCtx.resume();
          console.log("[Captions] AudioContext resumed");
        } catch (error) {
          console.error("[Captions] Error resuming AudioContext:", error);
        }

        // Try to use AudioWorklet (modern approach)
        try {
          console.log("[Captions] Loading AudioWorklet processor...");
          await audioCtx.audioWorklet.addModule('/audio-processor.js');
          
          const source = audioCtx.createMediaStreamSource(stream);
          const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor', {
            processorOptions: {
              bufferSize: 4096
            }
          });
          
          processorRef.current = workletNode;
          
          source.connect(workletNode);
          workletNode.connect(audioCtx.destination);
          
          console.log("[Captions] AudioWorklet nodes connected");
          
          workletNode.port.onmessage = (event) => {
            if (stopped) return;
            const currentWs = socketRef.current;
            if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
            
            if (event.data.type === 'audio-data') {
              const inputBuffer = event.data.buffer;
              
              // Check if input has actual audio data (not all zeros)
              let hasAudio = false;
              for (let i = 0; i < Math.min(100, inputBuffer.length); i++) {
                if (Math.abs(inputBuffer[i]) > 0.001) {
                  hasAudio = true;
                  break;
                }
              }
              
              // Always send audio data to keep connection alive
              const down = downsampleBuffer(inputBuffer, audioCtx.sampleRate, 16000);
              const pcm16 = floatTo16BitPCM(down);

              try {
                currentWs.send(pcm16);
                audioChunkCount++;
                
                // Log every 50 chunks (approximately every 2 seconds)
                if (audioChunkCount % 50 === 0) {
                  console.log("[Captions] Sent audio chunk #" + audioChunkCount + ", size: " + pcm16.byteLength + ", hasAudio: " + hasAudio + ", type: " + pcm16.constructor.name);
                }
              } catch (error) {
                console.error("[Captions] Error sending audio:", error);
              }
            }
          };
          
        } catch (workletError) {
          console.warn("[Captions] AudioWorklet failed, falling back to ScriptProcessorNode:", workletError);
          
          // Fallback to ScriptProcessorNode (deprecated but more compatible)
          const source = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          
          console.log("[Captions] Using fallback ScriptProcessorNode, buffer size:", processor.bufferSize);
          
          source.connect(processor);
          processor.connect(audioCtx.destination);
          
          console.log("[Captions] Audio nodes connected (fallback)");

          processor.onaudioprocess = (e) => {
            if (stopped) return;
            const currentWs = socketRef.current;
            if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

            const input = e.inputBuffer.getChannelData(0);
            
            // Check if input has actual audio data (not all zeros)
            let hasAudio = false;
            for (let i = 0; i < Math.min(100, input.length); i++) {
              if (Math.abs(input[i]) > 0.001) {
                hasAudio = true;
                break;
              }
            }
            
            // Always send audio data to keep connection alive
            const down = downsampleBuffer(input, audioCtx.sampleRate, 16000);
            const pcm16 = floatTo16BitPCM(down);

            try {
              currentWs.send(pcm16);
              audioChunkCount++;
              
              // Log every 50 chunks (approximately every 2 seconds)
              if (audioChunkCount % 50 === 0) {
                console.log("[Captions] Sent audio chunk #" + audioChunkCount + ", size: " + pcm16.byteLength + ", hasAudio: " + hasAudio + ", type: " + pcm16.constructor.name);
              }
            } catch (error) {
              console.error("[Captions] Error sending audio:", error);
            }
          };
        }
      } catch {
        toast.error("Captions: could not start audio capture");
      }
    };

    start();

    return () => {
      stopped = true;

      try {
        if (pendingInterimTtsRef.current.timer) clearTimeout(pendingInterimTtsRef.current.timer);
      } catch {
      }

      try {
        const map = utteranceRef.current || {};
        for (const k of Object.keys(map)) {
          try {
            if (map[k]?.pauseTimer) clearTimeout(map[k].pauseTimer);
          } catch {
          }
        }
      } catch {
      }

      try {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      } catch {
      }

      try {
        processorRef.current?.disconnect?.();
      } catch {
      }

      try {
        audioCtxRef.current?.close?.();
      } catch {
      }

      try {
        socketRef.current?.close?.();
      } catch {
      }

      try {
        trackHandlersRef.current?.cleanup?.();
      } catch {
      }
      trackHandlersRef.current = null;
      trackRef.current = null;

      try {
        // Check if we're using Stream's microphone or a fallback
        const microphoneState = callRef.current?.microphone?.state;
        let hasStreamTrack = false;
        
        if (microphoneState?.mediaStream) {
          hasStreamTrack = microphoneState.mediaStream.getAudioTracks()?.length > 0;
        } else if (microphoneState?.track) {
          hasStreamTrack = microphoneState.track.readyState !== "ended";
        } else {
          const localParticipant = callRef.current?.state?.localParticipant;
          hasStreamTrack = localParticipant?.microphone?.track?.readyState !== "ended";
        }
        
        if (!hasStreamTrack) {
          for (const t of micStreamRef.current?.getTracks?.() || []) t.stop();
        }
      } catch {
      }

      interimRef.current = "";
    };
  }, [callId, captionsEnabled, pushCaption, restartSeq, setCaptionsEnabled]);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-3 bg-base-100/95 backdrop-blur-md rounded-2xl border-2 border-primary/20 shadow-xl p-4 min-w-[320px]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-primary">Live Captions</div>
        <div className={`w-2 h-2 rounded-full ${captionsEnabled ? "bg-success animate-pulse" : "bg-error"}`}></div>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-base-content/70">Your Language:</span>
        <div className="flex-1 text-xs font-semibold text-base-content/80">
          {String(authUser?.nativeLanguage || "").trim() || "Not set in profile"}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-base-content/70">Opponent:</span>
        <div className="flex-1 text-xs text-base-content/70">
          {peerMeta?.fullName ? (
            <div className="flex items-center gap-1">
              <span className="font-semibold">{peerMeta.fullName}</span>
              <span className="text-primary">({peerMeta.nativeLanguage || "Unknown"})</span>
            </div>
          ) : (
            <span className="italic">Waiting for opponent to join...</span>
          )}
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-base-content/60">
          {captionsEnabled ? "🟢 Engine on" : "⚫ Engine off"}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn btn-xs ${interpretationMode ? "btn-primary" : "btn-outline"}`}
            onClick={() =>
              setInterpretationMode((v) => {
                const next = !v;
                try {
                  console.log("[TTS] Interpretation Mode:", next ? "ON" : "OFF");
                } catch {
                }
                return next;
              })
            }
            title={interpretationMode ? "Disable voice interpretation" : "Enable voice interpretation"}
          >
            {interpretationMode ? "TTS On" : "TTS Off"}
          </button>

          <button
            type="button"
            className={`btn btn-xs ${showCaptions ? "btn-primary" : "btn-outline"}`}
            onClick={() => setShowCaptions((v) => !v)}
            title={showCaptions ? "Hide caption panel" : "Show caption panel"}
          >
            {showCaptions ? "Hide" : "Show"}
          </button>

          <button
            type="button"
            className={`btn btn-sm btn-circle ${captionsEnabled ? "btn-error hover:btn-error" : "btn-success hover:btn-success"}`}
            onClick={() => setCaptionsEnabled((v) => !v)}
            title={captionsEnabled ? "Stop captions engine" : "Start captions engine"}
          >
            {captionsEnabled ? "⏹" : "▶"}
          </button>
        </div>
      </div>
    </div>
  );
};

const CaptionBar = ({
  captions,
  meta,
  peerMeta,
}) => {
  const list = Array.isArray(captions) ? captions : [];

  const originalList = list.filter((c) => c?.type !== "translation");
  const translationList = list.filter((c) => c?.type === "translation");

  const renderList = (items, emptyText, type) => {
    if (!items.length) {
      return (
        <div className="flex items-center justify-center h-16 text-base-content/60 italic">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-warning rounded-full animate-pulse"></div>
            <span>{emptyText}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {items.slice(-12).map((c, index) => (
          <div
            key={c.id}
            className={`p-3 rounded-lg border bg-base-200/40 border-base-300/60 ${
              index === items.slice(-12).length - 1 ? "ring-2 ring-primary/20" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-primary">
                {c.speaker || "Speaker"}
              </div>
              {c.language && (
                <div className="text-xs text-base-content/60">
                  {c.language}
                </div>
              )}
            </div>
            <div className="mt-1 text-sm leading-relaxed text-base-content">{c.text}</div>
          </div>
        ))}
      </div>
    );
  };

  // Get the latest caption to extract language info
  const latestCaption = list[list.length - 1];
  const speakerLang =
    latestCaption?.speaker_profile_language_raw ||
    meta?.speaker_profile_language_raw ||
    "Unknown";
    
  // Get opponent's language for display
  const opponentLang = peerMeta?.nativeLanguage || "Unknown";
  const targetLang =
    meta?.target_language_raw ||
    latestCaption?.target_language_raw ||
    "Unknown";

  return (
    <div className="w-full px-4 pb-2">
      <div className="bg-base-100/90 backdrop-blur-md rounded-2xl border border-base-300 shadow-lg p-4 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
            <span className="text-sm font-bold text-primary">Live Captions</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <span>{peerMeta?.fullName || "Opponent"} ({opponentLang})</span>
            <span>→</span>
            <span>Target: {targetLang}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-primary">
                Original ({opponentLang})
              </div>
              <div className="text-xs text-base-content/60">{originalList.length}</div>
            </div>
            {renderList(originalList, "Waiting for speech...", "original")}
          </div>

          <div className="rounded-xl border border-info/30 bg-info/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-info">
                Translation ({targetLang})
              </div>
              <div className="text-xs text-base-content/60">{translationList.length}</div>
            </div>
            {renderList(translationList, "Waiting for translation...", "translation")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallPage;
