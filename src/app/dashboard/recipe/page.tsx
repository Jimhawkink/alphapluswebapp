'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// Interfaces
interface Dish {
    pid: number;
    product_code: string;
    product_name: string;
    barcode: string;
    purchase_cost: number;
    sales_cost: number;
    current_stock?: number;
}

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    sales_cost: number;
    sales_unit: string;
    pack_size: number;
    available_stock: number;
}

interface IngredientEntry {
    recipe_id: number;
    dish_name: string;
    ingredient_name: string;
    ingredient_id: number;
    unit_measure: string;
    qty_issued: number;
    rate: number;
    total_cost: number;
    total_expense: number;
    qty_produced: number;
    recipe_date: string;
    remaining_qty: number;
    product_id: number;
    batch_number: string;
    cost_per_dish: number;
}

const convertUnits = ['mls', 'gms', 'ltr', 'kg', 'pcs'];

export default function RecipePage() {
    // Dashboard stats
    const [totalDishes, setTotalDishes] = useState(0);
    const [totalIngredients, setTotalIngredients] = useState(0);
    const [companyName, setCompanyName] = useState('');

    // Dropdowns
    const [dishes, setDishes] = useState<Dish[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);

    // Selected values
    const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
    const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
    const [numIngredients, setNumIngredients] = useState(2);

    // Form fields
    const [recipeId, setRecipeId] = useState(1);
    const [qtyIssued, setQtyIssued] = useState('');
    const [qtyProduced, setQtyProduced] = useState('');
    const [convertUnit, setConvertUnit] = useState('');
    const [recipeDate, setRecipeDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentBatchNumber, setCurrentBatchNumber] = useState('');

    // Calculated values
    const [calculatedRate, setCalculatedRate] = useState(0);
    const [remainingQty, setRemainingQty] = useState(0);
    const [availableStock, setAvailableStock] = useState(0);

    // Ingredient entries grid
    const [ingredientEntries, setIngredientEntries] = useState<IngredientEntry[]>([]);

    // Loading states
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    // Extract base quantity from product name (e.g., "SUGAR 50KG" -> 50)
    const extractBaseQuantity = (productName: string): number => {
        const pattern = /(\d+(?:\.\d+)?)\s*(L|KG|G|ML|PCS|EGGS?)/i;
        const match = productName.toUpperCase().match(pattern);
        if (match) {
            const qty = parseFloat(match[1]);
            const unit = match[2];
            if (unit.includes('EGG') && qty === 150) return 1;
            return qty;
        }
        return 1;
    };

    // Convert quantity to base unit
    const convertToBase = (qty: number, userUnit: string, baseUnit: string): number => {
        const user = userUnit.toLowerCase().trim();
        const base = baseUnit.toLowerCase().trim();

        if (user === base || !user) return qty;

        // mls -> liters (divide by 1000)
        if (base.includes('l') && user.includes('ml')) return qty / 1000;
        // gms -> kg (divide by 1000)
        if (base.includes('kg') && user.includes('gm')) return qty / 1000;
        // eggs conversion
        if (base.includes('egg') && user.includes('pc')) return qty / 150;

        return qty;
    };

    // Generate batch number
    const generateBatchNumber = async (): Promise<string> => {
        if (!selectedDish) return '';

        const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let seq = 1;

        try {
            const { count } = await supabase
                .from('production_batches')
                .select('*', { count: 'exact', head: true })
                .eq('product_id', selectedDish.pid)
                .gte('created_at', new Date().toISOString().slice(0, 10));

            seq = (count || 0) + 1;
        } catch {
            seq = 1;
        }

        return `BATCH-${dateCode}-${selectedDish.pid}-${String(seq).padStart(3, '0')}`;
    };

    // ============================================
    // LOAD DATA
    // ============================================

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Load company name
            const { data: orgData } = await supabase
                .from('organisation_settings')
                .select('setting_value')
                .eq('setting_key', 'company_name')
                .single();
            setCompanyName(orgData?.setting_value || 'Alpha Plus');

            // Load total dishes count
            const { count: dishCount } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true });
            setTotalDishes(dishCount || 0);

            // Load total ingredients count
            const { count: ingCount } = await supabase
                .from('products_ingredients')
                .select('*', { count: 'exact', head: true });
            setTotalIngredients(ingCount || 0);

            // Load dishes (products)
            const { data: dishesData } = await supabase
                .from('products')
                .select('pid, product_code, product_name, barcode, purchase_cost, sales_cost')
                .eq('active', true)
                .order('product_name');
            setDishes(dishesData || []);

            // Load ingredients
            const { data: ingredientsData } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, sales_cost, sales_unit, pack_size')
                .eq('active', true)
                .order('product_name');

            // Add stock info
            const ingredientsWithStock = await Promise.all(
                (ingredientsData || []).map(async (ing) => {
                    // TODO: Get actual stock from temp_stock_company_ingredients
                    return { ...ing, available_stock: 100 }; // Placeholder
                })
            );
            setIngredients(ingredientsWithStock);

            // Get next recipe ID
            const { count: recipeCount } = await supabase
                .from('recipe_ingredients')
                .select('*', { count: 'exact', head: true });
            setRecipeId((recipeCount || 0) + 1);

        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ============================================
    // CALCULATE RATE WHEN QTY ISSUED CHANGES
    // ============================================

    useEffect(() => {
        if (!selectedIngredient || !qtyIssued) {
            setCalculatedRate(0);
            setRemainingQty(0);
            return;
        }

        const qty = parseFloat(qtyIssued) || 0;
        const baseQty = extractBaseQuantity(selectedIngredient.product_name);
        const convertedQty = convertToBase(qty, convertUnit, selectedIngredient.sales_unit);

        // Calculate rate: (cost / baseQty) * convertedQty
        const rate = baseQty > 0 ? (selectedIngredient.sales_cost / baseQty) * convertedQty : 0;
        setCalculatedRate(rate);

        // Calculate remaining stock
        const remaining = selectedIngredient.available_stock - convertedQty;
        setRemainingQty(remaining > 0 ? remaining : 0);
        setAvailableStock(selectedIngredient.available_stock);

    }, [selectedIngredient, qtyIssued, convertUnit]);

    // Check if this is the last ingredient
    const isLastIngredient = ingredientEntries.length === numIngredients - 1;

    // ============================================
    // ADD INGREDIENT TO LIST
    // ============================================

    const addIngredientToList = async () => {
        if (!selectedDish) {
            toast.error('Please select a dish first');
            return;
        }
        if (!selectedIngredient) {
            toast.error('Please select an ingredient');
            return;
        }
        const qty = parseFloat(qtyIssued);
        if (!qty || qty <= 0) {
            toast.error('Please enter a valid quantity');
            return;
        }

        // Check if last ingredient needs qty produced
        const isLast = ingredientEntries.length === numIngredients - 1;
        let qtyProd = 0;
        if (isLast) {
            qtyProd = parseFloat(qtyProduced);
            if (!qtyProd || qtyProd <= 0) {
                toast.error('This is the last ingredient - enter Qty Produced!');
                return;
            }
        }

        // Generate batch number on first ingredient
        let batchNum = currentBatchNumber;
        if (!batchNum) {
            batchNum = await generateBatchNumber();
            setCurrentBatchNumber(batchNum);
        }

        // Calculate cost per dish (only for last ingredient)
        const totalCostSoFar = ingredientEntries.reduce((sum, e) => sum + e.total_cost, 0) + calculatedRate;
        const costPerDish = isLast && qtyProd > 0 ? totalCostSoFar / qtyProd : 0;

        const entry: IngredientEntry = {
            recipe_id: recipeId,
            dish_name: selectedDish.product_name,
            ingredient_name: selectedIngredient.product_name,
            ingredient_id: selectedIngredient.pid,
            unit_measure: selectedIngredient.sales_unit,
            qty_issued: qty,
            rate: selectedIngredient.sales_cost,
            total_cost: calculatedRate,
            total_expense: calculatedRate,
            qty_produced: qtyProd,
            recipe_date: recipeDate,
            remaining_qty: remainingQty,
            product_id: selectedDish.pid,
            batch_number: batchNum,
            cost_per_dish: costPerDish,
        };

        setIngredientEntries([...ingredientEntries, entry]);
        setRecipeId(recipeId + 1);

        // Clear ingredient fields
        setSelectedIngredient(null);
        setQtyIssued('');
        setConvertUnit('');
        setQtyProduced('');

        if (isLast) {
            toast.success(`All ${numIngredients} ingredients added! Click Save.`);
        } else {
            toast.success(`Ingredient ${ingredientEntries.length + 1}/${numIngredients} added`);
        }
    };

    // ============================================
    // SAVE RECIPE
    // ============================================

    const saveRecipe = async () => {
        if (!selectedDish || ingredientEntries.length === 0) {
            toast.error('No recipe to save');
            return;
        }

        const lastEntry = ingredientEntries[ingredientEntries.length - 1];
        if (lastEntry.qty_produced <= 0) {
            toast.error('Please enter Qty Produced on the last ingredient');
            return;
        }

        setIsSaving(true);
        try {
            // Calculate totals
            const totalProductionCost = ingredientEntries.reduce((sum, e) => sum + e.total_cost, 0);
            const qtyProducedFinal = lastEntry.qty_produced;
            const costPerUnit = qtyProducedFinal > 0 ? totalProductionCost / qtyProducedFinal : 0;

            // 1. Create recipe master record
            const { data: recipeData, error: recipeError } = await supabase
                .from('recipes')
                .insert({
                    product_id: selectedDish.pid,
                    dish_name: selectedDish.product_name,
                    barcode: selectedDish.barcode,
                    qty_produced: qtyProducedFinal,
                    total_cost: totalProductionCost,
                    cost_per_unit: costPerUnit,
                    recipe_date: recipeDate,
                    batch_number: currentBatchNumber,
                    created_by: 'Web User',
                    status: 'Completed',
                })
                .select()
                .single();

            if (recipeError) throw recipeError;

            // 2. Insert all ingredients
            const ingredientRecords = ingredientEntries.map(entry => ({
                recipe_id: recipeData.recipe_id,
                ingredient_product_id: entry.ingredient_id,
                ingredient_name: entry.ingredient_name,
                unit_measure: entry.unit_measure,
                qty_issued: entry.qty_issued,
                convert_unit: convertUnit,
                rate: entry.rate,
                total_cost: entry.total_cost,
                remaining_qty: entry.remaining_qty,
            }));

            const { error: ingredientError } = await supabase
                .from('recipe_ingredients')
                .insert(ingredientRecords);

            if (ingredientError) throw ingredientError;

            // 3. Create production batch
            const { error: batchError } = await supabase
                .from('production_batches')
                .insert({
                    batch_number: currentBatchNumber,
                    product_id: selectedDish.pid,
                    product_name: selectedDish.product_name,
                    recipe_id: recipeData.recipe_id,
                    qty_produced: qtyProducedFinal,
                    qty_remaining: qtyProducedFinal,
                    qty_sold: 0,
                    cost_per_unit: costPerUnit,
                    selling_price: selectedDish.sales_cost,
                    production_date: recipeDate,
                    status: 'In Stock',
                    created_by: 'Web User',
                });

            if (batchError) throw batchError;

            toast.success(
                `✅ Recipe Saved!\nBatch: ${currentBatchNumber}\nQty: ${qtyProducedFinal}\nCost/Unit: ${costPerUnit.toFixed(2)}`
            );

            // Clear form
            clearForm();
            loadData();

        } catch (err) {
            console.error('Error saving recipe:', err);
            toast.error('Failed to save recipe');
        }
        setIsSaving(false);
    };

    // ============================================
    // CLEAR FORM
    // ============================================

    const clearForm = () => {
        setIngredientEntries([]);
        setSelectedDish(null);
        setSelectedIngredient(null);
        setQtyIssued('');
        setQtyProduced('');
        setCurrentBatchNumber('');
        setConvertUnit('');
        setNumIngredients(2);
    };

    const deleteEntry = (index: number) => {
        const newEntries = [...ingredientEntries];
        newEntries.splice(index, 1);
        setIngredientEntries(newEntries);
    };

    // ============================================
    // UI
    // ============================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">🍳</span>
                        Recipe Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {companyName} • {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-4 text-white">
                    <p className="text-green-100 text-sm">Total Ingredients</p>
                    <p className="text-3xl font-bold">Produced {totalIngredients}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-4 text-white">
                    <p className="text-cyan-100 text-sm">Total Dish</p>
                    <p className="text-3xl font-bold">Produced {totalDishes}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white">
                    <p className="text-amber-100 text-sm">Current Batch</p>
                    <p className="text-lg font-bold truncate">{currentBatchNumber || 'Not Started'}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
                    <p className="text-purple-100 text-sm">Entries Added</p>
                    <p className="text-3xl font-bold">{ingredientEntries.length} / {numIngredients}</p>
                </div>
            </div>

            {/* Main Form */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                {/* Row 1: Recipe ID & No. of Ingredients */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Recipe ID</label>
                        <input
                            type="text"
                            value={recipeId}
                            readOnly
                            className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-800 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">No. of Ingredients</label>
                        <select
                            value={numIngredients}
                            onChange={(e) => setNumIngredients(parseInt(e.target.value))}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl cursor-pointer"
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Dish Name *</label>
                        <select
                            value={selectedDish?.pid || ''}
                            onChange={(e) => {
                                const dish = dishes.find(d => d.pid === parseInt(e.target.value));
                                setSelectedDish(dish || null);
                            }}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl cursor-pointer"
                        >
                            <option value="">Select Dish...</option>
                            {dishes.map(d => (
                                <option key={d.pid} value={d.pid}>{d.product_name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Dish Info */}
                {selectedDish && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <div>
                            <p className="text-xs text-blue-600">Product ID</p>
                            <p className="font-bold text-blue-800">{selectedDish.pid}</p>
                        </div>
                        <div>
                            <p className="text-xs text-blue-600">Barcode</p>
                            <p className="font-bold text-blue-800">{selectedDish.barcode || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-blue-600">Purchase Rate</p>
                            <p className="font-bold text-blue-800">{selectedDish.purchase_cost?.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-blue-600">Sales Rate</p>
                            <p className="font-bold text-blue-800">{selectedDish.sales_cost?.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-blue-600">Current Stock</p>
                            <p className="font-bold text-blue-800">{selectedDish.current_stock || 0}</p>
                        </div>
                    </div>
                )}

                <div className="border-t border-gray-200 pt-6 mb-6">
                    <h3 className="font-bold text-gray-800 mb-4">📦 Add Ingredient</h3>
                </div>

                {/* Row 2: Ingredient Selection */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Ingredient *</label>
                        <select
                            value={selectedIngredient?.pid || ''}
                            onChange={(e) => {
                                const ing = ingredients.find(i => i.pid === parseInt(e.target.value));
                                setSelectedIngredient(ing || null);
                            }}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl cursor-pointer"
                        >
                            <option value="">Select Ingredient...</option>
                            {ingredients.map(i => (
                                <option key={i.pid} value={i.pid}>
                                    {i.product_name} (Stock: {i.available_stock})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Recipe Date</label>
                        <input
                            type="date"
                            value={recipeDate}
                            onChange={(e) => setRecipeDate(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                        />
                    </div>
                </div>

                {/* Ingredient Info */}
                {selectedIngredient && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
                        <div>
                            <p className="text-xs text-green-600">Unit</p>
                            <p className="font-bold text-green-800">{selectedIngredient.sales_unit}</p>
                        </div>
                        <div>
                            <p className="text-xs text-green-600">Cost</p>
                            <p className="font-bold text-green-800">{selectedIngredient.sales_cost?.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-green-600">Base Qty</p>
                            <p className="font-bold text-green-800">{extractBaseQuantity(selectedIngredient.product_name).toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-green-600">Available Stock</p>
                            <p className="font-bold text-green-800">{selectedIngredient.available_stock}</p>
                        </div>
                    </div>
                )}

                {/* Row 3: Qty Issued & Convert Unit */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Qty Issued *</label>
                        <input
                            type="number"
                            value={qtyIssued}
                            onChange={(e) => setQtyIssued(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl"
                            placeholder="Enter qty"
                            min="0"
                            step="0.01"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Convert Unit</label>
                        <select
                            value={convertUnit}
                            onChange={(e) => setConvertUnit(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl cursor-pointer"
                        >
                            <option value="">Select unit...</option>
                            {convertUnits.map(u => (
                                <option key={u} value={u}>{u.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Rate (Cost)</label>
                        <div className="w-full px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl font-bold text-orange-600">
                            {calculatedRate.toFixed(2)}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Remaining Qty</label>
                        <div className={`w-full px-4 py-3 rounded-xl font-bold border ${remainingQty > 0 ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-600'
                            }`}>
                            {remainingQty.toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* Row 4: Qty Produced (only for last ingredient) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Qty Produced {isLastIngredient && <span className="text-red-500">* (Last ingredient!)</span>}
                        </label>
                        <input
                            type="number"
                            value={qtyProduced}
                            onChange={(e) => setQtyProduced(e.target.value)}
                            disabled={!isLastIngredient}
                            className={`w-full px-4 py-3 border rounded-xl ${isLastIngredient
                                    ? 'bg-yellow-50 border-yellow-300 focus:border-yellow-500'
                                    : 'bg-gray-100 border-gray-200 cursor-not-allowed'
                                }`}
                            placeholder={isLastIngredient ? "Enter qty produced..." : "Only on last ingredient"}
                            min="0"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={addIngredientToList}
                        disabled={isLoading}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <span>➕</span> Add to List
                    </button>
                    <button
                        onClick={clearForm}
                        className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <span>🆕</span> New
                    </button>
                    <button
                        onClick={saveRecipe}
                        disabled={isSaving || ingredientEntries.length === 0}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? '💾 Saving...' : '💾 Save Recipe'}
                    </button>
                </div>
            </div>

            {/* Ingredients Grid */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 text-white">
                    <h2 className="text-lg font-bold">📋 Recipe Ingredients ({ingredientEntries.length}/{numIngredients})</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-3 text-left font-semibold text-gray-600">ID</th>
                                <th className="px-3 py-3 text-left font-semibold text-gray-600">Dish</th>
                                <th className="px-3 py-3 text-left font-semibold text-gray-600">Ingredient</th>
                                <th className="px-3 py-3 text-left font-semibold text-gray-600">Unit</th>
                                <th className="px-3 py-3 text-right font-semibold text-gray-600">Qty Issued</th>
                                <th className="px-3 py-3 text-right font-semibold text-gray-600">Rate</th>
                                <th className="px-3 py-3 text-right font-semibold text-gray-600">Total Cost</th>
                                <th className="px-3 py-3 text-right font-semibold text-gray-600">Qty Prod</th>
                                <th className="px-3 py-3 text-right font-semibold text-gray-600">Cost/Dish</th>
                                <th className="px-3 py-3 text-center font-semibold text-gray-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ingredientEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-8 text-gray-400">
                                        No ingredients added yet. Select a dish and add ingredients above.
                                    </td>
                                </tr>
                            ) : (
                                ingredientEntries.map((entry, index) => (
                                    <tr key={index} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 py-3 font-mono">{entry.recipe_id}</td>
                                        <td className="px-3 py-3">{entry.dish_name}</td>
                                        <td className="px-3 py-3">{entry.ingredient_name}</td>
                                        <td className="px-3 py-3">{entry.unit_measure}</td>
                                        <td className="px-3 py-3 text-right">{entry.qty_issued.toFixed(2)}</td>
                                        <td className="px-3 py-3 text-right">{entry.rate.toFixed(2)}</td>
                                        <td className="px-3 py-3 text-right font-semibold text-orange-600">{entry.total_cost.toFixed(2)}</td>
                                        <td className="px-3 py-3 text-right font-bold text-green-600">
                                            {entry.qty_produced > 0 ? entry.qty_produced : '-'}
                                        </td>
                                        <td className="px-3 py-3 text-right font-bold text-purple-600">
                                            {entry.cost_per_dish > 0 ? entry.cost_per_dish.toFixed(4) : '-'}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <button
                                                onClick={() => deleteEntry(index)}
                                                className="px-2 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {ingredientEntries.length > 0 && (
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                <tr>
                                    <td colSpan={6} className="px-3 py-3 text-right font-bold">Total Production Cost:</td>
                                    <td className="px-3 py-3 text-right font-bold text-xl text-orange-600">
                                        {ingredientEntries.reduce((sum, e) => sum + e.total_cost, 0).toFixed(2)}
                                    </td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
