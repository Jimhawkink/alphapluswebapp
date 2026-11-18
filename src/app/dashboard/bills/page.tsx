'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { generateCustomerBillHTML, printReceipt, loadCompanyInfo, createReceiptData } from '@/lib/receiptPrinter';

// ── Types ────────────────────────────────────────────────────────────────────
interface SaleItem {
    item_id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price?: number;
    discount?: number;
    subtotal: number;
    notes?: string;
}

interface Bill {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    shift_id?: number;
    shift_name?: string;
    waiter_id?: number;
    waiter_name?: string;
    table_id?: number;
    table_name?: string;
    table_no?: string;
    order_type?: string;
    kot_number?: string;
    customer_name?: string;
    customer_phone?: string;
    subtotal: number;
    discount: number;
    tax_amount: number;
    total_amount: number;
    payment_method: string;
    amount_paid: number;
    change_amount: number;
    mpesa_code?: string;
    mpesa_receipt?: string;
    status: string; // 'Paid', 'Completed', 'Pending', 'Cancelled'
    notes?: string;
    created_by?: string;
    paid_at?: string;
    updated_at?: string;
    items?: SaleItem[];
    // M-Pesa transaction extras if available
    mpesa_status?: string;
    mpesa_result_desc?: string;
    mpesa_phone?: string;
    is_cashier_verified?: boolean;
}

