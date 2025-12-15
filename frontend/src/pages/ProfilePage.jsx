import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CameraIcon,
  LoaderIcon,
  MapPinIcon,
  SaveIcon,
  ShuffleIcon,
  UserIcon,
} from "lucide-react";

import useAuthUser from "../hooks/useAuthUser";
import useLogout from "../hooks/useLogout";
import { updateProfile } from "../lib/api";
import { LANGUAGES } from "../constants";
import { getCountryFlag } from "../components/FriendCard";
import { Link } from "react-router";

const ProfilePage = () => {
  const queryClient = useQueryClient();
  const { authUser } = useAuthUser();
  const { logoutMutation, isPending: isLoggingOut } = useLogout();

  const [formState, setFormState] = useState({
    fullName: "",
    bio: "",
    nativeLanguage: "",
    gender: "",
    location: "",
    profilePic: "",
  });

  useEffect(() => {
    if (!authUser) return;
    setFormState({
      fullName: authUser.fullName || "",
      bio: authUser.bio || "",
      nativeLanguage: authUser.nativeLanguage || "",
      gender: authUser.gender || "",
      location: authUser.location || "",
      profilePic: authUser.profilePic || "",
    });
  }, [authUser]);

  const derivedCountry = useMemo(() => {
    const value = formState.location;
    if (!value || typeof value !== "string") return "";
    const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return "";
    return parts[parts.length - 1];
  }, [formState.location]);

  const { mutate: saveMutation, isPending: saving } = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["authUser"] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || error?.message || "Something went wrong");
    },
  });

  const handleRandomAvatar = () => {
    const idx = Math.floor(Math.random() * 100) + 1;
    const randomAvatar = `https://api.dicebear.com/7.x/bottts/png?seed=${idx}`;
    setFormState({ ...formState, profilePic: randomAvatar });
    toast.success("Random profile picture generated!");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation(formState);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h1>
            <p className="opacity-70">Manage your onboarding details</p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/" className="btn btn-outline">
              Back
            </Link>
            <button
              className="btn btn-outline"
              onClick={logoutMutation}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Signing out...
                </>
              ) : (
                "Sign Out"
              )}
            </button>
          </div>
        </div>

        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="avatar">
                <div className="w-20 rounded-full bg-base-300 overflow-hidden">
                  {formState.profilePic ? (
                    <img src={formState.profilePic} alt="Profile" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <UserIcon className="size-10 opacity-40" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className="text-lg font-semibold">{authUser?.fullName}</div>
                <div className="text-sm opacity-70">{authUser?.email}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="badge badge-outline">
                      {getCountryFlag(derivedCountry)}
                      {derivedCountry ? `Country: ${derivedCountry}` : "Country"}
                    </span>
                    <span className="badge badge-secondary">
                      {formState.nativeLanguage ? `Language: ${formState.nativeLanguage}` : "Language"}
                    </span>
                    <span className="badge badge-ghost">
                      {formState.gender ? `Gender: ${formState.gender}` : "Gender"}
                    </span>
                  </div>
                </div>

              </div>

              <button type="button" onClick={handleRandomAvatar} className="btn btn-accent">
                <ShuffleIcon className="size-4 mr-2" />
                Random Avatar
              </button>
            </div>

            <div className="divider" />

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Full Name</span>
                </label>
                <input
                  type="text"
                  value={formState.fullName}
                  onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                  className="input input-bordered w-full"
                  placeholder="Your full name"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Bio</span>
                </label>
                <textarea
                  value={formState.bio}
                  onChange={(e) => setFormState({ ...formState, bio: e.target.value })}
                  className="textarea textarea-bordered h-28"
                  placeholder="Tell others about yourself"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Language</span>
                  </label>
                  <select
                    value={formState.nativeLanguage}
                    onChange={(e) => setFormState({ ...formState, nativeLanguage: e.target.value })}
                    className="select select-bordered w-full"
                    required
                  >
                    <option value="">Select your language</option>
                    {LANGUAGES.map((lang) => (
                      <option key={`native-${lang}`} value={lang.toLowerCase()}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Gender</span>
                  </label>
                  <select
                    value={formState.gender}
                    onChange={(e) => setFormState({ ...formState, gender: e.target.value })}
                    className="select select-bordered w-full"
                    required
                  >
                    <option value="">Select your gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Location</span>
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute top-1/2 transform -translate-y-1/2 left-3 size-5 text-base-content opacity-70" />
                  <input
                    type="text"
                    value={formState.location}
                    onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                    className="input input-bordered w-full pl-10"
                    placeholder="City, Country"
                    required
                  />
                </div>
                <div className="mt-1 text-xs opacity-70 flex items-center gap-2">
                  <CameraIcon className="size-3" />
                  Location must be in the format: City, Country
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Profile Picture URL</span>
                </label>
                <input
                  type="text"
                  value={formState.profilePic}
                  onChange={(e) => setFormState({ ...formState, profilePic: e.target.value })}
                  className="input input-bordered w-full"
                  placeholder="https://..."
                />
              </div>

              <button className="btn btn-primary w-full" disabled={saving} type="submit">
                {!saving ? (
                  <>
                    <SaveIcon className="size-5 mr-2" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <LoaderIcon className="animate-spin size-5 mr-2" />
                    Saving...
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
