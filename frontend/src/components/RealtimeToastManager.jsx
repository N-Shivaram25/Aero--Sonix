import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import useAuthUser from "../hooks/useAuthUser";
import { useStreamChat } from "../context/StreamChatContext";
import { getFriendRequests } from "../lib/api";

const toastCard = ({ title, subtitle, image, right }) => (
  <div className="card bg-base-100 shadow-xl border border-base-300 w-80">
    <div className="card-body p-4">
      <div className="flex items-center gap-3">
        <div className="avatar">
          <div className="w-10 rounded-full">
            {image ? <img src={image} alt={title} /> : <div className="w-10 h-10 rounded-full bg-base-200" />}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{title}</div>
          {subtitle && <div className="text-sm opacity-70 truncate">{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  </div>
);

const RealtimeToastManager = () => {
  const { authUser } = useAuthUser();
  const { chatClient } = useStreamChat();

  const seenFriendReqIdsRef = useRef(new Set());
  const hydratedFriendReqsRef = useRef(false);

  useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
    enabled: Boolean(authUser),
    refetchInterval: 5000,
    staleTime: 0,
    onSuccess: (data) => {
      const incoming = data?.incomingReqs || [];

      if (!hydratedFriendReqsRef.current) {
        incoming.forEach((r) => seenFriendReqIdsRef.current.add(r?._id));
        hydratedFriendReqsRef.current = true;
        return;
      }

      incoming.forEach((r) => {
        if (!r?._id || seenFriendReqIdsRef.current.has(r._id)) return;
        seenFriendReqIdsRef.current.add(r._id);

        const sender = r?.sender;
        if (!sender?._id) return;

        // Only show popup if sender is online at this moment
        (async () => {
          try {
            if (!chatClient) return;
            const res = await chatClient.queryUsers({ id: { $in: [sender._id] } }, {}, { presence: true });
            const u = res?.users?.[0];
            if (!u?.online) return;
          } catch {
            return;
          }

          toast.custom(
            (t) => (
              <div style={{ opacity: t.visible ? 1 : 0 }}>
                {toastCard({
                  title: "Friend Request",
                  subtitle: `${sender.fullName || "Someone"} sent you a friend request`,
                  image: sender.profilePic,
                })}
              </div>
            ),
            { duration: 5000 }
          );
        })();
      });
    },
  });

  useEffect(() => {
    if (!chatClient || !authUser?._id) return;

    const handler = async (e) => {
      const msg = e?.message;
      const fromUser = e?.user || msg?.user;
      if (!msg?.text || !fromUser?.id) return;
      if (fromUser.id === authUser._id) return;

      try {
        const res = await chatClient.queryUsers({ id: { $in: [fromUser.id] } }, {}, { presence: true });
        const u = res?.users?.[0];
        if (!u?.online) return;
      } catch {
        return;
      }

      toast.custom(
        (t) => (
          <div style={{ opacity: t.visible ? 1 : 0 }}>
            {toastCard({
              title: fromUser.name || "New message",
              subtitle: msg.text,
              image: fromUser.image,
            })}
          </div>
        ),
        { duration: 5000 }
      );
    };

    chatClient.on("notification.message_new", handler);

    return () => {
      chatClient.off("notification.message_new", handler);
    };
  }, [chatClient, authUser?._id]);

  return null;
};

export default RealtimeToastManager;
