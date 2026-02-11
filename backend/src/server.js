import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import http from "http";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import adminRoutes from "./routes/admin.route.js";
import profileRoutes from "./routes/profile.route.js";
import callRoutes from "./routes/call.route.js";
import aiRobotRoutes from "./routes/aiRobot.route.js";

import { connectDB } from "./lib/db.js";
import User from "./models/User.js";

// Gladia language mapping
const gladiaLanguageMap = {
  'en': 'en',
  'te': 'te',
  'hi': 'hi',
  'ta': 'ta',
  'kn': 'kn',
  'ml': 'ml',
  'pa': 'pa',
  'gu': 'gu',
  'mr': 'mr',
  'bn': 'bn',
  'or': 'or',
  'as': 'as',
  'ur': 'ur',
  'ne': 'ne',
  'sa': 'sa',
  'fr': 'fr',
  'es': 'es',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'zh': 'zh',
  'ja': 'ja',
  'ko': 'ko',
  'ar': 'ar'
};

// Normalize Gladia language codes
const normalizeGladiaLanguageCode = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  // Handle common variations
  if (v === 'english' || v === 'en') return 'en';
  if (v === 'telugu' || v === 'te') return 'te';
  if (v === 'hindi' || v === 'hi') return 'hi';
  if (v === 'tamil' || v === 'ta') return 'ta';
  if (v === 'kannada' || v === 'kn') return 'kn';
  if (v === 'malayalam' || v === 'ml') return 'ml';
  if (v === 'punjabi' || v === 'pa') return 'pa';
  if (v === 'gujarati' || v === 'gu') return 'gu';
  if (v === 'marathi' || v === 'mr') return 'mr';
  if (v === 'bengali' || v === 'bn') return 'bn';
  if (v === 'odia' || v === 'or') return 'or';
  if (v === 'assamese' || v === 'as') return 'as';
  if (v === 'urdu' || v === 'ur') return 'ur';
  if (v === 'nepali' || v === 'ne') return 'ne';
  if (v === 'sanskrit' || v === 'sa') return 'sa';
  if (v === 'french' || v === 'fr') return 'fr';
  if (v === 'spanish' || v === 'es') return 'es';
  if (v === 'german' || v === 'de') return 'de';
  if (v === 'italian' || v === 'it') return 'it';
  if (v === 'portuguese' || v === 'pt') return 'pt';
  if (v === 'russian' || v === 'ru') return 'ru';
  if (v === 'chinese' || v === 'zh') return 'zh';
  if (v === 'japanese' || v === 'ja') return 'ja';
  if (v === 'korean' || v === 'ko') return 'ko';
  if (v === 'arabic' || v === 'ar') return 'ar';
  
  // Return as-is if it's already a valid 2-letter code
  if (/^[a-z]{2}$/.test(v)) return v;
  
  return null;
};

const app = express();
const PORT = process.env.PORT || 5001;

const __dirname = path.resolve();

const normalizeOrigin = (value) => {
  if (!value) return value;
  return value.trim().replace(/\/+$/, "");
};

const frontendEnvOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = [
  ...frontendEnvOrigins,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].map(normalizeOrigin);

const corsOptions = {
  // Reflect request Origin in Access-Control-Allow-Origin.
  // This is required when using cookies across different domains.
  // NOTE: Auth-protected APIs + cookies still protect access.
  origin: true,
  credentials: true, // allow frontend to send cookies
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Ensure preflight requests succeed
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ message: "Database connection error" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/call", callRoutes);
app.use("/api/ai-robot", aiRobotRoutes);

// Also expose non-prefixed routes (useful when frontend points directly at backend base URL)
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/chat", chatRoutes);
app.use("/admin", adminRoutes);
app.use("/profile", profileRoutes);
app.use("/call", callRoutes);
app.use("/ai-robot", aiRobotRoutes);

// Simple public health endpoint for readiness checks
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/favicon.png", (req, res) => {
  res.status(204).end();
});

const getUserFromToken = async (token) => {
  if (!token) return null;
  if (!process.env.JWT_SECRET_KEY) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const user = await User.findById(decoded.userId).select("-password");
    return user || null;
  } catch {
    return null;
  }
};

