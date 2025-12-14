import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StreamChat } from "stream-chat";
import { getStreamToken } from "../lib/api";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const StreamChatContext = createContext(null);

export const StreamChatProvider = ({ authUser, children }) => {
  const [chatClient, setChatClient] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [onlineMap, setOnlineMap] = useState({});

  const clientRef = useRef(null);
  const connectedUserIdRef = useRef(null);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
    retry: false,
  });

  useEffect(() => {
    const connect = async () => {
      if (!authUser || !tokenData?.token || !STREAM_API_KEY) return;
      if (connectedUserIdRef.current === authUser._id && clientRef.current) {
        setChatClient(clientRef.current);
        return;
      }

      setIsConnecting(true);
      try {
        if (clientRef.current) {
          try {
            await clientRef.current.disconnectUser();
          } catch {
            // ignore
          }
        }

        const client = StreamChat.getInstance(STREAM_API_KEY);

        await client.connectUser(
          {
            id: authUser._id,
            name: authUser.fullName,
            image: authUser.profilePic,
          },
          tokenData.token
        );

        setOnlineMap((prev) => ({ ...prev, [authUser._id]: true }));

        clientRef.current = client;
        connectedUserIdRef.current = authUser._id;
        setChatClient(client);
      } finally {
        setIsConnecting(false);
      }
    };

    connect();
  }, [authUser, tokenData?.token]);

  useEffect(() => {
    if (!chatClient) return;

    const handler = (e) => {
      const user = e?.user;
      if (!user?.id) return;
      setOnlineMap((prev) => ({ ...prev, [user.id]: Boolean(user.online) }));
    };

    chatClient.on("user.presence.changed", handler);

    return () => {
      chatClient.off("user.presence.changed", handler);
    };
  }, [chatClient]);

  const ensureUsersPresence = async (userIds) => {
    try {
      if (!chatClient) return;
      const ids = [...new Set((userIds || []).filter(Boolean))];
      if (ids.length === 0) return;

      const res = await chatClient.queryUsers({ id: { $in: ids } }, {}, { presence: true });
      const next = {};
      res?.users?.forEach((u) => {
        next[u.id] = Boolean(u.online);
      });
      setOnlineMap((prev) => ({ ...prev, ...next }));
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({
      chatClient,
      isConnecting,
      onlineMap,
      ensureUsersPresence,
    }),
    [chatClient, isConnecting, onlineMap]
  );

  return <StreamChatContext.Provider value={value}>{children}</StreamChatContext.Provider>;
};

export const useStreamChat = () => {
  const ctx = useContext(StreamChatContext);
  if (!ctx) {
    return { chatClient: null, isConnecting: false, onlineMap: {}, ensureUsersPresence: async () => {} };
  }
  return ctx;
};
