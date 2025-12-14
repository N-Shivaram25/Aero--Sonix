import { VideoIcon, XIcon } from "lucide-react";

const OutgoingCallPopup = ({ call, onCancel }) => {
  if (!call) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80">
      <div className="card bg-base-100 shadow-xl border border-base-300">
        <div className="card-body p-4">
          <div className="flex items-center gap-3">
            <div className="avatar">
              <div className="w-12 rounded-full">
                {call.toUser?.image ? (
                  <img src={call.toUser.image} alt={call.toUser?.name} />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-base-200" />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate flex items-center gap-2">
                <VideoIcon className="size-4" />
                Ringing...
              </div>
              <div className="text-sm opacity-70 truncate">{call.toUser?.name || "Friend"}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button className="btn btn-error btn-sm text-white" onClick={onCancel}>
              <XIcon className="size-4" />
            </button>
          </div>

          <div className="mt-2 text-xs opacity-70">Will stop ringing automatically in 15 seconds.</div>
        </div>
      </div>
    </div>
  );
};

export default OutgoingCallPopup;
