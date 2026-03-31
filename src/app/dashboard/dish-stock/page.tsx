'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface BatchRow {
    batch_id: number;
    batch_number: string;
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
    product_name: string;
    category: string;
    sales_cost: number;
    purchase_cost: number;
    total_available: number;
    total_produced: number;
    total_sold: number;
    total_damaged: number;
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
}

export default function DishStockPage() {
    const [dishes, setDishes] = useState<DishStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [categories, setCategories] = useState<string[]>([]);
    const [expandedDish, setExpandedDish] = useState<DishStock | null>(null);
    const [historyDish, setHistoryDish] = useState<DishStock | null>(null);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadDishes = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get all active products (dishes)
            const { data: products } = await supabase
                .from('products')
                .select('pid, product_name, category, sales_cost, purchase_cost')
                .eq('active', true)
                .order('product_name');

            // 2. Get ALL production batches (including all statuses for history)
            const { data: allBatches } = await supabase
                .from('production_batches')
                .select('batch_id, batch_number, product_id, qty_produced, qty_remaining, qty_sold, cost_per_unit, selling_price, production_date, expiry_date, status, created_by')
                .order('production_date', { ascending: false });

            // 3. Get dish spoilage summary
            const { data: spoilage } = await supabase.from('dish_spoilage').select('product_id, quantity');

            // Build spoilage map
            const spoilMap = new Map<number, number>();
            (spoilage || []).forEach((s: any) => {
                spoilMap.set(s.product_id, (spoilMap.get(s.product_id) || 0) + (s.quantity || 0));
            });

            // Build batch map grouped by product
            const batchMap = new Map<number, BatchRow[]>();
            const stockMap = new Map<number, { available: number; produced: number; sold: number }>();
            (allBatches || []).forEach((b: any) => {
                const pid = b.product_id;
                // Group batches
                if (!batchMap.has(pid)) batchMap.set(pid, []);
                batchMap.get(pid)!.push({
                    batch_id: b.batch_id,
                    batch_number: b.batch_number || `B-${b.batch_id}`,
                    qty_produced: b.qty_produced || 0,
                    qty_remaining: b.qty_remaining || 0,
                    qty_sold: b.qty_sold || 0,
                    cost_per_unit: b.cost_per_unit || 0,
                    selling_price: b.selling_price || 0,
                    production_date: b.production_date || '',
                    expiry_date: b.expiry_date || '',
                    status: b.status || 'Active',
                    created_by: b.created_by || '',
                });
                // Totals (only count "In Stock" for available)
                const cur = stockMap.get(pid) || { available: 0, produced: 0, sold: 0 };
                cur.produced += b.qty_produced || 0;
                cur.sold += b.qty_sold || 0;
                if (b.status === 'In Stock' || b.status === 'Active') {
                    cur.available += b.qty_remaining || 0;
                }
                stockMap.set(pid, cur);
            });

            // Get categories
            const cats = Array.from(new Set((products || []).map((p: any) => p.category).filter(Boolean))).sort();
            setCategories(cats as string[]);

            // Build dish stock list
            const dishList: DishStock[] = (products || []).map((p: any) => {
                const st = stockMap.get(p.pid) || { available: 0, produced: 0, sold: 0 };
                const damaged = spoilMap.get(p.pid) || 0;
                return {
                    pid: p.pid,
                    product_name: p.product_name,
                    category: p.category || 'Uncategorized',
                    sales_cost: p.sales_cost || 0,
                    purchase_cost: p.purchase_cost || 0,
                    total_available: st.available,
                    total_produced: st.produced,
                    total_sold: st.sold,
                    total_damaged: damaged,
                    batches: batchMap.get(p.pid) || [],
                };
            });

            setDishes(dishList);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, []);

    useEffect(() => { loadDishes(); }, [loadDishes]);

    const openHistory = async (dish: DishStock) => {
        setHistoryDish(dish);
        setHistoryLoading(true);
        setHistory([]);
        try {
            const rows: HistoryRow[] = [];

            // Production batches
            (dish.batches || []).forEach((b, i) => {
                rows.push({ id: 1000 + i, date: b.production_date, type: 'Produced', typeIcon: '🏭', typeBg: 'bg-emerald-100 text-emerald-700', quantity: b.qty_produced, reference: b.batch_number, note: `By ${b.created_by || 'System'}` });
            });

            // Dish movements
            const { data: moves } = await supabase.from('dish_movements').select('movement_id, movement_date, movement_type, quantity, reference_no, reason').eq('product_id', dish.pid).order('movement_date', { ascending: false });
            (moves || []).forEach((m: any) => {
                let icon = '📦'; let bg = 'bg-blue-100 text-blue-700';
                if (m.movement_type === 'Sale' || m.movement_type === 'Sold') { icon = '💰'; bg = 'bg-orange-100 text-orange-700'; }
                else if (m.movement_type === 'Damaged' || m.movement_type === 'Spoilage') { icon = '❌'; bg = 'bg-red-100 text-red-700'; }
                else if (m.movement_type === 'Production') { icon = '🏭'; bg = 'bg-emerald-100 text-emerald-700'; }
                else if (m.movement_type === 'Transfer') { icon = '🔄'; bg = 'bg-purple-100 text-purple-700'; }
                rows.push({ id: m.movement_id, date: m.movement_date, type: m.movement_type, typeIcon: icon, typeBg: bg, quantity: m.quantity, reference: m.reference_no || '', note: m.reason || '' });
            });

            // Spoilage
            const { data: spoils } = await supabase.from('dish_spoilage').select('spoilage_id, spoilage_date, quantity, spoilage_type, reason, recorded_by').eq('product_id', dish.pid).order('spoilage_date', { ascending: false });
            (spoils || []).forEach((s: any) => {
                rows.push({ id: 5000 + s.spoilage_id, date: s.spoilage_date, type: s.spoilage_type || 'Damaged', typeIcon: '❌', typeBg: 'bg-red-100 text-red-700', quantity: s.quantity, reference: '', note: `${s.reason || 'Spoilage'} — ${s.recorded_by || ''}` });
            });

            rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(rows);
        } catch (err) { console.error(err); }
        setHistoryLoading(false);
    };

    const filtered = dishes.filter(d => {
        if (search && !d.product_name.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
        return true;
    });

    const totals = {
        available: filtered.reduce((s, d) => s + d.total_available, 0),
        produced: filtered.reduce((s, d) => s + d.total_produced, 0),
        sold: filtered.reduce((s, d) => s + d.total_sold, 0),
        damaged: filtered.reduce((s, d) => s + d.total_damaged, 0),
        value: filtered.reduce((s, d) => s + (d.total_available * d.sales_cost), 0),
    };

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6 animate-rise">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">🍽️ Dish Stock</h1>
                    <p className="text-sm text-gray-500 mt-1">Available dish inventory with production batches & history</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={loadDishes} className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2">🔄 Refresh</button>
                </div>
            </div>

            {/* Gradient KPI Cards — like Alpha Retail */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">🏭 Total Produced</p>
                    <p className="text-2xl font-black mt-2">{totals.produced.toLocaleString()}</p>
                    <p className="text-[11px] opacity-75 mt-1">All time production</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">📦 Available Stock</p>
                    <p className="text-2xl font-black mt-2">{totals.available.toLocaleString()}</p>
                    <p className="text-[11px] opacity-75 mt-1">Ready for sale</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💰 Total Sold</p>
                    <p className="text-2xl font-black mt-2">{totals.sold.toLocaleString()}</p>
                    <p className="text-[11px] opacity-75 mt-1">Units sold</p>
                </div>
                <div className="bg-gradient-to-br from-red-400 to-pink-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">❌ Damaged</p>
                    <p className="text-2xl font-black mt-2">{totals.damaged.toLocaleString()}</p>
                    <p className="text-[11px] opacity-75 mt-1">Spoilage / waste</p>
                </div>
                <div className="bg-gradient-to-br from-purple-400 to-violet-600 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💎 Stock Value</p>
                    <p className="text-2xl font-black mt-2">{fmt(totals.value)}</p>
                    <p className="text-[11px] opacity-75 mt-1">At selling price</p>
                </div>
            </div>

            {/* Filters */}
            <div className="neo-card p-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search Dish</label>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. Ugali, Chapati..."
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Category</label>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none transition-colors">
                            <option value="All">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Data Grid */}
            <div className="neo-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading dish stock...</span></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-orange-500 to-amber-500">
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">#</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Dish Name</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Category</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-bold uppercase">Available</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-bold uppercase">Produced</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-bold uppercase">Sold</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-bold uppercase">Damaged</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-bold uppercase">Price</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={9} className="text-center py-16 text-gray-400 text-sm">No dishes found</td></tr>
                                ) : filtered.map((d, i) => (
                                    <tr key={d.pid} className={`border-b border-gray-100 hover:bg-orange-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                        <td className="px-4 py-3.5 text-sm text-gray-400">{i + 1}</td>
                                        <td className="px-4 py-3.5 text-sm font-bold text-gray-800">🍽️ {d.product_name}</td>
                                        <td className="px-4 py-3.5"><span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{d.category}</span></td>
                                        <td className="px-4 py-3.5 text-right">
                                            <span className={`px-3 py-1.5 rounded-lg text-sm font-black ${d.total_available > 10 ? 'bg-emerald-100 text-emerald-700' : d.total_available > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                {d.total_available}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right text-sm text-emerald-600 font-bold">{d.total_produced || '-'}</td>
                                        <td className="px-4 py-3.5 text-right text-sm text-orange-600 font-bold">{d.total_sold || '-'}</td>
                                        <td className="px-4 py-3.5 text-right text-sm text-red-500 font-bold">{d.total_damaged || '-'}</td>
                                        <td className="px-4 py-3.5 text-right text-sm font-medium text-gray-700">{fmt(d.sales_cost)}</td>
                                        <td className="px-4 py-3.5 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button onClick={() => openHistory(d)} className="p-2 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors text-sm" title="View History">📜</button>
                                                <button onClick={() => setExpandedDish(d)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm" title="View Batches">📦</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Glassmorphism Batch Selection Modal — like POS */}
            {expandedDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setExpandedDish(null)}>
                    <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <span>📦</span> Production Batches
                                </h2>
                                <p className="text-sm text-orange-600 font-medium mt-1">🍽️ {expandedDish.product_name}</p>
                            </div>
                            <button onClick={() => setExpandedDish(null)} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        {/* Total Available */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl mb-4">
                            <span className="text-sm text-gray-600">Total Available from {expandedDish.batches.length} batch(es):</span>
                            <span className="text-xl font-bold text-green-600">{expandedDish.total_available} units</span>
                        </div>

                        {/* Batch Cards - Glassmorphism */}
                        <div className="flex-1 overflow-auto mb-4 space-y-3">
                            {expandedDish.batches.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <span className="text-4xl block mb-2">📦</span>
                                    <p className="text-sm">No production batches found for this dish</p>
                                </div>
                            ) : expandedDish.batches.map(b => {
                                const daysOld = b.production_date ? Math.floor((Date.now() - new Date(b.production_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                                const ageBg = daysOld <= 1 ? 'border-green-300 bg-green-50/80' : daysOld <= 7 ? 'border-blue-300 bg-blue-50/80' : daysOld <= 30 ? 'border-amber-300 bg-amber-50/80' : 'border-red-300 bg-red-50/80';
                                const ageLabel = daysOld === 0 ? 'Today' : daysOld === 1 ? '1 day' : `${daysOld} days`;
                                return (
                                    <div key={b.batch_id} className={`rounded-2xl border-2 p-4 backdrop-blur-sm transition-all hover:shadow-lg ${ageBg}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">📦</span>
                                                <span className="font-mono text-sm font-bold text-gray-800">{b.batch_number}</span>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${b.status === 'In Stock' ? 'bg-emerald-100 text-emerald-700' : b.status === 'Active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>{b.status}</span>
                                        </div>

                                        <div className="grid grid-cols-4 gap-3">
                                            <div className="bg-white/70 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">Produced</p>
                                                <p className="text-lg font-black text-emerald-600">{b.qty_produced}</p>
                                            </div>
                                            <div className="bg-white/70 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">Available</p>
                                                <p className={`text-lg font-black ${b.qty_remaining > 0 ? 'text-green-600' : 'text-red-500'}`}>{b.qty_remaining}</p>
                                            </div>
                                            <div className="bg-white/70 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">Sold</p>
                                                <p className="text-lg font-black text-orange-600">{b.qty_sold}</p>
                                            </div>
                                            <div className="bg-white/70 rounded-xl p-2.5 text-center backdrop-blur-sm">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">Age</p>
                                                <p className={`text-sm font-black ${daysOld <= 1 ? 'text-green-600' : daysOld <= 7 ? 'text-blue-600' : daysOld <= 30 ? 'text-amber-600' : 'text-red-600'}`}>{ageLabel}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/50 text-xs text-gray-500">
                                            <span>💰 Cost: <strong className="text-gray-700">{fmt(b.cost_per_unit)}</strong>/unit</span>
                                            <span>🏷️ Sell: <strong className="text-blue-600">{fmt(b.selling_price || expandedDish.sales_cost)}</strong></span>
                                            <span>📅 {b.production_date ? new Date(b.production_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</span>
                                            <span>👤 {b.created_by || 'Unknown'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div><span>Fresh (0-1 days)</span></div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div><span>Recent (2-7 days)</span></div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div><span>Moderate (8-30)</span></div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div><span>Old (30+)</span></div>
                        </div>

                        <button onClick={() => setExpandedDish(null)} className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Close</button>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {historyDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setHistoryDish(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-5 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">📜 Full Dish History</h2>
                                <p className="text-orange-100 text-sm mt-0.5">🍽️ {historyDish.product_name}</p>
                            </div>
                            <button onClick={() => setHistoryDish(null)} className="p-2 hover:bg-white/20 rounded-xl text-white text-lg">✕</button>
                        </div>

                        <div className="grid grid-cols-4 gap-3 p-5">
                            <div className="p-3 bg-emerald-50 rounded-xl text-center">
                                <p className="text-[10px] text-emerald-600 font-bold uppercase">Produced</p>
                                <p className="text-xl font-black text-emerald-700">🏭 {historyDish.total_produced}</p>
                            </div>
                            <div className="p-3 bg-orange-50 rounded-xl text-center">
                                <p className="text-[10px] text-orange-600 font-bold uppercase">Sold</p>
                                <p className="text-xl font-black text-orange-700">💰 {historyDish.total_sold}</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-xl text-center">
                                <p className="text-[10px] text-red-600 font-bold uppercase">Damaged</p>
                                <p className="text-xl font-black text-red-700">❌ {historyDish.total_damaged}</p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-xl text-center">
                                <p className="text-[10px] text-blue-600 font-bold uppercase">Available</p>
                                <p className="text-xl font-black text-blue-700">📦 {historyDish.total_available}</p>
                            </div>
                        </div>

                        <div className="overflow-y-auto max-h-[50vh] px-5 pb-5">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-10"><div className="spinner" /></div>
                            ) : history.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-10">No movement history found</p>
                            ) : (
                                <div className="space-y-2">
                                    {history.map(h => (
                                        <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                                            <span className="text-2xl">{h.typeIcon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.typeBg}`}>{h.type}</span>
                                                    {h.reference && <span className="text-xs text-gray-400 font-mono">{h.reference}</span>}
                                                </div>
                                                {h.note && <p className="text-xs text-gray-500 mt-0.5 truncate">{h.note}</p>}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-gray-800">{h.quantity}</p>
                                                <p className="text-xs text-gray-400">{h.date ? new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
