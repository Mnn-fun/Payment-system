import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Transactions from "./pages/Transactions";
import Cards from "./pages/Cards";
import Recipients from "./pages/Recipients";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Sidebar from "./components/Sidebar";

// Protected Route Wrapper
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/auth" />;
}

function App() {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("token")
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredReason, setSessionExpiredReason] = useState("");

  // Listen for auth changes (login/logout) via custom event
  useEffect(() => {
    const handleAuthChange = () => {
      setIsAuthenticated(!!localStorage.getItem("token"));
    };
    const handleSessionExpired = (e) => {
      setSessionExpired(true);
      if (e && e.detail && e.detail.reason) {
        setSessionExpiredReason(e.detail.reason);
      } else {
        setSessionExpiredReason("token");
      }
    };

    window.addEventListener("auth-change", handleAuthChange);
    // Also listen for storage events (cross-tab sync)
    window.addEventListener("storage", handleAuthChange);
    window.addEventListener("session-expired", handleSessionExpired);

    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
      window.removeEventListener("session-expired", handleSessionExpired);
    };
  }, []);

  // Close mobile sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const isAuthPage = location.pathname === "/auth";
  const showSidebar = isAuthenticated && !isAuthPage;

  const handleLoginAgain = () => {
    localStorage.removeItem("token");
    setSessionExpired(false);
    setIsAuthenticated(false);
    window.dispatchEvent(new Event("auth-change"));
  };

  return (
    <>
      {/* Global Timeout Blur Modal */}
      {sessionExpired && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 transition-all">
          <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] p-8 max-w-sm w-full text-center border border-gray-100">
            <div className="text-5xl mb-4">⌛</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Expired</h2>
            <p className="text-gray-500 mb-6 text-sm">
              {sessionExpiredReason === "wrong-pin"
                ? "Due to multiple incorrect PIN attempts, we have logged you out for your security. Please log in again to continue."
                : "For your security, your session has timed out. Please log in again to continue."}
            </p>
            <button
              onClick={handleLoginAgain}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl font-bold transition-all shadow-sm"
            >
              Log In Again
            </button>
          </div>
        </div>
      )}

      <div className={`flex min-h-screen ${sessionExpired ? 'pointer-events-none select-none blur-[2px]' : ''}`}>
        {/* Sidebar — only when authenticated and not on login page */}
        {showSidebar && (
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content area */}
        <div
          className={`flex-1 min-h-screen bg-gray-50 ${showSidebar ? "md:ml-64" : ""
            }`}
        >
          {/* Mobile burger button — only on authenticated pages */}
          {showSidebar && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
              aria-label="Open menu"
            >
              <svg
                className="w-6 h-6 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}

          <div className="p-6">
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/wallet"
                element={
                  <ProtectedRoute>
                    <Wallet />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transactions"
                element={
                  <ProtectedRoute>
                    <Transactions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cards"
                element={
                  <ProtectedRoute>
                    <Cards />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recipients"
                element={
                  <ProtectedRoute>
                    <Recipients />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
