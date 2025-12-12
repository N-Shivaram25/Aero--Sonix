import { StreamChat } from "stream-chat";
import "dotenv/config";

const apiKey = process.env.STEAM_API_KEY;
const apiSecret = process.env.STEAM_API_SECRET;

let streamClient = null;
if (apiKey && apiSecret) {
  streamClient = StreamChat.getInstance(apiKey, apiSecret);
} else {
  console.error("Stream API key or Secret is missing");
}

export const upsertStreamUser = async (userData) => {
  try {
    if (!streamClient) return userData;
    await streamClient.upsertUsers([userData]);
    return userData;
  } catch (error) {
    console.error("Error upserting Stream user:", error);
  }
};

export const generateStreamToken = (userId) => {
  try {
    if (!streamClient) return null;
    // ensure userId is a string
    const userIdStr = userId.toString();
    return streamClient.createToken(userIdStr);
  } catch (error) {
    console.error("Error generating Stream token:", error);
  }
};
