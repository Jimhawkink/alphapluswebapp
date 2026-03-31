'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { SettingsProvider, useCompanyName } from '@/context/SettingsContext';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

// Extended Menu Item Interface for Sub-menus
interface MenuItem {
    name: string;
    icon: string;
    href?: string;
    badge?: string | null;
    subItems?: MenuItem[];
    id?: string; // unique id for toggle
}

interface MenuSection {
    category: string;
    items: MenuItem[];
}

// Neo Menu Structure
const menuItems: MenuSection[] = [
    {
        category: 'Main',
        items: [
            { name: 'Dashboard', icon: '📊', href: '/dashboard', badge: null },
            { name: 'POS', icon: '🛒', href: '/dashboard/pos', badge: 'Live' },
        ]
    },
    {
        category: 'Hotel Management',
        items: [
            {
                name: 'Front Office', icon: '🏨', id: 'front-office',
                subItems: [
                    { name: 'Rooms Overview', icon: '🛏️', href: '/dashboard/hotel/rooms' },
                    { name: 'Reservations', icon: '📅', href: '/dashboard/hotel/reservations', badge: 'New' },
                    { name: 'Calendar Booking', icon: '📆', href: '/dashboard/hotel/calendar-booking', badge: 'Hot' },
                    { name: 'Check-In', icon: '🔑', href: '/dashboard/hotel/checkin' },
                    { name: 'Check-Out', icon: '🚪', href: '/dashboard/hotel/checkout' },
                    { name: 'Guests', icon: '👥', href: '/dashboard/hotel/guests' },
                ]
            },
            {
                name: 'Room Settings', icon: '⚙️', id: 'room-settings',
                subItems: [
                    { name: 'Room Types', icon: '🏷️', href: '/dashboard/hotel/room-types' },
                    { name: 'Room Plans', icon: '📋', href: '/dashboard/hotel/room-plans' },
                    { name: 'Housekeeping', icon: '🧹', href: '/dashboard/hotel/housekeeping' },
                ]
            },
        ]
    },
    {
        category: 'Product & Stock',
        items: [
            {
                name: 'Products', icon: '📦', id: 'products',
                subItems: [
                    { name: 'List Products', icon: '📋', href: '/dashboard/products' },
                    { name: 'Add Product', icon: '➕', href: '/dashboard/products/add' },
                    { name: 'Print Labels', icon: '🏷️', href: '/dashboard/products/print-labels' },
                    { name: 'Categories', icon: '📂', href: '/dashboard/categories' },
                    { name: 'Units', icon: '📏', href: '/dashboard/units' },
                    { name: 'Brands', icon: '🏢', href: '/dashboard/brands' },
                ]
            },
            {
                name: 'Inventory', icon: '📊', id: 'inventory',
                subItems: [
                    { name: 'Dish Stock', icon: '🍽️', href: '/dashboard/dish-stock' },
                    { name: 'Ingredient Stock', icon: '🧂', href: '/dashboard/ingredient-stock' },
                    { name: 'Stock Transfer', icon: '🔄', href: '/dashboard/stock-transfer' },
                    { name: 'Stock Adjustment', icon: '⚖️', href: '/dashboard/stock-adjustment' },
                    { name: 'Low Stock', icon: '⚠️', href: '/dashboard/low-stock', badge: '5' },
                    { name: 'Recipe', icon: '🍳', href: '/dashboard/recipe' },
                ]
            }
        ]
    },
    {
        category: 'Sales & Purchases',
        items: [
            {
                name: 'Sales', icon: '💰', id: 'sales',
                subItems: [
                    { name: 'Sales Records', icon: '📋', href: '/dashboard/sales' },
                    { name: 'Dish Report', icon: '🧾', href: '/dashboard/reports/dish-report' },
                    { name: 'Recipe Report', icon: '🍳', href: '/dashboard/reports/recipe-report' },
                    { name: 'POS Reports', icon: '🧾', href: '/dashboard/reports/pos' },
                    { name: 'Sales Return', icon: '↩️', href: '/dashboard/sales-return' },
                ]
            },
            {
                name: 'Purchases', icon: '📥', id: 'purchases',
                subItems: [
                    { name: 'Purchase List', icon: '📋', href: '/dashboard/purchases' },
                    { name: 'Add Purchase', icon: '➕', href: '/dashboard/purchase' },
                    { name: 'Suppliers', icon: '🚚', href: '/dashboard/suppliers' },
                ]
            }
        ]
    },
    {
        category: 'Finance & HR',
        items: [
            {
                name: 'Finance', icon: '💸', id: 'finance',
                subItems: [
                    { name: 'Expenses', icon: '📤', href: '/dashboard/expenses' },
                    { name: 'Vouchers', icon: '🧾', href: '/dashboard/vouchers' },
                    { name: 'Accounts', icon: '💳', href: '/dashboard/accounts' },
                ]
            },
            {
                name: 'HR', icon: '👥', id: 'hr',
                subItems: [
                    { name: 'Staff', icon: '👤', href: '/dashboard/users' },
                    { name: 'Payroll', icon: '💵', href: '/dashboard/payroll' },
                    { name: 'Shifts', icon: '⏰', href: '/dashboard/shifts' },
                ]
            }
        ]
    }
];

