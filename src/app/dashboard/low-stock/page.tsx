'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface LowStockIngredient {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    current_stock: number;
    reorder_point: number;
    base_unit: string;
    purchase_cost: number;
    supplier_name: string;
    deficit: number;
    reorder_qty: number;
    reorder_cost: number;
}

interface LowStockDish {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    available_stock: number; // from production_batches remaining
    reorder_point: number;
    sales_cost: number;
    note: string;
}

interface ReorderItem {
    pid: number;
    product_name: string;
    base_unit: string;
    current_stock: number;
    reorder_point: number;
    purchase_cost: number;
    supplier_name: string;
    qty_to_order: string;
}

export default function LowStockPage() {
    const [activeTab, setActiveTab] = useState<'ingredients' | 'dishes' | 'reorder'>('ingredients');
    const [ingredients, setIngredients] = useState<LowStockIngredient[]>([]);
    const [dishes, setDishes] = useState<LowStockDish[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [categories, setCategories] = useState<string[]>([]);
    const [reorderList, setReorderList] = useState<ReorderItem[]>([]);
    const [showReorderModal, setShowReorderModal] = useState(false);
    const [isSendingPO, setIsSendingPO] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // ---- INGREDIENTS ----
            const { data: ingData } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, category, current_stock, reorder_point, base_unit, purchase_cost, supplier_name')
                .eq('active', true)
                .order('current_stock');

            const lowIngs: LowStockIngredient[] = (ingData || [])
                .filter((i: any) => (i.current_stock || 0) <= (i.reorder_point || 10))
                .map((i: any) => {
                    const cur = i.current_stock || 0;
                    const reorder = i.reorder_point || 10;
                    const deficit = Math.max(0, reorder - cur);
                    const reorder_qty = deficit * 2; // suggest double the deficit
                    return {
                        pid: i.pid,
                        product_code: i.product_code || '',
                        product_name: i.product_name,
                        category: i.category || 'General',
                        current_stock: cur,
                        reorder_point: reorder,
                        base_unit: i.base_unit || 'PCS',
                        purchase_cost: i.purchase_cost || 0,
                        supplier_name: i.supplier_name || 'Unknown',
                        deficit,
                        reorder_qty,
                        reorder_cost: reorder_qty * (i.purchase_cost || 0),
                    };
                });

            setIngredients(lowIngs);

            // ---- DISHES (stock from production_batches) ----
            const { data: products } = await supabase
                .from('products')
                .select('pid, product_code, product_name, category, sales_cost, reorder_point')
                .eq('active', true)
                .eq('show_in_pos', true);

            const { data: batches } = await supabase
                .from('production_batches')
                .select('product_id, qty_remaining, status')
                .in('status', ['In Stock', 'Active']);

            const stockMap = new Map<number, number>();
            (batches || []).forEach((b: any) => {
                stockMap.set(b.product_id, (stockMap.get(b.product_id) || 0) + (b.qty_remaining || 0));
            });

            const lowDishes: LowStockDish[] = (products || [])
                .map((p: any) => ({
                    pid: p.pid,
                    product_code: p.product_code || '',
                    product_name: p.product_name,
                    category: p.category || 'General',
                    available_stock: stockMap.get(p.pid) || 0,
                    reorder_point: p.reorder_point || 5,
                    sales_cost: p.sales_cost || 0,
                    note: 'Run a recipe production batch to restock',
                }))
                .filter(p => p.available_stock <= p.reorder_point);

            setDishes(lowDishes);

            // Categories for filter
            const cats = Array.from(new Set([
                ...lowIngs.map(i => i.category),
                ...lowDishes.map(d => d.category),
            ])).sort();
            setCategories(cats);

        } catch (err: any) {
            toast.error('Failed to load stock data');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const addToReorder = (ing: LowStockIngredient) => {
        if (reorderList.find(r => r.pid === ing.pid)) {
            toast('Already in reorder list');
            return;
        }
        setReorderList(prev => [...prev, {
            pid: ing.pid,
            product_name: ing.product_name,
            base_unit: ing.base_unit,
            current_stock: ing.current_stock,
            reorder_point: ing.reorder_point,
            purchase_cost: ing.purchase_cost,
            supplier_name: ing.supplier_name,
            qty_to_order: String(ing.reorder_qty),
        }]);
        toast.success(`Added ${ing.product_name} to reorder list`);
    };

    const addAllToReorder = () => {
        const toAdd = filteredIngredients.filter(i => !reorderList.find(r => r.pid === i.pid));
        setReorderList(prev => [
            ...prev,
            ...toAdd.map(i => ({
                pid: i.pid,
                product_name: i.product_name,
                base_unit: i.base_unit,
                current_stock: i.current_stock,
                reorder_point: i.reorder_point,
                purchase_cost: i.purchase_cost,
                supplier_name: i.supplier_name,
                qty_to_order: String(i.reorder_qty),
            })),
        ]);
        toast.success(`Added ${toAdd.length} items to reorder list`);
    };

    const removeFromReorder = (pid: number) => setReorderList(prev => prev.filter(r => r.pid !== pid));
    const updateReorderQty = (pid: number, qty: string) => setReorderList(prev => prev.map(r => r.pid === pid ? { ...r, qty_to_order: qty } : r));

    const generatePO = async () => {
        const invalid = reorderList.find(r => !parseFloat(r.qty_to_order) || parseFloat(r.qty_to_order) <= 0);
        if (invalid) { toast.error(`Invalid quantity for ${invalid.product_name}`); return; }
        setIsSendingPO(true);

        try {
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            const user = userData?.name || 'Admin';
            const poRef = `PO-${Date.now()}`;
            const today = new Date().toISOString().split('T')[0];

            // Log each reorder as a stock movement note (until a proper PO table exists)
            for (const item of reorderList) {
                await supabase.from('stock_movements').insert({
                    movement_date: today,
                    product_id: item.pid,
                    product_name: item.product_name,
                    movement_type: 'Purchase Order',
                    quantity: parseFloat(item.qty_to_order),
                    unit: item.base_unit,
                    unit_cost: item.purchase_cost,
                    total_cost: parseFloat(item.qty_to_order) * item.purchase_cost,
                    reason: `Reorder - Low Stock Alert`,
                    reference_no: poRef,
                    reference_type: 'Reorder',
                    created_by: user,
                });
            }

            toast.success(`✅ Purchase Order ${poRef} generated for ${reorderList.length} items!`);
            setReorderList([]);
            setShowReorderModal(false);
        } catch (err: any) {
            toast.error('Failed to generate PO: ' + err.message);
        }
        setIsSendingPO(false);
    };

    const filteredIngredients = ingredients.filter(i => {
        const matchSearch = !search || i.product_name.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === 'All' || i.category === categoryFilter;
        return matchSearch && matchCat;
    });

    const filteredDishes = dishes.filter(d => {
        const matchSearch = !search || d.product_name.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === 'All' || d.category === categoryFilter;
        return matchSearch && matchCat;
    });

    const totalReorderValue = reorderList.reduce((s, r) => s + parseFloat(r.qty_to_order || '0') * r.purchase_cost, 0);
    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    const urgencyBadge = (current: number, reorder: number) => {
        if (current <= 0) return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">🚫 OUT OF STOCK</span>;
        if (current <= reorder * 0.5) return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">🔴 CRITICAL</span>;
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">🟠 LOW</span>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        ⚠️
                    </span>
                    Low Stock Alerts
                </h1>
                <div className="flex gap-3">
                    {reorderList.length > 0 && (
                        <button
                            onClick={() => setShowReorderModal(true)}
                            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all relative"
                        >
                            🛒 Reorder List
                            <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                                {reorderList.length}
                            </span>
                        </button>
                    )}
                    <button onClick={loadData}
                        className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🥬</span>
                    <p className="text-sm opacity-80 mt-2">Low Ingredients</p>
                    <p className="text-3xl font-bold">{ingredients.length}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🍽️</span>
                    <p className="text-sm opacity-80 mt-2">Low Dish Stock</p>
                    <p className="text-3xl font-bold">{dishes.length}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-700 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🚫</span>
                    <p className="text-sm opacity-80 mt-2">Out of Stock</p>
                    <p className="text-3xl font-bold">{ingredients.filter(i => i.current_stock <= 0).length + dishes.filter(d => d.available_stock <= 0).length}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🛒</span>
                    <p className="text-sm opacity-80 mt-2">In Reorder List</p>
                    <p className="text-3xl font-bold">{reorderList.length}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                {(['ingredients', 'dishes', 'reorder'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm capitalize transition-all ${
                            activeTab === tab
                                ? tab === 'ingredients' ? 'bg-red-600 text-white shadow-md'
                                : tab === 'dishes' ? 'bg-orange-500 text-white shadow-md'
                                : 'bg-emerald-600 text-white shadow-md'
                                : 'bg-white border text-gray-600 hover:bg-gray-50'
                        }`}>
                        {tab === 'ingredients' ? `🥬 Ingredients (${ingredients.length})`
                            : tab === 'dishes' ? `🍽️ Dishes (${dishes.length})`
                            : `🛒 Reorder List (${reorderList.length})`}
                    </button>
                ))}
            </div>

            {/* Filters (for ingredients and dishes) */}
            {activeTab !== 'reorder' && (
                <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="🔍 Search..."
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none" />
                    </div>
                    <div>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none">
                            <option value="All">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    {activeTab === 'ingredients' && (
                        <button onClick={addAllToReorder}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold hover:shadow-md transition-all">
                            🛒 Add All to Reorder
                        </button>
                    )}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Analyzing stock levels...</span>
                </div>
            ) : (
                <>
                    {/* INGREDIENTS TAB */}
                    {activeTab === 'ingredients' && (
                        <div className="bg-white rounded-2xl border overflow-hidden">
                            {filteredIngredients.length === 0 ? (
                                <div className="py-20 text-center">
                                    <div className="text-5xl mb-3">✅</div>
                                    <p className="text-lg font-bold text-gray-400">All ingredient stock levels are healthy!</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-gradient-to-r from-red-600 to-rose-600">
                                                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Ingredient</th>
                                                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Category</th>
                                                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Current</th>
                                                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Reorder At</th>
                                                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Deficit</th>
                                                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Status</th>
                                                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Supplier</th>
                                                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Suggest Order</th>
                                                <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredIngredients.map((ing, i) => (
                                                <tr key={ing.pid} className={`border-b border-gray-100 hover:bg-red-50/20 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                    <td className="px-4 py-3.5">
                                                        <p className="font-semibold text-gray-800 text-sm">{ing.product_name}</p>
                                                        <p className="text-xs font-mono text-gray-400">{ing.product_code}</p>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">{ing.category}</span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ing.current_stock <= 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                            {ing.current_stock.toFixed(2)} {ing.base_unit}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center text-sm text-gray-500">
                                                        {ing.reorder_point} {ing.base_unit}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        <span className="text-sm font-bold text-red-600">
                                                            {ing.deficit.toFixed(2)} {ing.base_unit}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        {urgencyBadge(ing.current_stock, ing.reorder_point)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-sm text-gray-600">{ing.supplier_name}</td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        <div>
                                                            <p className="text-xs font-bold text-emerald-700">{ing.reorder_qty.toFixed(2)} {ing.base_unit}</p>
                                                            <p className="text-xs text-gray-400">{fmt(ing.reorder_cost)}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        <div className="flex gap-1 justify-center">
                                                            <button onClick={() => addToReorder(ing)}
                                                                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all">
                                                                🛒 Order
                                                            </button>
                                                            <a href="/dashboard/purchase"
                                                                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all">
                                                                📥 Buy
                                                            </a>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* DISHES TAB */}
                    {activeTab === 'dishes' && (
                        <div className="space-y-3">
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                                <span className="text-2xl">💡</span>
                                <p className="text-sm text-amber-800">
                                    <strong>Dish stock</strong> is built through the <strong>Recipe</strong> production system (ingredients → production batch → dish stock). 
                                    To restock a dish, go to <a href="/dashboard/recipe" className="text-blue-600 underline font-bold">Recipe Production</a>.
                                </p>
                            </div>

                            <div className="bg-white rounded-2xl border overflow-hidden">
                                {filteredDishes.length === 0 ? (
                                    <div className="py-20 text-center">
                                        <div className="text-5xl mb-3">✅</div>
                                        <p className="text-lg font-bold text-gray-400">All dish stock levels are healthy!</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="bg-gradient-to-r from-orange-500 to-amber-600">
                                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Dish</th>
                                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Category</th>
                                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Available</th>
                                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Reorder At</th>
                                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Status</th>
                                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Selling Price</th>
                                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredDishes.map((dish, i) => (
                                                    <tr key={dish.pid} className={`border-b border-gray-100 hover:bg-orange-50/20 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                        <td className="px-4 py-3.5">
                                                            <p className="font-semibold text-gray-800 text-sm">{dish.product_name}</p>
                                                            <p className="text-xs font-mono text-gray-400">{dish.product_code}</p>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">{dish.category}</span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center">
                                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${dish.available_stock <= 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {dish.available_stock} PCS
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center text-sm text-gray-500">{dish.reorder_point} PCS</td>
                                                        <td className="px-4 py-3.5 text-center">
                                                            {urgencyBadge(dish.available_stock, dish.reorder_point)}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center text-sm font-semibold text-gray-700">
                                                            {fmt(dish.sales_cost)}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center">
                                                            <a href="/dashboard/recipe"
                                                                className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-100 transition-all">
                                                                🍳 Produce
                                                            </a>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* REORDER LIST TAB */}
                    {activeTab === 'reorder' && (
                        <div className="space-y-4">
                            {reorderList.length === 0 ? (
                                <div className="bg-white rounded-2xl border py-20 text-center">
                                    <div className="text-5xl mb-3">🛒</div>
                                    <p className="text-lg font-bold text-gray-400">Reorder list is empty</p>
                                    <p className="text-sm text-gray-400 mt-1">Go to Ingredients tab and click 🛒 Order on any item</p>
                                    <button onClick={() => setActiveTab('ingredients')}
                                        className="mt-4 px-6 py-3 bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                                        ⚠️ View Low Stock Ingredients
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-white rounded-2xl border overflow-hidden">
                                        <div className="px-5 py-4 border-b bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold">🛒 Purchase Reorder List</h3>
                                                <p className="text-xs opacity-80 mt-0.5">{reorderList.length} item(s) · Total: {fmt(totalReorderValue)}</p>
                                            </div>
                                            <button onClick={generatePO} disabled={isSendingPO}
                                                className="px-5 py-2 bg-white text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-50 disabled:opacity-50 transition-all">
                                                {isSendingPO ? '⏳ Processing...' : '📋 Generate Purchase Order'}
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="bg-gray-50">
                                                        <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600">Ingredient</th>
                                                        <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-600">Current Stock</th>
                                                        <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-600">Order Qty</th>
                                                        <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-600">Supplier</th>
                                                        <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-600">Est. Cost</th>
                                                        <th className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-600">Remove</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {reorderList.map(r => (
                                                        <tr key={r.pid} className="border-b border-gray-100 hover:bg-emerald-50/20">
                                                            <td className="px-4 py-3 font-semibold text-gray-800 text-sm">{r.product_name}</td>
                                                            <td className="px-4 py-3 text-center text-sm text-orange-600 font-bold">
                                                                {r.current_stock.toFixed(2)} {r.base_unit}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        value={r.qty_to_order}
                                                                        onChange={e => updateReorderQty(r.pid, e.target.value)}
                                                                        min="0"
                                                                        step="0.01"
                                                                        className="w-20 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center font-bold outline-none focus:border-emerald-500"
                                                                    />
                                                                    <span className="text-xs text-gray-400">{r.base_unit}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-600">{r.supplier_name}</td>
                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                                                                {fmt((parseFloat(r.qty_to_order) || 0) * r.purchase_cost)}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <button onClick={() => removeFromReorder(r.pid)}
                                                                    className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-all">
                                                                    ✕
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-emerald-50">
                                                        <td colSpan={4} className="px-4 py-3 font-bold text-gray-700">Total Estimated Cost</td>
                                                        <td className="px-4 py-3 text-center font-black text-emerald-700 text-lg">{fmt(totalReorderValue)}</td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
