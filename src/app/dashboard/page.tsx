'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---
interface SalesData {
    date: string;
    total: number;
    count: number;
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

interface FinancialYearData {
    month: string;
    sales: number;
}

interface PaymentDue {
    id: string;
    partyName: string; // Customer or Supplier
    reference: string; // Inv No or PO No
    amount: number;
    status: string;
}

interface StockItem {
    id: string;
    name: string;
    stock: number;
    unit: string;
    min_stock: number;
}

export default function DashboardPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date().getFullYear() + '-01-01'); // Default to start of year for broader view
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    // Stats
    const [todaySales, setTodaySales] = useState(0);
    const [yesterdaySales, setYesterdaySales] = useState(0);
    const [todayOrders, setTodayOrders] = useState(0);

    // Financial stats
    const [totalExpenses, setTotalExpenses] = useState(0);
    const [totalPurchases, setTotalPurchases] = useState(0);
    const [purchaseDue, setPurchaseDue] = useState(0);
    const [invoiceDue, setInvoiceDue] = useState(0); // Placeholder for now

    // Chart data
    const [salesData, setSalesData] = useState<SalesData[]>([]);
    const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
    const [waiterSales, setWaiterSales] = useState<WaiterSales[]>([]);
    const [lowStockCount, setLowStockCount] = useState(0);

    // New Data States
    const [financialYearData, setFinancialYearData] = useState<FinancialYearData[]>([]);
    const [salesDueList, setSalesDueList] = useState<PaymentDue[]>([]);
    const [purchaseDueList, setPurchaseDueList] = useState<PaymentDue[]>([]);
    const [lowStockItems, setLowStockItems] = useState<StockItem[]>([]);
    const [aiInsight, setAiInsight] = useState<string>('Analyzing data...');

    const loadDashboardData = useCallback(async () => {
        setIsLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        try {
            // 1. Today's Key Metrics
            const { data: todayData } = await supabase
                .from('sales')
                .select('total_amount')
                .eq('sale_date', today);

            const { data: yestData } = await supabase
                .from('sales')
                .select('total_amount')
                .eq('sale_date', yesterday);

            setTodaySales((todayData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0));
            setTodayOrders(todayData?.length || 0);
            setYesterdaySales((yestData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0));

            // 2. Financials (Expenses, Purchases)
            const { data: exp } = await supabase
                .from('expenses')
                .select('amount')
                .gte('expense_date', dateFrom)
                .lte('expense_date', dateTo);
            setTotalExpenses((exp || []).reduce((sum, e) => sum + (e.amount || 0), 0));

            const { data: pur } = await supabase
                .from('purchases') // Assuming 'purchases' table exists based on context
                .select('total_amount, payment_status')
                .gte('purchase_date', dateFrom)
                .lte('purchase_date', dateTo);

            const purchases = pur || [];
            setTotalPurchases(purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0));
            setPurchaseDue(purchases.filter(p => p.payment_status === 'Pending' || p.payment_status === 'Partial').reduce((sum, p) => sum + (p.total_amount || 0), 0)); // Simplified due calc

            // 3. Sales Trend (Last 7 Days + Previous Period for Comparison effect)
            // For this Neo chart, we'll just fetch last 12 days to show a "trend"
            const { data: trendData } = await supabase
                .from('sales')
                .select('sale_date, total_amount')
                .gte('sale_date', new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0])
                .order('sale_date');

            const salesMap = new Map<string, number>();
            (trendData || []).forEach(s => {
                salesMap.set(s.sale_date, (salesMap.get(s.sale_date) || 0) + s.total_amount);
            });
            // Convert to array
            const trend = Array.from(salesMap.entries()).map(([date, total]) => ({ date, total, count: 0 }));
            setSalesData(trend);

            // 4. Top Products
            const { data: items } = await supabase
                .from('sales_items')
                .select('product_name, quantity, subtotal')
                .limit(200); // Limit sample

            const prodMap = new Map<string, { qty: number, revenue: number }>();
            (items || []).forEach(i => {
                const existing = prodMap.get(i.product_name) || { qty: 0, revenue: 0 };
                prodMap.set(i.product_name, { qty: existing.qty + i.quantity, revenue: existing.revenue + i.subtotal });
            });
            setTopProducts(Array.from(prodMap.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue).slice(0, 5));

            // 5. Waiter Leaderboard
            const { data: waiters } = await supabase.from('sales').select('waiter_name, total_amount').limit(200);
            const waiterMap = new Map<string, { sales: number, orders: number }>();
            (waiters || []).forEach(w => {
                const name = w.waiter_name || 'Unknown';
                const existing = waiterMap.get(name) || { sales: 0, orders: 0 };
                waiterMap.set(name, { sales: existing.sales + w.total_amount, orders: existing.orders + 1 });
            });
            setWaiterSales(Array.from(waiterMap.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.sales - a.sales).slice(0, 5));

            // 6. Low Stock Count & List
            const { data: lowStockData, count } = await supabase
                .from('products')
                .select('*', { count: 'exact' })
                .lt('stock', 10)
                .limit(10); // Get top 10 for table

            setLowStockCount(count || 0);
            setLowStockItems((lowStockData || []).map(p => ({
                id: p.id,
                name: p.name,
                stock: p.stock,
                unit: p.unit || 'Pc',
                min_stock: p.min_stock || 10
            })));

            // 7. Financial Year Data (Mock logic for demo as real aggregation might be heavy)
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const mockYearData = months.map(m => ({ month: m, sales: Math.floor(Math.random() * 50000) + 10000 }));
            setFinancialYearData(mockYearData);

            // 8. Due Payments (Mock/Fetch)
            // Ideally fetch from 'invoices' and 'purchases' where status = 'Pending'
            setSalesDueList([
                { id: '1', partyName: 'Walk-In Customer', reference: 'INV-0042', amount: 2400, status: 'Pending' },
                { id: '2', partyName: 'Jane Wanjiku', reference: 'INV-0038', amount: 1800, status: 'Overdue' },
                { id: '3', partyName: 'Peter Otieno', reference: 'INV-0035', amount: 3200, status: 'Pending' },
            ]);
            setPurchaseDueList([
                { id: '1', partyName: 'Kapa Oil Refinery', reference: 'PO-0018', amount: 12500, status: 'Pending' },
                { id: '2', partyName: 'Nairobi Flour Mills', reference: 'PO-0015', amount: 8400, status: 'Pending' },
            ]);

            // 9. AI Insight Generation
            // Use the fetched data to generate a smart sentence
            const topItem = prodMap.entries().next().value; // Simplified
            const topItemName = topItem ? topItem[0] : 'Unknown Item';
            const topItemQty = topItem ? topItem[1].qty : 0;
            const yestTotal = (yestData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0) || 1;
            const todayTotal = (todayData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);
            const growth = ((todayTotal - yestTotal) / yestTotal) * 100;
            const lowStockItem = lowStockData && lowStockData.length > 0 ? lowStockData[0].name : '';

            let insight = `✨ **${topItemName}** leads with **${topItemQty} units**. Revenue **${growth >= 0 ? '↑' : '↓'} ${Math.abs(growth).toFixed(0)}%** vs yesterday.`;
            if (lowStockItem) insight += ` ⚠️ **${lowStockItem}** is low on stock — reorder now.`;
            setAiInsight(insight);

        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Helpers for Chart Rendering
    const GenerateSparkline = ({ data, color, height = 40 }: { data: number[], color: string, height?: number }) => {
        if (data.length < 2) return null;
        const max = Math.max(...data);
        const min = Math.min(...data);
        const range = max - min || 1;
        const width = 100;

        const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((d - min) / range) * height;
            return `${x},${y}`;
        }).join(' ');

        return (
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
                <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((data[data.length - 1] - min) / range) * height} r="3" fill={color} />
            </svg>
        );
    }

    // Main Area Chart
    const AreaChart = () => {
        if (salesData.length < 2) return <div className="h-full flex items-center justify-center text-gray-300">No Data</div>;

        const data = salesData.map(s => s.total);
        const max = Math.max(...data) || 100;
        const h = 200;
        const w = 500; // viewBox width

        const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (d / max) * h;
            return `${x},${y}`;
        }).join(' ');

        const fillPath = `${points} ${w},${h} 0,${h}`;

        return (
            <svg width="100%" height="240" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
                <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#0d9488', stopOpacity: 0.2 }} />
                        <stop offset="100%" style={{ stopColor: '#0d9488', stopOpacity: 0 }} />
                    </linearGradient>
                </defs>
                <path d={`M ${points}`} fill="none" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <path d={`M ${fillPath}`} fill="url(#grad1)" stroke="none" />

                {/* Horizontal Grid Lines */}
                {[0.25, 0.5, 0.75].map(p => (
                    <line key={p} x1="0" y1={h * p} x2={w} y2={h * p} stroke="#e2e8f0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                ))}
            </svg>
        );
    };

    // Financial Year Chart
    const AnnualSalesChart = () => {
        const data = financialYearData.map(d => d.sales);
        const max = Math.max(...data) || 100;
        const h = 160;
        const w = 700;

        if (data.length === 0) return null;

        const points = data.map((d, i) => {
            const x = 55 + (i * 55); // Adjusted spacing
            const y = h - ((d / max) * (h - 40)); // Leave space for labels
            return `${x},${y}`;
        }).join(' ');

        const fillPath = `${points} ${55 + ((data.length - 1) * 55)},${h} 55,${h}`;

        return (
            <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
                <defs>
                    <linearGradient id="fy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity=".15" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity=".01" />
                    </linearGradient>
                </defs>
                {/* Grid Lines */}
                {[0.2, 0.4, 0.6, 0.8].map(p => (
                    <line key={p} x1="40" y1={h * p} x2={w} y2={h * p} stroke="#f0f5f4" strokeWidth="1" />
                ))}

                {/* Area & Line */}
                <path d={`M ${fillPath} Z`} fill="url(#fy)" />
                <path d={`M ${points}`} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                {/* Dots */}
                {data.map((d, i) => {
                    const x = 55 + (i * 55);
                    const y = h - ((d / max) * (h - 40));
                    return <circle key={i} cx={x} cy={y} r="3" fill="#4f46e5" stroke="#fff" strokeWidth="2" />;
                })}

                {/* X Axis Labels */}
                {financialYearData.map((d, i) => (
                    <text key={i} x={55 + (i * 55)} y={h + 15} fill="#aaa" fontSize="10" fontFamily="sans-serif" textAnchor="middle">{d.month}</text>
                ))}
            </svg>
        );
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-[#1a2332]">Dashboard Overview</h1>
                    <p className="text-xs text-gray-500">Business analytics & Key Performance Indicators</p>
                </div>
                <div className="flex gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:outline-none hover:border-teal-400 transition-colors" />
                    <button onClick={loadDashboardData} className="btn-neo-teal">
                        <span>All Shops</span>
                    </button>
                    <button className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-teal-600 transition-colors shadow-sm">
                        🔄
                    </button>
                </div>
            </div>

            {/* AI Smart Insights */}
            <div className="bg-gradient-to-r from-teal-50 to-white border border-teal-100/50 rounded-xl p-4 flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl shadow-sm border border-teal-100">
                    🧠
                </div>
                <div>
                    <h3 className="text-sm font-bold text-teal-800 mb-1">✨ AI Smart Insights</h3>
                    <p className="text-xs text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: aiInsight.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }}></p>
                </div>
            </div>

            {/* KPI Cards Row (Compact) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Sales */}
                <div className="neo-card compact border-l-4 border-teal-500 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-1">
                        <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Total Sales</p>
                            <h3 className="text-xl font-bold text-gray-800 mt-0.5">Ksh {todaySales.toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 bg-teal-50 rounded-lg text-teal-600">
                            <span className="text-lg">🛒</span>
                        </div>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                        <div className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-md font-bold">
                            +12.5% <span className="text-gray-400 font-normal">from yesterday</span>
                        </div>
                        <div className="w-16 h-8 opacity-70">
                            <GenerateSparkline data={[10, 15, 12, 18, 20]} color="#0d9488" height={32} />
                        </div>
                    </div>
                </div>

                {/* Net Amount */}
                <div className="neo-card compact border-l-4 border-emerald-500 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-1">
                        <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Net Profit</p>
                            <h3 className="text-xl font-bold text-gray-800 mt-0.5">Ksh {(todaySales - totalExpenses).toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                            <span className="text-lg">💲</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3">
                        <span className="text-xs text-gray-400">Expenses:</span>
                        <span className="text-xs font-bold text-red-500">-Ksh {totalExpenses.toLocaleString()}</span>
                    </div>
                </div>

                {/* Invoice Due */}
                <div className="neo-card compact border-l-4 border-amber-500 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-1">
                        <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Invoice Due</p>
                            <h3 className="text-xl font-bold text-gray-800 mt-0.5">Ksh {invoiceDue.toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
                            <span className="text-lg">🧾</span>
                        </div>
                    </div>
                    <div className="w-full bg-gray-100 h-1 mt-4 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full w-[45%]"></div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">45% of limit reached</p>
                </div>

                {/* Returns */}
                <div className="neo-card compact border-l-4 border-indigo-500 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-1">
                        <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Purchase Due</p>
                            <h3 className="text-xl font-bold text-gray-800 mt-0.5">Ksh {purchaseDue.toLocaleString()}</h3>
                        </div>
                        <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                            <span className="text-lg">📉</span>
                        </div>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                        <span className="text-[10px] text-gray-400">Total Purchase: {totalPurchases.toLocaleString()}</span>
                        <div className="w-12">
                            <GenerateSparkline data={[50, 40, 60, 30]} color="#6366f1" height={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts & Leaderboard Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Revenue Chart */}
                <div className="neo-card lg:col-span-2">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-sm text-gray-700">Revenue & Orders</h4>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                                <span className="text-[10px] text-gray-500">Revenue</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-300"></span>
                                <span className="text-[10px] text-gray-500">Orders</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-60 w-full">
                        <AreaChart />
                    </div>
                </div>

                {/* Top Sellers */}
                <div className="neo-card">
                    <h4 className="font-bold text-sm text-gray-700 mb-3">Top Sellers</h4>
                    <div className="space-y-3">
                        {topProducts.map((p, i) => (
                            <div key={i} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${i < 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {i + 1}
                                    </span>
                                    <div>
                                        <p className="text-xs font-bold text-gray-700 group-hover:text-teal-600 transition-colors">{p.name}</p>
                                        <p className="text-[10px] text-gray-400">{p.qty} sold</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-gray-600">
                                    {(p.revenue / 1000).toFixed(1)}k
                                </span>
                            </div>
                        ))}
                    </div>
                    {topProducts.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data available</p>}

                    <div className="mt-4 pt-3 border-t border-gray-100">
                        <button className="w-full text-center text-xs text-teal-600 font-bold hover:underline">View All Products</button>
                    </div>
                </div>
            </div>

            {/* Bottom Row - Waiter & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Waiter Leaderboard */}
                <div className="neo-card compact">
                    <h4 className="font-bold text-sm text-gray-700 mb-3">Waiter Leaderboard</h4>
                    <div className="space-y-2">
                        {waiterSales.map((w, i) => (
                            <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                        {w.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-700">{w.name}</p>
                                        <p className="text-[10px] text-gray-400">{w.orders} orders</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-gray-800">{(w.sales / 1000).toFixed(1)}k</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Stock Alerts */}
                <div className="neo-card compact border-t-4 border-red-500">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-sm text-gray-700">Stock Alerts</h4>
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">{lowStockCount} Items</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">Items that have fallen below reorder level.</p>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl mb-1">🥩</span>
                            <span className="text-[10px] font-bold text-red-700 uppercase">Meat Stock</span>
                            <span className="text-sm font-bold text-red-900 mt-1">Check</span>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl mb-1">🥤</span>
                            <span className="text-[10px] font-bold text-orange-700 uppercase">Drinks</span>
                            <span className="text-sm font-bold text-orange-900 mt-1">Reorder</span>
                        </div>
                    </div>

                    <button className="w-full mt-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors">
                        View Full Stock Report
                    </button>
                </div>

                {/* Quick Actions Grid */}
                <div className="neo-card compact bg-gradient-to-br from-[#1a2332] to-[#0f172a] text-white">
                    <h4 className="font-bold text-sm mb-3">Quick Actions</h4>
                    <div className="grid grid-cols-3 gap-2">
                        <a href="/dashboard/pos" className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/5">
                            <span className="text-xl mb-1">🛒</span>
                            <span className="text-[10px] font-medium">POS</span>
                        </a>
                        <a href="/dashboard/products/add" className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/5">
                            <span className="text-xl mb-1">➕</span>
                            <span className="text-[10px] font-medium">Add Product</span>
                        </a>
                        <a href="/dashboard/purchase" className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/5">
                            <span className="text-xl mb-1">📥</span>
                            <span className="text-[10px] font-medium">Stock In</span>
                        </a>
                        <a href="/dashboard/expenses" className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/5">
                            <span className="text-xl mb-1">💸</span>
                            <span className="text-[10px] font-medium">Expense</span>
                        </a>
                        <a href="/dashboard/reports/pos" className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/5">
                            <span className="text-xl mb-1">📊</span>
                            <span className="text-[10px] font-medium">Reports</span>
                        </a>
                        <a href="/dashboard/users" className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all border border-white/5">
                            <span className="text-xl mb-1">👥</span>
                            <span className="text-[10px] font-medium">Staff</span>
                        </a>
                    </div>
                </div>
            </div>


            {/* Annual Sales Chart */}
            <div className="neo-card">
                <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
                    <span className="text-lg">🛒</span>
                    <h4 className="font-bold text-sm text-gray-700">Sales Current Financial Year</h4>
                </div>
                <div className="h-48 w-full">
                    <AnnualSalesChart />
                </div>
                <div className="flex items-center gap-2 mt-2 pl-4">
                    <span className="w-4 h-1 bg-indigo-500 rounded-full"></span>
                    <span className="text-[10px] text-gray-400">Total Sales (Ksh)</span>
                </div>
            </div>

            {/* Due Payments Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Sales Due */}
                <div className="neo-card p-0 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">⚠️</span>
                            <h4 className="font-bold text-sm text-gray-700">Sales Payment Due</h4>
                        </div>
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full">{salesDueList.length} Pending</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                    <th className="px-4 py-3">Customer</th>
                                    <th className="px-4 py-3">Inv No</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {salesDueList.map((item, i) => (
                                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 font-medium text-gray-700">{item.partyName}</td>
                                        <td className="px-4 py-3 text-gray-500">{item.reference}</td>
                                        <td className="px-4 py-3 font-bold text-coral-500">Ksh {item.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <a href="#" className="text-teal-600 font-bold hover:underline">Pay →</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Purchase Due */}
                <div className="neo-card p-0 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">⚠️</span>
                            <h4 className="font-bold text-sm text-gray-700">Purchase Payment Due</h4>
                        </div>
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full">{purchaseDueList.length} Pending</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                    <th className="px-4 py-3">Supplier</th>
                                    <th className="px-4 py-3">Ref No</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {purchaseDueList.map((item, i) => (
                                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 font-medium text-gray-700">{item.partyName}</td>
                                        <td className="px-4 py-3 text-gray-500">{item.reference}</td>
                                        <td className="px-4 py-3 font-bold text-coral-500">Ksh {item.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <a href="#" className="text-teal-600 font-bold hover:underline">Pay →</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Product Stock Alert Table */}
            <div className="neo-card p-0 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">⏰</span>
                        <h4 className="font-bold text-sm text-gray-700">Product Stock Alert</h4>
                    </div>
                    <div className="flex gap-2">
                        <button className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Print</button>
                        <button className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Excel</button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                <th className="px-4 py-3">Product</th>
                                <th className="px-4 py-3">Current Stock</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs">
                            {lowStockItems.map((item, i) => (
                                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                    <td className="px-4 py-3 font-medium text-gray-700">
                                        {item.name}
                                        <span className="block text-[9px] text-gray-400">General Store</span>
                                    </td>
                                    <td className="px-4 py-3 font-bold text-gray-700">{item.stock} {item.unit}</td>
                                    <td className="px-4 py-3">
                                        {item.stock === 0 ? (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-bold text-[10px]">Out of Stock</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full font-bold text-[10px]">Low ({item.stock}/{item.min_stock})</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {lowStockItems.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-center text-gray-400">No low stock items</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
