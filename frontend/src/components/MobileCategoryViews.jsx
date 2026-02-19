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
    <div className="bg-base-100 min-h-full w-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search friends..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-base-200 border border-base-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Friends list */}
      <div className="p-4 space-y-3">
        {enhancedFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-base-200 rounded-full flex items-center justify-center mb-4">
              <UsersIcon className="w-10 h-10 text-base-content/40" />
            </div>
            <h3 className="text-lg font-semibold text-base-content/80 mb-1">No friends yet</h3>
            <p className="text-sm text-base-content/60">Start connecting with language partners!</p>
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
    <div className="bg-base-100 min-h-full w-full">
      <div className="p-4 w-full">
        <div className="mb-4 w-full">
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
    <div className="bg-base-100 min-h-full w-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search recently added..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-base-200 border border-base-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Recently added list */}
      <div className="p-4 space-y-3">
        {recentlyAddedFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-base-200 rounded-full flex items-center justify-center mb-4">
              <ClockIcon className="w-10 h-10 text-base-content/40" />
            </div>
            <h3 className="text-lg font-semibold text-base-content/80 mb-1">No recent additions</h3>
            <p className="text-sm text-base-content/60">Your recently added friends will appear here</p>
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
    <div className="bg-base-100 min-h-full w-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-base-200 border border-base-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Requests list */}
      <div className="p-4 space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-base-200 rounded-full flex items-center justify-center mb-4">
              <BellIcon className="w-10 h-10 text-base-content/40" />
            </div>
            <h3 className="text-lg font-semibold text-base-content/80 mb-1">No pending requests</h3>
            <p className="text-sm text-base-content/60">You're all caught up! Check back later.</p>
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div key={req._id} className="bg-base-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-base-300 ring-2 ring-base-100">
                    <img src={req.sender.profilePic} alt={req.sender.fullName} className="w-full h-full object-cover" />
                  </div>
                  <span 
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-3 border-base-200 ${
                      onlineMap?.[req.sender?._id] ? "bg-success" : "bg-neutral-400"
                    }`}
                    title={onlineMap?.[req.sender?._id] ? "Online" : "Offline"}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg text-base-content mb-2">{req.sender.fullName}</h3>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-base-content/70">Country:</span>
                      <span className="text-sm text-base-content">
                        {getCountryFlag(req.sender.country)} {req.sender.country || "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-base-content/70">Language:</span>
                      <span className="text-sm text-base-content">
                        {req.sender.nativeLanguage || "Not specified"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="flex-1 btn btn-primary rounded-xl font-medium"
                      onClick={() => acceptRequestMutation(req._id)}
                    >
                      <CheckCircleIcon className="w-4 h-4 mr-2" />
                      Accept
                    </button>
                    <button
                      className="btn btn-outline rounded-xl"
                      onClick={() => {
                        // Optional: Add decline functionality if needed
                        toast.error("Decline feature coming soon!");
                      }}
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderParticipantsView = () => (
    <div className="bg-base-100 min-h-full w-full">
      {/* Search bar */}
      <div className="sticky top-0 bg-base-100 z-30 p-4 border-b border-base-200">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-base-200 border border-base-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Participants list */}
      <div className="p-4 space-y-3">
        {enhancedParticipants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-base-200 rounded-full flex items-center justify-center mb-4">
              <UserPlusIcon className="w-10 h-10 text-base-content/40" />
            </div>
            <h3 className="text-lg font-semibold text-base-content/80 mb-1">No new participants</h3>
            <p className="text-sm text-base-content/60">Check back later for new language partners!</p>
          </div>
        ) : (
          enhancedParticipants.map((user) => {
            const hasRequestBeenSent = outgoingRequestsIds.has(user._id);
            
            return (
              <div key={user._id} className="bg-base-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-base-300 ring-2 ring-base-100">
                      <img src={user.profilePic} alt={user.fullName} className="w-full h-full object-cover" />
                    </div>
                    <span 
                      className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-3 border-base-200 ${
                        onlineMap?.[user._id] ? "bg-success" : "bg-neutral-400"
                      }`}
                      title={onlineMap?.[user._id] ? "Online" : "Offline"}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-base-content mb-2">{user.fullName}</h3>
                    
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content/70">Country:</span>
                        <span className="text-sm text-base-content">
                          {getCountryFlag(user.country)} {capitialize(user.country || "Unknown")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content/70">Language:</span>
                        <span className="text-sm text-base-content">
                          {capitialize(user.nativeLanguage || "Not specified")}
                        </span>
                      </div>
                      {user.gender && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-base-content/70">Gender:</span>
                          <span className="text-sm text-base-content">{capitialize(user.gender)}</span>
                        </div>
                      )}
                    </div>

                    {user.bio && (
                      <div className="mb-3">
                        <p className="text-sm text-base-content/70 line-clamp-2">{user.bio}</p>
                      </div>
                    )}

                    <button
                      className={`w-full btn ${hasRequestBeenSent ? "btn-outline" : "btn-primary"} rounded-xl font-medium`}
                      onClick={() => {
                        if (hasRequestBeenSent) cancelRequestMutation(user._id);
                        else sendRequestMutation(user._id);
                      }}
                    >
                      {hasRequestBeenSent ? (
                        <>
                          <XIcon className="w-4 h-4 mr-2" />
                          Cancel Request
                        </>
                      ) : (
                        <>
                          <UserPlusIcon className="w-4 h-4 mr-2" />
                          Send Friend Request
                        </>
                      )}
                    </button>
                  </div>
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
