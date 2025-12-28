'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    alias: string;
    vat_commodity: string;
    description: string;
    barcode: string;
    category: string;
    purchase_unit: string;
    sales_unit: string;
    purchase_cost: number;
    sales_cost: number;
    reorder_point: number;
    margin_per: number;
    show_ps: boolean;
    button_ui_color: string;
    photo: string;
    hscode: string;
    batch_no: string;
    supplier_name: string;
    // Ingredient-specific fields
    pack_size: number;
    base_unit: string;
    price_per_pack: number;
    cost_per_base_unit: number;
    active: boolean;
}

interface Category {
    category_id: number;
    category_name: string;
    icon: string;
}

const defaultIngredient: Omit<Ingredient, 'pid' | 'product_code' | 'cost_per_base_unit'> = {
    product_name: '',
    alias: '',
    vat_commodity: 'Standard',
    description: '',
    barcode: '',
    category: 'Raw Materials',
    purchase_unit: 'Kg',
    sales_unit: 'Kg',
    purchase_cost: 0,
    sales_cost: 0,
    reorder_point: 10,
    margin_per: 0,
    show_ps: false,
    button_ui_color: '#10B981',
    photo: '',
    hscode: '',
    batch_no: '',
    supplier_name: '',
    pack_size: 1,
    base_unit: 'Kg',
    price_per_pack: 0,
    active: true,
};

const baseUnits = ['Kg', 'Gram', 'Liter', 'ml', 'Piece', 'Unit', 'Meter', 'cm'];
const purchaseUnits = ['Bag', 'Box', 'Carton', 'Pack', 'Sack', 'Bottle', 'Tin', 'Drum', 'Piece', 'Kg', 'Liter'];

