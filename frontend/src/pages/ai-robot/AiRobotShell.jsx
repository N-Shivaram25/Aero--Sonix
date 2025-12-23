import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import toast from "react-hot-toast";
import { LANGUAGES } from "../../constants";
import {
  aiRobotSendConversationMessage,
  aiRobotStt,
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

  const stopTimerRef = useRef(null);
  const audioRef = useRef(null);

  const [voiceModalName, setVoiceModalName] = useState("");
  const [voiceSampleRecorder, setVoiceSampleRecorder] = useState(null);
  const [voiceSampleIsRecording, setVoiceSampleIsRecording] = useState(false);
  const [voiceSampleBlob, setVoiceSampleBlob] = useState(null);
  const [creatingVoiceId, setCreatingVoiceId] = useState(false);
  const voiceSampleStopTimerRef = useRef(null);

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
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch {
      // ignore
    }
  };

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

  const startRecording = async () => {
    try {
      if (isRecording) return;
      if (isTranscribing || isResponding) return;
      if (!selectedVoiceId) {
        toast.error("Please choose a voice");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

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

        setIsRecording(false);
        setRecorder(null);

        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        if (!blob || !blob.size) {
          toast.error("Recording failed");
          return;
        }
        await processVoiceChat(blob);
      };

      rec.start();
      setRecorder(rec);
      setIsRecording(true);

      stopTimerRef.current = setTimeout(() => {
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          // ignore
        }
      }, 30_000);
    } catch (e) {
      toast.error(e?.message || "Microphone access denied");
    }
  };

  const stopRecording = () => {
    try {
      if (!recorder) return;
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
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
      setIsTranscribing(true);
      const sttRes = await aiRobotStt({ audioBlob: blob });
      const text = String(sttRes?.text || "").trim();
      if (!text) {
        toast.error("Could not transcribe audio");
        return;
      }

      const id = await ensureConversation();

      setMessages((prev) => [...prev, { role: "user", text }]);

      setIsResponding(true);
      const chatRes = await aiRobotSendConversationMessage({ conversationId: id, message: text, language });
      const reply = String(chatRes?.reply || "").trim();

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      await loadConversations();

      const ttsRes = await aiRobotTts({ text: reply, voiceId: selectedVoiceId });
      playAudioBuffer(ttsRes);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Voice chat failed");
    } finally {
      setIsTranscribing(false);
      setIsResponding(false);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

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
        setVoiceSampleBlob(blob);
      };

      rec.start();
      setVoiceSampleRecorder(rec);
      setVoiceSampleIsRecording(true);

      voiceSampleStopTimerRef.current = setTimeout(() => {
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          // ignore
        }
      }, 30_000);
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
      if (!voiceSampleBlob || !voiceSampleBlob.size) {
        toast.error("Please record your voice (up to 30 seconds)");
        return;
      }

      setCreatingVoiceId(true);

      const file = blobToFile(voiceSampleBlob, "voice.webm");
      const res = await uploadAiRobotVoice({ voiceName: name, audioFiles: [file] });

      const voiceId = String(res?.voice?.voiceId || "");
      if (voiceId) {
        toast.success(`Voice ID generated: ${voiceId}`);
      } else {
        toast.success("Voice ID generated");
      }

      setVoiceModalName("");
      setVoiceSampleBlob(null);
      closeVoiceModal();
      await loadVoices();
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to create Voice ID");
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

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="form-control w-full md:w-64">
              <div className="label">
                <span className="label-text">AI Robot Language</span>
              </div>
              <select
                className="select select-bordered"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control w-full md:w-72">
              <div className="label">
                <span className="label-text">AI Robot Voice</span>
              </div>
              <select
                className="select select-bordered"
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
              >
                <option value="" disabled>
                  Select a voice
                </option>
                {voices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.voiceName}
                  </option>
                ))}
              </select>
            </label>

            <button type="button" className="btn btn-outline" onClick={openVoiceModal}>
              Upload your Voice
            </button>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-300">
          <div className="card-body py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="tabs tabs-boxed bg-base-100">
                {ROUTES.map((r) => (
                  <Link
                    key={r.path}
                    to={r.path}
                    className={`tab ${activeTab === r.path ? "tab-active" : ""}`}
                  >
                    {r.label}
                  </Link>
                ))}
              </div>

              <div className="text-sm opacity-70">Current Page: {moduleLabel}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 min-h-[70vh]">
          <div className="lg:w-80 w-full">
            <div className="card bg-base-200 border border-base-300 h-full">
              <div className="card-body p-4 gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Chats</h2>
                  <button type="button" className="btn btn-sm btn-primary" onClick={handleNewChat}>
                    New
                  </button>
                </div>

                {loadingConversations ? (
                  <div className="flex justify-center py-6">
                    <span className="loading loading-spinner" />
                  </div>
                ) : conversations.length ? (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {conversations.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center gap-2 rounded-lg border border-base-300 p-2 cursor-pointer ${
                          conversationId === c.id ? "bg-base-100" : "bg-base-200"
                        }`}
                      >
                        <button
                          type="button"
                          className="flex-1 text-left"
                          onClick={() => setConversationId(String(c.id))}
                        >
                          <div className="text-sm font-medium truncate">{c.title || "New chat"}</div>
                          <div className="text-xs opacity-60">{new Date(c.updatedAt || c.createdAt || Date.now()).toLocaleString()}</div>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDeleteChat(String(c.id))}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm opacity-70">No chats yet. Create a new one.</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="card bg-base-200 border border-base-300 h-full">
              <div className="card-body p-4 gap-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-semibold">Conversation</h2>
                    <p className="text-sm opacity-70">Voice-only. Tap the mic to talk.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isRecording ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isTranscribing || isResponding}
                        onClick={startRecording}
                      >
                        Voice
                      </button>
                    ) : (
                      <button type="button" className="btn btn-error" onClick={stopRecording}>
                        Stop
                      </button>
                    )}

                    <div className="text-sm opacity-70">
                      {isTranscribing ? "Transcribing..." : isResponding ? "AI speaking..." : isRecording ? "Recording (max 30s)" : ""}
                    </div>
                  </div>
                </div>

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
                    <div className="text-sm opacity-70">
                      Start speaking to the AI Robot on the {moduleLabel} page.
                    </div>
                  )}
                </div>

                <audio ref={audioRef} />
              </div>
            </div>
          </div>
        </div>

        <dialog id="ai_robot_voice_modal" className="modal">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Upload your Voice</h3>
            <p className="text-sm opacity-70 mt-1">
              Record up to 30 seconds. We will generate your Voice ID and save it.
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

                <div className="text-sm opacity-70">
                  {voiceSampleIsRecording ? "Recording (max 30s)" : voiceSampleBlob ? "Recorded" : ""}
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
      </div>
    </div>
  );
};

export default AiRobotShell;
