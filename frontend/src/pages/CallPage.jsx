import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken, getSupportedTranslationLanguages } from "../lib/api";
import { ArrowLeftIcon } from "lucide-react";

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

  const navigate = useNavigate();
  const { authUser } = useAuthUser();

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState("english");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [captions, setCaptions] = useState([]);
  const [captionMeta, setCaptionMeta] = useState(null);

  useEffect(() => {
    const nextSpoken = String(authUser?.nativeLanguage || "english").toLowerCase();
    if (nextSpoken) setSpokenLanguage(nextSpoken);
  }, [authUser?.nativeLanguage]);

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
        callId={callId}
        authUser={authUser}
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={setCaptionsEnabled}
        spokenLanguage={spokenLanguage}
        setSpokenLanguage={setSpokenLanguage}
        targetLanguage={targetLanguage}
        setTargetLanguage={setTargetLanguage}
        pushCaption={pushCaption}
        setCaptionMeta={setCaptionMeta}
      />
      <div className="w-full h-[100dvh] flex flex-col">
        <div className="flex-1 min-h-0">
          <SpeakerLayout />
        </div>
        {captionsEnabled ? <CaptionBar captions={captions} meta={captionMeta} /> : null}
        <CallControls />
      </div>
    </StreamTheme>
  );
};

const CaptionControls = ({
  callId,
  authUser,
  captionsEnabled,
  setCaptionsEnabled,
  spokenLanguage,
  setSpokenLanguage,
  targetLanguage,
  setTargetLanguage,
  pushCaption,
  setCaptionMeta,
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

  const [supportedLanguages, setSupportedLanguages] = useState([]);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [loadingLanguages, setLoadingLanguages] = useState(false);
  const [peerMeta, setPeerMeta] = useState(null);

  const fetchSupportedLanguages = useCallback(async () => {
    setLoadingLanguages(true);
    try {
      console.log('[Captions] Fetching supported languages...');
      const res = await getSupportedTranslationLanguages({ target: "en" });
      const items = Array.isArray(res?.languages) ? res.languages : [];
      
      if (items.length === 0) {
        console.warn('[Captions] No languages received from API');
        toast.error("No supported languages available");
        return;
      }
      
      items.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
      setSupportedLanguages(items);
      console.log(`[Captions] Loaded ${items.length} supported languages`);
    } catch (error) {
      console.error('[Captions] Error fetching supported languages:', error);
      const errorMessage = error?.response?.data?.message || error?.message || "Failed to fetch supported languages";
      toast.error(errorMessage);
    } finally {
      setLoadingLanguages(false);
    }
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

    const wsUrl = `${wsOrigin}/ws/google-cloud?token=${encodeURIComponent(token)}&callId=${encodeURIComponent(callId || "")}&target_language=${encodeURIComponent(targetLanguage || "en")}`;

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

            const originalText = String(data?.original_text || "").trim();
            if (!originalText) return;

            if (data?.is_final !== true) return;

            const speakerName = String(data?.speaker_full_name || data?.speaker || "Speaker");

            const originalCaption = {
              id: `${Date.now()}-o`,
              speaker: speakerName,
              text: originalText,
              timestamp: new Date().toISOString(),
              type: "original",
              language: data?.speaker_profile_language_raw || "Unknown",
              speaker_profile_language: data?.speaker_profile_language,
              speaker_profile_language_raw: data?.speaker_profile_language_raw,
              target_language: data?.target_language,
              target_language_raw: data?.target_language_raw,
            };
            pushCaption(originalCaption);

            if (data?.translated_text) {
              const translatedCaption = {
                id: `${Date.now()}-t`,
                speaker: speakerName,
                text: String(data.translated_text || ""),
                timestamp: new Date().toISOString(),
                type: "translation",
                language: data?.target_language_raw || "Unknown",
                speaker_profile_language: data?.speaker_profile_language,
                speaker_profile_language_raw: data?.speaker_profile_language_raw,
                target_language: data?.target_language,
                target_language_raw: data?.target_language_raw,
              };
              pushCaption(translatedCaption);
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
  }, [authUser?.fullName, call, captionsEnabled, pushCaption, setCaptionsEnabled, targetLanguage]);

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
      
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-base-content/70">Get Captions:</span>
        <div className="relative flex-1">
          <button
            type="button"
            className={`btn btn-sm w-full justify-between ${loadingLanguages ? 'btn-disabled' : 'btn-outline'}`}
            onClick={async () => {
              const next = !languagesOpen;
              setLanguagesOpen(next);
              if (next && supportedLanguages.length === 0 && !loadingLanguages) {
                await fetchSupportedLanguages();
              }
            }}
            disabled={loadingLanguages}
          >
            <span className="truncate">
              {loadingLanguages ? (
                <span className="flex items-center gap-2">
                  <span className="loading loading-spinner loading-xs"></span>
                  Loading languages...
                </span>
              ) : targetLanguage ? (
                `Language 2: ${targetLanguage}`
              ) : (
                "Select Language 2"
              )}
            </span>
            <span className="text-xs opacity-60">
              {loadingLanguages ? "" : supportedLanguages.length ? `${supportedLanguages.length}` : "0"}
            </span>
          </button>

          {languagesOpen ? (
            <div className="absolute right-0 mt-2 w-[420px] max-w-[80vw] z-30 bg-base-100 border border-base-300 rounded-xl shadow-xl overflow-hidden">
              <div className="p-3 border-b border-base-300 flex items-center justify-between">
                <div className="text-xs font-bold text-base-content/70">
                  Total Languages: {supportedLanguages.length}
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => setLanguagesOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="max-h-[280px] overflow-y-auto">
                {loadingLanguages ? (
                  <div className="p-8 flex flex-col items-center justify-center">
                    <span className="loading loading-spinner loading-md mb-3"></span>
                    <div className="text-sm text-base-content/60">Loading supported languages...</div>
                  </div>
                ) : supportedLanguages.length > 0 ? (
                  supportedLanguages.map((l) => {
                    const code = String(l?.language || l?.code || "");
                    const name = String(l?.name || code);
                    return (
                      <button
                        key={`lang-${code}`}
                        type="button"
                        className={`w-full text-left px-3 py-2 hover:bg-base-200 flex items-center justify-between transition-colors ${
                          code === targetLanguage ? "bg-primary/10 border-l-4 border-primary" : ""
                        }`}
                        onClick={() => {
                          setTargetLanguage(code || "en");
                          setLanguagesOpen(false);
                          toast.success(`Language set to: ${name}`);
                        }}
                      >
                        <span className="text-sm truncate font-medium">{name}</span>
                        <span className="text-xs text-base-content/60 bg-base-200 px-2 py-1 rounded">{code}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-sm text-base-content/60 mb-3">No languages loaded</div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => fetchSupportedLanguages()}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
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
  meta,
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
  const speakerLang =
    latestCaption?.speaker_profile_language_raw ||
    meta?.speaker_profile_language_raw ||
    "Unknown";
  const targetLang =
    latestCaption?.target_language_raw ||
    meta?.target_language_raw ||
    "Unknown";

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
