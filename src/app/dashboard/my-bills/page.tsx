'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    generateCustomerBillHTML,
    generateKOTHTML,
    createReceiptData,
    createKOTData,
    loadCompanyInfo,
    defaultCompanyInfo,
    CompanyInfo,
} from '@/lib/receiptPrinter';
import { executeDirectPrint } from '@/lib/printerSettings';

interface BillItem {
    item_id?: number;
    sale_id?: number;
    product_id?: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes?: string;
    batch_number?: string;
}

interface Bill {
    sale_id: number;
    receipt_no: string;
    kot_number?: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    table_name?: string;
    table_no?: string;
    customer_name?: string;
    total_amount: number;
    subtotal?: number;
    discount?: number;
    payment_method?: string;
    status: string;
    waiter_name: string;
    waiter_id?: number;
    cashier_name?: string;
    shift_code?: string;
    order_notes?: string;
    items: BillItem[];
}

export default function MyBillsPage() {
    const [bills, setBills] = useState<Bill[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'unpaid' | 'paid'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_desc' | 'table'>('newest');
    
    // Identity context
    const [currentUserName, setCurrentUserName] = useState<string>('');
    const [currentUserRole, setCurrentUserRole] = useState<string>('Staff');
    const [isWaiterUser, setIsWaiterUser] = useState<boolean>(false);
    const [selectedWaiter, setSelectedWaiter] = useState<string>('');
    const [waitersList, setWaitersList] = useState<{ user_id: number; name: string }[]>([]);

    // Date Scope Controls
    const [dateScope, setDateScope] = useState<'today' | 'open_all' | 'yesterday' | 'custom'>('today');
    const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Accordion Expansion
    const [expandedBillId, setExpandedBillId] = useState<number | null>(null);

    // Printing state
    const [printingBillId, setPrintingBillId] = useState<number | null>(null);
    const [printingKOTId, setPrintingKOTId] = useState<number | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(defaultCompanyInfo);

    // Load Company Info on Mount
    useEffect(() => {
        loadCompanyInfo().then(info => {
            if (info) setCompanyInfo(info);
        }).catch(() => {});
    }, []);

    // 1. Resolve Active User Identity
    useEffect(() => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const parsed = JSON.parse(userStr);
                const isWaiter = parsed.isWaiter === true || 
                                (parsed.userType || '').toLowerCase().includes('waiter') ||
                                (parsed.userType || '').toLowerCase() === 'waitress';
                setIsWaiterUser(isWaiter);
                setCurrentUserName(parsed.name || '');
                setCurrentUserRole(parsed.userType || 'Staff');
                
                // If waiter, strictly pin to their own name
                if (isWaiter && parsed.name) {
                    setSelectedWaiter(parsed.name);
                    localStorage.setItem('alpha_hotel_selected_waiter', parsed.name);
                } else {
                    // Admin / Manager / Cashier: restore or default to All
                    const saved = localStorage.getItem('alpha_hotel_selected_waiter');
                    setSelectedWaiter(saved || parsed.name || 'All');
                }
            } else {
                const saved = localStorage.getItem('alpha_hotel_selected_waiter');
                if (saved) setSelectedWaiter(saved);
            }
        } catch (_) {}

        // Load active waiters list from database
        const loadWaiters = async () => {
            try {
                const { data } = await supabase
                    .from('users')
                    .select('user_id, name')
                    .eq('active', true)
                    .order('name');
                if (data && data.length > 0) {
                    setWaitersList(data);
                    // Fallback if selectedWaiter is still empty
                    setSelectedWaiter(prev => prev || data[0].name);
                }
            } catch (err) {
                console.error('Error fetching waiters:', err);
            }
        };
        loadWaiters();
    }, []);

    // 2. Fetch Bills with optimized batch join
    const loadBills = useCallback(async () => {
        setIsLoading(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

            let query = supabase.from('sales').select('*');

            // Date scoping
            if (dateScope === 'today') {
                query = query.eq('sale_date', todayStr);
            } else if (dateScope === 'yesterday') {
                query = query.eq('sale_date', yesterdayStr);
            } else if (dateScope === 'custom') {
                query = query.eq('sale_date', customDate);
            } else if (dateScope === 'open_all') {
                // All open / pending tables on the floor regardless of date
                query = query.eq('status', 'Pending');
            }

            // Waiter filtering
            if (selectedWaiter && selectedWaiter !== 'All') {
                query = query.ilike('waiter_name', `%${selectedWaiter}%`);
            }

            query = query.order('sale_datetime', { ascending: false }).limit(200);

            const { data: salesData, error: salesError } = await query;
            if (salesError) throw salesError;

            if (!salesData || salesData.length === 0) {
                setBills([]);
                setIsLoading(false);
                return;
            }

            // Batch fetch items in one single query
            const saleIds = salesData.map(s => s.sale_id);
            const { data: itemsData, error: itemsError } = await supabase
                .from('sales_items')
                .select('*')
                .in('sale_id', saleIds);

            if (itemsError) console.warn('Could not load item details:', itemsError);

            // Group items by sale_id
            const itemsMap: Record<number, BillItem[]> = {};
            (itemsData || []).forEach(item => {
                if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
                itemsMap[item.sale_id].push({
                    item_id: item.item_id,
                    sale_id: item.sale_id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    subtotal: item.subtotal || (item.quantity * item.unit_price),
                    notes: item.notes,
                    batch_number: item.batch_number,
                });
            });

            const mergedBills: Bill[] = salesData.map(s => ({
                ...s,
                items: itemsMap[s.sale_id] || [],
            }));

            setBills(mergedBills);
        } catch (err: any) {
            console.error('Error loading bills:', err);
            toast.error('Failed to load bills. Please retry.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedWaiter, dateScope, customDate]);

    useEffect(() => {
        if (selectedWaiter !== '') {
            loadBills();
        }
    }, [selectedWaiter, dateScope, customDate, loadBills]);

    // Live Auto-Refresh every 20 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadBills();
        }, 20000);
        return () => clearInterval(interval);
    }, [loadBills]);

    // 3. Computed Metrics & Stats
    const metrics = useMemo(() => {
        const totalCount = bills.length;
        const unpaidBills = bills.filter(b => b.status === 'Pending');
        const paidBills = bills.filter(b => b.status === 'Completed' || b.status === 'Paid');

        const unpaidTotal = unpaidBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);
        const paidTotal = paidBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);
        const grandTotal = unpaidTotal + paidTotal;
        const avgTicket = totalCount > 0 ? Math.round(grandTotal / totalCount) : 0;

        return {
            totalCount,
            unpaidCount: unpaidBills.length,
            unpaidTotal,
            paidCount: paidBills.length,
            paidTotal,
            grandTotal,
            avgTicket,
        };
    }, [bills]);

    // 4. Filtered & Sorted Bills
    const processedBills = useMemo(() => {
        return bills
            .filter(bill => {
                // Status tab filter
                if (activeTab === 'unpaid' && bill.status !== 'Pending') return false;
                if (activeTab === 'paid' && bill.status === 'Pending') return false;

                // Search query filter
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase().trim();
                    const receiptMatch = (bill.receipt_no || '').toLowerCase().includes(q);
                    const kotMatch = (bill.kot_number || '').toLowerCase().includes(q);
                    const tableMatch = (bill.table_name || bill.table_no || '').toLowerCase().includes(q);
                    const customerMatch = (bill.customer_name || '').toLowerCase().includes(q);
                    const waiterMatch = (bill.waiter_name || '').toLowerCase().includes(q);
                    const itemMatch = bill.items.some(i => (i.product_name || '').toLowerCase().includes(q));
                    return receiptMatch || kotMatch || tableMatch || customerMatch || waiterMatch || itemMatch;
                }
                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'newest') {
                    return new Date(b.sale_datetime).getTime() - new Date(a.sale_datetime).getTime();
                }
                if (sortBy === 'oldest') {
                    return new Date(a.sale_datetime).getTime() - new Date(b.sale_datetime).getTime();
                }
                if (sortBy === 'amount_desc') {
                    return (b.total_amount || 0) - (a.total_amount || 0);
                }
                if (sortBy === 'table') {
                    const tA = (a.table_name || a.table_no || '').toLowerCase();
                    const tB = (b.table_name || b.table_no || '').toLowerCase();
                    return tA.localeCompare(tB);
                }
                return 0;
            });
    }, [bills, activeTab, searchQuery, sortBy]);

    // 5. Direct Print Customer Bill Action
    const handlePrintBill = async (bill: Bill, e: React.MouseEvent) => {
        e.stopPropagation();
        setPrintingBillId(bill.sale_id);
        try {
            const receiptData = createReceiptData(
                bill.receipt_no,
                bill.items.map(i => ({
                    name: i.product_name,
                    qty: i.quantity,
                    price: i.unit_price,
                    discount: 0,
                    notes: i.notes,
                })),
                bill.payment_method || 'CASH',
                bill.total_amount,
                bill.cashier_name || 'Cashier',
                {
                    customerName: bill.customer_name,
                    tableNo: bill.table_name || bill.table_no,
                    orderNotes: bill.order_notes,
                    shiftCode: bill.shift_code || 'SHIFT-01',
                    isPaid: bill.status === 'Completed' || bill.status === 'Paid',
                    showTaxInfo: true,
                    hotelName: companyInfo?.name || 'Alpha Plus Hotel & Restaurant',
                }
            );

            const html = await generateCustomerBillHTML(receiptData, companyInfo, true);
            await executeDirectPrint(html, { printerRole: 'customer' });
            toast.success(`Customer bill sent to printer for #${bill.receipt_no}! 🧾`);
        } catch (err: any) {
            console.error('Print bill error:', err);
            toast.error('Failed to print customer bill');
        } finally {
            setPrintingBillId(null);
        }
    };

    // 6. Direct Reprint Kitchen KOT Action
    const handleReprintKOT = async (bill: Bill, e: React.MouseEvent) => {
        e.stopPropagation();
        setPrintingKOTId(bill.sale_id);
        try {
            const kotData = createKOTData(
                bill.kot_number || `KOT-${bill.sale_id}`,
                bill.items.map(i => ({
                    name: i.product_name,
                    qty: i.quantity,
                    notes: i.notes,
                })),
                (bill.table_name || bill.table_no) ? 'Dine-In' : 'Take-Away',
                {
                    tableNo: bill.table_name || bill.table_no,
                    waiter: bill.waiter_name || currentUserName || 'Waiter',
                    orderNotes: bill.order_notes,
                    priority: 'normal',
                }
            );

            const html = generateKOTHTML(kotData, companyInfo);
            await executeDirectPrint(html, { printerRole: 'kitchen' });
            toast.success(`Kitchen KOT #${kotData.kotNo} reprinted! 🍳`);
        } catch (err: any) {
            console.error('Reprint KOT error:', err);
            toast.error('Failed to reprint KOT');
        } finally {
            setPrintingKOTId(null);
        }
    };

    // Helpers
    const formatTime = (datetime?: string) => {
        if (!datetime) return '';
        try {
            return new Date(datetime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const getElapsedMinutes = (datetime?: string) => {
        if (!datetime) return null;
        try {
            const diffMs = Date.now() - new Date(datetime).getTime();
            const mins = Math.floor(diffMs / 60000);
            if (mins < 1) return 'Just now';
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            return `${hrs}h ${mins % 60}m ago`;
        } catch { return null; }
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 pb-12 font-sans select-none">
            {/* ─── 1. ULTRA-PREMIUM SAPPHIRE & INDIGO HEADER BAR ─── */}
            <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-800 text-white shadow-xl sticky top-0 z-40 border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Left: Back to POS & Title */}
                        <div className="flex items-center gap-3.5">
                            <a
                                href="/dashboard/pos"
                                className="px-3.5 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border border-white/20 shadow-sm"
                                title="Return to POS Dining Floor"
                            >
                                <span>🛒</span>
                                <span>Back to POS Floor</span>
                            </a>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                                        <span>📋</span>
                                        <span>My Bills &amp; Floor Orders</span>
                                    </h1>
                                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full text-[10px] font-black uppercase">
                                        Live Floor Sync
                                    </span>
                                </div>
                                <p className="text-blue-100/80 text-xs font-medium mt-0.5">
                                    Track running checks, print pro-forma bills &amp; review settled shift receipts
                                </p>
                            </div>
                        </div>

                        {/* Right: Waiter Switcher & Refresh */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            {/* Waiter Identity Badge / Dropdown */}
                            {isWaiterUser ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-black/25 border border-white/20 rounded-xl">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-bold text-blue-200">Logged Waiter:</span>
                                    <span className="text-xs font-black text-amber-300">
                                        {currentUserName || selectedWaiter}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 bg-black/25 border border-white/20 px-2.5 py-1 rounded-xl">
                                    <span className="text-xs text-blue-200 font-bold">Waiter:</span>
                                    <select
                                        value={selectedWaiter}
                                        onChange={(e) => {
                                            setSelectedWaiter(e.target.value);
                                            localStorage.setItem('alpha_hotel_selected_waiter', e.target.value);
                                        }}
                                        className="bg-transparent text-white font-black text-xs focus:outline-none cursor-pointer"
                                    >
                                        <option value="All" className="text-slate-900 font-bold">🌐 All Waiters (Floor Overview)</option>
                                        {waitersList.map(w => (
                                            <option key={w.user_id} value={w.name} className="text-slate-900 font-semibold">
                                                {w.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Refresh Button */}
                            <button
                                type="button"
                                onClick={loadBills}
                                className="px-3 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/20 shadow-sm cursor-pointer"
                                title="Refresh floor bills"
                            >
                                <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
                {/* ─── 2. LIVE SHIFT STATS & REVENUE CARDS ─── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* 1. Total Bills */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase">Total Shift Orders</p>
                                <h3 className="text-2xl font-black text-slate-900 mt-0.5">{metrics.totalCount}</h3>
                                <p className="text-[11px] text-slate-400 font-semibold mt-1">
                                    Avg: Ksh {metrics.avgTicket.toLocaleString()} / check
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shadow-inner border border-blue-100">
                                📋
                            </div>
                        </div>
                    </div>

                    {/* 2. Unpaid Orders - Hot Alert */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 rounded-2xl border-2 border-amber-300 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black text-amber-800 uppercase flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                                    <span>Open / Unpaid</span>
                                </p>
                                <h3 className="text-2xl font-black text-amber-950 mt-0.5">{metrics.unpaidCount}</h3>
                                <p className="text-xs font-black text-orange-600 mt-1">
                                    Ksh {metrics.unpaidTotal.toLocaleString()}
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-md shadow-amber-500/30">
                                ⏳
                            </div>
                        </div>
                    </div>

                    {/* 3. Paid & Settled */}
                    <div className="bg-gradient-to-br from-emerald-50 to-green-50/60 p-4 rounded-2xl border border-emerald-300 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-emerald-800 uppercase">Paid &amp; Settled</p>
                                <h3 className="text-2xl font-black text-emerald-950 mt-0.5">{metrics.paidCount}</h3>
                                <p className="text-xs font-black text-emerald-600 mt-1">
                                    Ksh {metrics.paidTotal.toLocaleString()}
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-600/30">
                                ✅
                            </div>
                        </div>
                    </div>

                    {/* 4. Total Floor Volume */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase">Gross Revenue</p>
                                <h3 className="text-2xl font-black text-indigo-900 mt-0.5">
                                    Ksh {metrics.grandTotal.toLocaleString()}
                                </h3>
                                <p className="text-[11px] text-indigo-600 font-bold mt-1">
                                    {selectedWaiter === 'All' ? 'Whole Floor' : selectedWaiter}
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shadow-inner border border-indigo-100">
                                💰
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── 3. SUPER FILTER & SEARCH CONTROLS BAR ─── */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
                    {/* Top Row: Status Tabs + Date Presets */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Status Pills */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setActiveTab('all')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    activeTab === 'all'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                All Orders ({metrics.totalCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('unpaid')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                                    activeTab === 'unpaid'
                                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                                        : 'text-slate-600 hover:text-amber-800'
                                }`}
                            >
                                <span>⏳ Open Unpaid</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'unpaid' ? 'bg-black/20 text-slate-950' : 'bg-amber-100 text-amber-800'}`}>
                                    {metrics.unpaidCount}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('paid')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                                    activeTab === 'paid'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:text-emerald-800'
                                }`}
                            >
                                <span>✅ Paid</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'paid' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                                    {metrics.paidCount}
                                </span>
                            </button>
                        </div>

                        {/* Date Scope Buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setDateScope('today')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                    dateScope === 'today'
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                📅 Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateScope('open_all')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border flex items-center gap-1 ${
                                    dateScope === 'open_all'
                                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                                        : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100'
                                }`}
                                title="Show every running check across the entire floor regardless of date"
                            >
                                <span>⚡ All Active Floor Bills</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateScope('yesterday')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                    dateScope === 'yesterday'
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                ⏮️ Yesterday
                            </button>
                            <div className="flex items-center gap-1">
                                <input
                                    type="date"
                                    value={customDate}
                                    onChange={(e) => {
                                        setCustomDate(e.target.value);
                                        setDateScope('custom');
                                    }}
                                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row: Search Box + Sort Selector */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-slate-100">
                        {/* Instant Search Input */}
                        <div className="relative w-full sm:max-w-md">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                                🔍
                            </span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search Receipt #, Table (T4), Customer, Dish name..."
                                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Sort Dropdown */}
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <span className="text-xs font-bold text-slate-400 uppercase">Sort:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                                <option value="newest">⏱️ Newest First</option>
                                <option value="oldest">⌛ Oldest First</option>
                                <option value="amount_desc">💰 Highest Amount</option>
                                <option value="table">🍽️ Table Number</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* ─── 4. BILLS LIST / CARD GRID ─── */}
                {isLoading ? (
                    <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 space-y-3">
                        <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto" />
                        <h3 className="text-base font-black text-slate-800">Synchronizing Floor Bills...</h3>
                        <p className="text-xs text-slate-500">Loading tables, itemized dishes &amp; kitchen KOT tickets</p>
                    </div>
                ) : processedBills.length === 0 ? (
                    <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 shadow-sm space-y-3">
                        <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl mx-auto shadow-inner">
                            📋
                        </div>
                        <h3 className="text-lg font-black text-slate-800">No Bills Found</h3>
                        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                            {searchQuery
                                ? `No orders matched your search query "${searchQuery}". Clear search or adjust filters.`
                                : `No ${activeTab === 'unpaid' ? 'unpaid' : activeTab === 'paid' ? 'paid' : ''} bills recorded for ${selectedWaiter} in the selected date range.`}
                        </p>
                        <div className="pt-2 flex items-center justify-center gap-3">
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all"
                                >
                                    Clear Search Filter
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setDateScope('open_all')}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black shadow-sm"
                            >
                                ⚡ View All Open Tables Across Floor
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {processedBills.map((bill) => {
                            const isExpanded = expandedBillId === bill.sale_id;
                            const isPaid = bill.status === 'Completed' || bill.status === 'Paid';
                            const tableLabel = bill.table_name || bill.table_no;
                            const elapsed = getElapsedMinutes(bill.sale_datetime);
                            const isPrintingBill = printingBillId === bill.sale_id;
                            const isPrintingKOT = printingKOTId === bill.sale_id;

                            return (
                                <div
                                    key={bill.sale_id}
                                    className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md ${
                                        isPaid
                                            ? 'border-emerald-200 hover:border-emerald-300'
                                            : 'border-amber-300 hover:border-amber-400 bg-gradient-to-r from-amber-50/20 to-white'
                                    }`}
                                >
                                    {/* Card Header Top Row */}
                                    <div
                                        onClick={() => setExpandedBillId(isExpanded ? null : bill.sale_id)}
                                        className="p-4 sm:p-5 cursor-pointer hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                                    >
                                        {/* Left Side: Table & Order Info */}
                                        <div className="flex items-start sm:items-center gap-3.5">
                                            {/* Table / Status Avatar */}
                                            <div
                                                className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm ${
                                                    isPaid
                                                        ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                                                        : 'bg-gradient-to-br from-amber-500 to-orange-600'
                                                }`}
                                            >
                                                <span className="text-sm font-black">
                                                    {tableLabel ? (tableLabel.startsWith('T') ? tableLabel : `T${tableLabel}`) : '📦'}
                                                </span>
                                                <span className="text-[9px] font-bold uppercase opacity-90">
                                                    {tableLabel ? 'Table' : 'Takeout'}
                                                </span>
                                            </div>

                                            {/* Details Block */}
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                                                        {bill.receipt_no}
                                                    </h3>
                                                    {bill.kot_number && (
                                                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md text-[10px] font-black uppercase">
                                                            🍳 {bill.kot_number}
                                                        </span>
                                                    )}
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide flex items-center gap-1 ${
                                                            isPaid
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                                : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                                                        }`}
                                                    >
                                                        <span>{isPaid ? '✓ PAID' : '○ UNPAID / OPEN'}</span>
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium flex-wrap">
                                                    {tableLabel && (
                                                        <span className="font-bold text-slate-700">
                                                            🍽️ Table {tableLabel}
                                                        </span>
                                                    )}
                                                    {bill.customer_name && (
                                                        <span>• Guest: {bill.customer_name}</span>
                                                    )}
                                                    <span>• {bill.items.length} dishes</span>
                                                    <span>• {formatTime(bill.sale_datetime)}</span>
                                                    {elapsed && !isPaid && (
                                                        <span className="text-amber-700 font-black bg-amber-100/70 px-1.5 py-0.2 rounded-md text-[10px]">
                                                            ⏱️ {elapsed}
                                                        </span>
                                                    )}
                                                    {selectedWaiter === 'All' && (
                                                        <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded-md text-[10px]">
                                                            👤 {bill.waiter_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: Total Amount & Action Buttons */}
                                        <div className="flex items-center justify-between md:justify-end gap-3.5 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                                            {/* Amount block */}
                                            <div className="text-left md:text-right">
                                                <p className="text-lg sm:text-xl font-black text-slate-900">
                                                    Ksh {(bill.total_amount || 0).toLocaleString()}
                                                </p>
                                                {isPaid && bill.payment_method && (
                                                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block">
                                                        💳 {bill.payment_method}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Action Control Buttons */}
                                            <div className="flex items-center gap-1.5">
                                                {/* Print Customer Bill */}
                                                <button
                                                    type="button"
                                                    disabled={isPrintingBill}
                                                    onClick={(e) => handlePrintBill(bill, e)}
                                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                    title="Print Pro-Forma Customer Dining Bill"
                                                >
                                                    <span>{isPrintingBill ? '⏳' : '🧾'}</span>
                                                    <span className="hidden sm:inline">Bill</span>
                                                </button>

                                                {/* Reprint Kitchen KOT */}
                                                <button
                                                    type="button"
                                                    disabled={isPrintingKOT}
                                                    onClick={(e) => handleReprintKOT(bill, e)}
                                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                    title="Reprint Kitchen KOT Order Ticket"
                                                >
                                                    <span>{isPrintingKOT ? '⏳' : '🍳'}</span>
                                                    <span className="hidden sm:inline">KOT</span>
                                                </button>

                                                {/* Accordion Toggle Arrow */}
                                                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors ml-1">
                                                    {isExpanded ? '▲' : '▼'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ─── Expandable Itemized Breakdown Accordion ─── */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-200 bg-slate-50/80 p-4 sm:p-5 rounded-b-2xl space-y-3 animate-in fade-in duration-150">
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-200">
                                                <span>Itemized Dishes &amp; Drinks ({bill.items.length})</span>
                                                <span>Subtotal</span>
                                            </div>

                                            {bill.items.length === 0 ? (
                                                <p className="text-xs text-slate-400 py-2 italic text-center">
                                                    No dish details recorded for this sale.
                                                </p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {bill.items.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200/80 text-xs shadow-sm hover:border-blue-200 transition-colors"
                                                        >
                                                            <div className="space-y-0.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-slate-900 text-sm">
                                                                        {item.product_name}
                                                                    </span>
                                                                    {item.batch_number && (
                                                                        <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded font-mono">
                                                                            Batch: {item.batch_number}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-slate-500 font-medium">
                                                                    <span className="font-black text-slate-700">{item.quantity}</span> × Ksh {(item.unit_price || 0).toLocaleString()}
                                                                </p>
                                                                {item.notes && (
                                                                    <p className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-semibold inline-block border border-amber-200/60">
                                                                        🏷️ Modifiers: {item.notes}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <span className="font-black text-slate-900 text-sm">
                                                                Ksh {(item.subtotal || item.quantity * item.unit_price).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Order Notes (if any) */}
                                            {bill.order_notes && (
                                                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 font-medium">
                                                    <span className="font-bold uppercase tracking-wider text-[10px] block text-amber-800">Special Order Instructions:</span>
                                                    {bill.order_notes}
                                                </div>
                                            )}

                                            {/* Bottom Summary & Return to POS */}
                                            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={`/dashboard/pos?table=${tableLabel || ''}&receiptNo=${bill.receipt_no}`}
                                                        className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm"
                                                    >
                                                        <span>🛒</span>
                                                        <span>Open on POS Floor (Table {tableLabel || 'N/A'})</span>
                                                    </a>
                                                </div>

                                                <div className="text-right space-y-0.5">
                                                    <p className="text-xs text-slate-500 font-bold">
                                                        Total Check Amount
                                                    </p>
                                                    <p className="text-xl font-black text-slate-900">
                                                        Ksh {(bill.total_amount || 0).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
