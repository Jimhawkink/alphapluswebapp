'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Expense {
    expense_id: number;
    expense_name: string;
    expense_date: string;
    expense_type: string;
    category: string;
    description: string;
    amount: number;
    payment_mode: string;
    reference_no: string;
    created_by: string;
}

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        expense_name: '',
        category: '',
        description: '',
        amount: 0,
        payment_mode: 'Cash',
        reference_no: ''
    });

    const categories = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Transport', 'Marketing', 'Other'];

    const loadExpenses = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .gte('expense_date', dateFrom)
            .lte('expense_date', dateTo)
            .order('expense_date', { ascending: false });
        if (!error) setExpenses(data || []);
        setIsLoading(false);
    };

    useEffect(() => { loadExpenses(); }, [dateFrom, dateTo]);

    const handleSave = async () => {
        // Validate required fields - expense_name is required in the database
        if (!formData.expense_name.trim()) {
            toast.error('Please enter an expense name');
            return;
        }
        if (!formData.category) {
            toast.error('Please select a category');
            return;
        }
        if (formData.amount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setIsSaving(true);
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;

        const { error } = await supabase.from('expenses').insert({
            expense_name: formData.expense_name.trim(),  // Required field!
            expense_type: formData.category,
            category: formData.category,
            description: formData.description || null,
            amount: formData.amount,
            payment_mode: formData.payment_mode,
            reference_no: formData.reference_no || null,
            expense_date: new Date().toISOString().split('T')[0],
            created_by: user?.name || 'Admin'
        });

        if (error) {
            console.error('Expense save error:', error);
            toast.error(`Failed to save: ${error.message || 'Unknown error'}`);
        } else {
            toast.success('Expense saved successfully!');
            setShowModal(false);
            loadExpenses();
            setFormData({
                expense_name: '',
                category: '',
                description: '',
                amount: 0,
                payment_mode: 'Cash',
                reference_no: ''
            });
        }
        setIsSaving(false);
    };

    const deleteExpense = async (id: number) => {
        if (!confirm('Delete this expense?')) return;
        const { error } = await supabase.from('expenses').delete().eq('expense_id', id);
        if (error) {
            toast.error('Failed to delete');
        } else {
            toast.success('Deleted');
            loadExpenses();
        }
    };

    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl flex items-center justify-center text-white text-2xl">💸</span>
                    Expenses Management
                </h1>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    ➕ New Expense
                </button>
            </div>

            {/* Stats and Filters */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">💸</span>
                    <p className="text-sm opacity-80 mt-2">Total Expenses</p>
                    <p className="text-3xl font-bold">Ksh {totalExpenses.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">📋</span>
                    <p className="text-sm opacity-80 mt-2">Total Records</p>
                    <p className="text-3xl font-bold">{expenses.length}</p>
                </div>
                <div className="col-span-2 bg-white rounded-2xl p-5 border flex items-center gap-4">
                    <div className="flex-1">
                        <label className="text-xs text-gray-500">From</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="w-full p-2 border rounded-lg"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs text-gray-500">To</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            className="w-full p-2 border rounded-lg"
                        />
                    </div>
                    <button
                        onClick={loadExpenses}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        🔍
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-rose-50 to-pink-50">
                        <tr>
                            <th className="text-left py-4 px-4 text-xs font-bold text-gray-600">Date</th>
                            <th className="text-left py-4 px-4 text-xs font-bold text-gray-600">Expense Name</th>
                            <th className="text-left py-4 px-4 text-xs font-bold text-gray-600">Category</th>
                            <th className="text-left py-4 px-4 text-xs font-bold text-gray-600">Description</th>
                            <th className="text-right py-4 px-4 text-xs font-bold text-gray-600">Amount</th>
                            <th className="text-center py-4 px-4 text-xs font-bold text-gray-600">Payment</th>
                            <th className="text-center py-4 px-4 text-xs font-bold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={7} className="py-16 text-center">Loading...</td></tr>
                        ) : expenses.length === 0 ? (
                            <tr><td colSpan={7} className="py-16 text-center text-gray-500">No expenses found</td></tr>
                        ) : (
                            expenses.map(exp => (
                                <tr key={exp.expense_id} className="border-t hover:bg-pink-50/30">
                                    <td className="py-3 px-4">{new Date(exp.expense_date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4 font-semibold">{exp.expense_name}</td>
                                    <td className="py-3 px-4">
                                        <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-semibold">
                                            {exp.category || exp.expense_type}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-gray-600">{exp.description || '-'}</td>
                                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                                        Ksh {exp.amount?.toLocaleString()}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">{exp.payment_mode}</span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <button
                                            onClick={() => deleteExpense(exp.expense_id)}
                                            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>💸</span> New Expense
                        </h2>
                        <div className="space-y-4">
                            {/* Expense Name - REQUIRED */}
                            <div>
                                <label className="text-sm text-gray-600 font-medium">
                                    Expense Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    value={formData.expense_name}
                                    onChange={e => setFormData({ ...formData, expense_name: e.target.value })}
                                    className="w-full p-3 border rounded-xl focus:border-rose-500 focus:outline-none"
                                    placeholder="e.g., Electricity Bill, Office Supplies..."
                                />
                            </div>

                            {/* Category */}
                            <div>
                                <label className="text-sm text-gray-600 font-medium">
                                    Category <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full p-3 border rounded-xl focus:border-rose-500 focus:outline-none"
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-sm text-gray-600">Description (Optional)</label>
                                <input
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full p-3 border rounded-xl focus:border-rose-500 focus:outline-none"
                                    placeholder="Enter details..."
                                />
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="text-sm text-gray-600 font-medium">
                                    Amount (Ksh) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    value={formData.amount || ''}
                                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                    className="w-full p-3 border rounded-xl focus:border-rose-500 focus:outline-none text-lg font-bold"
                                    placeholder="0.00"
                                />
                            </div>

                            {/* Payment Mode */}
                            <div>
                                <label className="text-sm text-gray-600">Payment Mode</label>
                                <select
                                    value={formData.payment_mode}
                                    onChange={e => setFormData({ ...formData, payment_mode: e.target.value })}
                                    className="w-full p-3 border rounded-xl focus:border-rose-500 focus:outline-none"
                                >
                                    <option>Cash</option>
                                    <option>M-Pesa</option>
                                    <option>Bank</option>
                                    <option>Cheque</option>
                                </select>
                            </div>

                            {/* Reference No */}
                            <div>
                                <label className="text-sm text-gray-600">Reference No (Optional)</label>
                                <input
                                    value={formData.reference_no}
                                    onChange={e => setFormData({ ...formData, reference_no: e.target.value })}
                                    className="w-full p-3 border rounded-xl focus:border-rose-500 focus:outline-none"
                                    placeholder="e.g., Invoice #, M-Pesa code..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50"
                            >
                                {isSaving ? '⏳ Saving...' : '✅ Save Expense'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
