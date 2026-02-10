import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { callDeepgramStt, getStreamToken } from "../lib/api";
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
        pushCaption={(c) =>
          setCaptions((prev) => {
            const next = [...prev, c];
            return next.length > 8 ? next.slice(next.length - 8) : next;
          })
        }
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

  const inFlightRef = useRef(new Map());

  const pickMimeType = () => {
    const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch {
      }
    }
    return "";
  };

  useEffect(() => {
    if (!captionsEnabled) return;

    let stopped = false;
    const sessions = new Map();

    const startSession = async ({
      sessionId,
      stream,
      speakerName,
      stopTracksOnCleanup,
    }) => {
      if (!sessionId || !stream) return;
      if (sessions.has(sessionId)) return;

      const state = {
        sessionId,
        stream,
        speakerName,
        stopTracksOnCleanup,
        chunks: [],
        lastVoiceAt: 0,
        recorder: null,
        interval: null,
        audioCtx: null,
        analyser: null,
        rafId: null,
      };

      const key = sessionId;
      inFlightRef.current.set(key, false);
      sessions.set(sessionId, state);

      const startVoiceDetector = () => {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          const audioCtx = new AudioCtx();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);

          const data = new Uint8Array(analyser.frequencyBinCount);

          state.audioCtx = audioCtx;
          state.analyser = analyser;

          const tick = () => {
            if (stopped) return;
            try {
              analyser.getByteFrequencyData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) sum += data[i];
              const avg = sum / (data.length || 1);

              // Heuristic threshold; tuned to catch speech but ignore silence.
              if (avg > 12) state.lastVoiceAt = Date.now();
            } catch {
            }
            state.rafId = requestAnimationFrame(tick);
          };

          state.rafId = requestAnimationFrame(tick);
        } catch {
        }
      };

      const flushIfReady = async () => {
        if (stopped) return;
        if (inFlightRef.current.get(key)) return;
        if (!state.chunks.length) return;
        if (!state.lastVoiceAt) return;

        const silentForMs = Date.now() - state.lastVoiceAt;
        if (silentForMs < 3000) return;

        const blob = new Blob(state.chunks, { type: state.recorder?.mimeType || "audio/webm" });
        state.chunks = [];

        inFlightRef.current.set(key, true);
        try {
          const sttRes = await callDeepgramStt({ audioBlob: blob, language: spokenLanguage });
          const text = sttRes?.text || "";
          if (!text.trim()) return;

          pushCaption({
            id: `${Date.now()}-${key}`,
            speaker: state.speakerName || "",
            text,
            ts: Date.now(),
          });
        } catch {
        } finally {
          inFlightRef.current.set(key, false);
          // reset lastVoiceAt so we don't re-flush immediately on long silences
          state.lastVoiceAt = 0;
        }
      };

      try {
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        state.recorder = recorder;

        recorder.ondataavailable = (evt) => {
          if (stopped) return;
          if (!evt?.data || evt.data.size === 0) return;
          state.chunks.push(evt.data);
        };

        startVoiceDetector();

        // capture frequent small chunks; we only transcribe on silence
        recorder.start(500);

        state.interval = setInterval(() => {
          flushIfReady();
        }, 250);
      } catch {
        sessions.delete(sessionId);
        inFlightRef.current.delete(key);
      }
    };

    const boot = async () => {
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await startSession({
          sessionId: "local",
          stream: localStream,
          speakerName: authUser?.fullName || "You",
          stopTracksOnCleanup: true,
        });
      } catch {
      }

      for (const p of participants || []) {
        if (!p) continue;
        if (!hasAudio(p)) continue;
        if (!p.sessionId) continue;
        if (!p.audioStream) continue;
        await startSession({
          sessionId: p.sessionId,
          stream: p.audioStream,
          speakerName: p.name || p.userId || "",
          stopTracksOnCleanup: false,
        });
      }
    };

    boot();

    return () => {
      stopped = true;

      for (const s of sessions.values()) {
        try {
          if (s.interval) clearInterval(s.interval);
        } catch {
        }

        try {
          s.recorder?.stop?.();
        } catch {
        }

        try {
          if (s.rafId) cancelAnimationFrame(s.rafId);
        } catch {
        }

        try {
          s.audioCtx?.close?.();
        } catch {
        }

        if (s.stopTracksOnCleanup) {
          try {
            for (const t of s.stream?.getTracks?.() || []) t.stop();
          } catch {
          }
        }
      }

      sessions.clear();
      inFlightRef.current.clear();
    };
  }, [authUser?.fullName, captionsEnabled, participants, pushCaption, spokenLanguage]);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-base-100/80 backdrop-blur rounded-xl border border-base-300 p-3">
      <div className="text-sm font-semibold">Captions ON/OFF (STT)</div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-70">Language</span>
        <select
          className="select select-bordered select-sm"
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
      <button
        type="button"
        className={`btn btn-sm ${captionsEnabled ? "btn-error" : "btn-success"}`}
        onClick={() => setCaptionsEnabled((v) => !v)}
      >
        {captionsEnabled ? "Translation OFF" : "Translation ON"}
      </button>
    </div>
  );
};

const CaptionBar = ({
  captions,
}) => {
  const list = Array.isArray(captions) ? captions : [];

  return (
    <div className="w-full px-4 pb-4">
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body p-3">
          <div className="text-xs opacity-70 mb-1">Captions</div>
          <div className="text-sm space-y-1">
            {list.length ? (
              list.slice(-3).map((c) => (
                <div key={c.id} className="w-full truncate">
                  {c.speaker ? <span className="font-semibold mr-2">{c.speaker}:</span> : null}
                  <span>{c.text}</span>
                </div>
              ))
            ) : (
              <div className="opacity-60">Listening…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallPage;
