import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, LogOutIcon, ShipWheelIcon } from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import useLogout from "../hooks/useLogout";
import { getCountryFlag, getLanguageFlag } from "./FriendCard";
import { useStreamChat } from "../context/StreamChatContext";

const Navbar = () => {
  const { authUser } = useAuthUser();
  const { onlineMap } = useStreamChat();
  const location = useLocation();
  const isChatPage = location.pathname?.startsWith("/chat");

  // const queryClient = useQueryClient();
  // const { mutate: logoutMutation } = useMutation({
  //   mutationFn: logout,
  //   onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authUser"] }),
  // });

  const { logoutMutation } = useLogout();

  return (
    <nav className="bg-base-200 border-b border-base-300 sticky top-0 z-30 h-16 flex items-center">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end w-full">
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

          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            <Link to={"/notifications"}>
              <button className="btn btn-ghost btn-circle">
                <BellIcon className="h-6 w-6 text-base-content opacity-70" />
              </button>
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
              <div className="text-xs opacity-70 flex items-center gap-2 truncate max-w-72">
                {authUser?.country && (
                  <span className="flex items-center gap-1">
                    {getCountryFlag(authUser.country)}
                    {authUser.country}
                  </span>
                )}
                {authUser?.nativeLanguage && (
                  <span className="flex items-center gap-1">
                    {getLanguageFlag(authUser.nativeLanguage)}
                    {authUser.nativeLanguage}
                  </span>
                )}
              </div>
              <div className="text-xs opacity-70 truncate max-w-72">
                {authUser?.gender ? `Gender: ${authUser.gender}` : ""}
                {authUser?.gender && authUser?.location ? "  •  " : ""}
                {authUser?.location ? `Location: ${authUser.location}` : ""}
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
