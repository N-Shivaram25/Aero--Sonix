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

import { GoogleCloudSTT, GoogleCloudTranslation, normalizeLanguageCode } from "./lib/googleCloud.js";

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

const setupGoogleCloudWsProxy = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== "/ws/google-cloud") return;

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
    console.log("[GoogleCloudProxy] client connected");
    
    // Get current user's profile language (this is the speaker)
    const speaker = clientWs.user;
    const speakerLanguageRaw = speaker?.profileLanguage || 'english';
    const speakerLanguageCode = normalizeLanguageCode(speakerLanguageRaw) || 'en';
    
    console.log("[GoogleCloudProxy] Speaker profile language:", speakerLanguageRaw, "->", speakerLanguageCode);
    
    // Check for Google Cloud API key
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      console.log("[GoogleCloudProxy] GOOGLE_CLOUD_API_KEY is not set");
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "GOOGLE_CLOUD_API_KEY is not set" }));
      } catch {
      }
      clientWs.close(1011, "GOOGLE_CLOUD_API_KEY is not set");
      return;
    }

    const url = clientWs.gladiaUrl;
    const targetLanguageRaw = (url?.searchParams?.get("target_language") || url?.searchParams?.get("targetLanguage") || "english").trim();
    const targetLanguageCode = normalizeLanguageCode(targetLanguageRaw) || 'en';
    
    console.log("[GoogleCloudProxy] Target language for translation:", targetLanguageRaw, "->", targetLanguageCode);

    try {
      clientWs.send(
        JSON.stringify({
          type: "meta",
          speaker_profile_language: speakerLanguageCode,
          speaker_profile_language_raw: speakerLanguageRaw,
          target_language: targetLanguageCode,
          target_language_raw: targetLanguageRaw,
        })
      );
    } catch {
    }

    // Initialize Google Cloud services
    const sttService = new GoogleCloudSTT();
    const translationService = new GoogleCloudTranslation();
    
    let audioBuffer = Buffer.alloc(0);
    let recognizeStream = null;
    let closed = false;
    
    const cleanup = (reason) => {
      if (closed) return;
      closed = true;
      console.log("[GoogleCloudProxy] cleanup", reason || "(no reason)");
      try {
        if (recognizeStream) {
          recognizeStream.destroy();
        }
      } catch {
      }
      try {
        clientWs.close(1011, reason || "Google Cloud connection closed");
      } catch {
      }
    };

    const startRecognition = () => {
      if (closed || !sttService) return;
      
      try {
        console.log("[GoogleCloudProxy] Starting recognition stream");
        
        const config = sttService.getSpeechConfig(speakerLanguageCode);
        const request = {
          config: config,
          interimResults: true,
          enableVoiceActivityEvents: true,
          voiceActivityTimeout: {
            speechStartTimeout: 2000,
            speechEndTimeout: 2000
          }
        };
        
        recognizeStream = sttService.speechClient.streamingRecognize(request)
          .on('error', (error) => {
            console.error('[GoogleCloudProxy] Recognition stream error:', error);
            try {
              clientWs.send(JSON.stringify({ type: "error", message: `Recognition error: ${error.message}` }));
            } catch {
            }
            // Restart recognition on error
            if (!closed) {
              setTimeout(startRecognition, 2000);
            }
          })
          .on('data', async (data) => {
            if (closed) return;
            
            try {
              console.log('[GoogleCloudProxy] Received recognition data:', JSON.stringify(data, null, 2));
              
              if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const originalText = result.alternatives[0]?.transcript || '';
                const isFinal = result.isFinal;
                
                if (originalText.trim()) {
                  console.log('[GoogleCloudProxy] Transcript:', originalText);
                  console.log('[GoogleCloudProxy] Is final:', isFinal);
                  
                  let translatedText = null;
                  
                  // Only translate if it's a final result and target language is different
                  if (isFinal && targetLanguageCode !== speakerLanguageCode) {
                    try {
                      const translation = await translationService.translateText(
                        originalText,
                        targetLanguageCode,
                        speakerLanguageCode
                      );
                      translatedText = translation.translatedText;
                      console.log('[GoogleCloudProxy] Translation:', translatedText);
                    } catch (translationError) {
                      console.error('[GoogleCloudProxy] Translation error:', translationError);
                    }
                  }
                  
                  if (isFinal) {
                    const outgoing = {
                      type: 'transcript',
                      original_text: originalText,
                      original_language: speakerLanguageCode,
                      translated_text: translatedText,
                      translated_language: translatedText ? targetLanguageCode : null,
                      is_final: true,
                      language_code: speakerLanguageCode,
                      speaker_profile_language: speakerLanguageCode,
                      speaker_profile_language_raw: speakerLanguageRaw,
                      target_language: targetLanguageCode,
                      target_language_raw: targetLanguageRaw
                    };
                    console.log('[GoogleCloudProxy] Sending to client:', JSON.stringify(outgoing, null, 2));
                    clientWs.send(JSON.stringify(outgoing));
                  }
                }
              }
            } catch (error) {
              console.error('[GoogleCloudProxy] Error processing recognition data:', error);
            }
          })
          .on('end', () => {
            console.log('[GoogleCloudProxy] Recognition stream ended');
            if (!closed) {
              // Restart recognition stream
              setTimeout(startRecognition, 1000);
            }
          })
          .on('close', () => {
            console.log('[GoogleCloudProxy] Recognition stream closed');
          });

      } catch (error) {
        console.error('[GoogleCloudProxy] Error starting recognition:', error);
        try {
          clientWs.send(JSON.stringify({ type: "error", message: "Failed to start recognition" }));
        } catch {
        }
        // Retry after delay
        if (!closed) {
          setTimeout(startRecognition, 2000);
        }
      }
    };

    // Start recognition
    startRecognition();

    // Forward audio chunks from client to recognition stream
    clientWs.on("message", (chunk) => {
      if (closed) return;
      
      try {
        // Handle binary audio data
        if (chunk instanceof Buffer) {
          audioBuffer = Buffer.concat([audioBuffer, chunk]);
          
          // Process audio in chunks (send every 100ms of audio)
          if (audioBuffer.length >= 3200) { // 16000 samples/sec * 2 bytes/sample * 0.1 sec
            if (recognizeStream && recognizeStream.writable) {
              recognizeStream.write({
                audio: audioBuffer
              });
            }
            audioBuffer = Buffer.alloc(0);
          }
        }
      } catch (error) {
        console.error('[GoogleCloudProxy] Error processing audio chunk:', error);
      }
    });

    clientWs.on("close", () => {
      cleanup("Client disconnected");
    });

    clientWs.on("error", (err) => {
      console.log("[GoogleCloudProxy] Client socket error", err?.message || err);
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
