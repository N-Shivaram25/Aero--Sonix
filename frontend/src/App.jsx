import { Navigate, Route, Routes, useLocation } from "react-router";

import HomePage from "./pages/HomePage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import CallPage from "./pages/CallPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import AdminLoginPage from "./pages/AdminLoginPage.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import FriendsPage from "./pages/FriendsPage.jsx";
import ParticipantsPage from "./pages/ParticipantsPage.jsx";
import AiRobotHomePage from "./pages/ai-robot/AiRobotHomePage.jsx";
import AiRobotInterviewPage from "./pages/ai-robot/AiRobotInterviewPage.jsx";
import AiRobotEnglishFluencyPage from "./pages/ai-robot/AiRobotEnglishFluencyPage.jsx";
import AiRobotLanguageLearningPage from "./pages/ai-robot/AiRobotLanguageLearningPage.jsx";
import AiRobotProgrammingPage from "./pages/ai-robot/AiRobotProgrammingPage.jsx";

import { Toaster } from "react-hot-toast";

import PageLoader from "./components/PageLoader.jsx";
import useAuthUser from "./hooks/useAuthUser.js";
import Layout from "./components/Layout.jsx";
import { useThemeStore } from "./store/useThemeStore.js";
import { StreamChatProvider } from "./context/StreamChatContext.jsx";

const App = () => {
  const { isLoading, authUser } = useAuthUser();
  const { theme } = useThemeStore();

  const location = useLocation();
  const path = location?.pathname || "";
  const isPublicRoute =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/admin/login");

  const isAuthenticated = Boolean(authUser);
  const isOnboarded = authUser?.isOnboarded;

  if (isLoading && !isPublicRoute) return <PageLoader />;

  const routes = (
    <Routes>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route
        path="/"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <HomePage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />
      <Route
        path="/signup"
        element={!isAuthenticated ? <SignUpPage /> : <Navigate to={isOnboarded ? "/" : "/onboarding"} />}
      />
      <Route
        path="/login"
        element={!isAuthenticated ? <LoginPage /> : <Navigate to={isOnboarded ? "/" : "/onboarding"} />}
      />
      <Route
        path="/notifications"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <NotificationsPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/friends"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <FriendsPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/participants"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <ParticipantsPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/profile"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <ProfilePage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/ai-robot"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <Navigate to="/ai-robot/home" replace />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/ai-robot/home"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <AiRobotHomePage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/ai-robot/interview"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <AiRobotInterviewPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/ai-robot/english-fluency"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <AiRobotEnglishFluencyPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/ai-robot/language-learning"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <AiRobotLanguageLearningPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/ai-robot/programming"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={true}>
              <AiRobotProgrammingPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />
      <Route
        path="/call/:id"
        element={isAuthenticated && isOnboarded ? <CallPage /> : <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />}
      />

      <Route
        path="/chat/:id"
        element={
          isAuthenticated && isOnboarded ? (
            <Layout showSidebar={false}>
              <ChatPage />
            </Layout>
          ) : (
            <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
          )
        }
      />

      <Route
        path="/onboarding"
        element={
          isAuthenticated ? (!isOnboarded ? <OnboardingPage /> : <Navigate to="/" />) : <Navigate to="/login" />
        }
      />
    </Routes>
  );

  return (
    <div className="min-h-screen" data-theme={theme}>
      {isAuthenticated && !isPublicRoute ? (
        <StreamChatProvider authUser={authUser}>{routes}</StreamChatProvider>
      ) : (
        routes
      )}

      <Toaster />
    </div>
  );
};
export default App;
