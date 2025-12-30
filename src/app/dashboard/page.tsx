'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface SalesData {
    date: string;
    total: number;
    count: number;
}

interface CategorySales {
    category: string;
    total: number;
    percentage: number;
}

interface TopProduct {
    name: string;
    qty: number;
    revenue: number;
}

interface PaymentModeData {
    mode: string;
    total: number;
    count: number;
}

interface WaiterSales {
    name: string;
    sales: number;
    orders: number;
}

interface HourlyData {
    hour: number;
    sales: number;
    orders: number;
}

export default function DashboardPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    // Stats
    const [todaySales, setTodaySales] = useState(0);
    const [yesterdaySales, setYesterdaySales] = useState(0);
    const [todayOrders, setTodayOrders] = useState(0);
    const [yesterdayOrders, setYesterdayOrders] = useState(0);
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [pendingBills, setPendingBills] = useState(0);

    // NEW: Financial stats
    const [totalExpenses, setTotalExpenses] = useState(0);
    const [totalAdvances, setTotalAdvances] = useState(0);
    const [totalVouchers, setTotalVouchers] = useState(0);
    const [activeShifts, setActiveShifts] = useState(0);
    const [closedShifts, setClosedShifts] = useState(0);

    // Chart data
    const [salesData, setSalesData] = useState<SalesData[]>([]);
    const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
    const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
    const [paymentModes, setPaymentModes] = useState<PaymentModeData[]>([]);
    const [waiterSales, setWaiterSales] = useState<WaiterSales[]>([]);
    const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);

    // Low stock alerts
    const [lowStockDishes, setLowStockDishes] = useState<Array<{ name: string; stock: number }>>([]);
    const [lowStockIngredients, setLowStockIngredients] = useState<Array<{ name: string; stock: number; reorder: number }>>([]);

    // M-Pesa comparison
    const [mpesaToday, setMpesaToday] = useState(0);
    const [mpesaYesterday, setMpesaYesterday] = useState(0);

    const loadDashboardData = useCallback(async () => {
        setIsLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        try {
            // Today's sales - FIXED: use total_amount instead of grand_total
            const { data: todayData } = await supabase
                .from('sales')
                .select('total_amount, payment_method')
                .eq('sale_date', today);

            const todayTotal = (todayData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);
            setTodaySales(todayTotal);
            setTodayOrders(todayData?.length || 0);
            setMpesaToday((todayData || []).filter(s => (s.payment_method || '').toLowerCase().includes('mpesa')).reduce((sum, s) => sum + (s.total_amount || 0), 0));

            // Yesterday's sales
            const { data: yesterdayData } = await supabase
                .from('sales')
                .select('total_amount, payment_method')
                .eq('sale_date', yesterday);

            const yestTotal = (yesterdayData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);
            setYesterdaySales(yestTotal);
            setYesterdayOrders(yesterdayData?.length || 0);
            setMpesaYesterday((yesterdayData || []).filter(s => (s.payment_method || '').toLowerCase().includes('mpesa')).reduce((sum, s) => sum + (s.total_amount || 0), 0));

            // Pending bills - from sales table with status Pending
            const { data: pendingData } = await supabase
                .from('sales')
                .select('sale_id')
                .eq('status', 'Pending');
            setPendingBills(pendingData?.length || 0);

            // Sales for last 7 days
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            const { data: weekSales } = await supabase
                .from('sales')
                .select('sale_date, total_amount')
                .gte('sale_date', sevenDaysAgo)
                .order('sale_date');

            // Aggregate by date
            const salesByDate = new Map<string, { total: number; count: number }>();
            (weekSales || []).forEach(s => {
                const date = s.sale_date;
                if (!salesByDate.has(date)) {
                    salesByDate.set(date, { total: 0, count: 0 });
                }
                const entry = salesByDate.get(date)!;
                entry.total += s.total_amount || 0;
                entry.count += 1;
            });
            setSalesData(Array.from(salesByDate.entries()).map(([date, data]) => ({ date, ...data })));

            // Top selling products
            const { data: salesItems } = await supabase
                .from('sales_items')
                .select('product_name, quantity, subtotal')
                .order('created_at', { ascending: false })
                .limit(500);

            const productMap = new Map<string, { qty: number; revenue: number }>();
            (salesItems || []).forEach(item => {
                const name = item.product_name;
                if (!productMap.has(name)) {
                    productMap.set(name, { qty: 0, revenue: 0 });
                }
                const entry = productMap.get(name)!;
                entry.qty += item.quantity || 0;
                entry.revenue += item.subtotal || 0;
            });
            const topProds = Array.from(productMap.entries())
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 10);
            setTopProducts(topProds);

            // Payment modes
            const { data: allSales } = await supabase
                .from('sales')
                .select('payment_method, total_amount')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo);

            const modeMap = new Map<string, { total: number; count: number }>();
            (allSales || []).forEach(s => {
                const mode = s.payment_method || 'CASH';
                if (!modeMap.has(mode)) {
                    modeMap.set(mode, { total: 0, count: 0 });
                }
                const entry = modeMap.get(mode)!;
                entry.total += s.total_amount || 0;
                entry.count += 1;
            });
            setPaymentModes(Array.from(modeMap.entries()).map(([mode, data]) => ({ mode, ...data })));

            // Low stock dishes
            const { data: lowDishes } = await supabase
                .from('products')
                .select('product_name, stock')
                .lt('stock', 10)
                .eq('active', true)
                .order('stock')
                .limit(10);
            setLowStockDishes((lowDishes || []).map(d => ({ name: d.product_name, stock: d.stock || 0 })));

            // Low stock ingredients
            const { data: lowIngredients } = await supabase
                .from('products_ingredients')
                .select('product_name, current_stock, reorder_point')
                .eq('active', true)
                .order('current_stock')
                .limit(10);
            setLowStockIngredients((lowIngredients || [])
                .filter(i => (i.current_stock || 0) <= (i.reorder_point || 10))
                .map(i => ({ name: i.product_name, stock: i.current_stock || 0, reorder: i.reorder_point || 10 })));

            // Waiter sales
            const { data: waiterData } = await supabase
                .from('sales')
                .select('waiter_name, total_amount, created_by')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo);

            const waiterMap = new Map<string, { sales: number; orders: number }>();
            (waiterData || []).forEach(s => {
                const name = s.waiter_name || s.created_by || 'Unknown';
                if (!waiterMap.has(name)) {
                    waiterMap.set(name, { sales: 0, orders: 0 });
                }
                const entry = waiterMap.get(name)!;
                entry.sales += s.total_amount || 0;
                entry.orders += 1;
            });
            setWaiterSales(Array.from(waiterMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.sales - a.sales));

            // Load Expenses - STRICTLY filter by date range
            const { data: expensesData } = await supabase
                .from('expenses')
                .select('amount, created_at')
                .gte('expense_date', dateFrom)
                .lte('expense_date', dateTo);
            setTotalExpenses((expensesData || []).reduce((sum, e) => sum + (e.amount || 0), 0));

            // Load Salary Advances - STRICTLY filter by date range
            const { data: advancesData } = await supabase
                .from('salary_advances')
                .select('amount, created_at')
                .eq('status', 'Approved')
                .gte('created_at', `${dateFrom}T00:00:00`)
                .lte('created_at', `${dateTo}T23:59:59`);
            setTotalAdvances((advancesData || []).reduce((sum, a) => sum + (a.amount || 0), 0));

            // Load Vouchers - STRICTLY filter by date range
            const { data: vouchersData } = await supabase
                .from('vouchers')
                .select('amount, created_at')
                .gte('created_at', `${dateFrom}T00:00:00`)
                .lte('created_at', `${dateTo}T23:59:59`);
            setTotalVouchers((vouchersData || []).reduce((sum, v) => sum + (v.amount || 0), 0));

            // Load Shifts - filter by date range
            const { data: shiftsData } = await supabase
                .from('shifts')
                .select('shift_id, status, shift_date')
                .gte('shift_date', dateFrom)
                .lte('shift_date', dateTo);
            setActiveShifts((shiftsData || []).filter(s => s.status === 'Open').length);
            setClosedShifts((shiftsData || []).filter(s => s.status === 'Closed').length);

        } catch (err) {
            console.error('Error loading dashboard:', err);
        }
        setIsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    const salesChange = yesterdaySales > 0 ? ((todaySales - yesterdaySales) / yesterdaySales * 100).toFixed(1) : '0';
    const ordersChange = yesterdayOrders > 0 ? ((todayOrders - yesterdayOrders) / yesterdayOrders * 100).toFixed(1) : '0';
    const mpesaChange = mpesaYesterday > 0 ? ((mpesaToday - mpesaYesterday) / mpesaYesterday * 100).toFixed(1) : '0';

    // Chart calculations
    const maxSales = Math.max(...salesData.map(d => d.total), 1);
    const maxProduct = Math.max(...topProducts.map(p => p.qty), 1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📊</span>
                        Intelligent Dashboard
                    </h1>
                    <p className="text-gray-500 mt-1">Real-time business intelligence & analytics</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 border border-gray-200">
                        <span className="text-sm text-gray-500">From:</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="border-none bg-transparent focus:outline-none text-gray-800 font-medium"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 border border-gray-200">
                        <span className="text-sm text-gray-500">To:</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="border-none bg-transparent focus:outline-none text-gray-800 font-medium"
                        />
                    </div>
                    <button
                        onClick={loadDashboardData}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Alerts Notification Bar */}
            {(lowStockDishes.length > 0 || lowStockIngredients.length > 0 || pendingBills > 0) && (
                <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl p-4 text-white shadow-lg flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="text-3xl animate-pulse">⚠️</span>
                        <div>
                            <p className="font-bold">Attention Required!</p>
                            <p className="text-sm opacity-90">
                                {lowStockDishes.length > 0 && `${lowStockDishes.length} dishes low on stock • `}
                                {lowStockIngredients.length > 0 && `${lowStockIngredients.length} ingredients need reorder • `}
                                {pendingBills > 0 && `${pendingBills} pending bills`}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <a href="/dashboard/low-stock" className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-all">View Low Stock</a>
                        <a href="/dashboard/bills" className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-all">View Bills</a>
                    </div>
                </div>
            )}

            {/* Main Stats Cards */}
            <div className="grid grid-cols-6 gap-4">
                {/* Today's Sales */}
                <div className="col-span-2 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-4xl">💰</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${Number(salesChange) >= 0 ? 'bg-white/30' : 'bg-red-500/50'}`}>
                            {Number(salesChange) >= 0 ? '↑' : '↓'} {Math.abs(Number(salesChange))}%
                        </span>
                    </div>
                    <p className="text-sm opacity-80 font-medium">Today's Sales</p>
                    <p className="text-4xl font-bold mt-1">Ksh {todaySales.toLocaleString()}</p>
                    <p className="text-xs opacity-70 mt-2">Yesterday: Ksh {yesterdaySales.toLocaleString()}</p>
                </div>

                {/* Orders */}
                <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
                    <span className="text-3xl">🧾</span>
                    <p className="text-xs opacity-80 mt-2">Orders Today</p>
                    <p className="text-3xl font-bold mt-1">{todayOrders}</p>
                    <span className={`text-xs ${Number(ordersChange) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {Number(ordersChange) >= 0 ? '↑' : '↓'} {Math.abs(Number(ordersChange))}%
                    </span>
                </div>

                {/* M-Pesa */}
                <div className="bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute -top-4 -left-4 w-20 h-20 bg-white/10 rounded-full"></div>
                    <span className="text-3xl">📱</span>
                    <p className="text-xs opacity-80 mt-2">M-Pesa Today</p>
                    <p className="text-2xl font-bold mt-1">Ksh {mpesaToday.toLocaleString()}</p>
                    <span className={`text-xs ${Number(mpesaChange) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {Number(mpesaChange) >= 0 ? '↑' : '↓'} {Math.abs(Number(mpesaChange))}%
                    </span>
                </div>

                {/* Pending Bills */}
                <div className="bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-3xl p-6 text-white shadow-xl">
                    <span className="text-3xl">⏳</span>
                    <p className="text-xs opacity-80 mt-2">Pending Bills</p>
                    <p className="text-3xl font-bold mt-1">{pendingBills}</p>
                    <a href="/dashboard/bills" className="text-xs underline opacity-80 hover:opacity-100">View all →</a>
                </div>

                {/* Low Stock */}
                <div className="bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 rounded-3xl p-6 text-white shadow-xl">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-xs opacity-80 mt-2">Low Stock Items</p>
                    <p className="text-3xl font-bold mt-1">{lowStockDishes.length + lowStockIngredients.length}</p>
                    <a href="/dashboard/low-stock" className="text-xs underline opacity-80 hover:opacity-100">Check now →</a>
                </div>
            </div>

            {/* Financial Stats Row */}
            <div className="grid grid-cols-6 gap-4">
                {/* Expenses */}
                <div className="bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 rounded-3xl p-5 text-white shadow-xl">
                    <span className="text-3xl">💸</span>
                    <p className="text-xs opacity-80 mt-2">Total Expenses</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalExpenses.toLocaleString()}</p>
                    <a href="/dashboard/expenses" className="text-xs underline opacity-80 hover:opacity-100">View →</a>
                </div>

                {/* Salary Advances */}
                <div className="bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 rounded-3xl p-5 text-white shadow-xl">
                    <span className="text-3xl">💵</span>
                    <p className="text-xs opacity-80 mt-2">Salary Advances</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalAdvances.toLocaleString()}</p>
                    <a href="/dashboard/advances" className="text-xs underline opacity-80 hover:opacity-100">View →</a>
                </div>

                {/* Vouchers */}
                <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 rounded-3xl p-5 text-white shadow-xl">
                    <span className="text-3xl">🎟️</span>
                    <p className="text-xs opacity-80 mt-2">Total Vouchers</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalVouchers.toLocaleString()}</p>
                    <a href="/dashboard/vouchers" className="text-xs underline opacity-80 hover:opacity-100">View →</a>
                </div>

                {/* Net Sales */}
                <div className="col-span-2 bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-600 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <span className="text-3xl">📊</span>
                    <p className="text-xs opacity-80 mt-2">Net Sales (After Deductions)</p>
                    <p className="text-3xl font-bold mt-1">Ksh {(todaySales - totalExpenses - totalVouchers).toLocaleString()}</p>
                    <p className="text-xs opacity-70 mt-1">Sales - Expenses - Vouchers</p>
                </div>

                {/* Shifts */}
                <div className="bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 rounded-3xl p-5 text-white shadow-xl">
                    <span className="text-3xl">⏰</span>
                    <p className="text-xs opacity-80 mt-2">Shifts</p>
                    <div className="flex items-center gap-3 mt-2">
                        <div>
                            <p className="text-lg font-bold">{activeShifts}</p>
                            <p className="text-xs opacity-70">Active</p>
                        </div>
                        <div className="h-8 w-px bg-white/30"></div>
                        <div>
                            <p className="text-lg font-bold">{closedShifts}</p>
                            <p className="text-xs opacity-70">Closed</p>
                        </div>
                    </div>
                    <a href="/dashboard/shifts" className="text-xs underline opacity-80 hover:opacity-100">Manage →</a>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-6">
                {/* Sales Trend Chart */}
                <div className="col-span-2 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">📈</span>
                            Sales Trend (Last 7 Days)
                        </h3>
                    </div>
                    <div className="h-64 flex items-end gap-2">
                        {salesData.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                <div className="w-full relative group">
                                    <div
                                        className="w-full bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t-lg transition-all hover:from-blue-600 hover:to-cyan-500"
                                        style={{ height: `${(d.total / maxSales) * 200}px`, minHeight: '20px' }}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            Ksh {d.total.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500">{new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                            </div>
                        ))}
                        {salesData.length === 0 && (
                            <div className="flex-1 flex items-center justify-center text-gray-400">
                                <p>No sales data available</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Payment Modes Pie */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
                        <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">💳</span>
                        Payment Methods
                    </h3>
                    <div className="space-y-3">
                        {paymentModes.map((mode, i) => {
                            const total = paymentModes.reduce((sum, m) => sum + m.total, 0);
                            const percent = total > 0 ? (mode.total / total * 100).toFixed(1) : 0;
                            const colors = ['from-green-500 to-emerald-600', 'from-blue-500 to-indigo-600', 'from-purple-500 to-pink-600', 'from-orange-500 to-red-600'];
                            return (
                                <div key={i} className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${colors[i % colors.length]}`}></div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium text-gray-700">{mode.mode}</span>
                                            <span className="text-gray-500">{percent}%</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                            <div className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full`} style={{ width: `${percent}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">Ksh {mode.total.toLocaleString()} ({mode.count} orders)</p>
                                    </div>
                                </div>
                            );
                        })}
                        {paymentModes.length === 0 && <p className="text-center text-gray-400">No payment data</p>}
                    </div>
                </div>
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-3 gap-6">
                {/* Top Selling Products */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <span className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">🔥</span>
                        Top Selling Items
                    </h3>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {topProducts.map((prod, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                                    {i + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="font-medium text-gray-800 text-sm">{prod.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full"
                                                style={{ width: `${(prod.qty / maxProduct) * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-xs text-gray-500 w-12">{prod.qty} sold</span>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-green-600">Ksh {prod.revenue.toLocaleString()}</span>
                            </div>
                        ))}
                        {topProducts.length === 0 && <p className="text-center text-gray-400">No sales data</p>}
                    </div>
                </div>

                {/* Waiter Performance */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <span className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">👨‍🍳</span>
                        Waiter Performance
                    </h3>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {waiterSales.map((waiter, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-indigo-50 rounded-xl">
                                <span className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${i === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                                    i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                                        i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
                                            'bg-gradient-to-br from-indigo-400 to-purple-500'
                                    }`}>
                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-800">{waiter.name}</p>
                                    <p className="text-xs text-gray-500">{waiter.orders} orders</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-indigo-600">Ksh {waiter.sales.toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                        {waiterSales.length === 0 && <p className="text-center text-gray-400">No waiter data</p>}
                    </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <span className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">⚠️</span>
                        Low Stock Alerts
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {lowStockDishes.length > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">🍽️ Dishes</p>
                                {lowStockDishes.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-red-50 rounded-lg mb-1">
                                        <span className="text-sm text-gray-800">{d.name}</span>
                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">{d.stock} left</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {lowStockIngredients.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">🥬 Ingredients</p>
                                {lowStockIngredients.map((ing, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg mb-1">
                                        <span className="text-sm text-gray-800">{ing.name}</span>
                                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                                            {ing.stock} / {ing.reorder}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {lowStockDishes.length === 0 && lowStockIngredients.length === 0 && (
                            <div className="text-center py-8">
                                <span className="text-4xl">✅</span>
                                <p className="text-gray-500 mt-2">All stock levels are good!</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-3xl p-6 text-white">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <span>⚡</span> Quick Actions
                </h3>
                <div className="grid grid-cols-8 gap-3">
                    {[
                        { icon: '🛒', label: 'POS', href: '/dashboard/pos' },
                        { icon: '📋', label: 'Reports', href: '/dashboard/reports/pos' },
                        { icon: '📥', label: 'Purchase', href: '/dashboard/purchase' },
                        { icon: '🍳', label: 'Recipe', href: '/dashboard/recipe' },
                        { icon: '📦', label: 'Batches', href: '/dashboard/batches' },
                        { icon: '💸', label: 'Expenses', href: '/dashboard/expenses' },
                        { icon: '👥', label: 'Payroll', href: '/dashboard/payroll' },
                        { icon: '⏰', label: 'Shifts', href: '/dashboard/shifts' },
                    ].map((action) => (
                        <a
                            key={action.label}
                            href={action.href}
                            className="flex flex-col items-center gap-2 p-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all hover:scale-105"
                        >
                            <span className="text-3xl">{action.icon}</span>
                            <span className="text-xs font-medium">{action.label}</span>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}
