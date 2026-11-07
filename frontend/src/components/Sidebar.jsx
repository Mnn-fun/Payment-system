import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { settingsAPI } from "../services/api";

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userEmail = localStorage.getItem("userEmail") || "User";
  const [displayName, setDisplayName] = useState(userEmail.split("@")[0] || "User");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await settingsAPI.getProfile();
        if (data.full_name) {
          setDisplayName(data.full_name);
        } else if (data.username) {
          setDisplayName(data.username);
        }
        setIsAdmin(!!data.is_admin);
      } catch (err) {
        // fallback to email-derived name
      }
    };
    fetchProfile();
  }, []);

  const linkClass = (path) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium ${location.pathname === path
      ? "bg-blue-50 text-blue-600"
      : "text-gray-600 hover:bg-gray-50 hover:text-blue-600"
    }`;

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    // Dispatch auth-change event so App re-renders
    window.dispatchEvent(new Event("auth-change"));
    navigate("/auth");
  };

  const handleLinkClick = () => {
    // Close sidebar on mobile when a link is clicked
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
          aria-label="Close menu"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-64 bg-white h-screen border-r border-gray-200 flex flex-col fixed left-0 top-0 overflow-y-auto z-50
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="md:hidden absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Close menu"
        >
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Logo */}
        <div className="p-6 border-b border-gray-200 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">I</div>
          <h1 className="text-xl font-bold text-gray-900">InterPay</h1>
        </div>

        {/* Navigation - Main Menu */}
        <nav className="flex-1 px-4 mt-6 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-4">Main Menu</p>

          <Link to="/" className={linkClass("/")} onClick={handleLinkClick}>
            <span className="material-icons-outlined text-lg">dashboard</span>
            <span>Dashboard</span>
          </Link>

          <Link to="/wallet" className={linkClass("/wallet")} onClick={handleLinkClick}>
            <span className="material-icons-outlined text-lg">account_balance_wallet</span>
            <span>Wallet</span>
          </Link>

          <Link to="/transactions" className={linkClass("/transactions")} onClick={handleLinkClick}>
            <span className="material-icons-outlined text-lg">swap_horiz</span>
            <span>Transactions</span>
          </Link>

          <Link to="/cards" className={linkClass("/cards")} onClick={handleLinkClick}>
            <span className="material-icons-outlined text-lg">credit_card</span>
            <span>Cards</span>
          </Link>

          <Link to="/recipients" className={linkClass("/recipients")} onClick={handleLinkClick}>
            <span className="material-icons-outlined text-lg">people</span>
            <span>Saved Recipients</span>
          </Link>

          {isAdmin && (
            <Link to="/admin" className={linkClass("/admin")} onClick={handleLinkClick}>
              <span className="material-icons-outlined text-lg">admin_panel_settings</span>
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        {/* Settings Section */}
        <div className="px-4 pb-6 space-y-2 border-t border-gray-200 pt-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-4">Settings</p>
          <Link to="/settings" className={linkClass("/settings")} onClick={handleLinkClick}>
            <span className="material-icons-outlined text-lg">settings</span>
            <span>Preferences</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all font-medium"
          >
            <span className="material-icons-outlined text-lg">logout</span>
            <span>Logout</span>
          </button>
        </div>

        {/* Profile */}
        <Link 
          to="/settings" 
          onClick={onClose}
          className="px-4 py-4 border-t border-gray-200 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm group-hover:ring-4 ring-blue-600/10 transition-all">
            {userEmail[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
        </Link>
      </aside>
    </>
  );
}
