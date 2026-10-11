'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { SettingsProvider, useCompanyName } from '@/context/SettingsContext';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

interface MenuItem {
    name: string;
    icon: JSX.Element;
    href?: string;
    badge?: string | null;
    subItems?: MenuItem[];
    id?: string;
}

interface MenuSection {
    category: string;
    items: MenuItem[];
}

// ─── SVG Icon Set (outline style matching image) ─────────────────────────────
const Icons = {
    dashboard: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
    ),
    pos: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            <line x1="7" y1="15" x2="7" y2="15" strokeWidth="2.5"/><line x1="12" y1="15" x2="12" y2="15" strokeWidth="2.5"/><line x1="17" y1="15" x2="17" y2="15" strokeWidth="2.5"/>
        </svg>
    ),
    kitchen: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
            <path d="M8 12h4l2-4"/>
        </svg>
    ),
    hotel: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
    ),
    rooms: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="1"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
    ),
    calendar: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
        </svg>
    ),
    key: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="4"/><path d="M11 7h10v2h-2v2h-2v-2h-2v4h-4"/>
        </svg>
    ),
    door: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="1"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
        </svg>
    ),
    users: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
    ),
    settings: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
    ),
    box: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
    ),
    inventory: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
    ),
    doc: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
        </svg>
    ),
    money: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
    ),
    cart: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.99-1.77l1.2-7.22H6"/>
        </svg>
    ),
    truck: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7V8z"/>
            <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
    ),
    finance: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
    ),
    hr: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
    ),
    bell: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
    ),
    logout: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
    ),
    chevronDown: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    ),
    chevronLeft: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
        </svg>
    ),
    chevronRight: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
        </svg>
    ),
    grid: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
    ),
    scale: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="3" x2="12" y2="21"/><path d="M5 7l7-4 7 4"/><path d="M3 14l9 6 9-6"/>
        </svg>
    ),
    transfer: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
        </svg>
    ),
    warn: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
    ),
    recipe: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
            <path d="M12 8v4l3 3"/>
        </svg>
    ),
    report: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
        </svg>
    ),
    return: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/>
        </svg>
    ),
    voucher: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12V6a2 2 0 00-2-2H4a2 2 0 00-2 2v6"/><path d="M2 12c0 1.1.9 2 2 2h16a2 2 0 002-2"/>
            <path d="M12 14v6"/><path d="M8 18h8"/>
        </svg>
    ),
    account: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
    ),
    payroll: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
    ),
    clock: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
    ),
    plus: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
    ),
    tag: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
    ),
    ruler: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.3 8.7L8.7 21.3c-.4.4-1 .4-1.4 0L2.7 16.7c-.4-.4-.4-1 0-1.4L15.3 2.7c.4-.4 1-.4 1.4 0l4.6 4.6c.4.4.4 1 0 1.4z"/>
            <line x1="6" y1="8" x2="8" y2="10"/><line x1="10" y1="12" x2="12" y2="14"/><line x1="14" y1="16" x2="16" y2="18"/>
        </svg>
    ),
    building: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <rect x="9" y="14" width="6" height="8"/>
        </svg>
    ),
    expense: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
    ),
};

