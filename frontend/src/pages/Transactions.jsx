import React, { useState, useEffect, useMemo } from 'react';
import { accountAPI } from '../services/api';
import { formatCurrency } from '../utils/currency';

// ── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    SUCCESS: 'bg-green-50 text-green-700 border-green-200',
    PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold border
        ${styles[status] || styles.PENDING}`}
    >
      {status}
    </span>
  );
};

// ── Transaction ID Badge ──────────────────────────────────────────────────────
const TxnIdBadge = ({ id }) => (
  <span className="font-mono text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded-md px-2 py-1">
    TXN-{String(id).padStart(4, '0')}
  </span>
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const TYPE_LABEL = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  TRANSFER: 'Transfer',
  CARD_DEPOSIT: 'Card Deposit',
  CARD_WITHDRAW: 'Card Withdraw',
  FX_REVENUE: 'FX Revenue',
};

const typeLabel = (trx) => {
  if (trx.type === 'TRANSFER') return trx.entry_type === 'CREDIT' ? 'Received' : 'Sent';
  return TYPE_LABEL[trx.type] || trx.type;
};

const matchesSearch = (trx, term) => {
  if (!term) return true;
  const q = term.toLowerCase();
  return (
    typeLabel(trx).toLowerCase().includes(q) ||
    String(trx.transaction_id).includes(q) ||
    (trx.currency || '').toLowerCase().includes(q) ||
    (trx.counterparty || '').toLowerCase().includes(q) ||
    (trx.status || '').toLowerCase().includes(q)
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [searchTerm, setSearchTerm] = useState('');
  const [last30Active, setLast30Active] = useState(false);

  // ── Fetch from backend ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const data = await accountAPI.getTransactions();
        setTransactions(data);
      } catch (err) {
        console.error('Error fetching transactions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = Date.now();
    return transactions.filter((t) => {
      if (statusFilter !== 'All Status' && t.status !== statusFilter) return false;
      if (last30Active && t.created_at) {
        const age = now - new Date(t.created_at).getTime();
        if (age > THIRTY_DAYS_MS) return false;
      }
      return matchesSearch(t, searchTerm);
    });
  }, [transactions, statusFilter, searchTerm, last30Active]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-600 mt-1">
          Keep track of your spending and income across all wallets.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center justify-between">
        {/* Search */}
        <div className="flex flex-1 min-w-[280px] items-center bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
          <span className="material-icons-round text-gray-400 text-lg">search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by type, ID, currency, name…"
            className="bg-transparent border-none focus:ring-0 w-full ml-2 text-sm text-gray-700 placeholder-gray-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-gray-400 hover:text-gray-600 ml-1"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          )}
        </div>

        {/* Right-side controls */}
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-gray-200 text-gray-600 text-sm rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <option>All Status</option>
            <option>COMPLETED</option>
            <option>SUCCESS</option>
            <option>PENDING</option>
            <option>FAILED</option>
          </select>

          <button
            onClick={() => setLast30Active((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors
              ${last30Active
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
          >
            <span className="material-icons-round text-lg">calendar_month</span>
            Last 30 Days
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16">
          <span className="material-icons-round text-4xl text-gray-300 animate-pulse">sync</span>
          <p className="text-gray-500 mt-3 text-sm">Loading transactions…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <span className="material-icons-round text-4xl text-gray-300">receipt_long</span>
          <p className="text-gray-500 mt-3 text-sm">No transactions found</p>
          {(searchTerm || last30Active || statusFilter !== 'All Status') && (
            <button
              onClick={() => { setSearchTerm(''); setLast30Active(false); setStatusFilter('All Status'); }}
              className="mt-4 text-blue-600 text-sm font-medium underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Transaction ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Counterparty</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Currency</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((trx) => (
                  <tr key={trx.id} className="hover:bg-blue-50/30 transition-colors group">
                    {/* Date */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                      {trx.created_at
                        ? new Date(trx.created_at).toLocaleDateString()
                        : '—'}
                    </td>

                    {/* Type */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                          <span className="material-icons-round text-sm text-gray-600">
                            {trx.entry_type === 'CREDIT' ? 'call_received' : 'call_made'}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {typeLabel(trx)}
                        </span>
                      </div>
                    </td>

                    {/* Transaction ID */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <TxnIdBadge id={trx.transaction_id} />
                    </td>

                    {/* Counterparty */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${trx.counterparty === 'External / Bank'
                          ? 'bg-gray-100'
                          : 'bg-indigo-100'
                          }`}>
                          <span className={`text-xs font-bold uppercase ${trx.counterparty === 'External / Bank'
                            ? 'text-gray-500'
                            : 'text-indigo-700'
                            }`}>
                            {trx.counterparty === 'External / Bank' ? '🏦' : (trx.counterparty || '?')[0]}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm text-gray-700 font-medium">{trx.counterparty || '—'}</span>
                          {trx.counterparty !== '—' && (
                            <span 
                              className={`ml-2 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm ${
                                trx.is_test ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
                              }`}
                            >
                              {trx.is_test ? 'TEST' : 'REAL'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${trx.entry_type === 'DEBIT' ? 'text-red-600' : 'text-green-600'
                      }`}>
                      {trx.entry_type === 'DEBIT' ? '−' : '+'}
                      {formatCurrency(trx.amount, trx.currency)}
                    </td>

                    {/* Balance */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      {formatCurrency(trx.running_balance || 0, trx.currency)}
                    </td>

                    {/* Currency */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                      {trx.currency}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={trx.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-600 font-medium">
              Showing{' '}
              <span className="text-gray-900 font-bold">{filtered.length}</span>
              {' '}of{' '}
              <span className="text-gray-900 font-bold">{transactions.length}</span>
              {' '}transactions
            </p>
            {(searchTerm || last30Active || statusFilter !== 'All Status') && (
              <button
                onClick={() => { setSearchTerm(''); setLast30Active(false); setStatusFilter('All Status'); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}