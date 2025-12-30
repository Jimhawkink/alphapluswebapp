'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SettingsProvider, useCompanyName } from '@/context/SettingsContext';

// Menu Items for Hotel System
const menuItems = [
    {
        category: 'Main',
        items: [
            { name: 'Dashboard', icon: '📊', href: '/dashboard', badge: null },
            { name: 'POS', icon: '🛒', href: '/dashboard/pos', badge: 'Live' },
        ]
    },
    {
        category: 'Butchery',
        items: [
            { name: 'Butchery Dashboard', icon: '🥩', href: '/dashboard/butchery', badge: 'New' },
            { name: 'Butchery POS', icon: '🛒', href: '/dashboard/butchery/pos', badge: 'Live' },
            { name: 'Meat Types', icon: '🍖', href: '/dashboard/butchery/meat-types', badge: null },
            { name: 'Meat Batches', icon: '📦', href: '/dashboard/butchery/batches', badge: 'New' },
            { name: 'Weight Loss', icon: '⚖️', href: '/dashboard/butchery/weight-loss', badge: null },
            { name: 'Sales Report', icon: '📋', href: '/dashboard/butchery/sales-report', badge: null },
        ]
    },
    {
        category: 'Sales & Products',
        items: [
            { name: 'Products', icon: '🍕', href: '/dashboard/products', badge: null },
            { name: 'Ingredients', icon: '🥬', href: '/dashboard/ingredients', badge: 'New' },
            { name: 'Categories', icon: '🏷️', href: '/dashboard/categories', badge: null },
            { name: 'Sales Records', icon: '📋', href: '/dashboard/sales', badge: null },
            { name: 'Bills Records', icon: '🧾', href: '/dashboard/bills', badge: 'New' },
            { name: 'Bill Payment', icon: '💰', href: '/dashboard/bill-payment', badge: 'New' },
            { name: 'Sales Return', icon: '↩️', href: '/dashboard/sales-return', badge: null },
        ]
    },
    {
        category: 'Purchases',
        items: [
            { name: 'Suppliers', icon: '🏢', href: '/dashboard/suppliers', badge: null },
            { name: 'Purchase Entry', icon: '📥', href: '/dashboard/purchase', badge: null },
            { name: 'Purchase Records', icon: '📋', href: '/dashboard/purchases', badge: 'New' },
            { name: 'Purchase Order', icon: '📝', href: '/dashboard/purchase-order', badge: null },
            { name: 'Purchase Return', icon: '↩️', href: '/dashboard/purchase-return', badge: null },
        ]
    },
    {
        category: 'Inventory',
        items: [
            { name: 'Stock Transfer', icon: '🔄', href: '/dashboard/stock-transfer', badge: null },
            { name: 'Stock Movement', icon: '📦', href: '/dashboard/stock-movement', badge: 'New' },
            { name: 'Dish Movement', icon: '🍽️', href: '/dashboard/dish-movement', badge: 'New' },
            { name: 'Stock Adjustment', icon: '⚖️', href: '/dashboard/stock-adjustment', badge: null },
            { name: 'Low Stock', icon: '⚠️', href: '/dashboard/low-stock', badge: '5' },
            { name: 'Recipe', icon: '🍳', href: '/dashboard/recipe', badge: 'New' },
            { name: 'Production Batches', icon: '📦', href: '/dashboard/batches', badge: 'New' },
        ]
    },
    {
        category: 'Finance',
        items: [
            { name: 'Expenses', icon: '💸', href: '/dashboard/expenses', badge: null },
            { name: 'Vouchers', icon: '🧾', href: '/dashboard/vouchers', badge: null },
            { name: 'Credit Customers', icon: '💳', href: '/dashboard/credit-customers', badge: null },
            { name: 'M-Pesa', icon: '📱', href: '/dashboard/mpesa', badge: null },
        ]
    },
    {
        category: 'HR & Payroll',
        items: [
            { name: 'Payroll', icon: '💰', href: '/dashboard/payroll', badge: null },
            { name: 'Advances', icon: '💵', href: '/dashboard/advances', badge: null },
            { name: 'Shifts', icon: '⏰', href: '/dashboard/shifts', badge: null },
            { name: 'Shift Reports', icon: '📋', href: '/dashboard/shift-reports', badge: 'New' },
        ]
    },
    {
        category: 'Reports',
        items: [
            { name: 'POS Reports', icon: '📈', href: '/dashboard/reports/pos', badge: null },
            { name: 'Accounting', icon: '📊', href: '/dashboard/reports/accounting', badge: null },
            { name: 'Logs', icon: '📜', href: '/dashboard/logs', badge: null },
        ]
    },
    {
        category: 'Administration',
        items: [
            { name: 'Users', icon: '👥', href: '/dashboard/users', badge: null },
            { name: 'User Roles', icon: '🛡️', href: '/dashboard/user-roles', badge: null },
            { name: 'Company', icon: '🏨', href: '/dashboard/company', badge: null },
            { name: 'Tables & Rooms', icon: '🪑', href: '/dashboard/tables-rooms', badge: 'New' },
            { name: 'Food Order Notes', icon: '📝', href: '/dashboard/food-notes', badge: 'New' },
            { name: 'Tax Settings', icon: '📊', href: '/dashboard/tax-settings', badge: null },
            { name: 'Units', icon: '📏', href: '/dashboard/units', badge: null },
        ]
    },
];