// Component to display company name dynamically
function CompanyNameDisplay() {
    const companyName = useCompanyName();
    return (
        <h1 className="font-bold text-[#1e293b] text-sm leading-tight max-w-[140px] break-words">
            {companyName}
        </h1>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<{ userId: string; name: string; isWaiter?: boolean } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isWaiter, setIsWaiter] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // State for collapsible sub-menus
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        'products': true, // Default open for easier navigation
        'front-office': true
    });

    // Initialize session timeout
    useSessionTimeout();

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!userData) {
            router.push('/');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setIsWaiter(parsedUser.isWaiter === true || (parsedUser.userType || '').toLowerCase() === 'waiter');

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        router.push('/');
    };

    const toggleSubMenu = (id: string) => {
        if (!sidebarOpen) setSidebarOpen(true); // Auto-expand sidebar if clicking a menu
        setExpandedMenus(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    if (!user) return null;

    return (
        <SettingsProvider>
            <div className="min-h-screen bg-[#f0f5f4] flex font-sans">
                {/* Neo Sidebar */}
                {!isWaiter && (
                    <aside className={`neo-sidebar ${!sidebarOpen ? 'collapsed' : ''}`}>
                        {/* Logo Section */}
                        <div className="h-16 flex items-center px-4 py-3 border-b border-gray-100/50">
                            <div className="flex items-center gap-3 w-full">
                                <div className="w-9 h-9 min-w-[36px] rounded-xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center shadow-md text-white">
                                    <span className="text-lg">🏨</span>
                                </div>
                                <div className={`flex-1 transition-opacity duration-200 ${!sidebarOpen ? 'opacity-0 hidden' : 'opacity-100'}`}>
                                    <CompanyNameDisplay />
                                </div>
                            </div>
                        </div>

                        {/* Navigation */}
                        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                            {menuItems.map((section, idx) => (
                                <div key={idx} className="mb-4">
                                    <div className={`px-4 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${!sidebarOpen ? 'text-center' : ''}`}>
                                        {sidebarOpen ? section.category : '•'}
                                    </div>

                                    <div className="flex flex-col gap-0.5 px-2">
                                        {section.items.map((item, itemIdx) => {
                                            const isActive = item.href === pathname ||
                                                (item.subItems && item.subItems.some(sub => sub.href === pathname));
                                            const isExpanded = item.id && expandedMenus[item.id];

                                            if (item.subItems) {
                                                // Render Parent with Sub-menu
                                                return (
                                                    <div key={itemIdx}>
                                                        <div
                                                            className={`neo-nav-link justify-between ${isActive ? 'active' : ''}`}
                                                            onClick={() => item.id && toggleSubMenu(item.id)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-lg">{item.icon}</span>
                                                                <span className={`transition-opacity duration-200 ${!sidebarOpen ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                                                                    {item.name}
                                                                </span>
                                                            </div>
                                                            {sidebarOpen && (
                                                                <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                                    </svg>
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Sub-menu Items */}
                                                        {sidebarOpen && (
                                                            <div className={`neo-sub-menu ${isExpanded ? 'open' : ''}`}>
                                                                {item.subItems.map((sub, subIdx) => (
                                                                    <Link
                                                                        key={subIdx}
                                                                        href={sub.href || '#'}
                                                                        className={`flex items-center gap-3 px-4 py-2 pl-12 text-[11px] font-medium text-gray-500 hover:text-[#0d9488] hover:bg-teal-50/50 transition-colors
                                                                            ${pathname === sub.href ? 'text-[#0d9488] bg-teal-50' : ''}`}
                                                                    >
                                                                        <span>{sub.name}</span>
                                                                        {sub.badge && (
                                                                            <span className="ml-auto text-[9px] bg-red-100 text-red-600 px-1.5 rounded-full">{sub.badge}</span>
                                                                        )}
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } else {
                                                // Render Single Link
                                                return (
                                                    <Link
                                                        key={itemIdx}
                                                        href={item.href || '#'}
                                                        className={`neo-nav-link ${pathname === item.href ? 'active' : ''}`}
                                                    >
                                                        <span className="text-lg">{item.icon}</span>
                                                        <span className={`transition-opacity duration-200 ${!sidebarOpen ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                                                            {item.name}
                                                        </span>
                                                        {item.badge && sidebarOpen && (
                                                            <span className="ml-auto text-[9px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </Link>
                                                );
                                            }
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Sidebar Footer / Collapse Toggle */}
                        <div className="p-3 border-t border-gray-100/50">
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="w-full h-9 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 transition-colors group"
                            >
                                {sidebarOpen ? (
                                    <div className="flex items-center gap-2">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:text-teal-600 transition-colors">
                                            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span className="text-xs font-medium group-hover:text-gray-600">Collapse Sidebar</span>
                                    </div>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:text-teal-600 transition-colors">
                                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>

                            {sidebarOpen && (
                                <div className="mt-3 flex items-center gap-3 px-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-xs font-bold">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-xs font-bold text-gray-700 truncate">{user.name}</p>
                                        <button onClick={handleLogout} className="text-[10px] text-red-500 flex items-center gap-1 hover:underline">
                                            Sign Out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                )}

                {/* Main Content */}
                <main className={`neo-main ${!sidebarOpen ? 'expanded' : ''} ${isWaiter ? '!ml-0' : ''}`}>
                    {/* Top Header - Recreating the simple cleaner look */}
                    <header className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-[#1a2332] flex items-center gap-2">
                                Dashboard
                                <span className="text-sm font-normal text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">v3.5</span>
                            </h2>
                            <p className="text-xs text-gray-500 mt-1">
                                Welcome back, {user.name} 👋
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="hidden md:flex bg-white px-3 py-1.5 rounded-full border border-gray-200 text-xs items-center gap-2 shadow-sm text-gray-600">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                System Online
                            </div>

                            <button className="h-9 w-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 shadow-sm hover:bg-gray-50 transition-colors relative">
                                🔔
                                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                            </button>
                        </div>
                    </header>

                    {children}
                </main>
            </div>
        </SettingsProvider>
    );
}
