import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, HomeIcon, ShipWheelIcon, UsersIcon, BotIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useStreamChat } from "../context/StreamChatContext";
import { useQuery } from "@tanstack/react-query";
import { getFriendRequests } from "../lib/api";

const seenStoreKey = "aerosonix_seen_notification_ids";

const readSeenSet = () => {
  try {
    const raw = localStorage.getItem(seenStoreKey);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)));
  } catch {
    return new Set();
  }
};

const getNotificationIds = (friendRequests) => {
  const incoming = friendRequests?.incomingReqs || [];
  const accepted = friendRequests?.acceptedReqs || [];
  return [...incoming, ...accepted].map((x) => String(x?._id || "")).filter(Boolean);
};

const Sidebar = ({ collapsed = false, onToggleCollapsed }) => {
  const { authUser } = useAuthUser();
  const { onlineMap } = useStreamChat();
  const location = useLocation();
  const currentPath = location.pathname;
  const [seenVersion, setSeenVersion] = useState(0);

  useEffect(() => {
    const onSeen = () => setSeenVersion((v) => v + 1);
    try {
      window.addEventListener("aerosonix-notifications-seen", onSeen);
      window.addEventListener("storage", onSeen);
    } catch {
      // ignore
    }
    return () => {
      try {
        window.removeEventListener("aerosonix-notifications-seen", onSeen);
        window.removeEventListener("storage", onSeen);
      } catch {
        // ignore
      }
    };
  }, []);

  const closeDrawer = () => {
    try {
      const el = document.getElementById("app-drawer");
      if (el && "checked" in el) el.checked = false;
    } catch {
      // ignore
    }
  };

  const { data: friendRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
    enabled: Boolean(authUser),
    staleTime: 10_000,
  });

  const allNotifIds = getNotificationIds(friendRequests);
  // seenVersion is only used to force recompute when localStorage is updated.
  void seenVersion;
  const seen = readSeenSet();
  const notifCount = allNotifIds.filter((id) => !seen.has(id)).length;

  return (
    <aside
      className={`${collapsed ? "w-20" : "w-72"} bg-base-200 border-r border-base-300 flex flex-col min-h-full transition-[width] duration-200`}
    >
      <div className="p-5 border-b border-base-300">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <ShipWheelIcon className="size-9 text-primary" />
            {!collapsed ? (
              <span className="text-3xl font-bold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary  tracking-wider truncate">
                Aero Sonix
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square hidden lg:inline-flex"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          </button>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <Link
          to="/"
          onClick={closeDrawer}
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/" ? "btn-active" : ""
          }`}
        >
          <HomeIcon className="size-5 text-base-content opacity-70" />
          {!collapsed ? <span>Home</span> : null}
        </Link>

        <Link
          to="/friends"
          onClick={closeDrawer}
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/friends" ? "btn-active" : ""
          }`}
        >
          <UsersIcon className="size-5 text-base-content opacity-70" />
          {!collapsed ? <span>Friends</span> : null}
        </Link>

        <Link
          to="/participants"
          onClick={closeDrawer}
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/participants" ? "btn-active" : ""
          }`}
        >
          <UsersIcon className="size-5 text-base-content opacity-70" />
          {!collapsed ? <span>Participants</span> : null}
        </Link>

        <Link
          to="/notifications"
          onClick={closeDrawer}
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/notifications" ? "btn-active" : ""
          }`}
        >
          <BellIcon className="size-5 text-base-content opacity-70" />
          {!collapsed ? (
            <span className="flex-1 text-left">Notifications</span>
          ) : (
            <span className="flex-1" />
          )}
          {notifCount > 0 ? (
            <span className="badge badge-primary badge-sm ml-auto self-center">{notifCount}</span>
          ) : null}
        </Link>

        <Link
          to="/ai-robot/home"
          onClick={closeDrawer}
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath.startsWith("/ai-robot") ? "btn-active" : ""
          }`}
        >
          <BotIcon className="size-5 text-base-content opacity-70" />
          {!collapsed ? <span>AI Robot</span> : null}
        </Link>
      </nav>

      {/* USER PROFILE SECTION */}
      <div className="p-4 border-t border-base-300 mt-auto">
        <Link to="/profile" className="block" onClick={closeDrawer}>
          <div className={`flex ${collapsed ? "items-center" : "items-start"} gap-3`}>
            <div className="avatar relative">
              <div className="w-10 rounded-full">
                <img src={authUser?.profilePic} alt="User Avatar" />
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-base-200 ${
                  onlineMap?.[authUser?._id] ? "bg-success" : "bg-neutral-500"
                }`}
                title={onlineMap?.[authUser?._id] ? "Online" : "Offline"}
              />
            </div>
            {!collapsed ? (
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{authUser?.fullName}</p>
                <p
                  className={`text-xs flex items-center gap-1 mt-1 ${
                    onlineMap?.[authUser?._id] ? "text-success" : "text-neutral-500"
                  }`}
                >
                  {onlineMap?.[authUser?._id] ? "Online" : "Offline"}
                </p>
              </div>
            ) : null}
          </div>
        </Link>
      </div>
    </aside>
  );
};
export default Sidebar;
