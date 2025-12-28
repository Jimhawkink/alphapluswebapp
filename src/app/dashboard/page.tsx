'use client';

import { useState, useEffect } from 'react';

// Stat Card Component
const StatCard = ({
    icon,
    title,
    value,
    subtitle,
    color = 'blue',
    trend = null
}: {
    icon: string;
    title: string;
    value: string;
    subtitle: string;
    color?: string;
    trend?: { value: string; isUp: boolean } | null;
}) => {
    const colorClasses: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
        orange: 'bg-orange-50 text-orange-600',
        pink: 'bg-pink-50 text-pink-600',
        cyan: 'bg-cyan-50 text-cyan-600',
        yellow: 'bg-yellow-50 text-yellow-600',
        red: 'bg-red-50 text-red-600',
    };

    return (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
                    <span className="text-xl">{icon}</span>
                </div>
                <span className={`text-sm font-medium ${colorClasses[color].split(' ')[1]}`}>{title}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800 mb-1">{value}</p>
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{subtitle}</span>
                {trend && (
                    <span className={`text-xs px-2 py-1 rounded-full ${trend.isUp ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {trend.isUp ? '↑' : '↓'} {trend.value}
                    </span>
                )}
            </div>
        </div>
    );
};

// Revenue Card Component
const RevenueCard = ({ todayRevenue, mpesaTotal, cashTotal, transactions }: {
    todayRevenue: number;
    mpesaTotal: number;
    cashTotal: number;
    transactions: number;
}) => (
    <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between">
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">💰</span>
                    <span className="font-medium opacity-90">Today's Revenue</span>
                </div>
                <p className="text-4xl font-bold mb-2">Ksh {todayRevenue.toLocaleString()}</p>
                <p className="text-sm opacity-80">{transactions} transactions completed</p>
            </div>
            <div className="flex gap-3">
                <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <span>📱</span>
                        <span className="text-xs opacity-80">M-Pesa</span>
                    </div>
                    <p className="text-xl font-bold">Ksh {mpesaTotal.toLocaleString()}</p>
                    <p className="text-xs opacity-70">{Math.round((mpesaTotal / todayRevenue) * 100)}% of total</p>
                </div>
                <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <span>💵</span>
                        <span className="text-xs opacity-80">Cash</span>
                    </div>
                    <p className="text-xl font-bold">Ksh {cashTotal.toLocaleString()}</p>
                    <p className="text-xs opacity-70">{Math.round((cashTotal / todayRevenue) * 100)}% of total</p>
                </div>
            </div>
        </div>
    </div>
);

// Section Header Component
const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
    <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{icon}</span>
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
    </div>
);

// Top Products Table
const TopProductsTable = ({ products }: { products: Array<{ name: string; qty: number; revenue: number }> }) => (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
            <SectionHeader icon="🏆" title="Top Selling Products" />
        </div>
        <table className="w-full">
            <thead className="bg-gray-50">
                <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">#</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Product</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Qty Sold</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Revenue</th>
                </tr>
            </thead>
            <tbody>
                {products.map((product, idx) => (
                    <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-600' :
                                    idx === 1 ? 'bg-gray-100 text-gray-600' :
                                        idx === 2 ? 'bg-orange-100 text-orange-600' :
                                            'bg-gray-50 text-gray-500'
                                }`}>
                                {idx + 1}
                            </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-800">{product.name}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{product.qty}</td>
                        <td className="py-3 px-4 text-right font-semibold text-green-600">Ksh {product.revenue.toLocaleString()}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// Active Shift Card
const ShiftCard = ({ shift }: { shift: { name: string; time: string; sales: number } }) => (
    <div className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md transition-all">
        <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="font-medium text-gray-800">{shift.name}</span>
            </div>
            <span className="text-xs text-gray-500">{shift.time}</span>
        </div>
        <p className="text-lg font-bold text-blue-600">Ksh {shift.sales.toLocaleString()}</p>
    </div>
);

export default function DashboardPage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        todayRevenue: 47250,
        mpesaTotal: 35300,
        cashTotal: 11950,
        transactions: 45,
        products: 156,
        categories: 12,
        lowStock: 5,
        activeShifts: 2,
        totalStaff: 8,
        activeStaff: 7,
        totalExpenses: 12500,
        pendingAdvances: 5000,
        pendingVouchers: 0,
    });

    const topProducts = [
        { name: 'Chicken Burger', qty: 45, revenue: 13500 },
        { name: 'Pizza Margherita', qty: 32, revenue: 9600 },
        { name: 'Beef Steak', qty: 28, revenue: 8400 },
        { name: 'Fish & Chips', qty: 25, revenue: 6250 },
        { name: 'Caesar Salad', qty: 22, revenue: 4400 },
    ];

    const recentSales = [
        { invoice: 'INV-1234', customer: 'Walk-in', amount: 2500, time: '2 min ago', status: 'paid' },
        { invoice: 'INV-1233', customer: 'John Doe', amount: 4200, time: '15 min ago', status: 'paid' },
        { invoice: 'INV-1232', customer: 'Credit - ABC Ltd', amount: 8500, time: '1 hour ago', status: 'credit' },
        { invoice: 'INV-1231', customer: 'Walk-in', amount: 1800, time: '2 hours ago', status: 'paid' },
    ];

    useEffect(() => {
        setTimeout(() => setLoading(false), 1000);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Revenue Card */}
            <RevenueCard
                todayRevenue={stats.todayRevenue}
                mpesaTotal={stats.mpesaTotal}
                cashTotal={stats.cashTotal}
                transactions={stats.transactions}
            />

            {/* Operations Overview */}
            <div>
                <SectionHeader icon="🏪" title="Operations Overview" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon="📦"
                        title="Total Products"
                        value={stats.products.toString()}
                        subtitle="Active items"
                        color="blue"
                    />
                    <StatCard
                        icon="🏷️"
                        title="Categories"
                        value={stats.categories.toString()}
                        subtitle="Product groups"
                        color="purple"
                    />
                    <StatCard
                        icon="👥"
                        title="Total Staff"
                        value={stats.totalStaff.toString()}
                        subtitle={`${stats.activeStaff} active employees`}
                        color="green"
                    />
                    <StatCard
                        icon="⏰"
                        title="Active Shifts"
                        value={stats.activeShifts.toString()}
                        subtitle="Currently running"
                        color="orange"
                    />
                </div>
            </div>

            {/* Payroll & Expenses */}
            <div>
                <SectionHeader icon="💰" title="Payroll & Expenses" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon="💵"
                        title="Today's Expenses"
                        value={`Ksh ${stats.totalExpenses.toLocaleString()}`}
                        subtitle="Business expenses"
                        color="red"
                    />
                    <StatCard
                        icon="📊"
                        title="Pending Advances"
                        value={`Ksh ${stats.pendingAdvances.toLocaleString()}`}
                        subtitle="Awaiting approval"
                        color="yellow"
                    />
                    <StatCard
                        icon="🧾"
                        title="Pending Vouchers"
                        value={`Ksh ${stats.pendingVouchers.toLocaleString()}`}
                        subtitle="Awaiting payment"
                        color="pink"
                    />
                    <StatCard
                        icon="⚠️"
                        title="Low Stock Items"
                        value={stats.lowStock.toString()}
                        subtitle="Need reordering"
                        color="red"
                        trend={{ value: '3 new', isUp: false }}
                    />
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Shifts */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <SectionHeader icon="⏰" title="Shift Performance" />
                    <div className="space-y-3">
                        <ShiftCard shift={{ name: '☀️ Day Shift', time: '06:00 - 18:00', sales: 32500 }} />
                        <ShiftCard shift={{ name: '🌙 Night Shift', time: '18:00 - 06:00', sales: 14750 }} />
                    </div>
                </div>

                {/* Recent Sales */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <SectionHeader icon="🧾" title="Recent Sales" />
                    <div className="space-y-3">
                        {recentSales.map((sale, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                <div>
                                    <p className="font-medium text-gray-800">{sale.invoice}</p>
                                    <p className="text-sm text-gray-500">{sale.customer}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-gray-800">Ksh {sale.amount.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">{sale.time}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${sale.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                                    }`}>
                                    {sale.status === 'paid' ? '✅ Paid' : '🔄 Credit'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Top Products */}
            <TopProductsTable products={topProducts} />

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <SectionHeader icon="⚡" title="Quick Actions" />
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[
                        { icon: '🛒', label: 'New Sale', color: 'blue' },
                        { icon: '📦', label: 'Add Product', color: 'green' },
                        { icon: '📥', label: 'Purchase Entry', color: 'purple' },
                        { icon: '💸', label: 'Record Expense', color: 'red' },
                        { icon: '👤', label: 'New Customer', color: 'orange' },
                        { icon: '📊', label: 'View Reports', color: 'cyan' },
                    ].map((action, idx) => (
                        <button
                            key={idx}
                            className={`p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-${action.color}-400 hover:bg-${action.color}-50 transition-all flex flex-col items-center gap-2`}
                        >
                            <span className="text-2xl">{action.icon}</span>
                            <span className="text-sm font-medium text-gray-600">{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
