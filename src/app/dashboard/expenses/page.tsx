'use client';

import { useState } from 'react';

interface Expense {
    id: number;
    voucherNo: string;
    date: string;
    name: string;
    details: string;
    paymentMode: string;
    amount: number;
}

const sampleExpenses: Expense[] = [
    { id: 1, voucherNo: 'EXP001', date: '2024-12-27', name: 'Electricity Bill', details: 'Monthly electricity payment', paymentMode: 'M-Pesa', amount: 5500 },
    { id: 2, voucherNo: 'EXP002', date: '2024-12-27', name: 'Water Bill', details: 'Monthly water payment', paymentMode: 'Cash', amount: 2500 },
    { id: 3, voucherNo: 'EXP003', date: '2024-12-26', name: 'Staff Transport', details: 'Transport allowance', paymentMode: 'Cash', amount: 3000 },
    { id: 4, voucherNo: 'EXP004', date: '2024-12-26', name: 'Cleaning Supplies', details: 'Cleaning materials', paymentMode: 'M-Pesa', amount: 1500 },
    { id: 5, voucherNo: 'EXP005', date: '2024-12-25', name: 'Internet Bill', details: 'Monthly internet', paymentMode: 'Bank', amount: 4000 },
];

const expenseTypes = ['Electricity', 'Water', 'Internet', 'Transport', 'Supplies', 'Maintenance', 'Rent', 'Other'];
const paymentModes = ['Cash', 'M-Pesa', 'Bank', 'Card'];

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>(sampleExpenses);
    const [showModal, setShowModal] = useState(false);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [formData, setFormData] = useState({
        name: '',
        details: '',
        paymentMode: 'Cash',
        amount: 0,
    });

    const todayExpenses = expenses.filter(e => e.date === filterDate);
    const totalAmount = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    const handleAdd = () => {
        setFormData({ name: '', details: '', paymentMode: 'Cash', amount: 0 });
        setShowModal(true);
    };

    const handleSave = () => {
        if (!formData.name.trim() || formData.amount <= 0) return;

        const newExpense: Expense = {
            id: Date.now(),
            voucherNo: `EXP${String(expenses.length + 1).padStart(3, '0')}`,
            date: new Date().toISOString().split('T')[0],
            ...formData,
        };

        setExpenses(prev => [newExpense, ...prev]);
        setShowModal(false);
    };

    const handleDelete = (id: number) => {
        if (confirm('Are you sure you want to delete this expense?')) {
            setExpenses(prev => prev.filter(e => e.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>💸</span> Expenses
                    </h1>
                    <p className="text-gray-500">Track and manage business expenses</p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    <span>➕</span>
                    <span>Record Expense</span>
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-red-500 to-red-700 rounded-2xl p-5 text-white col-span-2">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">💰</span>
                        <span className="font-medium opacity-90">Today's Expenses</span>
                    </div>
                    <p className="text-3xl font-bold">Ksh {totalAmount.toLocaleString()}</p>
                    <p className="text-sm opacity-80 mt-1">{todayExpenses.length} transactions</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                            <span className="text-xl">💵</span>
                        </div>
                        <span className="text-sm font-medium text-orange-600">Cash</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">
                        Ksh {todayExpenses.filter(e => e.paymentMode === 'Cash').reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
                    </p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <span className="text-xl">📱</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">M-Pesa</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">
                        Ksh {todayExpenses.filter(e => e.paymentMode === 'M-Pesa').reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-4">
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-1 block">Filter by Date</label>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div className="flex-1"></div>
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                        <span>📥</span>
                        <span className="font-medium text-gray-600">Export</span>
                    </button>
                </div>
            </div>

            {/* Expenses List */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Voucher No</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Date</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Expense</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Payment Mode</th>
                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600">Amount</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.map(expense => (
                            <tr key={expense.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                                <td className="py-4 px-4">
                                    <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm font-medium">
                                        {expense.voucherNo}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-gray-600">{expense.date}</td>
                                <td className="py-4 px-4">
                                    <div>
                                        <p className="font-medium text-gray-800">{expense.name}</p>
                                        <p className="text-xs text-gray-500">{expense.details}</p>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${expense.paymentMode === 'Cash' ? 'bg-yellow-100 text-yellow-700' :
                                            expense.paymentMode === 'M-Pesa' ? 'bg-green-100 text-green-700' :
                                                'bg-blue-100 text-blue-700'
                                        }`}>
                                        {expense.paymentMode}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-right font-bold text-red-600">
                                    Ksh {expense.amount.toLocaleString()}
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button className="p-2 hover:bg-blue-50 rounded-lg text-blue-500">
                                            👁️
                                        </button>
                                        <button
                                            onClick={() => handleDelete(expense.id)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span>💸</span> Record Expense
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl hover:opacity-70">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Expense Type</label>
                                <select
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                >
                                    <option value="">Select type...</option>
                                    {expenseTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Details</label>
                                <textarea
                                    value={formData.details}
                                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                                    placeholder="Enter expense details..."
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Amount (Ksh)</label>
                                    <input
                                        type="number"
                                        value={formData.amount || ''}
                                        onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Payment Mode</label>
                                    <select
                                        value={formData.paymentMode}
                                        onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    >
                                        {paymentModes.map(mode => (
                                            <option key={mode} value={mode}>{mode}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-xl font-semibold hover:shadow-lg"
                                >
                                    Save Expense
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
