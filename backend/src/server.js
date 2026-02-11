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
    console.log("[DeepgramProxy] client connected");
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "DEEPGRAM_API_KEY is not set" }));
      } catch {
      }
      try {
        clientWs.close(1011, "DEEPGRAM_API_KEY is not set");
      } catch {
      }
      return;
    }

    const url = clientWs.deepgramUrl;
    const language = (url?.searchParams?.get("language") || "en").trim();
    const wantsAutoLang = language.toLowerCase() === "auto";

    const dgUrl =
      `wss://api.deepgram.com/v1/listen?model=general` +
      `&punctuate=true&smart_format=true&interim_results=true` +
      (wantsAutoLang ? `&detect_language=true` : `&language=${encodeURIComponent(language)}`) +
      `&encoding=linear16&sample_rate=16000&channels=1`;

    console.log("[DeepgramProxy] Connecting to Deepgram with URL:", dgUrl.replace(/token=[^&]*/, "token=REDACTED"));
    const dgWs = new WebSocket(dgUrl, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    let dgOpened = false;
    const pendingChunks = [];
    const maxPendingChunks = 60;

    const openTimeout = setTimeout(() => {
      if (dgOpened) return;
      console.log("[DeepgramProxy] deepgram connection timeout");
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "Deepgram connection timeout" }));
      } catch {
      }
      cleanup("Deepgram connection timeout");
    }, 8000);

    let closed = false;
    const cleanup = (reason) => {
      if (closed) return;
      closed = true;
      console.log("[DeepgramProxy] cleanup", reason || "(no reason)");
      try {
        clearTimeout(openTimeout);
      } catch {
      }
      try {
        dgWs.close();
      } catch {
      }
      try {
        clientWs.close(1011, reason || "Deepgram connection closed");
      } catch {
      }
    };

    dgWs.on("open", () => {
      dgOpened = true;
      console.log("[DeepgramProxy] deepgram socket open");
      try {
        clearTimeout(openTimeout);
      } catch {
      }
      
      // Send a small silence chunk to test the connection
      const silenceChunk = Buffer.alloc(1024); // 1024 bytes of silence
      try {
        dgWs.send(silenceChunk);
        console.log("[DeepgramProxy] Sent initial silence chunk");
      } catch (error) {
        console.error("[DeepgramProxy] Failed to send silence chunk:", error);
      }
      
      while (pendingChunks.length && dgWs.readyState === WebSocket.OPEN) {
        const chunk = pendingChunks.shift();
        try {
          dgWs.send(chunk);
        } catch {
          cleanup("Failed to flush audio to Deepgram");
          break;
        }
      }
    });

    dgWs.on("message", (data) => {
      if (closed) return;
      try {
        clientWs.send(data);
      } catch {
        cleanup();
      }
    });

    dgWs.on("unexpected-response", (req, res) => {
      const dgRequestId = res?.headers?.["dg-request-id"];
      const dgError = res?.headers?.["dg-error"];
      console.log(
        "[DeepgramProxy] deepgram unexpected-response",
        res?.statusCode,
        "dg-request-id:",
        dgRequestId,
        "dg-error:",
        dgError
      );

      try {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString("utf8");
        });
        res.on("end", () => {
          if (body) console.log("[DeepgramProxy] deepgram unexpected-response body", body);

          try {
            clientWs.send(
              JSON.stringify({
                type: "error",
                message: `Deepgram unexpected response: ${res?.statusCode || "unknown"}${dgError ? ` (${dgError})` : ""}`,
              })
            );
          } catch {
          }

          cleanup(`Deepgram unexpected response (${res?.statusCode || "unknown"})`);
        });
      } catch {
      }

      if (!res?.on) {
        try {
          clientWs.send(
            JSON.stringify({
              type: "error",
              message: `Deepgram unexpected response: ${res?.statusCode || "unknown"}${dgError ? ` (${dgError})` : ""}`,
            })
          );
        } catch {
        }
        cleanup(`Deepgram unexpected response (${res?.statusCode || "unknown"})`);
      }
    });

    dgWs.on("close", (code, reason) => {
      const msg = reason ? reason.toString() : "Deepgram socket closed";
      console.log("[DeepgramProxy] deepgram socket close", code, msg);
      cleanup(`${msg} (${code || "no_code"})`);
    });
    dgWs.on("error", (err) => {
      console.log("[DeepgramProxy] deepgram socket error", err?.message || err);
      cleanup("Deepgram socket error");
    });

    let gotAnyAudio = false;
    let audioChunkCount = 0;
    clientWs.on("message", (chunk) => {
      if (closed) return;
      if (!gotAnyAudio) {
        gotAnyAudio = true;
        console.log("[DeepgramProxy] first audio chunk", typeof chunk, chunk?.length, chunk.constructor.name);
      }
      audioChunkCount++;
      
      // Log every 100 chunks to track data flow
      if (audioChunkCount % 100 === 0) {
        console.log("[DeepgramProxy] Processed audio chunk #" + audioChunkCount + ", size: " + chunk?.length + ", DG ready: " + (dgWs.readyState === WebSocket.OPEN));
      }
      
      if (dgWs.readyState !== WebSocket.OPEN) {
        if (pendingChunks.length < maxPendingChunks) {
          pendingChunks.push(chunk);
          console.log("[DeepgramProxy] Queued chunk, pending:", pendingChunks.length);
        }
        return;
      }
      try {
        dgWs.send(chunk);
      } catch (error) {
        console.error("[DeepgramProxy] Failed to forward audio to Deepgram:", error);
        cleanup("Failed to forward audio to Deepgram");
      }
    });

    clientWs.on("close", (code, reason) => {
      const msg = reason ? reason.toString() : "Client disconnected";
      console.log("[DeepgramProxy] client close", code, msg);
      cleanup(msg);
    });
    clientWs.on("error", (err) => {
      console.log("[DeepgramProxy] client socket error", err?.message || err);
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
