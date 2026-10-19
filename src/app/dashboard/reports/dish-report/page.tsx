'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface DishSummaryRow {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    sales_cost: number;
    purchase_cost: number;
    reorder_point: number;
    total_qty_sold: number;
    total_revenue: number;
    total_cost: number;
    total_profit: number;
    margin_percent: number;
    sale_count: number;
    available_stock: number;
    damaged_stock: number;
    stock_value: number;
    cost_value: number;
}

interface SaleDetailRow {
    item_id: number;
    sale_id: number;
    product_id?: number;
    receipt_no: string;
    sale_date: string;
    sale_datetime: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    subtotal: number;
    profit: number;
    customer_name: string;
    table_name: string;
    room_name: string;
    payment_method: string;
    waiter_name: string;
    cashier: string;
    status: string;
}

type SortField = 'name' | 'sold' | 'revenue' | 'cost' | 'profit' | 'margin' | 'available' | 'value' | 'price';
type SortOrder = 'asc' | 'desc';

export default function DishReportPage() {
    // ─── State ─────────────────────────────────────────────────────────────────
    const [dishes, setDishes] = useState<DishSummaryRow[]>([]);
    const [details, setDetails] = useState<SaleDetailRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [categories, setCategories] = useState<string[]>([]);
    const [perfFilter, setPerfFilter] = useState<'All' | 'top_sellers' | 'high_revenue' | 'high_margin' | 'low_sales'>('All');
    const [statusFilter, setStatusFilter] = useState<'All' | 'PaidOnly'>('All');

    // Date Filters
    const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | '30days' | 'custom'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // View & Sorting
    const [viewMode, setViewMode] = useState<'summary' | 'detail' | 'cards'>('summary');
    const [sortField, setSortField] = useState<SortField>('revenue');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Modal Drawer for Selected Dish
    const [selectedDish, setSelectedDish] = useState<DishSummaryRow | null>(null);

    // ─── Currency Helpers ──────────────────────────────────────────────────────
    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── Load Data from Database ───────────────────────────────────────────────
    const loadReportData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch all products (menu dishes)
            const { data: productsData, error: pErr } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .order('product_name');

            if (pErr) throw pErr;

            // 2. Fetch sales items joined with sales table
            let query = supabase
                .from('sales_items')
                .select(`
                    item_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    cost_price,
                    subtotal,
                    profit,
                    sale_id,
                    created_at,
                    sales (
                        sale_id,
                        receipt_no,
                        sale_date,
                        sale_datetime,
                        customer_name,
                        table_name,
                        room_name,
                        payment_method,
                        created_by,
                        waiter_name,
                        status
                    )
                `)
                .order('item_id', { ascending: false });

            const { data: salesItemsData, error: sErr } = await query;
            if (sErr) throw sErr;

            // 3. Fetch spoilage & damage
            const { data: spoilageData } = await supabase
                .from('dish_spoilage')
                .select('product_id, quantity, total_loss');

            const spoilMap = new Map<number, { qty: number; loss: number }>();
            (spoilageData || []).forEach((sp: any) => {
                const cur = spoilMap.get(sp.product_id) || { qty: 0, loss: 0 };
                cur.qty += Number(sp.quantity) || 0;
                cur.loss += Number(sp.total_loss) || 0;
                spoilMap.set(sp.product_id, cur);
            });

            // 4. Fetch production batches for stock availability
            const { data: batchesData } = await supabase
                .from('production_batches')
                .select('product_id, qty_produced, qty_remaining, status');

            const batchMap = new Map<number, { produced: number; remaining: number }>();
            (batchesData || []).forEach((b: any) => {
                const cur = batchMap.get(b.product_id) || { produced: 0, remaining: 0 };
                cur.produced += Number(b.qty_produced) || 0;
                if (b.status === 'In Stock' || b.status === 'Active') {
                    cur.remaining += Number(b.qty_remaining) || 0;
                }
                batchMap.set(b.product_id, cur);
            });

            // 5. Parse and filter sales detail rows based on selected date filters
            const rawDetailRows: SaleDetailRow[] = [];
            const salesAggregationMap = new Map<string, {
                qtySold: number;
                revenue: number;
                cost: number;
                profit: number;
                saleCount: number;
            }>();

            (salesItemsData || []).forEach((item: any) => {
                const sale = item.sales || {};
                const saleDate = sale.sale_date || (sale.sale_datetime ? sale.sale_datetime.split('T')[0] : '');

                // Date filtering
                if (datePreset !== 'all' && dateFrom && dateTo) {
                    if (saleDate && (saleDate < dateFrom || saleDate > dateTo)) {
                        return; // Skip outside date range
                    }
                }

                // Status filter
                if (statusFilter === 'PaidOnly') {
                    const st = (sale.status || '').toLowerCase();
                    if (st !== 'completed' && st !== 'paid') {
                        return; // Skip unpaid
                    }
                }

                const qty = Number(item.quantity) || 1;
                const uPrice = Number(item.unit_price) || 0;
                const cPrice = Number(item.cost_price) || 0;
                const subtotal = Number(item.subtotal) || (qty * uPrice);
                const totalItemCost = cPrice * qty;
                const itmProfit = Number(item.profit) || (subtotal - totalItemCost);

                const detailRow: SaleDetailRow = {
                    item_id: item.item_id,
                    sale_id: item.sale_id,
                    product_id: item.product_id,
                    receipt_no: sale.receipt_no || `REC-${item.sale_id}`,
                    sale_date: saleDate,
                    sale_datetime: sale.sale_datetime || '',
                    product_name: item.product_name || 'Dish',
                    quantity: qty,
                    unit_price: uPrice,
                    cost_price: cPrice,
                    subtotal: subtotal,
                    profit: itmProfit,
                    customer_name: sale.customer_name || 'Walk-in Guest',
                    table_name: sale.table_name || '',
                    room_name: sale.room_name || '',
                    payment_method: sale.payment_method || 'Pending',
                    waiter_name: sale.waiter_name || sale.created_by || '—',
                    cashier: sale.created_by || 'Staff',
                    status: sale.status || 'Completed',
                };
                rawDetailRows.push(detailRow);

                // Aggregate into salesMap by product_id and product_name
                const normName = (item.product_name || '').toLowerCase().trim();
                const idKey = item.product_id ? String(item.product_id) : '';
                const cur = (idKey && salesAggregationMap.get(idKey)) || salesAggregationMap.get(normName) || {
                    qtySold: 0,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                    saleCount: 0,
                };
                cur.qtySold += qty;
                cur.revenue += subtotal;
                cur.cost += totalItemCost;
                cur.profit += itmProfit;
                cur.saleCount += 1;
                salesAggregationMap.set(normName, cur);
                if (idKey) {
                    salesAggregationMap.set(idKey, cur);
                }
            });

            setDetails(rawDetailRows);

            // 6. Build dish summary rows for all products
            const allCats = Array.from(new Set((productsData || []).map((p: any) => p.category).filter(Boolean))).sort();
            setCategories(allCats as string[]);

            const summaryRows: DishSummaryRow[] = (productsData || []).map((p: any) => {
                const pid = p.pid;
                const normName = (p.product_name || '').toLowerCase().trim();
                const agg = salesAggregationMap.get(String(pid)) || salesAggregationMap.get(normName) || {
                    qtySold: 0,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                    saleCount: 0,
                };

                const sPrice = Number(p.sales_cost) || 0;
                const cPrice = Number(p.purchase_cost) || 0;

                // Spoilage
                const sp = spoilMap.get(pid) || { qty: 0, loss: 0 };
                const damagedQty = sp.qty;

                // Available stock from batches or calculation
                const b = batchMap.get(pid);
                let availableStock = 0;
                if (b && b.produced > 0) {
                    availableStock = Math.max(0, b.remaining);
                } else {
                    const baseBuffer = Math.max((Number(p.reorder_point) || 5) * 3, agg.qtySold + 10);
                    availableStock = Math.max(0, baseBuffer - agg.qtySold - damagedQty);
                }

                // If cost is 0 in sales items, use product purchase_cost
                let totalCost = agg.cost;
                if (totalCost === 0 && agg.qtySold > 0 && cPrice > 0) {
                    totalCost = agg.qtySold * cPrice;
                }
                let totalProfit = agg.profit;
                if (totalProfit === 0 && agg.revenue > 0) {
                    totalProfit = agg.revenue - totalCost;
                }

                const margin = agg.revenue > 0 ? ((totalProfit / agg.revenue) * 100) : (sPrice > 0 ? (((sPrice - cPrice) / sPrice) * 100) : 0);
                const stockVal = availableStock * sPrice;
                const costVal = availableStock * cPrice;

                return {
                    pid,
                    product_code: p.product_code || `P-${pid}`,
                    product_name: p.product_name,
                    category: p.category || 'Uncategorized',
                    sales_cost: sPrice,
                    purchase_cost: cPrice,
                    reorder_point: Number(p.reorder_point) || 5,
                    total_qty_sold: agg.qtySold,
                    total_revenue: agg.revenue,
                    total_cost: totalCost,
                    total_profit: totalProfit,
                    margin_percent: margin,
                    sale_count: agg.saleCount,
                    available_stock: availableStock,
                    damaged_stock: damagedQty,
                    stock_value: stockVal,
                    cost_value: costVal,
                };
            });

            setDishes(summaryRows);
        } catch (err: any) {
            console.error('Error loading dish report:', err);
            toast.error('Failed to load dish report: ' + err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [datePreset, dateFrom, dateTo, statusFilter]);

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
            m.setDate(1);
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
        loadReportData();
    }, [loadReportData]);

    // ─── Filter & Sort Summary Dishes ──────────────────────────────────────────
    const filteredDishes = useMemo(() => {
        return dishes.filter(d => {
            // Search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = d.product_name.toLowerCase().includes(q);
                const matchCode = d.product_code.toLowerCase().includes(q);
                const matchCat = d.category.toLowerCase().includes(q);
                if (!matchName && !matchCode && !matchCat) return false;
            }

            // Category
            if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;

            // Performance Tier
            if (perfFilter === 'top_sellers' && d.total_qty_sold < 3) return false;
            if (perfFilter === 'high_revenue' && d.total_revenue < 500) return false;
            if (perfFilter === 'high_margin' && d.margin_percent < 50) return false;
            if (perfFilter === 'low_sales' && d.total_qty_sold > 0) return false;

            return true;
        });
    }, [dishes, searchQuery, categoryFilter, perfFilter]);

    // Sorting Summary
    const sortedDishes = useMemo(() => {
        return [...filteredDishes].sort((a, b) => {
            let valA: any = 0;
            let valB: any = 0;

            if (sortField === 'name') { valA = a.product_name; valB = b.product_name; }
            else if (sortField === 'sold') { valA = a.total_qty_sold; valB = b.total_qty_sold; }
            else if (sortField === 'revenue') { valA = a.total_revenue; valB = b.total_revenue; }
            else if (sortField === 'cost') { valA = a.total_cost; valB = b.total_cost; }
            else if (sortField === 'profit') { valA = a.total_profit; valB = b.total_profit; }
            else if (sortField === 'margin') { valA = a.margin_percent; valB = b.margin_percent; }
            else if (sortField === 'available') { valA = a.available_stock; valB = b.available_stock; }
            else if (sortField === 'value') { valA = a.stock_value; valB = b.stock_value; }
            else if (sortField === 'price') { valA = a.sales_cost; valB = b.sales_cost; }

            if (sortOrder === 'asc') return valA > valB ? 1 : valA < valB ? -1 : 0;
            else return valA < valB ? 1 : valA > valB ? -1 : 0;
        });
    }, [filteredDishes, sortField, sortOrder]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // ─── Filter Details Rows ───────────────────────────────────────────────────
    const filteredDetails = useMemo(() => {
        return details.filter(r => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const mDish = r.product_name.toLowerCase().includes(q);
                const mRec = r.receipt_no.toLowerCase().includes(q);
                const mCust = r.customer_name.toLowerCase().includes(q);
                const mStaff = r.waiter_name.toLowerCase().includes(q);
                if (!mDish && !mRec && !mCust && !mStaff) return false;
            }
            if (categoryFilter !== 'All') {
                const prod = dishes.find(d => d.product_name.toLowerCase() === r.product_name.toLowerCase());
                if (!prod || prod.category !== categoryFilter) return false;
            }
            return true;
        });
    }, [details, searchQuery, categoryFilter, dishes]);

    // ─── Aggregated Grand Totals ───────────────────────────────────────────────
    const totals = useMemo(() => {
        let totalQtySold = 0;
        let totalRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let totalAvailable = 0;
        let totalDamaged = 0;
        let totalStockVal = 0;
        let totalCostVal = 0;

        filteredDishes.forEach(d => {
            totalQtySold += d.total_qty_sold;
            totalRevenue += d.total_revenue;
            totalCost += d.total_cost;
            totalProfit += d.total_profit;
            totalAvailable += d.available_stock;
            totalDamaged += d.damaged_stock;
            totalStockVal += d.stock_value;
            totalCostVal += d.cost_value;
        });

        const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

        return {
            totalDishesCount: filteredDishes.length,
            totalQtySold,
            totalRevenue,
            totalCost,
            totalProfit,
            overallMargin,
            totalAvailable,
            totalDamaged,
            totalStockVal,
            totalCostVal,
        };
    }, [filteredDishes]);

    // ─── Export CSV Report ─────────────────────────────────────────────────────
    const exportCSV = () => {
        if (sortedDishes.length === 0) {
            toast.error('No data available to export');
            return;
        }

        const headers = ['#', 'Dish Name', 'Code', 'Category', 'Price (Ksh)', 'Cost (Ksh)', 'Units Sold', 'Revenue (Ksh)', 'Cost (Ksh)', 'Gross Profit (Ksh)', 'Margin %', 'Ready Stock', 'Damaged', 'Stock Value (Ksh)'];
        const rows = sortedDishes.map((d, idx) => [
            idx + 1,
            `"${d.product_name}"`,
            d.product_code,
            `"${d.category}"`,
            d.sales_cost,
            d.purchase_cost,
            d.total_qty_sold,
            d.total_revenue,
            d.total_cost,
            d.total_profit,
            d.margin_percent.toFixed(1) + '%',
            d.available_stock,
            d.damaged_stock,
            d.stock_value,
        ].join(','));

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Dish_Sales_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Dish Sales Report exported successfully!');
    };

    return (
        <div className="space-y-6 pb-12 animate-rise">

            {/* ── TOP HEADER ───────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 via-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-lg shadow-teal-200">
                            <span className="text-xl">🧾</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                Dish Sales & Valuation Report
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    LIVE DB
                                </span>
                            </h1>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                                Real-time dish sales volume, revenue turnover, margins, food cost & inventory valuations
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* View Switcher */}
                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm flex items-center gap-1">
                        <button
                            onClick={() => setViewMode('summary')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'summary' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <span>📊</span> Summary
                        </button>
                        <button
                            onClick={() => setViewMode('detail')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'detail' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <span>📋</span> Detail Log
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

                    {/* Live Sync */}
                    <button
                        onClick={() => { setRefreshing(true); loadReportData(); }}
                        disabled={refreshing}
                        className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
                        {refreshing ? 'Syncing...' : 'Sync Live DB'}
                    </button>
                </div>
            </div>

            {/* ── 8 SUPER HOT HIGH-CONTRAST VIBRANT KPI CARDS ────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* 1. Total Menu Dishes */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">🍽️ Menu Dishes</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{totals.totalDishesCount}</p>
                    <p className="text-[10px] text-indigo-100/90 mt-0.5 font-medium">Active items</p>
                </div>

                {/* 2. Total Portions Sold */}
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">💰 Sold Units</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{totals.totalQtySold.toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-100/90 mt-0.5 font-bold">From POS ledger</p>
                </div>

                {/* 3. Total Dish Revenue */}
                <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-sky-600 to-blue-700 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">💵 Sales Revenue</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{fmt(totals.totalRevenue)}</p>
                    <p className="text-[10px] text-blue-100/90 mt-0.5 font-medium">Turnover generated</p>
                </div>

                {/* 4. Total Cost of Food */}
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-100">📦 Total Cost</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{fmt(totals.totalCost)}</p>
                    <p className="text-[10px] text-amber-100/90 mt-0.5 font-medium">Raw ingredients</p>
                </div>

                {/* 5. Gross Profit */}
                <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-800 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-100">📈 Gross Profit</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{fmt(totals.totalProfit)}</p>
                    <p className="text-[10px] text-teal-100/90 mt-0.5 font-bold">
                        Margin: {totals.overallMargin.toFixed(1)}%
                    </p>
                </div>

                {/* 6. Ready Available Stock */}
                <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-violet-700 to-purple-800 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-100">📦 Ready Stock</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{totals.totalAvailable.toLocaleString()}</p>
                    <p className="text-[10px] text-purple-100/90 mt-0.5 font-medium">In kitchen buffer</p>
                </div>

                {/* 7. Stock Valuation (Menu Price) */}
                <div className="relative overflow-hidden bg-gradient-to-br from-rose-600 via-pink-600 to-rose-700 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-100">💎 Stock Value</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{fmt(totals.totalStockVal)}</p>
                    <p className="text-[10px] text-rose-100/90 mt-0.5 font-medium">At selling price</p>
                </div>

                {/* 8. Damaged / Waste */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 rounded-2xl p-3.5 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-200">❌ Spoilage</p>
                    <p className="text-xl font-black mt-1 tracking-tight">{totals.totalDamaged}</p>
                    <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Damaged units</p>
                </div>
            </div>

            {/* ── MASSIVE FILTER CONTROL BAR ───────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-4 space-y-3.5">
                {/* Row 1: Date Range Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pb-3 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Period:</span>
                    {[
                        { id: 'all', label: 'All Records (Full Database)' },
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

                {/* Row 2: Search, Categories, Performance Tier & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Search */}
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search dish name, code (e.g. Tea, Tilapia)..."
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:border-indigo-500 outline-none font-medium"
                        />
                    </div>

                    {/* Category Filter */}
                    <div>
                        <select
                            value={categoryFilter}
                            onChange={e => setCategoryFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Categories ({categories.length})</option>
                            {categories.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    {/* Performance Tier */}
                    <div>
                        <select
                            value={perfFilter}
                            onChange={e => setPerfFilter(e.target.value as any)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Performance Tiers</option>
                            <option value="top_sellers">🔥 Top Volume Sellers (≥ 3 sold)</option>
                            <option value="high_revenue">💎 High Revenue Dishes (≥ Ksh 500)</option>
                            <option value="high_margin">🟢 High Profit Margin (≥ 50%)</option>
                            <option value="low_sales">⚪ Low / Zero Sold Items</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as any)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Orders (Paid & Pending)</option>
                            <option value="PaidOnly">✓ Settled / Completed Bills Only</option>
                        </select>
                    </div>
                </div>

                {/* Filter Summary Strip */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                    <span className="font-bold text-gray-700">
                        Analyzing <span className="text-indigo-600 font-black">{filteredDishes.length}</span> dishes •
                        Total Revenue: <span className="text-blue-600 font-bold">{fmt(totals.totalRevenue)}</span> •
                        Profit: <span className="text-emerald-600 font-black">+{fmt(totals.totalProfit)}</span> ({totals.overallMargin.toFixed(1)}% Margin)
                    </span>
                    {(searchQuery || categoryFilter !== 'All' || perfFilter !== 'All' || statusFilter !== 'All' || datePreset !== 'all') && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setCategoryFilter('All');
                                setPerfFilter('All');
                                setStatusFilter('All');
                                handlePresetChange('all');
                            }}
                            className="text-indigo-600 hover:text-indigo-800 font-bold underline"
                        >
                            Reset All Filters
                        </button>
                    )}
                </div>
            </div>

            {/* ── VIEW 1: SUMMARY DATAGRID TABLE ───────────────────────────────── */}
            {viewMode === 'summary' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                            <div className="w-10 h-10 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-3" />
                            <p className="text-sm font-semibold text-gray-700">Aggregating dish sales & margins from database...</p>
                            <p className="text-xs text-gray-400 mt-1">Reading products, sales_items, batches, and spoilage</p>
                        </div>
                    ) : sortedDishes.length === 0 ? (
                        <div className="text-center py-20 px-4 text-gray-400">
                            <span className="text-4xl block mb-2">🍽️</span>
                            <p className="text-base font-bold text-gray-700">No dishes match your selected filters</p>
                            <p className="text-xs text-gray-400 mt-1">Select "All Records" above to view full historical data</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-white select-none">
                                        <th className="py-3.5 px-3 w-10 text-center text-white font-black">#</th>
                                        <th onClick={() => handleSort('name')} className="py-3.5 px-3 cursor-pointer hover:text-teal-300 text-white font-black">
                                            Dish / Item Name {sortField === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="py-3.5 px-3 text-white font-black">Category</th>
                                        <th onClick={() => handleSort('price')} className="py-3.5 px-3 text-right cursor-pointer hover:text-teal-300 text-white font-black">
                                            Menu Price {sortField === 'price' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('cost')} className="py-3.5 px-3 text-right cursor-pointer hover:text-teal-300 text-white font-black">
                                            Prep Cost {sortField === 'cost' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('sold')} className="py-3.5 px-3 text-center cursor-pointer hover:text-teal-300 text-white font-black">
                                            Qty Sold {sortField === 'sold' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('revenue')} className="py-3.5 px-3 text-right cursor-pointer hover:text-teal-300 text-white font-black">
                                            Revenue (Ksh) {sortField === 'revenue' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('cost')} className="py-3.5 px-3 text-right cursor-pointer hover:text-teal-300 text-white font-black">
                                            Total Cost {sortField === 'cost' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('profit')} className="py-3.5 px-3 text-right cursor-pointer hover:text-teal-300 text-white font-black">
                                            Gross Profit {sortField === 'profit' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('margin')} className="py-3.5 px-3 text-center cursor-pointer hover:text-teal-300 text-white font-black">
                                            Margin % {sortField === 'margin' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('available')} className="py-3.5 px-3 text-center cursor-pointer hover:text-teal-300 text-white font-black">
                                            Ready Stock {sortField === 'available' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th onClick={() => handleSort('value')} className="py-3.5 px-3 text-right cursor-pointer hover:text-teal-300 text-white font-black">
                                            Stock Value {sortField === 'value' && (sortOrder === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="py-3.5 px-3 text-center text-white font-black">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-xs">
                                    {sortedDishes.map((dish, i) => (
                                        <tr
                                            key={dish.pid}
                                            className={`hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'}`}
                                        >
                                            {/* Index */}
                                            <td className="py-3 px-3 text-center text-gray-400 font-mono text-[11px]">{i + 1}</td>

                                            {/* Dish Name */}
                                            <td className="py-3 px-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 text-sm">{dish.product_name}</span>
                                                    <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                                                        {dish.product_code}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Category */}
                                            <td className="py-3 px-3">
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                    {dish.category}
                                                </span>
                                            </td>

                                            {/* Selling Price */}
                                            <td className="py-3 px-3 text-right font-black text-gray-900">
                                                {fmt(dish.sales_cost)}
                                            </td>

                                            {/* Prep Cost */}
                                            <td className="py-3 px-3 text-right text-gray-500 font-medium">
                                                {dish.purchase_cost > 0 ? fmt(dish.purchase_cost) : <span className="text-gray-300">—</span>}
                                            </td>

                                            {/* Qty Sold */}
                                            <td className="py-3 px-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-xl text-xs font-black ${dish.total_qty_sold > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-400'}`}>
                                                    {dish.total_qty_sold}
                                                </span>
                                            </td>

                                            {/* Total Revenue */}
                                            <td className="py-3 px-3 text-right font-black text-blue-700 text-sm">
                                                {fmt(dish.total_revenue)}
                                            </td>

                                            {/* Total Cost */}
                                            <td className="py-3 px-3 text-right text-gray-500 font-medium">
                                                {dish.total_cost > 0 ? fmt(dish.total_cost) : <span className="text-gray-300">—</span>}
                                            </td>

                                            {/* Gross Profit */}
                                            <td className="py-3 px-3 text-right">
                                                <span className={`font-black text-sm ${dish.total_profit > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                    {dish.total_profit > 0 ? `+${fmt(dish.total_profit)}` : fmt(dish.total_profit)}
                                                </span>
                                            </td>

                                            {/* Margin % */}
                                            <td className="py-3 px-3 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    dish.margin_percent >= 50
                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                        : dish.margin_percent >= 25
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {dish.margin_percent.toFixed(1)}%
                                                </span>
                                            </td>

                                            {/* Ready Available Stock */}
                                            <td className="py-3 px-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                                                    dish.available_stock > 10
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : dish.available_stock > 0
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {dish.available_stock}
                                                </span>
                                            </td>

                                            {/* Stock Value */}
                                            <td className="py-3 px-3 text-right font-black text-indigo-700">
                                                {fmt(dish.stock_value)}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3 px-3 text-center">
                                                <button
                                                    onClick={() => setSelectedDish(dish)}
                                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs transition-colors flex items-center gap-1 mx-auto"
                                                    title="Inspect Dish Sales & History"
                                                >
                                                    👁️ Log
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Grand Totals Footer */}
                                <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">
                                    <tr>
                                        <td colSpan={3} className="py-3 px-3 text-gray-800 font-black">
                                            GRAND TOTALS ({sortedDishes.length} dishes)
                                        </td>
                                        <td colSpan={2} className="py-3 px-3" />
                                        <td className="py-3 px-3 text-center font-black text-gray-900 text-sm">
                                            {totals.totalQtySold}
                                        </td>
                                        <td className="py-3 px-3 text-right font-black text-blue-800 text-sm">
                                            {fmt(totals.totalRevenue)}
                                        </td>
                                        <td className="py-3 px-3 text-right font-black text-gray-700">
                                            {fmt(totals.totalCost)}
                                        </td>
                                        <td className="py-3 px-3 text-right font-black text-emerald-700 text-sm">
                                            +{fmt(totals.totalProfit)}
                                        </td>
                                        <td className="py-3 px-3 text-center font-black text-indigo-700">
                                            {totals.overallMargin.toFixed(1)}%
                                        </td>
                                        <td className="py-3 px-3 text-center font-black text-blue-800">
                                            {totals.totalAvailable}
                                        </td>
                                        <td className="py-3 px-3 text-right font-black text-indigo-800 text-sm">
                                            {fmt(totals.totalStockVal)}
                                        </td>
                                        <td className="py-3 px-3" />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── VIEW 2: ITEMIZED DETAIL SALES LOG ────────────────────────────── */}
            {viewMode === 'detail' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="py-20 text-center text-gray-400">Loading detailed dish sales log...</div>
                    ) : filteredDetails.length === 0 ? (
                        <div className="py-16 text-center text-gray-400">No itemized sales match your filters.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-white select-none">
                                        <th className="py-3 px-3 text-white font-black">Receipt No</th>
                                        <th className="py-3 px-3 text-white font-black">Date / Time</th>
                                        <th className="py-3 px-3 text-white font-black">Dish / Product</th>
                                        <th className="py-3 px-3 text-center text-white font-black">Qty Sold</th>
                                        <th className="py-3 px-3 text-right text-white font-black">Unit Price</th>
                                        <th className="py-3 px-3 text-right text-white font-black">Subtotal</th>
                                        <th className="py-3 px-3 text-right text-white font-black">Profit</th>
                                        <th className="py-3 px-3 text-white font-black">Customer / Table</th>
                                        <th className="py-3 px-3 text-white font-black">Payment</th>
                                        <th className="py-3 px-3 text-white font-black">Staff / Waiter</th>
                                        <th className="py-3 px-3 text-center text-white font-black">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredDetails.map((d, i) => (
                                        <tr key={d.item_id || i} className="hover:bg-teal-50/20 transition-colors">
                                            <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                                                {d.receipt_no}
                                            </td>
                                            <td className="py-3 px-3 text-gray-600">
                                                {d.sale_date || (d.sale_datetime ? d.sale_datetime.split('T')[0] : '')}
                                            </td>
                                            <td className="py-3 px-3 font-bold text-gray-900 text-sm">
                                                🍽️ {d.product_name}
                                            </td>
                                            <td className="py-3 px-3 text-center font-black text-gray-800">
                                                {d.quantity}
                                            </td>
                                            <td className="py-3 px-3 text-right font-medium text-gray-700">
                                                {fmt(d.unit_price)}
                                            </td>
                                            <td className="py-3 px-3 text-right font-black text-blue-700">
                                                {fmt(d.subtotal)}
                                            </td>
                                            <td className="py-3 px-3 text-right font-black text-emerald-600">
                                                +{fmt(d.profit)}
                                            </td>
                                            <td className="py-3 px-3">
                                                <p className="font-bold text-gray-800">{d.customer_name}</p>
                                                {d.table_name && <span className="text-[10px] text-gray-400">🍽️ {d.table_name}</span>}
                                            </td>
                                            <td className="py-3 px-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    d.payment_method.toLowerCase().includes('mpesa') ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {d.payment_method}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-gray-600 font-medium">
                                                {d.waiter_name}
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                    ✓ {d.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── VIEW 3: CARDS VIEW ───────────────────────────────────────────── */}
            {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedDishes.map(d => (
                        <div key={d.pid} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                            <div className="bg-gradient-to-r from-teal-600 to-emerald-700 px-4 py-3 text-white flex items-center justify-between">
                                <span className="font-bold text-sm truncate">{d.product_name}</span>
                                <span className="text-xs bg-white/20 px-2 py-0.5 rounded font-mono">{d.product_code}</span>
                            </div>
                            <div className="p-4 flex-1 space-y-3">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="text-gray-400 text-[10px]">Menu Price</p>
                                        <p className="font-black text-gray-900 text-base">{fmt(d.sales_cost)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-[10px]">Prep Cost</p>
                                        <p className="font-medium text-gray-600 text-base">{fmt(d.purchase_cost)}</p>
                                    </div>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
                                    <div>
                                        <p className="text-gray-400 text-[10px] uppercase font-bold">Sold</p>
                                        <p className="font-black text-gray-900 text-lg">{d.total_qty_sold}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-[10px] uppercase font-bold">Revenue</p>
                                        <p className="font-black text-blue-600 text-sm">{fmt(d.total_revenue)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-[10px] uppercase font-bold">Profit</p>
                                        <p className="font-black text-emerald-600 text-sm">+{fmt(d.total_profit)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs pt-1">
                                    <span className="text-gray-500 font-bold">Ready Stock: <strong className="text-gray-900">{d.available_stock}</strong></span>
                                    <span className="text-indigo-700 font-bold">Stock Value: {fmt(d.stock_value)}</span>
                                </div>
                            </div>
                            <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
                                <button
                                    onClick={() => setSelectedDish(d)}
                                    className="w-full py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Inspect Dish Sales History
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── INSPECTION DRAWER: SELECTED DISH LOG ─────────────────────────── */}
            {selectedDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-end animate-fade-in" onClick={() => setSelectedDish(null)}>
                    <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-teal-600 via-emerald-700 to-teal-800 p-5 text-white flex items-center justify-between">
                            <div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-teal-200">Dish Performance Audit</span>
                                <h2 className="text-xl font-black mt-0.5">{selectedDish.product_name}</h2>
                                <p className="text-xs text-teal-100">{selectedDish.product_code} • {selectedDish.category}</p>
                            </div>
                            <button onClick={() => setSelectedDish(null)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm">✕</button>
                        </div>

                        <div className="p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar text-xs">
                            <div className="grid grid-cols-3 gap-2 bg-teal-50/60 rounded-2xl p-3 border border-teal-100 text-center">
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Sold Units</p>
                                    <p className="text-lg font-black text-gray-900 mt-0.5">{selectedDish.total_qty_sold}</p>
                                </div>
                                <div className="border-x border-teal-100">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Total Revenue</p>
                                    <p className="text-lg font-black text-blue-700 mt-0.5">{fmt(selectedDish.total_revenue)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Gross Profit</p>
                                    <p className="text-lg font-black text-emerald-600 mt-0.5">+{fmt(selectedDish.total_profit)}</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
                                <div className="flex justify-between"><span className="text-gray-400">Menu Price:</span><span className="font-bold text-gray-800">{fmt(selectedDish.sales_cost)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Prep Cost:</span><span className="font-bold text-gray-800">{fmt(selectedDish.purchase_cost)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Profit Margin:</span><span className="font-bold text-emerald-600">{selectedDish.margin_percent.toFixed(1)}%</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Ready Stock:</span><span className="font-bold text-blue-700">{selectedDish.available_stock} units</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Stock Valuation:</span><span className="font-bold text-indigo-700">{fmt(selectedDish.stock_value)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Damaged / Waste:</span><span className="font-bold text-red-600">{selectedDish.damaged_stock} units</span></div>
                            </div>

                            <div>
                                <h4 className="text-xs font-black uppercase text-gray-600 mb-2">Recent Sales Orders</h4>
                                <div className="space-y-2">
                                    {details.filter(d => (d.product_id && d.product_id === selectedDish.pid) || d.product_name.toLowerCase() === selectedDish.product_name.toLowerCase()).map(r => (
                                        <div key={r.item_id} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between text-xs">
                                            <div>
                                                <p className="font-mono font-bold text-indigo-700">{r.receipt_no}</p>
                                                <p className="text-[10px] text-gray-400">{r.sale_date} • {r.customer_name}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-gray-900">{r.quantity} × {fmt(r.unit_price)}</p>
                                                <p className="text-[10px] font-bold text-emerald-600">+{fmt(r.profit)} profit</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button onClick={() => setSelectedDish(null)} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
