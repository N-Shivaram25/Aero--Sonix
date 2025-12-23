import mongoose from "mongoose";

const aiRobotConversationMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ["system", "user", "assistant"],
    },
    text: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const aiRobotConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    module: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "New chat",
    },
    messages: {
      type: [aiRobotConversationMessageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

aiRobotConversationSchema.index({ userId: 1, module: 1, updatedAt: -1 });

const AiRobotConversation = mongoose.model("AiRobotConversation", aiRobotConversationSchema);

export default AiRobotConversation;
