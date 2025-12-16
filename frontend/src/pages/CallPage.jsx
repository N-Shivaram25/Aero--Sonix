import { useEffect, useState } from "react";
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

  const { authUser, isLoading } = useAuthUser();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    const initCall = async () => {
      if (!tokenData.token || !authUser || !callId) return;

      try {
        console.log("Initializing Stream video client...");

        const user = {
          id: authUser._id,
          name: authUser.fullName,
          image: authUser.profilePic,
        };

        const videoClient = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user,
          token: tokenData.token,
        });

        const callInstance = videoClient.call("default", callId);

        await callInstance.join({ create: true });

        console.log("Joined call successfully");

        setClient(videoClient);
        setCall(callInstance);
      } catch (error) {
        console.error("Error joining call:", error);
        toast.error("Could not join the call. Please try again.");
      } finally {
        setIsConnecting(false);
      }
    };

    initCall();
  }, [tokenData, authUser, callId]);

  if (isLoading || isConnecting) return <PageLoader />;

  return (
    <div className="h-screen flex flex-col items-center justify-center">
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

  if (callingState === CallingState.LEFT) return navigate("/");

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
  const [myVoiceId, setMyVoiceId] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getMyVoiceProfile();
        setMyVoiceId(res?.elevenLabsVoiceId || "");
      } catch {
        // ignore
      }
    };
    if (authUser) load();
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

    const startForParticipant = async (p) => {
      if (!p || p.isLocalParticipant) return;
      if (!hasAudio(p)) return;
      if (recorders.has(p.sessionId)) return;

      const stream = p.audioStream;
      if (!stream) return;

      try {
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorders.set(p.sessionId, recorder);

        recorder.ondataavailable = async (evt) => {
          if (stopped) return;
          if (!evt?.data || evt.data.size === 0) return;

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

            const ttsRes = await callTts({ text: translatedText, speakerUserId: p.userId });
            const buf = ttsRes?.data;
            if (!buf) return;

            const blob = new Blob([buf], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            await audio.play();
          } catch {
            // ignore chunk failures to keep realtime flowing
          }
        };

        recorder.start(400);
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
    };
  }, [enabled, participants, targetLanguage]);

  const toggle = () => {
    if (!enabled) {
      if (!myVoiceId) {
        alert("You didnot inserted your voice-ID.Go to Profile Page");
        navigate("/profile");
        return;
      }
    }
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
