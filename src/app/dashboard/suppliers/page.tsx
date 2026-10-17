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
        } catch (err) {
            console.error('Error saving supplier:', err);
            toast.error('Failed to save supplier');
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
        <div className="flex gap-0 h-full" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* Main Content */}
            <div className={`flex-1 space-y-5 transition-all ${selectedSupplier ? 'pr-2' : ''}`}>

                {/* ── HEADER ── */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-700 p-6 shadow-2xl">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                    <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-white flex items-center gap-3">
                                <span className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/30 shadow-lg">🏢</span>
                                Suppliers & Vendors
                            </h1>
                            <p className="text-purple-100 mt-1 font-medium">Manage suppliers • Track balances • Purchase history</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button onClick={loadSuppliers} className="flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl font-semibold hover:bg-white/30 border border-white/30 transition-all">
                                🔄
                            </button>
                            <button onClick={openAddModal} className="flex items-center gap-2 px-5 py-2.5 bg-white text-purple-700 rounded-xl font-bold hover:shadow-xl transition-all hover:scale-105 active:scale-95 shadow-lg">
                                ➕ Add Supplier
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── STATS ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                        { label: 'Total Suppliers', value: stats.total, icon: '🏢', from: 'from-purple-500', to: 'to-indigo-600' },
                        { label: 'Active', value: stats.active, icon: '✅', from: 'from-emerald-500', to: 'to-green-600' },
                        { label: 'Kitchen/Internal', value: stats.kitchen, icon: '🍳', from: 'from-orange-500', to: 'to-amber-500' },
                        { label: 'External', value: stats.external, icon: '🚚', from: 'from-blue-500', to: 'to-cyan-600' },
                        { label: 'Total Balance', value: `Ksh ${stats.creditBalance.toLocaleString()}`, icon: '💰', from: 'from-red-500', to: 'to-rose-600' },
                    ].map((s, i) => (
                        <div key={i} className={`bg-gradient-to-br ${s.from} ${s.to} rounded-2xl p-4 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all`}>
                            <span className="text-2xl">{s.icon}</span>
                            <p className="text-xs font-semibold opacity-80 uppercase tracking-wide mt-2">{s.label}</p>
                            <p className="text-xl font-black mt-0.5">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* ── FILTERS ── */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-gray-100 shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">🔍 Search</label>
                            <input type="text" placeholder="Name, code, phone, contact..." value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">🏷️ Type</label>
                            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition-all cursor-pointer">
                                <option value="All">All Types</option>
                                <option value="Kitchen">Kitchen / Internal</option>
                                <option value="External">External</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">📊 Status</label>
                            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 transition-all cursor-pointer">
                                <option value="All">All Status</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                    {(searchQuery || typeFilter !== 'All' || activeFilter !== 'All') && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                            <span className="text-xs text-gray-500 font-medium">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                            <button onClick={() => { setSearchQuery(''); setTypeFilter('All'); setActiveFilter('All'); }}
                                className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-all ml-auto">
                                ✕ Clear Filters
                            </button>
                        </div>
                    )}
                </div>

                {/* ── DATA GRID ── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
                    {isLoading ? (
                        <div className="p-16 flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                            <p className="text-gray-500 font-medium">Loading suppliers...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-6xl block mb-4">🏢</span>
                            <p className="text-gray-500 text-lg font-medium">No suppliers found</p>
                            <button onClick={openAddModal} className="mt-4 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">
                                ➕ Add First Supplier
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white">
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide">Code</th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide">Supplier</th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide hidden md:table-cell">Contact</th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide hidden lg:table-cell">Location</th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide hidden lg:table-cell">KRA PIN</th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide hidden md:table-cell">Terms</th>
                                        <th className="text-right py-4 px-4 text-xs font-bold uppercase tracking-wide">Balance</th>
                                        <th className="text-center py-4 px-4 text-xs font-bold uppercase tracking-wide">Type</th>
                                        <th className="text-center py-4 px-4 text-xs font-bold uppercase tracking-wide">Status</th>
                                        <th className="text-center py-4 px-4 text-xs font-bold uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((supplier, idx) => {
                                        const isSelected = selectedSupplier?.supplier_id === supplier.supplier_id;
                                        return (
                                            <tr key={supplier.supplier_id}
                                                onClick={() => selectSupplier(supplier)}
                                                className={`border-t border-gray-50 cursor-pointer transition-all duration-150 ${isSelected ? 'bg-purple-50 border-l-4 border-l-purple-500' : idx % 2 === 0 ? 'bg-white hover:bg-purple-50/30' : 'bg-gray-50/40 hover:bg-purple-50/30'}`}>
                                                <td className="py-3.5 px-4">
                                                    <span className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-bold text-xs shadow-sm">
                                                        {supplier.supplier_code}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-black text-sm shadow-sm flex-shrink-0">
                                                            {(supplier.supplier_name || 'U')[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800 text-sm">{supplier.supplier_name}</p>
                                                            {supplier.contact_person && <p className="text-xs text-gray-400">👤 {supplier.contact_person}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 hidden md:table-cell">
                                                    <div className="text-sm space-y-0.5">
                                                        {supplier.phone && <p className="text-gray-700 font-medium">📞 {supplier.phone}</p>}
                                                        {supplier.phone2 && <p className="text-gray-500 text-xs">📱 {supplier.phone2}</p>}
                                                        {supplier.email && <p className="text-gray-400 text-xs truncate max-w-[140px]">✉️ {supplier.email}</p>}
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 hidden lg:table-cell text-sm text-gray-600">
                                                    {[supplier.address, supplier.city].filter(Boolean).join(', ') || <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="py-3.5 px-4 hidden lg:table-cell">
                                                    {supplier.kra_pin ? (
                                                        <span className="font-mono text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200">{supplier.kra_pin}</span>
                                                    ) : <span className="text-gray-300 text-sm">—</span>}
                                                </td>
                                                <td className="py-3.5 px-4 hidden md:table-cell">
                                                    {supplier.payment_terms ? (
                                                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">{supplier.payment_terms}</span>
                                                    ) : <span className="text-gray-300 text-sm">—</span>}
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <span className={`font-black text-sm ${supplier.balance_type === 'Credit' ? 'text-red-600' : 'text-green-600'}`}>
                                                        Ksh {(supplier.current_balance || 0).toLocaleString()}
                                                    </span>
                                                    <p className="text-xs text-gray-400">{supplier.balance_type || 'Credit'}</p>
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    {supplier.is_kitchen ? (
                                                        <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200">🍳 Kitchen</span>
                                                    ) : (
                                                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">🚚 External</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <button onClick={(e) => { e.stopPropagation(); toggleActive(supplier); }}
                                                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${supplier.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                                                        {supplier.active ? '✅ Active' : '⏸ Inactive'}
                                                    </button>
                                                </td>
                                                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => selectSupplier(supplier)} title="View"
                                                            className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition-all hover:scale-110 text-sm">👁️</button>
                                                        <button onClick={() => openEditModal(supplier)} title="Edit"
                                                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all hover:scale-110 text-sm">✏️</button>
                                                        <button onClick={() => deleteSupplier(supplier)} title="Delete"
                                                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all hover:scale-110 text-sm">🗑️</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100 text-sm text-gray-500 font-medium">
                                {filtered.length} supplier{filtered.length !== 1 ? 's' : ''} shown
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── SUPPLIER DETAIL PANEL ── */}
            {selectedSupplier && (
                <div className="w-[360px] flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-120px)] sticky top-0">
                    {/* Panel header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-5 py-4 text-white flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-purple-100 text-xs font-semibold uppercase tracking-wide">{selectedSupplier.supplier_code}</p>
                                <h2 className="text-lg font-black leading-tight mt-0.5">{selectedSupplier.supplier_name}</h2>
                            </div>
                            <button onClick={() => setSelectedSupplier(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all">✕</button>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedSupplier.active ? 'bg-emerald-400/30 text-emerald-100' : 'bg-gray-500/30 text-gray-200'}`}>
                                {selectedSupplier.active ? '✅ Active' : '⏸ Inactive'}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedSupplier.is_kitchen ? 'bg-orange-400/30 text-orange-100' : 'bg-blue-400/30 text-blue-100'}`}>
                                {selectedSupplier.is_kitchen ? '🍳 Kitchen' : '🚚 External'}
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Contact Info */}
                        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                            <h4 className="font-bold text-purple-800 text-sm mb-3 flex items-center gap-1.5">📞 Contact Information</h4>
                            <div className="space-y-2 text-sm">
                                {selectedSupplier.contact_person && (
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 text-center">👤</span>
                                        <span className="font-semibold text-gray-800">{selectedSupplier.contact_person}</span>
                                    </div>
                                )}
                                {selectedSupplier.phone && (
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 text-center">📞</span>
                                        <a href={`tel:${selectedSupplier.phone}`} className="text-blue-600 font-semibold hover:underline">{selectedSupplier.phone}</a>
                                    </div>
                                )}
                                {selectedSupplier.phone2 && (
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 text-center">📱</span>
                                        <a href={`tel:${selectedSupplier.phone2}`} className="text-blue-500 hover:underline">{selectedSupplier.phone2}</a>
                                    </div>
                                )}
                                {selectedSupplier.email && (
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 text-center">✉️</span>
                                        <a href={`mailto:${selectedSupplier.email}`} className="text-blue-500 text-xs hover:underline break-all">{selectedSupplier.email}</a>
                                    </div>
                                )}
                                {(selectedSupplier.address || selectedSupplier.city) && (
                                    <div className="flex items-start gap-2">
                                        <span className="w-6 text-center mt-0.5">📍</span>
                                        <span className="text-gray-600">{[selectedSupplier.address, selectedSupplier.city].filter(Boolean).join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Financial Info */}
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                            <h4 className="font-bold text-emerald-800 text-sm mb-3 flex items-center gap-1.5">💰 Financial Details</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Opening Balance</span>
                                    <span className="font-bold text-gray-700">Ksh {(selectedSupplier.opening_balance || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Current Balance</span>
                                    <span className={`font-black text-lg ${selectedSupplier.balance_type === 'Credit' ? 'text-red-600' : 'text-green-600'}`}>
                                        Ksh {(selectedSupplier.current_balance || 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm border-t border-emerald-100 pt-2">
                                    <span className="text-gray-500">Balance Type</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${selectedSupplier.balance_type === 'Credit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {selectedSupplier.balance_type === 'Credit' ? '🔴 Credit (We Owe)' : '🟢 Debit (They Owe)'}
                                    </span>
                                </div>
                                {selectedSupplier.payment_terms && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Payment Terms</span>
                                        <span className="font-semibold text-blue-700">{selectedSupplier.payment_terms}</span>
                                    </div>
                                )}
                                {selectedSupplier.kra_pin && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">KRA PIN</span>
                                        <span className="font-mono font-bold text-yellow-700">{selectedSupplier.kra_pin}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        {selectedSupplier.notes && (
                            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                <h4 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-1.5">📝 Notes</h4>
                                <p className="text-sm text-gray-600 leading-relaxed">{selectedSupplier.notes}</p>
                            </div>
                        )}

                        {/* Purchase History */}
                        <div>
                            <h4 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-1.5">
                                📋 Purchase History
                                <span className="ml-auto text-xs text-gray-400 font-normal">Last 10</span>
                            </h4>
                            {loadingHistory ? (
                                <div className="flex items-center justify-center py-6 gap-2">
                                    <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                                    <span className="text-gray-400 text-sm">Loading history...</span>
                                </div>
                            ) : purchaseHistory.length === 0 ? (
                                <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">No purchases recorded yet</div>
                            ) : (
                                <div className="space-y-2">
                                    {purchaseHistory.map(ph => (
                                        <div key={ph.purchase_id} className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-gray-800 text-xs">{ph.purchase_no}</p>
                                                <p className="text-xs text-gray-400">{new Date(ph.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-emerald-600 text-sm">Ksh {(ph.grand_total || 0).toLocaleString()}</p>
                                                <span className={`text-xs font-bold ${ph.payment_status === 'Paid' ? 'text-cyan-600' : 'text-red-500'}`}>
                                                    {ph.payment_status === 'Paid' ? '💳 Paid' : '❌ Unpaid'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Panel footer */}
                    <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50/50 flex gap-2">
                        <button onClick={() => openEditModal(selectedSupplier)} className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-1.5">
                            ✏️ Edit
                        </button>
                        <button onClick={() => toggleActive(selectedSupplier)}
                            className={`py-2.5 px-4 rounded-xl font-bold text-sm border transition-all ${selectedSupplier.active ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
                            {selectedSupplier.active ? '⏸' : '▶️'}
                        </button>
                        <button onClick={() => setSelectedSupplier(null)} className="py-2.5 px-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all">
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ── ADD/EDIT MODAL ── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-6 py-5 text-white sticky top-0 rounded-t-3xl z-10">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-black flex items-center gap-2">
                                        {editingSupplier ? '✏️ Edit Supplier' : '➕ Add New Supplier'}
                                    </h2>
                                    {editingSupplier && <p className="text-purple-100 text-sm mt-0.5">Code: {editingSupplier.supplier_code}</p>}
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-xl transition-all text-xl">✕</button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* Basic Info */}
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">🏢 Basic Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Supplier Name <span className="text-red-500">*</span></label>
                                        <input type="text" value={formData.supplier_name} onChange={(e) => f(e.target.value, 'supplier_name')}
                                            placeholder="e.g., ABC Distributors Ltd" required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-400/20 transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">👤 Contact Person</label>
                                        <input type="text" value={formData.contact_person} onChange={(e) => f(e.target.value, 'contact_person')}
                                            placeholder="Contact name"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">📞 Primary Phone</label>
                                        <input type="tel" value={formData.phone} onChange={(e) => f(e.target.value, 'phone')}
                                            placeholder="0712345678"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">📱 Secondary Phone</label>
                                        <input type="tel" value={formData.phone2} onChange={(e) => f(e.target.value, 'phone2')}
                                            placeholder="Alternative phone"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">✉️ Email Address</label>
                                        <input type="email" value={formData.email} onChange={(e) => f(e.target.value, 'email')}
                                            placeholder="supplier@company.com"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">📍 Address</label>
                                        <input type="text" value={formData.address} onChange={(e) => f(e.target.value, 'address')}
                                            placeholder="Street address"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">🏙️ City</label>
                                        <input type="text" value={formData.city} onChange={(e) => f(e.target.value, 'city')}
                                            placeholder="Nairobi"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                    </div>
                                </div>
                            </div>

                            {/* Financial */}
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-200">
                                <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">💰 Financial Settings</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Opening Balance (Ksh)</label>
                                        <input type="number" value={formData.opening_balance}
                                            onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 transition-all" min="0" step="0.01" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Balance Type</label>
                                        <select value={formData.balance_type} onChange={(e) => f(e.target.value, 'balance_type')}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer">
                                            <option value="Credit">Credit (We Owe Them)</option>
                                            <option value="Debit">Debit (They Owe Us)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">📅 Payment Terms</label>
                                        <input type="text" value={formData.payment_terms} onChange={(e) => f(e.target.value, 'payment_terms')}
                                            placeholder="Net 30, COD..."
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 transition-all" />
                                    </div>
                                </div>
                            </div>

                            {/* KRA + Toggles + Notes */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">🔢 KRA PIN</label>
                                    <input type="text" value={formData.kra_pin} onChange={(e) => f(e.target.value, 'kra_pin')}
                                        placeholder="Tax PIN number"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all" />
                                </div>
                                <div className="flex items-end gap-6 pb-1">
                                    <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 flex-1 hover:bg-purple-50 transition-all">
                                        <input type="checkbox" checked={formData.is_kitchen} onChange={(e) => setFormData({ ...formData, is_kitchen: e.target.checked })}
                                            className="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                                        <span className="font-semibold text-gray-700">🍳 Kitchen</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 flex-1 hover:bg-emerald-50 transition-all">
                                        <input type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                            className="w-5 h-5 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                                        <span className="font-semibold text-gray-700">✅ Active</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">📝 Notes</label>
                                <textarea value={formData.notes} onChange={(e) => f(e.target.value, 'notes')}
                                    placeholder="Additional notes about this supplier..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 transition-all resize-none" />
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-2 border-t border-gray-100">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSaving}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-purple-300/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {isSaving ? (
                                        <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                                    ) : (
                                        <>{editingSupplier ? '💾 Update Supplier' : '➕ Create Supplier'}</>
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
