import { useState, useEffect } from "react";
import { adminAPI } from "../services/api";

export default function Admin() {
    const [deposits, setDeposits] = useState([]);
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const deps = await adminAPI.getPendingDeposits();
            const withs = await adminAPI.getPendingWithdrawals();
            setDeposits(deps);
            setWithdrawals(withs);
            setError(null);
        } catch (err) {
            setError("Failed to load admin data. Ensure you are an administrator: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const approveDeposit = async (id) => {
        try {
            await adminAPI.approveDeposit(id);
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    const rejectDeposit = async (id) => {
        if (!window.confirm("Reject this deposit request?")) return;
        try {
            await adminAPI.rejectDeposit(id);
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    const approveWithdrawal = async (id) => {
        if (!window.confirm("Did you send the money to the user? Only hit OK if you've already paid them.")) return;
        try {
            await adminAPI.approveWithdrawal(id);
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    const rejectWithdrawal = async (id) => {
        if (!window.confirm("Reject this withdrawal and refund the user?")) return;
        try {
            await adminAPI.rejectWithdrawal(id);
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    if (loading) return <div className="p-8 font-semibold text-gray-500">Loading admin dashboard...</div>;

    return (
        <div className="max-w-6xl mx-auto pb-20">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Admin Control Panel</h1>
                    <p className="mt-2 text-sm text-gray-500">Review and approve manual payment requests securely.</p>
                </div>
            </div>

            {error && (
                <div className="mb-8 rounded-xl bg-red-50 p-4 border border-red-100 text-sm font-medium text-red-800">
                    {error}
                </div>
            )}

            <div className="space-y-8">
                {/* Pending Deposits */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="border-b border-gray-100 bg-gray-50/50 px-4 sm:px-6 py-4">
                        <h2 className="font-semibold text-gray-900">Pending Deposits</h2>
                    </div>
                    <div className="p-4 sm:p-6">
                        {deposits.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">All caught up! No deposits waiting for approval.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-600">
                                    <thead className="text-xs uppercase bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">User</th>
                                            <th className="px-4 py-3">Request</th>
                                            <th className="px-4 py-3">Method</th>
                                            <th className="px-4 py-3">Reference/UTR</th>
                                            <th className="px-4 py-3 rounded-r-lg text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deposits.map(d => (
                                            <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-900">{d.user_email}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-gray-900">{d.source_amount} {d.source_currency}</div>
                                                    <div className="text-xs text-green-600">to ${d.amount_usd} USD</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                                                        {d.method}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs">{d.deposit_proof || "N/A"}</td>
                                                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                                    <button onClick={() => approveDeposit(d.id)} className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 font-medium rounded-lg text-xs transition-colors">Approve</button>
                                                    <button onClick={() => rejectDeposit(d.id)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg text-xs transition-colors">Reject</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Pending Withdrawals */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="border-b border-gray-100 bg-gray-50/50 px-4 sm:px-6 py-4">
                        <h2 className="font-semibold text-gray-900">Pending Withdrawals</h2>
                    </div>
                    <div className="p-4 sm:p-6">
                        {withdrawals.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">No pending withdrawals to process.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-600">
                                    <thead className="text-xs uppercase bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">User</th>
                                            <th className="px-4 py-3">Amount Required</th>
                                            <th className="px-4 py-3">Method</th>
                                            <th className="px-4 py-3">Destination Details</th>
                                            <th className="px-4 py-3 rounded-r-lg text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {withdrawals.map(w => (
                                            <tr key={w.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-900">{w.user_email}</td>
                                                <td className="px-4 py-3 font-bold text-gray-900">${w.amount_usd.toFixed(2)} USD</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-violet-50 text-violet-700">
                                                        {w.method}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs w-1/3">
                                                    <div className="p-2 bg-gray-50 border border-gray-100 rounded break-all font-mono">
                                                        {w.user_payment_details || "N/A"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                                    <button onClick={() => approveWithdrawal(w.id)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-lg text-xs transition-colors">Mark Paid</button>
                                                    <button onClick={() => rejectWithdrawal(w.id)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg text-xs transition-colors">Reject (Refund)</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
