import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { callWhisperStt, getStreamToken } from "../lib/api";
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

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState("english");
  const [captionText, setCaptionText] = useState("");
  const [captionSpeaker, setCaptionSpeaker] = useState("");

  useEffect(() => {
    if (callingState === CallingState.LEFT) {
      navigate("/");
    }
  }, [callingState, navigate]);

  if (callingState === CallingState.LEFT) return null;

  return (
    <StreamTheme>
      <CaptionControls
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={setCaptionsEnabled}
        spokenLanguage={spokenLanguage}
        setSpokenLanguage={setSpokenLanguage}
        setCaptionText={setCaptionText}
        setCaptionSpeaker={setCaptionSpeaker}
      />
      <div className="w-full h-[100dvh] flex flex-col">
        <div className="flex-1 min-h-0">
          <SpeakerLayout />
        </div>
        {captionsEnabled ? <CaptionBar text={captionText} speaker={captionSpeaker} /> : null}
        <CallControls />
      </div>
    </StreamTheme>
  );
};

const CaptionControls = ({
  captionsEnabled,
  setCaptionsEnabled,
  spokenLanguage,
  setSpokenLanguage,
  setCaptionText,
  setCaptionSpeaker,
}) => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const inFlightRef = useRef(new Map());

  useEffect(() => {
    if (!captionsEnabled) return;

    let stopped = false;
    const recorders = new Map();

    const startForParticipant = async (p) => {
      if (!p) return;
      if (!hasAudio(p)) return;
      if (!p.sessionId) return;
      if (recorders.has(p.sessionId)) return;

      const stream = p.audioStream;
      if (!stream) return;

      try {
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorders.set(p.sessionId, recorder);
        inFlightRef.current.set(p.sessionId, false);

        recorder.ondataavailable = async (evt) => {
          if (stopped) return;
          if (!evt?.data || evt.data.size === 0) return;
          if (inFlightRef.current.get(p.sessionId)) return;
          inFlightRef.current.set(p.sessionId, true);

          try {
            const sttRes = await callWhisperStt({
              audioBlob: evt.data,
              language: spokenLanguage,
              translate: true,
            });
            const text = sttRes?.text || "";
            if (!text.trim()) return;

            setCaptionText(text);
            setCaptionSpeaker(p.name || p.userId || "");
          } catch {
          } finally {
            inFlightRef.current.set(p.sessionId, false);
          }
        };

        recorder.start(1200);
      } catch {
      }
    };

    const boot = async () => {
      for (const p of participants || []) {
        await startForParticipant(p);
      }
    };

    boot();

    return () => {
      stopped = true;
      for (const rec of recorders.values()) {
        try {
          rec.stop();
        } catch {
        }
      }
      recorders.clear();
      inFlightRef.current.clear();
    };
  }, [captionsEnabled, participants, spokenLanguage, setCaptionSpeaker, setCaptionText]);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-base-100/80 backdrop-blur rounded-xl border border-base-300 p-3">
      <div className="text-sm font-semibold">Translation</div>
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

const CaptionBar = ({ text, speaker }) => {
  const value = String(text || "").trim();
  const who = String(speaker || "").trim();

  return (
    <div className="w-full px-4 pb-4">
      <div className="w-full rounded-xl border border-base-300 bg-base-100/90 backdrop-blur px-4 py-3 min-h-[56px] flex items-center">
        <div className="text-sm w-full truncate">
          {value ? (
            <span>
              {who ? <span className="font-semibold mr-2">{who}:</span> : null}
              <span>{value}</span>
            </span>
          ) : (
            <span className="opacity-60">Listening…</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallPage;
