import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import {
    BotIcon,
    MicIcon,
    SendIcon,
    ChevronDownIcon,
    RefreshCcwIcon,
    Volume2Icon,
    AlertCircleIcon,
    CircleIcon,
    CheckIcon,
    Loader2Icon
} from "lucide-react";
import toast from "react-hot-toast";
import {
    aiRobotSendMessage,
    aiRobotStt,
    aiRobotTts,
    aiRobotTranslate,
    getAiRobotHistory
} from "../../lib/api";
import useAuthUser from "../../hooks/useAuthUser";

const VOICE_LANGUAGES = [
    { label: "English", code: "en-IN" },
    { label: "Hindi", code: "hi-IN" },
    { label: "Telugu", code: "te-IN" },
    { label: "Tamil", code: "ta-IN" },
    { label: "Kannada", code: "kn-IN" },
    { label: "Malayalam", code: "ml-IN" },
    { label: "Bengali", code: "bn-IN" },
    { label: "Marathi", code: "mr-IN" },
    { label: "Gujarati", code: "gu-IN" },
    { label: "Punjabi", code: "pa-IN" },
];

const TRANSLATION_LANGUAGES = [
    ...VOICE_LANGUAGES
];

const AiRobotShell = () => {
    const { authUser } = useAuthUser();
    const location = useLocation();
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState("");
    const [translatedPreview, setTranslatedPreview] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [voiceLang, setVoiceLang] = useState(VOICE_LANGUAGES[0]);
    const [transLang, setTransLang] = useState(null);

    const [voiceState, setVoiceState] = useState("idle");
    const [lastError, setLastError] = useState("");

    const scrollRef = useRef(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const audioPlayerRef = useRef(new Audio());
    const recognitionRef = useRef(null);
    const silenceTimerRef = useRef(null);

    const module = location.pathname.split("/").pop() || "general";

    useEffect(() => {
        fetchHistory();
        return () => {
            cleanupVoice();
        };
    }, [module]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping, translatedPreview]);

    useEffect(() => {
        if (transLang && inputText.trim()) {
            const timer = setTimeout(async () => {
                try {
                    const res = await aiRobotTranslate({
                        text: inputText,
                        targetLanguageCode: transLang.code,
                        sourceLanguageCode: "en-IN"
                    });
                    setTranslatedPreview(res.translatedText || "");
                } catch (err) {
                    console.error("Preview translation error:", err);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setTranslatedPreview("");
        }
    }, [inputText, transLang]);

    const fetchHistory = async () => {
        try {
            const res = await getAiRobotHistory({ module });
            if (res.success) {
                setMessages(res.messages || []);
            }
        } catch (err) {
            console.error("History fetch error:", err);
        }
    };

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    const cleanupVoice = () => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
            recorderRef.current.stop();
        }
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (err) { }
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.src = "";
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
        }
    };

    const handleSend = async (overrideText) => {
        const textToSend = overrideText || (transLang && translatedPreview ? translatedPreview : inputText);
        if (!textToSend.trim()) return;

        const userMsg = { role: "user", text: textToSend, timestamp: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        setInputText("");
        setTranslatedPreview("");
        setIsTyping(true);

        try {
            const res = await aiRobotSendMessage({
                message: textToSend,
                module,
                language: voiceLang.label
            });

            if (res.success) {
                const aiMsg = { role: "assistant", text: res.reply, timestamp: new Date() };
                setMessages((prev) => [...prev, aiMsg]);
                handleTts(res.reply);
            } else {
                throw new Error(res.message || "Failed to generate AI response.");
            }
        } catch (err) {
            const errMsg = err.response?.data?.message || err.message || "AI service error.";
            console.error("Chat error:", err);
            toast.error(`Jarvis: "${errMsg}"`, { duration: 5000 });
            setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ERROR: ${errMsg}`, timestamp: new Date(), isError: true }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleTts = async (text) => {
        try {
            setVoiceState("speaking");
            const audioBuffer = await aiRobotTts({
                text,
                languageCode: voiceLang.code,
                speaker: voiceLang.label.match(/hindi|telugu|tamil|kannada/i) ? "ritu" : "shubh"
            });

            const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            audioPlayerRef.current.src = url;
            audioPlayerRef.current.play();
            audioPlayerRef.current.onended = () => setVoiceState("idle");
        } catch (err) {
            console.error("TTS error:", err);
            setVoiceState("idle");
        }
    };

    const startListening = async () => {
        try {
            setVoiceState("listening");
            setInputText(""); // Clear for real-time typing

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream);
            recorderRef.current = mediaRecorder;
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = async () => {
                setVoiceState("processing");
                const blob = new Blob(chunks, { type: "audio/webm" });
                try {
                    const res = await aiRobotStt({
                        audioBlob: blob,
                        languageCode: voiceLang.code
                    });
                    if (res.text) {
                        handleSend(res.text);
                    } else {
                        setVoiceState("idle");
                        toast.error("Couldn't hear you clearly.", { duration: 2000 });
                    }
                } catch (err) {
                    setVoiceState("error");
                    setLastError("Transcription failed");
                    toast.error("Speech service error.");
                    setTimeout(() => setVoiceState("idle"), 2000);
                }
            };

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognitionRef.current = recognition;
                recognition.lang = voiceLang.code;
                recognition.interimResults = true;
                recognition.continuous = true;

                recognition.onresult = (event) => {
                    let currentTranscript = "";
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        currentTranscript += event.results[i][0].transcript;
                    }
                    setInputText(currentTranscript);

                    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = setTimeout(() => {
                        console.log("2 seconds silence detected, stopping voice interaction...");
                        if (mediaRecorder.state === "recording") {
                            mediaRecorder.stop();
                            try { recognition.stop(); } catch (e) { }
                        }
                    }, 2000);
                };

                recognition.onerror = (e) => console.error("SpeechRecognition error:", e);
                recognition.start();
            }

            mediaRecorder.start();

        } catch (err) {
            setVoiceState("error");
            setLastError("Microphone access denied");
            toast.error("Microphone access is required for voice chatting.");
            setTimeout(() => setVoiceState("idle"), 3000);
        }
    };

    const handleMicClick = () => {
        if (voiceState === "idle") {
            startListening();
        } else {
            cleanupVoice();
            setVoiceState("idle");
        }
    };

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-[#0f172a] to-[#020617] text-slate-100 overflow-hidden font-sans">
            {/* Header */}
            <header className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-md border-b border-white/10 z-10 shadow-2xl shadow-blue-500/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-500/30 group">
                        <BotIcon className="size-6 text-blue-400 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white/90">AI - Assistance</h1>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-medium text-emerald-400/80 uppercase tracking-widest">System Ready</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Voice Language</label>
                        <div className="dropdown dropdown-end">
                            <div tabIndex={0} role="button" className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-sm group">
                                {voiceLang.label}
                                <ChevronDownIcon className="size-3.5 opacity-50 group-hover:translate-y-0.5 transition-transform" />
                            </div>
                            <ul tabIndex={0} className="dropdown-content z-[30] menu p-2 shadow-2xl bg-[#0f172a] border border-white/10 rounded-xl w-48 mt-2 max-h-64 overflow-y-auto backdrop-blur-xl">
                                {VOICE_LANGUAGES.map((l) => (
                                    <li key={l.code}>
                                        <button
                                            onClick={() => setVoiceLang(l)}
                                            className={`flex items-center justify-between ${voiceLang.code === l.code ? "bg-blue-500/20 text-blue-400" : "hover:bg-white/5"}`}
                                        >
                                            {l.label}
                                            {voiceLang.code === l.code && <CheckIcon className="size-3.5" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <button
                        onClick={() => { setMessages([]); toast.success("Chat cleared"); }}
                        className="p-2.5 bg-white/5 hover:bg-red-500/10 border border-white/10 rounded-xl transition-all group shadow-inner"
                        title="Clear Chat"
                    >
                        <RefreshCcwIcon className="size-5 text-slate-500 group-hover:text-red-400 transition-colors group-active:rotate-180 duration-500" />
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <main
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-40 animate-pulse">
                        <div className="p-8 bg-white/5 rounded-full mb-6 border border-white/5 shadow-2xl shadow-blue-500/10">
                            <BotIcon className="size-20 text-blue-400/50" />
                        </div>
                        <p className="text-xl font-medium tracking-tight">Jarvis at your service.</p>
                        <p className="text-sm mt-2 font-light">Initiate interaction via text or digital voice matching.</p>
                    </div>
                )}

                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                    >
                        <div className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                            {m.role === "assistant" && (
                                <div className={`size-8 rounded-lg ${m.isError ? "bg-red-500/10 border-red-500/20" : "bg-blue-500/10 border-blue-500/20"} border flex items-center justify-center shrink-0 mt-1 shadow-inner`}>
                                    {m.isError ? <AlertCircleIcon className="size-4 text-red-500" /> : <BotIcon className="size-4 text-blue-400" />}
                                </div>
                            )}
                            <div className="flex flex-col">
                                <div
                                    className={`px-4 py-3 rounded-2xl border text-[13px] md:text-sm leading-relaxed shadow-lg backdrop-blur-sm
                    ${m.role === "user"
                                            ? "bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-400/30 text-white rounded-tr-none shadow-blue-500/20"
                                            : m.isError
                                                ? "bg-red-500/5 border-red-500/20 text-red-300 rounded-tl-none italic"
                                                : "bg-white/5 border-white/10 text-slate-200 rounded-tl-none"}
                  `}
                                >
                                    {m.text}
                                </div>
                                <div className={`flex items-center gap-1.5 mt-2 px-1 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <span className={`text-[9px] uppercase font-black tracking-widest ${m.role === "user" ? "text-indigo-400" : "text-blue-500"}`}>
                                        {m.role === "user" ? "SYSTEM_USER" : "ASSISTANT_AI"}
                                    </span>
                                    <span className="size-1 rounded-full bg-slate-800" />
                                    <span className="text-[10px] text-slate-600 font-mono">
                                        {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex justify-start animate-in fade-in duration-200">
                        <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl rounded-tl-none ring-1 ring-blue-500/10">
                            <div className="flex gap-1.5">
                                <span className="size-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="size-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="size-1.5 bg-blue-500 rounded-full animate-bounce" />
                            </div>
                            <span className="text-xs text-blue-400/70 font-semibold uppercase tracking-widest font-mono">Synthesizing...</span>
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Interface */}
            <footer className="p-6 bg-[#020617]/80 backdrop-blur-2xl border-t border-white/10 space-y-4">
                {translatedPreview && (
                    <div className="px-5 py-3 bg-blue-500/5 border border-blue-500/20 rounded-2xl animate-in slide-in-from-bottom-2 duration-300 ring-1 ring-blue-500/5 shadow-inner">
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[9px] uppercase tracking-widest text-blue-500 font-black">Dynamic Language Conversion ({transLang.label})</p>
                            <Loader2Icon className="size-3 text-blue-500/50 animate-spin" />
                        </div>
                        <p className="text-sm text-slate-200 font-medium leading-relaxed italic">"{translatedPreview}"</p>
                    </div>
                )}

                <div className="flex items-center gap-5">
                    {/* JARVIS Mic Button */}
                    <div className="relative group shrink-0 scale-110">
                        <button
                            onClick={handleMicClick}
                            className={`relative z-10 size-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl border-2
                ${voiceState === "idle" ? "bg-[#0f172a] text-blue-400 border-white/5 hover:border-blue-500/50 hover:shadow-blue-500/20" : ""}
                ${voiceState === "listening" ? "bg-red-500 text-white border-red-400/50 ring-4 ring-red-500/20" : ""}
                ${voiceState === "processing" ? "bg-amber-500 text-white border-white/20" : ""}
                ${voiceState === "speaking" ? "bg-blue-600 text-white border-white/20 ring-4 ring-blue-500/20 shadow-blue-500/40" : ""}
                ${voiceState === "error" ? "bg-rose-700 text-white border-white/10" : ""}
              `}
                        >
                            {voiceState === "idle" && <MicIcon className="size-7" />}
                            {voiceState === "listening" && <CircleIcon className="size-7 fill-current animate-pulse" />}
                            {voiceState === "processing" && <RefreshCcwIcon className="size-7 animate-spin" />}
                            {voiceState === "speaking" && (
                                <div className="flex items-end gap-1 h-7">
                                    <div className="w-1.5 bg-white animate-[equalizer_0.7s_ease_infinite] h-2 rounded-full" />
                                    <div className="w-1.5 bg-white animate-[equalizer_0.5s_ease_infinite] h-5 rounded-full" />
                                    <div className="w-1.5 bg-white animate-[equalizer_0.8s_ease_infinite] h-full rounded-full" />
                                    <div className="w-1.5 bg-white animate-[equalizer_0.6s_ease_infinite] h-4 rounded-full" />
                                </div>
                            )}
                            {voiceState === "error" && <AlertCircleIcon className="size-7" />}
                        </button>

                        <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                            <span className={`px-2.5 py-1 bg-[#1e293b] text-[9px] border border-white/10 rounded-lg uppercase tracking-widest font-black transition-all duration-300 shadow-2xl ${voiceState === 'idle' ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                                {voiceState === 'listening' ? 'Listening' : voiceState === 'processing' ? 'Analysing' : voiceState === 'speaking' ? 'Assistant Speaking' : voiceState}
                            </span>
                        </div>

                        {voiceState === "listening" && (
                            <>
                                <div className="absolute top-0 left-0 size-full rounded-full bg-red-500/20 animate-ping" />
                                <div className="absolute top-0 left-0 size-full rounded-full bg-red-500/20 animate-ping [animation-delay:0.5s]" />
                            </>
                        )}
                        {voiceState === "speaking" && (
                            <div className="absolute -inset-4 bg-blue-500/20 blur-2xl rounded-full animate-pulse z-0" />
                        )}
                    </div>

                    <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-3xl px-5 py-2.5 transition-all focus-within:border-blue-500/40 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_30px_rgba(59,130,246,0.08)]">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder={voiceState === 'listening' ? "Voice active..." : "Digital uplink ready..."}
                            className={`flex-1 bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-600 py-3 text-sm font-medium ${voiceState === 'listening' ? 'animate-pulse text-blue-400 italic' : ''}`}
                        />

                        <div className="flex items-center gap-3 pl-5 border-l border-white/10 shrink-0">
                            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-black hidden sm:block">Translation</span>
                            <div className="dropdown dropdown-top dropdown-end">
                                <div tabIndex={0} role="button" className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-[11px] border border-white/10 group font-bold">
                                    {transLang ? transLang.label : "None"}
                                    <ChevronDownIcon className="size-3 text-slate-500 group-hover:translate-y-0.5 transition-transform" />
                                </div>
                                <ul tabIndex={0} className="dropdown-content z-[30] menu p-2 shadow-2xl bg-[#0f172a] border border-white/10 rounded-2xl w-44 mb-3 max-h-60 overflow-y-auto backdrop-blur-2xl">
                                    <li>
                                        <button onClick={() => setTransLang(null)} className={`text-[11px] font-bold ${!transLang ? "bg-blue-500/20 text-blue-400" : "hover:bg-white/5"}`}>
                                            None
                                        </button>
                                    </li>
                                    <div className="h-px bg-white/5 my-1" />
                                    {TRANSLATION_LANGUAGES.map((l) => (
                                        <li key={l.code}>
                                            <button onClick={() => setTransLang(l)} className={`text-[11px] font-bold ${transLang?.code === l.code ? "bg-blue-500/20 text-blue-400" : "hover:bg-white/5"}`}>
                                                {l.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <button
                            onClick={() => handleSend()}
                            disabled={!inputText.trim()}
                            className="ml-5 p-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-20 disabled:grayscale text-white rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-95"
                        >
                            <SendIcon className="size-5" />
                        </button>
                    </div>
                </div>
            </footer>

            <style>{`
        @keyframes equalizer {
          0%, 100% { height: 6px; }
          50% { height: 100%; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.2);
        }
      `}</style>
        </div>
    );
};

export default AiRobotShell;
