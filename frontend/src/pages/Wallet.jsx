import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { depositAPI, withdrawAPI, fxAPI, accountAPI, cardAPI, linkedAccountAPI, cashfreeAPI } from "../services/api";
import { formatCurrency } from "../utils/currency";
import { load } from "@cashfreepayments/cashfree-js";

let cashfree;
load({ mode: "sandbox" }).then(cf => { cashfree = cf; });

// ─── Currency metadata ───────────────────────────────────────────────────────
const CURRENCIES = [
    { code: "USD", name: "US Dollar", flag: "🇺🇸", symbol: "$" },
    { code: "EUR", name: "Euro", flag: "🇪🇺", symbol: "€" },
    { code: "GBP", name: "British Pound", flag: "🇬🇧", symbol: "£" },
    { code: "JPY", name: "Japanese Yen", flag: "🇯🇵", symbol: "¥" },
    { code: "INR", name: "Indian Rupee", flag: "🇮🇳", symbol: "₹" },
    { code: "AUD", name: "Australian Dollar", flag: "🇦🇺", symbol: "A$" },
    { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦", symbol: "C$" },
    { code: "CHF", name: "Swiss Franc", flag: "🇨🇭", symbol: "CHF" },
    { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳", symbol: "¥" },
    { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬", symbol: "S$" },
];
const NON_USD = CURRENCIES.filter((c) => c.code !== "USD");
const getCurrency = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

// ─── Toast ───────────────────────────────────────────────────────────────────
const Toast = ({ message, type, onClose }) => {
    useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg font-semibold text-sm flex items-center gap-2 ${type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
            <span className="material-icons-round text-base">{type === "success" ? "check_circle" : "error_outline"}</span>
            {message}
        </div>
    );
};

// ─── Live Quote Display ───────────────────────────────────────────────────────
// Handles fetch, countdown, expiry, and refresh button.  
// Parent gets quote_id while the quote is active; null when not.
function LiveQuoteDisplay({ sourceCurrency, targetCurrency, amount, onQuoteFetched }) {
    const [state, setState] = useState("idle"); // idle | loading | active | expired | error
    const [quote, setQuote] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const timerRef = useRef(null);
    const debounceRef = useRef(null);

    const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };

    const startTimer = (seconds) => {
        clearTimer();
        setTimeLeft(seconds);
        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearTimer();
                    setState("expired");
                    onQuoteFetched(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const fetchQuote = useCallback(async () => {
        if (!amount || Number(amount) <= 0 || sourceCurrency === targetCurrency) {
            clearTimer();
            setState("idle");
            setQuote(null);
            onQuoteFetched(null);
            return;
        }

        setState("loading");
        clearTimer();
        try {
            const data = await fxAPI.getQuote(sourceCurrency, targetCurrency, amount);
            setQuote(data);
            setState("active");
            onQuoteFetched(data.quote_id);
            startTimer(data.expires_in_seconds || 30);
        } catch {
            setState("error");
            onQuoteFetched(null);
        }
    }, [sourceCurrency, targetCurrency, amount, onQuoteFetched]);

    // Debounce fetch on input changes
    useEffect(() => {
        clearTimer();
        setState("idle");
        setQuote(null);
        onQuoteFetched(null);

        if (!amount || Number(amount) <= 0 || sourceCurrency === targetCurrency) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fetchQuote, 800);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [sourceCurrency, targetCurrency, amount]); // eslint-disable-line

    useEffect(() => () => { clearTimer(); if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    if (sourceCurrency === targetCurrency || !amount || Number(amount) <= 0) return null;

    if (state === "loading") return (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
            <div className="animate-spin h-4 w-4 border-b-2 border-blue-600 rounded-full flex-shrink-0" />
            <span className="text-sm font-medium text-blue-700">Negotiating live rate…</span>
        </div>
    );

    if (state === "error") return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <span className="material-icons-round text-lg">wifi_off</span>
                Could not fetch live rate
            </span>
            <button onClick={fetchQuote} className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-1">
                <span className="material-icons-round text-sm">refresh</span> Retry
            </button>
        </div>
    );

    if (!quote) return null;

    return (
        <div className={`rounded-xl p-4 space-y-3 border transition-all ${state === "expired" ? "bg-red-50 border-red-200" : "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100"}`}>
            {/* Header row */}
            <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${state === "expired" ? "text-red-600" : "text-blue-600"}`}>
                    {state === "expired" ? "Quote Expired" : "Guaranteed Rate"}
                </span>
                <div className="flex items-center gap-2">
                    {state === "active" && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${timeLeft <= 30 ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                        </span>
                    )}
                    {state === "expired" && (
                        <button
                            type="button"
                            onClick={fetchQuote}
                            className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 transition-colors flex items-center gap-1"
                        >
                            <span className="material-icons-round text-sm">refresh</span>
                            Get New Rate
                        </button>
                    )}
                </div>
            </div>

            {/* Rates row */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-gray-400 font-semibold mb-0.5">Market Rate</p>
                    <p className="text-sm font-medium text-gray-700">
                        1 {sourceCurrency} = {quote.mid_market_rate.toFixed(4)} {targetCurrency}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-400 font-semibold mb-0.5">InterPay Rate ({quote.spread_percent}% spread)</p>
                    <p className="text-sm font-bold text-gray-900">
                        1 {sourceCurrency} = {quote.interpay_rate.toFixed(4)} {targetCurrency}
                    </p>
                </div>
            </div>

            {/* You receive row */}
            <div className={`pt-3 border-t flex justify-between items-center ${state === "expired" ? "border-red-200" : "border-blue-100"}`}>
                <span className="text-sm font-medium text-gray-600">You will receive</span>
                <span className={`text-2xl font-extrabold ${state === "expired" ? "text-red-400 line-through" : "text-blue-700"}`}>
                    {getCurrency(targetCurrency).symbol}{quote.converted_amount.toFixed(2)} {targetCurrency}
                </span>
            </div>
        </div>
    );
}

// ─── Rates Sidebar ───────────────────────────────────────────────────────────
function RatesSidebar({ rates, onRefresh, refreshing }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Live Exchange Rates</h3>
                <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    title="Refresh rates now"
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                    <span className={`material-icons-round text-gray-500 text-lg ${refreshing ? "animate-spin" : ""}`}>refresh</span>
                </button>
            </div>
            <div className="space-y-2">
                {NON_USD.map((c) => {
                    const r = rates[c.code];
                    if (!r) return null;
                    return (
                        <div key={c.code} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <span className="text-xl">{c.flag}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900">{c.code}</p>
                                <p className="text-xs text-gray-500 truncate">{c.name}</p>
                            </div>
                            <p className="text-sm font-bold text-blue-700 tabular-nums">{Number(r).toFixed(4)}</p>
                        </div>
                    );
                })}
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">Rates per 1 USD · Updated every 12h</p>
        </div>
    );
}

// ─── PIN Setup Modal ──────────────────────────────────────────────────────────
function PinSetupModal({ onSetupComplete }) {
    const [pin, setPin] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSave = async (e) => {
        e.preventDefault();
        if (pin.length !== 6) { setError("PIN must be exactly 6 digits."); return; }
        setLoading(true);
        setError("");
        try {
            await accountAPI.setTransactionPin(pin);
            onSetupComplete();
        } catch (err) {
            setError(err.message || "Failed to save PIN.");
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-fade-in-up">
                <div className="mx-auto w-14 h-14 bg-gradient-to-tr from-blue-100 to-indigo-50 text-blue-600 rounded-2xl flex items-center justify-center mb-5 shadow-sm border border-blue-100/50">
                    <span className="material-icons-round text-3xl">lock</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Setup Transaction PIN</h2>
                <p className="text-sm text-gray-500 mb-8 leading-relaxed">Create a 6-digit PIN to secure your deposits, withdrawals, and transfers.</p>
                <form onSubmit={handleSave} className="space-y-6">
                    <div>
                        <input
                            type="password"
                            required
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full text-center tracking-[0.5em] text-3xl px-4 py-4 bg-gray-50/50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-blue-500 focus:bg-white font-mono shadow-inner transition-all placeholder:text-gray-300"
                            placeholder="••••••"
                            maxLength={6}
                            autoFocus
                        />
                    </div>
                    {error && <p className="text-sm text-red-600 font-medium bg-red-50 py-2 rounded-lg border border-red-100">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading || pin.length !== 6}
                        className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl disabled:opacity-50 transition-all shadow-md shadow-blue-600/20"
                    >
                        {loading ? "Saving..." : "Save PIN"}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
}

// ─── Main Wallet Component ───────────────────────────────────────────────────
export default function Wallet() {
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState(searchParams.get("tab") === "withdraw" ? "withdraw" : "deposit");
    const [balance, setBalance] = useState(0);
    const [testBalance, setTestBalance] = useState(0);
    const [withdrawableBalance, setWithdrawableBalance] = useState(0);
    const [walletCurrency, setWalletCurrency] = useState("USD");
    const [rates, setRates] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);

    // Deposit
    const [depCurrency, setDepCurrency] = useState("USD");
    const [depAmount, setDepAmount] = useState("");
    const [depPaymentMethod, setDepPaymentMethod] = useState("CARD");
    const [depProof, setDepProof] = useState("");
    const [depBankRef, setDepBankRef] = useState("");
    const [depositQuoteId, setDepositQuoteId] = useState(null);

    const [depPin, setDepPin] = useState("");

    // Withdraw
    const [wdCurrency, setWdCurrency] = useState("INR");
    const [wdAmount, setWdAmount] = useState("");
    const [wdDetails, setWdDetails] = useState("");
    const [wdBankRef, setWdBankRef] = useState("");
    const [withdrawQuoteId, setWithdrawQuoteId] = useState(null);
    const [wdPin, setWdPin] = useState("");

    const [hasPin, setHasPin] = useState(true); // default true until loaded

    // Pin Setup Modal State
    const [setupPin, setSetupPin] = useState("");
    const [setupPinLoading, setSetupPinLoading] = useState(false);

    const [cards, setCards] = useState([]);
    const [banks, setBanks] = useState([]);

    const showToast = (message, type = "success") => setToast({ message, type });

    const fetchBalance = useCallback(async () => {
        try {
            const d = await accountAPI.getBalance();
            setBalance(d.balance || 0);
            setTestBalance(d.test_balance || 0);
            setWithdrawableBalance(d.withdrawable_balance || 0);
            setWalletCurrency(d.currency || "USD");
        } catch { }
    }, []);

    const fetchRates = useCallback(async () => {
        try { const d = await fxAPI.getRates(); setRates(d.rates || {}); } catch { }
    }, []);

    const handleRefreshRates = async () => {
        setRefreshing(true);
        try {
            const d = await fxAPI.refreshRates();
            setRates(d.rates || {});
            showToast("Rates refreshed from live source");
        } catch {
            showToast("Failed to refresh rates", "error");
        } finally {
            setRefreshing(false);
        }
    };

    // Initial data load
    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [meData, balData, ratesData, cardsData, banksData] = await Promise.all([
                    accountAPI.getMe().catch(() => ({ has_pin: true })),
                    accountAPI.getBalance().catch(() => ({ balance: 0 })),
                    fxAPI.getRates().catch(() => ({ rates: {} })),
                    cardAPI.list().catch(() => []),
                    linkedAccountAPI.list().catch(() => []),
                ]);
                setHasPin(meData.has_pin);
                setBalance(balData.balance || 0);
                setTestBalance(balData.test_balance || 0);
                setWithdrawableBalance(balData.withdrawable_balance || 0);
                setWalletCurrency(balData.currency || "USD");
                setRates(ratesData.rates || {});
                const fetchedCards = cardsData || [];
                const fetchedBanks = banksData || [];
                setCards(fetchedCards);
                setBanks(fetchedBanks);
                if (fetchedCards.length > 0)
                    setDepBankRef(`${fetchedCards[0].card_network} •••• ${fetchedCards[0].last_four}`);
                if (fetchedBanks.length > 0)
                    setWdBankRef(`${fetchedBanks[0].name} - ${fetchedBanks[0].account_type} •••• ${fetchedBanks[0].account_number.slice(-4)}`);
            } finally { setLoading(false); }
        })();
    }, []);

    // ── Deposit ──────────────────────────────────────────────────────────────
    const handleDeposit = async (e) => {
        e.preventDefault();
        if (!depAmount || Number(depAmount) <= 0) { showToast("Enter a valid amount", "error"); return; }
        if (!depPin || depPin.length !== 6) { showToast("Enter your 6-digit Transaction PIN", "error"); return; }
        if (depCurrency !== "USD" && !depositQuoteId) { showToast("Please wait for a valid rate quote", "error"); return; }

        try {
            setSubmitting(true);

            if (depPaymentMethod === "CARD") {
                const res = await depositAPI.create(depPin, depCurrency, parseFloat(depAmount), depBankRef || "Visa •••• 4242", depositQuoteId, "CARD");
                showToast(`Deposited ${getCurrency(depCurrency).symbol}${depAmount} ${depCurrency} → $${(res.usd_credited || parseFloat(depAmount)).toFixed(2)} USD credited`);
                setDepAmount("");
                setDepPin("");
                setDepositQuoteId(null);
                await fetchBalance();
                return;
            }

            if (depPaymentMethod === "CASHFREE") {
                // Online payment via Cashfree — handles Card, UPI, Net Banking automatically
                const { payment_session_id, order_id } = await cashfreeAPI.createOrder(depAmount, depCurrency, depositQuoteId || 0, depPin);

                let checkoutOptions = {
                    paymentSessionId: payment_session_id,
                    redirectTarget: "_modal",
                };

                cashfree.checkout(checkoutOptions).then((result) => {
                    if (result.error) {
                        showToast(result.error.message, "error");
                        setSubmitting(false);
                    }
                    if (result.paymentDetails) {
                        cashfreeAPI.verifyOrder(order_id).then(res => {
                            showToast(`Successfully deposited via Cashfree!`);
                            fetchBalance();
                            setDepAmount("");
                            setSubmitting(false);
                        }).catch(err => {
                            showToast(err.message || "Failed to verify Cashfree order", "error");
                            setSubmitting(false);
                        });
                    }
                });
                return;
            }

            // Manual UPI/SWIFT — goes to admin approval
            const res = await depositAPI.create(depPin, depCurrency, parseFloat(depAmount), depBankRef || "MANUAL_REF", depositQuoteId, "UPI", depProof);
            if (res.status === "PENDING_APPROVAL") {
                showToast(`Deposit requested. Please wait for admin approval.`);
            } else {
                showToast(`Deposited ${getCurrency(depCurrency).symbol}${depAmount} ${depCurrency} → $${(res.usd_credited || 0).toFixed(2)} USD credited`);
            }
            setDepAmount("");
            setDepProof("");
            setDepositQuoteId(null);
            await fetchBalance();
        } catch (err) {
            showToast(err.message || "Deposit failed", "error");
        } finally { setSubmitting(false); }
    };

    // ── Withdraw ─────────────────────────────────────────────────────────────
    const handleWithdraw = async (e) => {
        e.preventDefault();
        if (!wdAmount || Number(wdAmount) <= 0) { showToast("Enter a valid amount", "error"); return; }
        if (!wdPin || wdPin.length !== 6) { showToast("Enter your 6-digit Transaction PIN", "error"); return; }
        if (Number(wdAmount) > balance) { showToast("Insufficient balance", "error"); return; }
        if (wdCurrency !== "USD" && !withdrawQuoteId) { showToast("Please wait for a valid rate quote", "error"); return; }

        try {
            setSubmitting(true);
            const res = await withdrawAPI.create(wdPin, parseFloat(wdAmount), wdCurrency, wdBankRef || "MANUAL_REF", withdrawQuoteId, "UPI/SWIFT", wdDetails);
            showToast(`Withdrawal requested.`);
            setWdAmount("");
            setWdDetails("");
            setWithdrawQuoteId(null);
            await fetchBalance();
        } catch (err) {
            showToast(err.message || "Withdrawal failed", "error");
        } finally { setSubmitting(false); }
    };

    const getInrAmount = () => {
        if (!depAmount || Number(depAmount) <= 0) return null;
        if (depCurrency === "INR") return Number(depAmount).toFixed(2);
        if (depCurrency === "USD") {
            return rates["INR"] ? (Number(depAmount) * Number(rates["INR"])).toFixed(2) : null;
        }
        if (rates[depCurrency] && rates["INR"]) {
            return ((Number(depAmount) / Number(rates[depCurrency])) * Number(rates["INR"])).toFixed(2);
        }
        return null;
    };
    const inrAmount = getInrAmount();

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
    );

    return (
        <div className="space-y-6 sm:space-y-8">
            {(!hasPin && !loading) && (
                <PinSetupModal onSetupComplete={() => setHasPin(true)} />
            )}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Wallet</h1>
                <p className="text-gray-500 mt-1 text-sm sm:text-base">Deposit from cards or withdraw to any supported currency.</p>
            </div>

            {/* Balance */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 sm:p-8 text-white shadow-lg">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                        <p className="text-xs sm:text-sm font-medium opacity-80 uppercase tracking-wide">Total Balance</p>
                        <p className="text-3xl sm:text-4xl font-extrabold mt-1 sm:mt-2">
                            {formatCurrency(balance, walletCurrency)}
                            <span className="text-base sm:text-lg font-semibold opacity-70 ml-2">{walletCurrency}</span>
                        </p>
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto pt-3 sm:pt-0 border-t border-white/10 sm:border-t-0">
                        <p className="text-[11px] sm:text-xs font-medium bg-blue-800/50 px-2.5 py-1 rounded-full text-blue-100 uppercase tracking-wide mb-1.5 sm:mb-2 inline-block">
                            Balance Info • +100 / 12h
                        </p>
                        <p className="text-xs sm:text-sm opacity-90"><span className="font-semibold text-green-300">{formatCurrency(withdrawableBalance, walletCurrency)}</span> Withdrawable</p>
                        <p className="text-[11px] sm:text-xs opacity-70 mt-0.5"><span className="font-semibold text-yellow-300">{formatCurrency(testBalance, walletCurrency)}</span> Test Balance</p>
                    </div>
                </div>
            </div>

            {/* Main layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                {/* Left: Tabs + Form */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Tabs */}
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        {["deposit", "withdraw"].map((t) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-bold rounded-lg transition-all capitalize ${tab === t ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* ── Deposit Form ── */}
                    {tab === "deposit" && (
                        <form onSubmit={handleDeposit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8 space-y-5 sm:space-y-6">
                            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Deposit Funds</h2>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Source Currency</label>
                                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                                    {CURRENCIES.map((c) => (
                                        <button key={c.code} type="button" onClick={() => { setDepCurrency(c.code); setDepositQuoteId(null); }}
                                            className={`py-2 px-1 rounded-lg text-xs sm:text-sm font-bold transition-all border ${depCurrency === c.code ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300"}`}>
                                            <span className="block text-base sm:text-lg">{c.flag}</span>
                                            <span>{c.code}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Amount ({depCurrency})</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{getCurrency(depCurrency).symbol}</span>
                                    <input type="number" step="0.01" min="0.01" value={depAmount} onChange={(e) => setDepAmount(e.target.value)}
                                        placeholder="0.00" className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold" required />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Payment Method</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mb-4">
                                    <button type="button" onClick={() => setDepPaymentMethod("CARD")}
                                        className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all border flex items-center justify-center gap-2 ${depPaymentMethod === "CARD" ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300"}`}>
                                        <span className="material-icons-round text-base sm:text-lg">credit_card</span>
                                        Saved Card
                                    </button>
                                    <button type="button" onClick={() => setDepPaymentMethod("CASHFREE")}
                                        className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all border flex items-center justify-center gap-2 ${depPaymentMethod === "CASHFREE" ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300"}`}>
                                        <span className="material-icons-round text-base sm:text-lg">lock</span>
                                        Pay Online
                                    </button>
                                    <button type="button" onClick={() => setDepPaymentMethod("UPI")}
                                        className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all border flex items-center justify-center gap-2 ${depPaymentMethod === "UPI" ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300"}`}>
                                        <span className="material-icons-round text-base sm:text-lg">qr_code_2</span>
                                        Manual Transfer
                                    </button>
                                </div>

                                {depPaymentMethod === "CARD" ? (
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-sm">
                                                💳
                                            </div>
                                            <div>
                                                <p className="text-gray-900 font-bold text-sm">Instant Card Deposit</p>
                                                <p className="text-gray-600 text-xs mt-0.5">Primary Card: <span className="font-semibold text-blue-700">{depBankRef || "Visa •••• 4242"}</span> · Zero Fees · Instant Settlement</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : depPaymentMethod === "CASHFREE" ? (
                                    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-5 text-center">
                                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-100">
                                            <span className="material-icons-round text-2xl text-emerald-600">lock</span>
                                        </div>
                                        <p className="text-gray-800 font-semibold mb-1">Secure Checkout</p>
                                        <p className="text-gray-500 text-sm leading-relaxed">
                                            Pay with <strong>Card</strong>, <strong>UPI</strong>, <strong>Net Banking</strong>, or <strong>Wallets</strong> via our secure payment gateway.
                                            Previously used cards will appear automatically in checkout.
                                        </p>
                                        <div className="flex items-center justify-center gap-2 mt-3">
                                            <span className="text-xs bg-white/80 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200 font-medium">💳 Cards</span>
                                            <span className="text-xs bg-white/80 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200 font-medium">📱 UPI</span>
                                            <span className="text-xs bg-white/80 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200 font-medium">🏦 Net Banking</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 space-y-4">
                                        <div className="text-center">
                                            <p className="text-sm text-blue-800 font-semibold mb-3">Scan QR or Use UPI/SWIFT</p>
                                            <div className="bg-white p-4 inline-block rounded-2xl border-2 border-dashed border-blue-300 shadow-sm">
                                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=044mann.k5-1@okaxis&pn=Admin${inrAmount ? `&am=${inrAmount}` : ""}&cu=INR`)}`} alt="QR Code" className="w-32 h-32 mx-auto mix-blend-multiply opacity-80" />
                                            </div>
                                            <p className="text-sm text-blue-700 mt-3 bg-white/50 py-2 rounded-lg border border-white/60">
                                                Send exactly <strong className="text-lg">{inrAmount ? `${inrAmount} INR` : `${depAmount || "0.00"} ${depCurrency}`}</strong>
                                                {depCurrency !== "INR" && inrAmount && ` (≈ ${depAmount} ${depCurrency})`} to <strong>044mann.k5-1@okaxis</strong>
                                            </p>
                                        </div>
                                        <div className="pt-2">
                                            <label className="block text-sm font-semibold text-gray-900 mb-2">Transaction Reference (UTR)</label>
                                            <input type="text" value={depProof} onChange={(e) => setDepProof(e.target.value)}
                                                placeholder="Enter 12-digit UTR or Reference NO." className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm shadow-sm" required={depPaymentMethod === "UPI"} />
                                        </div>
                                        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                                            <span className="material-icons-round text-amber-600 text-lg">info</span>
                                            <p className="text-xs text-amber-800 font-medium">Manual transfers require admin approval. Your balance will be credited after verification.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Live Quote */}
                            <LiveQuoteDisplay
                                sourceCurrency={depCurrency}
                                targetCurrency="USD"
                                amount={depAmount}
                                onQuoteFetched={setDepositQuoteId}
                            />

                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Transaction PIN</label>
                                <input type="password" value={depPin} onChange={(e) => setDepPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="Enter 6-digit PIN" maxLength={6} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center text-xl shadow-sm" required />
                            </div>

                            <button type="submit"
                                disabled={submitting || (depCurrency !== "USD" && !depositQuoteId)}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2">
                                {submitting ? (
                                    <><div className="animate-spin h-4 w-4 border-b-2 border-white rounded-full" /> Processing…</>
                                ) : depPaymentMethod === "CARD" ? (
                                    <><span className="material-icons-round text-lg">credit_card</span> Deposit {getCurrency(depCurrency).symbol}{depAmount || "0"} via Card</>
                                ) : depPaymentMethod === "CASHFREE" ? (
                                    <><span className="material-icons-round text-lg">lock</span> Pay {getCurrency(depCurrency).symbol}{depAmount || "0"} {depCurrency}</>
                                ) : (
                                    <><span className="material-icons-round text-lg">send</span> Submit Deposit Request</>
                                )}
                            </button>
                        </form>
                    )}

                    {/* ── Withdraw Form ── */}
                    {tab === "withdraw" && (
                        <form onSubmit={handleWithdraw} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8 space-y-5 sm:space-y-6">
                            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Withdraw Funds</h2>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Destination Currency</label>
                                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                                    {CURRENCIES.map((c) => (
                                        <button key={c.code} type="button" onClick={() => { setWdCurrency(c.code); setWithdrawQuoteId(null); }}
                                            className={`py-2 px-1 rounded-lg text-xs sm:text-sm font-bold transition-all border ${wdCurrency === c.code ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300"}`}>
                                            <span className="block text-base sm:text-lg">{c.flag}</span>
                                            <span>{c.code}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Amount ({walletCurrency})</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{getCurrency(walletCurrency).symbol}</span>
                                    <input type="number" step="0.01" min="0.01" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)}
                                        placeholder="0.00" className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold" required />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Available: {formatCurrency(balance, walletCurrency)} {walletCurrency}</p>
                            </div>

                            <div className="bg-violet-50 border border-violet-100 p-6 rounded-xl shadow-sm">
                                <label className="block text-sm font-bold text-violet-900 mb-2">Your Receive Details (<span className="text-violet-700">UPI ID / SWIFT Code</span>)</label>
                                <input type="text" value={wdDetails} onChange={(e) => setWdDetails(e.target.value)}
                                    placeholder={wdCurrency === "INR" ? "e.g., yourname@okicici" : "e.g., SWIFT: BOFAUS3N, ACC: 123456"} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium text-sm" required />
                                {/* <p className="text-xs font-medium text-violet-600/80 mt-2">Admin will manually send {wdAmount ? `${getCurrency(wdCurrency).symbol}${wdAmount} ${wdCurrency}` : "funds"} to these details after approval.</p> */}
                            </div>

                            {/* Live Quote */}
                            <LiveQuoteDisplay
                                sourceCurrency="USD"
                                targetCurrency={wdCurrency}
                                amount={wdAmount}
                                onQuoteFetched={setWithdrawQuoteId}
                            />

                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Transaction PIN</label>
                                <input type="password" value={wdPin} onChange={(e) => setWdPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="Enter 6-digit PIN" maxLength={6} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center text-xl shadow-sm" required />
                            </div>

                            <button type="submit"
                                disabled={submitting || !wdAmount || !wdDetails || (wdCurrency !== "USD" && !withdrawQuoteId)}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base transition-colors">
                                {submitting ? "Processing…" : `Withdraw to ${wdCurrency}`}
                            </button>
                        </form>
                    )}
                </div>

                {/* Right: Rates sidebar */}
                {Object.keys(rates).length > 0 && (
                    <div className="lg:col-span-1">
                        <RatesSidebar rates={rates} onRefresh={handleRefreshRates} refreshing={refreshing} />
                    </div>
                )}
            </div>
        </div>
    );
}
