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
    MessageSquareIcon
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
    aiRobotSendConversationMessage
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

    const [conversations, setConversations] = useState([]);
    const [activeConvoId, setActiveConvoId] = useState(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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
        fetchConversations();
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
                } catch (err) { }
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setTranslatedPreview("");
        }
    }, [inputText, transLang]);

    const fetchConversations = async () => {
        try {
            const res = await getAiRobotConversations({ module });
            if (res.success) {
                setConversations(res.conversations || []);
                // By default, if no active, try to load the latest one
                if (!activeConvoId && res.conversations.length > 0) {
                    loadConversation(res.conversations[0].id);
                } else if (res.conversations.length === 0) {
                    setMessages([]);
                    setActiveConvoId(null);
                }
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
        setTranslatedPreview("");
        setIsTyping(true);

        try {
            const res = await aiRobotSendConversationMessage({
                conversationId: currentId,
                message: textToSend,
                language: voiceLang.label
            });

            if (res.success) {
                const aiMsg = { role: "assistant", text: res.reply, timestamp: new Date() };
                setMessages((prev) => [...prev, aiMsg]);

                // Update conversation title in list if it changed
                if (res.title) {
                    setConversations(prev => prev.map(c => c.id === currentId ? { ...c, title: res.title } : c));
                }

                handleTts(res.reply);
            } else {
                throw new Error(res.message || "Failed to generate AI response.");
            }
        } catch (err) {
            console.error("Chat error:", err);
            toast.error("Inference Error - Check Server");
            setMessages((prev) => [...prev, {
                role: "assistant",
                text: `⚠️ Inference Error: ${err.message || 'Unknown'}`,
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
            setVoiceState("idle");
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
        <div className="flex bg-slate-950 h-screen text-slate-100 overflow-hidden font-sans relative">

            {/* Multi-Chat History Sidebar (Drawer style) */}
            <aside className={`fixed inset-y-0 left-0 w-80 bg-slate-900 border-r border-white/5 z-50 transition-transform duration-500 ease-in-out ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl`}>
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
                                <button
                                    onClick={(e) => handleDeleteConvo(e, convo.id)}
                                    className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-square text-error hover:bg-error/20"
                                >
                                    <Trash2Icon className="size-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            {/* Backdrop for Sidebar */}
            {isHistoryOpen && <div onClick={() => setIsHistoryOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-300"></div>}

            {/* Main Assistant Shell */}
            <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
                <header className="navbar bg-slate-900/50 backdrop-blur-xl border-b border-white/5 px-6 shrink-0 z-20">
                    <div className="flex-1 gap-4">
                        <button onClick={() => setIsHistoryOpen(true)} className="btn btn-ghost btn-sm btn-circle md:mr-2 hover:bg-primary/10 hover:text-primary">
                            <HistoryIcon className="size-5" />
                        </button>
                        <div className="avatar placeholder hidden sm:flex">
                            <div className="bg-primary/20 text-primary rounded-xl w-10 border border-primary/30">
                                <BotIcon className="size-6" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-white">AeroSonix <span className="text-primary">Assistant</span></h1>
                            <div className="flex items-center gap-2">
                                <div className="badge badge-success badge-xs animate-pulse"></div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">Neural Core Online</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-none gap-2 sm:gap-4">
                        <button
                            onClick={handleNewChat}
                            className="btn btn-sm btn-ghost border border-white/10 hidden md:flex items-center gap-2 text-[10px] font-black uppercase hover:bg-primary/20"
                        >
                            <PlusIcon className="size-3" /> New Session
                        </button>

                        <div className="dropdown dropdown-end">
                            <label tabIndex={0} className="btn btn-ghost btn-sm border border-white/10 flex items-center gap-2 text-xs font-bold bg-white/5">
                                {voiceLang.label} <ChevronDownIcon className="size-3" />
                            </label>
                            <ul tabIndex={0} className="dropdown-content z-[30] menu p-2 shadow-2xl bg-slate-900 border border-white/10 rounded-xl w-52 mt-4 max-h-80 overflow-y-auto">
                                {VOICE_LANGUAGES.map((l) => (
                                    <li key={l.code}>
                                        <button onClick={() => setVoiceLang(l)} className={`flex items-center justify-between font-bold py-3 ${voiceLang.code === l.code ? "bg-primary text-white" : "hover:bg-white/5"}`}>
                                            {l.label}
                                            {voiceLang.code === l.code && <CheckIcon className="size-3.5" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </header>

                <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 scroll-smooth custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900/50 via-slate-950 to-black">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full"></div>
                                <div className="relative p-12 bg-slate-900/50 border border-white/10 rounded-[3rem] shadow-3xl">
                                    <SparklesIcon className="size-20 text-primary animate-pulse" />
                                </div>
                            </div>
                            <div className="max-w-md space-y-4">
                                <h2 className="text-3xl font-black text-white tracking-widest uppercase">System Initialization</h2>
                                <p className="text-slate-400 font-medium italic leading-relaxed">
                                    "I am AeroSonix Voice Assistant. Memory linked to MongoDB. All sessions are now persistent."
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm mt-8">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest">Multi-Session Core</div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest">Persistent Storage</div>
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={`chat ${m.role === "user" ? "chat-end" : "chat-start"} group animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                            <div className="chat-image avatar">
                                <div className={`w-10 rounded-2xl p-2 shadow-2xl ${m.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                                    {m.role === "user" ? <CircleIcon className="size-full text-white" /> : <BotIcon className="size-full text-primary" />}
                                </div>
                            </div>
                            <div className="chat-header opacity-50 text-[10px] font-black uppercase mb-1 tracking-tighter">
                                {m.role === "user" ? "User" : "AeroSonix Assistant"}
                                <time className="text-[10px] opacity-30 ml-2">{m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</time>
                            </div>
                            <div className={`chat-bubble text-sm md:text-[15px] font-medium leading-relaxed border-0 shadow-xl py-4 px-6 mb-2
                                ${m.role === "user" ? "bg-indigo-600 text-white rounded-tr-none" : m.isError ? "bg-rose-950/40 text-rose-400 border border-rose-900/50 italic whitespace-pre-wrap" : "bg-slate-800/80 backdrop-blur-md text-slate-100 rounded-tl-none border border-white/5"}
                            `}>
                                {m.role === 'assistant' && !m.isError ? (
                                    <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-headings:text-primary prose-headings:font-black prose-headings:tracking-tight prose-headings:mt-4 prose-headings:mb-2 prose-ul:my-3 prose-li:my-1 prose-ul:list-disc prose-ul:pl-5 prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-2xl prose-pre:my-4 prose-strong:text-white prose-strong:font-black">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <span className="whitespace-pre-wrap">{m.text}</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="chat chat-start">
                            <div className="chat-image avatar">
                                <div className="w-10 rounded-2xl p-2 bg-slate-800 animate-pulse"><BotIcon className="size-full text-primary" /></div>
                            </div>
                            <div className="chat-bubble bg-slate-800/40 border border-primary/20 backdrop-blur-md flex items-center gap-4 py-4 px-6 rounded-tl-none ring-1 ring-primary/10">
                                <div className="flex gap-1.5 items-center">
                                    <span className="size-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <span className="size-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <span className="size-2 bg-primary rounded-full animate-bounce" />
                                </div>
                                <span className="text-[11px] text-primary font-black uppercase tracking-[0.2em] font-mono">Cerebras Active...</span>
                            </div>
                        </div>
                    )}
                </main>

                <footer className="p-6 md:p-8 bg-slate-900 border-t border-white/5 space-y-6">
                    {translatedPreview && (
                        <div className="alert bg-primary/10 border-primary/20 rounded-2xl py-3 animate-in slide-in-from-bottom-2 duration-300">
                            <div className="flex flex-col items-start gap-1 w-full">
                                <div className="flex items-center gap-2 mb-1">
                                    <ZapIcon className="size-3 text-primary" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">Real-time Translation</span>
                                </div>
                                <p className="text-sm text-slate-200 font-semibold italic">"{translatedPreview}"</p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-6">
                        <div className="relative group flex items-center justify-center">
                            {voiceState === "listening" && (
                                <div className="absolute pointer-events-none">
                                    <div className="size-24 bg-primary/30 rounded-full animate-[ping_2s_linear_infinite] blur-2xl" />
                                    <div className="size-28 bg-primary/20 rounded-full animate-[ping_3s_linear_infinite] [animation-delay:1s] blur-3xl" />
                                </div>
                            )}
                            <button
                                onClick={handleMicClick}
                                className={`btn btn-circle btn-lg relative z-10 size-16 md:size-20 transition-all duration-500 border-none
                                    ${voiceState === "idle" ? "bg-slate-800 text-slate-400 hover:bg-primary/20 hover:text-primary" : ""}
                                    ${voiceState === "listening" ? "bg-primary text-white shadow-[0_0_50px_rgba(59,130,246,0.6)]" : ""}
                                    ${voiceState === "processing" ? "bg-slate-700 text-slate-100" : ""}
                                    ${voiceState === "speaking" ? "bg-cyan-500 text-white shadow-[0_0_30px_rgba(6,182,212,0.4)]" : ""}
                                    ${voiceState === "error" ? "bg-rose-600 text-white" : ""}
                                `}
                            >
                                {voiceState === "idle" && <MicIcon className="size-8" />}
                                {voiceState === "listening" && <CircleIcon className="size-9 fill-current animate-pulse" />}
                                {voiceState === "processing" && <Loader2Icon className="size-9 animate-spin" />}
                                {voiceState === "speaking" && (
                                    <div className="flex items-end gap-1.5 h-8">
                                        <div className="w-1.5 bg-white animate-[equalizer_0.7s_ease_infinite] h-2 rounded-full" />
                                        <div className="w-1.5 bg-white animate-[equalizer_0.5s_ease_infinite] h-6 rounded-full" />
                                        <div className="w-1.5 bg-white animate-[equalizer_0.8s_ease_infinite] h-full rounded-full" />
                                        <div className="w-1.5 bg-white animate-[equalizer_0.6s_ease_infinite] h-4 rounded-full" />
                                    </div>
                                )}
                                {voiceState === "error" && <AlertCircleIcon className="size-9" />}
                            </button>
                        </div>

                        <div className="flex-1 join bg-slate-800/50 border border-white/5 p-1 rounded-full shadow-inner focus-within:border-primary/50 transition-all">
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                placeholder={voiceState === 'listening' ? "Voice active..." : "Initiate command..."}
                                className="input bg-transparent border-none outline-none focus:outline-none flex-1 text-white placeholder:text-slate-600 px-6 font-medium"
                            />
                            <div className="flex items-center h-10 my-auto mx-2 gap-2 border-l border-white/10 px-4">
                                <div className="dropdown dropdown-top dropdown-end">
                                    <label tabIndex={0} className="btn btn-ghost btn-xs text-[10px] font-bold text-slate-400 hover:text-primary">
                                        {transLang ? transLang.label : "Native"} <ChevronDownIcon className="size-2.5" />
                                    </label>
                                    <ul tabIndex={0} className="dropdown-content z-[30] menu p-2 shadow-2xl bg-slate-900 border border-white/10 rounded-xl w-40 mb-3 max-h-60 overflow-y-auto">
                                        <li><button onClick={() => setTransLang(null)} className="text-[10px] font-bold py-3 hover:bg-white/5">Auto (Native)</button></li>
                                        <div className="divider my-0 opacity-10"></div>
                                        {TRANSLATION_LANGUAGES.map((l) => (
                                            <li key={l.code}>
                                                <button onClick={() => setTransLang(l)} className={`text-[10px] font-bold py-3 ${transLang?.code === l.code ? "text-primary" : "hover:bg-white/5"}`}>
                                                    {l.label}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <button onClick={() => handleSend()} disabled={!inputText.trim() || isTyping} className="btn btn-primary btn-circle group">
                                {isTyping ? <Loader2Icon className="size-5 animate-spin" /> : <SendIcon className="size-5 group-hover:translate-x-1 transition-transform" />}
                            </button>
                        </div>
                    </div>
                </footer>
            </div>

            <style>{`
                @keyframes equalizer { 0%, 100% { height: 8px; } 50% { height: 100%; } }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default AiRobotShell;
