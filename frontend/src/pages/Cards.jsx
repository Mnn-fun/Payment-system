import React, { useState, useEffect, useCallback } from "react";
import { cardAPI, cashfreeAPI } from "../services/api";
import LinkedAccounts from "../components/LinkedAccounts";

const NETWORK_STYLE = {
  VISA: { bg: "from-blue-600 to-blue-800", label: "VISA" },
  MASTERCARD: { bg: "from-slate-700 to-slate-900", label: "MC" },
  AMEX: { bg: "from-emerald-600 to-teal-800", label: "AMEX" },
  DISCOVER: { bg: "from-orange-500 to-orange-700", label: "DISC" },
  RUPAY: { bg: "from-zinc-800 to-zinc-950 text-zinc-100", label: "RUPAY" },
  UNKNOWN: { bg: "from-gray-500 to-gray-700", label: "????" },
};

const STATUS_BADGE = {
  ACTIVE: { text: "Active", cls: "bg-green-100 text-green-700" },
  FROZEN: { text: "Frozen", cls: "bg-blue-100 text-blue-700" },
  PENDING_VERIFICATION: { text: "Pending", cls: "bg-yellow-100 text-yellow-700" },
};

// ── Format raw card number as user types ──────────────────────────────────
const formatCardNumber = (raw) =>
  raw.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

// ── Format expiry as MM/YY ────────────────────────────────────────────────
const formatExpiry = (raw) => {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length > 2) return d.slice(0, 2) + "/" + d.slice(2);
  return d;
};

// ── Visible card component ─────────────────────────────────────────────────
const PaymentCard = ({ card, preview, isFrozen }) => {
  const net = preview?.network || card?.card_network || "UNKNOWN";
  const style = NETWORK_STYLE[net] || NETWORK_STYLE.UNKNOWN;
  const masked = preview
    ? (preview.number ? `•••• •••• •••• ${preview.number.replace(/\s/g, "").slice(-4) || "????"}` : "•••• •••• •••• ????")
    : `•••• •••• •••• ${card.last_four}`;
  const expiry = preview
    ? (preview.expiry || "MM/YY")
    : card.expiry_month ? `${card.expiry_month}/${card.expiry_year?.slice(-2) || "??"}` : "••/••";
  const holder = preview?.holder || card?.cardholder_name || "Card Holder";

  return (
    <div className={`relative bg-gradient-to-br ${style.bg} text-white rounded-2xl p-6 md:p-7 w-full aspect-[1.586] shadow-xl select-none flex flex-col justify-between overflow-hidden`}>

      {/* Frozen Overlay */}
      {isFrozen && (
        <div className="absolute inset-0 z-10 bg-white/10 backdrop-blur-[6px] flex flex-col items-center justify-center">
          <span className="text-2xl font-black tracking-widest text-white drop-shadow-md opacity-90 uppercase transform -rotate-12 border-4 border-white border-opacity-50 px-4 py-1 rounded-lg">Frozen</span>
        </div>
      )}

      {/* Card Content container (receives lower opacity when frozen for contrast) */}
      <div className={`flex flex-col justify-between h-full ${isFrozen ? 'opacity-40' : ''}`}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] md:text-xs opacity-60 uppercase tracking-wider">Card Holder</p>
            <p className="font-bold text-base md:text-lg mt-0.5 truncate max-w-[160px] md:max-w-[200px]">{holder}</p>
          </div>
          <span className="text-xl md:text-2xl font-extrabold tracking-widest opacity-90">{style.label}</span>
        </div>
        <div>
          <p className="text-lg md:text-xl font-mono tracking-[0.15em] md:tracking-[0.2em] mb-4 md:mb-6">{masked}</p>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] md:text-xs opacity-60 uppercase tracking-wider">Expires</p>
              <p className="font-mono font-bold text-sm md:text-base mt-0.5">{expiry}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] md:text-xs opacity-60 uppercase tracking-wider">CVV</p>
              <p className="font-mono font-bold text-sm md:text-base mt-0.5">•••</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Modal wrapper ─────────────────────────────────────────────────────────
const Modal = ({ children, onClose }) => (
  <div
    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3.5 sm:p-4"
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      {children}
    </div>
  </div>
);

