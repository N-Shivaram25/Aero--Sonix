import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { LANGUAGES } from "../constants";
import {
  aiRobotSendMessage,
  aiRobotStt,
  aiRobotTts,
  getAiRobotHistory,
  getAiRobotVoices,
  renameAiRobotVoice,
  uploadAiRobotVoice,
} from "../lib/api";

const MODULES = [
  { key: "general", label: "Start" },
  { key: "interview", label: "Interview" },
  { key: "english_fluency", label: "English Fluency" },
  { key: "language_learning", label: "Language Learning" },
  { key: "programming", label: "Programming" },
];

const AiRobotPage = () => {
  const [moduleKey, setModuleKey] = useState("general");
  const [language, setLanguage] = useState("English");

  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");

  const [historyMessages, setHistoryMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  const [uploadVoiceName, setUploadVoiceName] = useState("");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadingVoice, setUploadingVoice] = useState(false);

  const [renameVoiceId, setRenameVoiceId] = useState("");
  const [renameVoiceName, setRenameVoiceName] = useState("");
  const [renamingVoice, setRenamingVoice] = useState(false);

  const audioRef = useRef(null);

  const moduleLabel = useMemo(() => {
    return MODULES.find((m) => m.key === moduleKey)?.label || "Start";
  }, [moduleKey]);

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

  const loadHistory = async (nextModuleKey) => {
    try {
      setLoadingHistory(true);
      const res = await getAiRobotHistory({ module: nextModuleKey });
      const msgs = Array.isArray(res?.messages) ? res.messages : [];
      setHistoryMessages(msgs);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadVoices();
  }, []);

  useEffect(() => {
    setHistoryMessages([]);
    setRecordedBlob(null);
  }, [moduleKey]);

  const startRecording = async () => {
    try {
      if (isRecording) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const prefer = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
      const mimeType = prefer.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });

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
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        setRecordedBlob(blob);
      };

      rec.start();
      setRecorder(rec);
      setIsRecording(true);
    } catch (e) {
      toast.error(e?.message || "Microphone access denied");
    }
  };

  const stopRecording = () => {
    try {
      if (!recorder) return;
      recorder.stop();
    } catch {
      // ignore
    } finally {
      setIsRecording(false);
      setRecorder(null);
    }
  };

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

  const handleVoiceChat = async () => {
    try {
      if (!recordedBlob) {
        toast.error("Record your voice first");
        return;
      }
      if (!selectedVoiceId) {
        toast.error("Please choose a voice");
        return;
      }

      setIsTranscribing(true);
      const sttRes = await aiRobotStt({ audioBlob: recordedBlob });
      const text = String(sttRes?.text || "").trim();
      if (!text) {
        toast.error("Could not transcribe audio");
        return;
      }

      setHistoryMessages((prev) => [...prev, { role: "user", text }]);

      setIsResponding(true);
      const chatRes = await aiRobotSendMessage({ message: text, module: moduleKey, language });
      const reply = String(chatRes?.reply || "").trim();

      setHistoryMessages((prev) => [...prev, { role: "assistant", text: reply }]);

      const ttsRes = await aiRobotTts({ text: reply, voiceId: selectedVoiceId });
      playAudioBuffer(ttsRes);

      setRecordedBlob(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Voice chat failed");
    } finally {
      setIsTranscribing(false);
      setIsResponding(false);
    }
  };

  const onUploadFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files);
  };

  const handleUploadVoice = async (e) => {
    e.preventDefault();
    try {
      if (!uploadVoiceName.trim()) {
        toast.error("Please enter a voice name");
        return;
      }
      if (!uploadFiles.length) {
        toast.error("Please select at least one audio file");
        return;
      }

      setUploadingVoice(true);
      await uploadAiRobotVoice({ voiceName: uploadVoiceName.trim(), audioFiles: uploadFiles });
      toast.success("Voice created");
      setUploadVoiceName("");
      setUploadFiles([]);
      await loadVoices();
    } catch (e2) {
      toast.error(e2?.response?.data?.message || e2?.message || "Failed to upload voice");
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleRenameVoice = async (e) => {
    e.preventDefault();
    try {
      if (!renameVoiceId) {
        toast.error("Choose a voice to rename");
        return;
      }
      if (!renameVoiceName.trim()) {
        toast.error("Enter a new name");
        return;
      }

      setRenamingVoice(true);
      await renameAiRobotVoice({ voiceId: renameVoiceId, voiceName: renameVoiceName.trim() });
      toast.success("Voice renamed");
      setRenameVoiceId("");
      setRenameVoiceName("");
      await loadVoices();
    } catch (e2) {
      toast.error(e2?.response?.data?.message || e2?.message || "Failed to rename voice");
    } finally {
      setRenamingVoice(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Robot</h1>
          <p className="text-sm opacity-70">Module: {moduleLabel}</p>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="form-control w-full md:w-64">
            <div className="label">
              <span className="label-text">Language</span>
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
              <span className="label-text">Choose Voice</span>
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
        </div>
      </div>

      <div className="card bg-base-200 border border-base-300">
        <div className="card-body">
          <h2 className="card-title">Modules</h2>
          <div className="flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`btn btn-sm ${moduleKey === m.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setModuleKey(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-sm opacity-70">
            Each module has separate chat history stored in MongoDB. If you don’t select a module, use Start.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body space-y-3">
            <h2 className="card-title">Voice Chat</h2>

            <div className="flex flex-wrap items-center gap-2">
              {!isRecording ? (
                <button type="button" className="btn btn-primary" onClick={startRecording}>
                  Voice
                </button>
              ) : (
                <button type="button" className="btn btn-error" onClick={stopRecording}>
                  Stop
                </button>
              )}

              <button
                type="button"
                className="btn"
                disabled={isTranscribing || isResponding || !recordedBlob}
                onClick={handleVoiceChat}
              >
                {isTranscribing ? "Transcribing..." : isResponding ? "Responding..." : "Send"}
              </button>

              {recordedBlob ? <span className="text-sm opacity-70">Recorded</span> : null}
            </div>

            <audio ref={audioRef} />
          </div>
        </div>

        <div className="card bg-base-200 border border-base-300">
          <div className="card-body space-y-4">
            <h2 className="card-title">Upload Your Voice</h2>
            <form className="space-y-3" onSubmit={handleUploadVoice}>
              <label className="form-control">
                <div className="label">
                  <span className="label-text">Voice Name</span>
                </div>
                <input
                  className="input input-bordered"
                  value={uploadVoiceName}
                  onChange={(e) => setUploadVoiceName(e.target.value)}
                  placeholder="My Voice"
                  required
                />
              </label>

              <label className="form-control">
                <div className="label">
                  <span className="label-text">Audio Samples</span>
                </div>
                <input className="file-input file-input-bordered" type="file" accept="audio/*" multiple onChange={onUploadFilesChange} />
              </label>

              <button type="submit" className="btn btn-primary" disabled={uploadingVoice}>
                {uploadingVoice ? "Creating Voice..." : "Create Voice"}
              </button>
            </form>

            <form className="space-y-3" onSubmit={handleRenameVoice}>
              <div className="divider">Name Your Voice ID</div>

              <label className="form-control">
                <div className="label">
                  <span className="label-text">Select Voice</span>
                </div>
                <select
                  className="select select-bordered"
                  value={renameVoiceId}
                  onChange={(e) => setRenameVoiceId(e.target.value)}
                >
                  <option value="">Select</option>
                  {voices
                    .filter((v) => !v.isDefault)
                    .map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>
                        {v.voiceName}
                      </option>
                    ))}
                </select>
              </label>

              <label className="form-control">
                <div className="label">
                  <span className="label-text">New Name</span>
                </div>
                <input
                  className="input input-bordered"
                  value={renameVoiceName}
                  onChange={(e) => setRenameVoiceName(e.target.value)}
                  placeholder="Custom Name"
                />
              </label>

              <button type="submit" className="btn" disabled={renamingVoice}>
                {renamingVoice ? "Saving..." : "Save Name"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 border border-base-300">
        <div className="card-body space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="card-title">Chat History ({moduleLabel})</h2>
            <button
              type="button"
              className="btn"
              onClick={() => loadHistory(moduleKey)}
              disabled={loadingHistory}
            >
              {loadingHistory ? "Loading..." : "Previous History"}
            </button>
          </div>

          <div className="min-h-40 max-h-[420px] overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-3 space-y-2">
            {historyMessages.length ? (
              historyMessages.map((m, idx) => (
                <div
                  key={`${m.role}-${idx}`}
                  className={`chat ${m.role === "user" ? "chat-end" : "chat-start"}`}
                >
                  <div className={`chat-bubble ${m.role === "user" ? "chat-bubble-primary" : ""}`}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm opacity-70">No messages yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiRobotPage;
