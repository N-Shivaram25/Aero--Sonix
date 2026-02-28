import AiRobotConversation from "../models/AiRobotConversation.js";
import Cerebras from '@cerebras/cerebras_cloud_sdk';

const DEFAULT_MODULE = "general";
const CEREBRAS_MODEL = "gpt-oss-120b";

const normalizeModule = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return DEFAULT_MODULE;
  if (v === "home") return "general";
  const allowed = new Set([
    "general",
    "interview",
    "english_fluency",
    "language_learning",
    "programming",
  ]);
  return allowed.has(v) ? v : DEFAULT_MODULE;
};

const moduleLabel = (module) => {
  if (module === "interview") return "Interview";
  if (module === "english_fluency") return "English Fluency";
  if (module === "language_learning") return "Language Learning";
  if (module === "programming") return "Programming";
  return "Home";
};

const buildSystemPrompt = ({ module, language }) => {
  const pageName = moduleLabel(module);
  const lang = String(language || "English").trim();
  const langClause = `You MUST respond only in ${lang}. DO NOT speak in English unless specifically asked. Respond in the native script of the selected language.`;

  if (module === "interview") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, an expert interview coach. Ask realistic questions, provide concise feedback, and keep the user engaged. ${langClause}`;
  }
  if (module === "english_fluency") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, a fluency coach. Correct grammar naturally and suggest better phrasing. ${langClause}`;
  }
  if (module === "language_learning") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, a dedicated language tutor. Teach with examples and corrections. ${langClause}`;
  }
  if (module === "programming") {
    return `You are AeroSonix AI Assistant on the ${pageName} page, a technical mentor. Provide clean, correct code and explain concepts simply. ${langClause}`;
  }

  return `You are AeroSonix AI Assistant, a helpful and professional assistant. ${langClause}`;
};

const toTitleFromMessage = (message) => {
  const raw = String(message || "").trim();
  if (!raw) return "New chat";
  const oneLine = raw.replace(/\s+/g, " ");
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}...` : oneLine;
};

export async function listConversations(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const module = normalizeModule(req.query?.module);

    const conversations = await AiRobotConversation.find({ userId, module })
      .select("title createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      module,
      conversations: conversations.map((c) => ({
        id: c._id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error in listConversations controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function createConversation(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const module = normalizeModule(req.body?.module);
    const title = String(req.body?.title || "New chat").trim() || "New chat";

    const created = await AiRobotConversation.create({ userId, module, title });

    return res.status(201).json({
      success: true,
      conversation: {
        id: created._id,
        module: created.module,
        title: created.title,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error in createConversation controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getConversation(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params?.conversationId || "").trim();
    if (!id) return res.status(400).json({ message: "conversationId is required" });

    const convo = await AiRobotConversation.findOne({ _id: id, userId }).select(
      "title module messages createdAt updatedAt"
    );

    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    return res.status(200).json({
      success: true,
      conversation: {
        id: convo._id,
        title: convo.title,
        module: convo.module,
        messages: convo.messages || [],
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error in getConversation controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function deleteConversation(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params?.conversationId || "").trim();
    if (!id) return res.status(400).json({ message: "conversationId is required" });

    const deleted = await AiRobotConversation.findOneAndDelete({ _id: id, userId }).select("_id");

    if (!deleted) return res.status(404).json({ message: "Conversation not found" });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in deleteConversation controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendConversationMessage(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params?.conversationId || "").trim();
    if (!id) return res.status(400).json({ message: "conversationId is required" });

    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ message: "message is required" });

    const language = String(req.body?.language || "English").trim();

    const convo = await AiRobotConversation.findOne({ _id: id, userId }).select("module title messages");
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    const module = normalizeModule(convo.module);
    const systemPrompt = buildSystemPrompt({ module, language });

    const prior = Array.isArray(convo.messages) ? convo.messages : [];
    const trimmedContext = prior.slice(-15).map((m) => ({ role: m.role, content: m.text }));

    const apiKey = (process.env.CEREBRAS_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ message: "Cerebras API key missing on server." });
    }

    const cerebras = new Cerebras({ apiKey });
    const completion = await cerebras.chat.completions.create({
      model: CEREBRAS_MODEL,
      temperature: 0.7,
      max_completion_tokens: 4096,
      messages: [{ role: "system", content: systemPrompt }, ...trimmedContext, { role: "user", content: message }],
    });

    const reply = completion?.choices?.[0]?.message?.content?.trim() || "";
    const nextTitle = convo.title === "New chat" ? toTitleFromMessage(message) : convo.title;

    await AiRobotConversation.findOneAndUpdate(
      { _id: id, userId },
      {
        $set: { title: nextTitle },
        $push: {
          messages: {
            $each: [
              { role: "user", text: message },
              { role: "assistant", text: reply || "" },
            ],
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      module,
      reply,
      title: nextTitle,
    });
  } catch (error) {
    console.error("Error in sendConversationMessage controller", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
