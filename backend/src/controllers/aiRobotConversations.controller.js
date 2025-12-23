import AiRobotConversation from "../models/AiRobotConversation.js";
import { getOpenAIClient } from "../lib/openaiClient.js";

const DEFAULT_MODULE = "general";

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
  const lang = String(language || "").trim();
  const langClause = lang ? `Respond in ${lang}.` : "Respond in the same language as the user.";

  if (module === "interview") {
    return `You are AI Robot on the ${pageName} page, an interview coach. Ask realistic interview questions, follow up based on the user's answers, and give concise feedback and improvement tips. ${langClause}`;
  }
  if (module === "english_fluency") {
    return `You are AI Robot on the ${pageName} page, an English fluency coach. Help the user speak clearly and naturally. Correct grammar gently, suggest better phrasing, and ask short follow-up questions to keep them speaking. ${langClause}`;
  }
  if (module === "language_learning") {
    return `You are AI Robot on the ${pageName} page, a language tutor. Teach step-by-step with examples, short exercises, and quick corrections. Keep responses concise and interactive. ${langClause}`;
  }
  if (module === "programming") {
    return `You are AI Robot on the ${pageName} page, a programming mentor. Ask clarifying questions, propose clean solutions, and explain concepts clearly. When giving code, keep it minimal and correct. ${langClause}`;
  }

  return `You are AI Robot on the ${pageName} page, a helpful assistant. ${langClause}`;
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

    const language = String(req.body?.language || "").trim();

    const convo = await AiRobotConversation.findOne({ _id: id, userId }).select("module title messages");
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    const module = normalizeModule(convo.module);
    const systemPrompt = buildSystemPrompt({ module, language });

    const prior = Array.isArray(convo.messages) ? convo.messages : [];
    const trimmedContext = prior.slice(-20).map((m) => ({ role: m.role, content: m.text }));

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
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
