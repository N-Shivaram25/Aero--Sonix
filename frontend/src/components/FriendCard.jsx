import { Link } from "react-router";
import { COUNTRY_TO_FLAG, LANGUAGE_TO_FLAG } from "../constants";
import { useStreamChat } from "../context/StreamChatContext";

const FriendCard = ({ friend, onMessage }) => {
  const { onlineMap } = useStreamChat();
  const isOnline = Boolean(onlineMap?.[friend?._id]);

  return (
    <div className="card bg-base-200 hover:shadow-md transition-shadow">
      <div className="card-body p-4">
        {/* USER INFO */}
        <div className="flex items-center gap-3 mb-3">
          <div className="avatar size-12 relative">
            <img src={friend.profilePic} alt={friend.fullName} />
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-base-200 ${
                isOnline ? "bg-success" : "bg-neutral-500"
              }`}
              title={isOnline ? "Online" : "Offline"}
            />
          </div>
          <h3 className="font-semibold truncate">{friend.fullName}</h3>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-xs opacity-80 truncate">
            {getCountryFlag(friend.country)}
            Country: {friend.country || ""}
          </div>
          <div className="text-xs opacity-80 truncate">
            Language: {friend.nativeLanguage || ""}
          </div>
        </div>

        <Link
          to={`/chat/${friend._id}`}
          className="btn btn-outline w-full"
          onClick={() => onMessage?.(friend)}
        >
          Message
        </Link>
      </div>
    </div>
  );
};
export default FriendCard;

export function getLanguageFlag(language) {
  if (!language) return null;

  const langLower = language.toLowerCase();
  const countryCode = LANGUAGE_TO_FLAG[langLower];

  if (countryCode) {
    return (
      <img
        src={`https://flagcdn.com/24x18/${countryCode}.png`}
        alt={`${langLower} flag`}
        className="h-3 mr-1 inline-block"
      />
    );
  }
  return null;
}

export function getCountryFlag(country) {
  if (!country) return null;

  const key = country.toLowerCase().trim();
  const countryCode = COUNTRY_TO_FLAG[key];

  if (!countryCode) return null;

  return (
    <img
      src={`https://flagcdn.com/24x18/${countryCode}.png`}
      alt={`${country} flag`}
      className="h-3 mr-1 inline-block"
    />
  );
}
