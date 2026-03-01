import { BASE_URL } from "../../lib/axios";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import {
    BotIcon,
    MicIcon,
    SendIcon,
    ChevronDownIcon,
    RefreshCcwIcon,
    AlertCircleIcon,
    CircleIcon,
    CheckIcon,
    Loader2Icon,
    SparklesIcon,
    ZapIcon,
    MicOffIcon,
    PlusIcon,
    HistoryIcon,
    Trash2Icon,
    XIcon,
    MessageSquareIcon,
    Maximize2Icon,
    Minimize2Icon,
    EyeIcon,
    EyeOffIcon,
    ArrowLeftIcon,
    LanguagesIcon,
    CopyIcon
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import {
    aiRobotSendMessage,
    aiRobotStt,
    aiRobotTts,
    aiRobotTranslate,
    getAiRobotHistory,
    getAiRobotConversations,
    createAiRobotConversation,
    getAiRobotConversation,
    deleteAiRobotConversation,
    aiRobotSendConversationMessage,
    getAiRobotVoices
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
    const [voices, setVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState(null);
    const [voiceLang, setVoiceLang] = useState(VOICE_LANGUAGES[0]);
    const [transLang, setTransLang] = useState(null);

    const [conversations, setConversations] = useState([]);
    const [activeConvoId, setActiveConvoId] = useState(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isChatHidden, setIsChatHidden] = useState(false);

    const [voiceState, setVoiceState] = useState("idle");
    const [lastError, setLastError] = useState("");
    const [englishInput, setEnglishInput] = useState(""); // Stores user's English typing

    const scrollRef = useRef(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const audioPlayerRef = useRef(new Audio());
    const audioQueueRef = useRef([]);
    const isProcessingQueueRef = useRef(false);
    const recognitionRef = useRef(null);
    const silenceTimerRef = useRef(null);

    const module = location.pathname.split("/").pop() || "general";

    useEffect(() => {
        fetchVoices();
        fetchConversations();
        return () => {
            cleanupVoice();
        };
    }, [module]);

    const fetchVoices = async () => {
        try {
            const res = await getAiRobotVoices();
            if (res.success) {
                setVoices(res.voices);
                const def = res.voices.find(v => v.isDefault) || res.voices[0];
                setSelectedVoice(def);
            }
        } catch (err) { }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping, translatedPreview]);

    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        // Parallel Instant Translation Logic
        if (transLang && englishInput.trim()) {
            setIsTranslating(true);
            const timer = setTimeout(async () => {
                try {
                    // Force strict native script translation
                    const res = await aiRobotTranslate({
                        text: englishInput,
                        targetLanguageCode: transLang.code,
                        sourceLanguageCode: "en-IN"
                    });

                    if (res.translatedText) {
                        setTranslatedPreview(res.translatedText);
                        // Parallel update: reflect native script in the actual state used for sending
                        setInputText(res.translatedText);
                    }
                } catch (err) {
                    console.error("Neural Translation Sync Failed:", err);
                } finally {
                    setIsTranslating(false);
                }
            }, 600); // Faster debounce for "parallel" feeling
            return () => clearTimeout(timer);
        } else if (!englishInput.trim() && transLang) {
            setTranslatedPreview("");
            setInputText("");
        }
    }, [englishInput, transLang]);

    const handleCopyText = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    const fetchConversations = async () => {
        try {
            const res = await getAiRobotConversations({ module });
            if (res.success) {
                setConversations(res.conversations || []);
                // User Request: Whenever user opens AI Assistance, it should open in New Session
                handleNewChat();
            }
        } catch (err) {
            console.error("Fetch conversations error:", err);
        }
    };

    const loadConversation = async (id) => {
        try {
            setIsHistoryOpen(false);
            const res = await getAiRobotConversation({ conversationId: id });
            if (res.success) {
                setActiveConvoId(id);
                setMessages(res.conversation.messages || []);
                toast.success(`Loaded: ${res.conversation.title}`);
            }
        } catch (err) {
            toast.error("Failed to load conversation");
        }
    };

    const handleNewChat = async () => {
        try {
            const res = await createAiRobotConversation({ module, title: "New chat" });
            if (res.success) {
                const newConvo = res.conversation;
                setConversations([newConvo, ...conversations]);
                setActiveConvoId(newConvo.id);
                setMessages([]);
                toast.success("New chat started");
            }
        } catch (err) {
            toast.error("Error creating new chat");
        }
    };

    const handleDeleteConvo = async (e, id) => {
        e.stopPropagation();
        try {
            const res = await deleteAiRobotConversation({ conversationId: id });
            if (res.success) {
                setConversations(conversations.filter(c => c.id !== id));
                if (activeConvoId === id) {
                    setMessages([]);
                    setActiveConvoId(null);
                }
                toast.success("Chat deleted");
            }
        } catch (err) {
            toast.error("Delete failed");
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
            try { recognitionRef.current.stop(); } catch (err) { }
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

        // Auto-create if no active conversation exists
        let currentId = activeConvoId;
        if (!currentId) {
            try {
                const res = await createAiRobotConversation({ module, title: textToSend.slice(0, 30) });
                if (res.success) {
                    currentId = res.conversation.id;
                    setActiveConvoId(currentId);
                    setConversations([res.conversation, ...conversations]);
                } else throw new Error();
            } catch (err) {
                toast.error("Session failed to initialize");
                return;
            }
        }

        const userMsg = { role: "user", text: textToSend, timestamp: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        setInputText("");
        setEnglishInput(""); // Clear both
        setTranslatedPreview("");
        setIsTyping(true);

        try {
            const token = localStorage.getItem("aerosonix_token");
            const response = await fetch(`${BASE_URL}/ai-robot/conversations/${currentId}/message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "Accept": "text/event-stream"
                },
                credentials: "include", // Ensure cookies are sent (fixes 401 if token is in cookie)
                body: JSON.stringify({ message: textToSend, language: voiceLang.label })
            });

            if (!response.ok) throw new Error("Stream connection failed.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedReply = "";
            let sentenceBuffer = "";
            let aiMsgId = Date.now();

            setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", text: "", timestamp: new Date() }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.chunk) {
                                accumulatedReply += data.chunk;
                                sentenceBuffer += data.chunk;

                                // Update UI in real-time
                                setMessages(prev => {
                                    const updated = [...prev];
                                    const last = updated[updated.length - 1];
                                    if (last && last.role === "assistant") {
                                        last.text = accumulatedReply;
                                    }
                                    return updated;
                                });

                                // PARALLEL TTS TRIGGER: Robust sentence detection
                                const sentences = sentenceBuffer.match(/[^.!?]+[.!?](\s|$|\n)/g);
                                if (sentences) {
                                    for (const s of sentences) {
                                        const cleanSentence = s.trim()
                                            .replace(/[#*`~]/g, '')
                                            .replace(/\[\d+\]/g, '') // citations
                                            .replace(/\(https?:\/\/[^\)]+\)/g, '') // hidden links
                                            .trim();

                                        if (cleanSentence.length > 2) {
                                            handleTts(cleanSentence);
                                        }
                                        sentenceBuffer = sentenceBuffer.replace(s, '');
                                    }
                                }
                            }
                            if (data.done && data.title) {
                                setConversations(prev => prev.map(c => c.id === currentId ? { ...c, title: data.title } : c));
                            }
                        } catch (e) { /* ignore partial json */ }
                    }
                }
            }

            // Flush final residue
            if (sentenceBuffer.trim().length > 0) {
                const finalClean = sentenceBuffer.trim()
                    .replace(/[#*`~]/g, '')
                    .replace(/\[\d+\]/g, '')
                    .trim();
                if (finalClean.length > 1) handleTts(finalClean);
            }

        } catch (err) {
            const respData = err.response?.data;
            const errMsg = respData?.message || err.message || "AeroSonix is temporarily overloaded.";
            const details = respData?.details ? ` (${respData.details})` : "";

            console.error("Chat error:", err);
            toast.error(`AeroSonix ERROR: ${errMsg}`);
            setMessages((prev) => [...prev, {
                role: "assistant",
                text: `⚠️ Inference Error: ${errMsg}${details}. Please verify if CEREBRAS_API_KEY is added to your Render dashboard environment variables.`,
                timestamp: new Date(),
                isError: true
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleTts = async (text) => {
        const logPrefix = "[AEROSONIX][TTS-QUEUE]";
        try {
            if (!text || text.length < 2) return;

            // 1. Fetch Audio Chunk Immediately
            const audioData = await aiRobotTts({
                text,
                languageCode: voiceLang.code,
                speaker: selectedVoice?.voiceId || "shubh"
            });

            if (!audioData || audioData.byteLength < 100) return;

            // 2. Add to Queue
            const blob = new Blob([audioData], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            audioQueueRef.current.push({ url, text });

            // 3. Trigger Sequential Playback
            if (!isProcessingQueueRef.current) {
                processAudioQueue();
            }

        } catch (err) {
            console.error(`${logPrefix} Fetch Error:`, err);
        }
    };

    const processAudioQueue = async () => {
        if (audioQueueRef.current.length === 0) {
            isProcessingQueueRef.current = false;
            setVoiceState("idle");
            return;
        }

        isProcessingQueueRef.current = true;
        setVoiceState("speaking");

        const { url, text } = audioQueueRef.current.shift();
        console.log(`[AEROSONIX][VOICE] Narrating: "${text.slice(0, 30)}..."`);

        audioPlayerRef.current.src = url;

        const onEnded = () => {
            URL.revokeObjectURL(url);
            audioPlayerRef.current.removeEventListener('ended', onEnded);
            processAudioQueue();
        };

        audioPlayerRef.current.addEventListener('ended', onEnded);

        try {
            await audioPlayerRef.current.play();
        } catch (error) {
            console.error("Playback failed:", error);
            processAudioQueue();
        }
    };

    const startListening = async () => {
        try {
            setVoiceState("listening");
            setInputText("");
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
                    if (res.text) handleSend(res.text);
                    else {
                        setVoiceState("idle");
                        toast.error("Silence detected.");
                    }
                } catch (err) {
                    setVoiceState("error");
                    setTimeout(() => setVoiceState("idle"), 2000);
                }
            };
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognitionRef.current = recognition;
                recognition.lang = voiceLang.code;
                recognition.interimResults = true;
                recognition.onresult = (event) => {
                    let transcript = "";
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        transcript += event.results[i][0].transcript;
                    }
                    setInputText(transcript);
                    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = setTimeout(() => {
                        if (mediaRecorder.state === "recording") {
                            mediaRecorder.stop();
                            try { recognition.stop(); } catch (e) { }
                        }
                    }, 2000);
                };
                recognition.start();
            }
            mediaRecorder.start();
        } catch (err) {
            setVoiceState("error");
            toast.error("Mic Error");
            setTimeout(() => setVoiceState("idle"), 2000);
        }
    };

    const handleMicClick = () => {
        if (voiceState === "idle") startListening();
        else { cleanupVoice(); setVoiceState("idle"); }
    };

    return (
        <div className={`flex bg-slate-950 text-slate-100 font-sans transition-all duration-700 ease-in-out ${isFullScreen ? 'fixed inset-0 z-[100] w-screen h-screen' : 'relative h-screen w-full overflow-hidden'}`}>

            {/* AI Core Pulse Animation (Voice-to-Voice Mode) */}
            {isChatHidden && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 animate-in fade-in zoom-in duration-1000">
                    <div className="relative flex items-center justify-center">
                        {/* Outer Glows */}
                        <div className={`absolute size-[400px] rounded-full blur-[120px] transition-all duration-1000 ${voiceState === "speaking" ? "bg-cyan-500/30 scale-125" : voiceState === "listening" ? "bg-primary/40 scale-110" : "bg-primary/10 scale-90"}`}></div>
                        <div className={`absolute size-[250px] rounded-full blur-[60px] transition-all duration-1000 ${voiceState === "speaking" ? "bg-cyan-400/20" : "bg-primary/20"}`}></div>

                        {/* Pulsing Spheres */}
                        <div className={`relative size-48 md:size-64 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 shadow-2xl overflow-hidden
                            ${voiceState === "speaking" ? "bg-cyan-600/20 ring-4 ring-cyan-500/30 scale-105" : "bg-primary/20 ring-4 ring-primary/40"}
                        `}>
                            {/* Inner Energy Core */}
                            <div className={`size-32 md:size-40 rounded-full blur-xl animate-pulse transition-colors duration-500 ${voiceState === "speaking" ? "bg-cyan-400" : "bg-primary"}`}></div>

                            {/* Center Icon */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                {voiceState === "speaking" ? <ZapIcon className="size-16 text-white animate-bounce" /> : <BotIcon className="size-16 text-white" />}
                            </div>

                            {/* Orbital Rings */}
                            <div className="absolute inset-0 border-2 border-dashed border-white/5 rounded-full animate-[spin_12s_linear_infinite]"></div>
                            <div className="absolute inset-4 border border-dashed border-white/5 rounded-full animate-[spin_8s_linear_reverse_infinite]"></div>
                        </div>

                        {/* Dynamic status text */}
                        <div className="absolute -bottom-24 text-center">
                            <span className="text-xs font-black uppercase tracking-[0.4em] text-white/40 mb-2 block">
                                {voiceState === "speaking" ? "Assistant Vocalizing" : voiceState === "listening" ? "Listening to Signal" : "Neural Link Active"}
                            </span>
                            <div className="h-1 w-48 bg-white/5 rounded-full overflow-hidden relative">
                                <div className={`absolute inset-y-0 left-0 transition-all duration-500 bg-gradient-to-r from-transparent via-primary to-transparent ${voiceState !== "idle" ? "w-full animate-[shimmer_2s_infinite]" : "w-0"}`}></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar (Archives) */}
            <aside className={`fixed inset-y-0 left-0 w-80 bg-slate-900 border-r border-white/5 z-[60] transition-transform duration-500 ease-in-out ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl`}>
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-slate-800/20">
                    <div className="flex items-center gap-3">
                        <HistoryIcon className="size-5 text-primary" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">Archives</h2>
                    </div>
                    <button onClick={() => setIsHistoryOpen(false)} className="btn btn-ghost btn-sm btn-circle"><XIcon className="size-5" /></button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-80px)] custom-scrollbar">
                    <button onClick={handleNewChat} className="btn btn-primary w-full gap-2 rounded-2xl shadow-lg border-none hover:scale-95 transition-all">
                        <PlusIcon className="size-4" /> Start New Session
                    </button>
                    <div className="space-y-2 mt-6">
                        {conversations.length === 0 && <p className="text-center text-slate-600 text-xs py-10 font-bold italic uppercase tracking-tighter">Memory Units Empty</p>}
                        {conversations.map(convo => (
                            <div
                                key={convo.id}
                                onClick={() => loadConversation(convo.id)}
                                className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border ${activeConvoId === convo.id ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <MessageSquareIcon className={`size-4 shrink-0 ${activeConvoId === convo.id ? 'text-primary' : 'text-slate-600'}`} />
                                    <span className={`text-xs font-bold truncate ${activeConvoId === convo.id ? 'text-white' : 'text-slate-400'}`}>{convo.title}</span>
                                </div>
                                <button onClick={(e) => handleDeleteConvo(e, convo.id)} className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-square text-error hover:bg-error/20"><Trash2Icon className="size-3.5" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            {isHistoryOpen && <div onClick={() => setIsHistoryOpen(false)} className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-in fade-in duration-300"></div>}

            {/* Main Shell Container */}
            <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden relative">

                {/* Fixed Non-Scrollable Header */}
                <header className="navbar bg-slate-900/40 backdrop-blur-2xl border-b border-white/5 px-2 sm:px-6 shrink-0 z-20 h-16 sm:h-20">
                    <div className="flex-1 gap-1 sm:gap-4 items-center overflow-hidden">
                        <button onClick={() => setIsHistoryOpen(true)} className="btn btn-ghost btn-sm btn-circle hover:bg-primary/10 hover:text-primary transition-colors shrink-0">
                            <HistoryIcon className="size-5" />
                        </button>

                        {isFullScreen && (
                            <button onClick={() => setIsFullScreen(false)} className="btn btn-ghost btn-sm btn-circle hover:bg-white/10 text-white shrink-0">
                                <ArrowLeftIcon className="size-5" />
                            </button>
                        )}

                        <div className="hidden sm:flex avatar placeholder">
                            <div className="bg-primary/10 text-primary rounded-xl w-11 border border-primary/20 shadow-inner">
                                <BotIcon className="size-6" />
                            </div>
                        </div>

                        <div className="flex flex-col min-w-0">
                            <h1 className="text-sm sm:text-lg font-black tracking-tighter text-white uppercase leading-none truncate overflow-hidden">AeroSonix <span className="text-primary tracking-widest ml-1 hidden xs:inline">AI</span></h1>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="size-1 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0"></div>
                                <span className="text-[8px] sm:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] truncate">{module} Core</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-none gap-2">
                        {/* Visibility Toggle */}
                        <button
                            onClick={() => setIsChatHidden(!isChatHidden)}
                            className={`btn btn-sm btn-ghost btn-circle border border-white/5 ${isChatHidden ? 'bg-primary/20 text-primary ring-1 ring-primary/40' : 'text-white/40'}`}
                            title={isChatHidden ? "Show Chat" : "Voice-Only Mode"}
                        >
                            {isChatHidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>

                        {/* Full Screen Toggle */}
                        <button
                            onClick={() => setIsFullScreen(!isFullScreen)}
                            className="btn btn-sm btn-ghost btn-circle border border-white/5 text-white/40 hover:text-white transition-all"
                            title={isFullScreen ? "Minimize" : "Expand Interface"}
                        >
                            {isFullScreen ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
                        </button>

                        <div className="h-6 w-[1px] bg-white/5 mx-1"></div>

                        {/* Configuration Dropdowns */}
                        <div className="dropdown dropdown-end hidden md:block">
                            <label tabIndex={0} className="btn btn-ghost btn-sm border border-white/5 text-[10px] font-black uppercase tracking-widest px-4 bg-white/5 rounded-full">
                                <MicIcon className="size-3 text-primary mr-1" /> {selectedVoice?.voiceName?.split(' ')[0] || "Default"}
                            </label>
                            <ul tabIndex={0} className="dropdown-content z-30 menu p-2 shadow-2xl bg-slate-900 border border-white/10 rounded-2xl w-48 mt-4 animate-in slide-in-from-top-2 duration-200">
                                {voices.slice(0, 10).map((v) => (
                                    <li key={v.voiceId}>
                                        <button onClick={() => setSelectedVoice(v)} className={`font-bold text-xs py-3 ${selectedVoice?.voiceId === v.voiceId ? "bg-primary text-white" : "hover:bg-white/5"}`}>{v.voiceName}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="dropdown dropdown-end">
                            <label tabIndex={0} className="btn btn-ghost btn-sm border border-white/5 text-[10px] font-black uppercase tracking-widest px-4 bg-white/5 rounded-full">
                                {voiceLang.code.split('-')[0]}
                            </label>
                            <ul tabIndex={0} className="dropdown-content z-30 menu p-2 shadow-2xl bg-slate-900 border border-white/10 rounded-2xl w-52 mt-4 max-h-80 overflow-y-auto">
                                {VOICE_LANGUAGES.map((l) => (
                                    <li key={l.code}>
                                        <button onClick={() => setVoiceLang(l)} className={`font-bold text-xs py-3 ${voiceLang.code === l.code ? "bg-primary text-white" : "hover:bg-white/5"}`}>{l.label}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </header>

                {/* Primary Chat Body (Only Scrollable Area) */}
                <main ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 sm:space-y-10 scroll-smooth custom-scrollbar relative bg-slate-950">
                    {/* Visual Flourish Background */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(59,130,246,0.03)_0%,_transparent_50%)] pointer-events-none"></div>

                    {/* Immersive Neural Core Overlay (Voice Mode) */}
                    {isChatHidden && (
                        <div className="sticky top-0 h-full w-full z-10 flex flex-col items-center justify-center pointer-events-none p-4 overflow-hidden animate-in fade-in duration-700">
                            <div className="relative scale-75 sm:scale-100">
                                {/* Layers of glowing rings */}
                                <div className={`absolute inset-0 bg-primary/20 blur-[100px] rounded-full transition-all duration-1000 ${voiceState === 'speaking' ? 'scale-150 opacity-100' : 'scale-100 opacity-40'}`}></div>
                                <div className={`absolute -inset-10 border-2 border-primary/10 rounded-full animate-[spin_12s_linear_infinite] ${voiceState === 'speaking' ? 'opacity-30' : 'opacity-10'}`}></div>
                                <div className={`absolute -inset-20 border border-white/5 rounded-full animate-[spin_20s_linear_infinite_reverse] ${voiceState === 'speaking' ? 'opacity-20' : 'opacity-5'}`}></div>

                                {/* The Central Core */}
                                <div className={`relative size-32 sm:size-48 rounded-full border-2 border-white/20 bg-slate-900/80 backdrop-blur-3xl shadow-[0_0_80px_rgba(59,130,246,0.3)] flex items-center justify-center transition-all duration-500
                                    ${voiceState === 'listening' ? 'ring-8 ring-primary/20 animate-pulse scale-105' : ''}
                                    ${voiceState === 'speaking' ? 'border-primary/50 shadow-[0_0_120px_rgba(59,130,246,0.6)] scale-110' : ''}
                                `}>
                                    <div className={`size-16 sm:size-24 rounded-full bg-gradient-to-br from-primary via-indigo-500 to-cyan-400 shadow-inner flex items-center justify-center relative overflow-hidden transition-transform duration-500 ${voiceState === 'speaking' ? 'scale-110' : 'scale-100'}`}>
                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                        <ZapIcon className={`size-8 sm:size-12 text-white drop-shadow-lg transition-all duration-500 ${voiceState === 'speaking' ? 'animate-pulse scale-125' : ''}`} />
                                    </div>

                                    {/* Waveform Visualization Overlay (Simplified) */}
                                    {voiceState === 'speaking' && (
                                        <div className="absolute inset-0 rounded-full flex items-center justify-center gap-1">
                                            {[...Array(8)].map((_, i) => (
                                                <div key={i} className="w-1 bg-white/40 rounded-full animate-[equalizer_0.5s_ease_infinite]" style={{ height: '40%', animationDelay: `${i * 0.05}s` }}></div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-12 sm:mt-20 text-center space-y-2 sm:space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                                <p className="text-primary text-[10px] sm:text-xs font-black uppercase tracking-[0.4em] drop-shadow-md">
                                    {voiceState === 'listening' ? 'Receptor Active' : voiceState === 'speaking' ? 'Synthesizing Neural Output' : 'Aerosonix Link Active'}
                                </p>
                                <h3 className="text-white/80 text-sm sm:text-lg font-bold italic max-w-xs px-4">
                                    {voiceState === 'listening' ? "Awaiting vocal command..." : voiceState === 'speaking' ? "Delivering response..." : "Visual interface decoupled."}
                                </h3>
                            </div>
                        </div>
                    )}

                    {/* Message List Container (Fades in Voice Mode) */}
                    <div className={`p-4 sm:p-6 md:p-12 space-y-6 sm:space-y-10 transition-all duration-700 ${isChatHidden ? 'opacity-0 scale-95 h-0 overflow-hidden' : 'opacity-100 scale-100'}`}>
                        {messages.length === 0 && !isChatHidden && (
                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 animate-in fade-in duration-1000 p-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-primary/20 blur-[120px] rounded-full animate-pulse"></div>
                                    <div className="relative p-6 sm:p-10 bg-slate-900/40 border border-white/10 rounded-[2.5rem] sm:rounded-[3rem] shadow-3xl ring-1 ring-white/5">
                                        <SparklesIcon className="size-10 sm:size-16 text-primary animate-[spin_4s_linear_infinite]" />
                                    </div>
                                </div>
                                <div className="max-w-md space-y-3">
                                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-widest uppercase">Neural Core Online</h2>
                                    <p className="text-slate-500 font-medium italic leading-relaxed text-xs sm:text-sm">"Session synchronized. Standing by for instructions."</p>
                                </div>
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div key={i} className={`chat ${m.role === "user" ? "chat-end" : "chat-start"} animate-in fade-in slide-in-from-bottom-6 duration-700`}>
                                <div className="chat-image avatar">
                                    <div className={`w-10 rounded-2xl p-2.5 shadow-2xl ring-1 ring-white/10 transition-transform hover:scale-110 ${m.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                                        {m.role === "user" ? <CircleIcon className="size-full text-white" /> : <BotIcon className="size-full text-primary" />}
                                    </div>
                                </div>
                                <div className="chat-header opacity-30 text-[9px] font-black uppercase mb-1.5 tracking-[0.2em] px-1">
                                    {m.role === "user" ? "Integrator" : "System Response"}
                                    <time className="ml-2 opacity-50">{m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</time>
                                </div>
                                <div className={`chat-bubble text-xs sm:text-sm md:text-[15px] font-medium leading-relaxed border-0 shadow-2xl py-4 sm:py-5 px-5 sm:px-7 mb-2 transition-all group max-w-[85vw]
                                ${m.role === "user" ? "bg-indigo-600 text-white rounded-2xl rounded-tr-none" : m.isError ? "bg-rose-950/40 text-rose-400 border-rose-900/50 italic" : "bg-slate-900/80 backdrop-blur-xl text-slate-100 rounded-2xl rounded-tl-none border border-white/5"}
                            `}>
                                    {m.role === 'assistant' && !m.isError ? (
                                        <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-code:text-primary prose-pre:bg-black/60 prose-pre:rounded-2xl">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <span className="whitespace-pre-wrap">{m.text}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="chat chat-start animate-pulse">
                                <div className="chat-bubble bg-slate-900/50 border border-primary/20 backdrop-blur-lg flex items-center gap-4 py-4 px-6 rounded-3xl rounded-tl-none">
                                    <div className="flex gap-1.5 items-center">
                                        <span className="size-1.5 bg-primary rounded-full animate-bounce" />
                                        <span className="size-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <span className="size-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    </div>
                                    <span className="text-[10px] text-primary/60 font-black uppercase tracking-widest font-mono italic">Synchronizing...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* Fixed Non-Scrollable Footer */}
                <footer className="p-4 sm:p-6 md:p-10 bg-slate-950 border-t border-white/5 shrink-0 z-20">
                    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
                        {translatedPreview && (
                            <div className="alert bg-indigo-500/10 border-indigo-500/20 rounded-2xl py-3 px-5 animate-in slide-in-from-bottom-4 duration-500 shadow-[0_8px_32px_rgba(99,102,241,0.1)] backdrop-blur-md">
                                <div className="flex flex-col items-start gap-2 w-full">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <div className="size-5 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                                <LanguagesIcon className="size-3 text-indigo-400" />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Live Translation to {transLang?.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleCopyText(translatedPreview)}
                                                className="btn btn-ghost btn-xs btn-circle text-indigo-400 hover:bg-indigo-500/20"
                                                title="Copy translation"
                                            >
                                                <CopyIcon className="size-3" />
                                            </button>
                                            <div className="flex gap-1">
                                                <div className="size-1 bg-indigo-500 rounded-full animate-pulse"></div>
                                                <div className="size-1 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                                <div className="size-1 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-200 font-bold italic leading-relaxed">
                                        {translatedPreview}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 sm:gap-6">
                            <div className="relative shrink-0">
                                {voiceState === "listening" && (
                                    <div className="absolute inset-0 bg-primary/40 rounded-full blur-2xl animate-[ping_2s_infinite]"></div>
                                )}
                                <button
                                    onClick={handleMicClick}
                                    className={`btn btn-circle relative z-10 size-12 sm:size-16 md:size-20 transition-all duration-700 border-none shadow-2xl
                                        ${voiceState === "idle" ? "bg-slate-900 text-white/20 hover:bg-primary/20 hover:text-primary hover:scale-105" : ""}
                                        ${voiceState === "listening" ? "bg-primary text-white scale-110" : ""}
                                        ${voiceState === "processing" ? "bg-slate-800 text-primary rotate-180" : ""}
                                        ${voiceState === "speaking" ? "bg-cyan-500 text-white shadow-[0_0_30px_rgba(6,182,212,0.4)]" : ""}
                                        ${voiceState === "error" ? "bg-rose-600 text-white" : ""}
                                    `}
                                >
                                    {voiceState === "idle" && <MicIcon className="size-6 sm:size-8" />}
                                    {voiceState === "listening" && <CircleIcon className="size-7 sm:size-10 fill-current animate-pulse ring-4 sm:ring-8 ring-white/10 rounded-full" />}
                                    {voiceState === "processing" && <Loader2Icon className="size-7 sm:size-10 animate-spin" />}
                                    {voiceState === "speaking" && (
                                        <div className="flex items-center gap-1 h-6 sm:h-10">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className={`w-0.5 sm:w-1 bg-white rounded-full animate-[equalizer_0.7s_ease_infinite]`} style={{ animationDelay: `${i * 0.15}s`, height: '50%' }} />
                                            ))}
                                        </div>
                                    )}
                                    {voiceState === "error" && <AlertCircleIcon className="size-7 sm:size-10" />}
                                </button>
                            </div>

                            <div className="flex-1 flex bg-slate-900/80 border border-white/5 p-1 rounded-full shadow-2xl focus-within:ring-2 ring-primary/30 transition-all relative">
                                <input
                                    type="text"
                                    value={transLang ? englishInput : inputText}
                                    onChange={(e) => {
                                        if (transLang) setEnglishInput(e.target.value);
                                        else setInputText(e.target.value);
                                    }}
                                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                    placeholder={voiceState === 'listening' ? "Listening..." : "Neural Typing..."}
                                    className="input bg-transparent border-none outline-none focus:outline-none flex-1 text-white placeholder:text-slate-600 px-4 sm:px-8 font-bold text-xs sm:text-sm tracking-wide min-w-0"
                                />
                                <div className="flex items-center gap-1.5 sm:gap-3 pr-2 sm:pr-4 border-l border-white/10 ml-1 sm:ml-4 shrink-0">
                                    <div className="dropdown dropdown-top dropdown-end">
                                        <div tabIndex={0} role="button" className={`btn btn-ghost btn-xs h-9 sm:h-11 px-3 sm:px-4 flex items-center gap-2 rounded-full transition-all border border-transparent ${transLang ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'text-slate-500 hover:bg-white/5'}`}>
                                            <LanguagesIcon className={`size-3.5 sm:size-4 ${transLang ? 'animate-pulse' : ''}`} />
                                            <span className="text-[9px] sm:text-[10px] font-black tracking-widest uppercase hidden xs:inline">
                                                {transLang ? transLang.label.slice(0, 3) : "Translate"}
                                            </span>
                                        </div>
                                        <ul tabIndex={0} className="dropdown-content z-[250] menu p-2 shadow-2xl bg-slate-900 border border-white/10 rounded-2xl w-56 sm:w-64 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden shadow-indigo-500/20 translate-y-[-10px]">
                                            <div className="px-5 py-4 mb-2 border-b border-white/5 bg-indigo-500/5 rounded-t-xl">
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 font-mono flex items-center gap-2">
                                                    <div className="size-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                                                    Neural Translation
                                                </h3>
                                            </div>
                                            <li>
                                                <button onClick={() => { setTransLang(null); document.activeElement?.blur(); }} className={`text-[10px] font-black py-4 uppercase flex items-center justify-between mx-1 rounded-xl transition-all ${!transLang ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-white/5'}`}>
                                                    <span>Direct (OFF)</span>
                                                    {!transLang && <CheckIcon className="size-4" />}
                                                </button>
                                            </li>
                                            <div className="divider my-1 opacity-5"></div>
                                            <div className="max-h-72 overflow-y-auto custom-scrollbar px-1">
                                                {TRANSLATION_LANGUAGES.map((l) => (
                                                    <li key={l.code} className="my-1">
                                                        <button
                                                            onClick={() => {
                                                                setTransLang(l);
                                                                document.activeElement?.blur();
                                                            }}
                                                            className={`text-[10px] font-black py-4 uppercase flex items-center justify-between rounded-xl transition-all ${transLang?.code === l.code ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40' : 'hover:bg-white/10'}`}
                                                        >
                                                            <span>{l.label}</span>
                                                            {transLang?.code === l.code && <CheckIcon className="size-4" />}
                                                        </button>
                                                    </li>
                                                ))}
                                            </div>
                                        </ul>
                                    </div>
                                    <button
                                        onClick={() => handleSend()}
                                        disabled={!inputText.trim() || isTyping || isTranslating}
                                        className={`btn btn-circle size-9 sm:size-11 shadow-lg border-none transition-all duration-500
                                            ${transLang && inputText.trim() ? "bg-indigo-600 ring-4 ring-indigo-500/20 hover:scale-110 shadow-indigo-500/40" : "btn-primary ring-4 ring-primary/20 hover:scale-105"}
                                        `}
                                    >
                                        {(isTyping || isTranslating) ? <Loader2Icon className="size-4 sm:size-5 animate-spin" /> : <SendIcon className="size-4 sm:size-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>

            <style>{`
                @keyframes equalizer { 0%, 100% { height: 10px; } 50% { height: 100%; } }
                @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.1); border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.3); }
                
                @keyframes pulse-slow {
                    0%, 100% { transform: scale(1); opacity: 0.4; }
                    50% { transform: scale(1.05); opacity: 0.6; }
                }
            `}</style>
        </div>
    );
};

export default AiRobotShell;
