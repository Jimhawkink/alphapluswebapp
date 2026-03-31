'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface IngredientStock {
    pid: number;
    product_name: string;
    category: string;
    base_unit: string;
    current_stock: number;
    purchase_cost: number;
    price_per_pack: number;
    pack_size: number;
    total_purchased: number;
    total_issued: number;
    total_returned: number;
    total_damaged: number;
}

interface IngredientHistoryRow {
    id: number;
    date: string;
    type: string;
    typeIcon: string;
    typeBg: string;
    quantity: number;
    unit: string;
    reference: string;
    note: string;
}

export default function IngredientStockPage() {
    const [ingredients, setIngredients] = useState<IngredientStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [categories, setCategories] = useState<string[]>([]);
    const [historyIngredient, setHistoryIngredient] = useState<IngredientStock | null>(null);
    const [history, setHistory] = useState<IngredientHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadIngredients = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get all ingredients
            const { data: ingList } = await supabase.from('products_ingredients').select('pid, product_name, category, base_unit, current_stock, purchase_cost, price_per_pack, pack_size, cost_per_base_unit').eq('active', true).order('product_name');

            // 2. Get stock_movements for ingredients
            const { data: movements } = await supabase.from('stock_movements').select('product_id, movement_type, quantity');

            // 3. Get recipe_ingredients for issued totals
            const { data: recipeIssues } = await supabase.from('recipe_ingredients').select('ingredient_product_id, qty_issued');

            // Build movement map
            const moveMap = new Map<number, { purchased: number; returned: number; damaged: number }>();
            (movements || []).forEach((m: any) => {
                const cur = moveMap.get(m.product_id) || { purchased: 0, returned: 0, damaged: 0 };
                const mt = (m.movement_type || '').toLowerCase();
                if (mt.includes('purchase') || mt.includes('received') || mt.includes('in')) {
                    cur.purchased += m.quantity || 0;
                } else if (mt.includes('return')) {
                    cur.returned += m.quantity || 0;
                } else if (mt.includes('damage') || mt.includes('spoil') || mt.includes('waste') || mt.includes('loss') || mt.includes('adjustment_out')) {
                    cur.damaged += m.quantity || 0;
                }
                moveMap.set(m.product_id, cur);
            });

            // Build recipe issue map
            const issueMap = new Map<number, number>();
            (recipeIssues || []).forEach((r: any) => {
                issueMap.set(r.ingredient_product_id, (issueMap.get(r.ingredient_product_id) || 0) + (r.qty_issued || 0));
            });

            // Get categories
            const cats = Array.from(new Set((ingList || []).map((p: any) => p.category).filter(Boolean))).sort();
            setCategories(cats as string[]);

            // Build ingredient list
            const list: IngredientStock[] = (ingList || []).map((p: any) => {
                const mv = moveMap.get(p.pid) || { purchased: 0, returned: 0, damaged: 0 };
                const issued = issueMap.get(p.pid) || 0;
                return {
                    pid: p.pid,
                    product_name: p.product_name,
                    category: p.category || 'Uncategorized',
                    base_unit: p.base_unit || 'KG',
                    current_stock: p.current_stock || 0,
                    purchase_cost: p.purchase_cost || 0,
                    price_per_pack: p.price_per_pack || 0,
                    pack_size: p.pack_size || 1,
                    total_purchased: mv.purchased,
                    total_issued: issued,
                    total_returned: mv.returned,
                    total_damaged: mv.damaged,
                };
            });

            setIngredients(list);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, []);

    useEffect(() => { loadIngredients(); }, [loadIngredients]);

    const openHistory = async (ing: IngredientStock) => {
        setHistoryIngredient(ing);
        setHistoryLoading(true);
        setHistory([]);

        try {
            const rows: IngredientHistoryRow[] = [];

            // 1. Stock movements
            const { data: moves } = await supabase.from('stock_movements').select('movement_id, movement_date, movement_type, quantity, unit, reference_no, reason, created_by').eq('product_id', ing.pid).order('movement_date', { ascending: false });
            (moves || []).forEach((m: any) => {
                let icon = '📦'; let bg = 'bg-blue-100 text-blue-700';
                const mt = (m.movement_type || '').toLowerCase();
                if (mt.includes('purchase') || mt.includes('received') || mt === 'in') { icon = '🛒'; bg = 'bg-emerald-100 text-emerald-700'; }
                else if (mt.includes('return')) { icon = '↩️'; bg = 'bg-purple-100 text-purple-700'; }
                else if (mt.includes('damage') || mt.includes('spoil') || mt.includes('waste') || mt.includes('loss')) { icon = '❌'; bg = 'bg-red-100 text-red-700'; }
                else if (mt.includes('recipe') || mt.includes('issue') || mt.includes('used') || mt.includes('out')) { icon = '🍳'; bg = 'bg-orange-100 text-orange-700'; }
                else if (mt.includes('transfer')) { icon = '🔄'; bg = 'bg-indigo-100 text-indigo-700'; }
                rows.push({ id: m.movement_id, date: m.movement_date, type: m.movement_type, typeIcon: icon, typeBg: bg, quantity: m.quantity, unit: m.unit || ing.base_unit, reference: m.reference_no || '', note: m.reason || `By ${m.created_by || 'System'}` });
            });

            // 2. Recipe ingredient issues
            const { data: issues } = await supabase.from('recipe_ingredients').select('ingredient_id, recipe_date, qty_issued, unit_measure, recipe_id, recipes(dish_name)').eq('ingredient_product_id', ing.pid).order('recipe_date', { ascending: false });
            (issues || []).forEach((r: any) => {
                const dishName = r.recipes?.dish_name || `Recipe #${r.recipe_id}`;
                rows.push({ id: 8000 + r.ingredient_id, date: r.recipe_date, type: 'Issued to Recipe', typeIcon: '🍳', typeBg: 'bg-orange-100 text-orange-700', quantity: r.qty_issued, unit: r.unit_measure || ing.base_unit, reference: '', note: `For: ${dishName}` });
            });

            rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(rows);
        } catch (err) { console.error(err); }
        setHistoryLoading(false);
    };

    const filtered = ingredients.filter(d => {
        if (search && !d.product_name.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
        return true;
    });

    return (
        <div className="space-y-6 animate-rise">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">🧂 Ingredient Stock</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Available ingredient inventory with purchase, recipe usage & damage history</p>
                </div>
                <button onClick={loadIngredients} className="btn-neo-teal">🔄 Refresh</button>
            </div>

            {/* Filters */}
            <div className="neo-card p-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search Ingredient</label>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. Sugar, Flour..."
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

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="neo-card p-4 border-l-4 border-emerald-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Total Ingredients</p>
                    <p className="text-xl font-black text-gray-800 mt-1">{filtered.length}</p>
                </div>
                <div className="neo-card p-4 border-l-4 border-blue-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Good Stock (&gt;10)</p>
                    <p className="text-xl font-black text-emerald-600 mt-1">{filtered.filter(d => d.current_stock > 10).length}</p>
                </div>
                <div className="neo-card p-4 border-l-4 border-amber-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Low Stock (≤10)</p>
                    <p className="text-xl font-black text-amber-600 mt-1">{filtered.filter(d => d.current_stock > 0 && d.current_stock <= 10).length}</p>
                </div>
                <div className="neo-card p-4 border-l-4 border-red-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Out of Stock</p>
                    <p className="text-xl font-black text-red-600 mt-1">{filtered.filter(d => d.current_stock <= 0).length}</p>
                </div>
            </div>

            {/* Data Grid */}
            <div className="neo-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading ingredients...</span></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-indigo-600 to-purple-500">
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">#</th>
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Ingredient</th>
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Category</th>
                                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase">Available</th>
                                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase">Unit</th>
                                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase">Purchased</th>
                                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase">Issued</th>
                                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase">Returned</th>
                                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase">Damaged</th>
                                    <th className="px-3 py-3 text-center text-[10px] font-bold uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={10} className="text-center py-12 text-gray-400 text-sm">No ingredients found</td></tr>
                                ) : filtered.map((d, i) => (
                                    <tr key={d.pid} className={`border-b border-gray-100 hover:bg-indigo-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                        <td className="px-3 py-3 text-xs text-gray-400">{i + 1}</td>
                                        <td className="px-3 py-3 text-sm font-bold text-gray-800">🧂 {d.product_name}</td>
                                        <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">{d.category}</span></td>
                                        <td className="px-3 py-3 text-right">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-black ${d.current_stock > 10 ? 'bg-emerald-100 text-emerald-700' : d.current_stock > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                {d.current_stock}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-center text-xs text-gray-500 font-medium">{d.base_unit}</td>
                                        <td className="px-3 py-3 text-center">
                                            {d.total_purchased > 0 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">🛒 {d.total_purchased}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {d.total_issued > 0 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">🍳 {d.total_issued.toFixed(1)}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {d.total_returned > 0 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">↩️ {d.total_returned}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {d.total_damaged > 0 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">❌ {d.total_damaged}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <button onClick={() => openHistory(d)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" title="View History">
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
            {historyIngredient && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setHistoryIngredient(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-500 px-6 py-4 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">📜 Ingredient History</h2>
                                <p className="text-indigo-200 text-xs mt-0.5">🧂 {historyIngredient.product_name} ({historyIngredient.base_unit})</p>
                            </div>
                            <button onClick={() => setHistoryIngredient(null)} className="p-2 hover:bg-white/20 rounded-xl text-white">✕</button>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-5 gap-2 p-4">
                            <div className="p-3 bg-blue-50 rounded-xl text-center">
                                <p className="text-[8px] text-blue-600 font-bold uppercase">Available</p>
                                <p className="text-lg font-black text-blue-700">📦 {historyIngredient.current_stock}</p>
                            </div>
                            <div className="p-3 bg-emerald-50 rounded-xl text-center">
                                <p className="text-[8px] text-emerald-600 font-bold uppercase">Purchased</p>
                                <p className="text-lg font-black text-emerald-700">🛒 {historyIngredient.total_purchased}</p>
                            </div>
                            <div className="p-3 bg-orange-50 rounded-xl text-center">
                                <p className="text-[8px] text-orange-600 font-bold uppercase">Issued</p>
                                <p className="text-lg font-black text-orange-700">🍳 {historyIngredient.total_issued.toFixed(1)}</p>
                            </div>
                            <div className="p-3 bg-purple-50 rounded-xl text-center">
                                <p className="text-[8px] text-purple-600 font-bold uppercase">Returned</p>
                                <p className="text-lg font-black text-purple-700">↩️ {historyIngredient.total_returned}</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-xl text-center">
                                <p className="text-[8px] text-red-600 font-bold uppercase">Damaged</p>
                                <p className="text-lg font-black text-red-700">❌ {historyIngredient.total_damaged}</p>
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
                                                <p className="text-sm font-black text-gray-800">{h.quantity} <span className="text-[10px] text-gray-400">{h.unit}</span></p>
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
