import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import CallPopupManager from "./CallPopupManager";
import OutgoingCallManager from "./OutgoingCallManager";
import RealtimeToastManager from "./RealtimeToastManager";

const Layout = ({ children, showSidebar = false }) => {
  return (
    <div className="min-h-screen bg-base-100">
      {showSidebar ? (
        <div className="drawer lg:drawer-open">
          <input id="app-drawer" type="checkbox" className="drawer-toggle" />
          <div className="drawer-content flex flex-col min-w-0 min-h-screen">
            <Navbar />
            <main className="flex-1 min-h-0 overflow-y-auto bg-base-100">{children}</main>
            <CallPopupManager />
            <OutgoingCallManager />
            <RealtimeToastManager />
          </div>
          <div className="drawer-side z-40">
            <label htmlFor="app-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
            <Sidebar />
          </div>
        </div>
      ) : (
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1 min-h-0 overflow-y-auto bg-base-100">{children}</main>
          <CallPopupManager />
          <OutgoingCallManager />
          <RealtimeToastManager />
        </div>
      )}
    </div>
  );
};
export default Layout;
