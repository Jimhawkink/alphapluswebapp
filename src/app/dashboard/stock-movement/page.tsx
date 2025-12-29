'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface StockMovement {
    movement_date: string;
    product_id: number;
    product_code: string;
    product_name: string;
    unit: string;
    opening_qty: number;
    purchased_qty: number;
    returned_qty: number;
    issued_qty: number;
    adjusted_qty: number;
    closing_qty: number;
    total_value: number;
}

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    base_unit: string;
    category: string;
}

export default function StockMovementPage() {
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Adjustment Modal
    const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
    const [adjustProduct, setAdjustProduct] = useState<number | null>(null);
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
    const [adjustReason, setAdjustReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalPurchased: 0,
        totalIssued: 0,
        totalReturned: 0,
        totalAdjusted: 0,
        totalValue: 0
    });

    // Load initial data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Load ingredients from products_ingredients table
                const { data: ingredientsData, error: ingredientsError } = await supabase
                    .from('products_ingredients')
                    .select('pid, product_code, product_name, base_unit, category')
                    .eq('active', true)
                    .order('product_name');

                if (ingredientsError) {
                    console.error('Error loading ingredients:', ingredientsError);
                } else {
                    setIngredients(ingredientsData || []);
                }
            } catch (err) {
                console.error('Error loading initial data:', err);
            }
        };
        loadInitialData();
    }, []);

    // Load movements
    const loadMovements = useCallback(async () => {
        setIsLoading(true);
        try {
            // Get purchases in date range
            const { data: purchasesData } = await supabase
                .from('purchases')
                .select('purchase_id, purchase_date, status')
                .gte('purchase_date', dateFrom)
                .lte('purchase_date', dateTo);

            const purchaseIds = (purchasesData || []).map(p => p.purchase_id);

            let purchaseItems: Array<{ product_id: number; product_name: string; quantity: number; rate: number; total_amount: number; purchase_id: number }> = [];
            if (purchaseIds.length > 0) {
                const { data: items } = await supabase
                    .from('purchase_products')
                    .select('product_id, product_name, quantity, rate, total_amount, purchase_id')
                    .in('purchase_id', purchaseIds);
                purchaseItems = items || [];
            }

            // Get recipe ingredients issued in date range
            const { data: recipeIssues } = await supabase
                .from('recipe_ingredients')
                .select('ingredient_product_id, ingredient_name, qty_issued, rate, total_cost, recipe_date')
                .gte('recipe_date', dateFrom)
                .lte('recipe_date', dateTo);

            // Create purchase_id to date map
            const purchaseIdToDate = new Map((purchasesData || []).map(p => [p.purchase_id, p.purchase_date]));

            // Aggregate by product and date
            const movementMap = new Map<string, StockMovement>();

            // Process purchases
            purchaseItems.forEach(item => {
                const purchaseDate = purchaseIdToDate.get(item.purchase_id);
                if (!purchaseDate) return;

                // Find ingredient to get product_code
                const ingredient = ingredients.find(i => i.pid === item.product_id);

                const key = `${purchaseDate}-${item.product_id}`;
                if (!movementMap.has(key)) {
                    movementMap.set(key, {
                        movement_date: purchaseDate,
                        product_id: item.product_id,
                        product_code: ingredient?.product_code || '',
                        product_name: item.product_name || ingredient?.product_name || '',
                        unit: ingredient?.base_unit || 'PCS',
                        opening_qty: 0,
                        purchased_qty: 0,
                        returned_qty: 0,
                        issued_qty: 0,
                        adjusted_qty: 0,
                        closing_qty: 0,
                        total_value: 0
                    });
                }
                const entry = movementMap.get(key)!;
                entry.purchased_qty += item.quantity || 0;
                entry.total_value += item.total_amount || 0;
            });

            // Process recipe issues
            (recipeIssues || []).forEach(item => {
                const issueDate = item.recipe_date;
                if (!issueDate) return;

                // Find ingredient to get product_code
                const ingredient = ingredients.find(i => i.pid === item.ingredient_product_id);

                const key = `${issueDate}-${item.ingredient_product_id}`;
                if (!movementMap.has(key)) {
                    movementMap.set(key, {
                        movement_date: issueDate,
                        product_id: item.ingredient_product_id,
                        product_code: ingredient?.product_code || '',
                        product_name: item.ingredient_name || ingredient?.product_name || '',
                        unit: ingredient?.base_unit || 'PCS',
                        opening_qty: 0,
                        purchased_qty: 0,
                        returned_qty: 0,
                        issued_qty: 0,
                        adjusted_qty: 0,
                        closing_qty: 0,
                        total_value: 0
                    });
                }
                const entry = movementMap.get(key)!;
                entry.issued_qty += item.qty_issued || 0;
            });

            // Calculate closing
            const movements = Array.from(movementMap.values()).map(m => ({
                ...m,
                closing_qty: m.opening_qty + m.purchased_qty - m.returned_qty - m.issued_qty + m.adjusted_qty
            }));

            // Filter by selected product if any
            let filteredMovements = movements;
            if (selectedProduct) {
                filteredMovements = movements.filter(m => m.product_id === selectedProduct);
            }

            filteredMovements.sort((a, b) => b.movement_date.localeCompare(a.movement_date));

            setMovements(filteredMovements);
            calculateStats(filteredMovements);
        } catch (err) {
            console.error('Error loading movements:', err);
            toast.error('Failed to load stock movements');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo, selectedProduct, ingredients]);

    // Calculate stats
    const calculateStats = (data: StockMovement[]) => {
        const stats = data.reduce((acc, m) => ({
            totalPurchased: acc.totalPurchased + m.purchased_qty,
            totalIssued: acc.totalIssued + m.issued_qty,
            totalReturned: acc.totalReturned + m.returned_qty,
            totalAdjusted: acc.totalAdjusted + Math.abs(m.adjusted_qty),
            totalValue: acc.totalValue + m.total_value
        }), { totalPurchased: 0, totalIssued: 0, totalReturned: 0, totalAdjusted: 0, totalValue: 0 });
        setStats(stats);
    };

    useEffect(() => {
        if (ingredients.length > 0) {
            loadMovements();
        }
    }, [loadMovements, ingredients]);

    // Filter movements by search
    const filteredMovements = movements.filter(m =>
        m.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.product_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Handle stock adjustment
    const handleAdjustment = async () => {
        if (!adjustProduct || !adjustQty) {
            toast.error('Please select ingredient and quantity');
            return;
        }

        setIsSaving(true);
        try {
            const ingredient = ingredients.find(i => i.pid === adjustProduct);
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;
            const qty = parseFloat(adjustQty);

            // Update the current_stock in products_ingredients
            const { data: currentData } = await supabase
                .from('products_ingredients')
                .select('current_stock')
                .eq('pid', adjustProduct)
                .single();

            const newStock = adjustType === 'add'
                ? (currentData?.current_stock || 0) + qty
                : (currentData?.current_stock || 0) - qty;

            const { error } = await supabase
                .from('products_ingredients')
                .update({
                    current_stock: Math.max(0, newStock),
                    updated_at: new Date().toISOString()
                })
                .eq('pid', adjustProduct);

            if (error) throw error;

            toast.success('Stock adjustment saved! 📋');
            setShowAdjustmentModal(false);
            setAdjustProduct(null);
            setAdjustQty('');
            setAdjustReason('');
            loadMovements();
        } catch (err) {
            console.error('Error saving adjustment:', err);
            toast.error('Failed to save adjustment');
        }
        setIsSaving(false);
    };

    return (
        <div className="max-w-full space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📦</span>
                        <span className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                            Stock / Ingredient Movement
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-1">Track purchases, issues, returns, and adjustments for ingredients</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowAdjustmentModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all"
                    >
                        <span>⚙️</span> Stock Adjustment
                    </button>
                    <button
                        onClick={loadMovements}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                    >
                        <span>🔄</span> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">🛒</span>
                        <span className="font-medium opacity-90">Purchased</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalPurchased.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">🍳</span>
                        <span className="font-medium opacity-90">Issued (Recipes)</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalIssued.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">↩️</span>
                        <span className="font-medium opacity-90">Returned</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalReturned.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 via-indigo-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">⚙️</span>
                        <span className="font-medium opacity-90">Adjusted</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalAdjusted.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">💰</span>
                        <span className="font-medium opacity-90">Total Value</span>
                    </div>
                    <p className="text-3xl font-bold">Ksh {stats.totalValue.toLocaleString()}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl">🔍</span>
                    <h3 className="font-semibold text-gray-700">Filters</h3>
                </div>
                <div className="grid grid-cols-5 gap-4">
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 From Date</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 To Date</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">🥬 Ingredient</label>
                        <select
                            value={selectedProduct || ''}
                            onChange={(e) => setSelectedProduct(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400"
                        >
                            <option value="">All Ingredients</option>
                            {ingredients.map(i => (
                                <option key={i.pid} value={i.pid}>{i.product_code} - {i.product_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">🔎 Search</label>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search ingredient..."
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-cyan-400"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={loadMovements}
                            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                        >
                            🔍 Apply
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="p-16 text-center">
                            <div className="inline-block animate-spin text-5xl mb-4">🔄</div>
                            <p className="text-gray-500">Loading stock movements...</p>
                        </div>
                    ) : filteredMovements.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-6xl block mb-4">📭</span>
                            <p className="text-gray-500 text-lg">No stock movements found</p>
                            <p className="text-gray-400 text-sm mt-2">Try adjusting your date range or add purchases/recipes</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gradient-to-r from-cyan-50 to-blue-50">
                                <tr>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Date</th>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Code</th>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Ingredient Name</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-gray-600 uppercase">Unit</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-blue-600 uppercase bg-blue-50">Opening</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-green-600 uppercase bg-green-50">Purchased</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-orange-600 uppercase bg-orange-50">Issued</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-purple-600 uppercase bg-purple-50">Adjusted</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-cyan-600 uppercase bg-cyan-50">Closing</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMovements.map((m, idx) => (
                                    <tr key={idx} className="border-t border-gray-50 hover:bg-cyan-50/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <span className="font-medium text-gray-700">
                                                {new Date(m.movement_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 font-mono text-sm text-gray-600">{m.product_code}</td>
                                        <td className="py-3 px-4">
                                            <span className="font-semibold text-gray-800">{m.product_name}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">{m.unit}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-blue-50/30">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold">{m.opening_qty.toLocaleString()}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-green-50/30">
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg font-bold">+{m.purchased_qty.toLocaleString()}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-orange-50/30">
                                            <span className={`px-3 py-1 rounded-lg font-bold ${m.issued_qty > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                                                -{m.issued_qty.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-purple-50/30">
                                            <span className={`px-3 py-1 rounded-lg font-bold ${m.adjusted_qty !== 0 ? (m.adjusted_qty > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-400'}`}>
                                                {m.adjusted_qty > 0 ? '+' : ''}{m.adjusted_qty.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-cyan-50/30">
                                            <span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-lg font-bold text-lg">{m.closing_qty.toLocaleString()}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Stock Adjustment Modal */}
            {showAdjustmentModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">⚙️</span>
                                Stock Adjustment
                            </h2>
                            <button onClick={() => setShowAdjustmentModal(false)} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Select Ingredient</label>
                                <select
                                    value={adjustProduct || ''}
                                    onChange={(e) => setAdjustProduct(e.target.value ? parseInt(e.target.value) : null)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400"
                                >
                                    <option value="">-- Select Ingredient --</option>
                                    {ingredients.map(i => (
                                        <option key={i.pid} value={i.pid}>{i.product_code} - {i.product_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Adjustment Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setAdjustType('add')}
                                        className={`py-3 rounded-xl font-semibold transition-all ${adjustType === 'add' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                                    >
                                        ➕ Add Stock
                                    </button>
                                    <button
                                        onClick={() => setAdjustType('subtract')}
                                        className={`py-3 rounded-xl font-semibold transition-all ${adjustType === 'subtract' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                                    >
                                        ➖ Remove Stock
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Quantity</label>
                                <input
                                    type="number"
                                    value={adjustQty}
                                    onChange={(e) => setAdjustQty(e.target.value)}
                                    placeholder="Enter quantity"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 text-lg font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Reason</label>
                                <textarea
                                    value={adjustReason}
                                    onChange={(e) => setAdjustReason(e.target.value)}
                                    placeholder="Reason for adjustment..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 h-20 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAdjustmentModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdjustment}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50"
                            >
                                {isSaving ? '⏳ Saving...' : '✅ Save Adjustment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
