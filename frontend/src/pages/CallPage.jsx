import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";
import { ArrowLeftIcon } from "lucide-react";
import { LANGUAGES } from "../constants";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  SpeakerLayout,
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
              <CallContent />
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

const CallContent = () => {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  const navigate = useNavigate();
  const { authUser } = useAuthUser();

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState("english");
  const [captions, setCaptions] = useState([]);

  const pushCaption = useCallback((c) => {
    setCaptions((prev) => {
      const next = [...prev, c];
      return next.length > 8 ? next.slice(next.length - 8) : next;
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
        authUser={authUser}
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={setCaptionsEnabled}
        spokenLanguage={spokenLanguage}
        setSpokenLanguage={setSpokenLanguage}
        pushCaption={pushCaption}
      />
      <div className="w-full h-[100dvh] flex flex-col">
        <div className="flex-1 min-h-0">
          <SpeakerLayout />
        </div>
        {captionsEnabled ? <CaptionBar captions={captions} /> : null}
        <CallControls />
      </div>
    </StreamTheme>
  );
};

const CaptionControls = ({
  authUser,
  captionsEnabled,
  setCaptionsEnabled,
  spokenLanguage,
  setSpokenLanguage,
  pushCaption,
}) => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const call = useCall();

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const micStreamRef = useRef(null);
  const interimRef = useRef("");
  const silenceTimerRef = useRef(null);

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

    const lang = toDeepgramLanguage(spokenLanguage);

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

    const wsUrl = `${wsOrigin}/ws/deepgram?token=${encodeURIComponent(token)}&language=${encodeURIComponent(lang)}&target_language=${encodeURIComponent(lang)}`;

    let stopped = false;

    const start = async () => {
      try {
        try {
          await call?.microphone?.enable?.();
          // Add a small delay to ensure microphone is properly initialized
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch {
        }

        let stream;
        // Try multiple approaches to get the microphone track from Stream
        let publishedAudio = null;
        let maybeMediaStreamTrack = null;
        
        // Method 1: Try microphone state
        const microphoneState = call?.microphone?.state;
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
          const localParticipant = call?.state?.localParticipant;
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

        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 3;

        const connectWebSocket = () => {
          if (reconnectAttempts >= maxReconnectAttempts || stopped) return;
          
          const newWs = new WebSocket(wsUrl);
          socketRef.current = newWs;
          
          newWs.onopen = () => {
            console.log("[Captions] WS open");
            reconnectAttempts = 0; // Reset on successful connection
          };

          newWs.onclose = (e) => {
            console.log("[Captions] WS close", e?.code, e?.reason);
            
            // Attempt to reconnect if it's an abnormal closure and we haven't exceeded attempts
            if (e?.code !== 1000 && reconnectAttempts < maxReconnectAttempts && !stopped) {
              reconnectAttempts++;
              console.log(`[Captions] Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})`);
              setTimeout(connectWebSocket, 1000 * reconnectAttempts); // Exponential backoff
            }
          };

          newWs.onerror = (e) => {
            console.log("[Captions] WS error", e);
            if (reconnectAttempts === 0) { // Only show toast on first error
              toast.error("Captions: WebSocket connection failed");
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

            console.log("[Captions] Received WS message:", JSON.stringify(data, null, 2));

            // Handle both Deepgram and Sarvam message formats
            const transcript =
              data?.channel?.alternatives?.[0]?.transcript || // Deepgram format
              data?.channel?.alternatives?.[0]?.paragraphs?.transcript || // Deepgram paragraphs
              data?.text || // Sarvam format (old)
              data?.original_text || // Sarvam format (new - original text)
              "";

            if (!String(transcript || "").trim()) return;

            const isFinal =
              data?.is_final === true ||
              data?.speech_final === true ||
              data?.type === "Results" ||
              data?.is_final === true; // Sarvam format

            // Handle dual captions (original + translation)
            if (data?.original_text && data?.translated_text) {
              // Send original text
              interimRef.current = String(data.original_text || "");
              if (isFinal) {
                const originalCaption = {
                  id: Date.now().toString(),
                  speaker: authUser?.fullName || "You",
                  text: data.original_text,
                  timestamp: new Date().toISOString(),
                  type: "original",
                  language: data.speaker_profile_language_raw || "Unknown",
                  speaker_profile_language: data.speaker_profile_language,
                  speaker_profile_language_raw: data.speaker_profile_language_raw,
                  target_language: data.target_language,
                  target_language_raw: data.target_language_raw
                };
                console.log("[Captions] Pushing original caption:", JSON.stringify(originalCaption, null, 2));
                pushCaption(originalCaption);
              }
              
              // Send translated text with a small delay
              setTimeout(() => {
                if (data.translated_text) {
                  const translatedCaption = {
                    id: (Date.now() + 1).toString(),
                    speaker: authUser?.fullName || "You",
                    text: data.translated_text,
                    timestamp: new Date().toISOString(),
                    type: "translation",
                    language: data.target_language_raw || "Unknown",
                    speaker_profile_language: data.speaker_profile_language,
                    speaker_profile_language_raw: data.speaker_profile_language_raw,
                    target_language: data.target_language,
                    target_language_raw: data.target_language_raw
                  };
                  console.log("[Captions] Pushing translated caption:", JSON.stringify(translatedCaption, null, 2));
                  pushCaption(translatedCaption);
                }
              }, 100);
            } else {
              // Single caption (no translation needed)
              interimRef.current = String(transcript || "");
              if (isFinal) {
                const caption = {
                  id: Date.now().toString(),
                  speaker: authUser?.fullName || "You",
                  text: transcript,
                  timestamp: new Date().toISOString(),
                  type: "original",
                  language: data?.speaker_profile_language_raw || "Unknown",
                  speaker_profile_language: data?.speaker_profile_language,
                  speaker_profile_language_raw: data?.speaker_profile_language_raw,
                  target_language: data?.target_language,
                  target_language_raw: data?.target_language_raw
                };
                console.log("[Captions] Pushing single caption:", JSON.stringify(caption, null, 2));
                pushCaption(caption);
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

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        console.log("[Captions] Audio processor created, buffer size:", processor.bufferSize);
        
        source.connect(processor);
        processor.connect(audioCtx.destination);
        
        console.log("[Captions] Audio nodes connected");

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
          
          // Always send audio data to keep Deepgram connection alive
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
      } catch {
        toast.error("Captions: could not start audio capture");
      }
    };

    start();

    return () => {
      stopped = true;

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
        // Check if we're using Stream's microphone or a fallback
        const microphoneState = call?.microphone?.state;
        let hasStreamTrack = false;
        
        if (microphoneState?.mediaStream) {
          hasStreamTrack = microphoneState.mediaStream.getAudioTracks()?.length > 0;
        } else if (microphoneState?.track) {
          hasStreamTrack = microphoneState.track.readyState !== "ended";
        } else {
          const localParticipant = call?.state?.localParticipant;
          hasStreamTrack = localParticipant?.microphone?.track?.readyState !== "ended";
        }
        
        if (!hasStreamTrack) {
          for (const t of micStreamRef.current?.getTracks?.() || []) t.stop();
        }
      } catch {
      }

      interimRef.current = "";
    };
  }, [authUser?.fullName, call, captionsEnabled, pushCaption, setCaptionsEnabled, spokenLanguage]);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-3 bg-base-100/95 backdrop-blur-md rounded-2xl border-2 border-primary/20 shadow-xl p-4 min-w-[280px]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-primary">Live Captions</div>
        <div className={`w-2 h-2 rounded-full ${captionsEnabled ? "bg-success animate-pulse" : "bg-error"}`}></div>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-base-content/70">Language:</span>
        <select
          className="select select-bordered select-sm select-primary flex-1"
          value={spokenLanguage}
          onChange={(e) => setSpokenLanguage(e.target.value)}
        >
          {LANGUAGES.map((lang) => (
            <option key={`spoken-${lang}`} value={lang.toLowerCase()}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-base-content/60">
          {captionsEnabled ? "🟢 Transcribing..." : "⚫ Inactive"}
        </span>
        <button
          type="button"
          className={`btn btn-sm btn-circle ${captionsEnabled ? "btn-error hover:btn-error" : "btn-success hover:btn-success"}`}
          onClick={() => setCaptionsEnabled((v) => !v)}
          title={captionsEnabled ? "Stop captions" : "Start captions"}
        >
          {captionsEnabled ? "⏹" : "▶"}
        </button>
      </div>
    </div>
  );
};

const CaptionBar = ({
  captions,
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
      <div className="space-y-2 max-h-[220px] overflow-y-auto">
        {items.slice(-6).map((c, index) => (
          <div
            key={c.id}
            className={`p-3 rounded-lg border bg-base-200/40 border-base-300/60 ${
              index === items.slice(-6).length - 1 ? "ring-2 ring-primary/20" : ""
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
  const speakerLang = latestCaption?.speaker_profile_language_raw || "Unknown";
  const targetLang = latestCaption?.target_language_raw || "Unknown";

  return (
    <div className="w-full px-4 pb-2">
      <div className="bg-base-100/90 backdrop-blur-md rounded-2xl border border-base-300 shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
            <span className="text-sm font-bold text-primary">Live Captions</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <span>Speaker: {speakerLang}</span>
            <span>→</span>
            <span>Target: {targetLang}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-primary">
                Original ({speakerLang})
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
