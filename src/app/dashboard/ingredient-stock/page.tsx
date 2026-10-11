'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface IngredientStock {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    base_unit: string;
    purchase_unit: string;
    current_stock: number;
    purchase_cost: number;
    cost_per_base_unit: number;
    price_per_pack: number;
    pack_size: number;
    reorder_point: number;
    supplier_name: string;
    active: boolean;
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

const BASE_UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'Piece', 'Packet', 'Bag', 'Bottle', 'Tin', 'Box', 'Litre', 'Tray', 'Dozen', 'Bundle'];
const PURCHASE_UNITS = ['KG', 'G', 'L', 'ML', 'PCS', 'Piece', 'Packet', 'Bag', 'Bottle', 'Tin', 'Box', 'Tray', 'Dozen', 'Crate', 'Sack', 'Bundle'];
const CATEGORIES = ['Meat & Poultry', 'Vegetables', 'Fruits', 'Dairy', 'Grains & Cereals', 'Spices & Herbs', 'Oils & Fats', 'Beverages', 'Dry Goods', 'Seafood', 'Bakery', 'Condiments', 'Other'];

const emptyForm = {
    product_code: '',
    product_name: '',
    category: 'Dry Goods',
    base_unit: 'KG',
    purchase_unit: 'KG',
    current_stock: 0,
    purchase_cost: 0,
    cost_per_base_unit: 0,
    price_per_pack: 0,
    pack_size: 1,
    reorder_point: 10,
    supplier_name: '',
    description: '',
    active: true,
};

