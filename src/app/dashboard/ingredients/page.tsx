'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ============================================
// INTERFACES
// ============================================

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    base_unit: string;
    pack_size: number;
    price_per_pack: number;
    cost_per_base_unit: number;
    current_stock: number;
    reorder_point: number;
    supplier_name: string;
    active: boolean;
    created_at: string;
}

interface Category {
    category_id: number;
    category_name: string;
}

interface Supplier {
    supplier_id: number;
    supplier_name: string;
    active: boolean;
}

// ============================================
// UNIT DEFINITIONS - All-Round Logic
// ============================================

const UNIT_CONFIG = {
    // Mass Units (Base: KG)
    KG: { baseUnit: 'KG', toBase: 1, displayName: 'Kilograms', group: 'mass' },
    G: { baseUnit: 'KG', toBase: 0.001, displayName: 'Grams', group: 'mass' },
    GM: { baseUnit: 'KG', toBase: 0.001, displayName: 'Grams', group: 'mass' },
    GRAMS: { baseUnit: 'KG', toBase: 0.001, displayName: 'Grams', group: 'mass' },

    // Volume Units (Base: L)
    L: { baseUnit: 'L', toBase: 1, displayName: 'Liters', group: 'volume' },
    LTR: { baseUnit: 'L', toBase: 1, displayName: 'Liters', group: 'volume' },
    LITERS: { baseUnit: 'L', toBase: 1, displayName: 'Liters', group: 'volume' },
    ML: { baseUnit: 'L', toBase: 0.001, displayName: 'Milliliters', group: 'volume' },
    MLS: { baseUnit: 'L', toBase: 0.001, displayName: 'Milliliters', group: 'volume' },

    // Count Units (Base: PCS)
    PCS: { baseUnit: 'PCS', toBase: 1, displayName: 'Pieces', group: 'count' },
    PC: { baseUnit: 'PCS', toBase: 1, displayName: 'Pieces', group: 'count' },
    PIECES: { baseUnit: 'PCS', toBase: 1, displayName: 'Pieces', group: 'count' },
    EACH: { baseUnit: 'PCS', toBase: 1, displayName: 'Each', group: 'count' },

    // Eggs (Base: EGGS - sold in trays of 30)
    EGGS: { baseUnit: 'EGGS', toBase: 1, displayName: 'Eggs', group: 'count' },
    EGG: { baseUnit: 'EGGS', toBase: 1, displayName: 'Egg', group: 'count' },
    TRAY: { baseUnit: 'EGGS', toBase: 30, displayName: 'Tray (30)', group: 'count' },

    // Packets/Boxes
    PKT: { baseUnit: 'PKT', toBase: 1, displayName: 'Packet', group: 'package' },
    PACKET: { baseUnit: 'PKT', toBase: 1, displayName: 'Packet', group: 'package' },
    BOX: { baseUnit: 'BOX', toBase: 1, displayName: 'Box', group: 'package' },
    CARTON: { baseUnit: 'CARTON', toBase: 1, displayName: 'Carton', group: 'package' },

    // Bottles
    BTL: { baseUnit: 'BTL', toBase: 1, displayName: 'Bottle', group: 'package' },
    BOTTLE: { baseUnit: 'BTL', toBase: 1, displayName: 'Bottle', group: 'package' },
};

