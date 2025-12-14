import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import useAuthUser from "../hooks/useAuthUser";
import { useStreamChat } from "../context/StreamChatContext";
import OutgoingCallPopup from "./OutgoingCallPopup";

const STORAGE_KEY = "aerosonix_outgoing_call";
const OUTGOING_EVENT = "aerosonix_outgoing_call_changed";

const extractCallUrl = (text) => {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s]+\/call\/[^\s]+/i);
  if (match?.[0]) return match[0];
  const rel = text.match(/\/call\/[^\s]+/i);
  return rel?.[0] || null;
};

const parseCallIdFromUrl = (url) => {
  if (!url) return null;
  try {
    const pathname = url.startsWith("http") ? new URL(url).pathname : url;
    const m = pathname.match(/\/call\/([^\s/]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
};

const OutgoingCallManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authUser } = useAuthUser();
  const { chatClient } = useStreamChat();

  const [call, setCall] = useState(null);

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return setCall(null);
        setCall(JSON.parse(raw));
      } catch {
        setCall(null);
      }
    };

    load();

    const onStorage = (e) => {
      if (e?.key && e.key !== STORAGE_KEY) return;
      load();
    };

    const onOutgoing = () => load();

    window.addEventListener("storage", onStorage);
    window.addEventListener(OUTGOING_EVENT, onOutgoing);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(OUTGOING_EVENT, onOutgoing);
    };
  }, []);

  const persist = (next) => {
    setCall(next);
    try {
      if (!next) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const expiresAt = useMemo(() => call?.expiresAt || null, [call?.expiresAt]);

  useEffect(() => {
    if (!expiresAt) return;
    const ms = Math.max(0, expiresAt - Date.now());
    const t = setTimeout(() => {
      persist(null);
    }, ms);
    return () => clearTimeout(t);
  }, [expiresAt]);

  useEffect(() => {
    if (!chatClient || !authUser?._id) return;

    const handler = (e) => {
      const text = e?.message?.text;
      if (!text || typeof text !== "string") return;
      if (!text.startsWith("CALL_ACCEPTED:")) return;

      const url = text.slice("CALL_ACCEPTED:".length).trim();
      const callId = parseCallIdFromUrl(url);
      if (!callId) return;

      if (call?.callId && call.callId !== callId) return;

      persist(null);
      const pathname = `/call/${callId}`;
      if (location.pathname !== pathname) navigate(pathname);
    };

    chatClient.on("notification.message_new", handler);
    chatClient.on("message.new", handler);

    return () => {
      chatClient.off("notification.message_new", handler);
      chatClient.off("message.new", handler);
    };
  }, [chatClient, authUser?._id, call?.callId, location.pathname]);

  const cancel = () => {
    persist(null);
  };

  if (!call) return null;

  return <OutgoingCallPopup call={call} onCancel={cancel} />;
};

export const startOutgoingCallRinging = async ({ chatClient, fromUserId, toUserId, callUrl }) => {
  if (!chatClient || !fromUserId || !toUserId || !callUrl) return;

  const callId = parseCallIdFromUrl(callUrl);
  if (!callId) return;

  let toUser = { id: toUserId, name: "Friend", image: "" };
  try {
    const res = await chatClient.queryUsers({ id: { $in: [toUserId] } }, {}, { presence: true });
    const u = res?.users?.[0];
    if (u) {
      toUser = { id: u.id, name: u.name || "Friend", image: u.image || "" };
      if (!u.online) return; // only ring when both are online
    }
  } catch {
    return;
  }

  const next = {
    callUrl,
    callId,
    toUser,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15_000,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event(OUTGOING_EVENT));
  } catch {
    // ignore
  }
};

export default OutgoingCallManager;
