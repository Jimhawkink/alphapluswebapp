'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface ButcheryDashboard {
    todaySales: number;
    todayWeightSold: number;
    todayTransactions: number;
    availableStock: number;
    lowStock: number;
    profitToday: number;
}

interface RecentSale {
    sale_id: number;
    sale_code: string;
    meat_type: string;
    weight_kg: number;
    net_amount: number;
    payment_mode: string;
    sale_date: string;
}

export default function ButcheryDashboardPage() {
    const [dashboard, setDashboard] = useState<ButcheryDashboard>({
        todaySales: 0,
        todayWeightSold: 0,
        todayTransactions: 0,
        availableStock: 0,
        lowStock: 0,
        profitToday: 0
    });
    const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // Load today's sales from meat_sales
            const { data: salesData, error: salesError } = await supabase
                .from('meat_sales')
                .select('*')
                .gte('sale_date', today)
                .order('sale_date', { ascending: false });

            if (salesError) {
                console.error('Sales error:', salesError);
            }

            const todaySalesArray = salesData || [];
            const todaySales = todaySalesArray.reduce((sum, s) => sum + (s.net_amount || 0), 0);
            const todayWeight = todaySalesArray.reduce((sum, s) => sum + (s.weight_kg || 0), 0);

            // Load available stock from meat_stock table
            const { data: batchData, error: batchError } = await supabase
                .from('meat_stock')
                .select('available_kg, cost_per_kg, selling_price')
                .gt('available_kg', 0);

            if (batchError) {
                console.error('Batch error:', batchError);
            }

            const totalStock = (batchData || []).reduce((sum, s) => sum + (s.available_kg || 0), 0);

            // Low stock count (batches with < 5kg remaining)
            const { data: lowStockData, error: lowError } = await supabase
                .from('meat_stock')
                .select('stock_id')
                .lte('available_kg', 5)
                .gt('available_kg', 0);

            if (lowError) {
                console.error('Low stock error:', lowError);
            }

            setDashboard({
                todaySales,
                todayWeightSold: todayWeight,
                todayTransactions: todaySalesArray.length,
                availableStock: totalStock,
                lowStock: (lowStockData || []).length,
                profitToday: todaySalesArray.reduce((sum, s) => sum + ((s.net_amount || 0) - ((s.weight_kg || 0) * (s.cost_per_kg || 0))), 0)
            });

            setRecentSales(todaySalesArray.slice(0, 5).map(s => ({
                sale_id: s.sale_id,
                sale_code: s.sale_code || `SALE-${s.sale_id}`,
                meat_type: s.meat_type_name || 'Meat',
                weight_kg: s.weight_kg || 0,
                net_amount: s.net_amount || 0,
                payment_mode: s.payment_mode || 'Cash',
                sale_date: s.sale_date
            })));

        } catch (err) {
            console.error('Error loading dashboard:', err);
            toast.error('Failed to load dashboard');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    const formatTime = (date: Date) => {
        return date.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const quickActions = [
        { href: '/dashboard/butchery/pos', emoji: '🛒', title: 'New Sale', subtitle: 'Process meat sale', gradient: 'from-green-500 to-emerald-600' },
        { href: '/dashboard/butchery/batches', emoji: '📦', title: 'Batches', subtitle: 'Manage inventory', gradient: 'from-cyan-500 to-blue-600' },
        { href: '/dashboard/butchery/meat-types', emoji: '🥩', title: 'Meat Types', subtitle: 'Beef, Goat, Chicken...', gradient: 'from-red-500 to-rose-600' },
        { href: '/dashboard/butchery/weight-loss', emoji: '⚖️', title: 'Weight Loss', subtitle: 'Bone, Drying loss', gradient: 'from-orange-500 to-amber-600' },
    ];

    const reportActions = [
        { href: '/dashboard/butchery/sales-report', emoji: '📋', title: 'Sales Report', gradient: 'from-purple-500 to-violet-600' },
    ];

    return (
        <div className="space-y-6 min-h-screen">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-3xl p-6 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ← Back
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                🥩 Butchery Management
                            </h1>
                            <p className="text-white/80 text-sm">Complete Meat Sales System</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-white/80 text-sm">🕐 {formatTime(currentTime)}</p>
                    </div>
                </div>
            </div>

            {/* Dashboard Stats - Row 1 */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">💰</span>
                        <span className="text-sm opacity-90">Today&apos;s Sales</span>
                    </div>
                    <p className="text-2xl font-bold">KES {dashboard.todaySales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">⚖️</span>
                        <span className="text-sm opacity-90">Weight Sold</span>
                    </div>
                    <p className="text-2xl font-bold">{dashboard.todayWeightSold.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🧾</span>
                        <span className="text-sm opacity-90">Transactions</span>
                    </div>
                    <p className="text-2xl font-bold">{dashboard.todayTransactions}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">📦</span>
                        <span className="text-sm opacity-90">Stock Available</span>
                    </div>
                    <p className="text-2xl font-bold">{dashboard.availableStock.toFixed(1)} Kg</p>
                </div>
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    🎯 Quick Actions
                </h2>
                <div className="grid grid-cols-4 gap-4">
                    {quickActions.map((action, idx) => (
                        <Link
                            key={idx}
                            href={action.href}
                            className={`bg-gradient-to-br ${action.gradient} rounded-2xl p-5 text-white shadow-lg hover:scale-105 hover:shadow-xl transition-all`}
                        >
                            <span className="text-4xl mb-3 block">{action.emoji}</span>
                            <p className="font-bold text-lg">{action.title}</p>
                            <p className="text-sm opacity-80">{action.subtitle}</p>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Reports Section */}
            <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    📊 Reports & Analytics
                </h2>
                <div className="grid grid-cols-3 gap-4">
                    {reportActions.map((action, idx) => (
                        <Link
                            key={idx}
                            href={action.href}
                            className={`bg-gradient-to-br ${action.gradient} rounded-2xl p-4 text-white shadow-lg hover:scale-105 hover:shadow-xl transition-all text-center`}
                        >
                            <span className="text-3xl mb-2 block">{action.emoji}</span>
                            <p className="font-semibold">{action.title}</p>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Recent Sales */}
            <div className="bg-white rounded-2xl border shadow-lg overflow-hidden">
                <div className="p-4 border-b bg-gradient-to-r from-red-50 to-rose-50">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            📋 Recent Sales Today
                        </h2>
                        <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm font-semibold">
                            {recentSales.length} transactions
                        </span>
                    </div>
                </div>
                <div className="divide-y">
                    {isLoading ? (
                        <div className="p-8 text-center">
                            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500">Loading...</p>
                        </div>
                    ) : recentSales.length === 0 ? (
                        <div className="p-8 text-center">
                            <span className="text-5xl mb-2 block">🥩</span>
                            <p className="text-gray-500">No sales yet today</p>
                            <Link href="/dashboard/butchery/pos" className="mt-3 inline-block px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">
                                Make First Sale
                            </Link>
                        </div>
                    ) : (
                        recentSales.map(sale => (
                            <div key={sale.sale_id} className="p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-gray-800">{sale.sale_code}</p>
                                        <p className="text-sm text-gray-500">{sale.meat_type} • {sale.weight_kg.toFixed(2)} Kg</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-green-600">KES {sale.net_amount.toLocaleString()}</p>
                                        <span className="text-xs px-2 py-1 bg-cyan-100 text-cyan-600 rounded-full">{sale.payment_mode}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
