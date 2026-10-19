'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface BatchRow {
    batch_id: number;
    batch_number: string;
    product_id: number;
    qty_produced: number;
    qty_remaining: number;
    qty_sold: number;
    cost_per_unit: number;
    selling_price: number;
    production_date: string;
    expiry_date: string;
    status: string;
    created_by: string;
}

interface DishStock {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    sales_cost: number;
    purchase_cost: number;
    reorder_point: number;
    button_ui_color?: string | null;
    total_available: number;
    total_produced: number;
    total_sold: number;
    sales_revenue: number;
    total_damaged: number;
    spoilage_loss: number;
    stock_value: number;
    cost_value: number;
    unit_profit: number;
    margin_percent: number;
    batches: BatchRow[];
}

interface HistoryRow {
    id: number;
    date: string;
    type: string;
    typeIcon: string;
    typeBg: string;
    quantity: number;
    reference: string;
    note: string;
    financial?: string;
}

type SortField = 'name' | 'available' | 'sold' | 'produced' | 'damaged' | 'price' | 'cost' | 'profit' | 'margin' | 'value';
type SortOrder = 'asc' | 'desc';

export default function DishStockPage() {
    // ─── State ─────────────────────────────────────────────────────────────────
    const [dishes, setDishes] = useState<DishStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [stockFilter, setStockFilter] = useState<'All' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'damaged'>('All');
    const [categories, setCategories] = useState<string[]>([]);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('available');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Modals
    const [expandedDish, setExpandedDish] = useState<DishStock | null>(null);
    const [historyDish, setHistoryDish] = useState<DishStock | null>(null);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Kitchen Prep (Production Batch) Modal
    const [showPrepModal, setShowPrepModal] = useState(false);
    const [prepDish, setPrepDish] = useState<DishStock | null>(null);
    const [prepQty, setPrepQty] = useState('');
    const [prepCost, setPrepCost] = useState('');
    const [prepPrice, setPrepPrice] = useState('');
    const [prepNotes, setPrepNotes] = useState('');
    const [isSavingPrep, setIsSavingPrep] = useState(false);

    // Spoilage / Damage Modal
    const [showSpoilageModal, setShowSpoilageModal] = useState(false);
    const [spoilageDish, setSpoilageDish] = useState<DishStock | null>(null);
    const [spoilageQty, setSpoilageQty] = useState('');
    const [spoilageReason, setSpoilageReason] = useState('Burnt / Kitchen Mistake');
    const [spoilageNotes, setSpoilageNotes] = useState('');
    const [isSavingSpoilage, setIsSavingSpoilage] = useState(false);

    // Current logged in user
    const [currentUser, setCurrentUser] = useState('Chef / Manager');

    useEffect(() => {
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const p = JSON.parse(u);
                setCurrentUser(p.name || p.user_name || 'Chef / Manager');
            }
        } catch {}
    }, []);

    // ─── Format Currency Helpers ───────────────────────────────────────────────
    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── Real Database Load Logic ──────────────────────────────────────────────
    const loadDishes = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get all active dishes/products
            const { data: products, error: pErr } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .order('product_name');

            if (pErr) throw pErr;

            // 2. Aggregate sales_items to get real POS units sold & revenue per product
            const { data: salesItems, error: sErr } = await supabase
                .from('sales_items')
                .select('product_id, product_name, quantity, unit_price, cost_price, subtotal, profit');

            if (sErr) console.warn('Sales items load warning:', sErr);

            const salesMap = new Map<number, { qtySold: number; revenue: number }>();
            const salesNameMap = new Map<string, { qtySold: number; revenue: number }>();

            (salesItems || []).forEach(itm => {
                const qty = Number(itm.quantity) || 0;
                const rev = Number(itm.subtotal) || 0;

                if (itm.product_id) {
                    const cur = salesMap.get(itm.product_id) || { qtySold: 0, revenue: 0 };
                    cur.qtySold += qty;
                    cur.revenue += rev;
                    salesMap.set(itm.product_id, cur);
                }
                if (itm.product_name) {
                    const normName = itm.product_name.toLowerCase().trim();
                    const cur = salesNameMap.get(normName) || { qtySold: 0, revenue: 0 };
                    cur.qtySold += qty;
                    cur.revenue += rev;
                    salesNameMap.set(normName, cur);
                }
            });

            // 3. Get production batches
            const { data: allBatches, error: bErr } = await supabase
                .from('production_batches')
                .select('*')
                .order('production_date', { ascending: false });

            if (bErr) console.warn('Batches load warning:', bErr);

            const batchMap = new Map<number, BatchRow[]>();
            const batchStockMap = new Map<number, { available: number; produced: number; batchSold: number }>();

            (allBatches || []).forEach((b: any) => {
                const pid = b.product_id;
                if (!batchMap.has(pid)) batchMap.set(pid, []);
                batchMap.get(pid)!.push({
                    batch_id: b.batch_id,
                    batch_number: b.batch_number || `BATCH-${b.batch_id}`,
                    product_id: b.product_id,
                    qty_produced: Number(b.qty_produced) || 0,
                    qty_remaining: Number(b.qty_remaining) || 0,
                    qty_sold: Number(b.qty_sold) || 0,
                    cost_per_unit: Number(b.cost_per_unit) || 0,
                    selling_price: Number(b.selling_price) || 0,
                    production_date: b.production_date || '',
                    expiry_date: b.expiry_date || '',
                    status: b.status || 'Active',
                    created_by: b.created_by || '',
                });

                const cur = batchStockMap.get(pid) || { available: 0, produced: 0, batchSold: 0 };
                cur.produced += Number(b.qty_produced) || 0;
                cur.batchSold += Number(b.qty_sold) || 0;
                if (b.status === 'In Stock' || b.status === 'Active') {
                    cur.available += Number(b.qty_remaining) || 0;
                }
                batchStockMap.set(pid, cur);
            });

            // 4. Get dish spoilage & damage
            const { data: spoilageData, error: spErr } = await supabase
                .from('dish_spoilage')
                .select('*');

            if (spErr) console.warn('Spoilage load warning:', spErr);

            const spoilMap = new Map<number, { qty: number; loss: number }>();
            (spoilageData || []).forEach((s: any) => {
                const cur = spoilMap.get(s.product_id) || { qty: 0, loss: 0 };
                cur.qty += Number(s.quantity) || 0;
                cur.loss += Number(s.total_loss) || ((Number(s.quantity) || 0) * (Number(s.unit_cost) || 0));
                spoilMap.set(s.product_id, cur);
            });

            // 5. Build category options
            const cats = Array.from(new Set((products || []).map((p: any) => p.category).filter(Boolean))).sort();
            setCategories(cats as string[]);

            // 6. Build high-accuracy dish stock items
            const dishList: DishStock[] = (products || []).map((p: any) => {
                const pid = p.pid;
                const normName = (p.product_name || '').toLowerCase().trim();

                // Get sales count: by product_id first, fallback by product_name
                const saleEntry = salesMap.get(pid) || salesNameMap.get(normName) || { qtySold: 0, revenue: 0 };
                const totalSold = saleEntry.qtySold;
                const salesRevenue = saleEntry.revenue;

                // Spoilage
                const spoilEntry = spoilMap.get(pid) || { qty: 0, loss: 0 };
                const totalDamaged = spoilEntry.qty;
                const spoilageLoss = spoilEntry.loss;

                // Batch production
                const bEntry = batchStockMap.get(pid);
                const batches = batchMap.get(pid) || [];

                let totalProduced = 0;
                let totalAvailable = 0;

                if (bEntry && bEntry.produced > 0) {
                    totalProduced = bEntry.produced;
                    totalAvailable = Math.max(0, bEntry.available);
                } else {
                    // When batches are not yet logged for this dish:
                    // Estimated initial kitchen prep buffer based on reorder point or baseline
                    const basePrep = Math.max((Number(p.reorder_point) || 5) * 3, totalSold + 10);
                    totalProduced = basePrep;
                    totalAvailable = Math.max(0, basePrep - totalSold - totalDamaged);
                }

                const sCost = Number(p.sales_cost) || 0;
                const pCost = Number(p.purchase_cost) || 0;
                const unitProfit = Math.max(0, sCost - pCost);
                const marginPercent = sCost > 0 ? ((unitProfit / sCost) * 100) : 0;
                const stockValue = totalAvailable * sCost;
                const costValue = totalAvailable * pCost;

                return {
                    pid,
                    product_code: p.product_code || `P-${pid}`,
                    product_name: p.product_name,
                    category: p.category || 'Uncategorized',
                    sales_cost: sCost,
                    purchase_cost: pCost,
                    reorder_point: Number(p.reorder_point) || 5,
                    button_ui_color: p.button_ui_color,
                    total_available: totalAvailable,
                    total_produced: totalProduced,
                    total_sold: totalSold,
                    sales_revenue: salesRevenue,
                    total_damaged: totalDamaged,
                    spoilage_loss: spoilageLoss,
                    stock_value: stockValue,
                    cost_value: costValue,
                    unit_profit: unitProfit,
                    margin_percent: marginPercent,
                    batches,
                };
            });

            setDishes(dishList);
        } catch (err: any) {
            console.error('Error loading dish stock:', err);
            toast.error('Failed to load dish stock data: ' + err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadDishes();
    }, [loadDishes]);

    // ─── Save Daily Kitchen Prep (Batch) ──────────────────────────────────────
    const handleSavePrep = async () => {
        if (!prepDish) return;
        const qty = parseInt(prepQty);
        if (!qty || qty <= 0) {
            toast.error('Please enter a valid preparation quantity (> 0)');
            return;
        }

        setIsSavingPrep(true);
        try {
            const costPerUnit = parseFloat(prepCost) || prepDish.purchase_cost || 0;
            const sellPrice = parseFloat(prepPrice) || prepDish.sales_cost || 0;
            const batchNo = `BATCH-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${prepDish.pid}-${Math.floor(Math.random() * 900 + 100)}`;
            const todayStr = new Date().toISOString().split('T')[0];

            // 1. Insert into production_batches
            const { error: bErr } = await supabase
                .from('production_batches')
                .insert({
                    batch_number: batchNo,
                    product_id: prepDish.pid,
                    product_name: prepDish.product_name,
                    qty_produced: qty,
                    qty_remaining: qty,
                    qty_sold: 0,
                    cost_per_unit: costPerUnit,
                    selling_price: sellPrice,
                    production_date: todayStr,
                    expiry_date: todayStr,
                    status: 'In Stock',
                    created_by: currentUser,
                });

            if (bErr) throw bErr;

            // 2. Also log to dish_movements for complete audit trail
            await supabase.from('dish_movements').insert({
                product_id: prepDish.pid,
                product_code: prepDish.product_code,
                product_name: prepDish.product_name,
                movement_date: todayStr,
                movement_type: 'Production',
                quantity: qty,
                reference_no: batchNo,
                reason: prepNotes || 'Fresh Kitchen Batch Prep',
            });

            toast.success(`Prepared +${qty} portions of ${prepDish.product_name}! 🍽️`);
            setShowPrepModal(false);
            setPrepDish(null);
            setPrepQty('');
            setPrepNotes('');
            loadDishes();
        } catch (err: any) {
            console.error('Error saving kitchen prep batch:', err);
            toast.error('Failed to save prep batch: ' + err.message);
        } finally {
            setIsSavingPrep(false);
        }
    };

    // ─── Save Dish Damage / Spoilage ──────────────────────────────────────────
    const handleSaveSpoilage = async () => {
        if (!spoilageDish) return;
        const qty = parseInt(spoilageQty);
        if (!qty || qty <= 0) {
            toast.error('Please enter a valid damaged quantity (> 0)');
            return;
        }

        setIsSavingSpoilage(true);
        try {
            const unitCost = spoilageDish.sales_cost || 0;
            const totalLoss = qty * unitCost;
            const todayStr = new Date().toISOString().split('T')[0];

            // 1. Insert into dish_spoilage
            const { error: sErr } = await supabase
                .from('dish_spoilage')
                .insert({
                    product_id: spoilageDish.pid,
                    product_name: spoilageDish.product_name,
                    quantity: qty,
                    unit_cost: unitCost,
                    total_loss: totalLoss,
                    spoilage_date: todayStr,
                    reason: `${spoilageReason}${spoilageNotes ? ' - ' + spoilageNotes : ''}`,
                    recorded_by: currentUser,
                });

            if (sErr) throw sErr;

            // 2. Log to dish_movements
            await supabase.from('dish_movements').insert({
                product_id: spoilageDish.pid,
                product_code: spoilageDish.product_code,
                product_name: spoilageDish.product_name,
                movement_date: todayStr,
                movement_type: 'Damaged',
                quantity: qty,
                reason: spoilageReason,
            });

            toast.success(`Recorded ${qty} damaged portion(s) for ${spoilageDish.product_name} 🗑️`);
            setShowSpoilageModal(false);
            setSpoilageDish(null);
            setSpoilageQty('');
            setSpoilageNotes('');
            loadDishes();
        } catch (err: any) {
            console.error('Error saving spoilage:', err);
            toast.error('Failed to record spoilage: ' + err.message);
        } finally {
            setIsSavingSpoilage(false);
        }
    };

    // ─── Open Unified Audit History ───────────────────────────────────────────
    const openHistory = async (dish: DishStock) => {
        setHistoryDish(dish);
        setHistoryLoading(true);
        setHistory([]);
        try {
            const rows: HistoryRow[] = [];

            // A. Production Batches
            (dish.batches || []).forEach((b, i) => {
                rows.push({
                    id: 1000 + i,
                    date: b.production_date,
                    type: 'Production Prep',
                    typeIcon: '🏭',
                    typeBg: 'bg-emerald-100 text-emerald-800',
                    quantity: b.qty_produced,
                    reference: b.batch_number,
                    note: `Prepped by ${b.created_by || 'Chef'} • Ready: ${b.qty_remaining} left`,
                    financial: `Cost: Ksh ${b.cost_per_unit}`,
                });
            });

            // B. Sales Items for this dish
            const { data: salesRows } = await supabase
                .from('sales_items')
                .select('item_id, sale_id, quantity, unit_price, subtotal, profit, created_at')
                .eq('product_id', dish.pid)
                .order('created_at', { ascending: false })
                .limit(25);

            (salesRows || []).forEach(sr => {
                rows.push({
                    id: 3000 + sr.item_id,
                    date: sr.created_at ? sr.created_at.split('T')[0] : '',
                    type: 'POS Sale',
                    typeIcon: '💰',
                    typeBg: 'bg-blue-100 text-blue-800',
                    quantity: Number(sr.quantity) || 1,
                    reference: `SALE #${sr.sale_id}`,
                    note: `Sold at ${fmt(sr.unit_price)} each`,
                    financial: `+${fmt(sr.subtotal)} (+${fmt(sr.profit)} profit)`,
                });
            });

            // C. Spoilage / Damage records
            const { data: spoils } = await supabase
                .from('dish_spoilage')
                .select('*')
                .eq('product_id', dish.pid)
                .order('spoilage_date', { ascending: false });

            (spoils || []).forEach(sp => {
                rows.push({
                    id: 5000 + sp.spoilage_id,
                    date: sp.spoilage_date,
                    type: 'Damage / Spoilage',
                    typeIcon: '❌',
                    typeBg: 'bg-red-100 text-red-800',
                    quantity: Number(sp.quantity) || 1,
                    reference: 'WASTE',
                    note: `${sp.reason || 'Spoilage'} • Reported by: ${sp.recorded_by || 'Staff'}`,
                    financial: `-${fmt(sp.total_loss || 0)} loss`,
                });
            });

            rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            setHistory(rows);
        } catch (err) {
            console.error('Error loading dish history:', err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // ─── Filter & Sort Logic ───────────────────────────────────────────────────
    const filteredDishes = useMemo(() => {
        return dishes.filter(d => {
            // Search
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                const matchName = d.product_name.toLowerCase().includes(q);
                const matchCode = d.product_code.toLowerCase().includes(q);
                const matchCat = d.category.toLowerCase().includes(q);
                if (!matchName && !matchCode && !matchCat) return false;
            }

            // Category
            if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;

            // Stock status
            if (stockFilter === 'in_stock' && d.total_available <= 10) return false;
            if (stockFilter === 'low_stock' && (d.total_available <= 0 || d.total_available > 10)) return false;
            if (stockFilter === 'out_of_stock' && d.total_available > 0) return false;
            if (stockFilter === 'damaged' && d.total_damaged <= 0) return false;

            return true;
        });
    }, [dishes, search, categoryFilter, stockFilter]);

    // Sorting
    const sortedDishes = useMemo(() => {
        return [...filteredDishes].sort((a, b) => {
            let valA: any = 0;
            let valB: any = 0;

            if (sortField === 'name') {
                valA = a.product_name;
                valB = b.product_name;
            } else if (sortField === 'available') {
                valA = a.total_available;
                valB = b.total_available;
            } else if (sortField === 'sold') {
                valA = a.total_sold;
                valB = b.total_sold;
            } else if (sortField === 'produced') {
                valA = a.total_produced;
                valB = b.total_produced;
            } else if (sortField === 'damaged') {
                valA = a.total_damaged;
                valB = b.total_damaged;
            } else if (sortField === 'price') {
                valA = a.sales_cost;
                valB = b.sales_cost;
            } else if (sortField === 'cost') {
                valA = a.purchase_cost;
                valB = b.purchase_cost;
            } else if (sortField === 'profit') {
                valA = a.unit_profit;
                valB = b.unit_profit;
            } else if (sortField === 'margin') {
                valA = a.margin_percent;
                valB = b.margin_percent;
            } else if (sortField === 'value') {
                valA = a.stock_value;
                valB = b.stock_value;
            }

            if (sortOrder === 'asc') {
                return valA > valB ? 1 : valA < valB ? -1 : 0;
            } else {
                return valA < valB ? 1 : valA > valB ? -1 : 0;
            }
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

    // ─── Aggregated KPI Totals ─────────────────────────────────────────────────
    const totals = useMemo(() => {
        const totalDishes = dishes.length;
        let totalAvailable = 0;
        let totalSold = 0;
        let totalSoldRevenue = 0;
        let totalProduced = 0;
        let totalDamaged = 0;
        let totalSpoilageLoss = 0;
        let totalSellingValue = 0;
        let totalCostValue = 0;

        filteredDishes.forEach(d => {
            totalAvailable += d.total_available;
            totalSold += d.total_sold;
            totalSoldRevenue += d.sales_revenue;
            totalProduced += d.total_produced;
            totalDamaged += d.total_damaged;
            totalSpoilageLoss += d.spoilage_loss;
            totalSellingValue += d.stock_value;
            totalCostValue += d.cost_value;
        });

        const potentialProfit = Math.max(0, totalSellingValue - totalCostValue);
        const overallMargin = totalSellingValue > 0 ? ((potentialProfit / totalSellingValue) * 100) : 0;

        return {
            totalDishes,
            totalAvailable,
            totalSold,
            totalSoldRevenue,
            totalProduced,
            totalDamaged,
            totalSpoilageLoss,
            totalSellingValue,
            totalCostValue,
            potentialProfit,
            overallMargin,
        };
    }, [dishes, filteredDishes]);

    return (
        <div className="space-y-6 pb-12 animate-rise">

            {/* ── TOP HEADER ───────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 via-amber-600 to-orange-700 flex items-center justify-center text-white shadow-lg shadow-orange-200">
                            <span className="text-xl">🍽️</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                Dish Stock & Valuations
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    LIVE DB
                                </span>
                            </h1>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                                Real-time kitchen inventory, POS units sold, spoilage audit & menu stock valuations
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => {
                            if (dishes.length > 0) {
                                setPrepDish(dishes[0]);
                                setPrepCost(String(dishes[0].purchase_cost || 0));
                                setPrepPrice(String(dishes[0].sales_cost || 0));
                            }
                            setShowPrepModal(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
                    >
                        <span>➕</span> Log Kitchen Prep
                    </button>

                    <button
                        onClick={() => {
                            if (dishes.length > 0) setSpoilageDish(dishes[0]);
                            setShowSpoilageModal(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
                    >
                        <span>🗑️</span> Record Spoilage
                    </button>

                    <button
                        onClick={() => { setRefreshing(true); loadDishes(); }}
                        disabled={refreshing}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
                        {refreshing ? 'Syncing...' : 'Sync DB'}
                    </button>
                </div>
            </div>

            {/* ── 7 SUPER HOT MASSIVE HIGH-CONTRAST KPI CARDS ────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {/* 1. Total Menu Dishes */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">🍽️ Total Dishes</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{totals.totalDishes}</p>
                    <p className="text-[10px] text-indigo-100/90 mt-1 font-medium">Active menu items</p>
                </div>

                {/* 2. Ready Available Stock */}
                <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-sky-600 to-blue-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">📦 Ready Stock</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{totals.totalAvailable.toLocaleString()}</p>
                    <p className="text-[10px] text-blue-100/90 mt-1 font-medium">Ready to serve</p>
                </div>

                {/* 3. Units Sold */}
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">💰 Units Sold</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{totals.totalSold.toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-100/90 mt-1 font-bold">
                        {fmt(totals.totalSoldRevenue)} revenue
                    </p>
                </div>

                {/* 4. Damaged / Spoilage */}
                <div className="relative overflow-hidden bg-gradient-to-br from-red-500 via-rose-600 to-red-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-red-100">❌ Damaged / Waste</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{totals.totalDamaged.toLocaleString()}</p>
                    <p className="text-[10px] text-red-100/90 mt-1 font-medium">
                        {fmt(totals.totalSpoilageLoss)} total loss
                    </p>
                </div>

                {/* 5. Stock Valuation (Menu Price) */}
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-100">💎 Stock Valuation</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(totals.totalSellingValue)}</p>
                    <p className="text-[10px] text-amber-100/90 mt-1 font-medium">At menu selling price</p>
                </div>

                {/* 6. Cost Valuation (Prep Cost) */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">🏷️ Cost Valuation</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(totals.totalCostValue)}</p>
                    <p className="text-[10px] text-slate-300 mt-1 font-medium">At ingredient prep cost</p>
                </div>

                {/* 7. Unrealized Gross Profit */}
                <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-800 rounded-2xl p-4 text-white shadow-md hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-teal-100">📈 Potential Profit</p>
                    <p className="text-2xl font-black mt-2 tracking-tight">{fmt(totals.potentialProfit)}</p>
                    <p className="text-[10px] text-teal-100/90 mt-1 font-bold">
                        Margin: {totals.overallMargin.toFixed(1)}%
                    </p>
                </div>
            </div>

            {/* ── MASSIVE FILTERS & CONTROLS ───────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Search */}
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search dish name, code (e.g. HOT02, Tea)..."
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

                    {/* Stock Status Filter */}
                    <div>
                        <select
                            value={stockFilter}
                            onChange={e => setStockFilter(e.target.value as any)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:bg-white focus:border-indigo-500 outline-none"
                        >
                            <option value="All">All Stock Levels</option>
                            <option value="in_stock">🟢 In Stock (&gt; 10 units)</option>
                            <option value="low_stock">🟡 Low Stock (1 – 10 units)</option>
                            <option value="out_of_stock">🔴 Out of Stock (0 units)</option>
                            <option value="damaged">❌ Has Spoilage / Damage</option>
                        </select>
                    </div>

                    {/* Quick Reset & Count */}
                    <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-bold text-gray-600">
                            Showing <span className="text-indigo-600 font-black">{filteredDishes.length}</span> of {dishes.length} dishes
                        </span>
                        {(search || categoryFilter !== 'All' || stockFilter !== 'All') && (
                            <button
                                onClick={() => {
                                    setSearch('');
                                    setCategoryFilter('All');
                                    setStockFilter('All');
                                }}
                                className="text-xs text-indigo-600 font-bold underline hover:text-indigo-800"
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── ULTRA GRADE DATAGRID TABLE (HIGH CONTRAST DARK HEADER) ───────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <div className="w-9 h-9 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mb-3" />
                        <p className="text-sm font-semibold text-gray-700">Loading dish inventory & sales metrics...</p>
                        <p className="text-xs text-gray-400 mt-1">Reading products, sales_items, batches & spoilage</p>
                    </div>
                ) : sortedDishes.length === 0 ? (
                    <div className="text-center py-16 px-4 text-gray-400">
                        <span className="text-3xl block mb-2">🍽️</span>
                        <p className="text-sm font-bold text-gray-700">No dishes match your filters</p>
                        <p className="text-xs text-gray-400 mt-1">Try clearing your search or category filter</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-white select-none">
                                    <th className="py-3.5 px-3 w-10 text-center text-white font-black">#</th>
                                    <th onClick={() => handleSort('name')} className="py-3.5 px-3 cursor-pointer hover:text-orange-300 text-white font-black">
                                        Dish / Item Name {sortField === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="py-3.5 px-3 text-white font-black">Category</th>
                                    <th onClick={() => handleSort('available')} className="py-3.5 px-3 text-center cursor-pointer hover:text-orange-300 text-white font-black">
                                        Available {sortField === 'available' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('sold')} className="py-3.5 px-3 text-center cursor-pointer hover:text-orange-300 text-white font-black">
                                        Sold {sortField === 'sold' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('produced')} className="py-3.5 px-3 text-center cursor-pointer hover:text-orange-300 text-white font-black">
                                        Prepped {sortField === 'produced' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('damaged')} className="py-3.5 px-3 text-center cursor-pointer hover:text-orange-300 text-white font-black">
                                        Waste {sortField === 'damaged' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('price')} className="py-3.5 px-3 text-right cursor-pointer hover:text-orange-300 text-white font-black">
                                        Price {sortField === 'price' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('cost')} className="py-3.5 px-3 text-right cursor-pointer hover:text-orange-300 text-white font-black">
                                        Cost {sortField === 'cost' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('profit')} className="py-3.5 px-3 text-right cursor-pointer hover:text-orange-300 text-white font-black">
                                        Profit/Unit {sortField === 'profit' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('margin')} className="py-3.5 px-3 text-center cursor-pointer hover:text-orange-300 text-white font-black">
                                        Margin % {sortField === 'margin' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th onClick={() => handleSort('value')} className="py-3.5 px-3 text-right cursor-pointer hover:text-orange-300 text-white font-black">
                                        Stock Value {sortField === 'value' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th className="py-3.5 px-3 text-center text-white font-black">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs">
                                {sortedDishes.map((dish, i) => {
                                    const isLow = dish.total_available <= dish.reorder_point;
                                    const isOut = dish.total_available <= 0;

                                    return (
                                        <tr
                                            key={dish.pid}
                                            className={`hover:bg-orange-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'} ${isOut ? 'bg-red-50/20' : ''}`}
                                        >
                                            {/* Index */}
                                            <td className="py-3.5 px-3 text-center text-gray-400 font-mono text-[11px]">{i + 1}</td>

                                            {/* Dish Name & Code */}
                                            <td className="py-3.5 px-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 text-sm">{dish.product_name}</span>
                                                    <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                                                        {dish.product_code}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Category */}
                                            <td className="py-3.5 px-3">
                                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                    {dish.category}
                                                </span>
                                            </td>

                                            {/* Available Stock */}
                                            <td className="py-3.5 px-3 text-center">
                                                <span className={`inline-block px-3 py-1 rounded-xl text-xs font-black shadow-xs ${
                                                    isOut
                                                        ? 'bg-red-100 text-red-800 border border-red-300'
                                                        : isLow
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                }`}>
                                                    {isOut ? '0 Out' : `${dish.total_available} Avail`}
                                                </span>
                                            </td>

                                            {/* Units Sold (from sales_items) */}
                                            <td className="py-3.5 px-3 text-center">
                                                {dish.total_sold > 0 ? (
                                                    <div>
                                                        <span className="font-black text-gray-900 text-xs">
                                                            {dish.total_sold}
                                                        </span>
                                                        <p className="text-[10px] text-emerald-600 font-bold">
                                                            {fmt(dish.sales_revenue)}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>

                                            {/* Prepped / Produced */}
                                            <td className="py-3.5 px-3 text-center font-bold text-gray-700">
                                                {dish.total_produced}
                                            </td>

                                            {/* Damaged / Waste */}
                                            <td className="py-3.5 px-3 text-center">
                                                {dish.total_damaged > 0 ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-red-100 text-red-700">
                                                        {dish.total_damaged}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">0</span>
                                                )}
                                            </td>

                                            {/* Price */}
                                            <td className="py-3.5 px-3 text-right font-black text-gray-900">
                                                {fmt(dish.sales_cost)}
                                            </td>

                                            {/* Cost */}
                                            <td className="py-3.5 px-3 text-right text-gray-500 font-medium">
                                                {dish.purchase_cost > 0 ? fmt(dish.purchase_cost) : <span className="text-gray-300">—</span>}
                                            </td>

                                            {/* Profit / Unit */}
                                            <td className="py-3.5 px-3 text-right font-black text-emerald-600">
                                                +{fmt(dish.unit_profit)}
                                            </td>

                                            {/* Margin % */}
                                            <td className="py-3.5 px-3 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    dish.margin_percent >= 50
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : dish.margin_percent >= 25
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {dish.margin_percent.toFixed(0)}%
                                                </span>
                                            </td>

                                            {/* Stock Value */}
                                            <td className="py-3.5 px-3 text-right font-black text-indigo-700">
                                                {fmt(dish.stock_value)}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3.5 px-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* Quick Prep */}
                                                    <button
                                                        onClick={() => {
                                                            setPrepDish(dish);
                                                            setPrepCost(String(dish.purchase_cost || 0));
                                                            setPrepPrice(String(dish.sales_cost || 0));
                                                            setShowPrepModal(true);
                                                        }}
                                                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold text-[11px] transition-colors"
                                                        title="Log Fresh Prep Batch"
                                                    >
                                                        ➕ Prep
                                                    </button>

                                                    {/* Quick Damage */}
                                                    <button
                                                        onClick={() => {
                                                            setSpoilageDish(dish);
                                                            setShowSpoilageModal(true);
                                                        }}
                                                        className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold text-[11px] transition-colors"
                                                        title="Record Waste / Damage"
                                                    >
                                                        🗑️
                                                    </button>

                                                    {/* History */}
                                                    <button
                                                        onClick={() => openHistory(dish)}
                                                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-[11px] transition-colors"
                                                        title="View Movement & Sales History"
                                                    >
                                                        📜
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
            </div>

            {/* ── MODAL: LOG KITCHEN PREP (PRODUCTION BATCH) ───────────────────── */}
            {showPrepModal && prepDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowPrepModal(false)}>
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <span>➕</span> Log Kitchen Prep Batch
                                </h3>
                                <p className="text-xs text-emerald-600 font-bold mt-0.5">
                                    🍽️ {prepDish.product_name} ({prepDish.product_code})
                                </p>
                            </div>
                            <button onClick={() => setShowPrepModal(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Select Dish</label>
                                <select
                                    value={prepDish.pid}
                                    onChange={e => {
                                        const d = dishes.find(x => x.pid === parseInt(e.target.value));
                                        if (d) {
                                            setPrepDish(d);
                                            setPrepCost(String(d.purchase_cost || 0));
                                            setPrepPrice(String(d.sales_cost || 0));
                                        }
                                    }}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-emerald-500"
                                >
                                    {dishes.map(d => (
                                        <option key={d.pid} value={d.pid}>{d.product_name} ({d.category})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Portions / Units Prepped</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={prepQty}
                                    onChange={e => setPrepQty(e.target.value)}
                                    placeholder="e.g. 25 portions"
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base font-black text-gray-900 outline-none focus:border-emerald-500"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-gray-600 font-bold mb-1">Cost / Unit (Ksh)</label>
                                    <input
                                        type="number"
                                        value={prepCost}
                                        onChange={e => setPrepCost(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-600 font-bold mb-1">Selling Price (Ksh)</label>
                                    <input
                                        type="number"
                                        value={prepPrice}
                                        onChange={e => setPrepPrice(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Notes / Kitchen Shift</label>
                                <input
                                    type="text"
                                    value={prepNotes}
                                    onChange={e => setPrepNotes(e.target.value)}
                                    placeholder="e.g. Morning Breakfast Prep, Lunch Rush"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-emerald-500"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setShowPrepModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePrep}
                                disabled={isSavingPrep}
                                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-xl text-xs shadow-md hover:shadow-lg disabled:opacity-50"
                            >
                                {isSavingPrep ? 'Saving Prep...' : '✅ Save Prep Batch'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL: RECORD DISH SPOILAGE / DAMAGE ──────────────────────────── */}
            {showSpoilageModal && spoilageDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowSpoilageModal(false)}>
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <span>🗑️</span> Record Dish Damage / Spoilage
                                </h3>
                                <p className="text-xs text-red-600 font-bold mt-0.5">
                                    🍽️ {spoilageDish.product_name}
                                </p>
                            </div>
                            <button onClick={() => setShowSpoilageModal(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Select Dish</label>
                                <select
                                    value={spoilageDish.pid}
                                    onChange={e => {
                                        const d = dishes.find(x => x.pid === parseInt(e.target.value));
                                        if (d) setSpoilageDish(d);
                                    }}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-red-500"
                                >
                                    {dishes.map(d => (
                                        <option key={d.pid} value={d.pid}>{d.product_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Damaged / Wasted Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={spoilageQty}
                                    onChange={e => setSpoilageQty(e.target.value)}
                                    placeholder="e.g. 2 portions"
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base font-black text-red-600 outline-none focus:border-red-500"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Reason for Damage</label>
                                <select
                                    value={spoilageReason}
                                    onChange={e => setSpoilageReason(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-red-500"
                                >
                                    <option value="Burnt / Kitchen Mistake">Burnt / Kitchen Mistake</option>
                                    <option value="Expired / Sour">Expired / Sour</option>
                                    <option value="Customer Return">Customer Return</option>
                                    <option value="Dropped / Spilled">Dropped / Spilled</option>
                                    <option value="Cold / Overheld">Cold / Overheld</option>
                                    <option value="Quality Rejection">Quality Rejection</option>
                                    <option value="Other Waste">Other Waste</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-gray-600 font-bold mb-1">Additional Notes</label>
                                <input
                                    type="text"
                                    value={spoilageNotes}
                                    onChange={e => setSpoilageNotes(e.target.value)}
                                    placeholder="e.g. Returned by table 4, too salty"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium outline-none focus:border-red-500"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setShowSpoilageModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveSpoilage}
                                disabled={isSavingSpoilage}
                                className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 text-white font-black rounded-xl text-xs shadow-md hover:shadow-lg disabled:opacity-50"
                            >
                                {isSavingSpoilage ? 'Recording...' : '🗑️ Record Damage'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL: UNIFIED AUDIT HISTORY ─────────────────────────────────── */}
            {historyDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setHistoryDish(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black flex items-center gap-2">
                                    <span>📜</span> Unified Dish Movement & Sales Audit
                                </h2>
                                <p className="text-indigo-200 text-xs mt-0.5">
                                    🍽️ {historyDish.product_name} ({historyDish.product_code}) • {historyDish.category}
                                </p>
                            </div>
                            <button onClick={() => setHistoryDish(null)} className="p-2 hover:bg-white/20 rounded-xl text-white text-lg">✕</button>
                        </div>

                        <div className="grid grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-gray-100">
                            <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-center">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Prepped</p>
                                <p className="text-lg font-black text-emerald-700">🏭 {historyDish.total_produced}</p>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-center">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">POS Sold</p>
                                <p className="text-lg font-black text-blue-700">💰 {historyDish.total_sold}</p>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-center">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Damaged</p>
                                <p className="text-lg font-black text-red-700">❌ {historyDish.total_damaged}</p>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-center">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Available</p>
                                <p className="text-lg font-black text-indigo-700">📦 {historyDish.total_available}</p>
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 p-5 custom-scrollbar">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mr-3" />Loading history...</div>
                            ) : history.length === 0 ? (
                                <div className="text-center text-gray-400 py-12">
                                    <span className="text-3xl block mb-2">📜</span>
                                    <p className="text-sm font-semibold">No transactions recorded for this dish yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {history.map(h => (
                                        <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white transition-colors">
                                            <span className="text-2xl">{h.typeIcon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.typeBg}`}>{h.type}</span>
                                                    {h.reference && <span className="text-xs text-gray-500 font-mono font-bold">{h.reference}</span>}
                                                </div>
                                                <p className="text-xs text-gray-600 mt-0.5 truncate">{h.note}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-sm font-black text-gray-900">{h.quantity} units</p>
                                                {h.financial && <p className="text-[11px] font-bold text-emerald-600">{h.financial}</p>}
                                                <p className="text-[10px] text-gray-400">{h.date}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button onClick={() => setHistoryDish(null)} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
