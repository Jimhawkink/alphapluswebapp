'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface DishStock {
    pid: number;
    product_name: string;
    category: string;
    sales_cost: number;
    purchase_cost: number;
    total_produced: number;
    total_sold: number;
    total_damaged: number;
    available_qty: number;
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
    const [historyDish, setHistoryDish] = useState<DishStock | null>(null);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadDishes = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get all products (dishes)
            const { data: products } = await supabase.from('products').select('pid, product_name, category, sales_cost, purchase_cost').eq('active', true).order('product_name');

            // 2. Get production batches summary
            const { data: batches } = await supabase.from('production_batches').select('product_id, qty_produced, qty_remaining, qty_sold').eq('status', 'Active');

            // 3. Get dish spoilage summary
            const { data: spoilage } = await supabase.from('dish_spoilage').select('product_id, quantity');

            // 4. Get stock summary
            const { data: stockRows } = await supabase.from('stock').select('pid, qty');

            // Build maps
            const batchMap = new Map<number, { produced: number; remaining: number; sold: number }>();
            (batches || []).forEach((b: any) => {
                const cur = batchMap.get(b.product_id) || { produced: 0, remaining: 0, sold: 0 };
                cur.produced += b.qty_produced || 0;
                cur.remaining += b.qty_remaining || 0;
                cur.sold += b.qty_sold || 0;
                batchMap.set(b.product_id, cur);
            });

            const spoilMap = new Map<number, number>();
            (spoilage || []).forEach((s: any) => {
                spoilMap.set(s.product_id, (spoilMap.get(s.product_id) || 0) + (s.quantity || 0));
            });

            const stockMap = new Map<number, number>();
            (stockRows || []).forEach((s: any) => {
                stockMap.set(s.pid, (stockMap.get(s.pid) || 0) + (s.qty || 0));
            });

            // Get categories
            const cats = Array.from(new Set((products || []).map((p: any) => p.category).filter(Boolean))).sort();
            setCategories(cats as string[]);

            // Build dish stock list
            const dishList: DishStock[] = (products || []).map((p: any) => {
                const bat = batchMap.get(p.pid) || { produced: 0, remaining: 0, sold: 0 };
                const damaged = spoilMap.get(p.pid) || 0;
                const stock = stockMap.get(p.pid) || 0;
                return {
                    pid: p.pid,
                    product_name: p.product_name,
                    category: p.category || 'Uncategorized',
                    sales_cost: p.sales_cost || 0,
                    purchase_cost: p.purchase_cost || 0,
                    total_produced: bat.produced,
                    total_sold: bat.sold,
                    total_damaged: damaged,
                    available_qty: stock > 0 ? stock : bat.remaining,
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

            // 1. Production batches
            const { data: batches } = await supabase.from('production_batches').select('batch_id, batch_number, qty_produced, production_date, created_by').eq('product_id', dish.pid).order('production_date', { ascending: false });
            (batches || []).forEach((b: any, i: number) => {
                rows.push({ id: 1000 + i, date: b.production_date, type: 'Produced', typeIcon: '🏭', typeBg: 'bg-emerald-100 text-emerald-700', quantity: b.qty_produced, reference: b.batch_number || '', note: `By ${b.created_by || 'System'}` });
            });

            // 2. Dish movements
            const { data: moves } = await supabase.from('dish_movements').select('movement_id, movement_date, movement_type, quantity, reference_no, reason').eq('product_id', dish.pid).order('movement_date', { ascending: false });
            (moves || []).forEach((m: any) => {
                let icon = '📦'; let bg = 'bg-blue-100 text-blue-700';
                if (m.movement_type === 'Sale' || m.movement_type === 'Sold') { icon = '💰'; bg = 'bg-orange-100 text-orange-700'; }
                else if (m.movement_type === 'Damaged' || m.movement_type === 'Spoilage') { icon = '❌'; bg = 'bg-red-100 text-red-700'; }
                else if (m.movement_type === 'Production') { icon = '🏭'; bg = 'bg-emerald-100 text-emerald-700'; }
                else if (m.movement_type === 'Transfer') { icon = '🔄'; bg = 'bg-purple-100 text-purple-700'; }
                rows.push({ id: m.movement_id, date: m.movement_date, type: m.movement_type, typeIcon: icon, typeBg: bg, quantity: m.quantity, reference: m.reference_no || '', note: m.reason || '' });
            });

            // 3. Spoilage
            const { data: spoils } = await supabase.from('dish_spoilage').select('spoilage_id, spoilage_date, quantity, spoilage_type, reason, recorded_by').eq('product_id', dish.pid).order('spoilage_date', { ascending: false });
            (spoils || []).forEach((s: any) => {
                rows.push({ id: 5000 + s.spoilage_id, date: s.spoilage_date, type: s.spoilage_type || 'Damaged', typeIcon: '❌', typeBg: 'bg-red-100 text-red-700', quantity: s.quantity, reference: '', note: `${s.reason || 'Spoilage'} — ${s.recorded_by || ''}` });
            });

            // Sort by date desc
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

    return (
        <div className="space-y-6 animate-rise">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">🍽️ Dish Stock</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Available dish inventory with production & spoilage history</p>
                </div>
                <button onClick={loadDishes} className="btn-neo-teal">🔄 Refresh</button>
            </div>

            {/* Filters */}
            <div className="neo-card p-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search Dish</label>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. Ugali, Chapati..."
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Category</label>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none">
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
                                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase">#</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase">Dish Name</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase">Category</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Available</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Produced</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Sold</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Damaged</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Price</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No dishes found</td></tr>
                                ) : filtered.map((d, i) => (
                                    <tr key={d.pid} className={`border-b border-gray-100 hover:bg-orange-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                        <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                                        <td className="px-4 py-3 text-sm font-bold text-gray-800">🍽️ {d.product_name}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{d.category}</span></td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-black ${d.available_qty > 10 ? 'bg-emerald-100 text-emerald-700' : d.available_qty > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                {d.available_qty}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-emerald-600 font-bold">{d.total_produced || '-'}</td>
                                        <td className="px-4 py-3 text-right text-xs text-orange-600 font-bold">{d.total_sold || '-'}</td>
                                        <td className="px-4 py-3 text-right text-xs text-red-500 font-bold">{d.total_damaged || '-'}</td>
                                        <td className="px-4 py-3 text-right text-xs font-medium text-gray-600">Ksh {d.sales_cost}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => openHistory(d)} className="p-1.5 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors" title="View History">
                                                📜
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* History Modal */}
            {historyDish && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setHistoryDish(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">📜 Dish History</h2>
                                <p className="text-orange-100 text-xs mt-0.5">🍽️ {historyDish.product_name}</p>
                            </div>
                            <button onClick={() => setHistoryDish(null)} className="p-2 hover:bg-white/20 rounded-xl text-white">✕</button>
                        </div>

                        {/* Quick stats */}
                        <div className="grid grid-cols-4 gap-2 p-4">
                            <div className="p-3 bg-emerald-50 rounded-xl text-center">
                                <p className="text-[9px] text-emerald-600 font-bold uppercase">Produced</p>
                                <p className="text-lg font-black text-emerald-700">🏭 {historyDish.total_produced}</p>
                            </div>
                            <div className="p-3 bg-orange-50 rounded-xl text-center">
                                <p className="text-[9px] text-orange-600 font-bold uppercase">Sold</p>
                                <p className="text-lg font-black text-orange-700">💰 {historyDish.total_sold}</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-xl text-center">
                                <p className="text-[9px] text-red-600 font-bold uppercase">Damaged</p>
                                <p className="text-lg font-black text-red-700">❌ {historyDish.total_damaged}</p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-xl text-center">
                                <p className="text-[9px] text-blue-600 font-bold uppercase">Available</p>
                                <p className="text-lg font-black text-blue-700">📦 {historyDish.available_qty}</p>
                            </div>
                        </div>

                        <div className="overflow-y-auto max-h-[50vh] px-4 pb-4">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-10"><div className="spinner" /></div>
                            ) : history.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-10">No movement history found</p>
                            ) : (
                                <div className="space-y-2">
                                    {history.map(h => (
                                        <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                                            <span className="text-xl">{h.typeIcon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${h.typeBg}`}>{h.type}</span>
                                                    {h.reference && <span className="text-[10px] text-gray-400 font-mono">{h.reference}</span>}
                                                </div>
                                                {h.note && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{h.note}</p>}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-gray-800">{h.quantity}</p>
                                                <p className="text-[10px] text-gray-400">{h.date ? new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
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
