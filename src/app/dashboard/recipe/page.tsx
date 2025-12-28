'use client';

import { useState, useEffect } from 'react';

// Types based on VB.NET frmReceipe
interface Dish {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    purchase_cost: number;
    sales_cost: number;
    barcode: string;
    stock_qty?: number;
}

interface Ingredient {
    pid: number;
    product_name: string;
    sales_cost: number;
    sales_unit: string;
    available_qty?: number;
}

interface RecipeIngredientRow {
    id: string;
    dish: string;
    ingredient: string;
    unit_measure: string;
    qty_issued: number;
    rate: number;
    total_cost: number;
    qty_produced: number;
    receipe_date: string;
    remaining_qty: number;
    product_id: number;
    batch_number: string;
    cost_per_dish: number;
}

// Sample dishes (products)
const sampleDishes: Dish[] = [
    { pid: 1, product_code: 'DISH001', product_name: 'Chicken Burger', category: 'Burgers', purchase_cost: 250, sales_cost: 450, barcode: '123456', stock_qty: 15 },
    { pid: 2, product_code: 'DISH002', product_name: 'Beef Burger', category: 'Burgers', purchase_cost: 300, sales_cost: 500, barcode: '123457', stock_qty: 10 },
    { pid: 3, product_code: 'DISH003', product_name: 'Pizza Margherita', category: 'Pizza', purchase_cost: 500, sales_cost: 850, barcode: '123458', stock_qty: 8 },
    { pid: 4, product_code: 'DISH004', product_name: 'Grilled Chicken', category: 'Main', purchase_cost: 400, sales_cost: 650, barcode: '123459', stock_qty: 12 },
    { pid: 5, product_code: 'DISH005', product_name: 'Fish & Chips', category: 'Main', purchase_cost: 350, sales_cost: 550, barcode: '123460', stock_qty: 18 },
];

// Sample ingredients
const sampleIngredients: Ingredient[] = [
    { pid: 101, product_name: 'Chicken Breast 1KG', sales_cost: 450, sales_unit: 'KG', available_qty: 25 },
    { pid: 102, product_name: 'Beef Mince 1KG', sales_cost: 550, sales_unit: 'KG', available_qty: 20 },
    { pid: 103, product_name: 'Burger Buns 8PCS', sales_cost: 120, sales_unit: 'PCS', available_qty: 50 },
    { pid: 104, product_name: 'Cooking Oil 1L', sales_cost: 280, sales_unit: 'L', available_qty: 30 },
    { pid: 105, product_name: 'Cheese 500G', sales_cost: 350, sales_unit: 'G', available_qty: 15 },
    { pid: 106, product_name: 'Tomatoes 1KG', sales_cost: 80, sales_unit: 'KG', available_qty: 40 },
    { pid: 107, product_name: 'Onions 1KG', sales_cost: 60, sales_unit: 'KG', available_qty: 45 },
    { pid: 108, product_name: 'Flour 2KG', sales_cost: 180, sales_unit: 'KG', available_qty: 35 },
    { pid: 109, product_name: 'Fish Fillet 1KG', sales_cost: 680, sales_unit: 'KG', available_qty: 18 },
    { pid: 110, product_name: 'Potatoes 5KG', sales_cost: 200, sales_unit: 'KG', available_qty: 60 },
    { pid: 111, product_name: 'Eggs 30PCS', sales_cost: 450, sales_unit: 'PCS', available_qty: 20 },
    { pid: 112, product_name: 'Salt 1KG', sales_cost: 50, sales_unit: 'KG', available_qty: 25 },
    { pid: 113, product_name: 'Pepper 100G', sales_cost: 120, sales_unit: 'G', available_qty: 15 },
];

const unitOptions = ['KG', 'G', 'L', 'ML', 'PCS'];

// Unit conversion function (from VB.NET ConvertToBase)
function convertToBase(qty: number, userUnit: string, baseUnit: string): number {
    userUnit = userUnit.toLowerCase().trim();
    baseUnit = baseUnit.toLowerCase().trim();

    if (userUnit === baseUnit || !userUnit) return qty;

    if (baseUnit.includes('l') && userUnit.includes('ml')) {
        return qty / 1000;
    }
    if (baseUnit.includes('kg') && (userUnit.includes('g') || userUnit.includes('gm'))) {
        return qty / 1000;
    }
    if (baseUnit.includes('egg') && userUnit.includes('pcs')) {
        return qty / 30; // 30 eggs per tray
    }
    return qty;
}

