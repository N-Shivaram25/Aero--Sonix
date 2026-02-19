import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import CallPopupManager from "./CallPopupManager";
import OutgoingCallManager from "./OutgoingCallManager";
import RealtimeToastManager from "./RealtimeToastManager";
import { useEffect, useState } from "react";

const Layout = ({ children, showSidebar = false }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aerosonix_sidebar_collapsed");
      if (raw === "1") setSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("aerosonix_sidebar_collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-base-100 w-full overflow-x-hidden">
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
            <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
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