// Component to display company name dynamically - with word wrap
function CompanyNameDisplay() {
    const companyName = useCompanyName();
    return (
        <h1 className="font-bold text-gray-800 text-sm leading-tight max-w-[140px] break-words">
            {companyName}
        </h1>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [user, setUser] = useState<{ userId: string; name: string } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeMenu, setActiveMenu] = useState('/dashboard');

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!userData) {
            router.push('/');
            return;
        }
        setUser(JSON.parse(userData));

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [router]);

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return { text: 'Good Morning', emoji: '🌅' };
        if (hour < 17) return { text: 'Good Afternoon', emoji: '☀️' };
        if (hour < 21) return { text: 'Good Evening', emoji: '🌆' };
        return { text: 'Good Night', emoji: '🌙' };
    };

    const greeting = getGreeting();

    const handleLogout = () => {
        localStorage.removeItem('user');
        router.push('/');
    };

    if (!user) return null;

    return (
        <SettingsProvider>
            <div className="min-h-screen bg-[#f8fafc] flex">
                {/* Sidebar */}
                <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 fixed h-full z-50`}>
                    {/* Logo Section */}
                    <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                                <span className="text-xl">🏨</span>
                            </div>
                            {sidebarOpen && (
                                <div>
                                    <CompanyNameDisplay />
                                    <span className="text-xs text-indigo-500 font-medium">v3.5</span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {sidebarOpen ? '◀️' : '▶️'}
                        </button>
                    </div>

                    {/* Search */}
                    {sidebarOpen && (
                        <div className="p-4">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                                />
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto px-3 py-2">
                        {menuItems.map((section, idx) => (
                            <div key={idx} className="mb-4">
                                {sidebarOpen && (
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                                        {section.category}
                                    </p>
                                )}
                                {section.items.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setActiveMenu(item.href)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all ${activeMenu === item.href
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <span className="text-xl">{item.icon}</span>
                                        {sidebarOpen && (
                                            <>
                                                <span className="font-medium text-sm flex-1">{item.name}</span>
                                                {item.badge && (
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.badge === 'Live'
                                                        ? 'bg-green-100 text-green-600'
                                                        : 'bg-red-100 text-red-600'
                                                        }`}>
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </nav>

                    {/* User Profile */}
                    <div className="p-4 border-t border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            {sidebarOpen && (
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-800 text-sm">{user.name}</p>
                                    <p className="text-xs text-gray-500">Super Admin</p>
                                </div>
                            )}
                            {sidebarOpen && (
                                <button
                                    onClick={handleLogout}
                                    className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                                    title="Logout"
                                >
                                    🚪
                                </button>
                            )}
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
                    {/* Top Header */}
                    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                                {greeting.emoji} {greeting.text}
                                <span className="text-2xl">👋</span>
                            </h2>
                            <span className="text-sm text-gray-400">Dashboard with filters - v2.2</span>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Online Status */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-sm font-medium text-green-600">3/3 Online</span>
                            </div>

                            {/* Filters Button */}
                            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                <span>🎛️</span>
                                <span className="font-medium text-gray-600">Filters</span>
                            </button>

                            {/* Refresh Button */}
                            <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-sm">
                                <span>🔄</span>
                                <span className="font-medium">Refresh</span>
                            </button>

                            {/* Notifications */}
                            <button className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors">
                                <span className="text-xl">🔔</span>
                                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                            </button>

                            {/* User Avatar */}
                            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                                <div className="text-right">
                                    <p className="font-semibold text-gray-800 text-sm">{user.name}</p>
                                    <p className="text-xs text-gray-500">Super Admin</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-md">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Page Content */}
                    <div className="p-6">
                        {children}
                    </div>
                </main>
            </div>
        </SettingsProvider>
    );
}
