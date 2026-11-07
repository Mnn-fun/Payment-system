import { useState, useEffect } from 'react';
import { accountAPI } from '../services/api';

export default function BalanceCard({ totalBalance = 0 }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [percentage, setPercentage] = useState(0);

  useEffect(() => {
    const fetchWalletDetails = async () => {
      try {
        const accounts = await accountAPI.getAccounts();
        setWallets(accounts);
        
        // Calculate percentage: we'll use a simple calculation based on transactions
        // For now, we'll calculate it as: (current balance / estimated previous balance) * 100
        try {
          const transactions = await accountAPI.getTransactions();
          
          // Filter deposits and withdrawals from last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          const recentTransactions = transactions.filter(t => new Date(t.created_at) > thirtyDaysAgo);
          
          // Calculate net change
          let netChange = 0;
          recentTransactions.forEach(t => {
            if (t.type === 'Deposit') {
              netChange += t.amount;
            } else if (t.type === 'Withdraw') {
              netChange -= Math.abs(t.amount);
            }
          });
          
          // Estimate previous balance
          const estimated_previous = totalBalance - netChange;
          setPreviousBalance(estimated_previous > 0 ? estimated_previous : totalBalance);
          
          // Calculate percentage
          if (estimated_previous > 0) {
            const pct = ((totalBalance - estimated_previous) / estimated_previous) * 100;
            setPercentage(pct);
          } else {
            setPercentage(0);
          }
        } catch (error) {
          console.error('Error calculating percentage:', error);
          setPercentage(0);
        }
      } catch (error) {
        console.error('Error fetching wallet details:', error);
      }
    };

    fetchWalletDetails();
  }, [totalBalance]);

  return (
    <div className="bg-white rounded-2xl p-8 shadow-card border border-gray-100 flex flex-col justify-between relative overflow-hidden">
      <div className="absolute right-0 top-0 w-80 h-80 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 -z-10"></div>
      <div className="relative z-10 flex justify-between items-start mb-8">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">Total Balance</p>
          <h2 className="text-5xl font-bold text-slate-900 tracking-tight">${totalBalance.toFixed(2)}</h2>
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 ${percentage >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <span className="material-icons-round text-sm">{percentage >= 0 ? 'trending_up' : 'trending_down'}</span>
              {percentage >= 0 ? '+' : ''}{percentage.toFixed(1)}%
            </span>
            <span className="text-sm text-gray-500">vs last month</span>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="material-icons-outlined">more_horiz</span>
          </button>
          
          {/* Balance Details Dropdown */}
          {detailsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 z-50">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Balance Breakdown</h3>
              </div>
              <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                {wallets.length === 0 ? (
                  <p className="text-sm text-gray-500">No wallets found</p>
                ) : (
                  wallets.map((wallet, idx) => (
                    <div key={idx} className="flex justify-between items-center pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{wallet.currency}</p>
                        <p className="text-xs text-gray-500">{wallet.status}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-900">${wallet.balance.toFixed(2)}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">Total</span>
                  <span className="text-lg font-bold text-gray-900">${totalBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="relative h-24 w-full">
        <div className="flex items-end justify-between h-full gap-1">
          <div className="w-full bg-blue-200 rounded-t-sm h-[40%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[65%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[50%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[75%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[60%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[80%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[55%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[70%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-blue-200 rounded-t-sm h-[90%] hover:bg-blue-300 transition-all"></div>
          <div className="w-full bg-primary rounded-t-sm h-[85%]"></div>
        </div>
      </div>
    </div>
  );
}
