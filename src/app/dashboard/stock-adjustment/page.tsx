'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    current_stock: number;
    base_unit: string;
    reorder_point: number;
    purchase_cost: number;
}

interface AdjustmentLog {
    movement_id: number;
    movement_date: string;
    product_name: string;
    product_code: string;
    movement_type: string;
    quantity: number;
    unit: string;
    reason: string;
    created_by: string;
    created_at: string;
}

const ADJUSTMENT_REASONS = [
    'Wastage / Spoilage',
    'Theft / Loss',
    'Counting Correction',
    'Damaged Goods',
    'Expired / Discarded',
    'Opening Stock Entry',
    'Transfer In',
    'Transfer Out',
    'Supplier Return',
    'Other',
];

export default function StockAdjustmentPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [logs, setLogs] = useState<AdjustmentLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [logsLoading, setLogsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [categories, setCategories] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock');

    // Adjustment modal state
    const [showModal, setShowModal] = useState(false);
    const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
    const [adjType, setAdjType] = useState<'add' | 'subtract'>('add');
    const [adjQty, setAdjQty] = useState('');
    const [adjReason, setAdjReason] = useState('');
    const [adjNote, setAdjNote] = useState('');
    const [adjNewQty, setAdjNewQty] = useState(''); // for "set exact" mode
    const [adjMode, setAdjMode] = useState<'delta' | 'exact'>('delta');

    const loadIngredients = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, category, current_stock, base_unit, reorder_point, purchase_cost')
                .eq('active', true)
                .order('product_name');
            if (error) throw error;
            const list: Ingredient[] = (data || []).map((d: any) => ({
                pid: d.pid,
                product_code: d.product_code || '',
                product_name: d.product_name,
                category: d.category || 'General',
                current_stock: d.current_stock || 0,
                base_unit: d.base_unit || 'PCS',
                reorder_point: d.reorder_point || 10,
                purchase_cost: d.purchase_cost || 0,
            }));
            setIngredients(list);
            const cats = Array.from(new Set(list.map(i => i.category))).sort();
            setCategories(cats);
        } catch (err: any) {
            toast.error('Failed to load ingredients');
        }
        setLoading(false);
    }, []);

    const loadLogs = useCallback(async () => {
        setLogsLoading(true);
        try {
            const { data, error } = await supabase
                .from('stock_movements')
                .select('movement_id, movement_date, product_name, product_code, movement_type, quantity, unit, reason, created_by, created_at')
                .in('movement_type', ['Adjustment In', 'Adjustment Out', 'Opening Stock', 'Correction'])
                .gte('movement_date', dateFrom)
                .lte('movement_date', dateTo)
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            setLogs((data || []) as AdjustmentLog[]);
        } catch {
            toast.error('Failed to load adjustment history');
        }
        setLogsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadIngredients(); }, [loadIngredients]);
    useEffect(() => { if (activeTab === 'history') loadLogs(); }, [activeTab, loadLogs]);

    const openModal = (ing: Ingredient) => {
        setSelectedIngredient(ing);
        setAdjType('add');
        setAdjQty('');
        setAdjReason('');
        setAdjNote('');
        setAdjNewQty(String(ing.current_stock));
        setAdjMode('delta');
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!selectedIngredient) return;
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const user = userData?.name || 'Admin';

        let deltaQty = 0;
        let movementType = '';
        let newStock = selectedIngredient.current_stock;

        if (adjMode === 'exact') {
            const exactVal = parseFloat(adjNewQty);
            if (isNaN(exactVal) || exactVal < 0) { toast.error('Invalid quantity'); return; }
            deltaQty = exactVal - selectedIngredient.current_stock;
            newStock = exactVal;
            movementType = deltaQty >= 0 ? 'Adjustment In' : 'Adjustment Out';
        } else {
            const qty = parseFloat(adjQty);
            if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity'); return; }
            deltaQty = adjType === 'add' ? qty : -qty;
            newStock = selectedIngredient.current_stock + deltaQty;
            movementType = adjType === 'add' ? 'Adjustment In' : 'Adjustment Out';
        }

        if (!adjReason) { toast.error('Please select a reason'); return; }

        setIsSaving(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1. Update stock on ingredient
            const { error: stockError } = await supabase
                .from('products_ingredients')
                .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                .eq('pid', selectedIngredient.pid);
            if (stockError) throw stockError;

            // 2. Log to stock_movements
            const { error: logError } = await supabase.from('stock_movements').insert({
                movement_date: today,
                product_id: selectedIngredient.pid,
                product_name: selectedIngredient.product_name,
                product_code: selectedIngredient.product_code,
                movement_type: movementType,
                quantity: Math.abs(deltaQty),
                unit: selectedIngredient.base_unit,
                unit_cost: selectedIngredient.purchase_cost,
                total_cost: Math.abs(deltaQty) * selectedIngredient.purchase_cost,
                reason: `${adjReason}${adjNote ? ' — ' + adjNote : ''}`,
                reference_type: 'Stock Adjustment',
                created_by: user,
            });
            if (logError) console.warn('Movement log error:', logError.message);

            toast.success(`✅ Stock adjusted! ${selectedIngredient.product_name}: ${selectedIngredient.current_stock.toFixed(2)} → ${newStock.toFixed(2)} ${selectedIngredient.base_unit}`);
            setShowModal(false);
            loadIngredients();
            if (activeTab === 'history') loadLogs();
        } catch (err: any) {
            toast.error('Failed to save adjustment: ' + err.message);
        }
        setIsSaving(false);
    };

    const filtered = ingredients.filter(i => {
        const matchSearch = !search || i.product_name.toLowerCase().includes(search.toLowerCase()) || i.product_code.toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === 'All' || i.category === categoryFilter;
        return matchSearch && matchCat;
    });

    const lowStockCount = ingredients.filter(i => i.current_stock <= i.reorder_point).length;
    const zeroStockCount = ingredients.filter(i => i.current_stock <= 0).length;
    const totalValue = ingredients.reduce((s, i) => s + i.current_stock * i.purchase_cost, 0);

    const stockLevelColor = (ing: Ingredient) => {
        if (ing.current_stock <= 0) return 'bg-red-100 text-red-700';
        if (ing.current_stock <= ing.reorder_point) return 'bg-orange-100 text-orange-700';
        return 'bg-emerald-100 text-emerald-700';
    };

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        ⚖️
                    </span>
                    Stock Adjustment
                </h1>
                <button
                    onClick={loadIngredients}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    🔄 Refresh
                </button>
            </div>

            {/* Note about dish stock */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div>
                    <p className="text-sm font-bold text-amber-800">Ingredient-Based Adjustments Only</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                        Dish (menu item) stock is automatically calculated from <strong>Recipes</strong>. 
                        Adjustments here only apply to <strong>raw ingredients</strong>. 
                        To update dish stock, use the <strong>Recipe</strong> production batch workflow.
                    </p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🧂</span>
                    <p className="text-sm opacity-80 mt-2">Total Ingredients</p>
                    <p className="text-3xl font-bold">{ingredients.length}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-sm opacity-80 mt-2">Low Stock Items</p>
                    <p className="text-3xl font-bold">{lowStockCount}</p>
                </div>
                <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🚫</span>
                    <p className="text-sm opacity-80 mt-2">Out of Stock</p>
                    <p className="text-3xl font-bold">{zeroStockCount}</p>
                </div>
                <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">💰</span>
                    <p className="text-sm opacity-80 mt-2">Stock Value</p>
                    <p className="text-2xl font-bold">{fmt(totalValue)}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('stock')}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${activeTab === 'stock' ? 'bg-violet-600 text-white shadow-md' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
                >
                    🧂 Ingredient Stock
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${activeTab === 'history' ? 'bg-violet-600 text-white shadow-md' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
                >
                    📋 Adjustment History
                </button>
            </div>

            {activeTab === 'stock' && (
                <>
                    {/* Filters */}
                    <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search Ingredient</label>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Name or code..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Category</label>
                            <select
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none"
                            >
                                <option value="All">All Categories</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="ml-auto flex items-end">
                            <span className="text-xs text-gray-400">
                                Showing <strong className="text-gray-700">{filtered.length}</strong> of {ingredients.length}
                            </span>
                        </div>
                    </div>

                    {/* Ingredient Table */}
                    <div className="bg-white rounded-2xl border overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading ingredients...</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-violet-600 to-purple-600">
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Code</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Ingredient</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Category</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Current Stock</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Reorder At</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Unit Cost</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Status</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Adjust</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.length === 0 ? (
                                            <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">No ingredients found</td></tr>
                                        ) : filtered.map((ing, i) => (
                                            <tr key={ing.pid} className={`border-b border-gray-100 hover:bg-violet-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{ing.product_code || '-'}</td>
                                                <td className="px-4 py-3.5 font-semibold text-gray-800">{ing.product_name}</td>
                                                <td className="px-4 py-3.5">
                                                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">{ing.category}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${stockLevelColor(ing)}`}>
                                                        {ing.current_stock.toFixed(2)} {ing.base_unit}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center text-sm text-gray-500">
                                                    {ing.reorder_point} {ing.base_unit}
                                                </td>
                                                <td className="px-4 py-3.5 text-center text-sm text-gray-700">
                                                    {fmt(ing.purchase_cost)}/{ing.base_unit}
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    {ing.current_stock <= 0
                                                        ? <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">Out of Stock</span>
                                                        : ing.current_stock <= ing.reorder_point
                                                        ? <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Low Stock</span>
                                                        : <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">In Stock</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <button
                                                        onClick={() => openModal(ing)}
                                                        className="px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl text-xs font-bold hover:shadow-md transition-all"
                                                    >
                                                        ⚖️ Adjust
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'history' && (
                <>
                    {/* History Filters */}
                    <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                        </div>
                        <button onClick={loadLogs}
                            className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-md transition-all">
                            🔍 Search
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border overflow-hidden">
                        {logsLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading history...</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-slate-700 to-slate-800">
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Date</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Ingredient</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Type</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Quantity</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Reason</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.length === 0 ? (
                                            <tr><td colSpan={6} className="py-16 text-center text-gray-400 text-sm">📋 No adjustment history found</td></tr>
                                        ) : logs.map(log => (
                                            <tr key={log.movement_id} className="border-b border-gray-100 hover:bg-violet-50/30 transition-colors">
                                                <td className="px-4 py-3.5 text-sm text-gray-600">
                                                    {new Date(log.movement_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3.5 font-semibold text-gray-800">{log.product_name}
                                                    <span className="block text-xs text-gray-400 font-mono">{log.product_code}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                        log.movement_type.includes('In') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {log.movement_type.includes('In') ? '➕' : '➖'} {log.movement_type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center font-bold">
                                                    {log.movement_type.includes('In') ? '+' : '-'}{log.quantity} {log.unit}
                                                </td>
                                                <td className="px-4 py-3.5 text-sm text-gray-600">{log.reason || '-'}</td>
                                                <td className="px-4 py-3.5 text-sm text-gray-500">{log.created_by}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Adjustment Modal */}
            {showModal && selectedIngredient && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-5 text-white">
                            <h2 className="text-lg font-bold">⚖️ Adjust Ingredient Stock</h2>
                            <p className="text-violet-200 text-sm mt-0.5">{selectedIngredient.product_name}</p>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Current Stock Display */}
                            <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 font-semibold uppercase">Current Stock</p>
                                    <p className="text-3xl font-black text-gray-800 mt-1">
                                        {selectedIngredient.current_stock.toFixed(2)}
                                        <span className="text-lg text-gray-500 font-normal ml-1">{selectedIngredient.base_unit}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 font-semibold uppercase">Reorder Point</p>
                                    <p className="text-lg font-bold text-orange-600">{selectedIngredient.reorder_point} {selectedIngredient.base_unit}</p>
                                </div>
                            </div>

                            {/* Adjustment Mode */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Adjustment Mode</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setAdjMode('delta')}
                                        className={`py-2.5 rounded-xl text-sm font-bold transition-all ${adjMode === 'delta' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                                    >
                                        ± Add / Subtract
                                    </button>
                                    <button
                                        onClick={() => setAdjMode('exact')}
                                        className={`py-2.5 rounded-xl text-sm font-bold transition-all ${adjMode === 'exact' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                                    >
                                        🎯 Set Exact Qty
                                    </button>
                                </div>
                            </div>

                            {adjMode === 'delta' ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Type</label>
                                        <div className="grid grid-cols-2 gap-1">
                                            <button
                                                onClick={() => setAdjType('add')}
                                                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${adjType === 'add' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                                            >
                                                ➕ Add
                                            </button>
                                            <button
                                                onClick={() => setAdjType('subtract')}
                                                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${adjType === 'subtract' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                                            >
                                                ➖ Remove
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                            Quantity ({selectedIngredient.base_unit})
                                        </label>
                                        <input
                                            type="number"
                                            value={adjQty}
                                            onChange={e => setAdjQty(e.target.value)}
                                            placeholder="0.00"
                                            min="0"
                                            step="0.01"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-violet-500 outline-none font-bold text-lg"
                                        />
                                    </div>
                                    {adjQty && (
                                        <div className="col-span-2 bg-violet-50 rounded-xl p-3 text-center">
                                            <p className="text-xs text-gray-500">New stock will be:</p>
                                            <p className="text-2xl font-black text-violet-700">
                                                {(selectedIngredient.current_stock + (adjType === 'add' ? 1 : -1) * parseFloat(adjQty || '0')).toFixed(2)} {selectedIngredient.base_unit}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                        Set Exact Stock ({selectedIngredient.base_unit})
                                    </label>
                                    <input
                                        type="number"
                                        value={adjNewQty}
                                        onChange={e => setAdjNewQty(e.target.value)}
                                        placeholder="0.00"
                                        min="0"
                                        step="0.01"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-violet-500 outline-none font-bold text-xl text-center"
                                    />
                                    {adjNewQty && (
                                        <div className="mt-2 bg-violet-50 rounded-xl p-3 text-center">
                                            <p className="text-xs text-gray-500">
                                                Change: {selectedIngredient.current_stock.toFixed(2)} → <strong className="text-violet-700">{parseFloat(adjNewQty).toFixed(2)} {selectedIngredient.base_unit}</strong>
                                                {' '}({(parseFloat(adjNewQty) - selectedIngredient.current_stock) >= 0 ? '➕' : '➖'}
                                                {Math.abs(parseFloat(adjNewQty) - selectedIngredient.current_stock).toFixed(2)})
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Reason */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                    Reason <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={adjReason}
                                    onChange={e => setAdjReason(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-violet-500 outline-none"
                                >
                                    <option value="">Select a reason...</option>
                                    {ADJUSTMENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            {/* Optional Note */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Additional Note (Optional)</label>
                                <input
                                    type="text"
                                    value={adjNote}
                                    onChange={e => setAdjNote(e.target.value)}
                                    placeholder="e.g. Batch #, supplier name..."
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-violet-500 outline-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                                >
                                    {isSaving ? '⏳ Saving...' : '✅ Save Adjustment'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
