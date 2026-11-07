import { useNavigate } from 'react-router-dom';

const CURRENCY_NAMES = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  INR: 'Indian Rupee',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan',
  SGD: 'Singapore Dollar',
};

export default function WalletCard({ currency, sign, amount, flag }) {
  const isEmoji = flag && flag.length < 10;
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-xl">
            {isEmoji ? flag : '💱'}
          </div>
          <div>
            <p className="font-bold text-gray-900">{currency}</p>
            <p className="text-xs text-gray-500">
              {CURRENCY_NAMES[currency] || currency}
            </p>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <p className="text-3xl font-bold text-gray-900">{sign}{amount}</p>
      </div>
      <div className="space-y-2">
        <button
          onClick={() => navigate('/wallet?tab=deposit')}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          Deposit
        </button>
        <button
          onClick={() => navigate('/wallet?tab=withdraw')}
          className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors"
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}