// Extract base quantity from product name (from VB.NET)
function extractBaseQuantity(productName: string): number {
    const pattern = /(\d+(?:\.\d+)?)\s*(L|KG|G|ML|PCS|EGGS?)\b/i;
    const match = productName.match(pattern);
    if (match) {
        return parseFloat(match[1]);
    }
    return 1;
}

// Generate batch number (from VB.NET GenerateBatchNumber)
function generateBatchNumber(productId: number, existingCount: number): string {
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = existingCount + 1;
    return `BATCH-${dateCode}-${productId}-${String(sequence).padStart(3, '0')}`;
}

export default function RecipePage() {
    // State
    const [dishes] = useState<Dish[]>(sampleDishes);
    const [ingredients] = useState<Ingredient[]>(sampleIngredients);
    const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
    const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
    const [ingredientRows, setIngredientRows] = useState<RecipeIngredientRow[]>([]);
    const [currentBatchNumber, setCurrentBatchNumber] = useState('');

    // Form fields
    const [receipeDate, setReceipeDate] = useState(new Date().toISOString().split('T')[0]);
    const [numberOfIngredients, setNumberOfIngredients] = useState(3);
    const [qtyIssued, setQtyIssued] = useState('');
    const [convertedUnit, setConvertedUnit] = useState('');
    const [qtyProduced, setQtyProduced] = useState('');
    const [availableStock, setAvailableStock] = useState(0);
    const [remainingQty, setRemainingQty] = useState(0);
    const [calculatedRate, setCalculatedRate] = useState(0);
    const [ingredientIdCounter, setIngredientIdCounter] = useState(1);

    // Dashboard stats
    const [stats, setStats] = useState({
        totalDishes: sampleDishes.length,
        totalIngredients: sampleIngredients.length,
        todayProduction: 0,
        totalBatches: 0
    });

    // Update remaining qty calculation (from VB.NET txtQtyIssuedIngredients_TextChanged)
    useEffect(() => {
        if (selectedIngredient && qtyIssued) {
            const enteredQty = parseFloat(qtyIssued) || 0;
            const baseQty = extractBaseQuantity(selectedIngredient.product_name);
            const unitToUse = convertedUnit || selectedIngredient.sales_unit;
            const converted = convertToBase(enteredQty, unitToUse, selectedIngredient.sales_unit);

            const remaining = Math.max(0, availableStock - converted);
            setRemainingQty(remaining);

            // Calculate rate
            if (baseQty > 0) {
                const rate = (selectedIngredient.sales_cost / baseQty) * converted;
                setCalculatedRate(rate);
            }
        }
    }, [qtyIssued, convertedUnit, selectedIngredient, availableStock]);

    // Handle dish selection (from VB.NET cmbDish_SelectedIndexChanged)
    const handleDishSelect = (dishId: number) => {
        const dish = dishes.find(d => d.pid === dishId);
        if (dish) {
            setSelectedDish(dish);
            setIngredientRows([]);
            setCurrentBatchNumber('');
        }
    };

    // Handle ingredient selection (from VB.NET cmbingredients_SelectedIndexChanged)
    const handleIngredientSelect = (ingredientId: number) => {
        const ingredient = ingredients.find(i => i.pid === ingredientId);
        if (ingredient) {
            setSelectedIngredient(ingredient);
            setAvailableStock(ingredient.available_qty || 0);
            setConvertedUnit(ingredient.sales_unit);
            setRemainingQty(ingredient.available_qty || 0);
            setQtyIssued('');
            setCalculatedRate(0);
        }
    };

    // Add ingredient to grid (from VB.NET txtQtyProduced_KeyDown)
    const addIngredient = () => {
        if (!selectedDish || !selectedIngredient || !qtyIssued) {
            alert('Please select a dish, ingredient, and enter quantity');
            return;
        }

        // Generate batch number on first ingredient
        let batchNum = currentBatchNumber;
        if (!batchNum) {
            batchNum = generateBatchNumber(selectedDish.pid, 0);
            setCurrentBatchNumber(batchNum);
        }

        const currentCount = ingredientRows.length;
        const isLastIngredient = currentCount === numberOfIngredients - 1;

        // Calculate cost per dish (only on last ingredient)
        let costPerDish = 0;
        if (isLastIngredient && qtyProduced) {
            const totalCost = ingredientRows.reduce((sum, row) => sum + row.total_cost, 0) + calculatedRate;
            const produced = parseFloat(qtyProduced) || 1;
            costPerDish = totalCost / produced;
        }

        const newRow: RecipeIngredientRow = {
            id: `ING-${ingredientIdCounter}`,
            dish: selectedDish.product_name,
            ingredient: selectedIngredient.product_name,
            unit_measure: selectedIngredient.sales_unit,
            qty_issued: parseFloat(qtyIssued) || 0,
            rate: selectedIngredient.sales_cost,
            total_cost: calculatedRate,
            qty_produced: isLastIngredient ? (parseFloat(qtyProduced) || 0) : 0,
            receipe_date: receipeDate,
            remaining_qty: remainingQty,
            product_id: selectedDish.pid,
            batch_number: batchNum,
            cost_per_dish: costPerDish
        };

        setIngredientRows([...ingredientRows, newRow]);
        setIngredientIdCounter(prev => prev + 1);

        // Clear ingredient fields
        setSelectedIngredient(null);
        setQtyIssued('');
        setCalculatedRate(0);

        // If last ingredient, save recipe
        if (isLastIngredient) {
            saveRecipe([...ingredientRows, newRow]);
        }
    };

    // Save recipe to database (from VB.NET SaveRecipeToDatabase)
    const saveRecipe = (rows: RecipeIngredientRow[]) => {
        if (rows.length === 0 || !selectedDish) {
            alert('No ingredients to save');
            return;
        }

        // Calculate totals
        const totalProductionCost = rows.reduce((sum, row) => sum + row.total_cost, 0);
        const produced = parseFloat(qtyProduced) || 1;
        const costPerUnit = totalProductionCost / produced;

        // Display success message
        alert(`Recipe saved successfully!
    
Batch: ${currentBatchNumber}
Dish: ${selectedDish.product_name}
Qty Produced: ${produced}
Total Cost: Ksh ${totalProductionCost.toFixed(2)}
Cost Per Unit: Ksh ${costPerUnit.toFixed(4)}`);

        // Update stats
        setStats(prev => ({
            ...prev,
            todayProduction: prev.todayProduction + produced,
            totalBatches: prev.totalBatches + 1
        }));

        // Reset form
        actionNew();
    };

    // New action (from VB.NET ActionNew)
    const actionNew = () => {
        setSelectedDish(null);
        setSelectedIngredient(null);
        setIngredientRows([]);
        setCurrentBatchNumber('');
        setQtyIssued('');
        setQtyProduced('');
        setCalculatedRate(0);
        setRemainingQty(0);
        setAvailableStock(0);
        setReceipeDate(new Date().toISOString().split('T')[0]);
    };

    // Delete row
    const deleteRow = (id: string) => {
        setIngredientRows(prev => prev.filter(row => row.id !== id));
    };

    // Calculate totals
    const totalCost = ingredientRows.reduce((sum, row) => sum + row.total_cost, 0);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-3xl shadow-lg">
                            🍳
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Recipe Management</h1>
                            <p className="text-gray-500">Create production batches by combining ingredients</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p className="font-semibold text-purple-600">Chef: Admin</p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total Dishes', value: stats.totalDishes, icon: '🍽️', color: 'blue' },
                    { label: 'Total Ingredients', value: stats.totalIngredients, icon: '🥗', color: 'green' },
                    { label: 'Today Production', value: stats.todayProduction, icon: '📦', color: 'purple' },
                    { label: 'Total Batches', value: stats.totalBatches, icon: '🏷️', color: 'orange' },
                ].map((stat, idx) => (
                    <div key={idx} className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">{stat.label}</p>
                                <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
                            </div>
                            <div className={`w-12 h-12 rounded-xl bg-${stat.color}-100 flex items-center justify-center text-2xl`}>
                                {stat.icon}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Left Panel - Dish & Recipe Details */}
                <div className="col-span-1 space-y-4">
                    {/* Dish Selection */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span>🍽️</span> Select Dish
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Dish Name *</label>
                                <select
                                    value={selectedDish?.pid || ''}
                                    onChange={(e) => handleDishSelect(parseInt(e.target.value))}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50"
                                >
                                    <option value="">-- Select Dish --</option>
                                    {dishes.map(dish => (
                                        <option key={dish.pid} value={dish.pid}>{dish.product_name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedDish && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-gray-500">Product ID</label>
                                            <p className="font-semibold text-gray-800">{selectedDish.pid}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Barcode</label>
                                            <p className="font-semibold text-gray-800">{selectedDish.barcode || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Purchase Rate</label>
                                            <p className="font-semibold text-green-600">Ksh {selectedDish.purchase_cost}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Sales Rate</label>
                                            <p className="font-semibold text-blue-600">Ksh {selectedDish.sales_cost}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Current Stock</label>
                                            <p className="font-semibold text-purple-600">{selectedDish.stock_qty || 0} units</p>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 block mb-2">Recipe Date</label>
                                    <input
                                        type="date"
                                        value={receipeDate}
                                        onChange={(e) => setReceipeDate(e.target.value)}
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 block mb-2">No. of Ingredients</label>
                                    <select
                                        value={numberOfIngredients}
                                        onChange={(e) => setNumberOfIngredients(parseInt(e.target.value))}
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Qty to Produce *</label>
                                <input
                                    type="number"
                                    value={qtyProduced}
                                    onChange={(e) => setQtyProduced(e.target.value)}
                                    placeholder="Enter quantity to produce..."
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50 text-lg font-semibold"
                                />
                            </div>

                            {currentBatchNumber && (
                                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                                    <p className="text-sm text-purple-600">Batch Number</p>
                                    <p className="font-bold text-purple-800">{currentBatchNumber}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Ingredient Input */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span>🥗</span> Add Ingredient
                            <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs font-bold rounded-full ml-auto">
                                {ingredientRows.length} / {numberOfIngredients}
                            </span>
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Ingredient *</label>
                                <select
                                    value={selectedIngredient?.pid || ''}
                                    onChange={(e) => handleIngredientSelect(parseInt(e.target.value))}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50"
                                >
                                    <option value="">-- Select Ingredient --</option>
                                    {ingredients.map(ing => (
                                        <option key={ing.pid} value={ing.pid}>{ing.product_name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedIngredient && (
                                <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl">
                                    <div>
                                        <label className="text-xs text-gray-500">Cost</label>
                                        <p className="font-semibold text-green-600">Ksh {selectedIngredient.sales_cost}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Unit</label>
                                        <p className="font-semibold">{selectedIngredient.sales_unit}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Available</label>
                                        <p className="font-semibold text-blue-600">{availableStock}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Remaining</label>
                                        <p className={`font-semibold ${remainingQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {remainingQty.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 block mb-2">Qty Issued *</label>
                                    <input
                                        type="number"
                                        value={qtyIssued}
                                        onChange={(e) => setQtyIssued(e.target.value)}
                                        placeholder="0"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 block mb-2">Unit</label>
                                    <select
                                        value={convertedUnit}
                                        onChange={(e) => setConvertedUnit(e.target.value)}
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 bg-gray-50"
                                    >
                                        {unitOptions.map(unit => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                                <div className="flex justify-between">
                                    <span className="text-green-700">Calculated Cost:</span>
                                    <span className="font-bold text-green-800">Ksh {calculatedRate.toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                onClick={addIngredient}
                                disabled={!selectedDish || !selectedIngredient || !qtyIssued || ingredientRows.length >= numberOfIngredients}
                                className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <span>➕</span>
                                <span>Add Ingredient</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Ingredients Grid & Summary */}
                <div className="col-span-2 space-y-4">
                    {/* Ingredients Table */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <span>📋</span> Recipe Ingredients
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={actionNew}
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                                >
                                    🔄 New Recipe
                                </button>
                                <button
                                    onClick={() => ingredientRows.length > 0 && saveRecipe(ingredientRows)}
                                    disabled={ingredientRows.length === 0}
                                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                                >
                                    💾 Save Recipe
                                </button>
                            </div>
                        </div>

                        {ingredientRows.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <span className="text-6xl block mb-4 opacity-50">🥗</span>
                                <p className="font-medium">No ingredients added yet</p>
                                <p className="text-sm">Select a dish and add ingredients to create a recipe</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="p-3 text-left text-xs font-semibold text-gray-500">#</th>
                                            <th className="p-3 text-left text-xs font-semibold text-gray-500">INGREDIENT</th>
                                            <th className="p-3 text-center text-xs font-semibold text-gray-500">UNIT</th>
                                            <th className="p-3 text-right text-xs font-semibold text-gray-500">QTY</th>
                                            <th className="p-3 text-right text-xs font-semibold text-gray-500">RATE</th>
                                            <th className="p-3 text-right text-xs font-semibold text-gray-500">TOTAL COST</th>
                                            <th className="p-3 text-right text-xs font-semibold text-gray-500">REMAINING</th>
                                            <th className="p-3 text-center text-xs font-semibold text-gray-500">ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ingredientRows.map((row, idx) => (
                                            <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                                                <td className="p-3 text-gray-500">{idx + 1}</td>
                                                <td className="p-3 font-medium text-gray-800">{row.ingredient}</td>
                                                <td className="p-3 text-center text-gray-600">{row.unit_measure}</td>
                                                <td className="p-3 text-right font-semibold">{row.qty_issued}</td>
                                                <td className="p-3 text-right text-gray-600">Ksh {row.rate}</td>
                                                <td className="p-3 text-right font-bold text-green-600">Ksh {row.total_cost.toFixed(2)}</td>
                                                <td className="p-3 text-right">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${row.remaining_qty > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {row.remaining_qty.toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => deleteRow(row.id)}
                                                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                                                    >
                                                        🗑️
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    {ingredientRows.length > 0 && (
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <span>📊</span> Production Summary
                            </h2>

                            <div className="grid grid-cols-4 gap-4">
                                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                                    <p className="text-sm text-purple-600">Dish</p>
                                    <p className="text-lg font-bold text-purple-800">{selectedDish?.product_name}</p>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                                    <p className="text-sm text-blue-600">Qty to Produce</p>
                                    <p className="text-lg font-bold text-blue-800">{qtyProduced || 0} units</p>
                                </div>
                                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                                    <p className="text-sm text-green-600">Total Production Cost</p>
                                    <p className="text-lg font-bold text-green-800">Ksh {totalCost.toFixed(2)}</p>
                                </div>
                                <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                                    <p className="text-sm text-orange-600">Cost Per Unit</p>
                                    <p className="text-lg font-bold text-orange-800">
                                        Ksh {qtyProduced ? (totalCost / parseFloat(qtyProduced)).toFixed(4) : '0.00'}
                                    </p>
                                </div>
                            </div>

                            {currentBatchNumber && (
                                <div className="mt-4 p-4 bg-gray-100 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-600">Batch Number</p>
                                            <p className="text-xl font-bold text-gray-800">{currentBatchNumber}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-gray-600">Recipe Date</p>
                                            <p className="font-semibold text-gray-800">{new Date(receipeDate).toLocaleDateString('en-GB')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-gray-600">Ingredients</p>
                                            <p className="font-semibold text-gray-800">{ingredientRows.length} / {numberOfIngredients}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Progress Indicator */}
                    {selectedDish && (
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-600 mb-3">Recipe Progress</h3>
                            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                                    style={{ width: `${(ingredientRows.length / numberOfIngredients) * 100}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between mt-2 text-sm text-gray-500">
                                <span>{ingredientRows.length} ingredients added</span>
                                <span>{numberOfIngredients - ingredientRows.length} remaining</span>
                            </div>
                            {ingredientRows.length === numberOfIngredients && (
                                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                                    <span className="text-green-700 font-semibold">✅ All ingredients added! Ready to save recipe.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
