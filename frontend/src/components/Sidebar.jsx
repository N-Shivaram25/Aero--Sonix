import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, HomeIcon, ShipWheelIcon, UsersIcon } from "lucide-react";
import { useStreamChat } from "../context/StreamChatContext";
import { useQuery } from "@tanstack/react-query";
import { getFriendRequests } from "../lib/api";

const Sidebar = () => {
  const { authUser } = useAuthUser();
  const { onlineMap } = useStreamChat();
  const location = useLocation();
  const currentPath = location.pathname;

  const { data: friendRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
    enabled: Boolean(authUser),
    staleTime: 10_000,
  });

  const notifCount =
    (friendRequests?.incomingReqs?.length || 0) + (friendRequests?.acceptedReqs?.length || 0);

  return (
    <aside className="w-64 bg-base-200 border-r border-base-300 hidden lg:flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-base-300">
        <Link to="/" className="flex items-center gap-2.5">
          <ShipWheelIcon className="size-9 text-primary" />
          <span className="text-3xl font-bold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary  tracking-wider">
            Aero Sonix
          </span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <Link
          to="/"
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/" ? "btn-active" : ""
          }`}
        >
          <HomeIcon className="size-5 text-base-content opacity-70" />
          <span>Home</span>
        </Link>

        <Link
          to="/friends"
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/friends" ? "btn-active" : ""
          }`}
        >
          <UsersIcon className="size-5 text-base-content opacity-70" />
          <span>Friends</span>
        </Link>

        <Link
          to="/participants"
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/participants" ? "btn-active" : ""
          }`}
        >
          <UsersIcon className="size-5 text-base-content opacity-70" />
          <span>Participants</span>
        </Link>

        <Link
          to="/notifications"
          className={`btn btn-ghost justify-start w-full gap-3 px-3 normal-case ${
            currentPath === "/notifications" ? "btn-active" : ""
          }`}
        >
          <BellIcon className="size-5 text-base-content opacity-70" />
          <span className="flex-1">Notifications</span>
          {notifCount > 0 && <span className="badge badge-primary badge-sm">{notifCount}</span>}
        </Link>
      </nav>

      {/* USER PROFILE SECTION */}
      <div className="p-4 border-t border-base-300 mt-auto">
        <Link to="/profile" className="block">
          <div className="flex items-start gap-3">
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
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{authUser?.fullName}</p>
              <p
                className={`text-xs flex items-center gap-1 mt-1 ${
                  onlineMap?.[authUser?._id] ? "text-success" : "text-neutral-500"
                }`}
              >
                <span
                  className={`size-2 rounded-full inline-block ${
                    onlineMap?.[authUser?._id] ? "bg-success" : "bg-neutral-500"
                  }`}
                />
                {onlineMap?.[authUser?._id] ? "Online" : "Offline"}
              </p>
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
};
export default Sidebar;
