'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Supplier {
    supplier_id: number;
    supplier_code: string;
    supplier_name: string;
    address: string;
    city: string;
    phone: string;
    phone2: string;
    email: string;
    contact_person: string;
    kra_pin: string;
    opening_balance: number;
    balance_type: string;
    current_balance: number;
    payment_terms: string;
    notes: string;
    is_kitchen: boolean;
    active: boolean;
}

const defaultSupplier = {
    supplier_name: '',
    address: '',
    city: '',
    phone: '',
    phone2: '',
    email: '',
    contact_person: '',
    kra_pin: '',
    opening_balance: 0,
    balance_type: 'Credit',
    payment_terms: '',
    notes: '',
    is_kitchen: false,
    active: true,
};

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [formData, setFormData] = useState(defaultSupplier);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const loadSuppliers = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('*')
                .order('supplier_id', { ascending: false });

            if (error) throw error;
            setSuppliers(data || []);
        } catch (err) {
            console.error('Error loading suppliers:', err);
            toast.error('Failed to load suppliers');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadSuppliers();
    }, [loadSuppliers]);

    const generateSupplierCode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('suppliers')
                .select('supplier_code')
                .like('supplier_code', 'SUP-%')
                .order('supplier_code', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const lastCode = data[0].supplier_code;
                const lastNum = parseInt(lastCode.replace('SUP-', '')) || 0;
                return `SUP-${String(lastNum + 1).padStart(2, '0')}`;
            }
            return 'SUP-01';
        } catch {
            return 'SUP-01';
        }
    };

    const openAddModal = () => {
        setEditingSupplier(null);
        setFormData(defaultSupplier);
        setShowModal(true);
    };

    const openEditModal = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            supplier_name: supplier.supplier_name || '',
            address: supplier.address || '',
            city: supplier.city || '',
            phone: supplier.phone || '',
            phone2: supplier.phone2 || '',
            email: supplier.email || '',
            contact_person: supplier.contact_person || '',
            kra_pin: supplier.kra_pin || '',
            opening_balance: supplier.opening_balance || 0,
            balance_type: supplier.balance_type || 'Credit',
            payment_terms: supplier.payment_terms || '',
            notes: supplier.notes || '',
            is_kitchen: supplier.is_kitchen || false,
            active: supplier.active !== false,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.supplier_name.trim()) {
            toast.error('Supplier name required!');
            return;
        }

        setIsSaving(true);
        try {
            if (editingSupplier) {
                const { error } = await supabase
                    .from('suppliers')
                    .update({
                        ...formData,
                        current_balance: formData.opening_balance,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('supplier_id', editingSupplier.supplier_id);

                if (error) throw error;
                toast.success('Supplier updated! ✓');
            } else {
                const newCode = await generateSupplierCode();
                const { error } = await supabase
                    .from('suppliers')
                    .insert({
                        ...formData,
                        supplier_code: newCode,
                        current_balance: formData.opening_balance,
                    });

                if (error) throw error;
                toast.success(`Supplier ${newCode} created! ✓`);
            }

            setShowModal(false);
            loadSuppliers();
        } catch (err) {
            console.error('Error saving supplier:', err);
            toast.error('Failed to save supplier');
        }
        setIsSaving(false);
    };

    const deleteSupplier = async (supplier: Supplier) => {
        if (!confirm(`Delete "${supplier.supplier_name}"?`)) return;

        try {
            const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('supplier_id', supplier.supplier_id);

            if (error) throw error;
            toast.success('Supplier deleted');
            loadSuppliers();
        } catch (err) {
            console.error('Error deleting supplier:', err);
            toast.error('Failed to delete');
        }
    };

    const filteredSuppliers = suppliers.filter(s =>
        s.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.supplier_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.phone && s.phone.includes(searchQuery))
    );

    const totalBalance = suppliers.reduce((sum, s) => {
        const balance = s.current_balance || 0;
        return s.balance_type === 'Credit' ? sum + balance : sum - balance;
    }, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">🏢</span>
                        Suppliers
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Manage your suppliers and vendors • Code format: SUP-XX
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-2xl shadow-lg shadow-blue-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                >
                    <span className="text-xl">➕</span>
                    Add Supplier
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white text-2xl">
                            🏢
                        </div>
                        <div>
                            <p className="text-sm text-blue-600 font-medium">Total Suppliers</p>
                            <p className="text-2xl font-bold text-gray-800">{suppliers.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center text-white text-2xl">
                            ✅
                        </div>
                        <div>
                            <p className="text-sm text-green-600 font-medium">Active</p>
                            <p className="text-2xl font-bold text-gray-800">{suppliers.filter(s => s.active).length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center text-white text-2xl">
                            🍳
                        </div>
                        <div>
                            <p className="text-sm text-purple-600 font-medium">Kitchen</p>
                            <p className="text-2xl font-bold text-gray-800">{suppliers.filter(s => s.is_kitchen).length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center text-white text-2xl">
                            💰
                        </div>
                        <div>
                            <p className="text-sm text-orange-600 font-medium">Total Balance</p>
                            <p className="text-xl font-bold text-gray-800">Ksh {Math.abs(totalBalance).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="🔍 Search by name, code, or phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                    </div>
                    <button
                        onClick={loadSuppliers}
                        className="px-5 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 font-medium transition-all flex items-center gap-2"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Suppliers Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Code</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Supplier Name</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">Contact</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold hidden lg:table-cell">Address</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Balance</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Type</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-blue-400/30 border-t-blue-500 rounded-full animate-spin"></div>
                                            <span className="text-gray-500">Loading suppliers...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-5xl">🏢</span>
                                            <p className="text-gray-500">No suppliers found</p>
                                            <button
                                                onClick={openAddModal}
                                                className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                                            >
                                                Add First Supplier
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredSuppliers.map((supplier) => (
                                    <tr key={supplier.supplier_id} className="border-t border-gray-50 hover:bg-blue-50/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                                                {supplier.supplier_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div>
                                                <p className="font-semibold text-gray-800">{supplier.supplier_name}</p>
                                                {supplier.contact_person && (
                                                    <p className="text-xs text-gray-500">👤 {supplier.contact_person}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 hidden md:table-cell">
                                            <div className="text-sm">
                                                {supplier.phone && <p className="text-gray-700">📞 {supplier.phone}</p>}
                                                {supplier.email && <p className="text-gray-500 text-xs">✉️ {supplier.email}</p>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 hidden lg:table-cell text-gray-600 text-sm">
                                            {supplier.address || supplier.city || '-'}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <span className={`font-bold ${supplier.balance_type === 'Credit' ? 'text-red-600' : 'text-green-600'}`}>
                                                Ksh {(supplier.current_balance || 0).toLocaleString()}
                                            </span>
                                            <p className="text-xs text-gray-500">{supplier.balance_type}</p>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {supplier.is_kitchen ? (
                                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                                                    🍳 Kitchen
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                                    🏢 External
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(supplier)}
                                                    className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl transition-all hover:scale-110"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => deleteSupplier(supplier)}
                                                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all hover:scale-110"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingSupplier ? '✏️ Edit Supplier' : '➕ Add New Supplier'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            {editingSupplier && (
                                <p className="text-blue-100 text-sm mt-1">Code: {editingSupplier.supplier_code}</p>
                            )}
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🏢 Supplier Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.supplier_name}
                                        onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                        placeholder="e.g., ABC Distributors"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        👤 Contact Person
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.contact_person}
                                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                        placeholder="Contact name"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📞 Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="0712345678"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📱 Phone 2
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone2}
                                        onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                                        placeholder="Alternative phone"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        ✉️ Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="supplier@email.com"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📍 Address
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        placeholder="Street address"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🏙️ City
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        placeholder="City"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🔢 KRA PIN
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.kra_pin}
                                        onChange={(e) => setFormData({ ...formData, kra_pin: e.target.value })}
                                        placeholder="Tax PIN"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>
                            </div>

                            {/* Financial Info */}
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-200">
                                <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2">
                                    💰 Opening Balance
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Amount (Ksh)</label>
                                        <input
                                            type="number"
                                            value={formData.opening_balance}
                                            onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-green-500"
                                            min="0"
                                            step="0.01"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                                        <select
                                            value={formData.balance_type}
                                            onChange={(e) => setFormData({ ...formData, balance_type: e.target.value })}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-green-500 cursor-pointer"
                                        >
                                            <option value="Credit">Credit (We Owe Them)</option>
                                            <option value="Debit">Debit (They Owe Us)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Additional */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📅 Payment Terms
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.payment_terms}
                                        onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                                        placeholder="e.g., Net 30, COD"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500"
                                    />
                                </div>

                                <div className="flex items-center gap-6 pt-8">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_kitchen}
                                            onChange={(e) => setFormData({ ...formData, is_kitchen: e.target.checked })}
                                            className="w-5 h-5 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                                        />
                                        <span className="font-medium text-gray-700">🍳 Internal Kitchen</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.active}
                                            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                            className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="font-medium text-gray-700">Active</span>
                                    </label>
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📝 Notes
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Additional notes..."
                                    rows={2}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-blue-500 resize-none"
                                />
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-4 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-300/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingSupplier ? '💾' : '➕'}</span>
                                            {editingSupplier ? 'Update Supplier' : 'Create Supplier'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
