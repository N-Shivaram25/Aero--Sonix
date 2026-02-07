import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, LogOutIcon, ShipWheelIcon } from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import useLogout from "../hooks/useLogout";
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

const Navbar = () => {
  const { authUser } = useAuthUser();
  const { onlineMap } = useStreamChat();
  const location = useLocation();
  const isChatPage = location.pathname?.startsWith("/chat");
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

  // const queryClient = useQueryClient();
  // const { mutate: logoutMutation } = useMutation({
  //   mutationFn: logout,
  //   onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authUser"] }),
  // });

  const { logoutMutation } = useLogout();

  return (
    <nav className="bg-base-200 border-b border-base-300 sticky top-0 z-30 h-16 flex items-center">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="app-drawer" className="btn btn-ghost btn-circle lg:hidden" aria-label="Open menu">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </label>

            {!isChatPage && (
              <Link to="/" className="flex items-center gap-2 lg:hidden">
                <ShipWheelIcon className="size-8 text-primary" />
                <span className="text-lg font-bold font-mono">Aero Sonix</span>
              </Link>
            )}
          </div>
          {/* LOGO - ONLY IN THE CHAT PAGE */}
          {isChatPage && (
            <div className="pl-5">
              <Link to="/" className="flex items-center gap-2.5">
                <ShipWheelIcon className="size-9 text-primary" />
                <span className="text-3xl font-bold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary  tracking-wider">
                  Aero Sonix
                </span>
              </Link>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <Link to={"/notifications"}>
              <div className="indicator">
                {notifCount > 0 && (
                  <span className="indicator-item badge badge-primary badge-sm">{notifCount}</span>
                )}
                <button className="btn btn-ghost btn-circle">
                  <BellIcon className="h-6 w-6 text-base-content opacity-70" />
                </button>
              </div>
            </Link>
          </div>

          {/* TODO */}
          <ThemeSelector />

          <Link to="/profile" className="flex items-center gap-2">
            <div className="avatar relative">
              <div className="w-9 rounded-full">
                <img src={authUser?.profilePic} alt="User Avatar" rel="noreferrer" />
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-base-200 ${
                  onlineMap?.[authUser?._id] ? "bg-success" : "bg-neutral-500"
                }`}
                title={onlineMap?.[authUser?._id] ? "Online" : "Offline"}
              />
            </div>

            <div className="hidden md:block min-w-0">
              <div className="text-sm font-semibold leading-4 truncate max-w-40">{authUser?.fullName}</div>
              <div className="text-xs opacity-70">
                {onlineMap?.[authUser?._id] ? "Online" : "Offline"}
              </div>
            </div>
          </Link>

          {/* Logout button */}
          <button className="btn btn-ghost btn-circle" onClick={logoutMutation}>
            <LogOutIcon className="h-6 w-6 text-base-content opacity-70" />
          </button>
        </div>
      </div>
    </nav>
  );
};
export default Navbar;
