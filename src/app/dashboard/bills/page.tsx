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
        <div className="space-y-6 pb-20 font-sans">
            {/* ── 1. HERO BANNER ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-emerald-950 p-6 md:p-8 text-white shadow-2xl border border-white/10">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-1/3 -mb-10 w-60 h-60 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-black tracking-wider uppercase mb-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            CASHIER EXIT CONTROL & BILLS VERIFICATION
                        </div>
                        <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white drop-shadow-sm flex items-center gap-3">
                            <span>🧾 Cashier Checkout Desk</span>
                        </h1>
                        <p className="text-sm md:text-base text-slate-300 max-w-2xl mt-1 leading-relaxed">
                            Monitor real-time customer QR M-Pesa payments, verify bills handed over at exit, and manage checkout clearing.
                        </p>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            onClick={() => setIsLiveSync(!isLiveSync)}
                            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                                isLiveSync
                                    ? 'bg-emerald-600 text-white shadow-emerald-500/30 hover:bg-emerald-500'
                                    : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full ${isLiveSync ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
                            {isLiveSync ? 'Live Sync Active' : 'Live Sync Paused'}
                        </button>

                        <button
                            onClick={() => fetchBills(false)}
                            className="px-4 py-2.5 bg-white/15 hover:bg-white/25 active:scale-95 border border-white/20 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md backdrop-blur-md"
                            title="Refresh bills now"
                        >
                            <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
                            Refresh {lastSyncTime && <span className="opacity-70 text-[10px]">({lastSyncTime})</span>}
                        </button>

                        <a
                            href="/dashboard/bill-payment"
                            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-all hover:scale-105"
                        >
                            <span>💳</span>
                            <span>Payment Terminal</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* ── 2. VIBRANT GLASSMORPHIC KPI CARDS (Matching Dashboard Style) ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* 1. Today's Revenue */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-4 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/15 rounded-full -mr-4 -mt-4 pointer-events-none" />
                    <div className="flex items-center justify-between text-xs text-emerald-100 font-bold uppercase tracking-wider mb-1">
                        <span>Total Paid</span>
                        <span>💰</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black tracking-tight text-white font-mono">
                        Ksh {kpis.totalRevenue.toLocaleString()}
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold text-white/95">
                        <span>✓</span> {kpis.paidCount} bills settled
                    </div>
                </div>

                {/* 2. M-Pesa Paid */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 p-4 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/15 rounded-full -mr-4 -mt-4 pointer-events-none" />
                    <div className="flex items-center justify-between text-xs text-green-100 font-bold uppercase tracking-wider mb-1">
                        <span>M-Pesa Verified</span>
                        <span>📱</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black tracking-tight text-white font-mono">
                        Ksh {kpis.mpesaTotal.toLocaleString()}
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold text-white/95">
                        <span>⚡</span> {kpis.mpesaCount} QR payments
                    </div>
                </div>

                {/* 3. Pending Unpaid */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/15 rounded-full -mr-4 -mt-4 pointer-events-none" />
                    <div className="flex items-center justify-between text-xs text-amber-100 font-bold uppercase tracking-wider mb-1">
                        <span>Pending Unpaid</span>
                        <span>⏳</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black tracking-tight text-white font-mono">
                        Ksh {kpis.pendingTotal.toLocaleString()}
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold text-white/95">
                        <span>⚠️</span> {kpis.pendingCount} at tables
                    </div>
                </div>

                {/* 4. Cashier Verified Handed Over */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 p-4 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/15 rounded-full -mr-4 -mt-4 pointer-events-none" />
                    <div className="flex items-center justify-between text-xs text-purple-100 font-bold uppercase tracking-wider mb-1">
                        <span>Handed at Exit</span>
                        <span>🛡️</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black tracking-tight text-white font-mono">
                        {kpis.verifiedCount}
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold text-white/95">
                        <span>☑</span> Verified by Cashier
                    </div>
                </div>

                {/* 5. Cash / Card Paid */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-4 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/15 rounded-full -mr-4 -mt-4 pointer-events-none" />
                    <div className="flex items-center justify-between text-xs text-blue-100 font-bold uppercase tracking-wider mb-1">
                        <span>Cash / Card</span>
                        <span>💵</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black tracking-tight text-white font-mono">
                        Ksh {kpis.cashCardTotal.toLocaleString()}
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold text-white/95">
                        <span>💳</span> {kpis.cashCardCount} counter bills
                    </div>
                </div>

                {/* 6. Total Bills Count */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/15 rounded-full -mr-4 -mt-4 pointer-events-none" />
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold uppercase tracking-wider mb-1">
                        <span>Total Bills</span>
                        <span>📋</span>
                    </div>
                    <div className="text-xl md:text-2xl font-black tracking-tight text-white font-mono">
                        {kpis.totalBillsCount}
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 text-[11px] font-bold text-white/95">
                        <span>📅</span> Selected Period
                    </div>
                </div>
            </div>

            {/* ── 3. SUPER ROBUST FILTER BAR ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 space-y-3.5">
                {/* Search Bar + Presets + View Toggle */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-sm">
                            🔍
                        </span>
                        <input
                            type="text"
                            placeholder="Search Receipt No, M-Pesa Code, Phone, Waiter, Table, Customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Waiter Dropdown */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 whitespace-nowrap">👨‍🍳 Waiter:</span>
                        <select
                            value={waiterFilter}
                            onChange={(e) => setWaiterFilter(e.target.value)}
                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="ALL">All Waiters & Staff</option>
                            {waitersList.map(w => (
                                <option key={w} value={w}>{w}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Presets */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        {(['TODAY', 'YESTERDAY', 'WEEK', 'CUSTOM'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => applyDatePreset(p)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    datePreset === p
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
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
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                            />
                            <span className="text-xs text-slate-400">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                            />
                        </div>
                    )}

                    {/* View Switcher: Cards vs Table */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('CARDS')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                                viewMode === 'CARDS'
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>🎴</span>
                            <span>Cards</span>
                        </button>
                        <button
                            onClick={() => setViewMode('TABLE')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                                viewMode === 'TABLE'
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>📊</span>
                            <span>Table</span>
                        </button>
                    </div>
                </div>

                {/* Filter Status Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
                    {[
                        { id: 'ALL', label: 'All Bills', count: bills.length, color: 'bg-slate-200 text-slate-700' },
                        { id: 'PAID', label: '✅ Paid & Cleared', count: kpis.paidCount, color: 'bg-emerald-100 text-emerald-800' },
                        { id: 'MPESA_SUCCESS', label: '⚡ M-Pesa QR Success', count: kpis.mpesaCount, color: 'bg-green-100 text-green-800' },
                        { id: 'PENDING', label: '⏳ Unpaid at Table', count: kpis.pendingCount, color: 'bg-amber-100 text-amber-800' },
                        { id: 'VERIFIED', label: '🛡️ Handed & Verified', count: kpis.verifiedCount, color: 'bg-purple-100 text-purple-800' },
                        { id: 'UNVERIFIED', label: '⚠️ Exit Unverified', count: Math.max(0, kpis.paidCount - kpis.verifiedCount), color: 'bg-rose-100 text-rose-800' },
                    ].map(st => (
                        <button
                            key={st.id}
                            onClick={() => setStatusFilter(st.id as any)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                statusFilter === st.id
                                    ? 'bg-slate-900 text-white shadow-md scale-105'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                            }`}
                        >
                            <span>{st.label}</span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${statusFilter === st.id ? 'bg-white/20 text-white' : st.color}`}>
                                {st.count}
                            </span>
                        </button>
                    ))}

                    <span className="ml-auto text-xs font-bold text-slate-500">
                        Showing <strong className="text-slate-900">{filteredBills.length}</strong> bills
                    </span>
                </div>
            </div>

            {/* ── 4. MAIN BILLS DISPLAY ───────────────────────────────────────── */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200/80 shadow-sm">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="mt-4 text-sm font-bold text-slate-600">Loading cashier bills desk...</p>
                </div>
            ) : filteredBills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-200/80 shadow-sm text-center p-6">
                    <span className="text-5xl mb-3">🔍</span>
                    <h3 className="text-lg font-bold text-slate-800">No bills match your current filters</h3>
                    <p className="text-sm text-slate-500 max-w-md mt-1">
                        Try resetting your search query or picking a broader date range.
                    </p>
                    <button
                        onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setWaiterFilter('ALL'); applyDatePreset('TODAY'); }}
                        className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-xl transition-all"
                    >
                        Reset All Filters
                    </button>
                </div>
            ) : viewMode === 'CARDS' ? (
                /* ── CARDS VIEW: SUPER BEAUTIFUL BOARDING-PASS BILL CARDS ─────── */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                    {filteredBills.map(bill => {
                        const isPaid = bill.status === 'Paid' || bill.status === 'Completed';
                        const isVerified = Boolean(verifiedIds[bill.sale_id] || bill.notes?.includes('[VERIFIED_EXIT]'));
                        const isMpesa = bill.payment_method?.toLowerCase().includes('mpesa') || Boolean(bill.mpesa_code);

                        return (
                            <div
                                key={bill.sale_id}
                                onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                className={`group relative rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1 bg-white border-2 flex flex-col justify-between ${
                                    isVerified
                                        ? 'border-purple-300 ring-2 ring-purple-100'
                                        : isPaid
                                            ? 'border-emerald-300 hover:border-emerald-400 ring-1 ring-emerald-50'
                                            : 'border-amber-300 hover:border-amber-400 bg-amber-50/20'
                                }`}
                            >
                                {/* Top Badges */}
                                <div>
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                    #{bill.receipt_no}
                                                </span>
                                                {isVerified && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
                                                        <span>🛡️</span> HANDED & VERIFIED
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                                                🕐 {bill.sale_time || 'Just now'} • {bill.sale_date}
                                            </p>
                                        </div>

                                        {/* Status Badge */}
                                        <div>
                                            {isPaid ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    {isMpesa ? 'PAID • M-PESA' : `PAID • ${bill.payment_method.toUpperCase()}`}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                    UNPAID (TABLE)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Big Amount */}
                                    <div className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100 flex items-baseline justify-between">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bill Amount</span>
                                        <span className={`text-2xl font-black font-mono tracking-tight ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            Ksh {bill.total_amount.toLocaleString()}
                                        </span>
                                    </div>

                                    {/* M-PESA CODE & VERIFICATION BOX (PROMINENT IF M-PESA) */}
                                    {isMpesa && bill.mpesa_code && (
                                        <div className="bg-gradient-to-r from-amber-50 to-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-emerald-800 text-[11px] font-black uppercase tracking-wider">
                                                    <span>⚡</span> M-Pesa Transaction
                                                </div>
                                                <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                                    ✓ Verified
                                                </span>
                                            </div>
                                            <div className="mt-1 text-base font-black font-mono text-emerald-900 tracking-wider">
                                                {bill.mpesa_code}
                                            </div>
                                            {bill.customer_phone && (
                                                <p className="text-[11px] font-semibold text-slate-600 mt-1">
                                                    📱 Customer: <span className="font-mono font-bold text-slate-800">{bill.customer_phone}</span>
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Staff & Table Info */}
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Served By</span>
                                            <span className="font-bold text-slate-800 truncate block mt-0.5">
                                                👨‍🍳 {bill.waiter_name}
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Table / Room</span>
                                            <span className="font-bold text-slate-800 truncate block mt-0.5">
                                                🪑 {bill.table_name}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Items Preview */}
                                    {bill.items && bill.items.length > 0 && (
                                        <div className="text-[11px] text-slate-500 mb-3 bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                                            <span className="font-bold text-slate-700 block mb-1">
                                                🍽️ Order Items ({bill.items.length}):
                                            </span>
                                            <p className="line-clamp-2 leading-relaxed text-slate-600">
                                                {bill.items.map(it => `${it.quantity}× ${it.product_name}`).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* ── CASHIER VERIFICATION CHECKBOX & HANDOVER CONTROL ──── */}
                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                    <label
                                        onClick={(e) => toggleVerification(bill.sale_id, e)}
                                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                            isVerified
                                                ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold'
                                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isVerified}
                                            onChange={() => {}} // handled by parent onClick
                                            className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                                        />
                                        <span className="text-xs">
                                            {isVerified
                                                ? '✓ Bill Handed & Verified at Exit'
                                                : 'Mark Bill Handed Over & Verified'}
                                        </span>
                                    </label>

                                    {/* Quick Actions Row */}
                                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                                        {!isPaid && (
                                            <button
                                                onClick={() => handleMarkAsCashPaid(bill)}
                                                className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1"
                                                title="Customer paying cash right now at cashier desk"
                                            >
                                                <span>💵</span>
                                                <span>Collect Cash</span>
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handlePrint(bill, isPaid)}
                                            disabled={isPrinting}
                                            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1"
                                            title="Print Thermal Receipt"
                                        >
                                            <span>🖨️</span>
                                            <span>Print</span>
                                        </button>

                                        <a
                                            href={`/pay/${encodeURIComponent(bill.receipt_no)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1"
                                            title="View Customer QR Pay Link (Shows 'BILL PAID' with details locked once paid)"
                                        >
                                            <span>📱</span>
                                            <span>QR View</span>
                                        </a>

                                        <button
                                            onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg transition-all ml-auto"
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
                /* ── TABLE VIEW: HIGH CONTRAST DATAGRID ───────────────────────── */
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider font-extrabold">
                                    <th className="py-3 px-4 text-center">Verify Exit</th>
                                    <th className="py-3 px-4">Receipt No</th>
                                    <th className="py-3 px-4">Date / Time</th>
                                    <th className="py-3 px-4">Served By</th>
                                    <th className="py-3 px-4">Table</th>
                                    <th className="py-3 px-4 text-right">Amount</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                    <th className="py-3 px-4">Payment / M-Pesa Code</th>
                                    <th className="py-3 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBills.map((bill, idx) => {
                                    const isPaid = bill.status === 'Paid' || bill.status === 'Completed';
                                    const isVerified = Boolean(verifiedIds[bill.sale_id] || bill.notes?.includes('[VERIFIED_EXIT]'));
                                    const isMpesa = bill.payment_method?.toLowerCase().includes('mpesa') || Boolean(bill.mpesa_code);

                                    return (
                                        <tr
                                            key={bill.sale_id}
                                            onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                            className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                                                isVerified ? 'bg-purple-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                                            }`}
                                        >
                                            {/* Cashier Handover Checkbox */}
                                            <td className="py-3 px-4 text-center" onClick={(e) => toggleVerification(bill.sale_id, e)}>
                                                <input
                                                    type="checkbox"
                                                    checked={isVerified}
                                                    onChange={() => {}}
                                                    className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                                                />
                                            </td>

                                            {/* Receipt No */}
                                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                                                #{bill.receipt_no}
                                            </td>

                                            {/* Date / Time */}
                                            <td className="py-3 px-4 text-slate-600">
                                                <div className="font-semibold">{bill.sale_time || '-'}</div>
                                                <div className="text-[10px] text-slate-400">{bill.sale_date}</div>
                                            </td>

                                            {/* Served By */}
                                            <td className="py-3 px-4 font-medium text-slate-800">
                                                👨‍🍳 {bill.waiter_name}
                                            </td>

                                            {/* Table */}
                                            <td className="py-3 px-4 font-medium text-slate-700">
                                                🪑 {bill.table_name}
                                            </td>

                                            {/* Amount */}
                                            <td className="py-3 px-4 text-right font-mono font-black text-sm text-slate-900">
                                                Ksh {bill.total_amount.toLocaleString()}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-3 px-4 text-center">
                                                {isPaid ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        <span>✓</span> PAID
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                                        <span>⏳</span> UNPAID
                                                    </span>
                                                )}
                                            </td>

                                            {/* M-Pesa / Method */}
                                            <td className="py-3 px-4">
                                                {bill.mpesa_code ? (
                                                    <div>
                                                        <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                            {bill.mpesa_code}
                                                        </span>
                                                        {bill.customer_phone && (
                                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                {bill.customer_phone}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="font-medium text-slate-600">
                                                        {bill.payment_method || 'Cash'}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handlePrint(bill, isPaid)}
                                                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors"
                                                        title="Print"
                                                    >
                                                        🖨️
                                                    </button>
                                                    <a
                                                        href={`/pay/${encodeURIComponent(bill.receipt_no)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 hover:bg-indigo-100 rounded-lg text-indigo-700 transition-colors"
                                                        title="QR Page"
                                                    >
                                                        📱
                                                    </a>
                                                    <button
                                                        onClick={() => { setSelectedBill(bill); setIsDrawerOpen(true); }}
                                                        className="px-2 py-1 bg-slate-900 text-white font-bold rounded-lg text-[10px]"
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
                <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all">
                    <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="p-6 bg-slate-900 text-white sticky top-0 z-10">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300">
                                        Cashier Bill Verification
                                    </span>
                                    <h2 className="text-2xl font-black font-mono tracking-tight text-white mt-1">
                                        #{selectedBill.receipt_no}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {selectedBill.sale_date} at {selectedBill.sale_time || '-'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsDrawerOpen(false)}
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Status Header Pill */}
                            <div className="mt-4 flex items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                                    selectedBill.status === 'Paid'
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                }`}>
                                    <span>{selectedBill.status === 'Paid' ? '✓' : '⏳'}</span>
                                    {selectedBill.status === 'Paid' ? 'PAID IN FULL' : 'PENDING PAYMENT'}
                                </span>

                                {verifiedIds[selectedBill.sale_id] && (
                                    <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center gap-1">
                                        <span>🛡️</span> HANDED OVER & VERIFIED
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Drawer Body */}
                        <div className="p-6 space-y-5 flex-1">
                            {/* Handover Checkbox Button */}
                            <div
                                onClick={() => toggleVerification(selectedBill.sale_id)}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                    verifiedIds[selectedBill.sale_id]
                                        ? 'bg-purple-50 border-purple-400 text-purple-900'
                                        : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-slate-800'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(verifiedIds[selectedBill.sale_id])}
                                        onChange={() => {}}
                                        className="w-5 h-5 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                                    />
                                    <div>
                                        <p className="font-bold text-sm">
                                            {verifiedIds[selectedBill.sale_id]
                                                ? '✓ Verified at Cashier Exit'
                                                : 'Verify Customer Handover at Exit'}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {verifiedIds[selectedBill.sale_id]
                                                ? 'Customer handed over physical receipt upon exit.'
                                                : 'Check this box when customer hands over physical bill.'}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-xl">🛡️</span>
                            </div>

                            {/* M-Pesa Transaction Audit Details */}
                            {selectedBill.mpesa_code && (
                                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                                            <span>⚡</span> M-Pesa Payment Details
                                        </span>
                                        <span className="text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                            ✓ Verified Code
                                        </span>
                                    </div>
                                    <div className="text-2xl font-black font-mono text-emerald-950 tracking-wider mb-2">
                                        {selectedBill.mpesa_code}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 pt-2 border-t border-emerald-200">
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Phone</span>
                                            <span className="font-mono font-bold">{selectedBill.customer_phone || 'Verified'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Paid Time</span>
                                            <span className="font-semibold">{selectedBill.paid_at || selectedBill.sale_time}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Service Details Grid */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Served By (Waiter)</span>
                                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                                        👨‍🍳 {selectedBill.waiter_name}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Table / Location</span>
                                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                                        🪑 {selectedBill.table_name}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Customer</span>
                                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                                        👤 {selectedBill.customer_name}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Payment Method</span>
                                    <span className="font-bold text-slate-900 text-sm block mt-0.5">
                                        💳 {selectedBill.payment_method}
                                    </span>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">
                                    🍽️ Bill Items & Breakdown
                                </h4>
                                {selectedBill.items && selectedBill.items.length > 0 ? (
                                    <div className="divide-y divide-slate-100 text-xs">
                                        {selectedBill.items.map((it, i) => (
                                            <div key={i} className="py-2 flex justify-between items-center">
                                                <div>
                                                    <span className="font-bold text-slate-800">{it.quantity}× {it.product_name}</span>
                                                    {it.notes && <p className="text-[10px] text-amber-600 italic">📝 {it.notes}</p>}
                                                </div>
                                                <span className="font-mono font-bold text-slate-900">
                                                    Ksh {it.subtotal.toFixed(2)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 py-2">Item details loaded from total amount.</p>
                                )}

                                <div className="mt-3 pt-3 border-t-2 border-slate-200 space-y-1.5 text-xs">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Subtotal:</span>
                                        <span className="font-mono">Ksh {selectedBill.subtotal.toFixed(2)}</span>
                                    </div>
                                    {selectedBill.discount > 0 && (
                                        <div className="flex justify-between text-emerald-600 font-semibold">
                                            <span>Discount:</span>
                                            <span className="font-mono">-Ksh {selectedBill.discount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-100">
                                        <span>Total Amount:</span>
                                        <span className="font-mono text-emerald-700">Ksh {selectedBill.total_amount.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Privacy Lock Reminder */}
                            <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-600 leading-relaxed border border-slate-200">
                                🔒 <strong>Privacy Protection Active:</strong> When customers or strangers scan the physical receipt QR code after payment, order items and server details are automatically locked and hidden.
                            </div>
                        </div>

                        {/* Drawer Footer Actions */}
                        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center gap-2 sticky bottom-0">
                            <button
                                onClick={() => handlePrint(selectedBill, selectedBill.status === 'Paid')}
                                disabled={isPrinting}
                                className="flex-1 py-3 px-4 bg-slate-900 hover:bg-black text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <span>🖨️</span>
                                <span>Print Thermal Receipt</span>
                            </button>

                            <a
                                href={`/pay/${encodeURIComponent(selectedBill.receipt_no)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-3 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-xs rounded-xl border border-indigo-200 transition-all flex items-center justify-center gap-1.5"
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
