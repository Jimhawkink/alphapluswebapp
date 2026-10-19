'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { generateCustomerBillHTML, printReceipt, loadCompanyInfo, createReceiptData, ReceiptData } from '@/lib/receiptPrinter';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SaleItem {
    item_id: number;
    sale_id: number;
    product_id?: number | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price?: number | null;
    subtotal: number;
    profit?: number | null;
    discount?: number | null;
    notes?: string | null;
}

interface Sale {
    sale_id: number;
    receipt_no: string;
    sale_date?: string | null;
    sale_time?: string | null;
    sale_datetime: string;
    shift_id?: number | null;
    shift_name?: string | null;
    shift_code?: string | null;
    waiter_id?: number | null;
    waiter_name?: string | null;
    table_id?: number | null;
    table_name?: string | null;
    room_name?: string | null;
    order_type?: string | null;
    kot_number?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    subtotal: number;
    discount?: number | null;
    discount_amount?: number | null;
    total_amount: number;
    total_cost?: number | null;
    profit?: number | null;
    payment_method: string;
    amount_paid?: number | null;
    change_amount?: number | null;
    mpesa_code?: string | null;
    mpesa_receipt?: string | null;
    status: string;
    notes?: string | null;
    created_by?: string | null;
    created_at?: string;
    sales_items?: SaleItem[];
}

type SortField = 'date' | 'receipt' | 'amount' | 'cost' | 'profit' | 'margin';
type SortOrder = 'asc' | 'desc';

