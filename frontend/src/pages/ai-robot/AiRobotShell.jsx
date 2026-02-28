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
    CheckIcon
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
            recognitionRef.current.stop();
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
            }
        } catch (err) {
            console.error("Chat error:", err);
            toast.error("AI service is currently busy. Please try again.");
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

            // Initialize MediaRecorder for Sarika (High Quality)
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
                    }
                } catch (err) {
                    setVoiceState("error");
                    setLastError("Transcription failed");
                    setTimeout(() => setVoiceState("idle"), 3000);
                }
            };

            // Initialize Web Speech API for Real-time Typing
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognitionRef.current = recognition;
                recognition.lang = voiceLang.code;
                recognition.interimResults = true;
                recognition.continuous = true;

                recognition.onresult = (event) => {
                    let interimTranscript = "";
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            // Final chunk detected
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    const finalOrInterim = Array.from(event.results)
                        .map(res => res[0].transcript)
                        .join(' ');

                    setInputText(finalOrInterim);

                    // Reset 2-second silence timer
                    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = setTimeout(() => {
                        console.log("2 seconds silence detected, stopping...");
                        if (mediaRecorder.state === "recording") {
                            mediaRecorder.stop();
                            recognition.stop();
                        }
                    }, 2000);
                };

                recognition.onerror = (e) => console.error("Recognition error:", e);
                recognition.start();
            }

            mediaRecorder.start();

            // Fallback: Max 15 seconds if no silence detected
            setTimeout(() => {
                if (mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                    if (recognitionRef.current) recognitionRef.current.stop();
                }
            }, 15000);

        } catch (err) {
            setVoiceState("error");
            setLastError("Microphone access denied");
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
            <header className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-md border-b border-white/10 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-500/30">
                        <BotIcon className="size-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">AI - Assistance</h1>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-medium text-emerald-400/80 uppercase tracking-widest">System Ready</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <label className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Voice Language</label>
                        <div className="dropdown dropdown-end">
                            <div tabIndex={0} role="button" className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-sm">
                                {voiceLang.label}
                                <ChevronDownIcon className="size-3.5 opacity-50" />
                            </div>
                            <ul tabIndex={0} className="dropdown-content z-[20] menu p-2 shadow-2xl bg-[#1e293b] border border-white/10 rounded-xl w-48 mt-2 max-h-64 overflow-y-auto">
                                {VOICE_LANGUAGES.map((l) => (
                                    <li key={l.code}>
                                        <button
                                            onClick={() => setVoiceLang(l)}
                                            className={`flex items-center justify-between ${voiceLang.code === l.code ? "bg-blue-500/20 text-blue-400" : ""}`}
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
                        className="p-2.5 bg-white/5 hover:bg-red-500/10 border border-white/10 rounded-xl transition-all group"
                        title="Clear Chat"
                    >
                        <RefreshCcwIcon className="size-5 text-slate-400 group-hover:text-red-400 transition-colors" />
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <main
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-40">
                        <div className="p-6 bg-white/5 rounded-full mb-4 border border-white/5">
                            <BotIcon className="size-16 text-blue-400/50" />
                        </div>
                        <p className="text-lg font-medium">Jarvis at your service.</p>
                        <p className="text-sm">Initiate interaction via text or voice.</p>
                    </div>
                )}

                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                    >
                        <div className={`flex gap-3 max-w-[85%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                            {m.role === "assistant" && (
                                <div className="size-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-1">
                                    <BotIcon className="size-4 text-blue-400" />
                                </div>
                            )}
                            <div className="flex flex-col">
                                <div
                                    className={`px-4 py-3 rounded-2xl border text-sm leading-relaxed shadow-lg
                    ${m.role === "user"
                                            ? "bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-400/30 text-white rounded-tr-none"
                                            : "bg-white/5 backdrop-blur-md border-white/10 text-slate-200 rounded-tl-none"}
                  `}
                                >
                                    {m.text}
                                </div>
                                <div className={`flex items-center gap-1.5 mt-1.5 px-1 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <span className="text-[10px] uppercase font-bold tracking-tighter text-slate-500">
                                        {m.role === "user" ? "ME" : "JARVIS"}
                                    </span>
                                    <span className="size-1 rounded-full bg-slate-700" />
                                    <span className="text-[10px] text-slate-500">
                                        {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex justify-start animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl rounded-tl-none">
                            <div className="flex gap-1">
                                <span className="size-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="size-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="size-1.5 bg-blue-400 rounded-full animate-bounce" />
                            </div>
                            <span className="text-xs text-blue-400/70 font-medium">Jarvis is thinking...</span>
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Interface */}
            <footer className="p-6 bg-white/5 backdrop-blur-xl border-t border-white/10 space-y-4">
                {translatedPreview && (
                    <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-in slide-in-from-bottom-1 duration-200">
                        <p className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Translation Preview ({transLang.label})</p>
                        <p className="text-sm text-slate-300 italic">"{translatedPreview}"</p>
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <div className="relative group shrink-0">
                        <button
                            onClick={handleMicClick}
                            className={`relative z-10 size-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl
                ${voiceState === "idle" ? "bg-slate-800 text-blue-400 hover:scale-105 border border-white/10 shadow-blue-500/5" : ""}
                ${voiceState === "listening" ? "bg-red-500 text-white shadow-red-500/20" : ""}
                ${voiceState === "processing" ? "bg-amber-500 text-white" : ""}
                ${voiceState === "speaking" ? "bg-blue-500 text-white shadow-blue-500/40" : ""}
                ${voiceState === "error" ? "bg-rose-600 text-white" : ""}
              `}
                        >
                            {voiceState === "idle" && <MicIcon className="size-6" />}
                            {voiceState === "listening" && <CircleIcon className="size-6 fill-current animate-ping" />}
                            {voiceState === "processing" && <RefreshCcwIcon className="size-6 animate-spin" />}
                            {voiceState === "speaking" && (
                                <div className="flex items-end gap-0.5 h-6">
                                    <div className="w-1 bg-white animate-[equalizer_0.8s_ease_infinite] h-2" />
                                    <div className="w-1 bg-white animate-[equalizer_0.6s_ease_infinite] h-4" />
                                    <div className="w-1 bg-white animate-[equalizer_0.9s_ease_infinite] h-full" />
                                    <div className="w-1 bg-white animate-[equalizer_0.7s_ease_infinite] h-3" />
                                </div>
                            )}
                            {voiceState === "error" && <AlertCircleIcon className="size-6" />}
                        </button>

                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                            <span className={`px-2 py-1 bg-[#1e293b] text-[10px] border border-white/10 rounded-md uppercase tracking-wider font-bold transition-opacity ${voiceState === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
                                {voiceState === 'listening' ? 'Listening...' : voiceState === 'processing' ? 'Analysing...' : voiceState === 'speaking' ? 'Speaking...' : voiceState}
                            </span>
                        </div>

                        {voiceState === "listening" && (
                            <>
                                <div className="absolute top-0 left-0 size-full rounded-full bg-red-500/20 animate-ping" />
                                <div className="absolute top-0 left-0 size-full rounded-full bg-red-500/20 animate-ping [animation-delay:0.5s]" />
                            </>
                        )}
                        {voiceState === "speaking" && (
                            <div className="absolute -inset-2 bg-blue-500/30 blur-xl rounded-full animate-pulse" />
                        )}
                    </div>

                    <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-2 transition-all focus-within:border-blue-500/50 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder={voiceState === 'listening' ? "Speaking..." : "Type in English..."}
                            className={`flex-1 bg-transparent border-none outline-none text-slate-200 placeholder:text-slate-500 py-3 ${voiceState === 'listening' ? 'animate-pulse text-blue-400' : ''}`}
                        />

                        <div className="flex items-center gap-2 pl-4 border-l border-white/10">
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold hidden sm:block">Convert To:</span>
                            <div className="dropdown dropdown-top dropdown-end">
                                <div tabIndex={0} role="button" className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-all text-sm border border-white/5">
                                    {transLang ? transLang.label : "None"}
                                    <ChevronDownIcon className="size-3" />
                                </div>
                                <ul tabIndex={0} className="dropdown-content z-[20] menu p-2 shadow-2xl bg-[#1e293b] border border-white/10 rounded-xl w-40 mb-2 max-h-60 overflow-y-auto">
                                    <li>
                                        <button onClick={() => setTransLang(null)} className={!transLang ? "bg-blue-500/20 text-blue-400" : ""}>
                                            None
                                        </button>
                                    </li>
                                    {TRANSLATION_LANGUAGES.map((l) => (
                                        <li key={l.code}>
                                            <button onClick={() => setTransLang(l)} className={transLang?.code === l.code ? "bg-blue-500/20 text-blue-400" : ""}>
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
                            className="ml-4 p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hove:bg-blue-600 text-white rounded-xl transition-all shadow-lg shadow-blue-600/20"
                        >
                            <SendIcon className="size-5" />
                        </button>
                    </div>
                </div>
            </footer>

            <style>{`
        @keyframes equalizer {
          0%, 100% { height: 4px; }
          50% { height: 100%; }
        }
        ::-webkit-scrollbar {
          width: 5px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
        </div>
    );
};

export default AiRobotShell;
