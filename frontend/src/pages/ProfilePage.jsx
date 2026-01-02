import { useEffect, useMemo, useRef, useState } from "react";
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
import { cloneVoice, getMyVoiceProfile, updateProfile } from "../lib/api";
import { LANGUAGES } from "../constants";
import { getCountryFlag } from "../components/FriendCard";
import { Link } from "react-router";

const ProfilePage = () => {
  const queryClient = useQueryClient();
  const { authUser } = useAuthUser();
  const { logoutMutation, isPending: isLoggingOut } = useLogout();

  const [voiceUploadPct, setVoiceUploadPct] = useState(0);
  const [voiceId, setVoiceId] = useState("");
  const [voiceCloneStatus, setVoiceCloneStatus] = useState("idle");
  const [voiceCloneError, setVoiceCloneError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recorder, setRecorder] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);

  const voicePollIntervalRef = useRef(null);
  const voicePollStartedAtRef = useRef(0);

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

  useEffect(() => {
    const loadVoiceProfile = async () => {
      try {
        const res = await getMyVoiceProfile();
        setVoiceId(res?.elevenLabsVoiceId || "");
        setVoiceCloneStatus(res?.elevenLabsVoiceCloneStatus || "idle");
        setVoiceCloneError(res?.elevenLabsVoiceCloneError || "");

        if (!res?.elevenLabsVoiceId && res?.elevenLabsVoiceCloneStatus === "processing") {
          startVoicePolling();
        }
      } catch {
        // ignore
      }
    };
    if (authUser) loadVoiceProfile();
  }, [authUser]);

  useEffect(() => {
    return () => {
      if (voicePollIntervalRef.current) {
        clearInterval(voicePollIntervalRef.current);
        voicePollIntervalRef.current = null;
      }
    };
  }, []);

  const startVoicePolling = () => {
    if (voicePollIntervalRef.current) return;
    voicePollStartedAtRef.current = Date.now();

    voicePollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getMyVoiceProfile();
        const nextVoiceId = res?.elevenLabsVoiceId || "";
        const nextStatus = res?.elevenLabsVoiceCloneStatus || "idle";
        const nextErr = res?.elevenLabsVoiceCloneError || "";

        setVoiceId(nextVoiceId);
        setVoiceCloneStatus(nextStatus);
        setVoiceCloneError(nextErr);

        const elapsed = Date.now() - (voicePollStartedAtRef.current || Date.now());
        if (nextVoiceId || nextStatus === "failed" || elapsed > 180000) {
          if (voicePollIntervalRef.current) {
            clearInterval(voicePollIntervalRef.current);
            voicePollIntervalRef.current = null;
          }

          if (nextVoiceId) {
            toast.success("Voice ID Created");
            queryClient.invalidateQueries({ queryKey: ["authUser"] });
          } else if (nextStatus === "failed") {
            toast.error(String(nextErr || "Voice cloning failed"));
          } else {
            toast.error("Voice is still processing. Please wait and refresh later.");
          }
        }
      } catch {
        // ignore
      }
    }, 3000);
  };

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

  const { mutate: uploadVoiceMutation, isPending: uploadingVoice } = useMutation({
    mutationFn: cloneVoice,
    onSuccess: (data) => {
      setVoiceUploadPct(0);
      setRecordedBlob(null);

      const status = data?.status || data?.voiceCloneStatus;
      if (status === "processing") {
        setVoiceId("");
        setVoiceCloneStatus("processing");
        setVoiceCloneError("");
        toast.success("Voice uploaded. Processing in ElevenLabs...");
        startVoicePolling();
        return;
      }

      const nextRaw = data?.voiceId;
      const next = typeof nextRaw === "string" ? nextRaw : nextRaw ? String(nextRaw) : "";
      if (next) {
        setVoiceId(next);
        setVoiceCloneStatus("ready");
        setVoiceCloneError("");
        toast.success("Voice ID Created");
        queryClient.invalidateQueries({ queryKey: ["authUser"] });
      } else {
        toast.success("Voice uploaded. Processing...");
        startVoicePolling();
      }
    },
    onError: (error) => {
      if (error?.response?.status === 401) {
        return;
      }
      const apiMessage = error?.response?.data?.message;
      const details = error?.response?.data?.details;
      const detailsText =
        typeof details === "string" ? details : details?.detail || details?.message || details?.error;
      toast.error(String(detailsText || apiMessage || error?.message || "Could not upload voice"));
      setVoiceCloneStatus("failed");
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

  const stopRecording = () => {
    try {
      recorder?.stop();
    } catch {
      // ignore
    }
  };

  const startRecording = async () => {
    try {
      setRecordedBlob(null);
      setRecordSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType = preferredTypes.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });

      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      setRecorder(rec);

      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e?.data && e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = () => {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        setRecordedBlob(blob);
        setIsRecording(false);
      };

      setIsRecording(true);
      rec.start(250);
    } catch (error) {
      console.error("Error starting recording", error);
      const name = error?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Please allow microphone access to record your voice.");
      } else {
        toast.error("Could not start recording. Please check microphone permissions.");
      }
    }
  };

  useEffect(() => {
    if (!isRecording) return;

    const id = setInterval(() => {
      setRecordSeconds((s) => {
        const next = s + 1;
        if (next >= 60) {
          try {
            stopRecording();
          } catch {
            // ignore
          }
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [isRecording]);

  const handleCreateVoiceId = async () => {
    if (isRecording) return;

    if (!recordedBlob) {
      toast.error("Please record your voice first");
      return;
    }

    if (recordSeconds < 30) {
      toast.error("Minimum recording duration is 30 seconds");
      return;
    }

    uploadVoiceMutation({
      audio: recordedBlob,
      onUploadProgress: (evt) => {
        const total = evt?.total || 0;
        const loaded = evt?.loaded || 0;
        if (total > 0) setVoiceUploadPct(Math.round((loaded / total) * 100));
      },
    });
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

            <div className="space-y-3">
              <div className="text-lg font-semibold">Voice Cloning</div>
              <div className="text-sm opacity-70">
                Record your voice (Minimum 30 seconds, Maximum 1 Minute). No background noise.
              </div>
              <div className="text-sm opacity-70">
                Current Voice ID:{" "}
                {voiceId ? (
                  String(voiceId)
                ) : voiceCloneStatus === "processing" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="loading loading-spinner loading-xs" />
                    Processing...
                  </span>
                ) : voiceCloneStatus === "failed" ? (
                  <span className="text-error">Failed{voiceCloneError ? `: ${voiceCloneError}` : ""}</span>
                ) : (
                  "Not uploaded"
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  className={`btn ${isRecording ? "btn-error" : "btn-primary"}`}
                  onClick={() => {
                    if (isRecording) return stopRecording();
                    return startRecording();
                  }}
                  disabled={uploadingVoice || voiceCloneStatus === "processing"}
                >
                  {isRecording ? "Stop Recording" : "Live Voice Recording"}
                </button>

                <div className="text-sm opacity-70">Recorded: {recordSeconds}s</div>

                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleCreateVoiceId}
                  disabled={uploadingVoice || isRecording || voiceCloneStatus === "processing"}
                >
                  {uploadingVoice ? (
                    <>
                      <LoaderIcon className="animate-spin size-5 mr-2" />
                      Uploading...
                    </>
                  ) : voiceCloneStatus === "processing" ? (
                    <>
                      <LoaderIcon className="animate-spin size-5 mr-2" />
                      Processing...
                    </>
                  ) : (
                    "Create Voice ID"
                  )}
                </button>

                {uploadingVoice ? (
                  <div className="flex-1 min-w-[180px]">
                    <progress className="progress progress-primary w-full" value={voiceUploadPct} max="100" />
                    <div className="text-xs opacity-70 mt-1">{voiceUploadPct}%</div>
                  </div>
                ) : null}
              </div>
            </div>

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
