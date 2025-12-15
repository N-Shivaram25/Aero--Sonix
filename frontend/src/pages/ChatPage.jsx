import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useStreamChat } from "../context/StreamChatContext";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";
import toast from "react-hot-toast";

import ChatLoader from "../components/ChatLoader";
import CallButton from "../components/CallButton";
import { startOutgoingCallRinging } from "../components/OutgoingCallManager";

const ChatPage = () => {
  const { id: targetUserId } = useParams();

  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);

  const { authUser } = useAuthUser();

  const { chatClient } = useStreamChat();

  const channelId = useMemo(() => {
    if (!authUser?._id || !targetUserId) return null;
    return [authUser._id, targetUserId].sort().join("-");
  }, [authUser?._id, targetUserId]);

  useEffect(() => {
    const initChat = async () => {
      if (!chatClient || !authUser || !targetUserId || !channelId) return;

      try {
        try {
          localStorage.setItem("aerosonix_last_chat_user", String(targetUserId));
        } catch {
          // ignore
        }

        const currChannel = chatClient.channel("messaging", channelId, {
          members: [authUser._id, targetUserId],
        });

        await currChannel.watch();
        setChannel(currChannel);
      } catch (error) {
        console.error("Error initializing chat:", error);
        toast.error("Could not connect to chat. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    initChat();
  }, [chatClient, authUser, targetUserId, channelId]);

  const handleVideoCall = () => {
    if (channel) {
      const callUrl = `${window.location.origin}/call/${channel.id}`;

      startOutgoingCallRinging({
        chatClient,
        fromUserId: authUser?._id,
        toUserId: targetUserId,
        callUrl,
      });

      channel.sendMessage({
        text: `I've started a video call. Join me here: ${callUrl}`,
      });

      toast.success("Video call link sent successfully!");
    }
  };

  if (loading || !chatClient || !channel) return <ChatLoader />;

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <Chat client={chatClient}>
        <Channel channel={channel}>
          <div className="w-full relative">
            <div className="flex items-center justify-between gap-3 p-3 border-b bg-base-200">
              <Link to="/" className="btn btn-outline btn-sm">
                Back
              </Link>
              <CallButton handleVideoCall={handleVideoCall} />
            </div>
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};
export default ChatPage;
