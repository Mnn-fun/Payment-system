import React, { useState } from 'react';

const SendMoneyModal = ({ recipient, isOpen, onClose, onSubmit, loading }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isTest, setIsTest] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length !== 6) { setError('PIN must be 6 digits'); return; }
    setError('');
    try {
      await onSubmit(recipient.email, amount, description, pin, isTest);
      setAmount('');
      setDescription('');
      setPin('');
      setIsTest(false);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isOpen || !recipient) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Send Money</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-xs text-gray-500 mb-1 font-medium italic">Sending to</p>
          <p className="font-bold text-gray-900 text-lg">{recipient.name}</p>
          <p className="text-sm text-gray-500">{recipient.email}</p>
        </div>

        {/* Real / Test toggle */}
        <div className="mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">Transfer Type</p>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 p-1 bg-gray-50">
            <button
              type="button"
              onClick={() => setIsTest(false)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                !isTest ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              💳 Real Money
            </button>
            <button
              type="button"
              onClick={() => setIsTest(true)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                isTest ? 'bg-amber-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              🧪 Test Money
            </button>
          </div>
          {isTest && (
            <p className="text-[11px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              This will deduct from your <strong>test balance</strong> and credit to the recipient's test balance only.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                required
                step="0.01"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Description <span className="text-gray-400 font-normal">(Optional)</span></label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this for?"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Transaction PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center tracking-[0.5em] font-bold text-xl"
              required
              maxLength={6}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
            >
              {loading ? 'Processing...' : 'Send Money'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SendMoneyModal;
