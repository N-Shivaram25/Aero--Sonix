import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { callStt, callTranslate, callTts, getMyVoiceProfile, getStreamToken } from "../lib/api";
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

  useEffect(() => {
    if (callingState === CallingState.LEFT) {
      navigate("/");
    }
  }, [callingState, navigate]);

  if (callingState === CallingState.LEFT) return null;

  return (
    <StreamTheme>
      <TranslationControls />
      <SpeakerLayout />
      <CallControls />
    </StreamTheme>
  );
};

const TranslationControls = () => {
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  const { useParticipants, useSpeakerState } = useCallStateHooks();
  const participants = useParticipants();
  const { speaker } = useSpeakerState();

  const [enabled, setEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("english");

  useEffect(() => {
    // warm auth + avoid first-call 401 surprises
    if (!authUser) return;
    getMyVoiceProfile().catch(() => {});
  }, [authUser]);

  useEffect(() => {
    if (!enabled) return;

    // Mute other participants to prevent echo / double audio.
    for (const p of participants || []) {
      if (!p || p.isLocalParticipant) continue;
      try {
        speaker.setParticipantVolume(p.sessionId, 0);
      } catch {
        // ignore
      }
    }
  }, [enabled, participants, speaker]);

  useEffect(() => {
    if (!enabled) {
      // restore volumes
      for (const p of participants || []) {
        if (!p || p.isLocalParticipant) continue;
        try {
          speaker.setParticipantVolume(p.sessionId, undefined);
        } catch {
          // ignore
        }
      }
      return;
    }

    let stopped = false;
    const recorders = new Map();
    const inFlight = new Map();

    const startForParticipant = async (p) => {
      if (!p || p.isLocalParticipant) return;
      if (!hasAudio(p)) return;
      if (recorders.has(p.sessionId)) return;

      const stream = p.audioStream;
      if (!stream) return;

      try {
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorders.set(p.sessionId, recorder);
        inFlight.set(p.sessionId, false);

        recorder.ondataavailable = async (evt) => {
          if (stopped) return;
          if (!evt?.data || evt.data.size === 0) return;
          if (inFlight.get(p.sessionId)) return;
          inFlight.set(p.sessionId, true);

          try {
            const sttRes = await callStt({ audioBlob: evt.data, speakerUserId: p.userId });
            const text = sttRes?.text || "";
            if (!text.trim()) return;

            const trRes = await callTranslate({
              text,
              targetLanguage,
              speakerUserId: p.userId,
            });
            const translatedText = trRes?.translatedText || "";
            if (!translatedText.trim()) return;

            let ttsRes;
            try {
              ttsRes = await callTts({ text: translatedText, speakerUserId: p.userId });
            } catch (err) {
              return;
            }

            const buf = ttsRes?.data;
            if (!buf) return;

            const blob = new Blob([buf], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            await audio.play();
          } catch {
            // ignore chunk failures to keep realtime flowing
          } finally {
            inFlight.set(p.sessionId, false);
          }
        };

        recorder.start(1200);
      } catch {
        // ignore
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
          // ignore
        }
      }
      recorders.clear();
      inFlight.clear();
    };
  }, [enabled, participants, targetLanguage]);

  const toggle = () => {
    setEnabled((v) => !v);
  };

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-base-100/80 backdrop-blur rounded-xl border border-base-300 p-3">
      <div className="text-sm font-semibold">Live Translation</div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-70">Target</span>
        <select
          className="select select-bordered select-sm"
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          disabled={!enabled}
        >
          {LANGUAGES.map((lang) => (
            <option key={`target-${lang}`} value={lang.toLowerCase()}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className={`btn btn-sm ${enabled ? "btn-error" : "btn-success"}`} onClick={toggle}>
        {enabled ? "Disable Translation" : "Enable Translation"}
      </button>
    </div>
  );
};

export default CallPage;