// ─── Menu Structure ───────────────────────────────────────────────────────────
const buildMenu = (): MenuSection[] => [
    {
        category: 'MAIN',
        items: [
            { name: 'Dashboard', icon: Icons.dashboard, href: '/dashboard', badge: null },
            { name: 'Point of Sale', icon: Icons.pos, href: '/dashboard/pos', badge: 'LIVE' },
            { name: 'Kitchen Display', icon: Icons.kitchen, href: '/dashboard/kitchen', badge: 'KDS' },
        ],
    },
    {
        category: 'HOTEL',
        items: [
            {
                name: 'Front Office', icon: Icons.hotel, id: 'front-office',
                subItems: [
                    { name: 'Rooms Overview', icon: Icons.rooms, href: '/dashboard/hotel/rooms' },
                    { name: 'Reservations', icon: Icons.calendar, href: '/dashboard/hotel/reservations', badge: 'New' },
                    { name: 'Calendar Booking', icon: Icons.calendar, href: '/dashboard/hotel/calendar-booking' },
                    { name: 'Check-In', icon: Icons.key, href: '/dashboard/hotel/checkin' },
                    { name: 'Check-Out', icon: Icons.door, href: '/dashboard/hotel/checkout' },
                    { name: 'Guests', icon: Icons.users, href: '/dashboard/hotel/guests' },
                ],
            },
            {
                name: 'Room Settings', icon: Icons.settings, id: 'room-settings',
                subItems: [
                    { name: 'Room Types', icon: Icons.tag, href: '/dashboard/hotel/room-types' },
                    { name: 'Room Plans', icon: Icons.doc, href: '/dashboard/hotel/room-plans' },
                    { name: 'Housekeeping', icon: Icons.doc, href: '/dashboard/hotel/housekeeping' },
                ],
            },
        ],
    },
    {
        category: 'PRODUCTS & STOCK',
        items: [
            {
                name: 'Products', icon: Icons.box, id: 'products',
                subItems: [
                    { name: 'List Products', icon: Icons.doc, href: '/dashboard/products' },
                    { name: 'Categories', icon: Icons.grid, href: '/dashboard/categories' },
                    { name: 'Units', icon: Icons.ruler, href: '/dashboard/units' },
                    { name: 'Brands', icon: Icons.building, href: '/dashboard/brands' },
                ],
            },
            {
                name: 'Inventory', icon: Icons.inventory, id: 'inventory',
                subItems: [
                    { name: 'Dish Stock', icon: Icons.doc, href: '/dashboard/dish-stock' },
                    { name: 'Ingredient Stock', icon: Icons.doc, href: '/dashboard/ingredient-stock' },
                    { name: 'Stock Transfer', icon: Icons.transfer, href: '/dashboard/stock-transfer' },
                    { name: 'Stock Adjustment', icon: Icons.scale, href: '/dashboard/stock-adjustment' },
                    { name: 'Low Stock Alerts', icon: Icons.warn, href: '/dashboard/low-stock', badge: '!' },
                    { name: 'Recipe Production', icon: Icons.recipe, href: '/dashboard/recipe' },
                ],
            },
        ],
    },
    {
        category: 'SALES & PURCHASES',
        items: [
            {
                name: 'Sales', icon: Icons.money, id: 'sales',
                subItems: [
                    { name: 'Sales Records', icon: Icons.doc, href: '/dashboard/sales' },
                    { name: 'Dish Report', icon: Icons.report, href: '/dashboard/reports/dish-report' },
                    { name: 'Recipe Report', icon: Icons.report, href: '/dashboard/reports/recipe-report' },
                    { name: 'POS Reports', icon: Icons.report, href: '/dashboard/reports/pos' },
                    { name: 'Sales Return', icon: Icons.return, href: '/dashboard/sales-return' },
                ],
            },
            {
                name: 'Purchases', icon: Icons.cart, id: 'purchases',
                subItems: [
                    { name: 'Purchase List', icon: Icons.doc, href: '/dashboard/purchases' },
                    { name: 'Add Purchase', icon: Icons.plus, href: '/dashboard/purchase' },
                    { name: 'Suppliers', icon: Icons.truck, href: '/dashboard/suppliers' },
                ],
            },
        ],
    },
    {
        category: 'FINANCE & HR',
        items: [
            {
                name: 'Finance', icon: Icons.finance, id: 'finance',
                subItems: [
                    { name: 'Expenses', icon: Icons.expense, href: '/dashboard/expenses' },
                    { name: 'Vouchers', icon: Icons.voucher, href: '/dashboard/vouchers' },
                    { name: 'Accounts', icon: Icons.account, href: '/dashboard/accounts' },
                ],
            },
            {
                name: 'HR & Staff', icon: Icons.hr, id: 'hr',
                subItems: [
                    { name: 'Staff Management', icon: Icons.users, href: '/dashboard/users' },
                    { name: 'Payroll', icon: Icons.payroll, href: '/dashboard/payroll' },
                    { name: 'Shifts', icon: Icons.clock, href: '/dashboard/shifts' },
                ],
            },
        ],
    },
];