export default function SalesPage() {
    // ─── State ─────────────────────────────────────────────────────────────────
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | '30days' | 'custom'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterPayment, setFilterPayment] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterStaff, setFilterStaff] = useState('All');
    const [filterMargin, setFilterMargin] = useState('All');
    const [filterOrderType, setFilterOrderType] = useState('All');

    // Display & Interaction
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
    const [expandedRowIds, setExpandedRowIds] = useState<Set<number>>(new Set());
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [isPrinting, setIsPrinting] = useState<number | null>(null);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // ─── Helper: Format Currency ───────────────────────────────────────────────
    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── Load Sales from Supabase ──────────────────────────────────────────────
    const loadSales = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('sales')
                .select(`
                    *,
                    sales_items (*)
                `)
                .order('sale_datetime', { ascending: false })
                .limit(500);

            // Apply date filters if not 'all'
            if (datePreset !== 'all' && dateFrom && dateTo) {
                query = query.gte('sale_date', dateFrom).lte('sale_date', dateTo);
            }

            const { data, error } = await query;
            if (error) {
                console.error('Supabase query error:', error);
                toast.error('Failed to load sales: ' + error.message);
                return;
            }

            setSales(data || []);
        } catch (err: any) {
            console.error('Error loading sales:', err);
            toast.error('Error loading sales from database');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [datePreset, dateFrom, dateTo]);

    // Handle Date Presets
    const handlePresetChange = (preset: 'all' | 'today' | 'yesterday' | 'week' | 'month' | '30days' | 'custom') => {
        setDatePreset(preset);
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        if (preset === 'all') {
            setDateFrom('');
            setDateTo('');
        } else if (preset === 'today') {
            setDateFrom(formatDate(today));
            setDateTo(formatDate(today));
        } else if (preset === 'yesterday') {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            setDateFrom(formatDate(y));
            setDateTo(formatDate(y));
        } else if (preset === 'week') {
            const w = new Date();
            w.setDate(w.getDate() - 7);
            setDateFrom(formatDate(w));
            setDateTo(formatDate(today));
        } else if (preset === 'month') {
            const m = new Date();
            m.setDate(1); // 1st of current month
            setDateFrom(formatDate(m));
            setDateTo(formatDate(today));
        } else if (preset === '30days') {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            setDateFrom(formatDate(d));
            setDateTo(formatDate(today));
        }
    };

    useEffect(() => {
        loadSales();
    }, [loadSales]);

    // ─── Financial Calculations Per Sale ───────────────────────────────────────
    const getSaleMetrics = useCallback((sale: Sale) => {
        const totalAmount = Number(sale.total_amount) || 0;
        let totalCost = Number(sale.total_cost) || 0;
        let profit = Number(sale.profit) || 0;

        // If total_cost is 0 or missing on sale row, aggregate from sales_items
        const items = sale.sales_items || [];
        let itemsCost = 0;
        let itemsProfit = 0;

        for (const itm of items) {
            const qty = Number(itm.quantity) || 1;
            const uPrice = Number(itm.unit_price) || 0;
            const cPrice = Number(itm.cost_price) || 0;
            const itmSubtotal = Number(itm.subtotal) || (qty * uPrice);
            const itmProfit = Number(itm.profit) || (itmSubtotal - (cPrice * qty));

            itemsCost += (cPrice * qty);
            itemsProfit += itmProfit;
        }

        if (totalCost === 0 && itemsCost > 0) {
            totalCost = itemsCost;
            profit = itemsProfit > 0 ? itemsProfit : (totalAmount - totalCost);
        } else if (profit === 0 && totalCost > 0) {
            profit = totalAmount - totalCost;
        } else if (profit === 0 && totalCost === 0) {
            profit = totalAmount; // Zero recorded cost
        }

        const marginPercent = totalAmount > 0 ? ((profit / totalAmount) * 100) : 0;

        return {
            totalAmount,
            totalCost,
            profit,
            marginPercent,
            itemCount: items.reduce((acc, itm) => acc + (Number(itm.quantity) || 1), 0),
        };
    }, []);

    // ─── Distinct Filter Options ───────────────────────────────────────────────
    const staffOptions = useMemo(() => {
        const set = new Set<string>();
        sales.forEach(s => {
            if (s.waiter_name) set.add(s.waiter_name);
            if (s.created_by && s.created_by !== s.waiter_name) set.add(s.created_by);
        });
        return Array.from(set).sort();
    }, [sales]);

    const orderTypeOptions = useMemo(() => {
        const set = new Set<string>();
        sales.forEach(s => {
            if (s.order_type) set.add(s.order_type);
        });
        return Array.from(set).sort();
    }, [sales]);

    // ─── Filter & Sort Logic ───────────────────────────────────────────────────
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchReceipt = (s.receipt_no || '').toLowerCase().includes(q);
                const matchCust = (s.customer_name || '').toLowerCase().includes(q);
                const matchTable = (s.table_name || '').toLowerCase().includes(q);
                const matchRoom = (s.room_name || '').toLowerCase().includes(q);
                const matchWaiter = (s.waiter_name || '').toLowerCase().includes(q);
                const matchCashier = (s.created_by || '').toLowerCase().includes(q);
                const matchMpesa = (s.mpesa_code || '').toLowerCase().includes(q);
                const matchPhone = (s.customer_phone || '').toLowerCase().includes(q);
                const matchItems = (s.sales_items || []).some(itm => (itm.product_name || '').toLowerCase().includes(q));

                if (!matchReceipt && !matchCust && !matchTable && !matchRoom && !matchWaiter && !matchCashier && !matchMpesa && !matchPhone && !matchItems) {
                    return false;
                }
            }

            // Payment Filter
            if (filterPayment !== 'All') {
                const pMethod = (s.payment_method || '').toLowerCase();
                const target = filterPayment.toLowerCase();
                if (target === 'mpesa' && !pMethod.includes('mpesa')) return false;
                if (target === 'cash' && !pMethod.includes('cash')) return false;
                if (target === 'credit' && !pMethod.includes('credit')) return false;
                if (target === 'pending' && !pMethod.includes('pending')) return false;
            }

            // Status Filter
            if (filterStatus !== 'All') {
                const st = (s.status || '').toLowerCase();
                if (filterStatus === 'Completed' && st !== 'completed' && st !== 'paid') return false;
                if (filterStatus === 'Pending' && st !== 'pending') return false;
                if (filterStatus === 'Voided' && st !== 'voided') return false;
            }

            // Staff Filter
            if (filterStaff !== 'All') {
                const staffMatch = s.waiter_name === filterStaff || s.created_by === filterStaff;
                if (!staffMatch) return false;
            }

            // Order Type Filter
            if (filterOrderType !== 'All') {
                if (s.order_type !== filterOrderType) return false;
            }

            // Profit Margin Filter
            if (filterMargin !== 'All') {
                const { marginPercent } = getSaleMetrics(s);
                if (filterMargin === 'high' && marginPercent < 50) return false;
                if (filterMargin === 'medium' && (marginPercent < 25 || marginPercent >= 50)) return false;
                if (filterMargin === 'low' && (marginPercent <= 0 || marginPercent >= 25)) return false;
                if (filterMargin === 'zero' && marginPercent > 0) return false;
            }

            return true;
        });
    }, [sales, searchQuery, filterPayment, filterStatus, filterStaff, filterOrderType, filterMargin, getSaleMetrics]);

    // Sorting
    const sortedSales = useMemo(() => {
        return [...filteredSales].sort((a, b) => {
            const metricsA = getSaleMetrics(a);
            const metricsB = getSaleMetrics(b);

            let valA: any = 0;
            let valB: any = 0;

            if (sortField === 'date') {
                valA = new Date(a.sale_datetime || a.created_at || '').getTime();
                valB = new Date(b.sale_datetime || b.created_at || '').getTime();
            } else if (sortField === 'receipt') {
                valA = a.receipt_no || '';
                valB = b.receipt_no || '';
            } else if (sortField === 'amount') {
                valA = metricsA.totalAmount;
                valB = metricsB.totalAmount;
            } else if (sortField === 'cost') {
                valA = metricsA.totalCost;
                valB = metricsB.totalCost;
            } else if (sortField === 'profit') {
                valA = metricsA.profit;
                valB = metricsB.profit;
            } else if (sortField === 'margin') {
                valA = metricsA.marginPercent;
                valB = metricsB.marginPercent;
            }

            if (sortOrder === 'asc') {
                return valA > valB ? 1 : valA < valB ? -1 : 0;
            } else {
                return valA < valB ? 1 : valA > valB ? -1 : 0;
            }
        });
    }, [filteredSales, sortField, sortOrder, getSaleMetrics]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // ─── KPI Aggregations ──────────────────────────────────────────────────────
    const stats = useMemo(() => {
        let grossRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let completedCount = 0;
        let mpesaTotal = 0;
        let mpesaCount = 0;
        let cashTotal = 0;
        let cashCount = 0;
        let pendingTotal = 0;
        let pendingCount = 0;

        filteredSales.forEach(s => {
            const { totalAmount, totalCost: c, profit: p } = getSaleMetrics(s);
            const isCompleted = s.status === 'Completed' || s.status === 'Paid';
            const isPending = s.status === 'Pending';
            const pMethod = (s.payment_method || '').toLowerCase();

            if (isCompleted) {
                grossRevenue += totalAmount;
                totalCost += c;
                totalProfit += p;
                completedCount++;

                if (pMethod.includes('mpesa')) {
                    mpesaTotal += totalAmount;
                    mpesaCount++;
                } else if (pMethod.includes('cash')) {
                    cashTotal += totalAmount;
                    cashCount++;
                }
            } else if (isPending) {
                pendingTotal += totalAmount;
                pendingCount++;
            }
        });

        const overallMargin = grossRevenue > 0 ? ((totalProfit / grossRevenue) * 100) : 0;
        const aov = completedCount > 0 ? (grossRevenue / completedCount) : 0;

        return {
            grossRevenue,
            totalCost,
            totalProfit,
            overallMargin,
            completedCount,
            mpesaTotal,
            mpesaCount,
            cashTotal,
            cashCount,
            pendingTotal,
            pendingCount,
            aov,
            totalRecords: filteredSales.length,
        };
    }, [filteredSales, getSaleMetrics]);

    // ─── Row Collapse / Expand Toggle ──────────────────────────────────────────
    const toggleRow = (saleId: number) => {
        setExpandedRowIds(prev => {
            const next = new Set(prev);
            if (next.has(saleId)) next.delete(saleId);
            else next.add(saleId);
            return next;
        });
    };

    const toggleAllRows = () => {
        if (expandedRowIds.size === filteredSales.length) {
            setExpandedRowIds(new Set());
        } else {
            setExpandedRowIds(new Set(filteredSales.map(s => s.sale_id)));
        }
    };

    // ─── Thermal Receipt Print Handler ────────────────────────────────────────
    const handlePrintReceipt = async (sale: Sale) => {
        setIsPrinting(sale.sale_id);
        try {
            const company = await loadCompanyInfo();
            const isPaid = sale.status === 'Completed' || sale.status === 'Paid';

            const receiptItems = (sale.sales_items || []).map(itm => ({
                name: itm.product_name,
                qty: Number(itm.quantity) || 1,
                price: Number(itm.unit_price) || 0,
                total: Number(itm.subtotal) || ((Number(itm.quantity) || 1) * (Number(itm.unit_price) || 0)),
                notes: itm.notes || undefined,
            }));

            const rData: ReceiptData = {
                invoiceNo: sale.receipt_no,
                date: sale.sale_date || (sale.sale_datetime ? sale.sale_datetime.split('T')[0] : new Date().toISOString().split('T')[0]),
                time: sale.sale_time || (sale.sale_datetime ? sale.sale_datetime.split('T')[1]?.substring(0, 5) : '00:00'),
                cashier: sale.created_by || sale.waiter_name || 'Cashier',
                items: receiptItems,
                subtotal: Number(sale.subtotal) || Number(sale.total_amount) || 0,
                discount: Number(sale.discount || sale.discount_amount || 0),
                tax: 0,
                total: Number(sale.total_amount) || 0,
                paymentMethod: sale.payment_method || 'Cash',
                amountPaid: Number(sale.amount_paid) || Number(sale.total_amount) || 0,
                change: Number(sale.change_amount) || 0,
                customerName: sale.customer_name || 'Valued Guest',
                mpesaReceipt: sale.mpesa_code || sale.mpesa_receipt || undefined,
                tableNo: sale.table_name || sale.room_name || undefined,
                orderNotes: sale.notes || undefined,
                shiftCode: sale.shift_code || undefined,
                isPaid: isPaid,
                qrCodeData: `https://alphapluswebapp.vercel.app/pay/${sale.receipt_no}`,
            };

            const html = await generateCustomerBillHTML(rData, company, isPaid);
            printReceipt(html);
            toast.success(`Receipt ${sale.receipt_no} sent to printer!`);
        } catch (err) {
            console.error('Error printing receipt:', err);
            toast.error('Failed to print thermal receipt');
        } finally {
            setIsPrinting(null);
        }
    };

    // ─── Copy Receipt No to Clipboard ─────────────────────────────────────────
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`Copied "${text}" to clipboard!`, { duration: 1500 });
    };

    // ─── Export CSV ───────────────────────────────────────────────────────────
    const exportCSV = () => {
        if (sortedSales.length === 0) {
            toast.error('No sales data to export');
            return;
        }

        const headers = ['Receipt No', 'Date', 'Time', 'Customer', 'Table/Room', 'Waiter', 'Payment Method', 'Mpesa Code', 'Total Amount', 'Total Cost', 'Gross Profit', 'Margin %', 'Status'];
        const rows = sortedSales.map(s => {
            const m = getSaleMetrics(s);
            return [
                s.receipt_no,
                s.sale_date || s.sale_datetime?.split('T')[0] || '',
                s.sale_time || s.sale_datetime?.split('T')[1]?.substring(0, 5) || '',
                `"${s.customer_name || 'Walk-in'}"`,
                `"${s.table_name || s.room_name || '-'}"`,
                `"${s.waiter_name || s.created_by || ''}"`,
                `"${s.payment_method || ''}"`,
                `"${s.mpesa_code || ''}"`,
                m.totalAmount,
                m.totalCost,
                m.profit,
                m.marginPercent.toFixed(1) + '%',
                s.status,
            ].join(',');
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Sales_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Sales report exported to CSV!');
    };

    return (
        <div className="space-y-6 pb-12 animate-rise">

            {/* ── TOP HEADER & LIVE CONTROLS ───────────────────────────────────── */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <span className="text-xl">📊</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                Sales & Profit Master Ledger
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    LIVE DB
                                </span>
                            </h1>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                                Complete real-time audit ledger of receipts, M-Pesa codes, itemized COGS & gross margins
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* View Switcher */}
                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm flex items-center gap-1">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <span>📊</span> Datagrid
                        </button>
                        <button
                            onClick={() => setViewMode('cards')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'cards' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <span>🎴</span> Cards
                        </button>
                    </div>

                    {/* Export CSV */}
                    <button
                        onClick={exportCSV}
                        className="px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 shadow-sm transition-all flex items-center gap-1.5"
                    >
                        <span>📥</span> Export CSV
                    </button>

                    {/* Refresh Button */}
                    <button
                        onClick={() => { setRefreshing(true); loadSales(); }}
                        disabled={refreshing}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
                        {refreshing ? 'Syncing...' : 'Live Sync'}
                    </button>
                </div>
            </div>

            {/* ── 7 SUPER BEAUTIFUL HIGH-CONTRAST KPI CARDS ─────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {/* 1. Gross Revenue */}
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">💰 Gross Revenue</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.grossRevenue)}</p>
                    <p className="text-[10px] text-emerald-100/90 mt-1 font-medium">
                        {stats.completedCount} settled sales
                    </p>
                </div>

                {/* 2. Gross Profit */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">📈 Gross Profit</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.totalProfit)}</p>
                    <p className="text-[10px] text-indigo-100/90 mt-1 font-bold">
                        Margin: {stats.overallMargin.toFixed(1)}%
                    </p>
                </div>

                {/* 3. Total COGS */}
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-100">📦 Total Cost (COGS)</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.totalCost)}</p>
                    <p className="text-[10px] text-amber-100/90 mt-1 font-medium">
                        Raw food & drink cost
                    </p>
                </div>

                {/* 4. M-Pesa Collections */}
                <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 to-emerald-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-teal-100">📱 M-Pesa Total</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.mpesaTotal)}</p>
                    <p className="text-[10px] text-teal-100/90 mt-1 font-medium">
                        {stats.mpesaCount} txns • {stats.grossRevenue > 0 ? ((stats.mpesaTotal / stats.grossRevenue) * 100).toFixed(0) : 0}% of rev
                    </p>
                </div>

                {/* 5. Cash Collections */}
                <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-sky-600 to-blue-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">💵 Cash at Till</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.cashTotal)}</p>
                    <p className="text-[10px] text-blue-100/90 mt-1 font-medium">
                        {stats.cashCount} txns • {stats.grossRevenue > 0 ? ((stats.cashTotal / stats.grossRevenue) * 100).toFixed(0) : 0}% of rev
                    </p>
                </div>

                {/* 6. Pending / Open */}
                <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-violet-700 to-purple-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-100">⏳ Pending Bills</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.pendingTotal)}</p>
                    <p className="text-[10px] text-purple-100/90 mt-1 font-medium">
                        {stats.pendingCount} open orders
                    </p>
                </div>

                {/* 7. Average Basket */}
                <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 via-pink-600 to-rose-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-100">🎯 Avg Basket (AOV)</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(stats.aov)}</p>
                    <p className="text-[10px] text-rose-100/90 mt-1 font-medium">
                        Avg ticket value
                    </p>
                </div>
            </div>

            {/* ── MASSIVE MULTI-FILTER CONTROL PANEL ───────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-4 space-y-3.5">
                {/* Row 1: Date Range Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pb-3 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Period:</span>
                    {[
                        { id: 'all', label: 'All Records (Full Ledger)' },
                        { id: 'today', label: 'Today' },
                        { id: 'yesterday', label: 'Yesterday' },
                        { id: 'week', label: 'Last 7 Days' },
                        { id: 'month', label: 'This Month' },
                        { id: '30days', label: 'Last 30 Days' },
                        { id: 'custom', label: 'Custom Range 📅' },
                    ].map(p => (
                        <button
                            key={p.id}
                            onClick={() => handlePresetChange(p.id as any)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                datePreset === p.id
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}

                    {/* Custom Date Pickers */}
                    {datePreset === 'custom' && (
                        <div className="flex items-center gap-2 ml-auto">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg outline-none focus:border-indigo-500 font-medium"
                            />
                            <span className="text-xs text-gray-400 font-bold">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg outline-none focus:border-indigo-500 font-medium"
                            />
                        </div>
                    )}
                </div>

                {/* Row 2: Deep Dropdown Filters & Search */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {/* Search */}
                    <div className="lg:col-span-2 relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search receipt, customer, table, waiter, m-pesa..."
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-medium"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Payment Mode */}
                    <div>
                        <select
                            value={filterPayment}
                            onChange={e => setFilterPayment(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Payment Modes</option>
                            <option value="Mpesa">📱 M-Pesa Only</option>
                            <option value="Cash">💵 Cash Only</option>
                            <option value="Credit">💳 Credit / Room Bill</option>
                            <option value="Pending">⏳ Pending Unsettled</option>
                        </select>
                    </div>

                    {/* Status */}
                    <div>
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Statuses</option>
                            <option value="Completed">✓ Completed / Paid</option>
                            <option value="Pending">⏳ Pending</option>
                            <option value="Voided">❌ Voided</option>
                        </select>
                    </div>

                    {/* Waiter / Cashier */}
                    <div>
                        <select
                            value={filterStaff}
                            onChange={e => setFilterStaff(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Staff / Waiters</option>
                            {staffOptions.map(st => (
                                <option key={st} value={st}>👤 {st}</option>
                            ))}
                        </select>
                    </div>

                    {/* Profitability Margin */}
                    <div>
                        <select
                            value={filterMargin}
                            onChange={e => setFilterMargin(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Profit Margins</option>
                            <option value="high">🟢 High Margin (≥ 50%)</option>
                            <option value="medium">🟡 Medium Margin (25-49%)</option>
                            <option value="low">🔴 Low Margin (&lt; 25%)</option>
                            <option value="zero">⚪ Zero / At Cost</option>
                        </select>
                    </div>
                </div>

                {/* Bottom Row: Active Filter Summary & Row Expand Toggle */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-700">
                            Showing <span className="text-indigo-600 font-black">{filteredSales.length}</span> of {sales.length} records
                        </span>
                        {(searchQuery || filterPayment !== 'All' || filterStatus !== 'All' || filterStaff !== 'All' || filterMargin !== 'All' || datePreset !== 'all') && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterPayment('All');
                                    setFilterStatus('All');
                                    setFilterStaff('All');
                                    setFilterMargin('All');
                                    handlePresetChange('all');
                                }}
                                className="text-indigo-600 hover:text-indigo-800 font-bold underline ml-2"
                            >
                                Reset All Filters
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {viewMode === 'table' && (
                            <button
                                onClick={toggleAllRows}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1"
                            >
                                {expandedRowIds.size === filteredSales.length && filteredSales.length > 0 ? (
                                    <><span>▲</span> Collapse All Rows</>
                                ) : (
                                    <><span>▼</span> Expand All Rows (Show Items)</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── SUPER PREMIUM DATAGRID / TABLE VIEW ───────────────────────────── */}
            {viewMode === 'table' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                            <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
                            <p className="text-sm font-semibold text-gray-600">Loading master sales ledger from database...</p>
                            <p className="text-xs text-gray-400 mt-1">Connecting to hotel sales & items schema</p>
                        </div>
                    ) : sortedSales.length === 0 ? (
                        <div className="text-center py-20 px-4">
                            <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto text-2xl mb-3">
                                📭
                            </div>
                            <h3 className="text-base font-bold text-gray-800">No Sales Records Found</h3>
                            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                                No sales matching your current filters. Try selecting <strong>"All Records"</strong> above or clearing the search query.
                            </p>
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterPayment('All');
                                    setFilterStatus('All');
                                    handlePresetChange('all');
                                }}
                                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow hover:bg-indigo-700"
                            >
                                View All Database Records
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-white">
                                        <th className="py-3.5 px-3 w-10 text-center text-white font-black">Items</th>
                                        <th onClick={() => handleSort('receipt')} className="py-3.5 px-3 cursor-pointer hover:text-indigo-300 select-none text-white font-black">
                                            Receipt No {sortField === 'receipt' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('date')} className="py-3.5 px-3 cursor-pointer hover:text-indigo-300 select-none text-white font-black">
                                            Date & Time {sortField === 'date' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="py-3.5 px-3 text-white font-black">Customer / Table</th>
                                        <th className="py-3.5 px-3 text-white font-black">Staff / Waiter</th>
                                        <th className="py-3.5 px-3 text-white font-black">Payment & Mode</th>
                                        <th onClick={() => handleSort('amount')} className="py-3.5 px-3 text-right cursor-pointer hover:text-indigo-300 select-none text-white font-black">
                                            Gross Sale {sortField === 'amount' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('cost')} className="py-3.5 px-3 text-right cursor-pointer hover:text-indigo-300 select-none text-white font-black">
                                            Cost (COGS) {sortField === 'cost' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('profit')} className="py-3.5 px-3 text-right cursor-pointer hover:text-indigo-300 select-none text-white font-black">
                                            Profit {sortField === 'profit' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('margin')} className="py-3.5 px-3 text-center cursor-pointer hover:text-indigo-300 select-none text-white font-black">
                                            Margin % {sortField === 'margin' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="py-3.5 px-3 text-center text-white font-black">Status</th>
                                        <th className="py-3.5 px-3 text-center text-white font-black">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-xs">
                                    {sortedSales.map((sale) => {
                                        const metrics = getSaleMetrics(sale);
                                        const isExpanded = expandedRowIds.has(sale.sale_id);
                                        const isCompleted = sale.status === 'Completed' || sale.status === 'Paid';
                                        const isPending = sale.status === 'Pending';
                                        const pMethod = (sale.payment_method || '').toLowerCase();
                                        const isMpesa = pMethod.includes('mpesa');

                                        return (
                                            <div key={sale.sale_id} style={{ display: 'contents' }}>
                                                {/* Main Sale Row */}
                                                <tr className={`hover:bg-indigo-50/30 transition-colors ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                                                    {/* Row Expand Toggle */}
                                                    <td className="py-3.5 px-3 text-center">
                                                        <button
                                                            onClick={() => toggleRow(sale.sale_id)}
                                                            title={isExpanded ? 'Hide items' : 'View individual items'}
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs transition-all ${
                                                                isExpanded
                                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                                            }`}
                                                        >
                                                            {isExpanded ? '▲' : `▶`}
                                                        </button>
                                                    </td>

                                                    {/* Receipt No */}
                                                    <td className="py-3.5 px-3">
                                                        <div className="flex items-center gap-1.5">
                                                            <span
                                                                onClick={() => copyToClipboard(sale.receipt_no)}
                                                                className="font-mono font-black text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-lg hover:bg-indigo-100 cursor-pointer transition-colors border border-indigo-200"
                                                                title="Click to copy receipt number"
                                                            >
                                                                {sale.receipt_no}
                                                            </span>
                                                            {sale.kot_number && (
                                                                <span className="text-[10px] text-gray-400 font-mono">
                                                                    ({sale.kot_number})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Date & Time */}
                                                    <td className="py-3.5 px-3 text-gray-600">
                                                        <p className="font-bold text-gray-900">
                                                            {sale.sale_date || (sale.sale_datetime ? new Date(sale.sale_datetime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 font-mono">
                                                            {sale.sale_time || (sale.sale_datetime ? new Date(sale.sale_datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')}
                                                        </p>
                                                    </td>

                                                    {/* Customer & Table */}
                                                    <td className="py-3.5 px-3">
                                                        <p className="font-bold text-gray-800">{sale.customer_name || 'Walk-in Guest'}</p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            {sale.table_name && (
                                                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                                                    🍽️ {sale.table_name}
                                                                </span>
                                                            )}
                                                            {sale.room_name && (
                                                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                                                    🚪 {sale.room_name}
                                                                </span>
                                                            )}
                                                            {sale.order_type && (
                                                                <span className="text-[10px] text-gray-400 font-medium">
                                                                    • {sale.order_type}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Staff / Waiter */}
                                                    <td className="py-3.5 px-3">
                                                        <p className="font-bold text-gray-800">{sale.waiter_name || sale.created_by || '—'}</p>
                                                        {sale.shift_name && (
                                                            <span className="text-[10px] text-gray-400 font-medium">
                                                                Shift: {sale.shift_name}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Payment & Mode (Beneath M-Pesa Code as requested!) */}
                                                    <td className="py-3.5 px-3">
                                                        {isMpesa ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                                                                        M-PESA
                                                                    </span>
                                                                    {sale.mpesa_code && (
                                                                        <span
                                                                            onClick={() => copyToClipboard(sale.mpesa_code!)}
                                                                            className="font-mono text-[11px] font-extrabold text-gray-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 cursor-pointer hover:bg-emerald-100"
                                                                            title="Click to copy M-Pesa code"
                                                                        >
                                                                            {sale.mpesa_code}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {/* Beneath Mpesa Code: Payment Mode */}
                                                                <span className="text-[10px] font-bold text-emerald-700/90 tracking-wide pl-0.5">
                                                                    Mode: {sale.mpesa_code ? 'STK Push (Express)' : 'Mobile Money'}
                                                                </span>
                                                            </div>
                                                        ) : pMethod.includes('cash') ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                                                    💵 CASH
                                                                </span>
                                                                <span className="text-[10px] font-bold text-amber-800/80 pl-0.5">
                                                                    Mode: Counter / Till
                                                                </span>
                                                            </div>
                                                        ) : pMethod.includes('credit') ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                                                    💳 CREDIT
                                                                </span>
                                                                <span className="text-[10px] font-bold text-rose-800/80 pl-0.5">
                                                                    Mode: Room Bill / Folio
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
                                                                    ⏳ {sale.payment_method || 'PENDING'}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-purple-800/80 pl-0.5">
                                                                    Mode: Unsettled Open Bill
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Gross Sale */}
                                                    <td className="py-3.5 px-3 text-right">
                                                        <span className="font-black text-gray-900 text-sm">
                                                            {fmt(metrics.totalAmount)}
                                                        </span>
                                                    </td>

                                                    {/* Cost (COGS) */}
                                                    <td className="py-3.5 px-3 text-right text-gray-500 font-medium">
                                                        {metrics.totalCost > 0 ? fmt(metrics.totalCost) : <span className="text-gray-300">—</span>}
                                                    </td>

                                                    {/* Profit (Green) */}
                                                    <td className="py-3.5 px-3 text-right">
                                                        <span className={`font-black ${metrics.profit > 0 ? 'text-emerald-600' : metrics.profit < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                                            {metrics.profit > 0 ? `+${fmt(metrics.profit)}` : fmt(metrics.profit)}
                                                        </span>
                                                    </td>

                                                    {/* Margin % */}
                                                    <td className="py-3.5 px-3 text-center">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full font-black text-[10px] ${
                                                            metrics.marginPercent >= 50
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                                : metrics.marginPercent >= 25
                                                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                                : metrics.marginPercent > 0
                                                                ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                                                : 'bg-gray-100 text-gray-600'
                                                        }`}>
                                                            {metrics.marginPercent.toFixed(1)}%
                                                        </span>
                                                    </td>

                                                    {/* Status */}
                                                    <td className="py-3.5 px-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                                            isCompleted
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                                : isPending
                                                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                                : 'bg-red-100 text-red-800 border border-red-300'
                                                        }`}>
                                                            {isCompleted ? '✓ Paid' : isPending ? '⏳ Pending' : '✕ Voided'}
                                                        </span>
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-3.5 px-3 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button
                                                                onClick={() => setSelectedSale(sale)}
                                                                className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 flex items-center justify-center transition-colors"
                                                                title="Inspect Bill Breakdown"
                                                            >
                                                                👁️
                                                            </button>
                                                            <button
                                                                onClick={() => handlePrintReceipt(sale)}
                                                                disabled={isPrinting === sale.sale_id}
                                                                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors disabled:opacity-50"
                                                                title="Re-Print Thermal Receipt"
                                                            >
                                                                {isPrinting === sale.sale_id ? '⏳' : '🖨️'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* ── COLLAPSIBLE ROW: INDIVIDUAL ITEMS IN RECEIPT ───────────────── */}
                                                {isExpanded && (
                                                    <tr className="bg-indigo-50/10">
                                                        <td colSpan={12} className="p-0 border-b border-indigo-100">
                                                            <div className="p-4 bg-gradient-to-r from-gray-50 via-indigo-50/20 to-purple-50/20 border-y border-indigo-100/80">
                                                                <div className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden">
                                                                    {/* Itemized Table Header */}
                                                                    <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-700 text-white flex items-center justify-between text-xs font-bold">
                                                                        <div className="flex items-center gap-2">
                                                                            <span>🍽️</span>
                                                                            <span>Itemized Receipt Dishes • {sale.receipt_no}</span>
                                                                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">
                                                                                {(sale.sales_items || []).length} items
                                                                            </span>
                                                                        </div>
                                                                        <span className="text-indigo-100 text-[11px]">
                                                                            Individual Item Cost & Profit Breakdown
                                                                        </span>
                                                                    </div>

                                                                    {/* Items Table */}
                                                                    {(sale.sales_items || []).length === 0 ? (
                                                                        <div className="p-6 text-center text-gray-400 text-xs">
                                                                            No item breakdown recorded for this legacy transaction.
                                                                        </div>
                                                                    ) : (
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-left text-xs">
                                                                                <thead>
                                                                                    <tr className="bg-slate-800 text-[10px] font-bold text-slate-200 uppercase tracking-wider border-b border-slate-700">
                                                                                        <th className="py-2.5 px-3 w-8 text-white">#</th>
                                                                                        <th className="py-2.5 px-3 text-white">Item / Product</th>
                                                                                        <th className="py-2.5 px-3 text-center w-16 text-white">Qty</th>
                                                                                        <th className="py-2.5 px-3 text-right text-white">Unit Price</th>
                                                                                        <th className="py-2.5 px-3 text-right text-white">Unit Cost</th>
                                                                                        <th className="py-2.5 px-3 text-right text-white">Subtotal</th>
                                                                                        <th className="py-2.5 px-3 text-right text-white">Total Cost</th>
                                                                                        <th className="py-2.5 px-3 text-right text-white">Item Profit</th>
                                                                                        <th className="py-2.5 px-3 text-center text-white">Margin %</th>
                                                                                        <th className="py-2.5 px-3 text-white">Notes</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-gray-100">
                                                                                    {(sale.sales_items || []).map((itm, idx) => {
                                                                                        const qty = Number(itm.quantity) || 1;
                                                                                        const uPrice = Number(itm.unit_price) || 0;
                                                                                        const cPrice = Number(itm.cost_price) || 0;
                                                                                        const subtotal = Number(itm.subtotal) || (qty * uPrice);
                                                                                        const totalCost = cPrice * qty;
                                                                                        const itmProfit = Number(itm.profit) || (subtotal - totalCost);
                                                                                        const itmMargin = subtotal > 0 ? ((itmProfit / subtotal) * 100) : 0;

                                                                                        return (
                                                                                            <tr key={itm.item_id || idx} className="hover:bg-gray-50/80 transition-colors">
                                                                                                <td className="py-2 px-3 text-gray-400 font-mono text-[10px]">{idx + 1}</td>
                                                                                                <td className="py-2 px-3 font-bold text-gray-900">
                                                                                                    {itm.product_name}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-center font-bold text-gray-800">
                                                                                                    {qty}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-right font-medium text-gray-700">
                                                                                                    {fmtDec(uPrice)}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-right text-gray-500">
                                                                                                    {cPrice > 0 ? fmtDec(cPrice) : <span className="text-gray-300">—</span>}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-right font-bold text-gray-900">
                                                                                                    {fmtDec(subtotal)}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-right text-gray-500">
                                                                                                    {totalCost > 0 ? fmtDec(totalCost) : <span className="text-gray-300">—</span>}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-right font-black text-emerald-600">
                                                                                                    +{fmtDec(itmProfit)}
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-center">
                                                                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                                                        itmMargin >= 50
                                                                                                            ? 'bg-emerald-100 text-emerald-800'
                                                                                                            : itmMargin >= 25
                                                                                                            ? 'bg-amber-100 text-amber-800'
                                                                                                            : 'bg-gray-100 text-gray-600'
                                                                                                    }`}>
                                                                                                        {itmMargin.toFixed(0)}%
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td className="py-2 px-3 text-gray-400 text-[10px]">
                                                                                                    {itm.notes || '—'}
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                                {/* Collapsible Row Footer Summary */}
                                                                                <tfoot className="bg-gray-50 font-bold border-t border-gray-200 text-xs">
                                                                                    <tr>
                                                                                        <td colSpan={2} className="py-2.5 px-3 text-gray-700">
                                                                                            Receipt Total Summary:
                                                                                        </td>
                                                                                        <td className="py-2.5 px-3 text-center text-gray-900">
                                                                                            {metrics.itemCount}
                                                                                        </td>
                                                                                        <td colSpan={2} className="py-2.5 px-3" />
                                                                                        <td className="py-2.5 px-3 text-right text-indigo-700 font-black">
                                                                                            {fmtDec(metrics.totalAmount)}
                                                                                        </td>
                                                                                        <td className="py-2.5 px-3 text-right text-gray-600">
                                                                                            {fmtDec(metrics.totalCost)}
                                                                                        </td>
                                                                                        <td className="py-2.5 px-3 text-right text-emerald-600 font-black">
                                                                                            +{fmtDec(metrics.profit)}
                                                                                        </td>
                                                                                        <td className="py-2.5 px-3 text-center font-black text-indigo-600">
                                                                                            {metrics.marginPercent.toFixed(1)}%
                                                                                        </td>
                                                                                        <td className="py-2.5 px-3" />
                                                                                    </tr>
                                                                                </tfoot>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </div>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── BOARDING-PASS CARDS VIEW ─────────────────────────────────────── */}
            {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {loading ? (
                        <div className="col-span-full py-20 text-center text-gray-400">
                            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                            Loading cards...
                        </div>
                    ) : sortedSales.length === 0 ? (
                        <div className="col-span-full py-16 text-center text-gray-400">
                            No sales records match your filters.
                        </div>
                    ) : (
                        sortedSales.map(sale => {
                            const metrics = getSaleMetrics(sale);
                            const isCompleted = sale.status === 'Completed' || sale.status === 'Paid';
                            const isPending = sale.status === 'Pending';
                            const pMethod = (sale.payment_method || '').toLowerCase();
                            const isMpesa = pMethod.includes('mpesa');
                            const isExpanded = expandedRowIds.has(sale.sale_id);

                            return (
                                <div
                                    key={sale.sale_id}
                                    className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
                                >
                                    {/* Card Header Gradient */}
                                    <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-4 py-3 text-white flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span
                                                onClick={() => copyToClipboard(sale.receipt_no)}
                                                className="font-mono font-black text-sm bg-white/20 px-2 py-0.5 rounded cursor-pointer hover:bg-white/30 transition-colors"
                                                title="Copy receipt number"
                                            >
                                                {sale.receipt_no}
                                            </span>
                                            {sale.table_name && (
                                                <span className="text-xs bg-white/10 px-2 py-0.5 rounded">
                                                    🍽️ {sale.table_name}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                            isCompleted ? 'bg-emerald-400 text-emerald-950' : isPending ? 'bg-amber-300 text-amber-950' : 'bg-red-400 text-red-950'
                                        }`}>
                                            {isCompleted ? '✓ PAID' : isPending ? '⏳ PENDING' : '✕ VOIDED'}
                                        </span>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-4 flex-1 space-y-3">
                                        {/* Amount & Profit Strip */}
                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-gray-400">Gross Sale</p>
                                                <p className="text-xl font-black text-gray-900 tracking-tight">{fmt(metrics.totalAmount)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] uppercase font-bold text-gray-400">Net Profit</p>
                                                <p className="text-base font-black text-emerald-600">
                                                    +{fmt(metrics.profit)}
                                                    <span className="ml-1 text-[11px] font-bold text-indigo-600">({metrics.marginPercent.toFixed(0)}%)</span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* Customer & Staff */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <p className="text-gray-400 text-[10px]">Customer</p>
                                                <p className="font-bold text-gray-800 truncate">{sale.customer_name || 'Walk-in Guest'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-[10px]">Served By</p>
                                                <p className="font-bold text-gray-800 truncate">{sale.waiter_name || sale.created_by || '—'}</p>
                                            </div>
                                        </div>

                                        {/* Payment Mode with M-Pesa Code */}
                                        <div className="bg-gray-50 rounded-xl p-2.5 text-xs">
                                            {isMpesa ? (
                                                <div>
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                                                            <span>📱</span> M-PESA
                                                        </span>
                                                        {sale.mpesa_code && (
                                                            <span
                                                                onClick={() => copyToClipboard(sale.mpesa_code!)}
                                                                className="font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded cursor-pointer"
                                                            >
                                                                {sale.mpesa_code}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 font-medium">
                                                        Mode: {sale.mpesa_code ? 'STK Push (Express)' : 'Mobile Money'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-gray-700">
                                                        {pMethod.includes('cash') ? '💵 CASH' : pMethod.includes('credit') ? '💳 CREDIT' : '⏳ PENDING'}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        {pMethod.includes('cash') ? 'Counter / Till' : 'Room Folio'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Itemized List Preview / Collapsible */}
                                        <div>
                                            <button
                                                onClick={() => toggleRow(sale.sale_id)}
                                                className="w-full py-1.5 px-2 bg-indigo-50/60 hover:bg-indigo-100/80 rounded-lg text-indigo-700 text-xs font-bold transition-colors flex items-center justify-between"
                                            >
                                                <span>{(sale.sales_items || []).length} Items in Receipt</span>
                                                <span>{isExpanded ? '▲ Hide' : '▼ Expand'}</span>
                                            </button>

                                            {isExpanded && (
                                                <div className="mt-2 space-y-1.5 bg-gray-50 rounded-xl p-2.5 max-h-48 overflow-y-auto custom-scrollbar border border-gray-100">
                                                    {(sale.sales_items || []).map((itm, i) => (
                                                        <div key={i} className="flex justify-between items-center text-xs pb-1 border-b border-gray-100/80 last:border-0 last:pb-0">
                                                            <div className="truncate pr-2">
                                                                <p className="font-bold text-gray-800 truncate">{itm.product_name}</p>
                                                                <p className="text-[10px] text-gray-400">{itm.quantity} × {fmt(itm.unit_price)}</p>
                                                            </div>
                                                            <div className="text-right flex-shrink-0">
                                                                <p className="font-bold text-gray-900">{fmt(itm.subtotal)}</p>
                                                                <p className="text-[10px] font-bold text-emerald-600">+{fmt(itm.profit)}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Footer Actions */}
                                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
                                        <button
                                            onClick={() => setSelectedSale(sale)}
                                            className="flex-1 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl text-xs font-bold transition-colors"
                                        >
                                            Inspect Drawer
                                        </button>
                                        <button
                                            onClick={() => handlePrintReceipt(sale)}
                                            disabled={isPrinting === sale.sale_id}
                                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {isPrinting === sale.sale_id ? '⏳' : '🖨️'} Print
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── INSPECTION SIDE DRAWER / MODAL ──────────────────────────────── */}
            {selectedSale && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-end animate-fade-in"
                    onClick={() => setSelectedSale(null)}
                >
                    <div
                        className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drawer Header */}
                        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-800 p-5 text-white flex items-center justify-between">
                            <div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-200">
                                    Receipt Inspection
                                </span>
                                <h2 className="text-xl font-black font-mono mt-0.5">{selectedSale.receipt_no}</h2>
                                <p className="text-xs text-indigo-100 mt-0.5">
                                    {selectedSale.sale_date || selectedSale.sale_datetime?.split('T')[0]} • {selectedSale.sale_time || selectedSale.sale_datetime?.split('T')[1]?.substring(0, 5)}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedSale(null)}
                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Drawer Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                            {/* Financial Summary Strip */}
                            {(() => {
                                const m = getSaleMetrics(selectedSale);
                                return (
                                    <div className="grid grid-cols-3 gap-2 bg-indigo-50/60 rounded-2xl p-3 border border-indigo-100">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">Gross Sale</p>
                                            <p className="text-base font-black text-gray-900 mt-0.5">{fmt(m.totalAmount)}</p>
                                        </div>
                                        <div className="text-center border-x border-indigo-100">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">Total Cost</p>
                                            <p className="text-base font-black text-amber-700 mt-0.5">{fmt(m.totalCost)}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">Gross Profit</p>
                                            <p className="text-base font-black text-emerald-600 mt-0.5">
                                                +{fmt(m.profit)}
                                                <span className="block text-[9px] text-indigo-600 font-bold">({m.marginPercent.toFixed(0)}% margin)</span>
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Metadata Details */}
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Customer:</span>
                                    <span className="font-bold text-gray-800">{selectedSale.customer_name || 'Walk-in Guest'}</span>
                                </div>
                                {selectedSale.customer_phone && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Phone:</span>
                                        <span className="font-mono font-bold text-gray-800">{selectedSale.customer_phone}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Table / Location:</span>
                                    <span className="font-bold text-gray-800">{selectedSale.table_name || selectedSale.room_name || 'Standard Table'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Served By:</span>
                                    <span className="font-bold text-gray-800">{selectedSale.waiter_name || selectedSale.created_by || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Payment Method:</span>
                                    <span className="font-bold text-indigo-700">{selectedSale.payment_method}</span>
                                </div>
                                {selectedSale.mpesa_code && (
                                    <div className="flex justify-between items-center bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                                        <span className="font-bold text-emerald-800">M-Pesa Code:</span>
                                        <span className="font-mono font-black text-emerald-900 bg-white px-2 py-0.5 rounded shadow-xs">
                                            {selectedSale.mpesa_code}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Payment Mode:</span>
                                    <span className="font-bold text-gray-700">
                                        {selectedSale.payment_method?.toLowerCase().includes('mpesa') ? 'M-Pesa STK Push' : selectedSale.payment_method}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Status:</span>
                                    <span className="font-bold text-emerald-700">✓ {selectedSale.status}</span>
                                </div>
                            </div>

                            {/* Itemized Breakdown Table */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-gray-600 tracking-wider mb-2 flex items-center justify-between">
                                    <span>Itemized Dishes ({(selectedSale.sales_items || []).length})</span>
                                    <span className="text-[10px] text-gray-400 font-normal">Costs & Margins per item</span>
                                </h4>
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-800 border-b border-slate-700 text-[10px] font-bold text-white uppercase">
                                            <tr>
                                                <th className="py-2.5 px-3 text-white">Item</th>
                                                <th className="py-2.5 px-2 text-center text-white">Qty</th>
                                                <th className="py-2.5 px-3 text-right text-white">Price</th>
                                                <th className="py-2.5 px-3 text-right text-white">Profit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {(selectedSale.sales_items || []).map((itm, i) => {
                                                const qty = Number(itm.quantity) || 1;
                                                const uPrice = Number(itm.unit_price) || 0;
                                                const cPrice = Number(itm.cost_price) || 0;
                                                const subtotal = Number(itm.subtotal) || (qty * uPrice);
                                                const itmProfit = Number(itm.profit) || (subtotal - (cPrice * qty));

                                                return (
                                                    <tr key={i} className="hover:bg-gray-50">
                                                        <td className="py-2 px-3">
                                                            <p className="font-bold text-gray-800">{itm.product_name}</p>
                                                            {cPrice > 0 && (
                                                                <p className="text-[10px] text-gray-400">Cost: {fmt(cPrice)} / unit</p>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-2 text-center font-bold text-gray-700">{qty}</td>
                                                        <td className="py-2 px-3 text-right font-medium text-gray-800">{fmt(subtotal)}</td>
                                                        <td className="py-2 px-3 text-right font-bold text-emerald-600">+{fmt(itmProfit)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Drawer Actions Footer */}
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2">
                            <button
                                onClick={() => setSelectedSale(null)}
                                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-bold text-xs hover:bg-white transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintReceipt(selectedSale)}
                                disabled={isPrinting === selectedSale.sale_id}
                                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {isPrinting === selectedSale.sale_id ? '⏳ Printing...' : '🖨️ Thermal Print'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
