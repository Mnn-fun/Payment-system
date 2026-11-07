import { useState } from 'react';
import { transferAPI, accountAPI } from '../services/api';

export default function UpgradeCard() {
  const [sendModal, setSendModal] = useState(false);
  const [receiveModal, setReceiveModal] = useState(false);
  const [formData, setFormData] = useState({ recipient: '', amount: '', description: '', pin: '' });
  const [isTest, setIsTest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.recipient || !formData.amount) {
      setError('Please fill in required fields');
      return;
    }
    if (!formData.pin || formData.pin.length !== 6) {
      setError('Please enter your 6-digit Transaction PIN');
      return;
    }

    try {
      setLoading(true);
      
      // Verify recipient exists
      const userCheck = await accountAPI.searchUserByEmail(formData.recipient);
      if (!userCheck.found) {
        setError(userCheck.error || 'Recipient not found');
        return;
      }

      // Send the transfer: create(pin, email, amount, description, isTest)
      await transferAPI.create(
        formData.pin,
        formData.recipient,
        parseFloat(formData.amount),
        formData.description,
        isTest
      );
      
      alert(`$${formData.amount} ${isTest ? 'test ' : ''}USD sent successfully!`);
      setFormData({ recipient: '', amount: '', description: '', pin: '' });
      setIsTest(false);
      setSendModal(false);
    } catch (err) {
      setError(err.message || 'Error sending money');
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = () => {
    const userEmail = localStorage.getItem('userEmail');
    alert(`Share your details with the sender:\n\nEmail: ${userEmail}\nAccount Type: Personal\n\nThey can use these details to send you money.`);
    setReceiveModal(false);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Send Button */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 shadow-lg text-white flex flex-col items-center justify-center relative overflow-hidden min-h-[200px] cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all" onClick={() => setSendModal(true)}>
        <div className="absolute -right-12 -top-12 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-3">
            <span className="material-icons-round text-3xl">send</span>
          </div>
          <h3 className="text-lg font-bold mb-2">Send Money</h3>
          <p className="text-white/70 text-xs">Transfer funds to contacts</p>
        </div>
      </div>

      {/* Receive Button */}
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 shadow-lg text-white flex flex-col items-center justify-center relative overflow-hidden min-h-[200px] cursor-pointer hover:from-green-700 hover:to-green-800 transition-all" onClick={() => setReceiveModal(true)}>
        <div className="absolute -left-12 -bottom-12 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-3">
            <span className="material-icons-round text-3xl">call_received</span>
          </div>
          <h3 className="text-lg font-bold mb-2">Receive Money</h3>
          <p className="text-white/70 text-xs">Get paid by others</p>
        </div>
      </div>

      {/* Send Modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Send Money</h2>
              <button onClick={() => { setSendModal(false); setError(''); }} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Recipient Email</label>
                <input
                  type="email"
                  value={formData.recipient}
                  onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                  placeholder="Enter recipient email"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Amount (USD)</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="Enter amount"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Description (Optional)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What is this for?"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Real / Test toggle */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Transfer Type</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-200">
                  <button type="button" onClick={() => setIsTest(false)}
                    className={`flex-1 py-2 text-sm font-bold transition-all ${!isTest ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    💳 Real Money
                  </button>
                  <button type="button" onClick={() => setIsTest(true)}
                    className={`flex-1 py-2 text-sm font-bold transition-all ${isTest ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    🧪 Test Money
                  </button>
                </div>
                {isTest && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    Deducts from your <strong>test balance</strong> only.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Transaction PIN</label>
                <input
                  type="password"
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="Enter 6-digit PIN"
                  maxLength={6}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center text-lg"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setSendModal(false); setError(''); }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-semibold transition-colors"
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {receiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Receive Money</h2>
              <button onClick={() => setReceiveModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-sm text-gray-600 mb-4">Share these details with the sender:</p>
                <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
                  <p className="text-sm text-gray-500 mb-1">Email</p>
                  <p className="font-semibold text-gray-900">{localStorage.getItem('userEmail')}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-500 mb-1">Account Type</p>
                  <p className="font-semibold text-gray-900">Personal Account</p>
                </div>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(localStorage.getItem('userEmail'));
                  alert('Email copied to clipboard!');
                }}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors"
              >
                Copy Email
              </button>

              <button
                onClick={() => setReceiveModal(false)}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
