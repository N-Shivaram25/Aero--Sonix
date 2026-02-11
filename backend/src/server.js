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

// Sarvam translation function
async function translateText(text, sourceLang, targetLang) {
  try {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.error("[Translation] SARVAM_API_KEY not set");
      return null;
    }

    const response = await fetch('https://api.sarvam.ai/translate/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Subscription-Key': apiKey,
      },
      body: JSON.stringify({
        input: text,
        source_language_code: sourceLang,
        target_language_code: targetLang,
        mode: "formal",
        model: "sarvam-translate:v1"
      })
    });

    if (!response.ok) {
      console.error("[Translation] API error:", response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    return result.translated_text || null;
  } catch (error) {
    console.error("[Translation] Error:", error);
    return null;
  }
}

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

const setupDeepgramWsProxy = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== "/ws/deepgram") return;

      const token = url.searchParams.get("token") || "";
      const user = await getUserFromToken(token);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = user;
        ws.deepgramUrl = url;
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", async (clientWs) => {
    console.log("[SarvamProxy] client connected");
    
    // Map language codes to Sarvam format
    const languageMap = {
      'en': 'en-IN',
      'te': 'te-IN',
      'hi': 'hi-IN',
      'ta': 'ta-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'pa': 'pa-IN',
      'gu': 'gu-IN',
      'mr': 'mr-IN',
      'bn': 'bn-IN',
      'or': 'or-IN',
      'as': 'as-IN'
    };
    
    // Get user profile language for translation
    const user = clientWs.user;
    const userLanguage = user?.profileLanguage || 'en'; // Default to English if not set
    const userLanguageCode = languageMap[userLanguage] || 'en-IN';
    
    console.log("[SarvamProxy] User profile language:", userLanguage, "->", userLanguageCode);
    
    // Check for Sarvam API key
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.log("[SarvamProxy] SARVAM_API_KEY is not set");
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "SARVAM_API_KEY is not set" }));
      } catch {
      }
      clientWs.close(1011, "SARVAM_API_KEY is not set");
      return;
    }

    const url = clientWs.sarvamUrl;
    const language = (url?.searchParams?.get("language") || "en").trim();
    const wantsAutoLang = language.toLowerCase() === "auto";

    const sarvamLanguage = languageMap[language] || 'en-IN';
    console.log("[SarvamProxy] Original language:", language, "-> mapped to:", sarvamLanguage);

    const sarvamUrl = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=verbatim&language-code=${encodeURIComponent(sarvamLanguage)}&sample_rate=16000&input_audio_codec=pcm_s16le`;

    console.log("[SarvamProxy] Connecting to Sarvam with URL:", sarvamUrl);
    console.log("[SarvamProxy] Mode: verbatim (should preserve original language exactly)");
    const sarvamWs = new WebSocket(sarvamUrl, {
      headers: {
        'Api-Subscription-Key': apiKey,
      },
    });

    let sarvamOpened = false;
    const pendingChunks = [];
    const maxPendingChunks = 60;

    const openTimeout = setTimeout(() => {
      if (sarvamOpened) return;
      console.log("[SarvamProxy] sarvam connection timeout");
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "Sarvam connection timeout" }));
      } catch {
      }
      cleanup("Sarvam connection timeout");
    }, 8000);

    let closed = false;
    const cleanup = (reason) => {
      if (closed) return;
      closed = true;
      console.log("[SarvamProxy] cleanup", reason || "(no reason)");
      try {
        clearTimeout(openTimeout);
      } catch {
      }
      try {
        sarvamWs.close();
      } catch {
      }
      try {
        clientWs.close(1011, reason || "Sarvam connection closed");
      } catch {
      }
    };

    sarvamWs.on("open", () => {
      sarvamOpened = true;
      console.log("[SarvamProxy] sarvam socket open");
      try {
        clearTimeout(openTimeout);
      } catch {
      }
      
      // Send initial config message
      try {
        sarvamWs.send(JSON.stringify({
          type: "config",
          prompt: ""
        }));
        console.log("[SarvamProxy] Sent initial config message");
      } catch (error) {
        console.error("[SarvamProxy] Failed to send config message:", error);
      }
      
      // Send any pending chunks
      while (pendingChunks.length && sarvamWs.readyState === WebSocket.OPEN) {
        const chunk = pendingChunks.shift();
        const base64Audio = chunk.toString('base64');
        try {
          sarvamWs.send(JSON.stringify({
            audio: {
              data: base64Audio,
              sample_rate: 16000,
              encoding: "audio/wav"
            }
          }));
        } catch {
          cleanup("Failed to flush audio to Sarvam");
          break;
        }
      }
    });

    sarvamWs.on("message", async (data) => {
      if (closed) return;
      try {
        const message = JSON.parse(data.toString());
        console.log("[SarvamProxy] Received message:", message);
        
        // Handle transcription endpoint responses
        if (message.type === 'data' && message.data?.transcript) {
          const originalText = message.data.transcript;
          const detectedLanguage = message.data.language_code;
          
          console.log("[SarvamProxy] Forwarding transcript:", originalText);
          console.log("[SarvamProxy] Language detected:", detectedLanguage);
          
          // Only translate if the detected language is different from user's profile language
          let translatedText = null;
          if (detectedLanguage && detectedLanguage !== userLanguageCode) {
            console.log("[SarvamProxy] Translating from", detectedLanguage, "to", userLanguageCode);
            translatedText = await translateText(originalText, detectedLanguage, userLanguageCode);
            if (translatedText) {
              console.log("[SarvamProxy] Translation result:", translatedText);
            }
          }
          
          // Send both original and translated text
          clientWs.send(JSON.stringify({
            type: 'transcript',
            original_text: originalText,
            original_language: detectedLanguage,
            translated_text: translatedText,
            translated_language: translatedText ? userLanguageCode : null,
            is_final: true,
            language_code: detectedLanguage
          }));
          
        } else if (message.type === 'transcript' && message.data?.transcript) {
          // Alternative format for transcription endpoint
          const originalText = message.data.transcript;
          const detectedLanguage = message.data.language_code;
          
          console.log("[SarvamProxy] Forwarding transcript (alt format):", originalText);
          console.log("[SarvamProxy] Language detected:", detectedLanguage);
          
          // Only translate if the detected language is different from user's profile language
          let translatedText = null;
          if (detectedLanguage && detectedLanguage !== userLanguageCode) {
            console.log("[SarvamProxy] Translating from", detectedLanguage, "to", userLanguageCode);
            translatedText = await translateText(originalText, detectedLanguage, userLanguageCode);
            if (translatedText) {
              console.log("[SarvamProxy] Translation result:", translatedText);
            }
          }
          
          // Send both original and translated text
          clientWs.send(JSON.stringify({
            type: 'transcript',
            original_text: originalText,
            original_language: detectedLanguage,
            translated_text: translatedText,
            translated_language: translatedText ? userLanguageCode : null,
            is_final: true,
            language_code: detectedLanguage
          }));
          
        } else if (message.type === 'events') {
          // Handle VAD events (speech start/end)
          console.log("[SarvamProxy] Speech event:", message.data.signal_type);
        }
      } catch (error) {
        console.error("[SarvamProxy] Error processing message:", error);
      }
    });

    sarvamWs.on("close", (code, reason) => {
      const msg = reason ? reason.toString() : "Sarvam socket closed";
      console.log("[SarvamProxy] sarvam socket close", code, msg);
      cleanup(`${msg} (${code || "no_code"})`);
    });
    
    sarvamWs.on("error", (err) => {
      console.log("[SarvamProxy] sarvam socket error", err?.message || err);
      cleanup("Sarvam socket error");
    });

    let gotAnyAudio = false;
    let audioChunkCount = 0;
    clientWs.on("message", (chunk) => {
      if (closed) return;
      if (!gotAnyAudio) {
        gotAnyAudio = true;
        console.log("[SarvamProxy] first audio chunk", typeof chunk, chunk?.length, chunk.constructor.name);
      }
      audioChunkCount++;
      
      // Log every 100 chunks to track data flow
      if (audioChunkCount % 100 === 0) {
        console.log("[SarvamProxy] Processed audio chunk #" + audioChunkCount + ", size: " + chunk?.length + ", Sarvam ready: " + (sarvamWs.readyState === WebSocket.OPEN));
      }
      
      if (sarvamWs.readyState !== WebSocket.OPEN) {
        if (pendingChunks.length < maxPendingChunks) {
          pendingChunks.push(chunk);
          console.log("[SarvamProxy] Queued chunk, pending:", pendingChunks.length);
        }
        return;
      }
      
      try {
        // Convert PCM chunk to base64 and send as Sarvam audio message
        const base64Audio = chunk.toString('base64');
        sarvamWs.send(JSON.stringify({
          audio: {
            data: base64Audio,
            sample_rate: 16000,
            encoding: "audio/wav"
          }
        }));
      } catch (error) {
        console.error("[SarvamProxy] Failed to forward audio to Sarvam:", error);
        cleanup("Failed to forward audio to Sarvam");
      }
    });

    clientWs.on("close", (code, reason) => {
      const msg = reason ? reason.toString() : "Client disconnected";
      console.log("[SarvamProxy] client close", code, msg);
      cleanup(msg);
    });
    clientWs.on("error", (err) => {
      console.log("[SarvamProxy] client socket error", err?.message || err);
      cleanup("Client socket error");
    });
  });
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
  setupDeepgramWsProxy(server);
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  connectDB().catch((err) => console.log("DB connection failed", err));
} else {
  // When imported as a module (serverless environment), just connect DB and export the app.
  connectDB().catch((err) => console.log("DB connection failed", err));
}

export default app;