// ── Input helper ──────────────────────────────────────────────────────────
const Field = ({ label, hint, ...props }) => (
  <div>
    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
      {label} {hint && <span className="text-xs font-normal text-gray-400">{hint}</span>}
    </label>
    <input
      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
      {...props}
    />
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────
export default function Cards() {
  // Local InterPay cards
  const [cards, setCards] = useState([]);
  // Cashfree saved instruments
  const [cfCards, setCfCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [modal, setModal] = useState(null); // "add" | "otp" | "txn" | "confirm-remove"
  const [pendingCardId, setPending] = useState(null); // card awaiting OTP
  const [txnCard, setTxnCard] = useState(null); // card for deposit/withdraw

  // Add-card form
  const [form, setForm] = useState({
    holder: "", number: "", expiry: "", cvv: "", phone: "",
  });

  // OTP
  const [otpCode, setOtpCode] = useState("");

  // Transaction modal
  const [txnType, setTxnType] = useState("deposit"); // "deposit" | "withdraw"
  const [txnAmt, setTxnAmt] = useState("");

  // Toast
  const [toast, setToast] = useState(null);

  // Action loading
  const [busy, setBusy] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [localCards, cashfreeCards] = await Promise.all([
        cardAPI.list(),
        cashfreeAPI.savedCards().catch(() => []),
      ]);
      setCards(localCards);
      setCfCards(cashfreeCards);
    } catch (e) {
      setError(e.message || "Failed to load cards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const closeModal = () => {
    setModal(null);
    setForm({ holder: "", number: "", expiry: "", cvv: "", phone: "" });
    setOtpCode("");
    setTxnAmt("");
    setTxnCard(null);
    setPending(null);
  };

  // ── Add Card: Step 1 ────────────────────────────────────────────────────
  const handleAddCard = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const [mm, yy] = form.expiry.split("/");
      const res = await cardAPI.add(
        form.holder.trim(),
        form.number.replace(/\s/g, ""),
        mm?.trim(),
        yy ? `20${yy.trim()}` : "",
        form.cvv.trim(),
        form.phone.trim(),
      );
      setPending(res.card_id);
      setModal("otp");
      showToast(`OTP sent to ${form.phone}. (Check your registered email if it doesn't arrive via SMS)`, "info");
    } catch (e) {
      setError(e.message || "Failed to add card.");
    } finally {
      setBusy(false);
    }
  };

  // ── OTP Verify ──────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) { setError("Enter the 6-digit code."); return; }
    setBusy(true);
    setError("");
    try {
      await cardAPI.verify(pendingCardId, otpCode);
      showToast("Card verified and added successfully! 🎉");
      closeModal();
      fetchCards();
    } catch (e) {
      setError(e.message || "OTP verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleResendOtp = async () => {
    setBusy(true);
    try {
      await cardAPI.resendOtp(pendingCardId);
      showToast("New OTP sent.", "info");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Freeze / Unfreeze ───────────────────────────────────────────────────
  const handleFreeze = async (card) => {
    setBusy(true);
    try {
      if (card.status === "ACTIVE") {
        await cardAPI.freeze(card.id);
        showToast(`Card ···${card.last_four} frozen.`);
      } else {
        await cardAPI.unfreeze(card.id);
        showToast(`Card ···${card.last_four} unfrozen.`);
      }
      fetchCards();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Remove Local Card ──────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState(null);

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await cardAPI.remove(removeTarget.id);
      showToast(`Card ···${removeTarget.last_four} removed.`);
      setRemoveTarget(null);
      fetchCards();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Remove Cashfree Saved Card ──────────────────────────────────────────
  const [cfRemoveTarget, setCfRemoveTarget] = useState(null);

  const confirmCfRemove = async () => {
    setBusy(true);
    try {
      await cashfreeAPI.deleteSavedCard(cfRemoveTarget.instrument_id_raw);
      showToast(`Cashfree card ···${cfRemoveTarget.last_four} removed.`);
      setCfRemoveTarget(null);
      fetchCards();
    } catch (e) {
      showToast(e.message || "Failed to remove card", "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Deposit / Withdraw ──────────────────────────────────────────────────
  const handleTransaction = async (e) => {
    e.preventDefault();
    const amt = parseFloat(txnAmt);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    setBusy(true);
    setError("");
    try {
      const res = txnType === "deposit"
        ? await cardAPI.deposit(txnCard.id, amt)
        : await cardAPI.withdraw(txnCard.id, amt);
      showToast(res.message);
      closeModal();
    } catch (e) {
      setError(e.message || "Transaction failed.");
    } finally {
      setBusy(false);
    }
  };

  // ── Derived preview for add-card live card ──────────────────────────────
  const livePreview = {
    number: form.number,
    expiry: form.expiry,
    holder: form.holder || "Card Holder",
    network: (() => {
      const n = form.number.replace(/\s/g, "");
      if (n.startsWith("4")) return "VISA";
      if (n.startsWith("5")) return "MASTERCARD";
      if (n.startsWith("3")) return "AMEX";
      if (n.startsWith("60") || n.startsWith("65") || n.startsWith("81") || n.startsWith("82") || n.startsWith("508")) return "RUPAY";
      if (n.startsWith("6")) return "DISCOVER";
      return "UNKNOWN";
    })(),
  };

  const totalCards = cfCards.length + cards.length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[999] px-6 py-3 rounded-lg shadow-lg font-semibold text-sm transition-all ${toast.type === "error" ? "bg-red-600 text-white"
          : toast.type === "info" ? "bg-blue-600 text-white"
            : "bg-green-600 text-white"
          }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Cards</h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm">Manage payment cards saved through Cashfree checkout and local cards.</p>
        </div>
        <button
          onClick={() => { setError(""); setModal("add"); }}
          className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">＋</span> Add Local Card
        </button>
      </div>

      {/* Error banner */}
      {error && !modal && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex gap-2 items-center">
          <span>⚠</span> {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading cards…</div>
      ) : totalCards === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
          <div className="text-5xl mb-4">💳</div>
          <p className="text-gray-600 font-semibold text-lg">No saved cards yet</p>
          <p className="text-gray-400 text-sm mt-1 mb-6">
            Cards will appear here when you save one during Cashfree checkout, or you can add a local card manually.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/wallet" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 inline-flex items-center gap-2">
              <span className="material-icons-round text-lg">credit_card</span>
              Make a Payment to Save a Card
            </a>
            <button
              onClick={() => { setError(""); setModal("add"); }}
              className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50"
            >
              Add Local Card
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ═══ CASHFREE SAVED CARDS ═══════════════════════════════════════ */}
          {cfCards.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="material-icons-round text-emerald-600">verified</span>
                <h2 className="text-lg font-bold text-gray-900">Cashfree Saved Cards</h2>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{cfCards.length}</span>
              </div>
              <p className="text-xs text-gray-400 mb-4">These cards were saved through our secure Cashfree checkout. They auto-appear when you make a payment.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {cfCards.map((card) => (
                  <div key={card.instrument_id} className="flex flex-col gap-4 max-w-[440px] mx-auto w-full">
                    <PaymentCard card={{
                      card_network: card.card_network,
                      last_four: card.last_four,
                      cardholder_name: card.card_bank_name || card.card_type || "Cashfree Card",
                    }} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                          <span className="material-icons-round text-xs">lock</span>
                          Tokenized
                        </span>
                        {card.card_type && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium capitalize">{card.card_type}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setCfRemoveTarget(card)}
                        disabled={busy}
                        className="text-sm font-semibold text-red-500 hover:text-red-700 disabled:opacity-40 transition flex items-center gap-1"
                      >
                        <span className="material-icons-round text-sm">delete_outline</span>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ LOCAL INTERPAY CARDS ═══════════════════════════════════════ */}
          {cards.length > 0 && (
            <div className={cfCards.length > 0 ? "pt-6 border-t border-gray-200" : ""}>
              <div className="flex items-center gap-2 mb-4">
                <span className="material-icons-round text-blue-600">credit_card</span>
                <h2 className="text-lg font-bold text-gray-900">Local Cards</h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{cards.length}</span>
              </div>
              <p className="text-xs text-gray-400 mb-4">Cards added directly through InterPay. These are stored securely on our platform.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {cards.map((card) => {
                  const badge = STATUS_BADGE[card.status] || STATUS_BADGE.ACTIVE;
                  const isActive = card.status === "ACTIVE";
                  const isFrozen = card.status === "FROZEN";
                  const isPending = card.status === "PENDING_VERIFICATION";
                  return (
                    <div key={card.id} className="flex flex-col gap-4 max-w-[440px] mx-auto w-full">
                      <div className="relative">
                        <PaymentCard card={card} isFrozen={isFrozen} />
                        <span className={`absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                        {isPending && (
                          <button
                            onClick={() => { setPending(card.id); setError(""); setModal("otp"); }}
                            className="col-span-2 sm:flex-1 min-w-[80px] py-2 text-xs sm:text-sm font-semibold rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition"
                          >
                            Verify Now
                          </button>
                        )}
                        {(isActive || isFrozen) && (
                          <>
                            <button
                              onClick={() => { setTxnCard(card); setTxnType("deposit"); setError(""); setModal("txn"); }}
                              disabled={isFrozen}
                              className="sm:flex-1 min-w-[80px] py-2 text-xs sm:text-sm font-semibold rounded-xl border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              ↓ Deposit
                            </button>
                            <button
                              onClick={() => { setTxnCard(card); setTxnType("withdraw"); setError(""); setModal("txn"); }}
                              disabled={isFrozen}
                              className="sm:flex-1 min-w-[80px] py-2 text-xs sm:text-sm font-semibold rounded-xl border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                              ↑ Withdraw
                            </button>
                            <button
                              onClick={() => handleFreeze(card)}
                              disabled={busy}
                              className="sm:flex-1 min-w-[80px] py-2 text-xs sm:text-sm font-semibold rounded-xl border border-orange-200 bg-white text-orange-700 hover:bg-orange-50 disabled:opacity-40 transition"
                            >
                              {isFrozen ? "🔓 Unfreeze" : "🔒 Freeze"}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setRemoveTarget(card)}
                          disabled={busy}
                          className="sm:flex-1 min-w-[80px] py-2 text-xs sm:text-sm font-semibold rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-40 transition"
                        >
                          🗑 Remove
                        </button>
                      </div>

                      {isFrozen && (
                        <p className="text-xs text-center text-blue-600 -mt-2">
                          Card is frozen — unfreeze to use it.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Tip: How to save cards ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <span className="material-icons-round text-blue-600 mt-0.5">tips_and_updates</span>
        <div>
          <p className="text-sm font-semibold text-blue-900">How to save a card for quick payments</p>
          <p className="text-xs text-blue-700 mt-1">
            When making a deposit on the <a href="/wallet" className="underline font-semibold">Wallet page</a>, check
            <strong> "Save this card for future"</strong> in the Cashfree checkout. The card will appear here automatically next time.
          </p>
        </div>
      </div>

      {/* ── ADD CARD MODAL ─────────────────────────────────────────────────── */}
      {modal === "add" && (
        <Modal onClose={closeModal}>
          <div className="p-5 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add New Card</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* Live card preview */}
            <div className="mb-6">
              <PaymentCard preview={livePreview} />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">⚠ {error}</div>
            )}

            <form onSubmit={handleAddCard} className="space-y-4">
              <Field
                label="Cardholder Name"
                placeholder="e.g. Alex Morgan"
                value={form.holder}
                onChange={e => setForm({ ...form, holder: e.target.value })}
                required
              />
              <Field
                label="Card Number"
                placeholder="1234 5678 9012 3456"
                value={form.number}
                onChange={e => setForm({ ...form, number: formatCardNumber(e.target.value) })}
                maxLength={19}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Expiry"
                  hint="(MM/YY)"
                  placeholder="MM/YY"
                  value={form.expiry}
                  onChange={e => setForm({ ...form, expiry: formatExpiry(e.target.value) })}
                  maxLength={5}
                  required
                />
                <Field
                  label="CVV"
                  hint="(3–4 digits)"
                  placeholder="•••"
                  type="password"
                  value={form.cvv}
                  onChange={e => setForm({ ...form, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  required
                />
              </div>
              <Field
                label="Phone Number"
                hint="(stored on card record)"
                placeholder="+91 9876543210"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                required
              />
              <p className="text-xs text-gray-400">
                🔒 Your full card number and CVV are <strong>never stored</strong>. Only the last 4 digits are kept; CVV is destroyed immediately after verification.
                The OTP will be sent to your <strong>registered email address</strong>.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-semibold text-sm transition-colors">
                  {busy ? "Sending OTP…" : "Continue →"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ── OTP VERIFICATION MODAL ──────────────────────────────────────────── */}
      {modal === "otp" && (
        <Modal onClose={closeModal}>
          <div className="p-5 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Verify Your Card</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="text-center mb-6">
              <div className="text-5xl mb-3">📱</div>
              <p className="text-gray-600 text-sm">
                A 6-digit code was sent to your <strong>registered phone number</strong>.<br />
                <span className="text-blue-600 font-medium">(If it doesn't arrive via SMS, please check your registered email address)</span><br />
                Enter it below to verify ownership of this card.
              </p>
            </div>


            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">⚠ {error}</div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2 text-center">Verification Code</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full text-center text-3xl font-mono tracking-[0.6em] px-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition"
                  autoFocus
                />
                <p className="text-xs text-gray-400 text-center mt-2">Valid for 10 minutes</p>
              </div>
              <button type="submit" disabled={busy || otpCode.length !== 6}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-semibold transition-colors">
                {busy ? "Verifying…" : "Verify Card"}
              </button>
              <button type="button" onClick={handleResendOtp} disabled={busy}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                Resend OTP
              </button>
              <button type="button" onClick={closeModal}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">
                ← Back
              </button>
            </form>
          </div>
        </Modal>
      )}

      {/* ── DEPOSIT / WITHDRAW MODAL ────────────────────────────────────────── */}
      {modal === "txn" && txnCard && (
        <Modal onClose={closeModal}>
          <div className="p-5 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {txnType === "deposit" ? "Deposit to Wallet" : "Withdraw to Card"}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="mb-6">
              <PaymentCard card={txnCard} />
            </div>

            {/* Tab switch */}
            <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
              {["deposit", "withdraw"].map(t => (
                <button
                  key={t}
                  onClick={() => { setTxnType(t); setError(""); setTxnAmt(""); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${txnType === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                    }`}
                >
                  {t === "deposit" ? "↓ Deposit" : "↑ Withdraw"}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">⚠ {error}</div>
            )}

            <form onSubmit={handleTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    max={txnType === "deposit" ? 10000 : undefined}
                    step="0.01"
                    value={txnAmt}
                    onChange={e => setTxnAmt(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    autoFocus
                  />
                </div>
                {txnType === "deposit" && (
                  <p className="text-xs text-gray-400 mt-1">Maximum deposit: $10,000 per transaction</p>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Card</span>
                  <span className="font-semibold">{txnCard.card_network} ···{txnCard.last_four}</span>
                </div>
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="font-semibold capitalize">{txnType}</span>
                </div>
                {txnAmt && parseFloat(txnAmt) > 0 && (
                  <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                    <span className="font-semibold">You'll {txnType === "deposit" ? "receive" : "send"}</span>
                    <span className="font-bold text-gray-900">${parseFloat(txnAmt).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  className={`flex-1 py-2.5 text-white rounded-xl font-semibold text-sm transition-colors ${txnType === "deposit"
                    ? "bg-green-600 hover:bg-green-700 disabled:bg-green-400"
                    : "bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400"
                    }`}>
                  {busy ? "Processing…" : txnType === "deposit" ? "Deposit →" : "Withdraw →"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ── REMOVE LOCAL CARD CONFIRMATION ─────────────────────────────────── */}
      {removeTarget && (
        <Modal onClose={() => setRemoveTarget(null)}>
          <div className="p-5 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Remove Card</h2>
              <button onClick={() => setRemoveTarget(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🗑️</div>
              <p className="text-gray-600">
                Are you sure you want to remove your <strong>{removeTarget.card_network}</strong> card ending in <strong>{removeTarget.last_four}</strong>?
              </p>
              <p className="text-sm text-red-600 mt-2 font-medium">This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setRemoveTarget(null)} disabled={busy}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={confirmRemove} disabled={busy}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl font-semibold text-sm transition-colors">
                {busy ? "Removing…" : "Yes, Remove Card"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── REMOVE CASHFREE CARD CONFIRMATION ──────────────────────────────── */}
      {cfRemoveTarget && (
        <Modal onClose={() => setCfRemoveTarget(null)}>
          <div className="p-5 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Remove Saved Card</h2>
              <button onClick={() => setCfRemoveTarget(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🗑️</div>
              <p className="text-gray-600">
                Remove your <strong>{cfRemoveTarget.card_network}</strong> card ending in <strong>{cfRemoveTarget.last_four}</strong> from Cashfree?
              </p>
              <p className="text-sm text-gray-500 mt-2">This card will no longer appear in Cashfree checkout.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setCfRemoveTarget(null)} disabled={busy}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={confirmCfRemove} disabled={busy}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl font-semibold text-sm transition-colors">
                {busy ? "Removing…" : "Yes, Remove Card"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Linked Accounts Section at the bottom */}
      <div className="pt-8 mt-4 border-t border-gray-200">
        <LinkedAccounts />
      </div>
    </div>
  );
}