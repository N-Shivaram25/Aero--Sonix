import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import CallPopupManager from "./CallPopupManager";
import OutgoingCallManager from "./OutgoingCallManager";
import RealtimeToastManager from "./RealtimeToastManager";

const Layout = ({ children, showSidebar = false }) => {
  return (
    <div className="min-h-screen bg-base-100">
      <div className="flex h-screen bg-base-100">
        {showSidebar && <Sidebar />}

        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />

          <main className="flex-1 min-h-0 overflow-y-auto bg-base-100">{children}</main>

          <CallPopupManager />
          <OutgoingCallManager />
          <RealtimeToastManager />
        </div>
      </div>
    </div>
  );
};
export default Layout;