const setupGladiaWsProxy = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== "/ws/gladia") return;

      const token = url.searchParams.get("token") || "";
      const user = await getUserFromToken(token);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = user;
        ws.gladiaUrl = url;
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", async (clientWs) => {
    console.log("[GladiaProxy] client connected");
    
    // Get current user's profile language (this is the speaker)
    const speaker = clientWs.user;
    const speakerLanguageRaw = speaker?.profileLanguage || 'english';
    const speakerLanguageCode = normalizeGladiaLanguageCode(speakerLanguageRaw) || 'en';
    
    console.log("[GladiaProxy] Speaker profile language:", speakerLanguageRaw, "->", speakerLanguageCode);
    
    // Check for Gladia API key
    const apiKey = process.env.GLADIA_API_KEY;
    if (!apiKey) {
      console.log("[GladiaProxy] GLADIA_API_KEY is not set");
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "GLADIA_API_KEY is not set" }));
      } catch {
      }
      clientWs.close(1011, "GLADIA_API_KEY is not set");
      return;
    }

    const url = clientWs.gladiaUrl;
    const targetLanguageRaw = (url?.searchParams?.get("target_language") || url?.searchParams?.get("targetLanguage") || "english").trim();
    const targetLanguageCode = normalizeGladiaLanguageCode(targetLanguageRaw) || 'en';
    
    console.log("[GladiaProxy] Target language for translation:", targetLanguageRaw, "->", targetLanguageCode);

    // Step 1: Initialize Gladia session
    let gladiaWsUrl = null;
    let sessionId = null;
    try {
      const response = await fetch("https://api.gladia.io/v2/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gladia-key": apiKey,
        },
        body: JSON.stringify({
          encoding: "wav/pcm",
          sample_rate: 16000,
          bit_depth: 16,
          channels: 1,
          language_config: {
            languages: [speakerLanguageCode],
            code_switching: false
          },
          realtime_processing: {
            translation: true,
            translation_config: {
              target_languages: [targetLanguageCode],
              model: "base",
              match_original_utterances: true,
              context_adaptation: true,
              informal: false
            }
          },
          messages_config: {
            receive_final_transcripts: true,
            receive_realtime_processing_events: true
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[GladiaProxy] Failed to initialize session:", response.status, errorText);
        clientWs.send(JSON.stringify({ type: "error", message: `Gladia session init failed: ${errorText}` }));
        clientWs.close(1011, "Gladia session init failed");
        return;
      }

      const sessionData = await response.json();
      gladiaWsUrl = sessionData.url;
      sessionId = sessionData.id;
      console.log("[GladiaProxy] Session initialized:", sessionId);
    } catch (error) {
      console.error("[GladiaProxy] Error initializing session:", error);
      clientWs.send(JSON.stringify({ type: "error", message: "Gladia session init error" }));
      clientWs.close(1011, "Gladia session init error");
      return;
    }

    // Step 2: Connect to Gladia WebSocket
    const gladiaWs = new WebSocket(gladiaWsUrl);

    const translationByUtteranceId = new Map();

    const extractTranslationText = (msg, targetLang) => {
      const lang = String(targetLang || "").trim().toLowerCase();
      if (!lang) return null;

      const candidates = [
        msg?.translation,
        msg?.data?.translation,
        msg?.realtime_processing?.translation,
        msg?.data?.realtime_processing?.translation,
      ].filter(Boolean);

      for (const t of candidates) {
        const results = t?.results;
        if (!Array.isArray(results)) continue;

        const picked = results.find(
          (r) => Array.isArray(r?.languages) && r.languages.map((x) => String(x).toLowerCase()).includes(lang)
        );
        const text = picked?.full_transcript;
        if (String(text || "").trim()) return text;
      }

      return null;
    };

    let closed = false;
    const cleanup = (reason) => {
      if (closed) return;
      closed = true;
      console.log("[GladiaProxy] cleanup", reason || "(no reason)");
      try {
        gladiaWs.close();
      } catch {
      }
      try {
        clientWs.close(1011, reason || "Gladia connection closed");
      } catch {
      }
    };

    gladiaWs.on("open", () => {
      console.log("[GladiaProxy] Gladia WebSocket connected");
    });

    gladiaWs.on("message", async (data) => {
      if (closed) return;
      try {
        const message = JSON.parse(data.toString());
        console.log("[GladiaProxy] Received Gladia message:", JSON.stringify(message, null, 2));
        
        // Handle transcript messages with translation
        if (message.type === "transcript" && message.data?.utterance?.text) {
          const originalText = message.data.utterance.text;
          const detectedLanguage = message.data.utterance.language || speakerLanguageCode;
          const isFinal = message.data.is_final !== false;
          const utteranceId = message.data?.id;
          
          console.log("[GladiaProxy] Transcript:", originalText);
          console.log("[GladiaProxy] Language:", detectedLanguage);
          console.log("[GladiaProxy] Is final:", isFinal);
          
          // Extract translation if available (Gladia may send it inside transcript OR as separate realtime_processing events)
          let translatedText = extractTranslationText(message, targetLanguageCode);
          if (!translatedText && utteranceId && translationByUtteranceId.has(utteranceId)) {
            translatedText = translationByUtteranceId.get(utteranceId);
          }
          if (translatedText) {
            console.log("[GladiaProxy] Translation found:", translatedText);
          }
          
          if (isFinal) {
            const outgoing = {
              type: 'transcript',
              original_text: originalText,
              original_language: speakerLanguageCode,
              translated_text: translatedText,
              translated_language: translatedText ? targetLanguageCode : null,
              is_final: true,
              language_code: detectedLanguage,
              speaker_profile_language: speakerLanguageCode,
              speaker_profile_language_raw: speakerLanguageRaw,
              target_language: targetLanguageCode,
              target_language_raw: targetLanguageRaw
            };
            console.log("[GladiaProxy] Sending to client:", JSON.stringify(outgoing, null, 2));
            clientWs.send(JSON.stringify(outgoing));
          }
        } else if (message.type === "realtime_processing") {
          const utteranceId = message.data?.id;
          const translatedText = extractTranslationText(message, targetLanguageCode);
          if (utteranceId && translatedText) {
            translationByUtteranceId.set(utteranceId, translatedText);
            console.log("[GladiaProxy] Cached translation for", utteranceId, ":", translatedText);
          } else {
            console.log("[GladiaProxy] Realtime processing event:", message);
          }
        } else {
          console.log("[GladiaProxy] Unhandled message type:", message.type);
        }
      } catch (error) {
        console.error("[GladiaProxy] Error processing message:", error);
      }
    });

    gladiaWs.on("close", (code, reason) => {
      const msg = reason ? reason.toString() : "Gladia socket closed";
      console.log("[GladiaProxy] Gladia socket close", code, msg);
      cleanup(`${msg} (${code || "no_code"})`);
    });
    
    gladiaWs.on("error", (err) => {
      console.log("[GladiaProxy] Gladia socket error", err?.message || err);
      cleanup("Gladia socket error");
    });

    // Forward audio chunks from client to Gladia
    clientWs.on("message", (chunk) => {
      if (closed) return;
      if (gladiaWs.readyState === WebSocket.OPEN) {
        // Send as binary audio chunk
        gladiaWs.send(chunk);
      }
    });

    clientWs.on("close", () => {
      cleanup("Client disconnected");
    });

    clientWs.on("error", (err) => {
      console.log("[GladiaProxy] Client socket error", err?.message || err);
      cleanup("Client socket error");
    });
  });

  return wss;
};

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(__dirname, "../frontend/dist");
  const indexHtml = path.join(distDir, "index.html");
  const hasFrontendBuild = fs.existsSync(indexHtml);

  if (hasFrontendBuild) {
    app.use(express.static(distDir));

    app.get("*", (req, res) => {
      res.sendFile(indexHtml);
    });
  }
}

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

// If the file is executed directly (node src/server.js, nodemon, etc.) start the server.
if (process.argv[1] === __filename) {
  const server = http.createServer(app);
  setupGladiaWsProxy(server);
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  connectDB().catch((err) => console.log("DB connection failed", err));
} else {
  // When imported as a module (serverless environment), just connect DB and export the app.
  connectDB().catch((err) => console.log("DB connection failed", err));
}

export default app;
