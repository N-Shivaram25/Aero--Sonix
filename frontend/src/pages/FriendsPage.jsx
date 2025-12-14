import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";

import { getUserFriends } from "../lib/api";
import FriendCard from "../components/FriendCard";
import NoFriendsFound from "../components/NoFriendsFound";

const FriendsPage = () => {
  const [q, setQ] = useState("");

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter((f) => (f?.fullName || "").toLowerCase().includes(query));
  }, [friends, q]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-base-100 min-h-full">
      <div className="container mx-auto space-y-6 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Friends</h1>
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
                placeholder="Search friends by name"
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
        ) : friends.length === 0 ? (
          <NoFriendsFound />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((friend) => (
              <FriendCard key={friend._id} friend={friend} />
            ))}
          </div>
        )}

        {!isLoading && friends.length > 0 && filtered.length === 0 && (
          <div className="opacity-70">No friends found for “{q}”</div>
        )}
      </div>
    </div>
  );
};

export default FriendsPage;
