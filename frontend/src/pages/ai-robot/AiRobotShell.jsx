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
            const respData = err.response?.data;
            const errMsg = respData?.message || err.message || "AI service error.";
            const errDetails = respData?.details?.error?.message || (respData?.details ? JSON.stringify(respData.details) : "");

            console.error("Chat error:", err);
            toast.error(`Jarvis: "${errMsg}"`, { duration: 6000 });
            setMessages((prev) => [...prev, {
                role: "assistant",
                text: `⚠️ ERROR: ${errMsg} ${errDetails ? `(${errDetails.substring(0, 150)})` : ""}`,
                timestamp: new Date(),
                isError: true
            }]);
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
                className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar bg-[#020617]"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-60">
                        <div className="relative group mb-8">
                            <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl group-hover:bg-red-600/40 transition-all duration-700 animate-pulse" />
                            <div className="relative p-10 bg-gradient-to-br from-red-900/20 to-black border border-red-500/30 rounded-full shadow-2xl shadow-red-500/10">
                                <BotIcon className="size-24 text-red-500/80 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-black tracking-[0.2em] uppercase text-red-500/90 mb-3 drop-shadow-sm font-mono">AeroSonix AI</h2>
                        <p className="text-slate-400 font-medium text-center max-w-sm px-6 leading-relaxed italic border-x border-red-500/20 py-2">
                            "I am AeroSonix Voice Assistant. Initiating encrypted neural link... System online."
                        </p>
                    </div>
                )}

                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`chat ${m.role === "user" ? "chat-end" : "chat-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                    >
                        <div className="chat-image avatar">
                            <div className="w-10 rounded-full border border-white/10 p-1.5 bg-black/40 backdrop-blur-md">
                                {m.role === "user" ? (
                                    <div className="size-full bg-blue-500 rounded-full" />
                                ) : (
                                    <BotIcon className={`size-full ${m.isError ? "text-red-500" : "text-red-500"}`} />
                                )}
                            </div>
                        </div>
                        <div className="chat-header opacity-50 text-[10px] font-mono mb-1 uppercase tracking-tighter">
                            {m.role === "user" ? "User" : "Assistant"}
                            <time className="text-[10px] opacity-30 ml-2">
                                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                            </time>
                        </div>
                        <div
                            className={`chat-bubble text-sm font-medium leading-relaxed border-0 shadow-2xl
                            ${m.role === "user"
                                    ? "bg-gradient-to-r from-blue-700 to-indigo-800 text-white"
                                    : m.isError
                                        ? "bg-red-950/30 text-red-400 border border-red-900/50 italic"
                                        : "bg-slate-900/90 text-slate-100 border border-white/5"}
                        `}
                        >
                            {m.text}
                        </div>
                        {m.role === "assistant" && !m.isError && (
                            <div className="chat-footer opacity-50 mt-1">
                                <span className="text-[9px] uppercase tracking-widest text-red-500/70 font-black">Neural Processing Complete</span>
                            </div>
                        )}
                    </div>
                ))}

                {isTyping && (
                    <div className="chat chat-start animate-in fade-in duration-200">
                        <div className="chat-bubble bg-black/40 border border-red-500/20 backdrop-blur-md flex items-center gap-4 py-3 px-5 shadow-inner">
                            <div className="flex gap-1.5">
                                <span className="size-2 bg-red-600 rounded-full animate-bounce [animation-delay:-0.3s] shadow-[0_0_8px_#dc2626]" />
                                <span className="size-2 bg-red-600 rounded-full animate-bounce [animation-delay:-0.15s] shadow-[0_0_8px_#dc2626]" />
                                <span className="size-2 bg-red-600 rounded-full animate-bounce shadow-[0_0_8px_#dc2626]" />
                            </div>
                            <span className="text-[10px] text-red-500/80 font-black uppercase tracking-[0.2em] font-mono">Syncing Neural Data...</span>
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Interface */}
            <footer className="p-6 bg-[#020617] border-t border-white/5 space-y-4 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
                {translatedPreview && (
                    <div className="alert bg-red-900/10 border border-red-500/20 rounded-2xl animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Loader2Icon className="size-3 text-red-500 animate-spin" />
                                <span className="text-[9px] uppercase tracking-[0.2em] text-red-500 font-black">Voice Translation Realtime</span>
                            </div>
                            <p className="text-sm text-slate-300 font-medium italic">"{translatedPreview}"</p>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-6">
                    {/* RED JARVIS MIC BUTTON */}
                    <div className="relative group shrink-0">
                        {voiceState === "listening" && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                <div className="size-24 bg-red-600/30 rounded-full animate-[ping_1.5s_linear_infinite] blur-xl" />
                                <div className="size-28 bg-red-600/20 rounded-full animate-[ping_2s_linear_infinite] [animation-delay:0.5s] blur-2xl" />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-20 border-2 border-red-500/50 rounded-full animate-[spin_3s_linear_infinite] border-dashed" />
                            </div>
                        )}

                        <button
                            onClick={handleMicClick}
                            className={`relative z-10 size-16 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl transform active:scale-95
                                ${voiceState === "idle" ? "bg-black text-red-500 border border-red-500/30 hover:border-red-500 hover:shadow-red-500/20" : ""}
                                ${voiceState === "listening" ? "bg-red-600 text-white border-white/40 ring-offset-4 ring-offset-[#020617] ring-4 ring-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)]" : ""}
                                ${voiceState === "processing" ? "bg-[#1e1e1e] text-red-400 border border-red-500/20 scale-110" : ""}
                                ${voiceState === "speaking" ? "bg-red-700 text-white border-red-400 ring-4 ring-red-500/20 shadow-red-500/40 animate-pulse" : ""}
                                ${voiceState === "error" ? "bg-black text-rose-700 border-rose-900 border-2" : ""}
                            `}
                        >
                            {voiceState === "idle" && <MicIcon className="size-7 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                            {voiceState === "listening" && <CircleIcon className="size-8 fill-current animate-pulse" />}
                            {voiceState === "processing" && <RefreshCcwIcon className="size-8 animate-spin" />}
                            {voiceState === "speaking" && (
                                <div className="flex items-end gap-1 h-7">
                                    <div className="w-1.5 bg-white animate-[equalizer_0.7s_ease_infinite] h-2 rounded-full shadow-[0_0_5px_white]" />
                                    <div className="w-1.5 bg-white animate-[equalizer_0.5s_ease_infinite] h-5 rounded-full shadow-[0_0_5px_white]" />
                                    <div className="w-1.5 bg-white animate-[equalizer_0.8s_ease_infinite] h-full rounded-full shadow-[0_0_5px_white]" />
                                    <div className="w-1.5 bg-white animate-[equalizer_0.6s_ease_infinite] h-4 rounded-full shadow-[0_0_5px_white]" />
                                </div>
                            )}
                            {voiceState === "error" && <AlertCircleIcon className="size-8" />}
                        </button>

                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 pointer-events-none">
                            <span className={`px-3 py-1 bg-red-600 text-white text-[10px] rounded-md font-black uppercase tracking-[0.2em] transition-all duration-500 shadow-xl 
                                ${voiceState === 'idle' ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                                {voiceState === 'listening' ? 'Listening' : voiceState === 'processing' ? 'Analysing' : voiceState === 'speaking' ? 'Assistant Speaking' : voiceState}
                            </span>
                        </div>
                    </div>

                    {/* Text Input Block */}
                    <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-3xl px-5 py-2.5 transition-all focus-within:border-red-500/40 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_30px_rgba(220,38,38,0.08)]">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder={voiceState === 'listening' ? "Voice active..." : "Neural link ready..."}
                            className={`flex-1 bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-600 py-3 text-sm font-medium ${voiceState === 'listening' ? 'animate-pulse text-red-400 italic' : ''}`}
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
                                        <button onClick={() => setTransLang(null)} className={`text-[11px] font-bold ${!transLang ? "bg-red-500/20 text-red-500" : "hover:bg-white/5"}`}>
                                            None
                                        </button>
                                    </li>
                                    <div className="h-px bg-white/5 my-1" />
                                    {TRANSLATION_LANGUAGES.map((l) => (
                                        <li key={l.code}>
                                            <button onClick={() => setTransLang(l)} className={`text-[11px] font-bold ${transLang?.code === l.code ? "bg-red-500/20 text-red-500" : "hover:bg-white/5"}`}>
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
                            className="ml-5 p-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-20 disabled:grayscale text-white rounded-2xl transition-all shadow-xl shadow-red-600/20 active:scale-95"
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
                  background: rgba(220, 38, 38, 0.1);
                  border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: rgba(220, 38, 38, 0.2);
                }
            `}</style>
        </div>
    );
};


export default AiRobotShell;
