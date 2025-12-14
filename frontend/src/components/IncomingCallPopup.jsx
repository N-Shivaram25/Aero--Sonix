import { VideoIcon, XIcon } from "lucide-react";

const IncomingCallPopup = ({ call, onAccept, onDecline }) => {
  if (!call) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80">
      <div className="card bg-base-100 shadow-xl border border-base-300">
        <div className="card-body p-4">
          <div className="flex items-center gap-3">
            <div className="avatar relative">
              <div className="w-12 rounded-full">
                <img src={call.fromUser?.image} alt={call.fromUser?.name} />
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-base-100 ${
                  call.isCallerOnline === false ? "bg-neutral-500" : "bg-success"
                }`}
                title={call.isCallerOnline === false ? "Offline" : "Online"}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">Incoming Video Call</div>
              <div className="text-sm opacity-70 truncate">{call.fromUser?.name}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button className="btn btn-success btn-sm text-white" onClick={onAccept}>
              <VideoIcon className="size-4" />
            </button>
            <button className="btn btn-error btn-sm text-white" onClick={onDecline}>
              <XIcon className="size-4" />
            </button>
          </div>

          <div className="mt-2 text-xs opacity-70">Pop-up will stay until you accept or decline.</div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallPopup;
