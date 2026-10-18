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
        <span className="ml-1 text-xs opacity-70">
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
            <div className="flex-1 space-y-5 transition-all">

                {/* ── HERO BANNER (MATCHING DASHBOARD STYLE) ── */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-5 text-white shadow-xl">
                    <div className="absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />
                    <div className="absolute right-32 -top-10 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />

                    <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white text-2xl shadow-md">
                                📋
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Purchase Records</h1>
                                <p className="text-blue-100 text-sm font-medium mt-0.5">Real-time purchase intelligence & supplier orders</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            <button
                                onClick={exportCSV}
                                className="px-4 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white rounded-xl text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                            >
                                <span>📥</span> Export CSV
                            </button>
                            <a
                                href="/dashboard/purchase"
                                className="px-5 py-2.5 bg-white hover:bg-blue-50 text-indigo-700 font-extrabold rounded-xl text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <span>➕</span> New Purchase
                            </a>
                            <button
                                onClick={loadPurchases}
                                title="Refresh data"
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
                                        Database tables <code className="bg-black/20 px-2 py-0.5 rounded font-mono text-xs">purchases</code> and <code className="bg-black/20 px-2 py-0.5 rounded font-mono text-xs">purchase_products</code> need to be set up in Supabase.
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

                {/* ── VIBRANT GLASSMORPHIC KPI CARDS (EXACT MATCH TO DASHBOARD IMAGE) ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                    {/* Card 1: Total Purchases */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>📋</span> Total Orders
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.total}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Orders recorded
                        </span>
                    </div>

                    {/* Card 2: Total Value */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>💰</span> Total Purchases
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-white mt-1.5 truncate">
                            Ksh {stats.amount >= 1000 ? `${(stats.amount / 1000).toFixed(1)}K` : stats.amount.toLocaleString()}
                        </h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Grand total value
                        </span>
                    </div>

                    {/* Card 3: Paid Orders */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-green-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>✅</span> Paid Orders
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.paid}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Cleared in full
                        </span>
                    </div>

                    {/* Card 4: Paid Amount */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>💵</span> Paid Value
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-white mt-1.5 truncate">
                            Ksh {stats.paidAmount >= 1000 ? `${(stats.paidAmount / 1000).toFixed(1)}K` : stats.paidAmount.toLocaleString()}
                        </h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Settled payments
                        </span>
                    </div>

                    {/* Card 5: Unpaid Orders */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>⏳</span> Unpaid Orders
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mt-1.5">{stats.unpaid}</h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Pending invoices
                        </span>
                    </div>

                    {/* Card 6: Outstanding Due */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 p-4 text-white shadow-lg">
                        <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/15 pointer-events-none" />
                        <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                            <span>🔴</span> Unpaid Due
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-white mt-1.5 truncate">
                            Ksh {stats.unpaidAmount >= 1000 ? `${(stats.unpaidAmount / 1000).toFixed(1)}K` : stats.unpaidAmount.toLocaleString()}
                        </h3>
                        <span className="inline-block mt-2.5 px-2.5 py-0.5 rounded-lg bg-black/15 backdrop-blur-sm text-xs font-semibold text-white/95">
                            Due to suppliers
                        </span>
                    </div>
                </div>

                {/* ── FILTERS ── */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        <div className="col-span-2 md:col-span-1">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">🔍 Search</label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Invoice or supplier..."
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all font-medium"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">📅 From</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all font-medium"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">📅 To</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all font-medium"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">📦 Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all font-medium cursor-pointer"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Completed">Completed</option>
                                <option value="Pending">Pending</option>
                                <option value="Draft">Draft</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">💳 Payment</label>
                            <select
                                value={paymentFilter}
                                onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all font-medium cursor-pointer"
                            >
                                <option value="All">All Payments</option>
                                <option value="Paid">Paid</option>
                                <option value="Unpaid">Unpaid</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">🏢 Supplier</label>
                            <select
                                value={supplierFilter}
                                onChange={(e) => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 transition-all font-medium cursor-pointer truncate"
                            >
                                <option value="All">All Suppliers</option>
                                {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {hasFilters && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="font-bold text-gray-500">Filters:</span>
                                {searchQuery && <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold border border-blue-200">Search: {searchQuery}</span>}
                                {statusFilter !== 'All' && <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-semibold border border-indigo-200">{statusFilter}</span>}
                                {paymentFilter !== 'All' && <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-lg font-semibold border border-green-200">{paymentFilter}</span>}
                                {supplierFilter !== 'All' && <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg font-semibold border border-purple-200">{supplierFilter}</span>}
                                <span className="text-gray-400 font-medium">({filteredSorted.length} results)</span>
                            </div>
                            <button
                                onClick={clearFilters}
                                className="text-red-600 hover:text-red-700 font-bold hover:underline"
                            >
                                Clear All
                            </button>
                        </div>
                    )}
                </div>

                {/* ── PREMIUM DATA GRID ── */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {isLoading ? (
                        <div className="p-16 flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                            <p className="text-sm font-semibold text-gray-500">Loading purchase records...</p>
                        </div>
                    ) : filteredSorted.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-5xl block mb-3 opacity-60">📭</span>
                            <p className="text-base font-bold text-gray-800">No purchases found</p>
                            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters or record a new purchase</p>
                            <a
                                href="/dashboard/purchase"
                                className="mt-4 inline-block px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
                            >
                                ➕ Record Purchase
                            </a>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-gray-200 text-gray-700 text-xs font-extrabold uppercase tracking-wider">
                                        <th className="py-3.5 px-4 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => toggleSort('purchase_no')}>
                                            Invoice <SortIcon col="purchase_no" />
                                        </th>
                                        <th className="py-3.5 px-4 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => toggleSort('purchase_date')}>
                                            Date <SortIcon col="purchase_date" />
                                        </th>
                                        <th className="py-3.5 px-4 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => toggleSort('supplier_name')}>
                                            Supplier <SortIcon col="supplier_name" />
                                        </th>
                                        <th className="py-3.5 px-4 hidden lg:table-cell">Supp. Ref</th>
                                        <th className="py-3.5 px-4 text-right hidden md:table-cell">Sub Total</th>
                                        <th className="py-3.5 px-4 text-right hidden md:table-cell">VAT</th>
                                        <th className="py-3.5 px-4 text-right cursor-pointer hover:text-blue-600 transition-colors" onClick={() => toggleSort('grand_total')}>
                                            Total <SortIcon col="grand_total" />
                                        </th>
                                        <th className="py-3.5 px-4 text-center">Status</th>
                                        <th className="py-3.5 px-4 text-center">Payment</th>
                                        <th className="py-3.5 px-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                    {paginated.map((purchase) => {
                                        const isSelected = selectedPurchase?.purchase_id === purchase.purchase_id;
                                        return (
                                            <tr
                                                key={purchase.purchase_id}
                                                onClick={() => viewDetails(purchase)}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-blue-50/80 border-l-4 border-blue-600'
                                                        : 'hover:bg-blue-50/40'
                                                }`}
                                            >
                                                <td className="py-3.5 px-4 font-bold text-gray-900">
                                                    <span className="font-mono text-blue-700 bg-blue-100 px-2.5 py-1 rounded-lg text-xs font-extrabold">
                                                        {purchase.purchase_no}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 font-semibold text-gray-800">
                                                    {new Date(purchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="py-3.5 px-4 font-bold text-gray-900 truncate max-w-[200px]">
                                                    {purchase.supplier_name || <span className="text-gray-400 font-normal italic">Direct Vendor</span>}
                                                </td>
                                                <td className="py-3.5 px-4 hidden lg:table-cell">
                                                    {purchase.supplier_invoice ? (
                                                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-semibold">
                                                            {purchase.supplier_invoice}
                                                        </span>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="py-3.5 px-4 text-right hidden md:table-cell font-mono font-medium text-gray-600">
                                                    Ksh {(purchase.sub_total || 0).toLocaleString()}
                                                </td>
                                                <td className="py-3.5 px-4 text-right hidden md:table-cell font-mono font-medium text-gray-500">
                                                    Ksh {(purchase.vat || 0).toLocaleString()}
                                                </td>
                                                <td className="py-3.5 px-4 text-right font-black text-gray-900 font-mono text-base">
                                                    Ksh {(purchase.grand_total || 0).toLocaleString()}
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                                        purchase.status === 'Completed'
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            : purchase.status === 'Pending'
                                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                                                    }`}>
                                                        {purchase.status || 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                                        purchase.payment_status === 'Paid'
                                                            ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                                                            : 'bg-red-100 text-red-800 border border-red-200'
                                                    }`}>
                                                        {purchase.payment_status === 'Paid' ? 'Paid' : 'Unpaid'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => viewDetails(purchase)}
                                                            title="View Details"
                                                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm transition-colors"
                                                        >
                                                            👁️
                                                        </button>
                                                        {purchase.payment_status !== 'Paid' && (
                                                            <button
                                                                onClick={() => markAsPaid(purchase)}
                                                                disabled={markingPaid === purchase.purchase_id}
                                                                title="Mark as Paid"
                                                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                                                            >
                                                                {markingPaid === purchase.purchase_id ? '⏳' : '✅'}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => deletePurchase(purchase)}
                                                            disabled={deletingId === purchase.purchase_id}
                                                            title="Delete"
                                                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm transition-colors disabled:opacity-50"
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
                        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600 bg-gray-50/50">
                            <span>
                                Showing <b>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSorted.length)}</b> of <b>{filteredSorted.length}</b> records
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg font-bold text-xs disabled:opacity-40 hover:bg-gray-50"
                                >
                                    ‹ Prev
                                </button>
                                <span className="px-3 font-bold text-gray-800 text-xs">Page {currentPage} of {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg font-bold text-xs disabled:opacity-40 hover:bg-gray-50"
                                >
                                    Next ›
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── SLIDE-IN DETAIL PANEL ── */}
            {selectedPurchase && (
                <div className="w-[360px] flex-shrink-0 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-100px)] sticky top-4">
                    {/* Header */}
                    <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-black text-white">{selectedPurchase.purchase_no}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    selectedPurchase.payment_status === 'Paid' ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400 text-red-950'
                                }`}>
                                    {selectedPurchase.payment_status}
                                </span>
                            </div>
                            <p className="text-xs text-blue-100 mt-1">
                                {new Date(selectedPurchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                        </div>
                        <button
                            onClick={() => setSelectedPurchase(null)}
                            className="p-1.5 hover:bg-white/20 rounded-xl text-white text-sm"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                        {/* Supplier Box */}
                        <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">Supplier</span>
                            <p className="font-extrabold text-gray-900 text-base">{selectedPurchase.supplier_name || 'Direct / None'}</p>
                            {selectedPurchase.supplier_invoice && (
                                <p className="text-xs text-gray-600">
                                    Invoice Ref: <span className="font-mono font-bold text-gray-800">{selectedPurchase.supplier_invoice}</span>
                                </p>
                            )}
                        </div>

                        {/* Financials Breakdown */}
                        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                            <div className="flex justify-between text-gray-700">
                                <span>Sub Total:</span>
                                <span className="font-mono font-bold">Ksh {(selectedPurchase.sub_total || 0).toLocaleString()}</span>
                            </div>
                            {selectedPurchase.discount > 0 && (
                                <div className="flex justify-between text-orange-700">
                                    <span>Discount:</span>
                                    <span className="font-mono font-bold">- Ksh {selectedPurchase.discount.toLocaleString()}</span>
                                </div>
                            )}
                            {selectedPurchase.vat > 0 && (
                                <div className="flex justify-between text-blue-700">
                                    <span>VAT:</span>
                                    <span className="font-mono font-bold">+ Ksh {selectedPurchase.vat.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-emerald-200 font-black text-gray-900 text-base">
                                <span>Grand Total:</span>
                                <span className="text-emerald-700 font-mono text-xl">Ksh {(selectedPurchase.grand_total || 0).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="space-y-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                                Items Ordered ({purchaseItems.length})
                            </span>
                            {isLoadingItems ? (
                                <div className="p-4 text-center text-gray-400">Loading items...</div>
                            ) : purchaseItems.length === 0 ? (
                                <div className="p-3 text-center text-gray-400 bg-gray-50 rounded-xl">No line items recorded</div>
                            ) : (
                                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                                    {purchaseItems.map((item, idx) => (
                                        <div key={idx} className="p-2.5 flex items-center justify-between bg-white text-xs">
                                            <div className="pr-2 truncate">
                                                <p className="font-bold text-gray-900 text-sm truncate">{item.product_name}</p>
                                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                    {item.quantity} × Ksh {(item.rate || 0).toLocaleString()}
                                                </p>
                                            </div>
                                            <span className="font-mono font-black text-gray-900 text-sm flex-shrink-0">
                                                Ksh {(item.total_amount || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                        {selectedPurchase.payment_status !== 'Paid' && (
                            <button
                                onClick={() => markAsPaid(selectedPurchase)}
                                disabled={markingPaid === selectedPurchase.purchase_id}
                                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50"
                            >
                                Mark Paid
                            </button>
                        )}
                        <button
                            onClick={() => deletePurchase(selectedPurchase)}
                            disabled={deletingId === selectedPurchase.purchase_id}
                            className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-sm font-bold border border-red-200 transition-all"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