// ─── Company Name Component ───────────────────────────────────────────────────
function CompanyNameDisplay({ collapsed }: { collapsed: boolean }) {
    const companyName = useCompanyName();
    if (collapsed) return null;
    return (
        <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-[#3730a3] text-[13px] leading-tight uppercase tracking-wide break-words">
                {companyName || 'Alpha Plus Hotel'}
            </h1>
            <p className="text-[10px] text-gray-400 font-medium tracking-widest mt-0.5">MANAGEMENT SYSTEM</p>
        </div>
    );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<{ userId: string; name: string; userType?: string; isWaiter?: boolean } | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [isWaiter, setIsWaiter] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
        'front-office': true,
        'products': true,
    });

    useSessionTimeout();

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!userData) { router.push('/'); return; }
        const parsed = JSON.parse(userData);
        setUser(parsed);
        setIsWaiter(parsed.isWaiter === true || (parsed.userType || '').toLowerCase() === 'waiter');
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        router.push('/');
    };

    const toggleMenu = (id: string) => {
        if (collapsed) setCollapsed(false);
        setExpandedMenus(prev => ({ ...prev, [id]: !prev[id] }));
    };

    if (!user) return null;

    const menuSections = buildMenu();
    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'A';

    // Gradient colors for avatar based on user initial
    const avatarColors = ['from-indigo-500 to-purple-600', 'from-teal-500 to-emerald-600', 'from-rose-500 to-pink-600',
        'from-amber-500 to-orange-600', 'from-sky-500 to-blue-600'];
    const avatarColor = avatarColors[initial.charCodeAt(0) % avatarColors.length];

    return (
        <SettingsProvider>
            <div className="min-h-screen bg-[#f0f5f4] flex font-sans">

                {/* ── SIDEBAR ── */}
                {!isWaiter && (
                    <aside
                        style={{ width: collapsed ? '68px' : '256px', transition: 'width 0.25s ease' }}
                        className="fixed top-0 left-0 h-screen bg-white border-r border-gray-100 flex flex-col z-40 shadow-sm overflow-hidden"
                    >
                        {/* ── Logo / Brand Header ── */}
                        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 min-h-[68px]">
                            {/* Logo Square */}
                            <div className="w-9 h-9 min-w-[36px] rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-md flex-shrink-0">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                                    <polyline points="9 22 9 12 15 12 15 22"/>
                                </svg>
                            </div>
                            <CompanyNameDisplay collapsed={collapsed} />
                            {/* Collapse Toggle */}
                            <button
                                onClick={() => setCollapsed(v => !v)}
                                className="ml-auto w-7 h-7 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex-shrink-0 transition-colors"
                                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {collapsed ? Icons.chevronRight : Icons.chevronLeft}
                            </button>
                        </div>

                        {/* ── Notification Centre ── */}
                        <div className="px-3 pt-3">
                            <Link href="/dashboard/notifications"
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors group ${pathname === '/dashboard/notifications' ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600' : ''}`}
                            >
                                <span className="flex-shrink-0 text-gray-400 group-hover:text-gray-600">{Icons.bell}</span>
                                {!collapsed && (
                                    <span className="text-sm font-medium flex items-center gap-2">
                                        Notification Centre
                                        <span className="ml-auto text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">🔔</span>
                                    </span>
                                )}
                            </Link>
                        </div>

                        {/* ── Navigation ── */}
                        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5 custom-scrollbar">
                            {menuSections.map((section, sIdx) => (
                                <div key={sIdx} className="mb-1">
                                    {/* Section Label */}
                                    {!collapsed && (
                                        <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            {section.category}
                                        </div>
                                    )}
                                    {collapsed && sIdx > 0 && <div className="my-2 border-t border-gray-100" />}

                                    {section.items.map((item, iIdx) => {
                                        const isParentActive = item.href
                                            ? pathname === item.href
                                            : item.subItems?.some(s => pathname === s.href || pathname.startsWith(s.href || '____'));
                                        const isExpanded = item.id ? expandedMenus[item.id] : false;

                                        if (item.subItems) {
                                            return (
                                                <div key={iIdx}>
                                                    {/* Parent Button */}
                                                    <button
                                                        onClick={() => item.id && toggleMenu(item.id)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group
                                                            ${isParentActive
                                                                ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                                            }`}
                                                        title={collapsed ? item.name : undefined}
                                                    >
                                                        <span className={`flex-shrink-0 ${isParentActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                                            {item.icon}
                                                        </span>
                                                        {!collapsed && (
                                                            <>
                                                                <span className="flex-1 text-sm">{item.name}</span>
                                                                <span className={`text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                    {Icons.chevronDown}
                                                                </span>
                                                            </>
                                                        )}
                                                    </button>

                                                    {/* Sub-items */}
                                                    {!collapsed && isExpanded && (
                                                        <div className="ml-3 pl-3 border-l-2 border-indigo-100 mt-0.5 mb-1 space-y-0.5">
                                                            {item.subItems.map((sub, sIdx2) => {
                                                                const isSubActive = pathname === sub.href;
                                                                return (
                                                                    <Link
                                                                        key={sIdx2}
                                                                        href={sub.href || '#'}
                                                                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors group
                                                                            ${isSubActive
                                                                                ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-[3px] border-indigo-600 -ml-[2px] pl-[14px]'
                                                                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                                                            }`}
                                                                    >
                                                                        <span className={`flex-shrink-0 ${isSubActive ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-500'}`}>
                                                                            {sub.icon}
                                                                        </span>
                                                                        <span className="flex-1 text-[13px]">{sub.name}</span>
                                                                        {sub.badge && (
                                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                                                                                sub.badge === '!' ? 'bg-red-100 text-red-600'
                                                                                : sub.badge === 'New' ? 'bg-emerald-100 text-emerald-600'
                                                                                : 'bg-indigo-100 text-indigo-600'
                                                                            }`}>{sub.badge}</span>
                                                                        )}
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        // Single link item
                                        const isActive = pathname === item.href;
                                        return (
                                            <Link
                                                key={iIdx}
                                                href={item.href || '#'}
                                                title={collapsed ? item.name : undefined}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors group
                                                    ${isActive
                                                        ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-[3px] border-indigo-600'
                                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                                    }`}
                                            >
                                                <span className={`flex-shrink-0 ${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                                    {item.icon}
                                                </span>
                                                {!collapsed && (
                                                    <>
                                                        <span className="flex-1">{item.name}</span>
                                                        {item.badge && (
                                                            <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            ))}
                        </nav>

                        {/* ── User Profile Footer ── */}
                        <div className="border-t border-gray-100 p-3">
                            <div className="flex items-center gap-3">
                                {/* Avatar Circle */}
                                <div className={`w-9 h-9 min-w-[36px] rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm`}>
                                    {initial}
                                </div>

                                {!collapsed && (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate uppercase tracking-wide">
                                                {user.name}
                                            </p>
                                            <p className="text-[11px] text-indigo-500 font-semibold capitalize">
                                                {(user as any).userType || 'Admin'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleLogout}
                                            title="Sign Out"
                                            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                        >
                                            {Icons.logout}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </aside>
                )}

                {/* ── MAIN CONTENT ── */}
                <main
                    style={{
                        marginLeft: isWaiter ? 0 : collapsed ? '68px' : '256px',
                        transition: 'margin-left 0.25s ease',
                        minHeight: '100vh',
                    }}
                    className="flex-1 p-6"
                >
                    {/* Top Bar */}
                    <header className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-[#1a2332]">
                                Alpha Plus
                                <span className="ml-2 text-sm font-normal text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                                    Kenya's No.1
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">Welcome back, <strong>{user.name}</strong> 👋</p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="hidden md:flex bg-white px-3 py-1.5 rounded-full border border-gray-200 text-xs items-center gap-2 shadow-sm text-gray-600">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                System Online
                            </div>
                            <button className="h-9 w-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 shadow-sm hover:bg-gray-50 transition-colors relative">
                                <span className="text-base">🔔</span>
                                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
                            </button>
                        </div>
                    </header>

                    {children}
                </main>
            </div>
        </SettingsProvider>
    );
}
