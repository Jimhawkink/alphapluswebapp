'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface RecipeRow {
    recipe_id: number;
    dish_name: string;
    category: string;
    batch_number: string;
    production_date: string;
    qty_produced: number;
    qty_sold: number;
    qty_remaining: number;
    cost_per_unit: number;
    total_cost: number;
    selling_price: number;
    expected_revenue: number;
    expected_profit: number;
    profit_margin: number;
    created_by: string;
    status: string;
    ingredients: IngredientUsed[];
}

interface IngredientUsed {
    ingredient_name: string;
    qty_used: number;
    unit: string;
    cost: number;
}

export default function RecipeReportPage() {
    const [recipes, setRecipes] = useState<RecipeRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [search, setSearch] = useState('');
    const [expandedRow, setExpandedRow] = useState<number | null>(null);

    const loadRecipes = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Load production batches with product info
            let query = supabase
                .from('production_batches')
                .select('batch_id, batch_number, product_id, qty_produced, qty_remaining, qty_sold, cost_per_unit, selling_price, production_date, expiry_date, status, created_by, total_cost, products!inner(product_name, category, sales_cost)')
                .gte('production_date', dateFrom)
                .lte('production_date', dateTo)
                .order('production_date', { ascending: false });

            const { data: batches, error } = await query;
            if (error) throw error;

            // 2. Load recipe_ingredients for each batch
            const batchIds = (batches || []).map((b: any) => b.batch_id);
            let ingredientMap = new Map<number, IngredientUsed[]>();

            if (batchIds.length > 0) {
                const { data: recipeIngs } = await supabase
                    .from('recipe_ingredients')
                    .select('recipe_id, batch_id, ingredient_product_id, qty_issued, unit_measure, cost_per_unit, products_ingredients(product_name)')
                    .in('batch_id', batchIds);

                (recipeIngs || []).forEach((ri: any) => {
                    const bid = ri.batch_id;
                    if (!ingredientMap.has(bid)) ingredientMap.set(bid, []);
                    ingredientMap.get(bid)!.push({
                        ingredient_name: ri.products_ingredients?.product_name || `Ingredient #${ri.ingredient_product_id}`,
                        qty_used: ri.qty_issued || 0,
                        unit: ri.unit_measure || 'KG',
                        cost: (ri.cost_per_unit || 0) * (ri.qty_issued || 0),
                    });
                });
            }

            // 3. Build recipe rows
            const rows: RecipeRow[] = (batches || []).map((b: any) => {
                const prod = b.products || {};
                const sellPrice = b.selling_price || prod.sales_cost || 0;
                const costPerUnit = b.cost_per_unit || 0;
                const totalCost = b.total_cost || (costPerUnit * (b.qty_produced || 0));
                const expectedRevenue = sellPrice * (b.qty_produced || 0);
                const expectedProfit = expectedRevenue - totalCost;
                const margin = expectedRevenue > 0 ? (expectedProfit / expectedRevenue) * 100 : 0;

                return {
                    recipe_id: b.batch_id,
                    dish_name: prod.product_name || 'Unknown',
                    category: prod.category || 'Uncategorized',
                    batch_number: b.batch_number || `B-${b.batch_id}`,
                    production_date: b.production_date || '',
                    qty_produced: b.qty_produced || 0,
                    qty_sold: b.qty_sold || 0,
                    qty_remaining: b.qty_remaining || 0,
                    cost_per_unit: costPerUnit,
                    total_cost: totalCost,
                    selling_price: sellPrice,
                    expected_revenue: expectedRevenue,
                    expected_profit: expectedProfit,
                    profit_margin: margin,
                    created_by: b.created_by || '',
                    status: b.status || 'Active',
                    ingredients: ingredientMap.get(b.batch_id) || [],
                };
            });

            setRecipes(rows);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadRecipes(); }, [loadRecipes]);

    const filtered = recipes.filter(r => {
        if (search && !r.dish_name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const totals = {
        produced: filtered.reduce((s, r) => s + r.qty_produced, 0),
        sold: filtered.reduce((s, r) => s + r.qty_sold, 0),
        totalCost: filtered.reduce((s, r) => s + r.total_cost, 0),
        expectedRevenue: filtered.reduce((s, r) => s + r.expected_revenue, 0),
        expectedProfit: filtered.reduce((s, r) => s + r.expected_profit, 0),
        totalIngredients: filtered.reduce((s, r) => s + r.ingredients.length, 0),
    };

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6 animate-rise">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">🍳 Recipe Report</h1>
                    <p className="text-sm text-gray-500 mt-1">Production analysis — cost, ingredients, expected revenue & profit</p>
                </div>
                <button onClick={loadRecipes} className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2">🔄 Refresh</button>
            </div>

            {/* Gradient KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">🏭 Produced</p>
                    <p className="text-2xl font-black mt-2">{totals.produced.toLocaleString()}</p>
                    <p className="text-[11px] opacity-75 mt-1">Total dishes made</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💰 Sold</p>
                    <p className="text-2xl font-black mt-2">{totals.sold.toLocaleString()}</p>
                    <p className="text-[11px] opacity-75 mt-1">Dishes sold</p>
                </div>
                <div className="bg-gradient-to-br from-red-400 to-pink-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">📊 Total Cost</p>
                    <p className="text-2xl font-black mt-2">{fmt(totals.totalCost)}</p>
                    <p className="text-[11px] opacity-75 mt-1">Ingredients used</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">🧂 Ingredients</p>
                    <p className="text-2xl font-black mt-2">{totals.totalIngredients}</p>
                    <p className="text-[11px] opacity-75 mt-1">Items used</p>
                </div>
                <div className="bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💎 Expected Sale</p>
                    <p className="text-2xl font-black mt-2">{fmt(totals.expectedRevenue)}</p>
                    <p className="text-[11px] opacity-75 mt-1">If all sold</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">🎯 Expected Profit</p>
                    <p className="text-2xl font-black mt-2">{fmt(totals.expectedProfit)}</p>
                    <p className="text-[11px] opacity-75 mt-1">Upon selling all</p>
                </div>
            </div>

            {/* Filters */}
            <div className="neo-card p-5">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search Dish</label>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. Chapati, Ugali..."
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none transition-colors" />
                    </div>
                </div>
            </div>

            {/* Data Grid with Expandable Ingredient Details */}
            <div className="neo-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading recipe data...</span></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-purple-600 to-indigo-600">
                                    <th className="px-3 py-3.5 text-left text-xs font-bold uppercase w-10"></th>
                                    <th className="px-3 py-3.5 text-left text-xs font-bold uppercase">Dish</th>
                                    <th className="px-3 py-3.5 text-left text-xs font-bold uppercase">Batch #</th>
                                    <th className="px-3 py-3.5 text-left text-xs font-bold uppercase">Date</th>
                                    <th className="px-3 py-3.5 text-right text-xs font-bold uppercase">Qty Made</th>
                                    <th className="px-3 py-3.5 text-right text-xs font-bold uppercase">Sold</th>
                                    <th className="px-3 py-3.5 text-right text-xs font-bold uppercase">Cost/Unit</th>
                                    <th className="px-3 py-3.5 text-right text-xs font-bold uppercase">Total Cost</th>
                                    <th className="px-3 py-3.5 text-right text-xs font-bold uppercase">Exp. Revenue</th>
                                    <th className="px-3 py-3.5 text-right text-xs font-bold uppercase">Exp. Profit</th>
                                    <th className="px-3 py-3.5 text-center text-xs font-bold uppercase">Margin</th>
                                    <th className="px-3 py-3.5 text-center text-xs font-bold uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={12} className="text-center py-16 text-gray-400 text-sm">No recipe batches found for this period</td></tr>
                                ) : filtered.map((r, i) => (
                                    <>
                                        <tr key={r.recipe_id} className={`border-b border-gray-100 hover:bg-purple-50/30 transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                            onClick={() => setExpandedRow(expandedRow === r.recipe_id ? null : r.recipe_id)}>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`inline-block transition-transform duration-200 text-gray-400 ${expandedRow === r.recipe_id ? 'rotate-90' : ''}`}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18L15 12L9 6" /></svg>
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-sm font-bold text-gray-800">🍽️ {r.dish_name}</td>
                                            <td className="px-3 py-3 text-sm font-mono text-purple-600">{r.batch_number}</td>
                                            <td className="px-3 py-3 text-sm text-gray-600">{r.production_date ? new Date(r.production_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}</td>
                                            <td className="px-3 py-3 text-sm text-right font-bold text-emerald-600">{r.qty_produced}</td>
                                            <td className="px-3 py-3 text-sm text-right font-bold text-orange-600">{r.qty_sold}</td>
                                            <td className="px-3 py-3 text-sm text-right text-gray-600">{fmt(r.cost_per_unit)}</td>
                                            <td className="px-3 py-3 text-sm text-right font-bold text-red-600">{fmt(r.total_cost)}</td>
                                            <td className="px-3 py-3 text-sm text-right font-bold text-blue-600">{fmt(r.expected_revenue)}</td>
                                            <td className="px-3 py-3 text-sm text-right font-black text-emerald-700">{fmt(r.expected_profit)}</td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.profit_margin > 30 ? 'bg-emerald-100 text-emerald-700' : r.profit_margin > 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                    {r.profit_margin.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status === 'In Stock' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                                            </td>
                                        </tr>

                                        {/* Expanded ingredient details */}
                                        {expandedRow === r.recipe_id && (
                                            <tr key={`ing-${r.recipe_id}`}>
                                                <td colSpan={12} className="p-0">
                                                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-l-4 border-purple-400 px-6 py-4">
                                                        <h4 className="text-sm font-bold text-purple-700 mb-3 flex items-center gap-2">🧂 Ingredients Used — {r.dish_name} ({r.batch_number})
                                                            <span className="text-xs font-medium text-purple-500 bg-purple-100 px-2 py-0.5 rounded-full">{r.ingredients.length} ingredient{r.ingredients.length !== 1 ? 's' : ''}</span>
                                                        </h4>
                                                        {r.ingredients.length === 0 ? (
                                                            <p className="text-sm text-gray-400 italic">No ingredient usage recorded for this batch</p>
                                                        ) : (
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                                {r.ingredients.map((ing, idx) => (
                                                                    <div key={idx} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                                                                        <p className="text-sm font-bold text-gray-800">🧂 {ing.ingredient_name}</p>
                                                                        <div className="flex items-center justify-between mt-2">
                                                                            <span className="text-xs text-gray-500">{ing.qty_used.toFixed(2)} {ing.unit}</span>
                                                                            <span className="text-xs font-bold text-red-600">{fmt(ing.cost)}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Batch summary row */}
                                                        <div className="mt-3 grid grid-cols-4 gap-3">
                                                            <div className="bg-white rounded-xl p-3 border-l-4 border-emerald-500">
                                                                <p className="text-[10px] text-gray-500 uppercase font-bold">Produced By</p>
                                                                <p className="text-sm font-bold text-gray-800 mt-1">👤 {r.created_by || 'Unknown'}</p>
                                                            </div>
                                                            <div className="bg-white rounded-xl p-3 border-l-4 border-blue-500">
                                                                <p className="text-[10px] text-gray-500 uppercase font-bold">Total Cost</p>
                                                                <p className="text-sm font-bold text-red-600 mt-1">{fmt(r.total_cost)}</p>
                                                            </div>
                                                            <div className="bg-white rounded-xl p-3 border-l-4 border-teal-500">
                                                                <p className="text-[10px] text-gray-500 uppercase font-bold">Expected Revenue</p>
                                                                <p className="text-sm font-bold text-blue-600 mt-1">{fmt(r.expected_revenue)}</p>
                                                            </div>
                                                            <div className="bg-white rounded-xl p-3 border-l-4 border-purple-500">
                                                                <p className="text-[10px] text-gray-500 uppercase font-bold">Expected Profit</p>
                                                                <p className="text-sm font-bold text-emerald-700 mt-1">{fmt(r.expected_profit)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                            {filtered.length > 0 && (
                                <tfoot>
                                    <tr className="bg-gray-100 font-bold">
                                        <td className="px-3 py-3.5" colSpan={4}><span className="text-sm text-gray-800">TOTALS ({filtered.length} batches)</span></td>
                                        <td className="px-3 py-3.5 text-sm text-right text-gray-800">{totals.produced}</td>
                                        <td className="px-3 py-3.5 text-sm text-right text-gray-800">{totals.sold}</td>
                                        <td className="px-3 py-3.5" />
                                        <td className="px-3 py-3.5 text-sm text-right text-red-700">{fmt(totals.totalCost)}</td>
                                        <td className="px-3 py-3.5 text-sm text-right text-blue-700">{fmt(totals.expectedRevenue)}</td>
                                        <td className="px-3 py-3.5 text-sm text-right text-emerald-700">{fmt(totals.expectedProfit)}</td>
                                        <td className="px-3 py-3.5 text-center">
                                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{totals.expectedRevenue > 0 ? ((totals.expectedProfit / totals.expectedRevenue) * 100).toFixed(1) : 0}%</span>
                                        </td>
                                        <td className="px-3 py-3.5" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