export default function CashierBillsPage() {
    const [bills, setBills] = useState<Bill[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLiveSync, setIsLiveSync] = useState(true);
    const [lastSyncTime, setLastSyncTime] = useState<string>('');
    const [verifiedIds, setVerifiedIds] = useState<Record<number, boolean>>({});

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'MPESA_SUCCESS' | 'MPESA_FAILED' | 'VERIFIED' | 'UNVERIFIED'>('ALL');
    const [waiterFilter, setWaiterFilter] = useState('ALL');
    const [datePreset, setDatePreset] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'CUSTOM'>('TODAY');
    const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
    const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');

    // Selected bill for slide-in drawer
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

    // Track previous paid bills to trigger audio/visual notifications on new payment
    const prevPaidCountRef = useRef<number>(0);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // ── Load Cashier Verification State from localStorage ────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem('cashier_verified_bills');
            if (saved) {
                setVerifiedIds(JSON.parse(saved));
            }
        } catch { }
    }, []);

    const toggleVerification = (saleId: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setVerifiedIds(prev => {
            const updated = { ...prev, [saleId]: !prev[saleId] };
            try {
                localStorage.setItem('cashier_verified_bills', JSON.stringify(updated));
            } catch { }
            if (updated[saleId]) {
                toast.success(`🛡️ Bill verified & received at cashier exit!`);
            } else {
                toast('Verification marked as pending', { icon: 'ℹ️' });
            }
            return updated;
        });
    };

    // ── Date Preset Handler ──────────────────────────────────────────────────
    const applyDatePreset = (preset: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'CUSTOM') => {
        setDatePreset(preset);
        const today = new Date();
        if (preset === 'TODAY') {
            const d = today.toISOString().split('T')[0];
            setDateFrom(d);
            setDateTo(d);
        } else if (preset === 'YESTERDAY') {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            const d = y.toISOString().split('T')[0];
            setDateFrom(d);
            setDateTo(d);
        } else if (preset === 'WEEK') {
            const w = new Date(today);
            w.setDate(w.getDate() - 7);
            setDateFrom(w.toISOString().split('T')[0]);
            setDateTo(today.toISOString().split('T')[0]);
        }
    };

    // ── Load Bills from Supabase ─────────────────────────────────────────────
    const fetchBills = useCallback(async (isBackground = false) => {
        if (!isBackground) setIsLoading(true);
        try {
            // Fetch sales within date range
            let query = supabase
                .from('sales')
                .select('*')
                .order('sale_id', { ascending: false });

            if (dateFrom) query = query.gte('sale_date', dateFrom);
            if (dateTo) query = query.lte('sale_date', dateTo);

            const { data: salesData, error: salesError } = await query;
            if (salesError) throw salesError;

            // Fetch recent sales_items for these sales
            const saleIds = (salesData || []).map(s => s.sale_id);
            let itemsBySaleId: Record<number, SaleItem[]> = {};

            if (saleIds.length > 0) {
                // Chunk to prevent overly long query
                const first50Ids = saleIds.slice(0, 50);
                const { data: itemsData } = await supabase
                    .from('sales_items')
                    .select('*')
                    .in('sale_id', first50Ids);

                if (itemsData) {
                    itemsData.forEach((it: any) => {
                        if (!itemsBySaleId[it.sale_id]) itemsBySaleId[it.sale_id] = [];
                        itemsBySaleId[it.sale_id].push({
                            item_id: it.item_id,
                            product_id: it.product_id,
                            product_name: it.product_name,
                            quantity: it.quantity,
                            unit_price: it.unit_price,
                            subtotal: it.subtotal,
                            notes: it.notes
                        });
                    });
                }
            }

            // Map and format bills
            const formatted: Bill[] = (salesData || []).map(s => {
                const isPaid = s.status === 'Paid' || s.status === 'Completed' || ((s.amount_paid || 0) >= (s.total_amount || 0) && (s.total_amount || 0) > 0);
                return {
                    sale_id: s.sale_id,
                    receipt_no: s.receipt_no,
                    sale_date: s.sale_date,
                    sale_time: s.sale_time || (s.sale_datetime ? new Date(s.sale_datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''),
                    sale_datetime: s.sale_datetime || s.created_at,
                    shift_id: s.shift_id,
                    shift_name: s.shift_name,
                    waiter_id: s.waiter_id,
                    waiter_name: s.waiter_name || 'Counter Staff',
                    table_id: s.table_id,
                    table_name: s.table_name || s.table_no || 'Counter',
                    table_no: s.table_no,
                    order_type: s.order_type || 'Dine-In',
                    kot_number: s.kot_number,
                    customer_name: s.customer_name || 'Walk-in Guest',
                    customer_phone: s.customer_phone || '',
                    subtotal: Number(s.subtotal || s.total_amount || 0),
                    discount: Number(s.discount || 0),
                    tax_amount: Number(s.tax_amount || s.total_tax || 0),
                    total_amount: Number(s.total_amount || 0),
                    payment_method: s.payment_method || (isPaid ? 'M-Pesa' : 'Unpaid'),
                    amount_paid: Number(s.amount_paid || (isPaid ? s.total_amount : 0)),
                    change_amount: Number(s.change_amount || 0),
                    mpesa_code: s.mpesa_code || s.mpesa_receipt || s.mpesa_receipt_number,
                    status: isPaid ? 'Paid' : (s.status || 'Pending'),
                    notes: s.notes,
                    created_by: s.created_by,
                    paid_at: s.paid_at || s.updated_at,
                    updated_at: s.updated_at,
                    items: itemsBySaleId[s.sale_id] || [],
                    is_cashier_verified: false
                };
            });

            // Detect new payments for live chime
            const currentPaidCount = formatted.filter(b => b.status === 'Paid').length;
            if (prevPaidCountRef.current > 0 && currentPaidCount > prevPaidCountRef.current) {
                const newestPaid = formatted.find(b => b.status === 'Paid');
                toast.success(
                    `🔔 NEW PAYMENT CONFIRMED!\nBill #${newestPaid?.receipt_no} (Ksh ${newestPaid?.total_amount.toLocaleString()}) paid via ${newestPaid?.payment_method}!`,
                    { duration: 6000, icon: '💰' }
                );
            }
            prevPaidCountRef.current = currentPaidCount;

            setBills(formatted);
            setLastSyncTime(new Date().toLocaleTimeString('en-GB'));
        } catch (err) {
            console.error('Error loading bills:', err);
            if (!isBackground) toast.error('Failed to load bills');
        } finally {
            if (!isBackground) setIsLoading(false);
        }
    }, [dateFrom, dateTo]);

    // Initial load and live sync polling (every 4 seconds)
    useEffect(() => {
        fetchBills(false);
        if (isLiveSync) {
            pollIntervalRef.current = setInterval(() => {
                fetchBills(true);
            }, 4000);
        }
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [fetchBills, isLiveSync]);

    // ── Waiters list dynamically derived from bills ──────────────────────────
    const waitersList = useMemo(() => {
        const unique = new Set<string>();
        bills.forEach(b => {
            if (b.waiter_name && b.waiter_name !== 'Counter Staff') {
                unique.add(b.waiter_name);
            }
        });
        return Array.from(unique).sort();
    }, [bills]);

    // ── Filtered Bills ───────────────────────────────────────────────────────
    const filteredBills = useMemo(() => {
        return bills.filter(bill => {
            const isVerified = Boolean(verifiedIds[bill.sale_id] || bill.notes?.includes('[VERIFIED_EXIT]'));
            const isPaid = bill.status === 'Paid' || bill.status === 'Completed';
            const isMpesa = bill.payment_method?.toLowerCase().includes('mpesa') || Boolean(bill.mpesa_code);

            // Status filter
            if (statusFilter === 'PAID' && !isPaid) return false;
            if (statusFilter === 'PENDING' && isPaid) return false;
            if (statusFilter === 'MPESA_SUCCESS' && (!isPaid || !isMpesa)) return false;
            if (statusFilter === 'MPESA_FAILED' && (!isMpesa || isPaid)) return false;
            if (statusFilter === 'VERIFIED' && !isVerified) return false;
            if (statusFilter === 'UNVERIFIED' && isVerified) return false;

            // Waiter filter
            if (waiterFilter !== 'ALL' && bill.waiter_name !== waiterFilter) return false;

            // Search query filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchReceipt = bill.receipt_no.toLowerCase().includes(q);
                const matchMpesa = (bill.mpesa_code || '').toLowerCase().includes(q);
                const matchPhone = (bill.customer_phone || '').toLowerCase().includes(q);
                const matchCustomer = (bill.customer_name || '').toLowerCase().includes(q);
                const matchWaiter = (bill.waiter_name || '').toLowerCase().includes(q);
                const matchTable = (bill.table_name || '').toLowerCase().includes(q);
                if (!matchReceipt && !matchMpesa && !matchPhone && !matchCustomer && !matchWaiter && !matchTable) {
                    return false;
                }
            }

            return true;
        });
    }, [bills, statusFilter, waiterFilter, searchQuery, verifiedIds]);

    // ── KPI Summary Calculations ─────────────────────────────────────────────
    const kpis = useMemo(() => {
        const totalBillsCount = bills.length;
        const paidBills = bills.filter(b => b.status === 'Paid' || b.status === 'Completed');
        const pendingBills = bills.filter(b => b.status === 'Pending');
        const mpesaPaidBills = paidBills.filter(b => b.payment_method?.toLowerCase().includes('mpesa') || Boolean(b.mpesa_code));
        const cashCardPaidBills = paidBills.filter(b => !b.payment_method?.toLowerCase().includes('mpesa') && !b.mpesa_code);
        const verifiedCount = bills.filter(b => verifiedIds[b.sale_id]).length;

        const totalRevenue = paidBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);
        const mpesaTotal = mpesaPaidBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);
        const pendingTotal = pendingBills.reduce((acc, b) => acc + Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0)), 0);
        const cashCardTotal = cashCardPaidBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);

        return {
            totalBillsCount,
            totalRevenue,
            paidCount: paidBills.length,
            mpesaCount: mpesaPaidBills.length,
            mpesaTotal,
            pendingCount: pendingBills.length,
            pendingTotal,
            cashCardCount: cashCardPaidBills.length,
            cashCardTotal,
            verifiedCount
        };
    }, [bills, verifiedIds]);

    // ── Print Actions ────────────────────────────────────────────────────────
    const handlePrint = async (bill: Bill, isPaidReceipt: boolean) => {
        setIsPrinting(true);
        try {
            const company = await loadCompanyInfo();
            const receiptData = createReceiptData(
                bill.receipt_no,
                (bill.items && bill.items.length > 0 ? bill.items : [{
                    product_name: 'Bill Total',
                    quantity: 1,
                    unit_price: bill.total_amount,
                    subtotal: bill.total_amount,
                    item_id: 1,
                    product_id: 1
                }]).map(item => ({
                    name: item.product_name,
                    qty: item.quantity,
                    price: item.unit_price,
                    notes: item.notes,
                    discount: item.discount || 0
                })),
                isPaidReceipt ? (bill.payment_method || 'Paid') : 'Pending (M-Pesa / Cash)',
                bill.amount_paid || 0,
                bill.waiter_name || 'Cashier',
                {
                    customerName: bill.customer_name || 'Walk-in Guest',
                    mpesaReceipt: bill.mpesa_code,
                    tableNo: bill.table_name,
                    orderNotes: bill.notes,
                    discount: bill.discount || 0,
                    isPaid: isPaidReceipt,
                    taxMode: 'inclusive',
                    vatRate: 16,
                    levyRate: 2,
                    hotelName: company.name
                }
            );
            const html = await generateCustomerBillHTML(receiptData, company, isPaidReceipt);
            printReceipt(html);
            toast.success(isPaidReceipt ? '🖨️ Receipt sent to thermal printer!' : '🖨️ Customer Bill printed!');
        } catch (err) {
            console.error('Printing error:', err);
            toast.error('Failed to print');
        } finally {
            setIsPrinting(false);
        }
    };

    // ── Cashier Direct Settle ────────────────────────────────────────────────
    const handleMarkAsCashPaid = async (bill: Bill) => {
        if (!confirm(`Mark Bill #${bill.receipt_no} as Paid in Cash (Ksh ${bill.total_amount.toLocaleString()})?`)) return;
        try {
            const { error } = await supabase
                .from('sales')
                .update({
                    status: 'Paid',
                    payment_method: 'Cash',
                    amount_paid: bill.total_amount,
                    paid_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('sale_id', bill.sale_id);

            if (error) throw error;
            toast.success(`✅ Bill #${bill.receipt_no} marked as Cash Paid!`);
            fetchBills(true);
        } catch (err) {
            console.error('Error settling bill:', err);
            toast.error('Failed to settle bill');
        }
    };

    return (
        <div className="space-y-3.5 pb-16 font-sans">
            {/* ── 1. ULTRA SLEEK EXECUTIVE HEADER (Matching tax-settings style) ─────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-2.5 border-b border-gray-200/80">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <span>🧾</span> Cashier Checkout Desk
                        </h1>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            Exit Control & Verification
                        </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Monitor real-time customer QR M-Pesa payments, verify bills handed over at exit, and manage checkout clearing
                    </p>
                </div>

                {/* Header Action Buttons & Status */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setIsLiveSync(!isLiveSync)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border ${
                            isLiveSync
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-xs hover:bg-emerald-100'
                                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                        <span className={`w-2 h-2 rounded-full ${isLiveSync ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                        {isLiveSync ? 'Live Sync Active' : 'Live Sync Paused'}
                    </button>

                    <button
                        onClick={() => fetchBills(false)}
                        className="px-3 py-1.5 bg-white hover:bg-gray-50 active:scale-95 border border-gray-200/80 text-gray-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                        title="Refresh bills now"
                    >
                        <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
                        Refresh {lastSyncTime && <span className="text-gray-400 text-[10px]">({lastSyncTime})</span>}
                    </button>

                    <a
                        href="/dashboard/bill-payment"
                        className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:scale-105"
                    >
                        <span>💳</span>
                        <span>Payment Terminal</span>
                    </a>

                    {/* System Online Badge & Notification */}
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Online</span>
                    </div>
                    <button
                        aria-label="Notification bell"
                        className="relative p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors border border-gray-200/80"
                    >
                        <span className="text-sm">🔔</span>
                        {kpis.pendingCount > 0 && (
                            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                        )}
                    </button>
                </div>
            </div>

            {/* ── 2. REFINED EXECUTIVE KPI CARDS (Matching tax-settings Style) ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Today's Revenue */}
                <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        <span>Total Paid</span>
                        <span>💰</span>
                    </div>
                    <div className="text-lg font-bold text-gray-800 font-mono tracking-tight">
                        Ksh {kpis.totalRevenue.toLocaleString()}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span>✓</span> {kpis.paidCount} settled
                    </div>
                </div>

                {/* 2. M-Pesa Paid */}
                <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        <span>M-Pesa Verified</span>
                        <span>📱</span>
                    </div>
                    <div className="text-lg font-bold text-emerald-700 font-mono tracking-tight">
                        Ksh {kpis.mpesaTotal.toLocaleString()}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
                        <span>⚡</span> {kpis.mpesaCount} QR pay
                    </div>
                </div>

                {/* 3. Pending Unpaid */}
                <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        <span>Pending Unpaid</span>
                        <span>⏳</span>
                    </div>
                    <div className="text-lg font-bold text-amber-700 font-mono tracking-tight">
                        Ksh {kpis.pendingTotal.toLocaleString()}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <span>⚠️</span> {kpis.pendingCount} at tables
                    </div>
                </div>

                {/* 4. Cashier Verified Handed Over */}
                <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        <span>Handed at Exit</span>
                        <span>🛡️</span>
                    </div>
                    <div className="text-lg font-bold text-purple-700 font-mono tracking-tight">
                        {kpis.verifiedCount}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        <span>☑</span> Verified by Exit
                    </div>
                </div>

                {/* 5. Cash / Card Paid */}
                <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        <span>Cash / Card</span>
                        <span>💵</span>
                    </div>
                    <div className="text-lg font-bold text-indigo-700 font-mono tracking-tight">
                        Ksh {kpis.cashCardTotal.toLocaleString()}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <span>💳</span> {kpis.cashCardCount} counter bills
                    </div>
                </div>

                {/* 6. Total Bills Count */}
                <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        <span>Total Bills</span>
                        <span>📋</span>
                    </div>
                    <div className="text-lg font-bold text-gray-800 font-mono tracking-tight">
                        {kpis.totalBillsCount}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                        <span>📅</span> Selected Range
                    </div>
                </div>
            </div>

            {/* ── 3. REFINED FILTER BAR ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-200/80 space-y-3">
                {/* Search Bar + Presets + View Toggle */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400 text-xs">
                            🔍
                        </span>
                        <input
                            type="text"
                            placeholder="Search Receipt No, M-Pesa Code, Phone, Waiter, Table, Customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all font-medium"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 text-xs"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Waiter Dropdown */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">👨‍🍳 Waiter:</span>
                        <select
                            value={waiterFilter}
                            onChange={(e) => setWaiterFilter(e.target.value)}
                            className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:border-purple-500"
                        >
                            <option value="ALL">All Waiters & Staff</option>
                            {waitersList.map(w => (
                                <option key={w} value={w}>{w}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Presets */}
                    <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-xl">
                        {(['TODAY', 'YESTERDAY', 'WEEK', 'CUSTOM'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => applyDatePreset(p)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    datePreset === p
                                        ? 'bg-white text-purple-700 shadow-xs font-bold'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {p === 'TODAY' && 'Today'}
                                {p === 'YESTERDAY' && 'Yesterday'}
                                {p === 'WEEK' && 'Last 7D'}
                                {p === 'CUSTOM' && 'Custom'}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Inputs if CUSTOM is active */}
                    {datePreset === 'CUSTOM' && (
                        <div className="flex items-center gap-1.5">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700"
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700"
                            />
                        </div>
                    )}

                    {/* View Switcher: Cards vs Table */}
                    <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-xl">
                        <button
                            onClick={() => setViewMode('CARDS')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                viewMode === 'CARDS'
                                    ? 'bg-white text-purple-700 shadow-xs font-bold'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <span>🎴</span>
                            <span>Cards</span>
                        </button>
                        <button
                            onClick={() => setViewMode('TABLE')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                viewMode === 'TABLE'
                                    ? 'bg-white text-purple-700 shadow-xs font-bold'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <span>📊</span>
                            <span>Table</span>
                        </button>
                    </div>
                </div>

                {/* Filter Status Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-gray-100">
                    <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mr-1">Status:</span>
                    {[
                        { id: 'ALL', label: 'All Bills', count: bills.length, color: 'bg-gray-100 text-gray-700' },
                        { id: 'PAID', label: '✅ Paid & Cleared', count: kpis.paidCount, color: 'bg-emerald-50 text-emerald-800' },
                        { id: 'MPESA_SUCCESS', label: '⚡ M-Pesa QR Success', count: kpis.mpesaCount, color: 'bg-green-50 text-green-800' },
                        { id: 'PENDING', label: '⏳ Unpaid at Table', count: kpis.pendingCount, color: 'bg-amber-50 text-amber-800' },
                        { id: 'VERIFIED', label: '🛡️ Handed & Verified', count: kpis.verifiedCount, color: 'bg-purple-50 text-purple-800' },
                        { id: 'UNVERIFIED', label: '⚠️ Exit Unverified', count: Math.max(0, kpis.paidCount - kpis.verifiedCount), color: 'bg-rose-50 text-rose-800' },
                    ].map(st => (
                        <button
                            key={st.id}
                            onClick={() => setStatusFilter(st.id as any)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                statusFilter === st.id
                                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200/80'
                            }`}
                        >
                            <span>{st.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${statusFilter === st.id ? 'bg-white/20 text-white' : st.color}`}>
                                {st.count}
                            </span>
                        </button>
                    ))}

                    <span className="ml-auto text-xs font-medium text-gray-500">
                        Showing <strong className="text-gray-800 font-bold">{filteredBills.length}</strong> bills
                    </span>
                </div>
            </div>

            {/* ── 4. MAIN BILLS DISPLAY ───────────────────────────────────────── */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                    <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                    <p className="mt-3 text-xs font-semibold text-gray-600">Loading cashier bills desk...</p>
                </div>
            ) : filteredBills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 bg-white rounded-2xl border border-gray-200/80 shadow-sm text-center p-6">
                    <span className="text-4xl mb-2">🔍</span>
                    <h3 className="text-base font-bold text-gray-800">No bills match your current filters</h3>
                    <p className="text-xs text-gray-500 max-w-md mt-0.5">
                        Try resetting your search query or picking a broader date range.
                    </p>
                    <button
                        onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setWaiterFilter('ALL'); applyDatePreset('TODAY'); }}
                        className="mt-3 px-3.5 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs rounded-xl transition-all border border-purple-200"
                    >
                        Reset All Filters
                    </button>
                </div>
            ) : viewMode === 'CARDS' ? (
                /* ── CARDS VIEW: REFINED BILL CARDS ─────── */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredBills.map(bill => {
                        const isPaid = bill.status === 'Paid' || bill.status === 'Completed';
                        const isVerified = Boolean(verifiedIds[bill.sale_id] || bill.notes?.includes('[VERIFIED_EXIT]'));
                        const isMpesa = bill.payment_method?.toLowerCase().includes('mpesa') || Boolean(bill.mpesa_code);

                        return (
                            <div
                                key={bill.sale_id}
                                onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md bg-white border flex flex-col justify-between ${
                                    isVerified
                                        ? 'border-purple-300 ring-2 ring-purple-100'
                                        : isPaid
                                            ? 'border-emerald-200 hover:border-emerald-300'
                                            : 'border-amber-200 hover:border-amber-300 bg-amber-50/10'
                                }`}
                            >
                                {/* Top Badges */}
                                <div>
                                    <div className="flex items-start justify-between gap-2 mb-2.5">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-bold text-gray-800 group-hover:text-purple-700 transition-colors">
                                                    #{bill.receipt_no}
                                                </span>
                                                {isVerified && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
                                                        <span>🛡️</span> VERIFIED EXIT
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] font-medium text-gray-500 mt-0.5">
                                                🕐 {bill.sale_time || 'Just now'} • {bill.sale_date}
                                            </p>
                                        </div>

                                        {/* Status Badge */}
                                        <div>
                                            {isPaid ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    {isMpesa ? 'PAID • M-PESA' : `PAID • ${bill.payment_method.toUpperCase()}`}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    UNPAID (TABLE)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amount Box */}
                                    <div className="bg-gray-50/80 rounded-xl p-2.5 mb-2.5 border border-gray-100 flex items-baseline justify-between">
                                        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Bill Amount</span>
                                        <span className={`text-lg font-bold font-mono tracking-tight ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            Ksh {bill.total_amount.toLocaleString()}
                                        </span>
                                    </div>

                                    {/* M-PESA CODE & VERIFICATION BOX */}
                                    {isMpesa && bill.mpesa_code && (
                                        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-2.5 mb-2.5 shadow-2xs">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                                                    <span>⚡</span> M-Pesa Transaction
                                                </div>
                                                <span className="text-[10px] font-semibold text-emerald-700 bg-white px-1.5 py-0.2 rounded border border-emerald-200">
                                                    ✓ Verified
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-sm font-bold font-mono text-emerald-900 tracking-wider">
                                                {bill.mpesa_code}
                                            </div>
                                            {bill.customer_phone && (
                                                <p className="text-[10px] font-medium text-gray-600 mt-0.5">
                                                    Customer: <span className="font-mono font-bold text-gray-800">{bill.customer_phone}</span>
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Staff & Table Info */}
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-2.5">
                                        <div className="bg-gray-50/80 p-2 rounded-xl border border-gray-100">
                                            <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider block">Served By</span>
                                            <span className="font-semibold text-gray-800 truncate block mt-0.5">
                                                👨‍🍳 {bill.waiter_name}
                                            </span>
                                        </div>
                                        <div className="bg-gray-50/80 p-2 rounded-xl border border-gray-100">
                                            <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider block">Table / Room</span>
                                            <span className="font-semibold text-gray-800 truncate block mt-0.5">
                                                🪑 {bill.table_name}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Items Preview */}
                                    {bill.items && bill.items.length > 0 && (
                                        <div className="text-[11px] text-gray-500 mb-2.5 bg-gray-50/70 p-2 rounded-xl border border-gray-100">
                                            <span className="font-semibold text-gray-700 block mb-0.5">
                                                🍽️ Order Items ({bill.items.length}):
                                            </span>
                                            <p className="line-clamp-2 leading-relaxed text-gray-600">
                                                {bill.items.map(it => `${it.quantity}× ${it.product_name}`).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* ── CASHIER VERIFICATION CHECKBOX & ACTIONS ──── */}
                                <div className="pt-2.5 border-t border-gray-100 space-y-2">
                                    <label
                                        onClick={(e) => toggleVerification(bill.sale_id, e)}
                                        className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer ${
                                            isVerified
                                                ? 'bg-purple-50 border-purple-300 text-purple-900 font-semibold'
                                                : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700 font-medium'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isVerified}
                                            onChange={() => {}}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                                        />
                                        <span className="text-xs">
                                            {isVerified
                                                ? '✓ Bill Handed & Verified at Exit'
                                                : 'Mark Bill Handed Over & Verified'}
                                        </span>
                                    </label>

                                    {/* Quick Actions Row */}
                                    <div className="flex items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                                        {!isPaid && (
                                            <button
                                                onClick={() => handleMarkAsCashPaid(bill)}
                                                className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1"
                                                title="Customer paying cash right now at cashier desk"
                                            >
                                                <span>💵</span>
                                                <span>Collect Cash</span>
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handlePrint(bill, isPaid)}
                                            disabled={isPrinting}
                                            className="py-1.5 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1"
                                            title="Print Thermal Receipt"
                                        >
                                            <span>🖨️</span>
                                            <span>Print</span>
                                        </button>

                                        <a
                                            href={`/pay/${encodeURIComponent(bill.receipt_no)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-1.5 px-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs rounded-xl border border-purple-200 transition-all flex items-center justify-center gap-1"
                                            title="View Customer QR Pay Link"
                                        >
                                            <span>📱</span>
                                            <span>QR</span>
                                        </a>

                                        <button
                                            onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                            className="py-1.5 px-3 bg-gray-800 hover:bg-gray-900 text-white font-semibold text-xs rounded-xl transition-all ml-auto"
                                        >
                                            Details →
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* ── TABLE VIEW: REFINED DATAGRID ───────────────────────── */
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white uppercase text-[11px] tracking-wider font-semibold">
                                    <th className="py-3 px-3.5 text-center">Verify Exit</th>
                                    <th className="py-3 px-3.5">Receipt No</th>
                                    <th className="py-3 px-3.5">Date / Time</th>
                                    <th className="py-3 px-3.5">Served By</th>
                                    <th className="py-3 px-3.5">Table</th>
                                    <th className="py-3 px-3.5 text-right">Amount</th>
                                    <th className="py-3 px-3.5 text-center">Status</th>
                                    <th className="py-3 px-3.5">Payment / M-Pesa Code</th>
                                    <th className="py-3 px-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredBills.map((bill, idx) => {
                                    const isPaid = bill.status === 'Paid' || bill.status === 'Completed';
                                    const isVerified = Boolean(verifiedIds[bill.sale_id] || bill.notes?.includes('[VERIFIED_EXIT]'));
                                    const isMpesa = bill.payment_method?.toLowerCase().includes('mpesa') || Boolean(bill.mpesa_code);

                                    return (
                                        <tr
                                            key={bill.sale_id}
                                            onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                            className={`hover:bg-purple-50/20 transition-colors cursor-pointer ${
                                                isVerified ? 'bg-purple-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                                            }`}
                                        >
                                            {/* Cashier Handover Checkbox */}
                                            <td className="py-3 px-3.5 text-center" onClick={(e) => toggleVerification(bill.sale_id, e)}>
                                                <input
                                                    type="checkbox"
                                                    checked={isVerified}
                                                    onChange={() => {}}
                                                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                                                />
                                            </td>

                                            {/* Receipt No */}
                                            <td className="py-3 px-3.5 font-mono font-bold text-gray-800">
                                                #{bill.receipt_no}
                                            </td>

                                            {/* Date / Time */}
                                            <td className="py-3 px-3.5 text-gray-600">
                                                <div className="font-semibold text-gray-800">{bill.sale_time || '-'}</div>
                                                <div className="text-[10px] text-gray-400">{bill.sale_date}</div>
                                            </td>

                                            {/* Served By */}
                                            <td className="py-3 px-3.5 font-medium text-gray-800">
                                                👨‍🍳 {bill.waiter_name}
                                            </td>

                                            {/* Table */}
                                            <td className="py-3 px-3.5 font-medium text-gray-700">
                                                🪑 {bill.table_name}
                                            </td>

                                            {/* Amount */}
                                            <td className="py-3 px-3.5 text-right font-mono font-bold text-xs text-gray-900">
                                                Ksh {bill.total_amount.toLocaleString()}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-3 px-3.5 text-center">
                                                {isPaid ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        <span>✓</span> PAID
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                                        <span>⏳</span> UNPAID
                                                    </span>
                                                )}
                                            </td>

                                            {/* M-Pesa / Method */}
                                            <td className="py-3 px-3.5">
                                                {bill.mpesa_code ? (
                                                    <div>
                                                        <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                            {bill.mpesa_code}
                                                        </span>
                                                        {bill.customer_phone && (
                                                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                                {bill.customer_phone}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="font-medium text-gray-600">
                                                        {bill.payment_method || 'Cash'}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handlePrint(bill, isPaid)}
                                                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors"
                                                        title="Print"
                                                    >
                                                        🖨️
                                                    </button>
                                                    <a
                                                        href={`/pay/${encodeURIComponent(bill.receipt_no)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1 hover:bg-purple-100 rounded-lg text-purple-700 transition-colors"
                                                        title="QR Page"
                                                    >
                                                        📱
                                                    </a>
                                                    <button
                                                        onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                                        className="px-2 py-1 bg-gray-800 text-white font-semibold rounded-lg text-[10px]"
                                                    >
                                                        View
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 5. SLIDE-IN BILL DETAILS DRAWER ─────────────────────────────── */}
            {isDrawerOpen && selectedBill && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-all">
                    <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="p-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white sticky top-0 z-10">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[10px] uppercase font-semibold tracking-wider text-purple-200">
                                        Cashier Bill Verification
                                    </span>
                                    <h2 className="text-xl font-bold font-mono tracking-tight text-white mt-0.5">
                                        #{selectedBill.receipt_no}
                                    </h2>
                                    <p className="text-xs text-purple-200/80 mt-0.5">
                                        {selectedBill.sale_date} at {selectedBill.sale_time || '-'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsDrawerOpen(false)}
                                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xs"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Status Header Pill */}
                            <div className="mt-3 flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                                    selectedBill.status === 'Paid'
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                }`}>
                                    <span>{selectedBill.status === 'Paid' ? '✓' : '⏳'}</span>
                                    {selectedBill.status === 'Paid' ? 'PAID IN FULL' : 'PENDING PAYMENT'}
                                </span>

                                {verifiedIds[selectedBill.sale_id] && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center gap-1">
                                        <span>🛡️</span> HANDED OVER & VERIFIED
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Drawer Body */}
                        <div className="p-5 space-y-4 flex-1">
                            {/* Handover Checkbox Button */}
                            <div
                                onClick={() => toggleVerification(selectedBill.sale_id)}
                                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                                    verifiedIds[selectedBill.sale_id]
                                        ? 'bg-purple-50 border-purple-300 text-purple-900'
                                        : 'bg-gray-50 border-gray-200 hover:border-gray-300 text-gray-800'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(verifiedIds[selectedBill.sale_id])}
                                        onChange={() => {}}
                                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                    />
                                    <div>
                                        <p className="font-bold text-xs text-gray-800">
                                            {verifiedIds[selectedBill.sale_id]
                                                ? '✓ Verified at Cashier Exit'
                                                : 'Verify Customer Handover at Exit'}
                                        </p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            {verifiedIds[selectedBill.sale_id]
                                                ? 'Customer handed over physical receipt upon exit.'
                                                : 'Check this box when customer hands over physical bill.'}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-lg">🛡️</span>
                            </div>

                            {/* M-Pesa Transaction Audit Details */}
                            {selectedBill.mpesa_code && (
                                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-3.5 shadow-2xs">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                                            <span>⚡</span> M-Pesa Payment Details
                                        </span>
                                        <span className="text-[10px] font-semibold text-emerald-700 bg-white px-1.5 py-0.2 rounded border border-emerald-200">
                                            ✓ Verified Code
                                        </span>
                                    </div>
                                    <div className="text-xl font-bold font-mono text-emerald-950 tracking-wider mb-1.5">
                                        {selectedBill.mpesa_code}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 pt-1.5 border-t border-emerald-200/60">
                                        <div>
                                            <span className="text-[10px] text-gray-400 uppercase font-semibold block">Phone</span>
                                            <span className="font-mono font-bold text-gray-800">{selectedBill.customer_phone || 'Verified'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 uppercase font-semibold block">Paid Time</span>
                                            <span className="font-semibold text-gray-800">{selectedBill.paid_at || selectedBill.sale_time}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Service Details Grid */}
                            <div className="grid grid-cols-2 gap-2.5 text-xs">
                                <div className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                                    <span className="text-[10px] text-gray-400 uppercase font-semibold block">Served By (Waiter)</span>
                                    <span className="font-semibold text-gray-800 text-xs block mt-0.5">
                                        👨‍🍳 {selectedBill.waiter_name}
                                    </span>
                                </div>
                                <div className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                                    <span className="text-[10px] text-gray-400 uppercase font-semibold block">Table / Location</span>
                                    <span className="font-semibold text-gray-800 text-xs block mt-0.5">
                                        🪑 {selectedBill.table_name}
                                    </span>
                                </div>
                                <div className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                                    <span className="text-[10px] text-gray-400 uppercase font-semibold block">Customer</span>
                                    <span className="font-semibold text-gray-800 text-xs block mt-0.5">
                                        👤 {selectedBill.customer_name}
                                    </span>
                                </div>
                                <div className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                                    <span className="text-[10px] text-gray-400 uppercase font-semibold block">Payment Method</span>
                                    <span className="font-semibold text-gray-800 text-xs block mt-0.5">
                                        💳 {selectedBill.payment_method}
                                    </span>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="bg-white rounded-2xl border border-gray-200 p-3.5">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">
                                    🍽️ Bill Items & Breakdown
                                </h4>
                                {selectedBill.items && selectedBill.items.length > 0 ? (
                                    <div className="divide-y divide-gray-100 text-xs">
                                        {selectedBill.items.map((it, i) => (
                                            <div key={i} className="py-1.5 flex justify-between items-center">
                                                <div>
                                                    <span className="font-semibold text-gray-800">{it.quantity}× {it.product_name}</span>
                                                    {it.notes && <p className="text-[10px] text-amber-600 italic">📝 {it.notes}</p>}
                                                </div>
                                                <span className="font-mono font-bold text-gray-900">
                                                    Ksh {it.subtotal.toFixed(2)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 py-1.5">Item details loaded from total amount.</p>
                                )}

                                <div className="mt-2.5 pt-2.5 border-t border-gray-200 space-y-1 text-xs">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Subtotal:</span>
                                        <span className="font-mono">Ksh {selectedBill.subtotal.toFixed(2)}</span>
                                    </div>
                                    {selectedBill.discount > 0 && (
                                        <div className="flex justify-between text-emerald-600 font-medium">
                                            <span>Discount:</span>
                                            <span className="font-mono">-Ksh {selectedBill.discount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100">
                                        <span>Total Amount:</span>
                                        <span className="font-mono text-emerald-700">Ksh {selectedBill.total_amount.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Privacy Lock Reminder */}
                            <div className="bg-gray-50 rounded-xl p-2.5 text-xs text-gray-600 leading-relaxed border border-gray-200">
                                🔒 <strong>Privacy Protection Active:</strong> When customers scan the physical receipt QR code after payment, order items and server details are automatically locked and hidden.
                            </div>
                        </div>

                        {/* Drawer Footer Actions */}
                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center gap-2 sticky bottom-0">
                            <button
                                onClick={() => handlePrint(selectedBill, selectedBill.status === 'Paid')}
                                disabled={isPrinting}
                                className="flex-1 py-2.5 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                            >
                                <span>🖨️</span>
                                <span>Print Thermal Receipt</span>
                            </button>

                            <a
                                href={`/pay/${encodeURIComponent(selectedBill.receipt_no)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-2.5 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs rounded-xl border border-purple-200 transition-all flex items-center justify-center gap-1"
                                title="Open customer QR payment view"
                            >
                                <span>📱</span>
                                <span>QR View</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