export default function IngredientStockPage() {
    const [ingredients, setIngredients] = useState<IngredientStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [categories, setCategories] = useState<string[]>([]);
    const [historyIngredient, setHistoryIngredient] = useState<IngredientStock | null>(null);
    const [history, setHistory] = useState<IngredientHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Add/Edit modal state
    const [showModal, setShowModal] = useState(false);
    const [editIngredient, setEditIngredient] = useState<IngredientStock | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [autoCode, setAutoCode] = useState('');

    const loadIngredients = useCallback(async () => {
        setLoading(true);
        try {
            const { data: ingList } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, category, base_unit, purchase_unit, current_stock, purchase_cost, cost_per_base_unit, price_per_pack, pack_size, reorder_point, supplier_name, active')
                .eq('active', true)
                .order('product_name');

            const { data: movements } = await supabase
                .from('stock_movements')
                .select('product_id, movement_type, quantity');

            const { data: recipeIssues } = await supabase
                .from('recipe_ingredients')
                .select('ingredient_product_id, qty_issued');

            const moveMap = new Map<number, { purchased: number; returned: number; damaged: number }>();
            (movements || []).forEach((m: any) => {
                const cur = moveMap.get(m.product_id) || { purchased: 0, returned: 0, damaged: 0 };
                const mt = (m.movement_type || '').toLowerCase();
                if (mt.includes('purchase') || mt.includes('received') || mt === 'in') cur.purchased += m.quantity || 0;
                else if (mt.includes('return')) cur.returned += m.quantity || 0;
                else if (mt.includes('damage') || mt.includes('spoil') || mt.includes('waste') || mt.includes('loss')) cur.damaged += m.quantity || 0;
                moveMap.set(m.product_id, cur);
            });

            const issueMap = new Map<number, number>();
            (recipeIssues || []).forEach((r: any) => {
                issueMap.set(r.ingredient_product_id, (issueMap.get(r.ingredient_product_id) || 0) + (r.qty_issued || 0));
            });

            const cats = Array.from(new Set((ingList || []).map((p: any) => p.category).filter(Boolean))).sort();
            setCategories(cats as string[]);

            const list: IngredientStock[] = (ingList || []).map((p: any) => {
                const mv = moveMap.get(p.pid) || { purchased: 0, returned: 0, damaged: 0 };
                return {
                    pid: p.pid,
                    product_code: p.product_code || '',
                    product_name: p.product_name,
                    category: p.category || 'Uncategorized',
                    base_unit: p.base_unit || 'KG',
                    purchase_unit: p.purchase_unit || 'KG',
                    current_stock: p.current_stock || 0,
                    purchase_cost: p.purchase_cost || 0,
                    cost_per_base_unit: p.cost_per_base_unit || 0,
                    price_per_pack: p.price_per_pack || 0,
                    pack_size: p.pack_size || 1,
                    reorder_point: p.reorder_point || 10,
                    supplier_name: p.supplier_name || '',
                    active: p.active,
                    total_purchased: mv.purchased,
                    total_issued: issueMap.get(p.pid) || 0,
                    total_returned: mv.returned,
                    total_damaged: mv.damaged,
                };
            });

            setIngredients(list);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, []);

    useEffect(() => { loadIngredients(); }, [loadIngredients]);

    // Generate ingredient code
    const genCode = useCallback(async () => {
        const { count } = await supabase.from('products_ingredients').select('*', { count: 'exact', head: true });
        const next = String((count || 0) + 1).padStart(4, '0');
        return `ING-${next}`;
    }, []);

    const openAdd = async () => {
        setEditIngredient(null);
        const code = await genCode();
        setFormData({ ...emptyForm, product_code: code });
        setAutoCode(code);
        setShowModal(true);
    };

    const openEdit = (ing: IngredientStock) => {
        setEditIngredient(ing);
        setFormData({
            product_code: ing.product_code || '',
            product_name: ing.product_name,
            category: ing.category,
            base_unit: ing.base_unit,
            purchase_unit: ing.purchase_unit,
            current_stock: ing.current_stock,
            purchase_cost: ing.purchase_cost,
            cost_per_base_unit: ing.cost_per_base_unit,
            price_per_pack: ing.price_per_pack,
            pack_size: ing.pack_size,
            reorder_point: ing.reorder_point,
            supplier_name: ing.supplier_name,
            description: '',
            active: ing.active,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.product_name.trim()) { toast.error('Ingredient name is required'); return; }
        setIsSaving(true);
        try {
            const payload = {
                product_code: formData.product_code.trim() || autoCode,
                product_name: formData.product_name.trim(),
                category: formData.category,
                base_unit: formData.base_unit,
                purchase_unit: formData.purchase_unit,
                current_stock: Number(formData.current_stock) || 0,
                purchase_cost: Number(formData.purchase_cost) || 0,
                cost_per_base_unit: Number(formData.cost_per_base_unit) || 0,
                price_per_pack: Number(formData.price_per_pack) || 0,
                pack_size: Number(formData.pack_size) || 1,
                reorder_point: Number(formData.reorder_point) || 10,
                supplier_name: formData.supplier_name.trim() || null,
                active: formData.active,
                updated_at: new Date().toISOString(),
            };

            if (editIngredient) {
                const { error } = await supabase.from('products_ingredients').update(payload).eq('pid', editIngredient.pid);
                if (error) throw error;
                toast.success(`✅ ${formData.product_name} updated!`);
            } else {
                const { error } = await supabase.from('products_ingredients').insert({ ...payload, created_at: new Date().toISOString() });
                if (error) throw error;
                toast.success(`✅ ${formData.product_name} added to ingredient stock!`);
            }
            setShowModal(false);
            loadIngredients();
        } catch (err: any) {
            toast.error('Save failed: ' + err.message);
        }
        setIsSaving(false);
    };

    const deleteIngredient = async (ing: IngredientStock) => {
        if (!confirm(`Archive "${ing.product_name}"? It won't appear in stock but history is preserved.`)) return;
        await supabase.from('products_ingredients').update({ active: false }).eq('pid', ing.pid);
        toast.success(`${ing.product_name} archived`);
        loadIngredients();
    };

    const openHistory = async (ing: IngredientStock) => {
        setHistoryIngredient(ing);
        setHistoryLoading(true);
        setHistory([]);
        try {
            const rows: IngredientHistoryRow[] = [];
            const { data: moves } = await supabase
                .from('stock_movements')
                .select('movement_id, movement_date, movement_type, quantity, unit, reference_no, reason, created_by')
                .eq('product_id', ing.pid)
                .order('movement_date', { ascending: false });
            (moves || []).forEach((m: any) => {
                let icon = '📦'; let bg = 'bg-blue-100 text-blue-700';
                const mt = (m.movement_type || '').toLowerCase();
                if (mt.includes('purchase') || mt.includes('received') || mt === 'in') { icon = '🛒'; bg = 'bg-emerald-100 text-emerald-700'; }
                else if (mt.includes('return')) { icon = '↩️'; bg = 'bg-purple-100 text-purple-700'; }
                else if (mt.includes('damage') || mt.includes('spoil') || mt.includes('waste')) { icon = '❌'; bg = 'bg-red-100 text-red-700'; }
                else if (mt.includes('recipe') || mt.includes('issue') || mt.includes('out')) { icon = '🍳'; bg = 'bg-orange-100 text-orange-700'; }
                else if (mt.includes('transfer')) { icon = '🔄'; bg = 'bg-indigo-100 text-indigo-700'; }
                else if (mt.includes('adjustment')) { icon = '⚖️'; bg = 'bg-violet-100 text-violet-700'; }
                rows.push({ id: m.movement_id, date: m.movement_date, type: m.movement_type, typeIcon: icon, typeBg: bg, quantity: m.quantity, unit: m.unit || ing.base_unit, reference: m.reference_no || '', note: m.reason || `By ${m.created_by || 'System'}` });
            });
            rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(rows);
        } catch (err) { console.error(err); }
        setHistoryLoading(false);
    };

    const filtered = ingredients.filter(d => {
        if (search && !d.product_name.toLowerCase().includes(search.toLowerCase()) && !d.product_code.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
        return true;
    });

    const stockColor = (ing: IngredientStock) => {
        if (ing.current_stock <= 0) return 'bg-red-100 text-red-700';
        if (ing.current_stock <= ing.reorder_point) return 'bg-amber-100 text-amber-700';
        return 'bg-emerald-100 text-emerald-700';
    };

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    // Auto-calculate cost_per_base_unit when pack_size or price_per_pack changes
    const handlePriceChange = (field: string, val: string) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: parseFloat(val) || 0 };
            if (field === 'price_per_pack' || field === 'pack_size') {
                const packCost = field === 'price_per_pack' ? parseFloat(val) || 0 : prev.price_per_pack;
                const packSz = field === 'pack_size' ? parseFloat(val) || 1 : prev.pack_size;
                updated.cost_per_base_unit = packSz > 0 ? packCost / packSz : 0;
                updated.purchase_cost = updated.cost_per_base_unit;
            }
            return updated;
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        🧂
                    </span>
                    Ingredient Stock
                </h1>
                <div className="flex gap-3">
                    <button onClick={openAdd}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">
                        ➕ Add Ingredient
                    </button>
                    <button onClick={loadIngredients}
                        className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all">
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🧂</span>
                    <p className="text-sm opacity-80 mt-2">Total Ingredients</p>
                    <p className="text-3xl font-bold">{filtered.length}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm opacity-80 mt-2">Good Stock (&gt;reorder)</p>
                    <p className="text-3xl font-bold">{filtered.filter(d => d.current_stock > d.reorder_point).length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-sm opacity-80 mt-2">Low Stock</p>
                    <p className="text-3xl font-bold">{filtered.filter(d => d.current_stock > 0 && d.current_stock <= d.reorder_point).length}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🚫</span>
                    <p className="text-sm opacity-80 mt-2">Out of Stock</p>
                    <p className="text-3xl font-bold">{filtered.filter(d => d.current_stock <= 0).length}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[220px]">
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="🔍 Search ingredient name or code..."
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                </div>
                <div>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                        className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none">
                        <option value="All">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {ingredients.length}</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading ingredients...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-20 text-center">
                        <div className="text-6xl mb-4">🧂</div>
                        <p className="text-xl font-bold text-gray-400">No ingredients found</p>
                        <p className="text-sm text-gray-400 mt-1">Add your first raw ingredient to get started</p>
                        <button onClick={openAdd} className="mt-4 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg text-sm">
                            ➕ Add First Ingredient
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">#</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Ingredient</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Category</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Available</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Unit</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Cost/Unit</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Purchased</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Issued</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Returned</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Damaged</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((d, i) => (
                                    <tr key={d.pid} className={`border-b border-gray-100 hover:bg-indigo-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                        <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{d.product_code || i + 1}</td>
                                        <td className="px-4 py-3.5">
                                            <p className="font-bold text-gray-800 text-sm">🧂 {d.product_name}</p>
                                            {d.supplier_name && <p className="text-xs text-gray-400">{d.supplier_name}</p>}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{d.category}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-black ${stockColor(d)}`}>
                                                {d.current_stock.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500">{d.base_unit}</td>
                                        <td className="px-4 py-3.5 text-center text-xs text-gray-600">{fmt(d.cost_per_base_unit)}/{d.base_unit}</td>
                                        <td className="px-4 py-3.5 text-center">
                                            {d.total_purchased > 0 ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">🛒 {d.total_purchased}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {d.total_issued > 0 ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">🍳 {d.total_issued.toFixed(1)}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {d.total_returned > 0 ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">↩️ {d.total_returned}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {d.total_damaged > 0 ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">❌ {d.total_damaged}</span> : <span className="text-xs text-gray-300">-</span>}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => openEdit(d)} title="Edit"
                                                    className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm">✏️</button>
                                                <button onClick={() => openHistory(d)} title="History"
                                                    className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm">📜</button>
                                                <button onClick={() => deleteIngredient(d)} title="Archive"
                                                    className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors text-sm">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── ADD/EDIT INGREDIENT MODAL ── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white flex-shrink-0">
                            <h2 className="text-xl font-bold">{editIngredient ? '✏️ Edit Ingredient' : '🧂 Add New Ingredient'}</h2>
                            <p className="text-indigo-200 text-sm mt-0.5">Raw ingredient for recipes (e.g. Sugar, Flour, Chicken, Oil)</p>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5">
                            {/* Basic Info */}
                            <div>
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">📋 Basic Information</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Ingredient Code</label>
                                        <input type="text" value={formData.product_code}
                                            onChange={e => setFormData(p => ({ ...p, product_code: e.target.value.toUpperCase() }))}
                                            placeholder="e.g. ING-0001"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Category <span className="text-red-500">*</span></label>
                                        <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none">
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Ingredient Name <span className="text-red-500">*</span></label>
                                        <input type="text" value={formData.product_name}
                                            onChange={e => setFormData(p => ({ ...p, product_name: e.target.value }))}
                                            placeholder="e.g. White Sugar, Wheat Flour, Fresh Chicken Breast..."
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Supplier / Brand</label>
                                        <input type="text" value={formData.supplier_name}
                                            onChange={e => setFormData(p => ({ ...p, supplier_name: e.target.value }))}
                                            placeholder="e.g. Unga Holdings, Farmers Choice..."
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Reorder Point</label>
                                        <input type="number" value={formData.reorder_point}
                                            onChange={e => setFormData(p => ({ ...p, reorder_point: parseFloat(e.target.value) || 0 }))}
                                            min="0" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Units */}
                            <div>
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">📏 Units of Measure</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Base Unit (stock measured in) <span className="text-red-500">*</span></label>
                                        <select value={formData.base_unit} onChange={e => setFormData(p => ({ ...p, base_unit: e.target.value }))}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none">
                                            {BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <p className="text-xs text-gray-400 mt-1">This is how the stock quantity is tracked (e.g. KG, L)</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Purchase Unit (bought in)</label>
                                        <select value={formData.purchase_unit} onChange={e => setFormData(p => ({ ...p, purchase_unit: e.target.value }))}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none">
                                            {PURCHASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <p className="text-xs text-gray-400 mt-1">The unit you buy from suppliers (e.g. Bag, Sack)</p>
                                    </div>
                                </div>
                            </div>

                            {/* Pricing */}
                            <div>
                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">💰 Pricing & Cost</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Pack Size</label>
                                        <input type="number" value={formData.pack_size}
                                            onChange={e => handlePriceChange('pack_size', e.target.value)}
                                            min="0" step="0.001"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                                        <p className="text-xs text-gray-400 mt-1">Units per pack (e.g. 50 KG per bag)</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Price Per Pack (Ksh)</label>
                                        <input type="number" value={formData.price_per_pack}
                                            onChange={e => handlePriceChange('price_per_pack', e.target.value)}
                                            min="0" step="0.01"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Cost Per {formData.base_unit} (Auto)</label>
                                        <input type="number" value={formData.cost_per_base_unit.toFixed(4)}
                                            onChange={e => setFormData(p => ({ ...p, cost_per_base_unit: parseFloat(e.target.value) || 0, purchase_cost: parseFloat(e.target.value) || 0 }))}
                                            min="0" step="0.0001"
                                            className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 outline-none" />
                                        <p className="text-xs text-indigo-500 mt-1">Auto = pack price ÷ pack size</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Opening Stock ({formData.base_unit})</label>
                                        <input type="number" value={formData.current_stock}
                                            onChange={e => setFormData(p => ({ ...p, current_stock: parseFloat(e.target.value) || 0 }))}
                                            min="0" step="0.01"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none" />
                                    </div>
                                </div>

                                {/* Cost Summary */}
                                {formData.cost_per_base_unit > 0 && (
                                    <div className="mt-3 bg-indigo-50 rounded-xl p-4 flex gap-6 text-sm">
                                        <div>
                                            <p className="text-xs text-indigo-500 font-bold">Cost per {formData.base_unit}</p>
                                            <p className="text-lg font-black text-indigo-700">Ksh {formData.cost_per_base_unit.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-500 font-bold">Opening Stock Value</p>
                                            <p className="text-lg font-black text-indigo-700">Ksh {(formData.current_stock * formData.cost_per_base_unit).toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-500 font-bold">Reorder at</p>
                                            <p className="text-lg font-black text-indigo-700">{formData.reorder_point} {formData.base_unit}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={formData.active}
                                        onChange={e => setFormData(p => ({ ...p, active: e.target.checked }))}
                                        className="w-4 h-4 accent-indigo-600" />
                                    <span className="text-sm font-semibold text-gray-700">Active (shows in stock lists and recipe builder)</span>
                                </label>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button onClick={handleSave} disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : editIngredient ? '✅ Update Ingredient' : '✅ Add Ingredient'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {historyIngredient && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setHistoryIngredient(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold">📜 Ingredient History</h2>
                                <p className="text-indigo-200 text-xs mt-0.5">🧂 {historyIngredient.product_name} ({historyIngredient.base_unit})</p>
                            </div>
                            <button onClick={() => setHistoryIngredient(null)} className="p-2 hover:bg-white/20 rounded-xl">✕</button>
                        </div>

                        <div className="grid grid-cols-5 gap-2 p-4">
                            {[
                                { label: 'Available', val: historyIngredient.current_stock, cls: 'bg-blue-50 text-blue-700', icon: '📦' },
                                { label: 'Purchased', val: historyIngredient.total_purchased, cls: 'bg-emerald-50 text-emerald-700', icon: '🛒' },
                                { label: 'Issued', val: historyIngredient.total_issued, cls: 'bg-orange-50 text-orange-700', icon: '🍳' },
                                { label: 'Returned', val: historyIngredient.total_returned, cls: 'bg-purple-50 text-purple-700', icon: '↩️' },
                                { label: 'Damaged', val: historyIngredient.total_damaged, cls: 'bg-red-50 text-red-700', icon: '❌' },
                            ].map(s => (
                                <div key={s.label} className={`p-3 ${s.cls.split(' ')[0]} rounded-xl text-center`}>
                                    <p className="text-[8px] font-bold uppercase opacity-70">{s.label}</p>
                                    <p className={`text-lg font-black ${s.cls.split(' ')[1]} mt-0.5`}>{s.icon} {typeof s.val === 'number' ? s.val.toFixed(1) : s.val}</p>
                                </div>
                            ))}
                        </div>

                        <div className="overflow-y-auto max-h-[50vh] px-4 pb-4">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-10"><div className="spinner" /></div>
                            ) : history.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-10">No movement history found</p>
                            ) : (
                                <div className="space-y-2">
                                    {history.map(h => (
                                        <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200">
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
