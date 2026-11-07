import { useState, useEffect } from 'react';
import { linkedAccountAPI, accountAPI } from '../services/api';

export default function LinkedAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [formData, setFormData] = useState({ bankName: '', accountType: '', accountNumber: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [monthlyWithdrawals, setMonthlyWithdrawals] = useState(0);

  // Use a predetermined color cycle
  const COLORS = ['bg-blue-900', 'bg-red-600', 'bg-green-600', 'bg-purple-600'];

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const data = await linkedAccountAPI.list();
      setAccounts(data || []);
    } catch (e) {
      setError(e.message || "Failed to load linked accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    if (!formData.bankName || !formData.accountType || !formData.accountNumber) {
      setError('All fields are required');
      setBusy(false);
      return;
    }

    try {
      await linkedAccountAPI.add(
        formData.bankName,
        formData.accountType,
        formData.accountNumber
      );
      setFormData({ bankName: '', accountType: '', accountNumber: '' });
      setIsOpen(false);
      fetchAccounts();
    } catch (e) {
      setError(e.message || "Failed to add account");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAccount = async () => {
    if (!selectedAccount) return;
    setBusy(true);
    try {
      await linkedAccountAPI.remove(selectedAccount.id);
      setSelectedAccount(null);
      fetchAccounts();
    } catch (e) {
      alert(e.message || "Failed to remove account");
    } finally {
      setBusy(false);
    }
  };

  const handleAccountClick = async (account) => {
    setSelectedAccount(account);
    setMonthlyWithdrawals(0); // Reset while loading

    try {
      // Calculate total withdrawn to this specific bank account this month
      const txns = await accountAPI.getTransactions();
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const total = txns
        .filter(t =>
          t.type === "WITHDRAW" &&
          t.status === "COMPLETED" &&
          t.counterparty && t.counterparty.includes(account.account_number.slice(-4))
        )
        .filter(t => {
          const date = new Date(t.created_at);
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      setMonthlyWithdrawals(total);
    } catch (e) {
      console.error("Could not fetch transactions for monthly total", e);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-100 flex flex-col h-full min-h-[380px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-slate-900 text-lg">Linked Accounts</h3>
          <button
            onClick={() => { setError(''); setIsOpen(true); }}
            className="text-sm text-blue-600 font-semibold hover:text-blue-700 transition-colors flex items-center gap-1"
          >
            <span className="material-icons-round text-sm">add</span>
            Add New
          </button>
        </div>
        <div className="space-y-4 flex-1">
          {loading ? (
            <div className="text-gray-400 text-sm text-center py-8">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="text-3xl block mb-2">🏦</span>
              <p className="font-semibold text-sm text-gray-700">No linked bank accounts</p>
              <p className="text-xs mt-1">Add a bank account to easily withdraw funds from your wallet.</p>
            </div>
          ) : (
            accounts.map((account, index) => {
              const initials = account.name.slice(0, 2).toUpperCase();
              const color = COLORS[index % COLORS.length];
              const displayBank = `${account.account_type} •••• ${account.account_number.slice(-4)}`;

              return (
                <div
                  key={account.id}
                  onClick={() => handleAccountClick({ ...account, initials, color, displayBank })}
                  className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-blue-500/50 transition-all bg-gray-50 hover:bg-blue-50 group cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg ${color} text-white flex items-center justify-center font-bold text-lg`}>
                      {initials}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{account.name}</p>
                      <p className="text-xs text-gray-600">{displayBank}</p>
                    </div>
                  </div>
                  <span className="material-icons-outlined text-gray-400 group-hover:text-blue-600 transition-colors">chevron_right</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add New Account Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Link New Account</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Bank Name</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="e.g., Chase Bank"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Account Type</label>
                <select
                  value={formData.accountType}
                  onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose type</option>
                  <option value="Checking">Checking</option>
                  <option value="Savings">Savings</option>
                  <option value="Money Market">Money Market</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Account Number</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, '') })}
                  placeholder="Enter account number"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:bg-blue-400"
                  disabled={busy}
                >
                  {busy ? "Adding..." : "Add Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Details Modal */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Account Details</h2>
              <button
                onClick={() => setSelectedAccount(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <div className={`w-16 h-16 rounded-lg ${selectedAccount.color} text-white flex items-center justify-center font-bold text-2xl mb-4`}>
                {selectedAccount.initials}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">{selectedAccount.name}</h3>
              <p className="text-gray-600 mb-6">{selectedAccount.displayBank}</p>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Account Type</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedAccount.account_type}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Withdrawn This Month</p>
                  <p className="text-sm font-semibold text-green-600">${monthlyWithdrawals.toFixed(2)} USD</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRemoveAccount}
                disabled={busy}
                className="flex-1 px-4 py-2.5 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {busy ? 'Removing...' : 'Remove'}
              </button>
              <button
                onClick={() => {
                  setSelectedAccount(null);
                  window.location.href = '/wallet';
                }}
                disabled={busy}
                className="flex-[2] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons-round text-lg">arrow_outward</span>
                Withdraw to Bank
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
