import { useState } from "react";
import { Link } from "react-router";
import { UsersIcon, UserPlusIcon, XIcon, SearchIcon } from "lucide-react";
import { capitialize } from "../lib/utils";
import { getCountryFlag } from "./FriendCard";
import MobileFriendCard from "./MobileFriendCard";
import SupportedLanguagesDropdown from "./SupportedLanguagesDropdown";
import toast from "react-hot-toast";

const MobileCategoryViews = ({ 
  activeTab, 
  friends, 
  frequentContacts, 
  recommendedUsers, 
  friendRequests, 
  outgoingRequestsIds,
  onlineMap,
  authUser,
  bumpMessageCount,
  sendRequestMutation,
  cancelRequestMutation,
  acceptRequestMutation,
  recentlyAddedFriends,
  savingLanguage,
  saveLanguageMutation
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter functions
  const filterItems = (items, searchField = "fullName") => {
    if (!searchTerm) return items;
    return items.filter(item => 
      item[searchField]?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredFriends = filterItems(friends);
  const filteredParticipants = filterItems(recommendedUsers);
  const filteredRequests = filterItems(friendRequests?.incomingReqs || [], "sender.fullName");

  // Enhanced friends with WhatsApp-style data
  const enhancedFriends = filteredFriends.map(friend => ({
    ...friend,
    isOnline: onlineMap?.[friend._id],
    lastMessage: "Tap to start chatting...",
    lastMessageTime: "Now",
    unreadCount: 0
  }));

  // Enhanced participants
  const enhancedParticipants = filteredParticipants.map(user => ({
    ...user,
    isOnline: onlineMap?.[user._id],
    lastMessage: "New user - send friend request",
    lastMessageTime: "New",
    unreadCount: 0
  }));

  // Render different category views
  const renderFriendsView = () => (
    <div className="bg-base-100 min-h-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search friends..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base-200 border border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Friends list */}
      <div className="divide-y divide-base-200">
        {enhancedFriends.length === 0 ? (
          <div className="p-8 text-center text-base-content/60">
            <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No friends found</p>
          </div>
        ) : (
          enhancedFriends.map((friend) => (
            <MobileFriendCard 
              key={friend._id} 
              friend={friend} 
              onMessage={bumpMessageCount}
              showOnlineStatus={true}
            />
          ))
        )}
      </div>
    </div>
  );

  const renderLanguagesView = () => (
    <div className="bg-base-100 min-h-full">
      <div className="p-4">
        <div className="mb-4">
          <SupportedLanguagesDropdown
            onLanguageSelect={saveLanguageMutation}
            currentLanguage={authUser?.nativeLanguage}
            savingLanguage={savingLanguage}
          />
        </div>
        
        <div className="bg-base-200 rounded-lg p-4">
          <h3 className="font-semibold mb-2">About Language Support</h3>
          <p className="text-sm text-base-content/70">
            We support Nova 2 and Nova 3 models with 115+ languages. Select your preferred language to improve matching with language partners.
          </p>
        </div>
      </div>
    </div>
  );

  const renderRecentlyAddedView = () => (
    <div className="bg-base-100 min-h-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search recently added..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base-200 border border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Recently added list */}
      <div className="divide-y divide-base-200">
        {recentlyAddedFriends.length === 0 ? (
          <div className="p-8 text-center text-base-content/60">
            <p>No recently added friends</p>
          </div>
        ) : (
          recentlyAddedFriends.map(({ item }) => (
            <MobileFriendCard 
              key={item._id} 
              friend={{
                ...item,
                isOnline: onlineMap?.[item._id],
                lastMessage: "Recently added",
                lastMessageTime: "Recent",
                unreadCount: 0
              }} 
              onMessage={bumpMessageCount}
              showOnlineStatus={true}
            />
          ))
        )}
      </div>
    </div>
  );

  const renderRequestsView = () => (
    <div className="bg-base-100 min-h-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base-200 border border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Requests list */}
      <div className="divide-y divide-base-200">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-base-content/60">
            <BellIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No pending friend requests</p>
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div key={req._id} className="p-4 hover:bg-base-200 transition-colors">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-base-300">
                    <img src={req.sender.profilePic} alt={req.sender.fullName} className="w-full h-full object-cover" />
                  </div>
                  <span 
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-base-100 ${
                      onlineMap?.[req.sender?._id] ? "bg-success" : "bg-neutral-500"
                    }`}
                    title={onlineMap?.[req.sender?._id] ? "Online" : "Offline"}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{req.sender.fullName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-base-content/70">
                      {getCountryFlag(req.sender.country)} {req.sender.country || ""}
                    </span>
                    <span className="text-xs text-base-content/70">
                      Language: {req.sender.nativeLanguage || ""}
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => acceptRequestMutation(req._id)}
                >
                  Accept
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderParticipantsView = () => (
    <div className="bg-base-100 min-h-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base-200 border border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Participants list */}
      <div className="divide-y divide-base-200">
        {enhancedParticipants.length === 0 ? (
          <div className="p-8 text-center text-base-content/60">
            <UserPlusIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No new participants found</p>
          </div>
        ) : (
          enhancedParticipants.map((user) => {
            const hasRequestBeenSent = outgoingRequestsIds.has(user._id);
            
            return (
              <div key={user._id} className="p-4 hover:bg-base-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-base-300">
                      <img src={user.profilePic} alt={user.fullName} className="w-full h-full object-cover" />
                    </div>
                    <span 
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-base-100 ${
                        onlineMap?.[user._id] ? "bg-success" : "bg-neutral-500"
                      }`}
                      title={onlineMap?.[user._id] ? "Online" : "Offline"}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{user.fullName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-base-content/70">
                        {getCountryFlag(user.country)} {capitialize(user.country || "")}
                      </span>
                      <span className="text-xs text-base-content/70">
                        Language: {capitialize(user.nativeLanguage || "")}
                      </span>
                    </div>
                  </div>

                  <button
                    className={`btn btn-sm ${hasRequestBeenSent ? "btn-outline" : "btn-primary"}`}
                    onClick={() => {
                      if (hasRequestBeenSent) cancelRequestMutation(user._id);
                      else sendRequestMutation(user._id);
                    }}
                  >
                    {hasRequestBeenSent ? (
                      <>
                        <XIcon className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <UserPlusIcon className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // Render the appropriate view based on active tab
  switch (activeTab) {
    case 'friends':
      return renderFriendsView();
    case 'languages':
      return renderLanguagesView();
    case 'recently':
      return renderRecentlyAddedView();
    case 'requests':
      return renderRequestsView();
    case 'participants':
      return renderParticipantsView();
    default:
      return renderFriendsView();
  }
};

export default MobileCategoryViews;
