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

    // Marking paid / deleting
    const [markingPaid, setMarkingPaid] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [tableMissing, setTableMissing] = useState(false);

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
            if (error) {
                if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
                    setTableMissing(true);
                }
                throw error;
            }
            setTableMissing(false);
            setPurchases(data || []);
            setCurrentPage(1);
        } catch (err: any) {
            console.error('Error loading purchases:', err);
            if (!err?.message?.includes('schema cache')) {
                toast.error(err?.message || 'Failed to load purchases');
            }
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
        <span className="ml-1 text-[10px] text-slate-400">
            {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const clearFilters = () => {
        setSearchQuery(''); setDateFrom(''); setDateTo('');
        setStatusFilter('All'); setPaymentFilter('All'); setSupplierFilter('All');
    };
    const hasFilters = searchQuery || dateFrom || dateTo || statusFilter !== 'All' || paymentFilter !== 'All' || supplierFilter !== 'All';

    return (
        <div className="flex gap-4 h-full" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* Main Content */}
            <div className="flex-1 space-y-4 transition-all">

                {/* ── COMPACT GLASSMORPHIIC HEADER ── */}
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 via-blue-500/10 to-teal-500/10 border border-indigo-200/50 flex items-center justify-center text-indigo-600 text-lg shadow-xs">
                                📋
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Purchase Records</h1>
                                <p className="text-xs text-slate-500">Track and manage inventory purchase history</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={exportCSV}
                                className="px-3.5 py-2 bg-white/80 hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-xs hover:border-slate-300 transition-all flex items-center gap-1.5"
                            >
                                <span>📥</span> Export CSV
                            </button>
                            <a
                                href="/dashboard/purchase"
                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                            >
                                <span>➕</span> New Purchase
                            </a>
                            <button
                                onClick={loadPurchases}
                                title="Refresh"
                                className="p-2 bg-white/80 hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs shadow-xs transition-all"
                            >
                                🔄
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
                                        The <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-amber-800 border border-amber-200 text-[10px]">purchases</code> and <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-amber-800 border border-amber-200 text-[10px]">purchase_products</code> tables need to be created in your Supabase database.
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

                {/* ── REFINED SLIM STATS CARDS (FAINTED COLORS & GLASSMORPHISM) ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {[
                        { label: 'Total Purchases', value: stats.total, badge: 'orders', bg: 'bg-blue-500/5', border: 'border-blue-200/50', text: 'text-blue-700', icon: '📋' },
                        { label: 'Total Value', value: `Ksh ${stats.amount.toLocaleString()}`, badge: 'gross', bg: 'bg-indigo-500/5', border: 'border-indigo-200/50', text: 'text-indigo-700', icon: '💰' },
                        { label: 'Paid Orders', value: stats.paid, badge: 'cleared', bg: 'bg-emerald-500/5', border: 'border-emerald-200/50', text: 'text-emerald-700', icon: '✅' },
                        { label: 'Paid Value', value: `Ksh ${stats.paidAmount.toLocaleString()}`, badge: 'settled', bg: 'bg-teal-500/5', border: 'border-teal-200/50', text: 'text-teal-700', icon: '💵' },
                        { label: 'Unpaid Orders', value: stats.unpaid, badge: 'pending', bg: 'bg-amber-500/5', border: 'border-amber-200/50', text: 'text-amber-700', icon: '⏳' },
                        { label: 'Unpaid Value', value: `Ksh ${stats.unpaidAmount.toLocaleString()}`, badge: 'due', bg: 'bg-rose-500/5', border: 'border-rose-200/50', text: 'text-rose-700', icon: '🔴' },
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

                {/* ── SLEEK TRANSLUCENT FILTERS BAR ── */}
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-3.5 shadow-sm space-y-2.5">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                        <div className="col-span-2 md:col-span-1">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="🔍 Search invoice/supplier..."
                                className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                        </div>
                        <div>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                        </div>
                        <div>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                        </div>
                        <div>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Completed">Completed</option>
                                <option value="Pending">Pending</option>
                                <option value="Draft">Draft</option>
                            </select>
                        </div>
                        <div>
                            <select
                                value={paymentFilter}
                                onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                            >
                                <option value="All">All Payments</option>
                                <option value="Paid">Paid</option>
                                <option value="Unpaid">Unpaid</option>
                            </select>
                        </div>
                        <div>
                            <select
                                value={supplierFilter}
                                onChange={(e) => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer truncate"
                            >
                                <option value="All">All Suppliers</option>
                                {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {hasFilters && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                            <div className="flex flex-wrap gap-1.5 text-slate-600">
                                <span className="font-medium text-slate-500">Active filters:</span>
                                {searchQuery && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200/50">Search: {searchQuery}</span>}
                                {statusFilter !== 'All' && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200/50">{statusFilter}</span>}
                                {paymentFilter !== 'All' && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200/50">{paymentFilter}</span>}
                                {supplierFilter !== 'All' && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-200/50">{supplierFilter}</span>}
                                <span className="text-slate-400">({filteredSorted.length} matches)</span>
                            </div>
                            <button
                                onClick={clearFilters}
                                className="text-rose-600 hover:text-rose-700 font-medium hover:underline ml-auto"
                            >
                                Clear all
                            </button>
                        </div>
                    )}
                </div>

                {/* ── GLASSMORPHIC DATA GRID ── */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                            <p className="text-xs text-slate-500">Loading purchase records...</p>
                        </div>
                    ) : filteredSorted.length === 0 ? (
                        <div className="p-12 text-center">
                            <span className="text-4xl block mb-2 opacity-60">📭</span>
                            <p className="text-sm font-semibold text-slate-700">No purchases found</p>
                            <p className="text-xs text-slate-400 mt-0.5">Try adjusting your filters or record a new purchase order</p>
                            <a
                                href="/dashboard/purchase"
                                className="mt-3 inline-block px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs"
                            >
                                ➕ Record Purchase
                            </a>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/70 text-slate-600 text-[11px] font-semibold uppercase tracking-wider">
                                        <th className="py-2.5 px-3.5 cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleSort('purchase_no')}>
                                            Invoice <SortIcon col="purchase_no" />
                                        </th>
                                        <th className="py-2.5 px-3.5 cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleSort('purchase_date')}>
                                            Date <SortIcon col="purchase_date" />
                                        </th>
                                        <th className="py-2.5 px-3.5 cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleSort('supplier_name')}>
                                            Supplier <SortIcon col="supplier_name" />
                                        </th>
                                        <th className="py-2.5 px-3.5 hidden lg:table-cell">Supp. Ref</th>
                                        <th className="py-2.5 px-3.5 text-right hidden md:table-cell">Sub Total</th>
                                        <th className="py-2.5 px-3.5 text-right hidden md:table-cell">VAT</th>
                                        <th className="py-2.5 px-3.5 text-right cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleSort('grand_total')}>
                                            Total <SortIcon col="grand_total" />
                                        </th>
                                        <th className="py-2.5 px-3.5 text-center">Status</th>
                                        <th className="py-2.5 px-3.5 text-center">Payment</th>
                                        <th className="py-2.5 px-3.5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                    {paginated.map((purchase) => {
                                        const isSelected = selectedPurchase?.purchase_id === purchase.purchase_id;
                                        return (
                                            <tr
                                                key={purchase.purchase_id}
                                                onClick={() => viewDetails(purchase)}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-indigo-50/50 border-l-2 border-indigo-500'
                                                        : 'hover:bg-slate-50/60'
                                                }`}
                                            >
                                                <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                                                    <span className="font-mono text-indigo-700 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-200/50">
                                                        {purchase.purchase_no}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3.5">
                                                    <div className="font-medium text-slate-800">
                                                        {new Date(purchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3.5">
                                                    <div className="font-semibold text-slate-800 truncate max-w-[160px]">
                                                        {purchase.supplier_name || <span className="text-slate-400 italic font-normal">Direct Vendor</span>}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3.5 hidden lg:table-cell">
                                                    {purchase.supplier_invoice ? (
                                                        <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                                            {purchase.supplier_invoice}
                                                        </span>
                                                    ) : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right hidden md:table-cell text-slate-600 font-mono">
                                                    Ksh {(purchase.sub_total || 0).toLocaleString()}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right hidden md:table-cell text-slate-500 font-mono">
                                                    Ksh {(purchase.vat || 0).toLocaleString()}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right font-bold text-slate-800 font-mono">
                                                    Ksh {(purchase.grand_total || 0).toLocaleString()}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                        purchase.status === 'Completed'
                                                            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300/40'
                                                            : purchase.status === 'Pending'
                                                            ? 'bg-amber-500/10 text-amber-700 border-amber-300/40'
                                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                                    }`}>
                                                        {purchase.status || 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                        purchase.payment_status === 'Paid'
                                                            ? 'bg-teal-500/10 text-teal-700 border-teal-300/40'
                                                            : 'bg-rose-500/10 text-rose-700 border-rose-300/40'
                                                    }`}>
                                                        {purchase.payment_status === 'Paid' ? 'Paid' : 'Unpaid'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => viewDetails(purchase)}
                                                            title="View details"
                                                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                                                        >
                                                            👁️
                                                        </button>
                                                        {purchase.payment_status !== 'Paid' && (
                                                            <button
                                                                onClick={() => markAsPaid(purchase)}
                                                                disabled={markingPaid === purchase.purchase_id}
                                                                title="Mark as paid"
                                                                className="p-1 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors disabled:opacity-50"
                                                            >
                                                                {markingPaid === purchase.purchase_id ? '⏳' : '✅'}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => deletePurchase(purchase)}
                                                            disabled={deletingId === purchase.purchase_id}
                                                            title="Delete"
                                                            className="p-1 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors disabled:opacity-50"
                                                        >
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
                        <div className="px-3.5 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/40">
                            <span>
                                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSorted.length)} of {filteredSorted.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                                >
                                    ‹ Prev
                                </button>
                                <span className="px-2 font-medium text-slate-700">{currentPage} / {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                                >
                                    Next ›
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── REFINED COMPACT SLIDE-IN DETAIL PANEL ── */}
            {selectedPurchase && (
                <div className="w-[340px] flex-shrink-0 bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-2xl shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-100px)] sticky top-4">
                    {/* Header */}
                    <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-indigo-700">{selectedPurchase.purchase_no}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                                    selectedPurchase.payment_status === 'Paid'
                                        ? 'bg-teal-500/10 text-teal-700 border-teal-300/40'
                                        : 'bg-rose-500/10 text-rose-700 border-rose-300/40'
                                }`}>
                                    {selectedPurchase.payment_status}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                {new Date(selectedPurchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                        </div>
                        <button
                            onClick={() => setSelectedPurchase(null)}
                            className="p-1 hover:bg-slate-200/60 rounded-lg text-slate-500 text-xs transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
                        {/* Supplier Info */}
                        <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/50 space-y-1">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Supplier</span>
                            <p className="font-bold text-slate-800 text-sm leading-tight">{selectedPurchase.supplier_name || 'Direct / Unknown'}</p>
                            {selectedPurchase.supplier_invoice && (
                                <p className="text-[11px] text-slate-500">
                                    Ref: <span className="font-mono text-slate-700">{selectedPurchase.supplier_invoice}</span>
                                </p>
                            )}
                        </div>

                        {/* Financials Breakdown */}
                        <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-200/40 space-y-1.5">
                            <div className="flex justify-between text-slate-600">
                                <span>Sub Total:</span>
                                <span className="font-mono">Ksh {(selectedPurchase.sub_total || 0).toLocaleString()}</span>
                            </div>
                            {selectedPurchase.discount > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <span>Discount:</span>
                                    <span className="font-mono">- Ksh {selectedPurchase.discount.toLocaleString()}</span>
                                </div>
                            )}
                            {selectedPurchase.vat > 0 && (
                                <div className="flex justify-between text-indigo-700">
                                    <span>VAT:</span>
                                    <span className="font-mono">+ Ksh {selectedPurchase.vat.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200/50 font-bold text-slate-900 text-sm">
                                <span>Grand Total:</span>
                                <span className="text-emerald-700 font-mono">Ksh {(selectedPurchase.grand_total || 0).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Items ({purchaseItems.length})
                                </span>
                            </div>
                            {isLoadingItems ? (
                                <div className="p-4 text-center text-slate-400">Loading items...</div>
                            ) : purchaseItems.length === 0 ? (
                                <div className="p-3 text-center text-slate-400 bg-slate-50/50 rounded-xl">No line items recorded</div>
                            ) : (
                                <div className="border border-slate-200/60 rounded-xl overflow-hidden divide-y divide-slate-100">
                                    {purchaseItems.map((item, idx) => (
                                        <div key={idx} className="p-2 flex items-center justify-between bg-white">
                                            <div className="pr-2 truncate">
                                                <p className="font-semibold text-slate-800 text-[11px] truncate">{item.product_name}</p>
                                                <p className="text-[10px] text-slate-400">
                                                    {item.quantity} × Ksh {(item.rate || 0).toLocaleString()}
                                                </p>
                                            </div>
                                            <span className="font-mono font-bold text-slate-800 text-[11px] flex-shrink-0">
                                                Ksh {(item.total_amount || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
                        {selectedPurchase.payment_status !== 'Paid' && (
                            <button
                                onClick={() => markAsPaid(selectedPurchase)}
                                disabled={markingPaid === selectedPurchase.purchase_id}
                                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
                            >
                                Mark Paid
                            </button>
                        )}
                        <button
                            onClick={() => deletePurchase(selectedPurchase)}
                            disabled={deletingId === selectedPurchase.purchase_id}
                            className="px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-rose-600 rounded-xl text-xs font-semibold shadow-xs transition-all"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
