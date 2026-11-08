import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LinkedAccounts from '../components/LinkedAccounts';
import CardPreview from '../components/CardPreview';
import UpgradeCard from '../components/UpgradeCard';
import SendMoneyModal from '../components/SendMoneyModal';
import MyWalletDashboard from '../components/MyWalletDashboard';
import { accountAPI, fxAPI, transferAPI } from '../services/api';
import { formatCurrency } from '../utils/currency';

const FX_CURRENCIES = [
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "INR", name: "Indian Rupee", flag: "🇮🇳" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳" },
  { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬" },
];

/* ── Animated FX Ticker ─────────────────────────────── */
function FxTicker({ rates, onRefresh, refreshing }) {
  if (!rates || Object.keys(rates).length === 0) return null;

  // Double the list so the loop is seamless
  const items = [...FX_CURRENCIES, ...FX_CURRENCIES];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0 justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-blue-600 text-lg">currency_exchange</span>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Live FX Rates</h4>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh live rates"
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <span className={`material-icons-round text-gray-400 text-base ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      {/* Scrolling container */}
      <div className="flex-1 overflow-hidden relative">
        {/* Fade masks */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />

        <div className="fx-scroll-track">
          {items.map((c, i) => {
            const rate = rates[c.code];
            if (!rate) return null;
            return (
              <div
                key={`${c.code}-${i}`}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-blue-50/60 transition-colors"
              >
                <span className="text-xl">{c.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800">{c.code}<span className="text-gray-400 font-normal"> /USD</span></p>
                </div>
                <p className="text-sm font-extrabold text-blue-700 tabular-nums">{Number(rate).toFixed(4)}</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-2 flex-shrink-0">Live rates · Updated every 1h</p>
    </div>
  );
}

export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState({ balance: 0, test_balance: 0, withdrawable_balance: 0 });
  const [rates, setRates] = useState({});
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [profile, setProfile] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [sendModal, setSendModal] = useState({ isOpen: false, recipient: null });
  const [sendingMoney, setSendingMoney] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [accounts, fxData, meData, recipientsData, balanceData] = await Promise.all([
          accountAPI.getAccounts(),
          fxAPI.getRates(),
          accountAPI.getMe().catch(() => null),
          accountAPI.getRecipients().catch(() => []),
          accountAPI.getBalance().catch(() => ({ balance: 0, test_balance: 0, withdrawable_balance: 0 }))
        ]);
        setWallets(accounts);
        setRates(fxData.rates || {});
        setProfile(meData);
        setRecipients(recipientsData);
        setBalanceInfo(balanceData);

        const total = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        setTotalBalance(total);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleRefreshRates = useCallback(async () => {
    setRefreshingRates(true);
    try {
      const d = await fxAPI.refreshRates();
      setRates(d.rates || {});
    } catch {}
    finally { setRefreshingRates(false); }
  }, []);

  const handleSendMoney = async (recipientEmail, amount, description, pin, isTest) => {
    setSendingMoney(true);
    try {
      await transferAPI.create(pin, recipientEmail, parseFloat(amount), description, isTest);
      alert(`Successfully sent ${formatCurrency(amount, balanceInfo.currency)} ${isTest ? 'test funds ' : ''}to ${sendModal.recipient.name}`);
      setSendModal({ isOpen: false, recipient: null });
      // Refresh dashboard data to show new balance
      window.location.reload(); 
    } catch (error) {
      throw error;
    } finally {
      setSendingMoney(false);
    }
  };

  const currencySymbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const currencyFlags = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵' };

  return (
    <div className="space-y-6 sm:space-y-8">
      <Header profile={profile} />

      {/* Sticky Banner for Profile / PIN Completion */}
      {profile && profile.profile_complete === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm mb-2 sticky top-6 z-40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="material-icons-round text-amber-600">warning</span>
            </div>
            <div>
              <h3 className="text-amber-900 font-bold text-sm md:text-base">Complete your profile to secure your account</h3>
              <p className="text-amber-700 text-xs md:text-sm mt-0.5">Please setup your transaction PIN and add a mobile number to fully activate your wallet.</p>
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            {!profile.has_pin && (
              <Link to="/wallet" className="flex-1 sm:flex-none text-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-xl text-sm transition-colors shadow-sm">
                Set PIN
              </Link>
            )}
            <Link to="/settings" className="flex-1 sm:flex-none text-center bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 font-bold py-2 px-5 rounded-xl text-sm transition-colors shadow-sm">
              Complete Profile
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
        <div className="lg:col-span-2">
          <MyWalletDashboard balanceInfo={balanceInfo} />
        </div>
        <UpgradeCard />
      </div>

      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 md:h-[315px]">
          {/* Saved Recipients */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-xl font-bold text-gray-900">Saved Recipients</h3>
              <Link to="/recipients" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View All</Link>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {loading ? (
                <div className="text-center py-6 text-gray-500 text-sm">Loading recipients...</div>
              ) : recipients.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">No saved recipients yet.</div>
              ) : (
                recipients.slice(0, 3).map((r, i) => (
                  <div 
                    key={r.email + i} 
                    onClick={() => setSendModal({ isOpen: true, recipient: r })}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md hover:border-blue-100 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        {r.name ? r.name.charAt(0).toUpperCase() : r.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">{r.name}</p>
                        <p className="text-xs text-gray-500 truncate">{r.email}</p>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all shrink-0 shadow-sm">
                      <span className="material-icons-round text-sm">send</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* FX Rate Ticker */}
          <FxTicker rates={rates} onRefresh={handleRefreshRates} refreshing={refreshingRates} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8 pb-8">
        <LinkedAccounts />
        <CardPreview />
      </div>

      <SendMoneyModal
        isOpen={sendModal.isOpen}
        recipient={sendModal.recipient}
        onClose={() => setSendModal({ isOpen: false, recipient: null })}
        onSubmit={handleSendMoney}
        loading={sendingMoney}
        currency={balanceInfo.currency || 'USD'}
      />
    </div>
  );
}
