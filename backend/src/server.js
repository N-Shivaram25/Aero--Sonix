import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import http from "http";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import axios from "axios";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import adminRoutes from "./routes/admin.route.js";
import profileRoutes from "./routes/profile.route.js";
import callRoutes from "./routes/call.route.js";
import aiRobotRoutes from "./routes/aiRobot.route.js";

import { connectDB } from "./lib/db.js";
import User from "./models/User.js";

import { createDeepgramConnection } from "./lib/deepgram.js";
import { toDeepgramLanguageCode } from "./lib/languageCodes.js";

const app = express();
const PORT = process.env.PORT || 5001;

const __dirname = path.resolve();

const toBaseLang = (code) => {
  const v = String(code || "").trim();
  if (!v) return "";
  return v.split("-")[0];
};

const translationCache = new Map();
const translateWithMyMemory = async ({ text, sourceLang, targetLang }) => {
  const clean = String(text || "").trim();
  if (!clean) return "";

  const src = toBaseLang(sourceLang) || "";
  const dst = toBaseLang(targetLang) || "";
  if (!src || !dst || src === dst) return "";

  const cacheKey = `${src}|${dst}|${clean}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${src}|${dst}`;
  const resp = await axios.get(url, { timeout: 8000 });
  const translated = String(resp?.data?.responseData?.translatedText || "").trim();
  if (!translated) return "";

  try {
    if (translationCache.size > 2000) translationCache.clear();
  } catch {
  }
  translationCache.set(cacheKey, translated);
  return translated;
};

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
  "https://aero-sonix-stream.vercel.app",
].map(normalizeOrigin);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.indexOf(normalized) !== -1 || String(normalized || "").endsWith(".vercel.app")) {
      callback(null, true);
    } else {
      console.log('CORS: Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
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

const setupGoogleCloudWsProxy = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  const callRooms = new Map();

  // Set up ping interval to detect dead connections
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log('[WebSocket] Terminating dead connection');
        ws.terminate();
        return;
      }
      
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (error) {
        console.error('[WebSocket] Error sending ping:', error);
        ws.terminate();
      }
    });
  }, 30000); // 30 seconds

  // Clean up ping interval on server close
  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  const getRoom = (callId) => {
    const key = String(callId || "").trim();
    if (!key) return null;
    if (!callRooms.has(key)) callRooms.set(key, new Map());
    return callRooms.get(key);
  };

  const removeFromRoom = (callId, userId) => {
    const room = callRooms.get(callId);
    if (!room) return;
    room.delete(userId);
    if (room.size === 0) callRooms.delete(callId);
  };

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      console.log('[WebSocket] Upgrade request for:', url.pathname);
      
      if (url.pathname !== "/ws/deepgram") {
        console.log('[WebSocket] Not handling path:', url.pathname);
        return;
      }

      const token = url.searchParams.get("token") || "";
      console.log('[WebSocket] Token present:', !!token);
      
      const user = await getUserFromToken(token);
      if (!user) {
        console.log('[WebSocket] Invalid token, closing connection');
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      console.log('[WebSocket] User authenticated:', user.fullName);
      
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.user = user;
        ws.gladiaUrl = url;
        console.log('[WebSocket] WebSocket upgraded successfully');
        wss.emit("connection", ws, req);
      });
    } catch (error) {
      console.error('[WebSocket] Error during upgrade:', error);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", async (clientWs) => {
    console.log("[DeepgramProxy] Client connected");
    
    // Set up ping/pong to keep connection alive
    clientWs.isAlive = true;
    clientWs.on('pong', () => {
      clientWs.isAlive = true;
    });
    
    // Get current user's profile language (this is the speaker)
    const speaker = clientWs.user;
    let speakerLanguageRaw = speaker?.nativeLanguage || 'english';
    
    // If user doesn't have nativeLanguage in profile, try to fetch full profile
    if (!speaker?.nativeLanguage && speaker?._id) {
      try {
        const fullUser = await User.findById(speaker._id).select('nativeLanguage fullName');
        if (fullUser?.nativeLanguage) {
          speakerLanguageRaw = fullUser.nativeLanguage;
          console.log('[GoogleCloudProxy] Fetched nativeLanguage from profile:', speakerLanguageRaw);
        }
      } catch (profileError) {
        console.error('[GoogleCloudProxy] Error fetching user profile:', profileError);
      }
    }
    
    const speakerLanguageCode = toDeepgramLanguageCode(speakerLanguageRaw) || 'en';
    
    console.log("[DeepgramProxy] Speaker profile language:", speakerLanguageRaw, "->", speakerLanguageCode);
    
    const url = clientWs.gladiaUrl;
    const callId = String(url?.searchParams?.get("callId") || url?.searchParams?.get("call_id") || "").trim();
    
    if (!callId) {
      console.error("[DeepgramProxy] Missing callId in WebSocket URL");
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "Missing callId" }));
      } catch {
      }
      clientWs.close(1008, "Missing callId");
      return;
    }
    
    const room = getRoom(callId);
    if (!room) {
      console.error("[DeepgramProxy] Could not create room for callId:", callId);
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "Could not create room" }));
      } catch {
      }
      clientWs.close(1008, "Could not create room");
      return;
    }

    // Profile-to-profile translation: each listener receives translation in their own profile nativeLanguage.
    // Keep reading target_language for backward compatibility, but prefer profile language.
    const myTargetLanguageRaw = (speakerLanguageRaw || url?.searchParams?.get("target_language") || url?.searchParams?.get("targetLanguage") || "english").trim();
    const myTargetLanguageCode = toDeepgramLanguageCode(myTargetLanguageRaw) || 'en';

    const myUserId = String(speaker?._id || speaker?.id || "");
    const myUserName = String(speaker?.fullName || "");

    console.log("[DeepgramProxy] User joined room:", {
      callId,
      userId: myUserId,
      userName: myUserName,
      speakerLanguage: speakerLanguageRaw,
      targetLanguage: myTargetLanguageRaw
    });

    // Notify existing participants about new user
    for (const [, peer] of room.entries()) {
      try {
        // Send peer info to new client
        clientWs.send(
          JSON.stringify({
            type: "peer",
            userId: peer.userId,
            fullName: peer.fullName,
            nativeLanguage: peer.nativeLanguage,
          })
        );

        // Send new user info to existing peer
        peer.ws.send(
          JSON.stringify({
            type: "peer",
            userId: myUserId,
            fullName: myUserName,
            nativeLanguage: speakerLanguageRaw,
          })
        );
        
        console.log('[DeepgramProxy] Notified peer about new user:', {
          from: myUserName,
          to: peer.fullName,
          language: speakerLanguageRaw
        });
      } catch (error) {
        console.error("[DeepgramProxy] Error in peer notification:", error);
      }
    }

    room.set(myUserId, {
      userId: myUserId,
      fullName: myUserName,
      nativeLanguage: speakerLanguageRaw,
      targetLanguageRaw: myTargetLanguageRaw,
      targetLanguageCode: myTargetLanguageCode,
      ws: clientWs,
    });

    console.log("[DeepgramProxy] Room participants:", room.size);

    try {
      clientWs.send(
        JSON.stringify({
          type: "meta",
          speaker_profile_language: speakerLanguageCode,
          speaker_profile_language_raw: speakerLanguageRaw,
          target_language: myTargetLanguageCode,
          target_language_raw: myTargetLanguageRaw,
          call_id: callId,
        })
      );
    } catch (error) {
      console.error("[DeepgramProxy] Error sending meta info:", error);
    }

    // Deepgram STT (streaming)
    let dg = null;
    let closed = false;
    
    const cleanup = (reason) => {
      if (closed) return;
      closed = true;
      console.log("[DeepgramProxy] cleanup", reason || "(no reason)");
      try {
        if (dg?.connection) {
          try {
            dg.connection.close();
          } catch {
          }
          try {
            dg.connection.terminate?.();
          } catch {
          }
        }
      } catch {
      }
      try {
        clientWs.close(1011, reason || "Deepgram connection closed");
      } catch {
      }
    };

    try {
      dg = createDeepgramConnection({ language: speakerLanguageCode || "multi" });
    } catch (error) {
      console.error("[DeepgramProxy] Failed to initialize Deepgram:", error);
      try {
        clientWs.send(JSON.stringify({ type: "error", message: error?.message || "Deepgram init failed" }));
      } catch {
      }
      cleanup("Deepgram init failed");
      return;
    }

    const dgConn = dg.connection;
    const Events = dg.LiveTranscriptionEvents;

    dgConn.on(Events.Open, () => {
      console.log("[DeepgramProxy] Deepgram connection opened");
    });

    dgConn.on(Events.Transcript, async (raw) => {
      if (closed) return;
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
        if (!text) return;

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          return;
        }

        // We only care about Results messages.
        if (String(data?.type || "") !== "Results") return;

        const alt = data?.channel?.alternatives?.[0];
        const originalText = String(alt?.transcript || "");
        if (!originalText.trim()) return;

        const isFinal = Boolean(data?.is_final);
        const speechFinal = Boolean(data?.speech_final);
        const confidence = typeof alt?.confidence === "number" ? alt.confidence : 0;

        const currentRoom = getRoom(callId);
        if (!currentRoom) return;

        const sourceLang = speakerLanguageCode;
        const sourceBase = toBaseLang(sourceLang);

        for (const [, peer] of currentRoom.entries()) {
          if (!peer?.ws || peer.userId === myUserId) continue;

          const peerTargetCode = toDeepgramLanguageCode(peer.nativeLanguage) || 'en';
          const targetBase = toBaseLang(peerTargetCode);
          const shouldTranslate = sourceBase && targetBase && sourceBase !== targetBase;

          // To improve translation quality (and reduce API calls), translate only when
          // Deepgram marks the segment as final.
          let translatedText = null;
          if ((isFinal || speechFinal) && shouldTranslate) {
            try {
              const t = await translateWithMyMemory({
                text: originalText,
                sourceLang: sourceLang,
                targetLang: peerTargetCode,
              });
              translatedText = t || null;
            } catch (e) {
              console.error("[MyMemory] Translation failed", e?.message || e);
            }
          }

          const outgoing = {
            type: "transcript",
            original_text: originalText,
            original_language: speakerLanguageCode,
            translated_text: translatedText,
            translated_language: translatedText ? peerTargetCode : null,
            is_final: isFinal,
            speech_final: speechFinal,
            confidence,
            stability: confidence,
            language_code: speakerLanguageCode,
            speaker_profile_language: speakerLanguageCode,
            speaker_profile_language_raw: speakerLanguageRaw,
            target_language: peerTargetCode,
            target_language_raw: peer.nativeLanguage,
            speaker_user_id: myUserId,
            speaker_full_name: myUserName,
            call_id: callId,
          };

          try {
            peer.ws.send(JSON.stringify(outgoing));
          } catch {
          }
        }
      } catch (err) {
        console.error("[DeepgramProxy] Transcript processing error:", err);
      }
    });

    dgConn.on(Events.Error, (err) => {
      const msg =
        String(err?.message || "").trim() ||
        String(err?.error?.message || "").trim() ||
        String(err?.error || "").trim() ||
        "Deepgram error";
      try {
        console.error("[DeepgramProxy] Deepgram error:", {
          message: msg,
          name: err?.name,
          type: err?.type,
          code: err?.code,
        });
      } catch {
        console.error("[DeepgramProxy] Deepgram error:", err);
      }
      try {
        if (err?.error?.stack) console.error("[DeepgramProxy] Deepgram error stack:", err.error.stack);
      } catch {
      }
      try {
        clientWs.send(JSON.stringify({ type: "error", message: msg }));
      } catch {
      }
    });

    dgConn.on(Events.Close, (code, reason) => {
      let reasonText = "";
      try {
        reasonText = Buffer.isBuffer(reason) ? reason.toString("utf8") : String(reason || "");
      } catch {
        reasonText = "";
      }
      console.log("[DeepgramProxy] Deepgram connection closed", { code, reason: reasonText });
    });

    // Forward audio chunks from client to recognition stream
    clientWs.on("message", (chunk) => {
      if (closed) return;
      
      try {
        // Handle binary audio data - write directly to stream
        if (chunk instanceof Buffer) {
          try {
            if (dgConn?.readyState === WebSocket.OPEN) {
              dgConn.send(chunk);
            }
          } catch {
          }
        }
        
        // Handle text messages (like request_peers)
        if (typeof chunk === 'string') {
          try {
            const message = JSON.parse(chunk);
            if (message.type === 'request_peers') {
              // Send current room participants to the requesting client
              const currentRoom = getRoom(callId);
              if (currentRoom) {
                for (const [, peer] of currentRoom.entries()) {
                  if (peer.userId !== myUserId) {
                    try {
                      clientWs.send(JSON.stringify({
                        type: "peer",
                        userId: peer.userId,
                        fullName: peer.fullName,
                        nativeLanguage: peer.nativeLanguage,
                      }));
                    } catch (error) {
                      console.error('[DeepgramProxy] Error sending peer info:', error);
                    }
                  }
                }
              }
            }
          } catch (parseError) {
            // Ignore JSON parse errors for binary data
          }
        }
      } catch (error) {
        console.error('[DeepgramProxy] Error processing message:', error);
      }
    });

    clientWs.on("close", () => {
      try {
        removeFromRoom(callId, myUserId);
      } catch {
      }
      cleanup("Client disconnected");
    });

    clientWs.on("error", (err) => {
      console.log("[DeepgramProxy] Client socket error", err?.message || err);
      try {
        removeFromRoom(callId, myUserId);
      } catch {
      }
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
  setupGoogleCloudWsProxy(server);
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  connectDB().catch((err) => console.log("DB connection failed", err));
} else {
  // When imported as a module (serverless environment), just connect DB and export the app.
  connectDB().catch((err) => console.log("DB connection failed", err));
}

export default app;
