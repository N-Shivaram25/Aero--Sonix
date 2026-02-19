import { Link } from "react-router";
import { capitialize } from "../lib/utils";
import { getCountryFlag, getLanguageFlag } from "./FriendCard";

const MobileFriendCard = ({ friend, onMessage, showOnlineStatus = true }) => {
  const handleClick = () => {
    if (onMessage) {
      onMessage(friend);
    }
  };

  return (
    <Link 
      to={`/chat/${friend._id}`} 
      onClick={handleClick}
      className="flex items-center gap-3 p-3 hover:bg-base-200 transition-colors cursor-pointer border-b border-base-200 last:border-b-0"
    >
      {/* Avatar with online status */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-base-300">
          <img 
            src={friend.profilePic} 
            alt={friend.fullName} 
            className="w-full h-full object-cover"
          />
        </div>
        {showOnlineStatus && (
          <span 
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-base-100 ${
              friend.isOnline ? "bg-success" : "bg-neutral-500"
            }`}
            title={friend.isOnline ? "Online" : "Offline"}
          />
        )}
      </div>

      {/* Friend info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-base truncate">{friend.fullName}</h3>
          <span className="text-xs text-base-content/60 flex-shrink-0">
            {friend.lastMessageTime || "Now"}
          </span>
        </div>
        
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-base-content/70">
            {getCountryFlag(friend.country)} {capitialize(friend.country || "")}
          </span>
          <span className="text-xs text-base-content/70">
            {getLanguageFlag(friend.nativeLanguage)} {capitialize(friend.nativeLanguage || "")}
          </span>
        </div>

        {/* Last message preview */}
        {friend.lastMessage && (
          <p className="text-sm text-base-content/70 truncate mt-1">
            {friend.lastMessage}
          </p>
        )}

        {/* Unread message count */}
        {friend.unreadCount > 0 && (
          <div className="flex items-center justify-between mt-1">
            <div className="flex-1"></div>
            <span className="bg-primary text-primary-content text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
              {friend.unreadCount}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
};

export default MobileFriendCard;
