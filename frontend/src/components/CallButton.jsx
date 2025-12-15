import { VideoIcon } from "lucide-react";

function CallButton({ handleVideoCall, className = "" }) {
  return (
    <button onClick={handleVideoCall} className={`btn btn-success btn-sm text-white ${className}`.trim()}>
      <VideoIcon className="size-5" />
    </button>
  );
}

export default CallButton;