// Base units list for dropdown
const BASE_UNITS = [
    { value: 'KG', label: 'Kilograms (KG)', subUnits: ['KG', 'G'] },
    { value: 'L', label: 'Liters (L)', subUnits: ['L', 'ML'] },
    { value: 'PCS', label: 'Pieces (PCS)', subUnits: ['PCS'] },
    { value: 'EGGS', label: 'Eggs', subUnits: ['EGGS', 'TRAY'] },
    { value: 'PKT', label: 'Packets', subUnits: ['PKT'] },
    { value: 'BTL', label: 'Bottles', subUnits: ['BTL'] },
    { value: 'BOX', label: 'Boxes', subUnits: ['BOX'] },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert quantity from any unit to base unit
 * @param qty - The quantity to convert
 * @param fromUnit - The unit to convert from (e.g., 'G', 'ML', 'PCS')
 * @param baseUnit - The base unit of the ingredient (e.g., 'KG', 'L', 'PCS')
 * @returns Quantity in base units
 */
const convertToBaseUnit = (qty: number, fromUnit: string, baseUnit: string): number => {
    const from = fromUnit.toUpperCase().trim();
    const base = baseUnit.toUpperCase().trim();

    // Same unit - no conversion needed
    if (from === base) return qty;

    // Get unit config
    const fromConfig = UNIT_CONFIG[from as keyof typeof UNIT_CONFIG];
    const baseConfig = UNIT_CONFIG[base as keyof typeof UNIT_CONFIG];

    if (!fromConfig || !baseConfig) {
        console.warn(`Unknown unit conversion: ${from} -> ${base}`);
        return qty;
    }

    // Check if compatible (same group or same base)
    if (fromConfig.baseUnit !== base && fromConfig.baseUnit !== baseConfig.baseUnit) {
        console.warn(`Incompatible units: ${from} (${fromConfig.group}) -> ${base} (${baseConfig.group})`);
        return qty;
    }

    // Convert: qty * toBase gives us the amount in base units
    return qty * fromConfig.toBase;
};

/**
 * Calculate the cost for a given quantity
 * @param qtyIssued - Quantity issued
 * @param issuedUnit - Unit of issued quantity (e.g., 'G', 'ML', 'PCS')
 * @param costPerBaseUnit - Cost per base unit
 * @param baseUnit - Base unit of the ingredient
 * @returns Total cost for the issued quantity
 */
const calculateCost = (
    qtyIssued: number,
    issuedUnit: string,
    costPerBaseUnit: number,
    baseUnit: string
): number => {
    const qtyInBase = convertToBaseUnit(qtyIssued, issuedUnit, baseUnit);
    return qtyInBase * costPerBaseUnit;
};

/**
 * Calculate remaining stock after issuing
 * @param currentStock - Current stock in base units
 * @param qtyIssued - Quantity issued
 * @param issuedUnit - Unit of issued quantity
 * @param baseUnit - Base unit of the ingredient
 * @returns Remaining stock in base units
 */
const calculateRemainingStock = (
    currentStock: number,
    qtyIssued: number,
    issuedUnit: string,
    baseUnit: string
): number => {
    const qtyInBase = convertToBaseUnit(qtyIssued, issuedUnit, baseUnit);
    return Math.max(0, currentStock - qtyInBase);
};

// ============================================
// DEFAULT FORM DATA
// ============================================

const defaultFormData = {
    product_name: '',
    category: 'Raw Materials',
    base_unit: 'KG',
    pack_size: 1,
    price_per_pack: 0,
    opening_stock: 0,
    reorder_point: 10,
    supplier_name: '',
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function IngredientsPage() {
    // State
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
    const [formData, setFormData] = useState(defaultFormData);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');

    // ============================================
    // LOAD DATA
    // ============================================

    const loadIngredients = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('products_ingredients')
                .select('*')
                .order('product_name');

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
            const { data } = await supabase
                .from('product_categories')
                .select('*')
                .order('category_name');
            setCategories(data || []);
        } catch (err) {
            console.error('Error loading categories:', err);
        }
    }, []);

    const loadSuppliers = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('supplier_id, supplier_name, active')
                .eq('active', true)
                .order('supplier_name');

            if (error) throw error;
            setSuppliers(data || []);
        } catch (err) {
            console.error('Error loading suppliers:', err);
        }
    }, []);

    useEffect(() => {
        loadIngredients();
        loadCategories();
        loadSuppliers();
    }, [loadIngredients, loadCategories, loadSuppliers]);

    // ============================================
    // FORM HANDLERS
    // ============================================

    const handleInputChange = (field: string, value: string | number | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const openAddModal = () => {
        setEditingIngredient(null);
        setFormData(defaultFormData);
        setShowModal(true);
    };

    const openEditModal = (ingredient: Ingredient) => {
        setEditingIngredient(ingredient);
        setFormData({
            product_name: ingredient.product_name,
            category: ingredient.category || 'Raw Materials',
            base_unit: ingredient.base_unit || 'KG',
            pack_size: ingredient.pack_size || 1,
            price_per_pack: ingredient.price_per_pack || 0,
            opening_stock: ingredient.current_stock || 0,
            reorder_point: ingredient.reorder_point || 10,
            supplier_name: ingredient.supplier_name || '',
        });
        setShowModal(true);
    };

    // Auto-calculate cost per base unit
    const costPerBaseUnit = formData.pack_size > 0
        ? formData.price_per_pack / formData.pack_size
        : 0;

    // ============================================
    // SAVE INGREDIENT
    // ============================================

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.product_name.trim()) {
            toast.error('Product name is required');
            return;
        }

        if (formData.pack_size <= 0) {
            toast.error('Pack size must be greater than 0');
            return;
        }

        setIsSaving(true);
        try {
            const ingredientData = {
                product_name: formData.product_name.trim(),
                category: formData.category,
                base_unit: formData.base_unit,
                sales_unit: formData.base_unit, // Same as base unit for compatibility
                pack_size: formData.pack_size,
                price_per_pack: formData.price_per_pack,
                cost_per_base_unit: costPerBaseUnit,
                sales_cost: costPerBaseUnit, // For compatibility with recipe page
                current_stock: formData.opening_stock,
                reorder_point: formData.reorder_point,
                supplier_name: formData.supplier_name,
                active: true,
            };

            if (editingIngredient) {
                // Update
                const { error } = await supabase
                    .from('products_ingredients')
                    .update({
                        ...ingredientData,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('pid', editingIngredient.pid);

                if (error) throw error;
                toast.success('Ingredient updated! ✓');
            } else {
                // Generate product code
                const { count } = await supabase
                    .from('products_ingredients')
                    .select('*', { count: 'exact', head: true });

                const newCode = `PIG-${String((count || 0) + 1).padStart(3, '0')}`;

                const { error } = await supabase
                    .from('products_ingredients')
                    .insert({
                        ...ingredientData,
                        product_code: newCode,
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

    // ============================================
    // FILTER
    // ============================================

    const filteredIngredients = ingredients.filter(i => {
        const matchesSearch = i.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            i.product_code?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = filterCategory === 'All' || i.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    // Get unique categories from ingredients
    const uniqueCategories = ['All', ...Array.from(new Set(ingredients.map(i => i.category).filter(Boolean)))];

    // ============================================
    // UI
    // ============================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">🥬</span>
                        Ingredients Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Raw materials with automatic cost calculation per unit
                    </p>
                </div>
                <button
                    onClick={openAddModal}
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                >
                    <span>➕</span> Add Ingredient
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-4 text-white">
                    <p className="text-green-100 text-sm">Total Ingredients</p>
                    <p className="text-3xl font-bold">{ingredients.length}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                    <p className="text-blue-100 text-sm">Active</p>
                    <p className="text-3xl font-bold">{ingredients.filter(i => i.active !== false).length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white">
                    <p className="text-amber-100 text-sm">Low Stock</p>
                    <p className="text-3xl font-bold">
                        {ingredients.filter(i => (i.current_stock || 0) <= (i.reorder_point || 10)).length}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
                    <p className="text-purple-100 text-sm">Total Value</p>
                    <p className="text-2xl font-bold">
                        {ingredients.reduce((sum, i) =>
                            sum + ((i.current_stock || 0) * (i.cost_per_base_unit || 0)), 0
                        ).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Search & Filter */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="🔍 Search ingredients..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer"
                    >
                        {uniqueCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Ingredients Table */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                            <tr>
                                <th className="px-4 py-4 text-left font-semibold">Code</th>
                                <th className="px-4 py-4 text-left font-semibold">Ingredient Name</th>
                                <th className="px-4 py-4 text-center font-semibold">Base Unit</th>
                                <th className="px-4 py-4 text-center font-semibold">Pack Size</th>
                                <th className="px-4 py-4 text-right font-semibold">Pack Price</th>
                                <th className="px-4 py-4 text-right font-semibold">Cost/Unit</th>
                                <th className="px-4 py-4 text-right font-semibold">Stock</th>
                                <th className="px-4 py-4 text-right font-semibold">Value</th>
                                <th className="px-4 py-4 text-center font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-8 text-gray-400">
                                        Loading ingredients...
                                    </td>
                                </tr>
                            ) : filteredIngredients.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-8 text-gray-400">
                                        No ingredients found. Add your first ingredient!
                                    </td>
                                </tr>
                            ) : (
                                filteredIngredients.map((ingredient) => {
                                    const stockValue = (ingredient.current_stock || 0) * (ingredient.cost_per_base_unit || 0);
                                    const isLowStock = (ingredient.current_stock || 0) <= (ingredient.reorder_point || 10);

                                    return (
                                        <tr key={ingredient.pid} className="border-t border-gray-100 hover:bg-gray-50">
                                            <td className="px-4 py-3 font-mono text-sm">{ingredient.product_code}</td>
                                            <td className="px-4 py-3 font-medium">{ingredient.product_name}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                                                    {ingredient.base_unit}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">{ingredient.pack_size}</td>
                                            <td className="px-4 py-3 text-right">{(ingredient.price_per_pack || 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">
                                                {(ingredient.cost_per_base_unit || 0).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`font-bold ${isLowStock ? 'text-red-600' : 'text-gray-700'}`}>
                                                    {(ingredient.current_stock || 0).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-orange-600">
                                                {stockValue.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => openEditModal(ingredient)}
                                                        className="px-2 py-1 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => deleteIngredient(ingredient)}
                                                        className="px-2 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cost Calculation Examples */}
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-6 border border-blue-200">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>📊</span> Unit Conversion Reference
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <p className="font-semibold text-gray-700 mb-2">Mass (KG)</p>
                        <p className="text-gray-600">Sugar 50 KG = 3500</p>
                        <p className="text-green-600 font-medium">→ Cost/KG = 70</p>
                        <p className="text-orange-600">→ 500g = 70 × 0.5 = <strong>35</strong></p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <p className="font-semibold text-gray-700 mb-2">Volume (L)</p>
                        <p className="text-gray-600">Oil 20 L = 3000</p>
                        <p className="text-green-600 font-medium">→ Cost/L = 150</p>
                        <p className="text-orange-600">→ 100ml = 150 × 0.1 = <strong>15</strong></p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <p className="font-semibold text-gray-700 mb-2">Count (PCS)</p>
                        <p className="text-gray-600">Tomatoes 20 PCS = 60</p>
                        <p className="text-green-600 font-medium">→ Cost/PCS = 3</p>
                        <p className="text-orange-600">→ 2 PCS = 3 × 2 = <strong>6</strong></p>
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span>🥬</span>
                                {editingIngredient ? 'Edit Ingredient' : 'Add New Ingredient'}
                            </h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-2xl text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Ingredient Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Ingredient Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.product_name}
                                    onChange={(e) => handleInputChange('product_name', e.target.value)}
                                    placeholder="e.g., SUGAR 50KG, COOKING OIL 20L, TOMATOES"
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
                                    required
                                />
                            </div>

                            {/* Category & Supplier */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => handleInputChange('category', e.target.value)}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                                    >
                                        <option value="Raw Materials">Raw Materials</option>
                                        {categories.map(cat => (
                                            <option key={cat.category_id} value={cat.category_name}>
                                                {cat.category_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Supplier</label>
                                    <select
                                        value={formData.supplier_name}
                                        onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
                                    >
                                        <option value="">-- Select Supplier --</option>
                                        {suppliers.map(sup => (
                                            <option key={sup.supplier_id} value={sup.supplier_name}>
                                                {sup.supplier_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Pack Configuration */}
                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                                <h4 className="font-semibold text-blue-800 mb-4">📦 Pack Configuration</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Base Unit *</label>
                                        <select
                                            value={formData.base_unit}
                                            onChange={(e) => handleInputChange('base_unit', e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                                        >
                                            {BASE_UNITS.map(unit => (
                                                <option key={unit.value} value={unit.value}>{unit.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Pack Size (in {formData.base_unit}) *
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.pack_size}
                                            onChange={(e) => handleInputChange('pack_size', parseFloat(e.target.value) || 0)}
                                            min="0.01"
                                            step="0.01"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Price Per Pack *</label>
                                        <input
                                            type="number"
                                            value={formData.price_per_pack}
                                            onChange={(e) => handleInputChange('price_per_pack', parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.01"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Auto-calculated Cost */}
                                <div className="mt-4 p-3 bg-green-100 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <span className="text-green-700 font-medium">
                                            Cost per {formData.base_unit} (Auto-calculated):
                                        </span>
                                        <span className="text-2xl font-bold text-green-700">
                                            {costPerBaseUnit.toFixed(4)} KES
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stock Configuration */}
                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                                <h4 className="font-semibold text-amber-800 mb-4">📊 Stock Configuration</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Opening Stock (in {formData.base_unit})
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.opening_stock}
                                            onChange={(e) => handleInputChange('opening_stock', parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.01"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Reorder Point (in {formData.base_unit})
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.reorder_point}
                                            onChange={(e) => handleInputChange('reorder_point', parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.01"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                </div>

                                {/* Stock Value */}
                                <div className="mt-4 p-3 bg-orange-100 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <span className="text-orange-700 font-medium">
                                            Opening Stock Value:
                                        </span>
                                        <span className="text-2xl font-bold text-orange-700">
                                            {(formData.opening_stock * costPerBaseUnit).toFixed(2)} KES
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Submit Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : (editingIngredient ? 'Update Ingredient' : 'Create Ingredient')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
