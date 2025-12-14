import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, UserPlusIcon } from "lucide-react";

import { getRecommendedUsers, sendFriendRequest, getOutgoingFriendReqs } from "../lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { capitialize } from "../lib/utils";
import { getCountryFlag } from "../components/FriendCard";
import { useStreamChat } from "../context/StreamChatContext";

const ParticipantsPage = () => {
  const queryClient = useQueryClient();
  const { ensureUsersPresence, onlineMap } = useStreamChat();

  const [q, setQ] = useState("");

  const { data: recommendedUsers = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getRecommendedUsers,
  });

  const { data: outgoingFriendReqs } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });

  const outgoingIds = useMemo(() => {
    const s = new Set();
    (outgoingFriendReqs || []).forEach((r) => s.add(r?.recipient?._id));
    return s;
  }, [outgoingFriendReqs]);

  const { mutate: sendRequestMutation, isPending } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] }),
  });

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return recommendedUsers;
    return recommendedUsers.filter((u) => (u?.fullName || "").toLowerCase().includes(query));
  }, [recommendedUsers, q]);

  useEffect(() => {
    ensureUsersPresence(recommendedUsers.map((u) => u._id));
  }, [recommendedUsers, ensureUsersPresence]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-base-100 min-h-full">
      <div className="container mx-auto space-y-6 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Participants</h1>
          <Link to="/" className="btn btn-outline btn-sm">
            Back
          </Link>
        </div>

        <div className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body p-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 opacity-70" />
              <input
                className="input input-bordered w-full pl-10"
                placeholder="Search participants by name"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((user) => {
              const hasRequestBeenSent = outgoingIds.has(user._id);
              return (
                <div key={user._id} className="card bg-base-100 border border-base-300 shadow-sm">
                  <div className="card-body p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="avatar size-16 rounded-full relative">
                        <img src={user.profilePic} alt={user.fullName} />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-base-100 ${
                            onlineMap?.[user._id] ? "bg-success" : "bg-neutral-500"
                          }`}
                          title={onlineMap?.[user._id] ? "Online" : "Offline"}
                        />
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">{user.fullName}</h3>
                        {user.country && (
                          <div className="flex items-center text-xs opacity-70 mt-1">
                            {getCountryFlag(user.country)}
                            <span>{capitialize(user.country)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      className={`btn w-full mt-2 ${hasRequestBeenSent ? "btn-disabled" : "btn-primary"}`}
                      onClick={() => sendRequestMutation(user._id)}
                      disabled={hasRequestBeenSent || isPending}
                    >
                      <UserPlusIcon className="size-4 mr-2" />
                      {hasRequestBeenSent ? "Request Sent" : "Send Friend Request"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && recommendedUsers.length > 0 && filtered.length === 0 && (
          <div className="opacity-70">No participants found for “{q}”</div>
        )}
      </div>
    </div>
  );
};

export default ParticipantsPage;
