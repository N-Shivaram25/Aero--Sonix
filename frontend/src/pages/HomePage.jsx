import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getOutgoingFriendReqs,
  getFriendRequests,
  getRecommendedUsers,
  getUserFriends,
  acceptFriendRequest,
  sendFriendRequest,
  cancelFriendRequest,
  updateProfile,
} from "../lib/api";
import { Link } from "react-router";
import { CheckCircleIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";

import { capitialize } from "../lib/utils";

import FriendCard, { getCountryFlag, getLanguageFlag } from "../components/FriendCard";
import NoFriendsFound from "../components/NoFriendsFound";
import { useStreamChat } from "../context/StreamChatContext";
import useAuthUser from "../hooks/useAuthUser";
import toast from "react-hot-toast";

const HomePage = () => {
  const queryClient = useQueryClient();
  const { ensureUsersPresence, onlineMap } = useStreamChat();
  const { authUser } = useAuthUser();
  const [outgoingRequestsIds, setOutgoingRequestsIds] = useState(new Set());
  const [messageCounts, setMessageCounts] = useState({});
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [languagesOpen, setLanguagesOpen] = useState(false);

  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const { data: friendRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
  });

  const { data: recommendedUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: getRecommendedUsers,
  });

  const { data: outgoingFriendReqs } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });

  const supportedLanguages = [];

  const { mutate: saveLanguageMutation, isPending: savingLanguage } = useMutation({
    mutationFn: (nativeLanguage) => updateProfile({ nativeLanguage }),
    onSuccess: () => {
      toast.success("Language updated");
      queryClient.invalidateQueries({ queryKey: ["authUser"] });
      setLanguagesOpen(false);
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || error?.message || "Failed to update language");
    },
  });

  const { mutate: sendRequestMutation, isPending } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] }),
  });

  const { mutate: cancelRequestMutation, isPending: canceling } = useMutation({
    mutationFn: cancelFriendRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] }),
  });

  const { mutate: acceptRequestMutation, isPending: accepting } = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  useEffect(() => {
    const outgoingIds = new Set();
    (outgoingFriendReqs || []).forEach((req) => {
      if (req?.recipient?._id) outgoingIds.add(req.recipient._id);
    });
    setOutgoingRequestsIds(outgoingIds);
  }, [outgoingFriendReqs]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aerosonix_message_counts");
      setMessageCounts(raw ? JSON.parse(raw) : {});
    } catch {
      setMessageCounts({});
    }

    try {
      const rawRecent = localStorage.getItem("aerosonix_recently_added");
      setRecentlyAdded(rawRecent ? JSON.parse(rawRecent) : []);
    } catch {
      setRecentlyAdded([]);
    }
  }, []);

  const bumpMessageCount = (friend) => {
    if (!friend?._id) return;
    try {
      const next = { ...messageCounts, [friend._id]: (messageCounts[friend._id] || 0) + 1 };
      setMessageCounts(next);
      localStorage.setItem("aerosonix_message_counts", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const frequentContacts = friends
    .filter((f) => (messageCounts[f._id] || 0) >= 2)
    .sort((a, b) => (messageCounts[b._id] || 0) - (messageCounts[a._id] || 0))
    .slice(0, 4);

  const friendIdsSet = new Set((friends || []).map((f) => f?._id).filter(Boolean));
  const participantsForHome = (recommendedUsers || []).filter((u) => u?._id && !friendIdsSet.has(u._id));

  const recentlyAddedFriends = (() => {
    const index = new Map(friends.map((f) => [f._id, f]));
    return (recentlyAdded || [])
      .map((x) => ({ item: index.get(x.id), at: x.at }))
      .filter((x) => Boolean(x.item))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  })();

  const incomingRequests = friendRequests?.incomingReqs || [];

  useEffect(() => {
    const ids = [
      ...friends.map((f) => f._id),
      ...recommendedUsers.map((u) => u._id),
      ...incomingRequests.map((r) => r?.sender?._id),
    ].filter(Boolean);
    ensureUsersPresence(ids);
  }, [friends, recommendedUsers, incomingRequests, ensureUsersPresence]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-base-100 min-h-full">
      <div className="container mx-auto space-y-10">
        {/* FREQUENTLY CONTACTED */}
        {frequentContacts.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Frequently Contacted</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {frequentContacts.map((friend) => (
                <FriendCard key={friend._id} friend={friend} onMessage={bumpMessageCount} />
              ))}
            </div>
          </section>
        )}

        {/* YOUR FRIENDS HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Your Friends</h2>

          <div className="flex items-center gap-3">
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-outline btn-sm"
                onClick={() => setLanguagesOpen((v) => !v)}
              >
                Supported Languages
                {supportedLanguages.length ? (
                  <span className="badge badge-primary badge-sm ml-2">{supportedLanguages.length}</span>
                ) : null}
              </div>
              {languagesOpen ? (
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-100 rounded-box z-[1] w-80 p-2 shadow max-h-80 overflow-y-auto"
                >
                  <li className="px-2 py-1 opacity-70 text-xs">
                    Your language: {String(authUser?.nativeLanguage || "").trim() || "Not set"}
                  </li>
                  {loadingSupportedLanguages ? (
                    <li className="px-2 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="loading loading-spinner loading-xs" />
                        Loading languages...
                      </span>
                    </li>
                  ) : supportedLanguages.length === 0 ? (
                    <li className="px-2 py-2 opacity-70">No languages available</li>
                  ) : (
                    supportedLanguages
                      .slice()
                      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")))
                      .map((lang) => {
                        const code = String(lang?.code || "").trim();
                        const name = String(lang?.name || code).trim();
                        if (!code) return null;
                        const isActive = String(authUser?.nativeLanguage || "").trim() === code;
                        return (
                          <li key={`supported-${code}`}>
                            <button
                              type="button"
                              className={isActive ? "active" : ""}
                              disabled={savingLanguage}
                              onClick={() => {
                                if (!code) return;
                                saveLanguageMutation(code);
                              }}
                              title={code}
                            >
                              <span className="flex items-center justify-between w-full">
                                <span className="truncate">{name}</span>
                                <span className="text-xs opacity-70">{code}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })
                  )}
                </ul>
              ) : null}
            </div>

            <div className="dropdown dropdown-end">
              <div tabIndex={0} role="button" className="btn btn-outline btn-sm">
                Recently Added
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-[1] w-64 p-2 shadow max-h-72 overflow-y-auto"
              >
                {recentlyAddedFriends.length === 0 ? (
                  <li className="opacity-70 px-2 py-1">No recently added friends</li>
                ) : (
                  recentlyAddedFriends.map(({ item }) => (
                    <li key={item._id}>
                      <Link to={`/chat/${item._id}`} onClick={() => bumpMessageCount(item)}>
                        <span className="flex items-center gap-2">
                          <img src={item.profilePic} alt={item.fullName} className="size-6 rounded-full" />
                          <span className="truncate">{item.fullName}</span>
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                const modal = document.getElementById("friend_requests_modal");
                if (modal?.showModal) modal.showModal();
              }}
            >
              <UsersIcon className="mr-2 size-4" />
              Friend Requests
              {incomingRequests.length > 0 && (
                <span className="badge badge-primary badge-sm ml-2">{incomingRequests.length}</span>
              )}
            </button>
          </div>
        </div>

        {loadingFriends ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : friends.length === 0 ? (
          <NoFriendsFound />
        ) : (
          <>
            <div className="flex justify-end">
              {friends.length > 4 && (
                <Link to="/friends" className="btn btn-link btn-sm">
                  Show More
                </Link>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {friends.slice(0, 4).map((friend) => (
                <FriendCard key={friend._id} friend={friend} onMessage={bumpMessageCount} />
              ))}
            </div>
          </>
        )}

        <section>
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">New Participants</h2>
                <p className="opacity-70">
                  Recently created accounts
                </p>
              </div>

              {recommendedUsers.length > 0 && (
                <Link to="/participants" className="btn btn-link btn-sm">
                  Show More
                </Link>
              )}
            </div>
          </div>

          {loadingUsers ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className="card bg-base-200 p-6 text-center">
              <h3 className="font-semibold text-lg mb-2">No recommendations available</h3>
              <p className="text-base-content opacity-70">
                Check back later for new language partners!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {participantsForHome.slice(0, 4).map((user) => {
                const hasRequestBeenSent = outgoingRequestsIds.has(user._id);

                return (
                  <div
                    key={user._id}
                    className="card bg-base-200 hover:shadow-lg transition-all duration-300"
                  >
                    <div className="card-body p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="avatar size-16 rounded-full relative">
                          <img src={user.profilePic} alt={user.fullName} />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-base-200 ${
                              onlineMap?.[user._id] ? "bg-success" : "bg-neutral-500"
                            }`}
                            title={onlineMap?.[user._id] ? "Online" : "Offline"}
                          />
                        </div>

                        <div>
                          <h3 className="font-semibold text-lg">{user.fullName}</h3>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm opacity-80 truncate">
                          {getCountryFlag(user.country)}
                          Country: {capitialize(user.country || "")}
                        </div>
                        <div className="text-sm opacity-80 truncate">
                          Language: {capitialize(user.nativeLanguage || "")}
                        </div>
                      </div>

                      {user.gender && (
                        <div className="text-sm opacity-80">Gender: {capitialize(user.gender)}</div>
                      )}

                      {user.bio && <p className="text-sm opacity-70">{user.bio}</p>}

                      {/* Action button */}
                      <button
                        className={`btn w-full mt-2 ${hasRequestBeenSent ? "btn-outline" : "btn-primary"}`}
                        onClick={() => {
                          if (hasRequestBeenSent) cancelRequestMutation(user._id);
                          else sendRequestMutation(user._id);
                        }}
                        disabled={isPending || canceling}
                      >
                        {hasRequestBeenSent ? (
                          <>
                            <XIcon className="size-4 mr-2" />
                            Undo Request
                          </>
                        ) : (
                          <>
                            <UserPlusIcon className="size-4 mr-2" />
                            Send Friend Request
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* FRIEND REQUESTS MODAL */}
        <dialog id="friend_requests_modal" className="modal">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Friend Requests</h3>

            {loadingRequests ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-lg" />
              </div>
            ) : incomingRequests.length === 0 ? (
              <div className="py-6 opacity-70">No pending friend requests</div>
            ) : (
              <div className="mt-4 space-y-3">
                {incomingRequests.map((req) => (
                  <div key={req._id} className="card bg-base-200">
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="avatar w-12 h-12 rounded-full bg-base-300 relative">
                            <img src={req.sender.profilePic} alt={req.sender.fullName} />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-base-200 ${
                                onlineMap?.[req.sender?._id] ? "bg-success" : "bg-neutral-500"
                              }`}
                              title={onlineMap?.[req.sender?._id] ? "Online" : "Offline"}
                            />
                          </div>
                          <div>
                            <div className="font-semibold">{req.sender.fullName}</div>
                            <div className="flex items-center justify-between gap-3 mt-1">
                              <div className="text-xs opacity-80 truncate">
                                {getCountryFlag(req.sender.country)}
                                Country: {req.sender.country || ""}
                              </div>
                              <div className="text-xs opacity-80 truncate">
                                Language: {req.sender.nativeLanguage || ""}
                              </div>
                            </div>
                          </div>
                        </div>

                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            try {
                              const raw = localStorage.getItem("aerosonix_recently_added");
                              const list = raw ? JSON.parse(raw) : [];
                              const next = [{ id: req.sender?._id, at: Date.now() }, ...list.filter((x) => x?.id !== req.sender?._id)].slice(0, 10);
                              localStorage.setItem("aerosonix_recently_added", JSON.stringify(next));
                              setRecentlyAdded(next);
                            } catch {
                              // ignore
                            }
                            acceptRequestMutation(req._id);
                          }}
                          disabled={accepting}
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-action">
              <form method="dialog">
                <button className="btn">Close</button>
              </form>
              <Link to="/notifications" className="btn btn-outline">
                Open Notifications
              </Link>
            </div>
          </div>
        </dialog>
      </div>
    </div>
  );
};

export default HomePage;
