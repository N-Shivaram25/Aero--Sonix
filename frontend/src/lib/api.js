import { axiosInstance } from "./axios";

export const signup = async (signupData) => {
  const response = await axiosInstance.post("/auth/signup", signupData);
  try {
    const token = response?.data?.token;
    if (token) localStorage.setItem("aerosonix_token", token);
  } catch {
    // ignore
  }
  return response.data;
};

export const login = async (loginData) => {
  const response = await axiosInstance.post("/auth/login", loginData);
  try {
    const token = response?.data?.token;
    if (token) localStorage.setItem("aerosonix_token", token);
  } catch {
    // ignore
  }
  return response.data;
};
export const logout = async () => {
  const response = await axiosInstance.post("/auth/logout");
  try {
    localStorage.removeItem("aerosonix_token");
  } catch {
    // ignore
  }
  return response.data;
};

export const getAuthUser = async () => {
  try {
    const res = await axiosInstance.get("/auth/me");
    return res.data;
  } catch (error) {
    if (error?.response?.status === 401) return null;
    console.log("Error in getAuthUser:", error);
    return null;
  }
};

export const completeOnboarding = async (userData) => {
  const response = await axiosInstance.post("/auth/onboarding", userData);
  return response.data;
};

export async function getUserFriends() {
  const response = await axiosInstance.get("/users/friends");
  return response.data;
}

export async function getRecommendedUsers() {
  const response = await axiosInstance.get("/users");
  return response.data;
}

export async function getOutgoingFriendReqs() {
  const response = await axiosInstance.get("/users/outgoing-friend-requests");
  return response.data;
}

export async function sendFriendRequest(userId) {
  const response = await axiosInstance.post(`/users/friend-request/${userId}`);
  return response.data;
}

export async function getFriendRequests() {
  const response = await axiosInstance.get("/users/friend-requests");
  return response.data;
}

export async function acceptFriendRequest(requestId) {
  const response = await axiosInstance.put(`/users/friend-request/${requestId}/accept`);
  return response.data;
}

export async function cancelFriendRequest(userId) {
  const response = await axiosInstance.delete(`/users/friend-request/${userId}/cancel`);
  return response.data;
}

export async function getStreamToken() {
  const response = await axiosInstance.get("/chat/token");
  return response.data;
}

export async function adminLogin({ adminName, adminPassword }) {
  const response = await axiosInstance.post("/admin/login", { adminName, adminPassword });
  return response.data;
}

export async function adminLogout() {
  const response = await axiosInstance.post("/admin/logout");
  return response.data;
}

export async function getAdminMe() {
  const response = await axiosInstance.get("/admin/me");
  return response.data;
}

export async function getAdminStats() {
  const response = await axiosInstance.get("/admin/stats");
  return response.data;
}

export async function getAdminUsers() {
  const response = await axiosInstance.get("/admin/users");
  return response.data;
}

export async function adminDeleteUser(userId) {
  const response = await axiosInstance.delete(`/admin/users/${userId}`);
  return response.data;
}

export async function updateProfile(profileData) {
  const response = await axiosInstance.put("/users/me", profileData);
  return response.data;
}

export async function getMyVoiceProfile() {
  const response = await axiosInstance.get("/profile/me");
  return response.data;
}

export async function cloneVoice({ audio, onUploadProgress }) {
  const form = new FormData();
  if (!audio) throw new Error("audio is required");

  // Support both File and Blob
  if (audio instanceof File) {
    form.append("files", audio);
  } else {
    form.append("files", audio, "voice.webm");
  }
  form.append("name", "Aerosonix Voice");
  const response = await axiosInstance.post("/profile/clone-voice", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return response.data;
}

export async function getUserVoiceProfile(userId) {
  const response = await axiosInstance.get(`/call/voice-profile/${userId}`);
  return response.data;
}

export async function callStt({ audioBlob, speakerUserId }) {
  const form = new FormData();
  form.append("audio", audioBlob);
  form.append("speakerUserId", speakerUserId);
  const response = await axiosInstance.post("/call/stt", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function callTranslate({ text, targetLanguage, speakerUserId }) {
  const response = await axiosInstance.post("/call/translate", { text, targetLanguage, speakerUserId });
  return response.data;
}

export async function callTts({ text, speakerUserId }) {
  const response = await axiosInstance.post(
    "/call/tts",
    { text, speakerUserId },
    {
      responseType: "arraybuffer",
    }
  );
  return response;
}

export async function getAiRobotVoices() {
  const response = await axiosInstance.get("/ai-robot/voices");
  return response.data;
}

export async function uploadAiRobotVoice({ voiceName, audioFiles }) {
  const form = new FormData();
  form.append("voiceName", voiceName);
  (audioFiles || []).forEach((f) => {
    form.append("audioFiles", f);
  });
  const response = await axiosInstance.post("/ai-robot/voices/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function renameAiRobotVoice({ voiceId, voiceName }) {
  const response = await axiosInstance.put(`/ai-robot/voices/${voiceId}`, { voiceName });
  return response.data;
}

export async function getAiRobotHistory({ module }) {
  const response = await axiosInstance.get("/ai-robot/history", {
    params: { module },
  });
  return response.data;
}

export async function getAiRobotConversations({ module }) {
  const response = await axiosInstance.get("/ai-robot/conversations", {
    params: { module },
  });
  return response.data;
}

export async function createAiRobotConversation({ module, title }) {
  const response = await axiosInstance.post("/ai-robot/conversations", { module, title });
  return response.data;
}

export async function getAiRobotConversation({ conversationId }) {
  const response = await axiosInstance.get(`/ai-robot/conversations/${conversationId}`);
  return response.data;
}

export async function deleteAiRobotConversation({ conversationId }) {
  const response = await axiosInstance.delete(`/ai-robot/conversations/${conversationId}`);
  return response.data;
}

export async function aiRobotSendConversationMessage({ conversationId, message, language }) {
  const response = await axiosInstance.post(`/ai-robot/conversations/${conversationId}/message`, {
    message,
    language,
  });
  return response.data;
}

export async function aiRobotStt({ audioBlob }) {
  const form = new FormData();
  form.append("audio", audioBlob, "audio.webm");
  const response = await axiosInstance.post("/ai-robot/stt", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function aiRobotTranslate({ text, targetLanguage }) {
  const response = await axiosInstance.post("/ai-robot/translate", { text, targetLanguage });
  return response.data;
}

export async function aiRobotSendMessage({ message, module, language }) {
  const response = await axiosInstance.post("/ai-robot/message", { message, module, language });
  return response.data;
}

export async function aiRobotTts({ text, voiceId }) {
  const response = await axiosInstance.post(
    "/ai-robot/tts",
    { text, voiceId },
    {
      responseType: "arraybuffer",
    }
  );
  return response.data;
}
