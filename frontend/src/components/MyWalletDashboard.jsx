import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';

export default function MyWalletDashboard({ balanceInfo = { balance: 0, test_balance: 0, withdrawable_balance: 0, currency: 'USD' } }) {
  const navigate = useNavigate();

  const total = balanceInfo.balance || 0;
  const real = balanceInfo.withdrawable_balance || 0;
  const fake = balanceInfo.test_balance || 0;
  const currency = balanceInfo.currency || 'USD';

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-card border border-gray-100 flex flex-col relative overflow-hidden h-full">
      {/* Background Decorative Element */}
      <div className="absolute -right-10 -top-10 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl -z-10"></div>
      <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-indigo-50/30 rounded-full blur-3xl -z-10"></div>

      <div className="flex justify-between items-start mb-5 sm:mb-6">
        <div>
          <p className="text-xs sm:text-sm font-semibold text-gray-500 mb-1">Total Balance</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">
              {formatCurrency(total, currency)}
            </h2>
            <span className="text-[11px] sm:text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-wide">
              {currency}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-emerald-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-emerald-100 flex flex-col justify-between">
          <p className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 truncate">Available Real</p>
          <p className="text-base sm:text-lg font-bold text-emerald-900 truncate">{formatCurrency(real, currency)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-amber-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1 gap-1">
              <p className="text-[9px] sm:text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">Test Balance</p>
              <span className="text-[8px] sm:text-[9px] bg-amber-200/60 text-amber-800 px-1.5 py-0.5 rounded font-bold shrink-0">
                +100/12h
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-amber-900 truncate">{formatCurrency(fake, currency)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 sm:gap-4 mt-auto">
        <button
          onClick={() => navigate('/wallet?tab=deposit')}
          className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm sm:text-base transition-all shadow-md active:scale-95"
        >
          <span className="material-icons-round text-sm">add_circle</span>
          Deposit
        </button>
        <button
          onClick={() => navigate('/wallet?tab=withdraw')}
          className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 font-bold py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm sm:text-base transition-all shadow-sm active:scale-95"
        >
          <span className="material-icons-round text-sm">arrow_circle_up</span>
          Withdraw
        </button>
      </div>
    </div>
  );
}
