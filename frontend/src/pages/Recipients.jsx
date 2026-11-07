import React, { useState, useEffect } from 'react';
import { transferAPI, accountAPI } from '../services/api';
import SendMoneyModal from '../components/SendMoneyModal';

// Helper to generate initials & color
const getAvatarConfig = (name, email) => {
  const str = name && name !== email.split('@')[0] ? name : email;
  const initial = str.charAt(0).toUpperCase();
  
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
    'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % colors.length;
  
  return {
    initial,
    color: colors[colorIndex]
  };
};

// Add Recipient Modal
const AddRecipientModal = ({ isOpen, onClose, onAdd }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onAdd(email);
      setEmail('');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Add New Recipient</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Recipient Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Adding...' : 'Add Recipient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


export default function Recipients() {
  const [recipients, setRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [sendModal, setSendModal] = useState({ isOpen: false, recipient: null });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchRecipients = async () => {
    try {
      setLoadingRecipients(true);
      const data = await accountAPI.getRecipients();
      setRecipients(data);
    } catch (err) {
      console.error("Failed to fetch recipients:", err);
    } finally {
      setLoadingRecipients(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const handleSendMoney = async (recipientEmail, amount, description, pin, isTest) => {
    setLoading(true);
    try {
      await transferAPI.create(pin, recipientEmail, parseFloat(amount), description, isTest);
      alert(`Successfully sent $${amount} ${isTest ? 'test ' : ''}USD to ${sendModal.recipient.name}`);
      setSendModal({ isOpen: false, recipient: null });
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipient = async (email) => {
    await accountAPI.addRecipient(email);
    await fetchRecipients();
    alert("Recipient added successfully!");
  };

  const filteredRecipients = recipients.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Saved Recipients</h1>
          <p className="text-gray-600 mt-1">Manage your contacts and quick send favorites.</p>
        </div>
        <button 
          onClick={() => setAddModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors flex items-center gap-2"
        >
          <span className="material-icons-round text-lg">add</span>
          Add New Recipient
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <span className="material-icons-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Recipients Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Recipient</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecipients ? (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-gray-500">
                    Loading recipients...
                  </td>
                </tr>
              ) : filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-gray-500">
                    {searchQuery ? 'No recipients match your search.' : 'You have no saved recipients yet.'}
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((recipient) => {
                  const { initial, color } = getAvatarConfig(recipient.name, recipient.email);
                  return (
                    <tr key={recipient.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${color}`}>
                            {initial}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{recipient.name}</p>
                            <p className="text-sm text-gray-500">{recipient.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          recipient.type === 'SAVED' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {recipient.type === 'SAVED' ? 'Contact' : 'Past Transfer'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSendModal({ isOpen: true, recipient })}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                          Send Money
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send Money Modal */}
      <SendMoneyModal
        recipient={sendModal.recipient}
        isOpen={sendModal.isOpen}
        onClose={() => setSendModal({ isOpen: false, recipient: null })}
        onSubmit={handleSendMoney}
        loading={loading}
      />

      {/* Add Recipient Modal */}
      <AddRecipientModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddRecipient}
      />
    </div>
  );
}