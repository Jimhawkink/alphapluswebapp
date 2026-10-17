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
            <div className="flex-1 space-y-4 transition-all">

                {/* ── COMPACT GLASSMORPHIIC HEADER ── */}
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/10 via-violet-500/10 to-indigo-500/10 border border-purple-200/50 flex items-center justify-center text-purple-600 text-lg shadow-xs">
                                🏢
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Suppliers & Vendors</h1>
                                <p className="text-xs text-slate-500">Vendor directory, contact profiles & payable balances</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadSuppliers}
                                title="Refresh"
                                className="p-2 bg-white/80 hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs shadow-xs transition-all"
                            >
                                🔄
                            </button>
                            <button
                                onClick={openAddModal}
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                            >
                                <span>➕</span> Add Supplier
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── TABLE SETUP NOTICE (IF TABLE NOT YET CREATED IN SUPABASE) ── */}
                {tableMissing && (
                    <div className="bg-amber-500/10 backdrop-blur-md border border-amber-300/60 rounded-2xl p-3.5 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <span className="text-xl">⚠️</span>
                                <div>
                                    <h3 className="font-semibold text-slate-800 text-xs">Supabase Table Setup Required</h3>
                                    <p className="text-[11px] text-slate-600">
                                        The <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-amber-800 border border-amber-200 text-[10px]">suppliers</code> table needs to be created in your Supabase database.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <a
                                    href="https://supabase.com/dashboard/project/ywsstybsffcipaqtkjjl/sql/new"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs transition-all shadow-xs"
                                >
                                    Open SQL Editor ↗
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── SLIM STATS CARDS (FAINTED COLORS & GLASSMORPHISM) ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {[
                        { label: 'Total Suppliers', value: stats.total, badge: 'total', bg: 'bg-purple-500/5', border: 'border-purple-200/50', text: 'text-purple-700', icon: '🏢' },
                        { label: 'Active Vendors', value: stats.active, badge: 'enabled', bg: 'bg-emerald-500/5', border: 'border-emerald-200/50', text: 'text-emerald-700', icon: '✅' },
                        { label: 'Kitchen / Internal', value: stats.kitchen, badge: 'internal', bg: 'bg-amber-500/5', border: 'border-amber-200/50', text: 'text-amber-700', icon: '🍳' },
                        { label: 'External Vendors', value: stats.external, badge: 'partners', bg: 'bg-blue-500/5', border: 'border-blue-200/50', text: 'text-blue-700', icon: '🚚' },
                        { label: 'Total Payable', value: `Ksh ${stats.creditBalance.toLocaleString()}`, badge: 'balance', bg: 'bg-rose-500/5', border: 'border-rose-200/50', text: 'text-rose-700', icon: '💰' },
                    ].map((s, i) => (
                        <div
                            key={i}
                            className={`p-3 rounded-xl bg-white/70 backdrop-blur-md border ${s.border} shadow-xs hover:border-slate-300 transition-all`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-base">{s.icon}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${s.bg} ${s.text}`}>
                                    {s.badge}
                                </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-500 mt-2 truncate">{s.label}</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* ── TRANSLUCENT FILTERS BAR ── */}
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-3.5 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2">
                            <input
                                type="text"
                                placeholder="🔍 Search by name, code, phone, or contact person..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
                            />
                        </div>
                        <div>
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
                            >
                                <option value="All">All Types</option>
                                <option value="Kitchen">Kitchen / Internal</option>
                                <option value="External">External Vendors</option>
                            </select>
                        </div>
                        <div>
                            <select
                                value={activeFilter}
                                onChange={(e) => setActiveFilter(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Active">Active Only</option>
                                <option value="Inactive">Inactive Only</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* ── GLASSMORPHIC DATA GRID ── */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-purple-600 rounded-full animate-spin" />
                            <p className="text-xs text-slate-500">Loading suppliers...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center">
                            <span className="text-4xl block mb-2 opacity-60">🏢</span>
                            <p className="text-sm font-semibold text-slate-700">No suppliers found</p>
                            <p className="text-xs text-slate-400 mt-0.5">Try searching with a different term or register a new vendor</p>
                            <button
                                onClick={openAddModal}
                                className="mt-3 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs"
                            >
                                ➕ Add Supplier
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/70 text-slate-600 text-[11px] font-semibold uppercase tracking-wider">
                                        <th className="py-2.5 px-3.5">Code</th>
                                        <th className="py-2.5 px-3.5">Supplier Name</th>
                                        <th className="py-2.5 px-3.5 hidden md:table-cell">Contact</th>
                                        <th className="py-2.5 px-3.5 hidden lg:table-cell">City / Address</th>
                                        <th className="py-2.5 px-3.5 text-right">Balance</th>
                                        <th className="py-2.5 px-3.5 text-center">Type</th>
                                        <th className="py-2.5 px-3.5 text-center">Status</th>
                                        <th className="py-2.5 px-3.5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                    {filtered.map((supplier) => {
                                        const isSelected = selectedSupplier?.supplier_id === supplier.supplier_id;
                                        return (
                                            <tr
                                                key={supplier.supplier_id}
                                                onClick={() => selectSupplier(supplier)}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-purple-50/50 border-l-2 border-purple-500'
                                                        : 'hover:bg-slate-50/60'
                                                }`}
                                            >
                                                <td className="py-2.5 px-3.5">
                                                    <span className="font-mono text-purple-700 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-200/50 text-[11px]">
                                                        {supplier.supplier_code}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3.5">
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-xs">{supplier.supplier_name}</p>
                                                        {supplier.contact_person && (
                                                            <p className="text-[10px] text-slate-400">👤 {supplier.contact_person}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3.5 hidden md:table-cell">
                                                    <div className="text-[11px] text-slate-600">
                                                        {supplier.phone && <p>{supplier.phone}</p>}
                                                        {supplier.email && <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{supplier.email}</p>}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3.5 hidden lg:table-cell text-slate-600 text-[11px]">
                                                    {[supplier.city, supplier.address].filter(Boolean).join(', ') || <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right font-mono">
                                                    <span className={`font-semibold ${supplier.balance_type === 'Credit' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        Ksh {(supplier.current_balance || 0).toLocaleString()}
                                                    </span>
                                                    <p className="text-[10px] text-slate-400">{supplier.balance_type || 'Credit'}</p>
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                        supplier.is_kitchen
                                                            ? 'bg-amber-500/10 text-amber-700 border-amber-300/40'
                                                            : 'bg-blue-500/10 text-blue-700 border-blue-300/40'
                                                    }`}>
                                                        {supplier.is_kitchen ? 'Kitchen' : 'External'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => toggleActive(supplier)}
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                                                            supplier.active
                                                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300/40 hover:bg-emerald-500/20'
                                                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                                        }`}
                                                    >
                                                        {supplier.active ? 'Active' : 'Inactive'}
                                                    </button>
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => selectSupplier(supplier)}
                                                            title="View details"
                                                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                                                        >
                                                            👁️
                                                        </button>
                                                        <button
                                                            onClick={() => openEditModal(supplier)}
                                                            title="Edit"
                                                            className="p-1 hover:bg-purple-50 rounded-lg text-purple-600 transition-colors"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => deleteSupplier(supplier)}
                                                            title="Delete"
                                                            className="p-1 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors"
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
                            <div className="px-3.5 py-2.5 border-t border-slate-100 text-xs text-slate-500 bg-slate-50/40">
                                {filtered.length} suppliers listed
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── REFINED SLIDE-IN DETAIL PANEL ── */}
            {selectedSupplier && (
                <div className="w-[330px] flex-shrink-0 bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-2xl shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-100px)] sticky top-4">
                    {/* Header */}
                    <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                        <div>
                            <span className="font-mono text-xs font-bold text-purple-700">{selectedSupplier.supplier_code}</span>
                            <h2 className="text-sm font-bold text-slate-800 leading-tight mt-0.5 truncate max-w-[220px]">
                                {selectedSupplier.supplier_name}
                            </h2>
                        </div>
                        <button
                            onClick={() => setSelectedSupplier(null)}
                            className="p-1 hover:bg-slate-200/60 rounded-lg text-slate-500 text-xs transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
                        {/* Contact Card */}
                        <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/50 space-y-1.5">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Contact Information</span>
                            {selectedSupplier.contact_person && (
                                <p className="text-slate-700 font-medium">👤 {selectedSupplier.contact_person}</p>
                            )}
                            {selectedSupplier.phone && (
                                <p className="text-slate-600">📞 <a href={`tel:${selectedSupplier.phone}`} className="text-blue-600 hover:underline">{selectedSupplier.phone}</a></p>
                            )}
                            {selectedSupplier.email && (
                                <p className="text-slate-600 truncate">✉️ <a href={`mailto:${selectedSupplier.email}`} className="text-blue-600 hover:underline">{selectedSupplier.email}</a></p>
                            )}
                            {(selectedSupplier.city || selectedSupplier.address) && (
                                <p className="text-slate-500">📍 {[selectedSupplier.address, selectedSupplier.city].filter(Boolean).join(', ')}</p>
                            )}
                        </div>

                        {/* Balance & Terms Card */}
                        <div className="p-2.5 rounded-xl bg-purple-500/5 border border-purple-200/40 space-y-1.5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Current Balance:</span>
                                <span className={`font-mono font-bold ${selectedSupplier.balance_type === 'Credit' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    Ksh {(selectedSupplier.current_balance || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-slate-500">
                                <span>Terms:</span>
                                <span className="text-slate-700 font-medium">{selectedSupplier.payment_terms || 'Standard'}</span>
                            </div>
                            {selectedSupplier.kra_pin && (
                                <div className="flex justify-between items-center text-[11px] text-slate-500">
                                    <span>KRA PIN:</span>
                                    <span className="font-mono text-slate-700">{selectedSupplier.kra_pin}</span>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        {selectedSupplier.notes && (
                            <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-200/40">
                                <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block mb-1">Notes</span>
                                <p className="text-[11px] text-slate-600 leading-relaxed">{selectedSupplier.notes}</p>
                            </div>
                        )}

                        {/* Recent Purchases */}
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                                Recent Purchases ({purchaseHistory.length})
                            </span>
                            {loadingHistory ? (
                                <div className="p-3 text-center text-slate-400">Loading history...</div>
                            ) : purchaseHistory.length === 0 ? (
                                <div className="p-2.5 text-center text-slate-400 bg-slate-50/50 rounded-xl">No purchases recorded</div>
                            ) : (
                                <div className="border border-slate-200/60 rounded-xl overflow-hidden divide-y divide-slate-100">
                                    {purchaseHistory.map(ph => (
                                        <div key={ph.purchase_id} className="p-2 flex items-center justify-between bg-white text-[11px]">
                                            <div>
                                                <p className="font-mono font-semibold text-slate-800">{ph.purchase_no}</p>
                                                <p className="text-[10px] text-slate-400">
                                                    {new Date(ph.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono font-bold text-slate-800">Ksh {(ph.grand_total || 0).toLocaleString()}</p>
                                                <span className={`text-[10px] ${ph.payment_status === 'Paid' ? 'text-teal-600' : 'text-rose-500'}`}>
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
                    <div className="p-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
                        <button
                            onClick={() => openEditModal(selectedSupplier)}
                            className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
                        >
                            Edit Profile
                        </button>
                    </div>
                </div>
            )}

            {/* ── REFINED COMPACT ADD/EDIT MODAL ── */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white/95 backdrop-blur-2xl rounded-2xl border border-slate-200/80 shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
                            <h2 className="text-sm font-bold text-slate-800">
                                {editingSupplier ? `Edit Supplier (${editingSupplier.supplier_code})` : 'New Supplier Registration'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 text-xs">✕</button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                    <label className="block text-slate-600 font-semibold mb-1">Supplier / Vendor Name *</label>
                                    <input
                                        type="text"
                                        value={formData.supplier_name}
                                        onChange={(e) => f(e.target.value, 'supplier_name')}
                                        placeholder="e.g. Fresh Valley Farms"
                                        required
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">Contact Person</label>
                                    <input
                                        type="text"
                                        value={formData.contact_person}
                                        onChange={(e) => f(e.target.value, 'contact_person')}
                                        placeholder="Name"
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">Primary Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => f(e.target.value, 'phone')}
                                        placeholder="07..."
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">Alternative Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone2}
                                        onChange={(e) => f(e.target.value, 'phone2')}
                                        placeholder="07..."
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => f(e.target.value, 'email')}
                                        placeholder="vendor@mail.com"
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">City / Town</label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => f(e.target.value, 'city')}
                                        placeholder="e.g. Nairobi"
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">KRA PIN</label>
                                    <input
                                        type="text"
                                        value={formData.kra_pin}
                                        onChange={(e) => f(e.target.value, 'kra_pin')}
                                        placeholder="PIN"
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-slate-600 font-semibold mb-1">Physical Address</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => f(e.target.value, 'address')}
                                        placeholder="Street / Building / Area"
                                        className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                            </div>

                            {/* Financial */}
                            <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="block text-slate-600 font-medium mb-1">Opening Balance</label>
                                    <input
                                        type="number"
                                        value={formData.opening_balance}
                                        onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-purple-500"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-medium mb-1">Balance Type</label>
                                    <select
                                        value={formData.balance_type}
                                        onChange={(e) => f(e.target.value, 'balance_type')}
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="Credit">Credit (We Owe)</option>
                                        <option value="Debit">Debit (They Owe)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-medium mb-1">Payment Terms</label>
                                    <input
                                        type="text"
                                        value={formData.payment_terms}
                                        onChange={(e) => f(e.target.value, 'payment_terms')}
                                        placeholder="e.g. Net 30, COD"
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                            </div>

                            {/* Type toggles & notes */}
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_kitchen}
                                        onChange={(e) => setFormData({ ...formData, is_kitchen: e.target.checked })}
                                        className="rounded text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-slate-700 font-medium">Internal Kitchen</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        className="rounded text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-slate-700 font-medium">Active Status</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => f(e.target.value, 'notes')}
                                    rows={2}
                                    placeholder="Internal vendor notes..."
                                    className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white text-slate-800 resize-none"
                                />
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-xs transition-all disabled:opacity-50"
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
