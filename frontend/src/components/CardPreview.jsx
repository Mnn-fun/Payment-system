import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cardAPI } from '../services/api';

const NETWORK_STYLE = {
  VISA: { bg: "from-blue-600 to-blue-800", label: "VISA" },
  MASTERCARD: { bg: "from-slate-700 to-slate-900", label: "MC" },
  AMEX: { bg: "from-emerald-600 to-teal-800", label: "AMEX" },
  DISCOVER: { bg: "from-orange-500 to-orange-700", label: "DISC" },
  RUPAY: { bg: "from-zinc-800 to-zinc-950 text-zinc-100", label: "RUPAY" },
  UNKNOWN: { bg: "from-gray-500 to-gray-700", label: "???" },
};

function PaymentCard({ card, onClick, className = "" }) {
  const net = card.card_network || "UNKNOWN";
  const style = NETWORK_STYLE[net] || NETWORK_STYLE.UNKNOWN;
  const isFrozen = card.status === "FROZEN";

  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br ${style.bg} text-white p-6 flex flex-col justify-between group cursor-pointer transform transition-transform duration-300 ${className} aspect-[1.586/1]`}
    >
      {isFrozen && (
        <div className="absolute inset-0 z-10 bg-white/10 backdrop-blur-[6px] flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black tracking-widest text-white drop-shadow-md opacity-90 uppercase transform -rotate-12 border-4 border-white border-opacity-50 px-4 py-1 rounded-lg">Frozen</span>
        </div>
      )}

      <div className={`flex flex-col justify-between h-full ${isFrozen ? 'opacity-40' : ''}`}>
        <div className="flex justify-between items-start">
          <span className="font-mono text-base tracking-widest font-semibold">InterPay</span>
          <span className="material-icons-round text-2xl">contactless</span>
        </div>
        <div className="relative z-10 my-auto pt-2">
          <div className="w-10 h-7 bg-yellow-300 rounded-md border-2 border-white/30 mb-2 flex items-center justify-center">
            <div className="w-6 h-4 bg-yellow-500 rounded-sm"></div>
          </div>
          <p className="font-mono text-[1.1rem] md:text-xl tracking-[0.10em] md:tracking-[0.15em] font-semibold">•••• •••• •••• {card.last_four}</p>
        </div>
        <div className="relative z-10 flex justify-between items-end pb-1">
          <div>
            <p className="text-[9px] md:text-xs uppercase opacity-70 tracking-wider mb-1">Card Holder</p>
            <p className="font-semibold text-sm md:text-base truncate max-w-[120px] md:max-w-[200px]">{card.cardholder_name}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] md:text-xs uppercase opacity-70 tracking-wider mb-1">Expires</p>
            <p className="font-semibold text-sm md:text-base">{card.expiry_month}/{String(card.expiry_year).slice(-2)}</p>
          </div>
          <div>
            <span className="font-bold text-xl md:text-2xl">{style.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CardPreview() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState(localStorage.getItem("dashboard_card_id"));
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        const data = await cardAPI.list();
        setCards(data || []);
      } catch (err) {
        console.error("Failed to load cards", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCards();
  }, []);

  const activeCard = cards.find(c => String(c.id) === String(selectedId)) || (cards.length > 0 ? cards[0] : null);

  const handleSelectCard = (id) => {
    setSelectedId(id);
    localStorage.setItem("dashboard_card_id", id);
    setModalOpen(false);
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-100 flex flex-col h-full min-h-[380px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-slate-900 text-lg">Card Preview</h3>
          <button
            onClick={() => navigate('/cards')}
            className="text-sm text-gray-600 hover:text-blue-600 transition-colors font-semibold"
          >
            Manage Cards
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center pb-4">
          {loading ? (
            <div className="text-gray-400 text-sm">Loading card...</div>
          ) : activeCard ? (
            <div className="w-full max-w-sm">
              <PaymentCard
                card={activeCard}
                onClick={() => setModalOpen(true)}
                className="hover:-translate-y-1 shadow-lg"
              />
              <p className="text-center text-xs text-gray-400 mt-4">Click card to zoom and select</p>
            </div>
          ) : (
            <div className="w-full max-w-sm aspect-[1.586/1] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-500 p-6 text-center bg-gray-50/50">
              <span className="text-3xl mb-2">💳</span>
              <p className="font-semibold text-sm text-gray-700">No cards linked</p>
              <p className="text-xs mt-1 mb-4">Add a debit or credit card to easily fund your wallet.</p>
              <button
                onClick={() => navigate('/cards')}
                className="text-xs font-semibold px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                Add Card
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Select Card Modal */}
      {modalOpen && activeCard && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 bg-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Select Dashboard Card</h2>
                <p className="text-sm text-gray-500 mt-1">Choose which card to preview on your dashboard</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8">
              {/* Highlighted / Zoomed Card */}
              <div className="flex justify-center -mt-2">
                <div className="w-full max-w-md transform scale-105 transition-transform">
                  <PaymentCard card={activeCard} className="shadow-2xl" />
                </div>
              </div>

              {/* Other Cards List */}
              {cards.length > 1 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest mb-4">Available Cards</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {cards.map((c) => {
                      const isSelected = String(c.id) === String(activeCard.id);
                      return (
                        <div
                          key={c.id}
                          onClick={() => handleSelectCard(c.id)}
                          className={`relative rounded-xl border-2 p-3 flex flex-col justify-between aspect-[1.586/1] cursor-pointer transition-all ${isSelected
                              ? 'border-blue-500 shadow-md ring-4 ring-blue-500/20'
                              : 'border-transparent bg-white shadow-sm hover:shadow-md hover:border-blue-300'
                            }`}
                        >
                          {isSelected && (
                            <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
                              <span className="material-icons-round text-sm">check</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-gray-800">
                            <span className="font-bold">{c.card_network}</span>
                            <span className="material-icons-round text-xl opacity-60">contactless</span>
                          </div>
                          <div>
                            <p className="font-mono text-lg tracking-widest text-gray-800">•••• {c.last_four}</p>
                            <p className="text-xs text-gray-500 mt-2 truncate">Exp: {c.expiry_month}/{String(c.expiry_year).slice(-2)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-white">
              <button
                onClick={() => navigate('/cards')}
                className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold transition-colors"
              >
                Manage All Cards
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
