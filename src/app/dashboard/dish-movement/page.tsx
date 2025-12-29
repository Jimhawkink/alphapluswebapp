'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface DishMovement {
    movement_date: string;
    product_id: number;
    product_code: string;
    product_name: string;
    opening_qty: number;
    produced_qty: number;
    sold_qty: number;
    spoiled_qty: number;
    adjusted_qty: number;
    closing_qty: number;
    total_sales: number;
    total_cost: number;
    total_profit: number;
    total_spoilage_loss: number;
}

interface Product {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    sales_cost: number;
}

interface Shift {
    shift_def_id: number;
    shift_name: string;
    shift_code: string;
}

export default function DishMovementPage() {
    const [movements, setMovements] = useState<DishMovement[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
    const [selectedShift, setSelectedShift] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Spoilage Modal
    const [showSpoilageModal, setShowSpoilageModal] = useState(false);
    const [spoilageProduct, setSpoilageProduct] = useState<number | null>(null);
    const [spoilageQty, setSpoilageQty] = useState('');
    const [spoilageReason, setSpoilageReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalProduced: 0,
        totalSold: 0,
        totalSpoiled: 0,
        totalProfit: 0,
        totalLoss: 0
    });

    // Load initial data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Load products (dishes) from products table
                const { data: productsData } = await supabase
                    .from('products')
                    .select('pid, product_code, product_name, category, sales_cost')
                    .eq('active', true)
                    .order('product_name');
                setProducts(productsData || []);

                // Load shifts
                const { data: shiftsData } = await supabase
                    .from('shift_definitions')
                    .select('shift_def_id, shift_name, shift_code')
                    .eq('is_active', true);
                setShifts(shiftsData || []);
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
            // Get production batches in date range
            const { data: batchData } = await supabase
                .from('production_batches')
                .select('batch_id, product_id, product_name, qty_produced, qty_remaining, production_date, cost_per_unit, sales_rate')
                .gte('production_date', dateFrom)
                .lte('production_date', dateTo)
                .order('production_date', { ascending: false });

            // Get sales in date range
            const { data: salesData } = await supabase
                .from('sales')
                .select('sale_id, sale_date, status')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo);

            const saleIds = (salesData || []).map(s => s.sale_id);

            let salesItems: Array<{ product_id: number; product_name: string; quantity: number; unit_price: number; cost_price: number; sale_id: number }> = [];
            if (saleIds.length > 0) {
                const { data: items } = await supabase
                    .from('sales_items')
                    .select('product_id, product_name, quantity, unit_price, cost_price, sale_id')
                    .in('sale_id', saleIds);
                salesItems = items || [];
            }

            // Get spoilage data
            const { data: spoilageData } = await supabase
                .from('dish_spoilage')
                .select('product_id, product_name, quantity, total_loss, spoilage_date')
                .gte('spoilage_date', dateFrom)
                .lte('spoilage_date', dateTo);

            // Create sale_id to date map
            const saleIdToDate = new Map((salesData || []).map(s => [s.sale_id, s.sale_date]));

            // Aggregate by product and date
            const movementMap = new Map<string, DishMovement>();

            // Process production batches
            (batchData || []).forEach(batch => {
                // Find product to get product_code
                const product = products.find(p => p.pid === batch.product_id);

                const key = `${batch.production_date}-${batch.product_id}`;
                if (!movementMap.has(key)) {
                    movementMap.set(key, {
                        movement_date: batch.production_date,
                        product_id: batch.product_id,
                        product_code: product?.product_code || '',
                        product_name: batch.product_name || product?.product_name || '',
                        opening_qty: 0,
                        produced_qty: 0,
                        sold_qty: 0,
                        spoiled_qty: 0,
                        adjusted_qty: 0,
                        closing_qty: 0,
                        total_sales: 0,
                        total_cost: 0,
                        total_profit: 0,
                        total_spoilage_loss: 0
                    });
                }
                const entry = movementMap.get(key)!;
                entry.produced_qty += batch.qty_produced || 0;
                entry.opening_qty = batch.qty_remaining || 0; // Use qty_remaining as opening for next day
            });

            // Process sales
            salesItems.forEach(item => {
                const saleDate = saleIdToDate.get(item.sale_id);
                if (!saleDate) return;

                // Find product to get product_code
                const product = products.find(p => p.pid === item.product_id);

                const key = `${saleDate}-${item.product_id}`;
                if (!movementMap.has(key)) {
                    movementMap.set(key, {
                        movement_date: saleDate,
                        product_id: item.product_id,
                        product_code: product?.product_code || '',
                        product_name: item.product_name || product?.product_name || '',
                        opening_qty: 0,
                        produced_qty: 0,
                        sold_qty: 0,
                        spoiled_qty: 0,
                        adjusted_qty: 0,
                        closing_qty: 0,
                        total_sales: 0,
                        total_cost: 0,
                        total_profit: 0,
                        total_spoilage_loss: 0
                    });
                }
                const entry = movementMap.get(key)!;
                entry.sold_qty += item.quantity || 0;
                entry.total_sales += (item.unit_price || 0) * (item.quantity || 0);
                entry.total_cost += (item.cost_price || 0) * (item.quantity || 0);
            });

            // Process spoilage
            (spoilageData || []).forEach(sp => {
                const key = `${sp.spoilage_date}-${sp.product_id}`;
                if (!movementMap.has(key)) {
                    const product = products.find(p => p.pid === sp.product_id);
                    movementMap.set(key, {
                        movement_date: sp.spoilage_date,
                        product_id: sp.product_id,
                        product_code: product?.product_code || '',
                        product_name: sp.product_name || product?.product_name || '',
                        opening_qty: 0,
                        produced_qty: 0,
                        sold_qty: 0,
                        spoiled_qty: 0,
                        adjusted_qty: 0,
                        closing_qty: 0,
                        total_sales: 0,
                        total_cost: 0,
                        total_profit: 0,
                        total_spoilage_loss: 0
                    });
                }
                const entry = movementMap.get(key)!;
                entry.spoiled_qty += sp.quantity || 0;
                entry.total_spoilage_loss += sp.total_loss || 0;
            });

            // Calculate closing and profit
            let movementsArray = Array.from(movementMap.values()).map(m => ({
                ...m,
                closing_qty: m.opening_qty + m.produced_qty - m.sold_qty - m.spoiled_qty + m.adjusted_qty,
                total_profit: m.total_sales - m.total_cost
            }));

            // Filter by selected product if any
            if (selectedProduct) {
                movementsArray = movementsArray.filter(m => m.product_id === selectedProduct);
            }

            // Sort by date desc
            movementsArray.sort((a, b) => b.movement_date.localeCompare(a.movement_date));

            setMovements(movementsArray);
            calculateStats(movementsArray);
        } catch (err) {
            console.error('Error loading movements:', err);
            toast.error('Failed to load dish movements');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo, selectedProduct, selectedShift, products]);

    // Calculate stats
    const calculateStats = (data: DishMovement[]) => {
        const stats = data.reduce((acc, m) => ({
            totalProduced: acc.totalProduced + m.produced_qty,
            totalSold: acc.totalSold + m.sold_qty,
            totalSpoiled: acc.totalSpoiled + m.spoiled_qty,
            totalProfit: acc.totalProfit + m.total_profit,
            totalLoss: acc.totalLoss + m.total_spoilage_loss
        }), { totalProduced: 0, totalSold: 0, totalSpoiled: 0, totalProfit: 0, totalLoss: 0 });
        setStats(stats);
    };

    useEffect(() => {
        if (products.length > 0) {
            loadMovements();
        }
    }, [loadMovements, products]);

    // Filter movements by search
    const filteredMovements = movements.filter(m =>
        m.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.product_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Handle spoilage
    const handleSpoilage = async () => {
        if (!spoilageProduct || !spoilageQty) {
            toast.error('Please select dish and quantity');
            return;
        }

        setIsSaving(true);
        try {
            const product = products.find(p => p.pid === spoilageProduct);
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;
            const qty = parseFloat(spoilageQty);
            const totalLoss = qty * (product?.sales_cost || 0);

            const { error } = await supabase
                .from('dish_spoilage')
                .insert({
                    spoilage_date: new Date().toISOString().split('T')[0],
                    product_id: spoilageProduct,
                    product_name: product?.product_name || '',
                    quantity: qty,
                    unit_cost: product?.sales_cost || 0,
                    total_loss: totalLoss,
                    reason: spoilageReason,
                    reported_by: currentUser?.name || 'Unknown'
                });

            if (error) throw error;

            toast.success('Spoilage recorded! 📋');
            setShowSpoilageModal(false);
            setSpoilageProduct(null);
            setSpoilageQty('');
            setSpoilageReason('');
            loadMovements();
        } catch (err) {
            console.error('Error recording spoilage:', err);
            toast.error('Failed to record spoilage');
        }
        setIsSaving(false);
    };

    return (
        <div className="max-w-full space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🍽️</span>
                        <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                            Dish Movement
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-1">Track production, sales, and spoilage for dishes</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowSpoilageModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-red-500/30 transition-all"
                    >
                        <span>🗑️</span> Record Spoilage
                    </button>
                    <button
                        onClick={loadMovements}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all"
                    >
                        <span>🔄</span> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">🍳</span>
                        <span className="font-medium opacity-90">Produced</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalProduced.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">💰</span>
                        <span className="font-medium opacity-90">Sold</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalSold.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">📈</span>
                        <span className="font-medium opacity-90">Profit</span>
                    </div>
                    <p className="text-3xl font-bold">Ksh {stats.totalProfit.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">🗑️</span>
                        <span className="font-medium opacity-90">Spoiled</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalSpoiled.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">📉</span>
                        <span className="font-medium opacity-90">Loss Value</span>
                    </div>
                    <p className="text-3xl font-bold">Ksh {stats.totalLoss.toLocaleString()}</p>
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
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 To Date</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">🍽️ Dish</label>
                        <select
                            value={selectedProduct || ''}
                            onChange={(e) => setSelectedProduct(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400"
                        >
                            <option value="">All Dishes</option>
                            {products.map(p => (
                                <option key={p.pid} value={p.pid}>{p.product_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">🔎 Search</label>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search dish..."
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={loadMovements}
                            className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
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
                            <p className="text-gray-500">Loading dish movements...</p>
                        </div>
                    ) : filteredMovements.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-6xl block mb-4">📭</span>
                            <p className="text-gray-500 text-lg">No dish movements found</p>
                            <p className="text-gray-400 text-sm mt-2">Try adjusting your date range or add production batches/sales</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gradient-to-r from-orange-50 to-red-50">
                                <tr>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Date</th>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Dish Name</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-blue-600 uppercase bg-blue-50">Opening</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-indigo-600 uppercase bg-indigo-50">Produced</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-green-600 uppercase bg-green-50">Sold</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-red-600 uppercase bg-red-50">Spoiled</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-cyan-600 uppercase bg-cyan-50">Closing</th>
                                    <th className="text-right py-4 px-4 text-xs font-bold text-emerald-600 uppercase bg-emerald-50">Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMovements.map((m, idx) => (
                                    <tr key={idx} className="border-t border-gray-50 hover:bg-orange-50/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <span className="font-medium text-gray-700">
                                                {new Date(m.movement_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="font-semibold text-gray-800">{m.product_name}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-blue-50/30">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold">{m.opening_qty.toLocaleString()}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-indigo-50/30">
                                            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg font-bold">+{m.produced_qty.toLocaleString()}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-green-50/30">
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg font-bold">-{m.sold_qty.toLocaleString()}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-red-50/30">
                                            <span className={`px-3 py-1 rounded-lg font-bold ${m.spoiled_qty > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                                                -{m.spoiled_qty.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center bg-cyan-50/30">
                                            <span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-lg font-bold text-lg">{m.closing_qty.toLocaleString()}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right bg-emerald-50/30">
                                            <span className={`px-3 py-1 rounded-lg font-bold ${m.total_profit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                Ksh {m.total_profit.toLocaleString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Spoilage Modal */}
            {showSpoilageModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">🗑️</span>
                                Record Spoilage
                            </h2>
                            <button onClick={() => setShowSpoilageModal(false)} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Select Dish</label>
                                <select
                                    value={spoilageProduct || ''}
                                    onChange={(e) => setSpoilageProduct(e.target.value ? parseInt(e.target.value) : null)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-red-400"
                                >
                                    <option value="">-- Select Dish --</option>
                                    {products.map(p => (
                                        <option key={p.pid} value={p.pid}>{p.product_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Quantity Spoiled</label>
                                <input
                                    type="number"
                                    value={spoilageQty}
                                    onChange={(e) => setSpoilageQty(e.target.value)}
                                    placeholder="Enter quantity"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-red-400 text-lg font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 block mb-2">Reason</label>
                                <select
                                    value={spoilageReason}
                                    onChange={(e) => setSpoilageReason(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-red-400"
                                >
                                    <option value="">Select reason...</option>
                                    <option value="Expired">Expired</option>
                                    <option value="Damaged">Damaged</option>
                                    <option value="Burnt">Burnt</option>
                                    <option value="Customer Return">Customer Return</option>
                                    <option value="Quality Issue">Quality Issue</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowSpoilageModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSpoilage}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50"
                            >
                                {isSaving ? '⏳ Saving...' : '✅ Record Spoilage'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
