'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

interface PurchaseHistory {
    purchase_id: number;
    purchase_no: string;
    purchase_date: string;
    grand_total: number;
    payment_status: string;
    status: string;
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
    const [typeFilter, setTypeFilter] = useState('All');
    const [activeFilter, setActiveFilter] = useState('All');
    const [isSaving, setIsSaving] = useState(false);

    // Selected supplier detail panel
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [tableMissing, setTableMissing] = useState(false);

    const loadSuppliers = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('*')
                .order('supplier_id', { ascending: false });
            if (error) {
                if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
                    setTableMissing(true);
                }
                throw error;
            }
            setTableMissing(false);
            setSuppliers(data || []);
        } catch (err: any) {
            console.error('Error loading suppliers:', err);
            if (!err?.message?.includes('schema cache')) {
                toast.error(err?.message || 'Failed to load suppliers');
            }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

    const loadPurchaseHistory = async (supplierId: number) => {
        setLoadingHistory(true);
        setPurchaseHistory([]);
        try {
            const { data, error } = await supabase
                .from('purchases')
                .select('purchase_id, purchase_no, purchase_date, grand_total, payment_status, status')
                .eq('supplier_id', supplierId)
                .order('purchase_id', { ascending: false })
                .limit(10);
            if (!error) setPurchaseHistory(data || []);
        } catch { /* silent */ }
        setLoadingHistory(false);
    };

    const selectSupplier = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        loadPurchaseHistory(supplier.supplier_id);
    };

    const generateSupplierCode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('suppliers')
                .select('supplier_code')
                .like('supplier_code', 'SUP-%')
                .order('supplier_code', { ascending: false })
                .limit(1);
            if (data && data.length > 0) {
                const lastNum = parseInt(data[0].supplier_code.replace('SUP-', '')) || 0;
                return `SUP-${String(lastNum + 1).padStart(2, '0')}`;
            }
            return 'SUP-01';
        } catch { return 'SUP-01'; }
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
        if (!formData.supplier_name.trim()) { toast.error('Supplier name required!'); return; }
        setIsSaving(true);
        try {
            if (editingSupplier) {
                const { error } = await supabase
                    .from('suppliers')
                    .update({ ...formData, current_balance: formData.opening_balance, updated_at: new Date().toISOString() })
                    .eq('supplier_id', editingSupplier.supplier_id);
                if (error) throw error;
                toast.success('Supplier updated ✓');
                if (selectedSupplier?.supplier_id === editingSupplier.supplier_id) {
                    setSelectedSupplier({ ...selectedSupplier, ...formData } as Supplier);
                }
            } else {
                const newCode = await generateSupplierCode();
                const { error } = await supabase
                    .from('suppliers')
                    .insert({ ...formData, supplier_code: newCode, current_balance: formData.opening_balance });
                if (error) throw error;
                toast.success(`Supplier ${newCode} created ✓`);
            }
            setShowModal(false);
            loadSuppliers();
        } catch (err: any) {
            console.error('Error saving supplier:', err);
            toast.error(err?.message || 'Failed to save supplier');
        }
        setIsSaving(false);
    };

    const toggleActive = async (supplier: Supplier) => {
        try {
            const { error } = await supabase
                .from('suppliers')
                .update({ active: !supplier.active })
                .eq('supplier_id', supplier.supplier_id);
            if (error) throw error;
            toast.success(supplier.active ? 'Supplier deactivated' : 'Supplier activated');
            loadSuppliers();
        } catch { toast.error('Failed to update status'); }
    };

    const deleteSupplier = async (supplier: Supplier) => {
        if (!confirm(`Delete "${supplier.supplier_name}"? This cannot be undone.`)) return;
        try {
            const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('supplier_id', supplier.supplier_id);
            if (error) throw error;
            toast.success('Supplier deleted');
            if (selectedSupplier?.supplier_id === supplier.supplier_id) setSelectedSupplier(null);
            loadSuppliers();
        } catch { toast.error('Failed to delete'); }
    };

    const filtered = useMemo(() => suppliers.filter(s => {
        const q = searchQuery.toLowerCase();
        const matchSearch = !q || s.supplier_name.toLowerCase().includes(q) || s.supplier_code?.toLowerCase().includes(q) || s.phone?.includes(q) || s.contact_person?.toLowerCase().includes(q);
        const matchType = typeFilter === 'All' || (typeFilter === 'Kitchen' ? s.is_kitchen : !s.is_kitchen);
        const matchActive = activeFilter === 'All' || (activeFilter === 'Active' ? s.active : !s.active);
        return matchSearch && matchType && matchActive;
    }), [suppliers, searchQuery, typeFilter, activeFilter]);

    const stats = useMemo(() => ({
        total: suppliers.length,
        active: suppliers.filter(s => s.active).length,
        kitchen: suppliers.filter(s => s.is_kitchen).length,
        external: suppliers.filter(s => !s.is_kitchen).length,
        creditBalance: suppliers.filter(s => s.balance_type === 'Credit').reduce((sum, s) => sum + (s.current_balance || 0), 0),
    }), [suppliers]);

    const f = (val: string, field: string) => setFormData({ ...formData, [field]: val });

    return (
        <div className="flex gap-4 h-full" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* Main Content */}
            <div className="flex-1 space-y-5 transition-all">

                {/* ── HERO BANNER (MATCHING DASHBOARD STYLE) ── */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-5 text-white shadow-xl">
                    <div className="absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />
                    <div className="absolute right-32 -top-10 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />

                    <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white text-2xl shadow-md">
                                🏢
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Suppliers & Vendors</h1>
                                <p className="text-purple-100 text-sm font-medium mt-0.5">Supplier directory, procurement accounts & payable balances</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            <button
                                onClick={openAddModal}
                                className="px-5 py-2.5 bg-white hover:bg-purple-50 text-purple-700 font-extrabold rounded-xl text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <span>➕</span> Add Supplier
                            </button>
                            <button
                                onClick={loadSuppliers}
                                title="Refresh suppliers"
                                className="p-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                            >
                                🔄
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── ACTION REQUIRED / TABLE MISSING BANNER ── */}
                {tableMissing && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 p-4 text-white shadow-lg">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🚨</span>
                                <div>
                                    <h3 className="font-extrabold text-base leading-tight">Action Required</h3>
                                    <p className="text-white/90 text-sm mt-0.5 font-medium">
                                        Database table <code className="bg-black/20 px-2 py-0.5 rounded font-mono text-xs">suppliers</code> needs to be set up in Supabase.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <a
                                    href="https://supabase.com/dashboard/project/ywsstybsffcipaqtkjjl/sql/new"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
                                >
                                    Open Supabase SQL ↗
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── VIBRANT GLASSMORPHIC KPI CARDS (DASHBOARD STYLE) ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                    {/* Card 1: Total Suppliers */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>🏢</span> Total Suppliers
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.total}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Registered vendors
                        </span>
                    </div>

                    {/* Card 2: Active */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-green-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>✅</span> Active Suppliers
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.active}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Ready for ordering
                        </span>
                    </div>

                    {/* Card 3: Kitchen / Internal */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>🍳</span> Kitchen / Internal
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.kitchen}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Internal production
                        </span>
                    </div>

                    {/* Card 4: External */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>🚚</span> External Vendors
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.external}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Third party supplies
                        </span>
                    </div>

                    {/* Card 5: Total Balance */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>💰</span> Payable Balance
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-white mt-1.5 truncate">
                            Ksh {stats.creditBalance >= 1000 ? `${(stats.creditBalance / 1000).toFixed(1)}K` : stats.creditBalance.toLocaleString()}
                        </h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Due to suppliers
                        </span>
                    </div>
                </div>

                {/* ── FILTERS ── */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">🔍 Search</label>
                            <input
                                type="text"
                                placeholder="Search by name, code, phone, or contact person..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-purple-500 transition-all font-medium"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">🏷️ Type</label>
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-purple-500 transition-all font-medium cursor-pointer"
                            >
                                <option value="All">All Types</option>
                                <option value="Kitchen">Kitchen / Internal</option>
                                <option value="External">External Vendors</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">📊 Status</label>
                            <select
                                value={activeFilter}
                                onChange={(e) => setActiveFilter(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-purple-500 transition-all font-medium cursor-pointer"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Active">Active Only</option>
                                <option value="Inactive">Inactive Only</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* ── PREMIUM SUPPLIERS TABLE ── */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {isLoading ? (
                        <div className="p-16 flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                            <p className="text-sm font-semibold text-gray-500">Loading suppliers...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-5xl block mb-3 opacity-60">🏢</span>
                            <p className="text-base font-bold text-gray-800">No suppliers found</p>
                            <p className="text-sm text-gray-500 mt-1">Register your first supplier or adjust your search filter</p>
                            <button
                                onClick={openAddModal}
                                className="mt-4 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
                            >
                                ➕ Add Supplier
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gradient-to-r from-slate-50 to-purple-50/50 border-b border-gray-200 text-gray-700 text-xs font-extrabold uppercase tracking-wider">
                                        <th className="py-3.5 px-4">Code</th>
                                        <th className="py-3.5 px-4">Supplier Name</th>
                                        <th className="py-3.5 px-4 hidden md:table-cell">Contact</th>
                                        <th className="py-3.5 px-4 hidden lg:table-cell">Location</th>
                                        <th className="py-3.5 px-4 text-right">Balance</th>
                                        <th className="py-3.5 px-4 text-center">Type</th>
                                        <th className="py-3.5 px-4 text-center">Status</th>
                                        <th className="py-3.5 px-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                    {filtered.map((supplier) => {
                                        const isSelected = selectedSupplier?.supplier_id === supplier.supplier_id;
                                        return (
                                            <tr
                                                key={supplier.supplier_id}
                                                onClick={() => selectSupplier(supplier)}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-purple-50/80 border-l-4 border-purple-600'
                                                        : 'hover:bg-purple-50/30'
                                                }`}
                                            >
                                                <td className="py-3.5 px-4">
                                                    <span className="font-mono text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg text-xs font-extrabold">
                                                        {supplier.supplier_code}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-sm">{supplier.supplier_name}</p>
                                                        {supplier.contact_person && (
                                                            <p className="text-xs text-gray-500 font-medium">👤 {supplier.contact_person}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 hidden md:table-cell">
                                                    <div className="text-sm text-gray-800 font-medium">
                                                        {supplier.phone && <p>{supplier.phone}</p>}
                                                        {supplier.email && <p className="text-xs text-gray-400 truncate max-w-[150px]">{supplier.email}</p>}
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 hidden lg:table-cell text-gray-600 text-sm">
                                                    {[supplier.city, supplier.address].filter(Boolean).join(', ') || <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="py-3.5 px-4 text-right font-mono">
                                                    <span className={`font-black text-base ${supplier.balance_type === 'Credit' ? 'text-red-600' : 'text-green-600'}`}>
                                                        Ksh {(supplier.current_balance || 0).toLocaleString()}
                                                    </span>
                                                    <p className="text-xs text-gray-400 font-medium">{supplier.balance_type || 'Credit'}</p>
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                                        supplier.is_kitchen
                                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                                                    }`}>
                                                        {supplier.is_kitchen ? '🍳 Kitchen' : '🚚 External'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => toggleActive(supplier)}
                                                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-all ${
                                                            supplier.active
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                                                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                                                        }`}
                                                    >
                                                        {supplier.active ? 'Active' : 'Inactive'}
                                                    </button>
                                                </td>
                                                <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => selectSupplier(supplier)}
                                                            title="View Details"
                                                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm transition-colors"
                                                        >
                                                            👁️
                                                        </button>
                                                        <button
                                                            onClick={() => openEditModal(supplier)}
                                                            title="Edit"
                                                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm transition-colors"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => deleteSupplier(supplier)}
                                                            title="Delete"
                                                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm transition-colors"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="px-5 py-3 border-t border-gray-100 text-sm font-semibold text-gray-500 bg-gray-50/50">
                                {filtered.length} suppliers listed
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── SLIDE-IN DETAIL PANEL ── */}
            {selectedSupplier && (
                <div className="w-[360px] flex-shrink-0 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-100px)] sticky top-4">
                    {/* Header */}
                    <div className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
                        <div>
                            <span className="font-mono text-xs font-bold text-purple-200">{selectedSupplier.supplier_code}</span>
                            <h2 className="text-base font-extrabold text-white leading-tight mt-0.5 truncate max-w-[240px]">
                                {selectedSupplier.supplier_name}
                            </h2>
                        </div>
                        <button
                            onClick={() => setSelectedSupplier(null)}
                            className="p-1.5 hover:bg-white/20 rounded-xl text-white text-sm"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                        {/* Contact Information */}
                        <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">Contact Details</span>
                            {selectedSupplier.contact_person && (
                                <p className="text-gray-800 font-bold">👤 {selectedSupplier.contact_person}</p>
                            )}
                            {selectedSupplier.phone && (
                                <p className="text-gray-700 font-medium">📞 <a href={`tel:${selectedSupplier.phone}`} className="text-blue-600 hover:underline">{selectedSupplier.phone}</a></p>
                            )}
                            {selectedSupplier.email && (
                                <p className="text-gray-600 truncate">✉️ <a href={`mailto:${selectedSupplier.email}`} className="text-blue-600 hover:underline">{selectedSupplier.email}</a></p>
                            )}
                            {(selectedSupplier.city || selectedSupplier.address) && (
                                <p className="text-gray-600">📍 {[selectedSupplier.address, selectedSupplier.city].filter(Boolean).join(', ')}</p>
                            )}
                        </div>

                        {/* Balance Details */}
                        <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Payable Balance:</span>
                                <span className={`font-mono text-xl font-black ${selectedSupplier.balance_type === 'Credit' ? 'text-red-600' : 'text-green-600'}`}>
                                    Ksh {(selectedSupplier.current_balance || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500">
                                <span>Payment Terms:</span>
                                <span className="text-gray-800 font-bold">{selectedSupplier.payment_terms || 'Standard Terms'}</span>
                            </div>
                            {selectedSupplier.kra_pin && (
                                <div className="flex justify-between items-center text-xs text-gray-500">
                                    <span>KRA Tax PIN:</span>
                                    <span className="font-mono font-bold text-gray-800">{selectedSupplier.kra_pin}</span>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        {selectedSupplier.notes && (
                            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                                <span className="text-xs font-bold text-amber-800 uppercase tracking-wide block mb-1">Notes</span>
                                <p className="text-xs text-gray-700 leading-relaxed">{selectedSupplier.notes}</p>
                            </div>
                        )}

                        {/* Recent Purchases */}
                        <div className="space-y-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                                Recent Purchases ({purchaseHistory.length})
                            </span>
                            {loadingHistory ? (
                                <div className="p-4 text-center text-gray-400">Loading purchase history...</div>
                            ) : purchaseHistory.length === 0 ? (
                                <div className="p-3 text-center text-gray-400 bg-gray-50 rounded-xl">No purchases recorded yet</div>
                            ) : (
                                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                                    {purchaseHistory.map(ph => (
                                        <div key={ph.purchase_id} className="p-2.5 flex items-center justify-between bg-white text-xs">
                                            <div>
                                                <p className="font-mono font-bold text-gray-900">{ph.purchase_no}</p>
                                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                    {new Date(ph.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono font-black text-gray-900 text-sm">Ksh {(ph.grand_total || 0).toLocaleString()}</p>
                                                <span className={`text-xs font-bold ${ph.payment_status === 'Paid' ? 'text-teal-600' : 'text-red-500'}`}>
                                                    {ph.payment_status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                        <button
                            onClick={() => openEditModal(selectedSupplier)}
                            className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white rounded-xl text-sm font-bold shadow-md transition-all"
                        >
                            Edit Profile
                        </button>
                    </div>
                </div>
            )}

            {/* ── ADD/EDIT MODAL ── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between sticky top-0 z-10">
                            <div>
                                <h2 className="text-lg font-black text-white">
                                    {editingSupplier ? `Edit Supplier (${editingSupplier.supplier_code})` : 'Register New Supplier'}
                                </h2>
                                <p className="text-xs text-purple-100 mt-0.5">Fill in the supplier's procurement & contact details</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-white/20 rounded-xl text-white">✕</button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="sm:col-span-2">
                                    <label className="block text-gray-700 font-bold mb-1">Supplier / Vendor Name *</label>
                                    <input
                                        type="text"
                                        value={formData.supplier_name}
                                        onChange={(e) => f(e.target.value, 'supplier_name')}
                                        placeholder="e.g. Fresh Valley Farms Ltd"
                                        required
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold mb-1">Contact Person</label>
                                    <input
                                        type="text"
                                        value={formData.contact_person}
                                        onChange={(e) => f(e.target.value, 'contact_person')}
                                        placeholder="Name"
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold mb-1">Primary Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => f(e.target.value, 'phone')}
                                        placeholder="07..."
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold mb-1">Alternative Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone2}
                                        onChange={(e) => f(e.target.value, 'phone2')}
                                        placeholder="07..."
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => f(e.target.value, 'email')}
                                        placeholder="orders@supplier.co.ke"
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold mb-1">City / Town</label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => f(e.target.value, 'city')}
                                        placeholder="e.g. Nairobi"
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold mb-1">KRA PIN</label>
                                    <input
                                        type="text"
                                        value={formData.kra_pin}
                                        onChange={(e) => f(e.target.value, 'kra_pin')}
                                        placeholder="P051..."
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-gray-700 font-bold mb-1">Physical Address</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => f(e.target.value, 'address')}
                                        placeholder="Building, Road, Area"
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-gray-900 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Financial Settings */}
                            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-gray-700 font-bold text-xs mb-1">Opening Balance (Ksh)</label>
                                    <input
                                        type="number"
                                        value={formData.opening_balance}
                                        onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:outline-none focus:border-purple-500"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold text-xs mb-1">Balance Type</label>
                                    <select
                                        value={formData.balance_type}
                                        onChange={(e) => f(e.target.value, 'balance_type')}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="Credit">Credit (We Owe)</option>
                                        <option value="Debit">Debit (They Owe)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-700 font-bold text-xs mb-1">Payment Terms</label>
                                    <input
                                        type="text"
                                        value={formData.payment_terms}
                                        onChange={(e) => f(e.target.value, 'payment_terms')}
                                        placeholder="e.g. Net 30, COD"
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                            </div>

                            {/* Kitchen & Active toggles */}
                            <div className="flex items-center gap-6 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_kitchen}
                                        onChange={(e) => setFormData({ ...formData, is_kitchen: e.target.checked })}
                                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-gray-800 font-bold text-sm">🍳 Internal Kitchen</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-gray-800 font-bold text-sm">Active Vendor</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-gray-700 font-bold mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => f(e.target.value, 'notes')}
                                    rows={2}
                                    placeholder="Delivery notes, terms..."
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-900 resize-none font-medium"
                                />
                            </div>

                            <div className="flex gap-3 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white rounded-xl font-black shadow-lg transition-all disabled:opacity-50 text-sm"
                                >
                                    {isSaving ? 'Saving...' : (editingSupplier ? 'Update Supplier' : 'Register Supplier')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