export default function IngredientsPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
    const [formData, setFormData] = useState(defaultIngredient);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const loadIngredients = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('products_ingredients')
                .select('*')
                .order('pid', { ascending: false });

            if (error) throw error;
            setIngredients(data || []);
        } catch (err) {
            console.error('Error loading ingredients:', err);
            toast.error('Failed to load ingredients');
        }
        setIsLoading(false);
    }, []);

    const loadCategories = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('product_categories')
                .select('*')
                .eq('active', true)
                .order('category_name');

            if (error) throw error;
            setCategories(data || []);
        } catch (err) {
            console.error('Error loading categories:', err);
        }
    }, []);

    useEffect(() => {
        loadIngredients();
        loadCategories();
    }, [loadIngredients, loadCategories]);

    const generateIngredientCode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('products_ingredients')
                .select('product_code')
                .like('product_code', 'PIG-%')
                .order('product_code', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const lastCode = data[0].product_code;
                const lastNum = parseInt(lastCode.replace('PIG-', '')) || 0;
                return `PIG-${String(lastNum + 1).padStart(2, '0')}`;
            }
            return 'PIG-01';
        } catch {
            return 'PIG-01';
        }
    };

    // Calculate cost per base unit from pack
    const calculateCostPerBaseUnit = (pricePerPack: number, packSize: number): number => {
        if (packSize <= 0) return 0;
        return Math.round((pricePerPack / packSize) * 10000) / 10000;
    };

    const openAddModal = () => {
        setEditingIngredient(null);
        setFormData(defaultIngredient);
        setShowModal(true);
    };

    const openEditModal = (ingredient: Ingredient) => {
        setEditingIngredient(ingredient);
        setFormData({
            product_name: ingredient.product_name,
            alias: ingredient.alias || '',
            vat_commodity: ingredient.vat_commodity || 'Standard',
            description: ingredient.description || '',
            barcode: ingredient.barcode || '',
            category: ingredient.category || 'Raw Materials',
            purchase_unit: ingredient.purchase_unit || 'Kg',
            sales_unit: ingredient.sales_unit || 'Kg',
            purchase_cost: ingredient.purchase_cost || 0,
            sales_cost: ingredient.sales_cost || 0,
            reorder_point: ingredient.reorder_point || 10,
            margin_per: ingredient.margin_per || 0,
            show_ps: ingredient.show_ps !== false,
            button_ui_color: ingredient.button_ui_color || '#10B981',
            photo: ingredient.photo || '',
            hscode: ingredient.hscode || '',
            batch_no: ingredient.batch_no || '',
            supplier_name: ingredient.supplier_name || '',
            pack_size: ingredient.pack_size || 1,
            base_unit: ingredient.base_unit || 'Kg',
            price_per_pack: ingredient.price_per_pack || 0,
            active: ingredient.active !== false,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.product_name.trim()) {
            toast.error('Ingredient name required!');
            return;
        }
        if (formData.pack_size <= 0) {
            toast.error('Pack size must be greater than 0');
            return;
        }

        setIsSaving(true);
        try {
            const costPerBase = calculateCostPerBaseUnit(formData.price_per_pack, formData.pack_size);

            if (editingIngredient) {
                // Update existing ingredient
                const { error } = await supabase
                    .from('products_ingredients')
                    .update({
                        ...formData,
                        cost_per_base_unit: costPerBase,
                        purchase_cost: costPerBase, // Set purchase cost to cost per base unit
                        updated_at: new Date().toISOString(),
                    })
                    .eq('pid', editingIngredient.pid);

                if (error) throw error;
                toast.success('Ingredient updated! ✓');
            } else {
                // Create new ingredient
                const newCode = await generateIngredientCode();
                const { error } = await supabase
                    .from('products_ingredients')
                    .insert({
                        ...formData,
                        product_code: newCode,
                        cost_per_base_unit: costPerBase,
                        purchase_cost: costPerBase,
                        added_date: new Date().toISOString(),
                    });

                if (error) throw error;
                toast.success(`Ingredient ${newCode} created! ✓`);
            }

            setShowModal(false);
            loadIngredients();
        } catch (err) {
            console.error('Error saving ingredient:', err);
            toast.error('Failed to save ingredient');
        }
        setIsSaving(false);
    };

    const deleteIngredient = async (ingredient: Ingredient) => {
        if (!confirm(`Delete "${ingredient.product_name}"?`)) return;

        try {
            const { error } = await supabase
                .from('products_ingredients')
                .delete()
                .eq('pid', ingredient.pid);

            if (error) throw error;
            toast.success('Ingredient deleted');
            loadIngredients();
        } catch (err) {
            console.error('Error deleting ingredient:', err);
            toast.error('Failed to delete');
        }
    };

    const filteredIngredients = ingredients.filter(i => {
        return i.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            i.product_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (i.supplier_name && i.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()));
    });

    // Real-time cost calculation preview
    const previewCostPerUnit = formData.pack_size > 0
        ? calculateCostPerBaseUnit(formData.price_per_pack, formData.pack_size)
        : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">🥬</span>
                        Products Ingredients (Raw Materials)
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Manage raw materials with pack sizes • Code format: PIG-XX • Auto-calculates cost per unit
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                >
                    <span className="text-xl">➕</span>
                    Add Ingredient
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-emerald-50 to-green-100 border border-emerald-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-2xl">
                            🥬
                        </div>
                        <div>
                            <p className="text-sm text-emerald-600 font-medium">Total Ingredients</p>
                            <p className="text-2xl font-bold text-gray-800">{ingredients.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white text-2xl">
                            📦
                        </div>
                        <div>
                            <p className="text-sm text-blue-600 font-medium">Active</p>
                            <p className="text-2xl font-bold text-gray-800">{ingredients.filter(i => i.active).length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center text-white text-2xl">
                            🏭
                        </div>
                        <div>
                            <p className="text-sm text-purple-600 font-medium">Suppliers</p>
                            <p className="text-2xl font-bold text-gray-800">
                                {new Set(ingredients.map(i => i.supplier_name).filter(Boolean)).size}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center text-white text-2xl">
                            💰
                        </div>
                        <div>
                            <p className="text-sm text-orange-600 font-medium">Total Value</p>
                            <p className="text-2xl font-bold text-gray-800">
                                Ksh {ingredients.reduce((sum, i) => sum + (i.price_per_pack || 0), 0).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Card */}
            <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 border border-emerald-200 rounded-2xl p-5">
                <div className="flex items-start gap-4">
                    <span className="text-3xl">💡</span>
                    <div>
                        <h3 className="font-bold text-emerald-800">How Cost Per Unit Works</h3>
                        <p className="text-sm text-emerald-700 mt-1">
                            When you enter a <strong>Pack Size</strong> (e.g., 50 Kg) and <strong>Price Per Pack</strong> (e.g., Ksh 5000),
                            the system automatically calculates the <strong>Cost Per Base Unit</strong> (e.g., Ksh 100 per Kg).
                            This cost is used in recipes to accurately calculate dish costs.
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="🔍 Search by name, code, or supplier..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/20 transition-all"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                    </div>
                    <button
                        onClick={loadIngredients}
                        className="px-5 py-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 font-medium transition-all flex items-center gap-2"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Ingredients Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-emerald-500 to-green-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Code</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Ingredient Name</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Pack Size</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Price/Pack</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Cost/Unit</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold hidden lg:table-cell">Supplier</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Status</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-emerald-400/30 border-t-emerald-500 rounded-full animate-spin"></div>
                                            <span className="text-gray-500">Loading ingredients...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredIngredients.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-5xl">🥬</span>
                                            <p className="text-gray-500">No ingredients found</p>
                                            <button
                                                onClick={openAddModal}
                                                className="px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors"
                                            >
                                                Add First Ingredient
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredIngredients.map((ingredient) => (
                                    <tr key={ingredient.pid} className="border-t border-gray-50 hover:bg-emerald-50/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                                                {ingredient.product_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                                                    style={{ backgroundColor: ingredient.button_ui_color || '#10B981' }}
                                                >
                                                    {ingredient.product_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-800">{ingredient.product_name}</p>
                                                    {ingredient.alias && (
                                                        <p className="text-xs text-gray-500">{ingredient.alias}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                                {ingredient.pack_size} {ingredient.base_unit}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right font-medium text-gray-600">
                                            Ksh {ingredient.price_per_pack?.toLocaleString() || '0'}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-emerald-600">
                                                    Ksh {ingredient.cost_per_base_unit?.toFixed(2) || '0.00'}
                                                </span>
                                                <span className="text-xs text-gray-500">per {ingredient.base_unit}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 hidden lg:table-cell text-gray-600">
                                            {ingredient.supplier_name || '-'}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ingredient.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                {ingredient.active ? '✅ Active' : '⏸️ Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(ingredient)}
                                                    className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-600 rounded-xl transition-all hover:scale-110"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => deleteIngredient(ingredient)}
                                                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all hover:scale-110"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingIngredient ? '✏️ Edit Ingredient' : '➕ Add New Ingredient'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            {editingIngredient && (
                                <p className="text-emerald-100 text-sm mt-1">Code: {editingIngredient.product_code}</p>
                            )}
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🥬 Ingredient Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.product_name}
                                        onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                                        placeholder="e.g., Sugar"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/20"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📝 Alias / Short Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.alias}
                                        onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                                        placeholder="e.g., White Sugar"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🏭 Supplier
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.supplier_name}
                                        onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                        placeholder="Supplier name"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/20"
                                    />
                                </div>
                            </div>

                            {/* Pack Size & Cost Calculation - MAIN FEATURE */}
                            <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 rounded-2xl p-6 border-2 border-emerald-300">
                                <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2 text-lg">
                                    📦 Pack Size & Cost Calculation
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Purchase Unit
                                        </label>
                                        <select
                                            value={formData.purchase_unit}
                                            onChange={(e) => setFormData({ ...formData, purchase_unit: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                        >
                                            {purchaseUnits.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Pack Size <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.pack_size}
                                            onChange={(e) => setFormData({ ...formData, pack_size: parseFloat(e.target.value) || 1 })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                            min="0.01"
                                            step="0.01"
                                            placeholder="e.g., 50"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Base Unit
                                        </label>
                                        <select
                                            value={formData.base_unit}
                                            onChange={(e) => setFormData({ ...formData, base_unit: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                        >
                                            {baseUnits.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Price Per Pack (Ksh)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.price_per_pack}
                                            onChange={(e) => setFormData({ ...formData, price_per_pack: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                            min="0"
                                            step="0.01"
                                            placeholder="e.g., 5000"
                                        />
                                    </div>
                                </div>

                                {/* Cost Preview */}
                                <div className="mt-4 p-4 bg-white rounded-xl border-2 border-emerald-400 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-600">Example:</p>
                                            <p className="text-gray-700">
                                                1 {formData.purchase_unit} = {formData.pack_size} {formData.base_unit} @ Ksh {formData.price_per_pack.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-gray-600">Cost Per {formData.base_unit}:</p>
                                            <p className="text-2xl font-bold text-emerald-600">
                                                Ksh {previewCostPerUnit.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Info */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🏷️ Category
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="Raw Materials">🥬 Raw Materials</option>
                                        {categories.map(cat => (
                                            <option key={cat.category_id} value={cat.category_name}>
                                                {cat.icon} {cat.category_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📊 Barcode
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.barcode}
                                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                        placeholder="Scan or enter"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        ⚠️ Reorder Point
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.reorder_point}
                                        onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 10 })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                        min="0"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🎨 Color
                                    </label>
                                    <input
                                        type="color"
                                        value={formData.button_ui_color}
                                        onChange={(e) => setFormData({ ...formData, button_ui_color: e.target.value })}
                                        className="w-full h-12 rounded-xl cursor-pointer border border-gray-200"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📋 Batch No
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.batch_no}
                                        onChange={(e) => setFormData({ ...formData, batch_no: e.target.value })}
                                        placeholder="Batch number"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div className="flex items-center gap-4 pt-8">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.active}
                                            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                            className="w-5 h-5 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                                        />
                                        <span className="font-medium text-gray-700">Active</span>
                                    </label>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📝 Description / Notes
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Additional notes about this ingredient..."
                                    rows={2}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-500 resize-none"
                                />
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-4 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-300/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingIngredient ? '💾' : '➕'}</span>
                                            {editingIngredient ? 'Update Ingredient' : 'Create Ingredient'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
