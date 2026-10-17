'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Purchase {
    purchase_id: number;
    purchase_no: string;
    purchase_date: string;
    supplier_id: number;
    supplier_name: string;
    supplier_invoice: string;
    sub_total: number;
    discount: number;
    vat: number;
    grand_total: number;
    status: string;
    payment_status: string;
    created_by: string;
    created_at: string;
}

interface PurchaseItem {
    product_id: number;
    product_name: string;
    quantity: number;
    rate: number;
    total_amount: number;
    purchase_id: number;
}

type SortKey = 'purchase_date' | 'grand_total' | 'purchase_no' | 'supplier_name';
type SortDir = 'asc' | 'desc';

export default function PurchasesPage() {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [paymentFilter, setPaymentFilter] = useState('All');
    const [supplierFilter, setSupplierFilter] = useState('All');
    const [sortKey, setSortKey] = useState<SortKey>('purchase_date');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Detail panel
    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);

    // Marking paid
    const [markingPaid, setMarkingPaid] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const loadPurchases = useCallback(async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('purchases')
                .select('*')
                .order('purchase_id', { ascending: false });

            if (dateFrom) query = query.gte('purchase_date', dateFrom);
            if (dateTo) query = query.lte('purchase_date', dateTo);

            const { data, error } = await query;
            if (error) throw error;
            setPurchases(data || []);
            setCurrentPage(1);
        } catch (err) {
            console.error('Error loading purchases:', err);
            toast.error('Failed to load purchases');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadPurchases(); }, [loadPurchases]);

    const viewDetails = async (purchase: Purchase) => {
        setSelectedPurchase(purchase);
        setIsLoadingItems(true);
        setPurchaseItems([]);
        try {
            const { data, error } = await supabase
                .from('purchase_products')
                .select('product_id, product_name, quantity, rate, total_amount, purchase_id')
                .eq('purchase_id', purchase.purchase_id);
            if (error) throw error;
            setPurchaseItems(data || []);
        } catch (err) {
            console.error('Error loading items:', err);
            toast.error('Failed to load items');
        }
        setIsLoadingItems(false);
    };

    const markAsPaid = async (purchase: Purchase) => {
        if (purchase.payment_status === 'Paid') { toast('Already paid'); return; }
        if (!confirm(`Mark ${purchase.purchase_no} as PAID?`)) return;
        setMarkingPaid(purchase.purchase_id);
        try {
            const { error } = await supabase
                .from('purchases')
                .update({ payment_status: 'Paid' })
                .eq('purchase_id', purchase.purchase_id);
            if (error) throw error;
            toast.success(`${purchase.purchase_no} marked as Paid ✓`);
            loadPurchases();
            if (selectedPurchase?.purchase_id === purchase.purchase_id) {
                setSelectedPurchase({ ...selectedPurchase, payment_status: 'Paid' });
            }
        } catch (err) {
            toast.error('Failed to update payment status');
        }
        setMarkingPaid(null);
    };

    const deletePurchase = async (purchase: Purchase) => {
        if (!confirm(`Delete purchase ${purchase.purchase_no}? This cannot be undone.`)) return;
        setDeletingId(purchase.purchase_id);
        try {
            const { error } = await supabase
                .from('purchases')
                .delete()
                .eq('purchase_id', purchase.purchase_id);
            if (error) throw error;
            toast.success('Purchase deleted');
            if (selectedPurchase?.purchase_id === purchase.purchase_id) setSelectedPurchase(null);
            loadPurchases();
        } catch (err) {
            toast.error('Failed to delete purchase');
        }
        setDeletingId(null);
    };

    const exportCSV = () => {
        const rows = filteredSorted.map(p => [
            p.purchase_no, p.purchase_date, p.supplier_name,
            p.supplier_invoice, p.sub_total, p.discount, p.vat,
            p.grand_total, p.status, p.payment_status, p.created_by
        ]);
        const header = ['Invoice No', 'Date', 'Supplier', 'Supp Invoice', 'Sub Total', 'Discount', 'VAT', 'Grand Total', 'Status', 'Payment', 'Created By'];
        const csv = [header, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `purchases_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        toast.success('CSV exported!');
    };

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const uniqueSuppliers = useMemo(() => Array.from(new Set(purchases.map(p => p.supplier_name).filter(Boolean))).sort(), [purchases]);

    const filteredSorted = useMemo(() => {
        let arr = purchases.filter(p => {
            const q = searchQuery.toLowerCase();
            const matchSearch = !q || p.purchase_no?.toLowerCase().includes(q) || p.supplier_name?.toLowerCase().includes(q) || p.supplier_invoice?.toLowerCase().includes(q);
            const matchStatus = statusFilter === 'All' || p.status === statusFilter;
            const matchPayment = paymentFilter === 'All' || p.payment_status === paymentFilter || (paymentFilter === 'Unpaid' && p.payment_status !== 'Paid');
            const matchSupplier = supplierFilter === 'All' || p.supplier_name === supplierFilter;
            return matchSearch && matchStatus && matchPayment && matchSupplier;
        });
        arr.sort((a, b) => {
            let av: string | number = a[sortKey] ?? '';
            let bv: string | number = b[sortKey] ?? '';
            if (sortKey === 'grand_total') { av = Number(av); bv = Number(bv); }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return arr;
    }, [purchases, searchQuery, statusFilter, paymentFilter, supplierFilter, sortKey, sortDir]);

    const totalPages = Math.ceil(filteredSorted.length / pageSize);
    const paginated = filteredSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const stats = useMemo(() => ({
        total: filteredSorted.length,
        amount: filteredSorted.reduce((s, p) => s + (p.grand_total || 0), 0),
        paid: filteredSorted.filter(p => p.payment_status === 'Paid').length,
        unpaid: filteredSorted.filter(p => p.payment_status !== 'Paid').length,
        paidAmount: filteredSorted.filter(p => p.payment_status === 'Paid').reduce((s, p) => s + (p.grand_total || 0), 0),
        unpaidAmount: filteredSorted.filter(p => p.payment_status !== 'Paid').reduce((s, p) => s + (p.grand_total || 0), 0),
    }), [filteredSorted]);

    const SortIcon = ({ col }: { col: SortKey }) => (
        <span className="ml-1 text-xs opacity-60">
            {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
    );

    const clearFilters = () => {
        setSearchQuery(''); setDateFrom(''); setDateTo('');
        setStatusFilter('All'); setPaymentFilter('All'); setSupplierFilter('All');
    };
    const hasFilters = searchQuery || dateFrom || dateTo || statusFilter !== 'All' || paymentFilter !== 'All' || supplierFilter !== 'All';

    return (
        <div className="flex gap-0 h-full" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* Main Content */}
            <div className={`flex-1 space-y-5 transition-all duration-300 ${selectedPurchase ? 'pr-2' : ''}`}>

                {/* ── HEADER ── */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 shadow-2xl">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                    <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-white flex items-center gap-3">
                                <span className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/30 shadow-lg">📋</span>
                                Purchase Records
                            </h1>
                            <p className="text-blue-100 mt-1 font-medium">Complete purchase history • Real-time sync</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button onClick={exportCSV} className="flex items-center gap-2 px-5 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl font-semibold hover:bg-white/30 border border-white/30 transition-all hover:scale-105 active:scale-95 shadow">
                                📥 Export CSV
                            </button>
                            <a href="/dashboard/purchase" className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 rounded-xl font-bold hover:shadow-xl transition-all hover:scale-105 active:scale-95 shadow-lg">
                                ➕ New Purchase
                            </a>
                            <button onClick={loadPurchases} className="flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl font-semibold hover:bg-white/30 border border-white/30 transition-all">
                                🔄
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── STATS CARDS ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                        { label: 'Purchases', value: stats.total, sub: 'filtered', icon: '📋', from: 'from-blue-500', to: 'to-indigo-600' },
                        { label: 'Total Value', value: `Ksh ${stats.amount.toLocaleString()}`, sub: 'grand total', icon: '💰', from: 'from-violet-500', to: 'to-purple-600' },
                        { label: 'Paid Orders', value: stats.paid, sub: '', icon: '✅', from: 'from-emerald-500', to: 'to-green-600' },
                        { label: 'Paid Value', value: `Ksh ${stats.paidAmount.toLocaleString()}`, sub: 'cleared', icon: '💵', from: 'from-cyan-500', to: 'to-teal-600' },
                        { label: 'Unpaid Orders', value: stats.unpaid, sub: '', icon: '⏳', from: 'from-orange-500', to: 'to-amber-600' },
                        { label: 'Unpaid Value', value: `Ksh ${stats.unpaidAmount.toLocaleString()}`, sub: 'outstanding', icon: '🔴', from: 'from-red-500', to: 'to-rose-600' },
                    ].map((s, i) => (
                        <div key={i} className={`bg-gradient-to-br ${s.from} ${s.to} rounded-2xl p-4 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">{s.icon}</span>
                                <span className="text-xs opacity-70 font-medium">{s.sub}</span>
                            </div>
                            <p className="text-[11px] font-medium opacity-80 uppercase tracking-wide">{s.label}</p>
                            <p className="text-lg font-black mt-0.5 leading-tight">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* ── FILTERS ── */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-gray-100 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">🔍 Filters & Search</h3>
                        {hasFilters && (
                            <button onClick={clearFilters} className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-all">
                                ✕ Clear All
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="col-span-2 md:col-span-1">
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">🔍 Search</label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Invoice / supplier..."
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">📅 From</label>
                            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">📅 To</label>
                            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">📦 Status</label>
                            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all cursor-pointer">
                                <option value="All">All Status</option>
                                <option value="Completed">Completed</option>
                                <option value="Pending">Pending</option>
                                <option value="Draft">Draft</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">💳 Payment</label>
                            <select value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all cursor-pointer">
                                <option value="All">All Payments</option>
                                <option value="Paid">Paid</option>
                                <option value="Unpaid">Unpaid</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">🏢 Supplier</label>
                            <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-all cursor-pointer">
                                <option value="All">All Suppliers</option>
                                {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    {/* Active filter pills */}
                    {hasFilters && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                            {searchQuery && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">Search: {searchQuery}</span>}
                            {statusFilter !== 'All' && <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">Status: {statusFilter}</span>}
                            {paymentFilter !== 'All' && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Payment: {paymentFilter}</span>}
                            {supplierFilter !== 'All' && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">Supplier: {supplierFilter}</span>}
                            {(dateFrom || dateTo) && <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Date: {dateFrom || '...'} → {dateTo || '...'}</span>}
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">{filteredSorted.length} result{filteredSorted.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>

                {/* ── DATA GRID ── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
                    {isLoading ? (
                        <div className="p-16 flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                            <p className="text-gray-500 font-medium">Loading purchases...</p>
                        </div>
                    ) : filteredSorted.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-6xl block mb-4">📭</span>
                            <p className="text-gray-500 text-lg font-medium">No purchases found</p>
                            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or create a new purchase</p>
                            <a href="/dashboard/purchase" className="mt-4 inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">
                                ➕ Create Purchase
                            </a>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide cursor-pointer hover:bg-white/10 transition-colors" onClick={() => toggleSort('purchase_no')}>
                                            Invoice # <SortIcon col="purchase_no" />
                                        </th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide cursor-pointer hover:bg-white/10 transition-colors" onClick={() => toggleSort('purchase_date')}>
                                            Date <SortIcon col="purchase_date" />
                                        </th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide cursor-pointer hover:bg-white/10 transition-colors" onClick={() => toggleSort('supplier_name')}>
                                            Supplier <SortIcon col="supplier_name" />
                                        </th>
                                        <th className="text-left py-4 px-4 text-xs font-bold uppercase tracking-wide hidden lg:table-cell">Supp. Invoice</th>
                                        <th className="text-right py-4 px-4 text-xs font-bold uppercase tracking-wide hidden md:table-cell">Sub Total</th>
                                        <th className="text-right py-4 px-4 text-xs font-bold uppercase tracking-wide hidden md:table-cell">VAT</th>
                                        <th className="text-right py-4 px-4 text-xs font-bold uppercase tracking-wide cursor-pointer hover:bg-white/10 transition-colors" onClick={() => toggleSort('grand_total')}>
                                            Grand Total <SortIcon col="grand_total" />
                                        </th>
                                        <th className="text-center py-4 px-4 text-xs font-bold uppercase tracking-wide">Status</th>
                                        <th className="text-center py-4 px-4 text-xs font-bold uppercase tracking-wide">Payment</th>
                                        <th className="text-center py-4 px-4 text-xs font-bold uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map((purchase, idx) => {
                                        const isSelected = selectedPurchase?.purchase_id === purchase.purchase_id;
                                        return (
                                            <tr
                                                key={purchase.purchase_id}
                                                onClick={() => viewDetails(purchase)}
                                                className={`border-t border-gray-50 cursor-pointer transition-all duration-150 ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : idx % 2 === 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-gray-50/40 hover:bg-blue-50/40'}`}
                                            >
                                                <td className="py-3.5 px-4">
                                                    <span className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-bold text-xs shadow-sm">
                                                        {purchase.purchase_no}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="text-sm font-semibold text-gray-800">
                                                        {new Date(purchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </div>
                                                    <div className="text-xs text-gray-400">{new Date(purchase.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
                                                            {(purchase.supplier_name || 'U')[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800 text-sm">{purchase.supplier_name || <span className="text-gray-400 italic">No Supplier</span>}</p>
                                                            {purchase.created_by && <p className="text-xs text-gray-400">by {purchase.created_by}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 hidden lg:table-cell">
                                                    {purchase.supplier_invoice ? (
                                                        <span className="font-mono text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200">{purchase.supplier_invoice}</span>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="py-3.5 px-4 text-right hidden md:table-cell">
                                                    <span className="text-sm text-gray-600 font-medium">Ksh {(purchase.sub_total || 0).toLocaleString()}</span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right hidden md:table-cell">
                                                    <span className="text-sm text-orange-600 font-medium">Ksh {(purchase.vat || 0).toLocaleString()}</span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <span className="text-base font-black text-emerald-600">Ksh {(purchase.grand_total || 0).toLocaleString()}</span>
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                                        purchase.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        purchase.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        'bg-gray-50 text-gray-600 border-gray-200'
                                                    }`}>
                                                        {purchase.status === 'Completed' ? '✅' : purchase.status === 'Pending' ? '⏳' : '📝'} {purchase.status || 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                                        purchase.payment_status === 'Paid' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-red-50 text-red-700 border-red-200'
                                                    }`}>
                                                        {purchase.payment_status === 'Paid' ? '💳 Paid' : '❌ Unpaid'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => viewDetails(purchase)} title="View Details"
                                                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all hover:scale-110 font-medium text-sm">👁️</button>
                                                        {purchase.payment_status !== 'Paid' && (
                                                            <button onClick={() => markAsPaid(purchase)} title="Mark as Paid"
                                                                disabled={markingPaid === purchase.purchase_id}
                                                                className="p-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg transition-all hover:scale-110 text-sm disabled:opacity-50">
                                                                {markingPaid === purchase.purchase_id ? '⏳' : '✅'}
                                                            </button>
                                                        )}
                                                        <a href="/dashboard/purchase" title="New Purchase"
                                                            className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all hover:scale-110 text-sm">✏️</a>
                                                        <button onClick={() => deletePurchase(purchase)} title="Delete"
                                                            disabled={deletingId === purchase.purchase_id}
                                                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all hover:scale-110 text-sm disabled:opacity-50">
                                                            {deletingId === purchase.purchase_id ? '⏳' : '🗑️'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <p className="text-sm text-gray-500">
                                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSorted.length)} of <b>{filteredSorted.length}</b>
                            </p>
                            <div className="flex gap-1">
                                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-40 transition-all">«</button>
                                <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-40 transition-all">‹ Prev</button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    const p = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                                    return (
                                        <button key={p} onClick={() => setCurrentPage(p)}
                                            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${currentPage === p ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-white border-gray-200 hover:bg-blue-50'}`}>
                                            {p}
                                        </button>
                                    );
                                })}
                                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-40 transition-all">Next ›</button>
                                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-40 transition-all">»</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── DETAIL SIDE PANEL ── */}
            {selectedPurchase && (
                <div className="w-[400px] flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-120px)] sticky top-0">
                    {/* Panel Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-4 text-white flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black flex items-center gap-2">
                                    📋 {selectedPurchase.purchase_no}
                                </h2>
                                <p className="text-blue-100 text-xs mt-0.5">{new Date(selectedPurchase.purchase_date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
                            </div>
                            <button onClick={() => setSelectedPurchase(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all">✕</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {/* Info Cards */}
                        <div className="p-4 space-y-3">
                            {/* Supplier Card */}
                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow">
                                        {(selectedPurchase.supplier_name || 'U')[0]}
                                    </div>
                                    <div>
                                        <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide">Supplier</p>
                                        <p className="font-bold text-gray-800">{selectedPurchase.supplier_name || 'No Supplier'}</p>
                                        {selectedPurchase.supplier_invoice && (
                                            <p className="text-xs text-gray-500 mt-0.5">Supp. Invoice: <span className="font-mono font-semibold text-yellow-700">{selectedPurchase.supplier_invoice}</span></p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Status badges */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <p className="text-xs text-gray-500 font-semibold mb-1">Order Status</p>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedPurchase.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {selectedPurchase.status === 'Completed' ? '✅' : '⏳'} {selectedPurchase.status || 'Pending'}
                                    </span>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <p className="text-xs text-gray-500 font-semibold mb-1">Payment</p>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedPurchase.payment_status === 'Paid' ? 'bg-cyan-100 text-cyan-700' : 'bg-red-100 text-red-700'}`}>
                                        {selectedPurchase.payment_status === 'Paid' ? '💳 Paid' : '❌ Unpaid'}
                                    </span>
                                </div>
                            </div>

                            {/* Financials */}
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100 space-y-2">
                                <h4 className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">💰 Financials</h4>
                                <div className="space-y-1.5">
                                    {[
                                        { label: 'Sub Total', value: selectedPurchase.sub_total, color: 'text-gray-700' },
                                        { label: 'Discount', value: selectedPurchase.discount, color: 'text-orange-600' },
                                        { label: 'VAT', value: selectedPurchase.vat, color: 'text-blue-600' },
                                    ].map(row => (
                                        <div key={row.label} className="flex justify-between text-sm">
                                            <span className="text-gray-500">{row.label}</span>
                                            <span className={`font-semibold ${row.color}`}>Ksh {(row.value || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center border-t border-emerald-200 pt-2 mt-1">
                                        <span className="font-bold text-emerald-800">Grand Total</span>
                                        <span className="font-black text-xl text-emerald-700">Ksh {(selectedPurchase.grand_total || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Created by */}
                            {selectedPurchase.created_by && (
                                <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-2 border border-blue-100">
                                    <span className="text-blue-500">👤</span>
                                    <div>
                                        <p className="text-xs text-blue-400 font-semibold">Created by</p>
                                        <p className="text-sm font-bold text-blue-800">{selectedPurchase.created_by}</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                        <p className="text-xs text-blue-400">At</p>
                                        <p className="text-xs font-semibold text-blue-700">{new Date(selectedPurchase.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            )}

                            {/* Items Table */}
                            <div>
                                <h4 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-2">📦 Items ({isLoadingItems ? '...' : purchaseItems.length})</h4>
                                {isLoadingItems ? (
                                    <div className="flex items-center justify-center py-8 gap-3">
                                        <div className="w-6 h-6 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                                        <span className="text-gray-400 text-sm">Loading items...</span>
                                    </div>
                                ) : purchaseItems.length === 0 ? (
                                    <div className="text-center py-6 text-gray-400 text-sm">No items recorded</div>
                                ) : (
                                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-500 uppercase">#</th>
                                                    <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-500 uppercase">Item</th>
                                                    <th className="text-center py-2.5 px-3 text-xs font-bold text-gray-500 uppercase">Qty</th>
                                                    <th className="text-right py-2.5 px-3 text-xs font-bold text-gray-500 uppercase">Rate</th>
                                                    <th className="text-right py-2.5 px-3 text-xs font-bold text-gray-500 uppercase">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {purchaseItems.map((item, idx) => (
                                                    <tr key={idx} className={`border-t border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                        <td className="py-2.5 px-3 text-gray-400">{idx + 1}</td>
                                                        <td className="py-2.5 px-3">
                                                            <p className="font-semibold text-gray-800 text-xs leading-tight">{item.product_name}</p>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold text-xs">{item.quantity}</span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-gray-600 text-xs">Ksh {(item.rate || 0).toLocaleString()}</td>
                                                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 text-xs">Ksh {(item.total_amount || 0).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-emerald-50">
                                                <tr>
                                                    <td colSpan={4} className="py-2.5 px-3 text-xs font-bold text-emerald-800 text-right">TOTAL</td>
                                                    <td className="py-2.5 px-3 text-right font-black text-emerald-700 text-sm">
                                                        Ksh {purchaseItems.reduce((s, i) => s + (i.total_amount || 0), 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Panel Footer Actions */}
                    <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50/50 flex gap-2">
                        {selectedPurchase.payment_status !== 'Paid' && (
                            <button onClick={() => markAsPaid(selectedPurchase)}
                                disabled={markingPaid === selectedPurchase.purchase_id}
                                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                                {markingPaid === selectedPurchase.purchase_id ? '⏳ Marking...' : '✅ Mark Paid'}
                            </button>
                        )}
                        <button onClick={() => deletePurchase(selectedPurchase)}
                            disabled={deletingId === selectedPurchase.purchase_id}
                            className="py-2.5 px-4 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-100 transition-all disabled:opacity-50">
                            {deletingId === selectedPurchase.purchase_id ? '⏳' : '🗑️'}
                        </button>
                        <button onClick={() => setSelectedPurchase(null)} className="py-2.5 px-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all">
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
