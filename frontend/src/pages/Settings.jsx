import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { settingsAPI, accountAPI } from "../services/api";

const SettingCard = ({ title, description, children }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6 sm:mb-8">
    <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-50 bg-gray-50/30">
      <h2 className="text-base sm:text-lg font-bold text-gray-900">{title}</h2>
      <p className="text-xs sm:text-sm text-gray-500 font-medium">{description}</p>
    </div>
    <div className="p-4 sm:p-8">{children}</div>
  </div>
);

const ToggleSwitch = ({ label, description, isEnabled, onToggle, disabled }) => (
  <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
    <div className="pr-4">
      <p className="text-sm font-bold text-gray-800">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </div>
    <button
      onClick={() => onToggle(!isEnabled)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${isEnabled ? "bg-blue-600" : "bg-gray-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white transition duration-300 ${isEnabled ? "translate-x-5" : "translate-x-0.5"
          }`}
      />
    </button>
  </div>
);

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg font-medium text-sm transition-all ${type === "success"
        ? "bg-green-600 text-white"
        : "bg-red-600 text-white"
        }`}
    >
      {message}
    </div>
  );
};

export default function Settings() {
  const navigate = useNavigate();

  // Profile state
  const [profile, setProfile] = useState({
    fullName: "",
    username: "",
    email: "",
    bio: "",
    phoneNumber: "",
  });
  const [originalProfile, setOriginalProfile] = useState(null);

  // Password state
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  // PIN state
  const [transactionPin, setTransactionPin] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  // Notification state
  const [notifs, setNotifs] = useState({
    security: true,
    transactions: true,
    marketing: false,
    weekly: true,
  });

  // 2FA state
  const [twoFactor, setTwoFactor] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Backup codes state
  const [backupCodes, setBackupCodes] = useState([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  // ========================
  // Fetch data on mount
  // ========================
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [profileData, notifsData] = await Promise.all([
          settingsAPI.getProfile(),
          settingsAPI.getNotifications(),
        ]);

        const profileState = {
          fullName: profileData.full_name || "",
          username: profileData.username || "",
          email: profileData.email || "",
          bio: profileData.bio || "",
          phoneNumber: profileData.phone_number || "",
        };
        setProfile(profileState);
        setOriginalProfile(profileState);

        setNotifs({
          security: notifsData.notify_security,
          transactions: notifsData.notify_transactions,
          marketing: notifsData.notify_marketing,
          weekly: notifsData.notify_weekly,
        });
        setTwoFactor(notifsData.two_factor_enabled);
      } catch (error) {
        showToast(error.message || "Failed to load settings", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ========================
  // Save Profile
  // ========================
  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const result = await settingsAPI.updateProfile({
        full_name: profile.fullName,
        username: profile.username,
        bio: profile.bio,
        phone_number: profile.phoneNumber,
      });

      const updated = {
        fullName: result.full_name || "",
        username: result.username || "",
        email: result.email || "",
        bio: result.bio || "",
        phoneNumber: result.phone_number || "",
      };
      setProfile(updated);
      setOriginalProfile(updated);
      showToast("Profile updated successfully");
    } catch (error) {
      showToast(error.message || "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  // ========================
  // Cancel Profile edits
  // ========================
  const handleCancel = () => {
    if (originalProfile) {
      setProfile(originalProfile);
    }
  };

  // ========================
  // Change Password
  // ========================
  const handleChangePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      showToast("Please fill in all password fields", "error");
      return;
    }
    if (passwords.new !== passwords.confirm) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (passwords.new.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }

    try {
      setSaving(true);
      await settingsAPI.changePassword(
        passwords.current,
        passwords.new,
        passwords.confirm
      );
      setPasswords({ current: "", new: "", confirm: "" });
      showToast("Password updated successfully");
    } catch (error) {
      showToast(error.message || "Failed to update password", "error");
    } finally {
      setSaving(false);
    }
  };

  // ========================
  // Change Transaction PIN
  // ========================
  const handleChangeTransactionPin = async () => {
    if (!transactionPin.current || !transactionPin.new || !transactionPin.confirm) {
      showToast("Please fill in all PIN fields", "error");
      return;
    }
    if (transactionPin.new !== transactionPin.confirm) {
      showToast("New PINs do not match", "error");
      return;
    }
    if (transactionPin.new.length !== 6) {
      showToast("Transaction PIN must be exactly 6 digits", "error");
      return;
    }

    try {
      setSaving(true);
      await accountAPI.changeTransactionPin(transactionPin.current, transactionPin.new);
      setTransactionPin({ current: "", new: "", confirm: "" });
      showToast("Transaction PIN updated successfully");
    } catch (error) {
      showToast(error.message || "Failed to update PIN", "error");
    } finally {
      setSaving(false);
    }
  };

  // ========================
  // Update Notifications
  // ========================
  const handleNotifToggle = async (key, value) => {
    // Optimistic update
    setNotifs((prev) => ({ ...prev, [key]: value }));

    const fieldMap = {
      security: "notify_security",
      transactions: "notify_transactions",
      marketing: "notify_marketing",
      weekly: "notify_weekly",
    };

    try {
      await settingsAPI.updateNotifications({ [fieldMap[key]]: value });
    } catch (error) {
      // Revert on failure
      setNotifs((prev) => ({ ...prev, [key]: !value }));
      showToast(error.message || "Failed to update notification", "error");
    }
  };

  // ========================
  // Toggle 2FA
  // ========================
  const handleTwoFactorToggle = async (value) => {
    setTwoFactor(value);
    try {
      await settingsAPI.updateNotifications({ two_factor_enabled: value });
      showToast(
        value
          ? "Two-factor authentication enabled"
          : "Two-factor authentication disabled"
      );
    } catch (error) {
      setTwoFactor(!value);
      showToast(error.message || "Failed to update 2FA", "error");
    }
  };

  // ========================
  // Backup Codes
  // ========================
  const handleManageCodes = async () => {
    try {
      setLoading(true);
      const codes = await settingsAPI.getBackupCodes();
      setBackupCodes(codes);
      setShowBackupCodes(true);
    } catch (error) {
      showToast(error.message || "Failed to fetch backup codes", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCodes = async () => {
    try {
      setLoading(true);
      const newCodes = await settingsAPI.generateBackupCodes();
      setBackupCodes(newCodes);
      showToast("Generated new backup codes successfully");
    } catch (error) {
      showToast(error.message || "Failed to generate backup codes", "error");
    } finally {
      setLoading(false);
    }
  };

  // ========================
  // Delete Account
  // ========================
  const handleDeleteAccount = async () => {
    try {
      await settingsAPI.deleteAccount();
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");
      window.dispatchEvent(new Event("auth-change"));
      navigate("/auth");
    } catch (error) {
      showToast(error.message || "Failed to delete account", "error");
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">
            Manage your account details and security preferences.
          </p>
        </div>
        <div className="mt-6 md:mt-0 flex gap-3">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-semibold transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Profile Information */}
      <SettingCard
        title="Profile Information"
        description="Update your profile and personal details."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={profile.fullName}
              onChange={(e) =>
                setProfile({ ...profile, fullName: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Username
            </label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) =>
                setProfile({ ...profile, username: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">+91</span>
              <input
                type="tel"
                value={profile.phoneNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setProfile({ ...profile, phoneNumber: val });
                }}
                placeholder="10-digit mobile number"
                className="w-full pl-14 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Used for payment checkout verification
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">
              Email cannot be changed
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Bio
            </label>
            <textarea
              value={profile.bio}
              onChange={(e) =>
                setProfile({ ...profile, bio: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows="3"
            />
          </div>
        </div>
      </SettingCard>

      {/* Transaction PIN */}
      <SettingCard
        title="Transaction PIN"
        description="Update your 6-digit PIN used for deposits, withdrawals, and transfers."
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Current PIN
            </label>
            <input
              type="password"
              placeholder="••••••"
              maxLength={6}
              value={transactionPin.current}
              onChange={(e) =>
                setTransactionPin({ ...transactionPin, current: e.target.value.replace(/\D/g, '').slice(0, 6) })
              }
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono tracking-widest text-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                New PIN
              </label>
              <input
                type="password"
                placeholder="••••••"
                maxLength={6}
                value={transactionPin.new}
                onChange={(e) =>
                  setTransactionPin({ ...transactionPin, new: e.target.value.replace(/\D/g, '').slice(0, 6) })
                }
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono tracking-widest text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Confirm New PIN
              </label>
              <input
                type="password"
                placeholder="••••••"
                maxLength={6}
                value={transactionPin.confirm}
                onChange={(e) =>
                  setTransactionPin({ ...transactionPin, confirm: e.target.value.replace(/\D/g, '').slice(0, 6) })
                }
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono tracking-widest text-lg"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button
              onClick={handleChangeTransactionPin}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg transition-colors"
            >
              Update PIN
            </button>
          </div>
        </div>
      </SettingCard>

      {/* Security & Password */}
      <SettingCard
        title="Security & Password"
        description="Update your password and enable two-factor authentication."
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Current Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={passwords.current}
              onChange={(e) =>
                setPasswords({ ...passwords, current: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                New Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={passwords.new}
                onChange={(e) =>
                  setPasswords({ ...passwords, new: e.target.value })
                }
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={passwords.confirm}
                onChange={(e) =>
                  setPasswords({ ...passwords, confirm: e.target.value })
                }
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={saving}
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold disabled:text-blue-400"
          >
            Update Password
          </button>
        </div>
      </SettingCard>

      {/* Two-Factor Authentication */}
      <SettingCard
        title="Two-Factor Authentication"
        description="Add an extra layer of security to your account by requiring a verification code."
      >
        <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100 mb-6">
          <span className="material-icons-round text-blue-600 mt-1">
            verified_user
          </span>
          <div>
            <p className="font-semibold text-gray-900">
              Protect your account
            </p>
            <p className="text-sm text-gray-600">
              Two-factor authentication provides additional security for your
              account.
            </p>
          </div>
        </div>
        <div
          className={`${twoFactor
            ? "bg-green-50 border-green-100"
            : "bg-gray-50 border-gray-100"
            } border rounded-lg p-4 mb-6 flex items-center justify-between`}
        >
          <p
            className={`text-sm font-semibold ${twoFactor ? "text-green-800" : "text-gray-600"
              }`}
          >
            {twoFactor ? "✓ Enabled" : "✗ Disabled"}
          </p>
          <button
            onClick={() => handleTwoFactorToggle(!twoFactor)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${twoFactor
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
          >
            {twoFactor ? "Disable" : "Enable"}
          </button>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-3">Backup Codes</p>
          <p className="text-xs text-gray-500 mb-4">
            Save your backup codes in a secure location.
          </p>
          <button 
            type="button"
            onClick={handleManageCodes}
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
          >
            Manage Codes
          </button>
        </div>
      </SettingCard>

      {/* Notification Preferences */}
      <SettingCard
        title="Notification Preferences"
        description="Choose which notifications you want to receive."
      >
        <ToggleSwitch
          label="Security Alerts"
          description="Unusual login attempts and suspicious activities"
          isEnabled={notifs.security}
          onToggle={(val) => handleNotifToggle("security", val)}
        />
        <ToggleSwitch
          label="Transaction Updates"
          description="Confirmations for payments, transfers, and receipts"
          isEnabled={notifs.transactions}
          onToggle={(val) => handleNotifToggle("transactions", val)}
        />
        <ToggleSwitch
          label="Marketing & Offers"
          description="New features, promotions, and special offers"
          isEnabled={notifs.marketing}
          onToggle={(val) => handleNotifToggle("marketing", val)}
        />
        <ToggleSwitch
          label="Weekly Reports"
          description="Summary of your account activity and spending"
          isEnabled={notifs.weekly}
          onToggle={(val) => handleNotifToggle("weekly", val)}
        />
      </SettingCard>

      {/* Danger Zone */}
      <SettingCard
        title="Danger Zone"
        description="Irreversible actions that require careful consideration."
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-red-50 border border-red-100 rounded-xl">
          <div>
            <p className="font-semibold text-red-900">Delete Account</p>
            <p className="text-xs sm:text-sm text-red-700">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors text-sm"
          >
            Delete Account
          </button>
        </div>
      </SettingCard>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Delete Account?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This action is permanent and cannot be undone. All your data,
              wallets, and transaction history will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors text-sm"
              >
                Yes, Delete My Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Backup Verification Codes
            </h3>
            <p className="text-sm text-gray-600 mb-6 border-b border-gray-100 pb-4">
              If you lose access to your email, you can use these backup codes to sign in.
              <br />
              <strong>Each code can be used only once.</strong> We recommend saving these in a secure password manager.
            </p>

            {backupCodes.length === 0 ? (
              <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-lg mb-6 border border-yellow-100">
                You do not have any active backup codes. Generate a batch to ensure you don't get locked out.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                {backupCodes.map((code, idx) => (
                  <div key={idx} className="bg-white px-3 py-2 rounded border border-gray-200 text-center font-mono text-gray-800 text-sm tracking-wider font-semibold shadow-sm">
                    {code}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setShowBackupCodes(false)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleGenerateCodes}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-sm">autorenew</span>
                Generate New Codes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
