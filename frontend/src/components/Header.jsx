import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountAPI, settingsAPI } from '../services/api';

export default function Header({ profile }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileOpen2, setProfileOpen2] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // Profile state
  const [userEmail, setUserEmail] = useState(localStorage.getItem('userEmail') || 'user@example.com');
  const [userFullName, setUserFullName] = useState(localStorage.getItem('userFullName') || (userEmail.split('@')[0] || 'User'));
  const [editFullName, setEditFullName] = useState(userFullName);
  const [editEmail, setEditEmail] = useState(userEmail);
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  // Fetch real transactions for notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!notificationOpen) return;

      try {
        setNotificationsLoading(true);
        const data = await accountAPI.getTransactions();
        // Get the latest 3 transactions
        const latestNotifications = data.slice(0, 3).map((trx) => ({
          id: trx.id,
          type: trx.type,
          amount: trx.amount,
          currency: trx.currency,
          status: trx.status,
          created_at: trx.created_at,
          entry_type: trx.entry_type,
        }));
        if (profile && profile.profile_complete === false) {
          latestNotifications.unshift({
            id: 'sys-profile',
            type: 'SYSTEM ALERT',
            amount: 0,
            currency: '',
            status: 'PENDING',
            created_at: new Date().toISOString(),
            entry_type: 'ALERT',
            message: 'Please complete your profile to secure your account.'
          });
        }
        setNotifications(latestNotifications);
      } catch (error) {
        console.error('Error fetching notifications:', error);
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchNotifications();
  }, [notificationOpen, profile]);

  // Close dropdowns when clicking outside using document listener (avoids overlay blocking clicks)
  useEffect(() => {
    function handleOutsideClick(e) {
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      if (notificationOpen && notifRef.current && !notifRef.current.contains(e.target)) {
        setNotificationOpen(false);
      }
    }

    if (profileOpen || notificationOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [profileOpen, notificationOpen]);

  // Sync profile from backend on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await settingsAPI.getProfile();
        if (res) {
          if (res.email) {
            setUserEmail(res.email);
            setEditEmail(res.email);
            localStorage.setItem('userEmail', res.email);
          }
          const name = res.full_name || res.username || res.email.split('@')[0];
          setUserFullName(name);
          setEditFullName(name);
          localStorage.setItem('userFullName', name);
        }
      } catch (err) {
        // fallback to localStorage values
      }
    };

    fetchProfile();
  }, []);

  // Settings form component (local only, persisted to localStorage)
  function SettingsForm() {
    const [emailNotif, setEmailNotif] = useState(localStorage.getItem('settings.emailNotifications') === 'true');
    const [pushNotif, setPushNotif] = useState(localStorage.getItem('settings.pushNotifications') === 'true');
    const [twoFactor, setTwoFactor] = useState(localStorage.getItem('settings.twoFactor') === 'true');

    useEffect(() => {
      localStorage.setItem('settings.emailNotifications', emailNotif ? 'true' : 'false');
    }, [emailNotif]);

    useEffect(() => {
      localStorage.setItem('settings.pushNotifications', pushNotif ? 'true' : 'false');
    }, [pushNotif]);

    useEffect(() => {
      localStorage.setItem('settings.twoFactor', twoFactor ? 'true' : 'false');
    }, [twoFactor]);

    return (
      <>
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Email Notifications</p>
            <p className="text-xs text-gray-500">Receive updates via email</p>
          </div>
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} className="w-4 h-4" />
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Push Notifications</p>
            <p className="text-xs text-gray-500">Receive push alerts</p>
          </div>
          <input type="checkbox" checked={pushNotif} onChange={(e) => setPushNotif(e.target.checked)} className="w-4 h-4" />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Two-Factor Auth</p>
            <p className="text-xs text-gray-500">Enhanced security</p>
          </div>
          <input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} className="w-4 h-4" />
        </div>
      </>
    );
  }

  const handleLogout = () => {
    // Mirror Sidebar logout behaviour
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userFullName');
    navigate('/auth');
  };

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your balances, rates, and recent activity.</p>
        </div>
        <div className="flex items-center gap-6">
          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotificationOpen(!notificationOpen)}
              className="relative text-gray-600 hover:text-blue-600 transition-colors"
            >
              <span className="material-icons-outlined">notifications</span>
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
            </button>

            {/* Notification Dropdown */}
            {notificationOpen && (
              <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-xl border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900">Recent Transactions</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-gray-500">Loading transactions...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-gray-500">No transactions yet</p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div key={notif.id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                        {notif.entry_type === 'ALERT' ? (
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-100">
                              <span className="material-icons-round text-sm text-amber-700">warning</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-amber-900 font-semibold">{notif.type}</p>
                              <p className="text-xs text-amber-700 mt-1">{notif.message}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${notif.status === 'COMPLETED' ? 'bg-green-100' : notif.status === 'PENDING' ? 'bg-yellow-100' : 'bg-red-100'}`}>
                              <span className={`material-icons-round text-sm ${notif.status === 'COMPLETED' ? 'text-green-700' : notif.status === 'PENDING' ? 'text-yellow-700' : 'text-red-700'}`}>
                                {notif.entry_type === 'CREDIT' ? 'call_received' : 'call_made'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <p className="text-sm text-gray-900 font-semibold">{notif.type === 'TRANSFER' ? notif.entry_type : notif.type}</p>
                                <span className={`text-sm font-bold flex-shrink-0 ${notif.entry_type === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                                  {notif.entry_type === 'DEBIT' ? '-' : '+'}{notif.amount.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {notif.currency} • {notif.status}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="p-4 border-t border-gray-100 text-center">
                  <button onClick={() => navigate('/transactions')} className="text-sm text-blue-600 font-semibold hover:text-blue-700">View all transactions</button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Menu */}
          <div ref={profileRef} className="flex items-center gap-3 pl-6 border-l border-gray-200 relative">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900">{userFullName}</p>
              <p className="text-xs text-gray-600">Premium Member</p>
            </div>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-10 h-10 rounded-full bg-blue-600 overflow-hidden ring-2 ring-blue-600/20 text-white font-bold flex items-center justify-center hover:ring-blue-600/40 transition-all"
            >
              {userFullName.charAt(0).toUpperCase()}
            </button>

            {/* Profile Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{userEmail}</p>
                  <p className="text-xs text-gray-500 mt-1">Premium Account</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-3 font-medium"
                  >
                    <span className="material-icons-outlined text-lg">person</span>
                    Edit Profile
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-3 font-medium"
                  >
                    <span className="material-icons-outlined text-lg">settings</span>
                    Settings
                  </button>
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-3 font-medium"
                  >
                    <span className="material-icons-outlined text-lg">logout</span>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Edit Profile Modal */}
      {profileOpen2 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl max-w-md w-full mx-4 shadow-xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Profile</h2>
              <button
                onClick={() => setProfileOpen2(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Full Name</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your full name"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setProfileOpen2(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Persist profile locally (backend update endpoint not available)
                  setUserFullName(editFullName);
                  setUserEmail(editEmail);
                  localStorage.setItem('userFullName', editFullName);
                  localStorage.setItem('userEmail', editEmail);
                  alert('Profile updated successfully');
                  setProfileOpen2(false);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl max-w-md w-full mx-4 shadow-xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <SettingsForm />
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => {
                  // Save settings handled inside SettingsForm via localStorage event
                  setSettingsOpen(false);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* dropdowns are closed via document click handler (no overlay) */}
    </>
  );
}
