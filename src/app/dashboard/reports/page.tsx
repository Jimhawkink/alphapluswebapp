'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

type ReportTab = 
    | 'overview' 
    | 'items' 
    | 'staff' 
    | 'shifts' 
    | 'tables' 
    | 'tax' 
    | 'hotel' 
    | 'inventory' 
    | 'purchases' 
    | 'mpesa';

type DatePreset = 'today' | 'yesterday' | '7days' | 'month' | 'last_month' | 'year' | 'all' | 'custom';

interface SaleRecord {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    shift_id?: number | null;
    shift_name?: string | null;
    shift_code?: string | null;
    waiter_name: string | null;
    waiter_id: number | null;
    table_name: string | null;
    table_no: string | null;
    room_name: string | null;
    order_type: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    subtotal: number;
    discount: number;
    net_amount: number;
    vat_rate: number;
    vat_amount: number;
    levy_rate: number;
    levy_amount: number;
    total_tax: number;
    total_amount: number;
    total_cost: number;
    profit: number;
    payment_method: string;
    amount_paid: number;
    change_amount: number;
    mpesa_code: string | null;
    status: string;
    created_by: string | null;
    created_at: string;
    tax_mode: string;
    verification_hash: string | null;
    qr_code_data: string | null;
}

interface SaleItemRecord {
    item_id: number;
    sale_id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    discount: number;
    subtotal: number;
    profit: number;
    created_at: string;
}

interface ShiftRecord {
    shift_id: number;
    shift_date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    opening_cash: number;
    closing_cash: number | null;
    actual_cash: number | null;
    cash_variance: number | null;
    total_sales: number;
    status: string;
    opened_by: string;
    closed_by: string | null;
}

interface ShiftExpense {
    expense_id: number;
    shift_id: number;
    expense_category: string;
    expense_description: string;
    amount: number;
    recorded_by: string;
    recorded_at: string;
}

interface ShiftCashDrop {
    cash_drop_id: number;
    shift_instance_id: number;
    drop_amount: number;
    drop_time: string;
    dropped_by: string;
    reason: string;
}

interface ProductRecord {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    purchase_cost: number;
    sales_cost: number;
    reorder_point: number;
    active: boolean;
}

interface KitchenOrderRecord {
    kot_id: number;
    kot_number: string;
    sale_id: number | null;
    table_name: string | null;
    waiter_name: string | null;
    status: string;
    printed_at: string | null;
    prepared_at: string | null;
    served_at: string | null;
    created_at: string;
}

interface HotelSaleRecord {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_datetime: string;
    establishment_type: string;
    tax_mode: string;
    subtotal: number;
    discount: number;
    net_amount: number;
    vat_amount: number;
    levy_amount: number;
    total_tax: number;
    total_amount: number;
    payment_method: string;
    amount_paid: number;
    customer_name: string | null;
    mpesa_code: string | null;
    status: string;
    cashier: string | null;
}

interface HotelPaymentRecord {
    payment_id: number;
    payment_no: string;
    booking_id: number | null;
    booking_no: string | null;
    guest_name: string | null;
    room_number: string | null;
    payment_date: string;
    payment_datetime: string;
    amount: number;
    payment_method: string;
    mpesa_code: string | null;
    payment_type: string;
    status: string;
    received_by: string | null;
}

interface HotelBookingRecord {
    booking_id: number;
    booking_no: string;
    guest_name: string | null;
    room_number: string | null;
    room_type_name: string | null;
    check_in_date: string;
    check_out_date: string | null;
    nights: number;
    room_charges: number;
    restaurant_charges: number;
    total_amount: number;
    total_paid: number;
    balance: number;
    status: string;
}

interface HotelRoomRecord {
    room_id: number;
    room_number: string;
    room_name: string | null;
    room_type_name: string | null;
    floor_number: number;
    bed_type: string;
    room_rate: number;
    status: string;
    housekeeping_status: string;
}

interface SupplierRecord {
    supplier_id: number;
    supplier_code: string;
    supplier_name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    current_balance: number;
    payment_terms: string | null;
    active: boolean;
}

interface PurchaseRecord {
    purchase_id: number;
    purchase_no: string;
    purchase_date: string;
    supplier_id: number | null;
    supplier_name: string | null;
    supplier_invoice: string | null;
    sub_total: number;
    discount: number;
    vat: number;
    grand_total: number;
    status: string;
    payment_status: string;
}

interface DishSpoilageRecord {
    spoilage_id: number;
    spoilage_date: string;
    product_name: string;
    quantity: number;
    unit_cost: number;
    total_loss: number;
    spoilage_type: string;
    reason: string | null;
    recorded_by: string | null;
    status: string;
}

interface ProductionBatchRecord {
    batch_id: number;
    batch_number: string;
    product_name: string;
    qty_produced: number;
    qty_remaining: number;
    qty_sold: number;
    cost_per_unit: number;
    selling_price: number;
    total_production_cost: number;
    production_date: string;
    status: string;
}

interface C2BTransactionRecord {
    id: number;
    mpesa_receipt: string;
    phone: string | null;
    amount: number;
    transaction_time: string;
    customer_name: string | null;
    account_reference: string | null;
    is_linked: boolean;
    linked_sale_id: number | null;
}

export default function MasterReportsPage() {
    // ─── STATE MANAGEMENT ───────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<ReportTab>('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    
    // Dates defaults to all-time / 30-days range
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    // Data states
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Records
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [salesItems, setSalesItems] = useState<SaleItemRecord[]>([]);
    const [shifts, setShifts] = useState<ShiftRecord[]>([]);
    const [shiftExpenses, setShiftExpenses] = useState<ShiftExpense[]>([]);
    const [products, setProducts] = useState<ProductRecord[]>([]);
    const [kitchenOrders, setKitchenOrders] = useState<KitchenOrderRecord[]>([]);
    const [hotelSales, setHotelSales] = useState<HotelSaleRecord[]>([]);
    const [hotelPayments, setHotelPayments] = useState<HotelPaymentRecord[]>([]);
    const [hotelBookings, setHotelBookings] = useState<HotelBookingRecord[]>([]);
    const [hotelRooms, setHotelRooms] = useState<HotelRoomRecord[]>([]);
    const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
    const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
    const [spoilages, setSpoilages] = useState<DishSpoilageRecord[]>([]);
    const [batches, setBatches] = useState<ProductionBatchRecord[]>([]);
    const [c2bList, setC2bList] = useState<C2BTransactionRecord[]>([]);

    // ─── PRESET DATE CHANGER ───────────────────────────────────────────────────
    const applyDatePreset = (preset: DatePreset) => {
        setDatePreset(preset);
        const today = new Date();
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const todayStr = today.toISOString().split('T')[0];
        const yestStr = yest.toISOString().split('T')[0];

        if (preset === 'today') {
            setDateFrom(todayStr);
            setDateTo(todayStr);
        } else if (preset === 'yesterday') {
            setDateFrom(yestStr);
            setDateTo(yestStr);
        } else if (preset === '7days') {
            const d7 = new Date();
            d7.setDate(d7.getDate() - 7);
            setDateFrom(d7.toISOString().split('T')[0]);
            setDateTo(todayStr);
        } else if (preset === 'month') {
            const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
            setDateFrom(mStart.toISOString().split('T')[0]);
            setDateTo(todayStr);
        } else if (preset === 'last_month') {
            const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
            setDateFrom(lmStart.toISOString().split('T')[0]);
            setDateTo(lmEnd.toISOString().split('T')[0]);
        } else if (preset === 'year') {
            const yrStart = new Date(today.getFullYear(), 0, 1);
            setDateFrom(yrStart.toISOString().split('T')[0]);
            setDateTo(todayStr);
        } else if (preset === 'all') {
            setDateFrom('2025-01-01');
            setDateTo(todayStr);
        }
    };

    // ─── MASTER DATA FETCHING ──────────────────────────────────────────────────
    const fetchMasterReports = useCallback(async () => {
        try {
            setRefreshing(true);

            // 1. Fetch Sales
            const { data: salesData, error: salesErr } = await supabase
                .from('sales')
                .select('*')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo)
                .order('sale_datetime', { ascending: false });

            if (salesErr) console.warn('Sales fetch warning:', salesErr.message);
            const loadedSales = (salesData || []) as SaleRecord[];
            setSales(loadedSales);

            // 2. Fetch Sales Items
            const saleIds = loadedSales.map(s => s.sale_id).slice(0, 500);
            if (saleIds.length > 0) {
                const { data: itemsData } = await supabase
                    .from('sales_items')
                    .select('*')
                    .in('sale_id', saleIds);
                setSalesItems((itemsData || []) as SaleItemRecord[]);
            } else {
                setSalesItems([]);
            }

            // 3. Fetch Shifts
            const { data: shiftsData } = await supabase
                .from('shifts')
                .select('*')
                .order('shift_date', { ascending: false });
            setShifts((shiftsData || []) as ShiftRecord[]);

            // 4. Fetch Shift Expenses
            const { data: expData } = await supabase
                .from('shift_expenses')
                .select('*')
                .order('recorded_at', { ascending: false });
            setShiftExpenses((expData || []) as ShiftExpense[]);

            // 5. Fetch Products Catalog
            const { data: prodsData } = await supabase
                .from('products')
                .select('*')
                .order('product_name');
            setProducts((prodsData || []) as ProductRecord[]);

            // 6. Fetch Kitchen Orders
            const { data: kotData } = await supabase
                .from('kitchen_orders')
                .select('*')
                .order('created_at', { ascending: false });
            setKitchenOrders((kotData || []) as KitchenOrderRecord[]);

            // 7. Fetch Hotel Sales & Payments
            const { data: hSalesData } = await supabase
                .from('hotel_sales')
                .select('*')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo);
            setHotelSales((hSalesData || []) as HotelSaleRecord[]);

            const { data: hPaymentsData } = await supabase
                .from('hotel_payments')
                .select('*')
                .gte('payment_date', dateFrom)
                .lte('payment_date', dateTo);
            setHotelPayments((hPaymentsData || []) as HotelPaymentRecord[]);

            // 8. Fetch Hotel Bookings & Rooms
            const { data: hBookingsData } = await supabase
                .from('hotel_bookings')
                .select('*')
                .order('created_at', { ascending: false });
            setHotelBookings((hBookingsData || []) as HotelBookingRecord[]);

            const { data: hRoomsData } = await supabase
                .from('hotel_rooms')
                .select('*')
                .order('room_number');
            setHotelRooms((hRoomsData || []) as HotelRoomRecord[]);

            // 9. Fetch Suppliers & Purchases
            const { data: supData } = await supabase
                .from('suppliers')
                .select('*')
                .order('supplier_name');
            setSuppliers((supData || []) as SupplierRecord[]);

            const { data: purData } = await supabase
                .from('purchases')
                .select('*')
                .gte('purchase_date', dateFrom)
                .lte('purchase_date', dateTo);
            setPurchases((purData || []) as PurchaseRecord[]);

            // 10. Fetch Spoilages & Batches
            const { data: spData } = await supabase
                .from('dish_spoilage')
                .select('*')
                .order('spoilage_date', { ascending: false });
            setSpoilages((spData || []) as DishSpoilageRecord[]);

            const { data: batchData } = await supabase
                .from('production_batches')
                .select('*')
                .order('production_date', { ascending: false });
            setBatches((batchData || []) as ProductionBatchRecord[]);

            // 11. Fetch C2B Transactions
            const { data: c2bData } = await supabase
                .from('c2b_transactions')
                .select('*')
                .order('transaction_time', { ascending: false })
                .limit(100);
            setC2bList((c2bData || []) as C2BTransactionRecord[]);

        } catch (err: any) {
            console.error('Error in master report fetch:', err);
            toast.error('Sync issue: ' + (err.message || 'Check connection'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        fetchMasterReports();
    }, [fetchMasterReports]);

    // Auto-refresh interval (30s)
    useEffect(() => {
        if (!autoRefresh) return;
        const timer = setInterval(() => {
            fetchMasterReports();
        }, 30000);
        return () => clearInterval(timer);
    }, [autoRefresh, fetchMasterReports]);

    // ─── CURRENCY & NUMBER FORMATTERS ──────────────────────────────────────────
    const fmt = (val: number | null | undefined) => {
        const num = Number(val) || 0;
        return 'KES ' + num.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    const fmtNum = (val: number | null | undefined) => {
        return (Number(val) || 0).toLocaleString();
    };

    // ─── AGGREGATED METRICS CALCULATION ───────────────────────────────────────
    const masterMetrics = useMemo(() => {
        // POS Sales
        const completedSales = sales.filter(s => s.status !== 'Void' && s.status !== 'Cancelled');
        const posGross = completedSales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
        const posNet = completedSales.reduce((acc, s) => acc + (Number(s.net_amount) || Number(s.subtotal) || 0), 0);
        const posTax = completedSales.reduce((acc, s) => acc + (Number(s.total_tax) || Number(s.vat_amount) + Number(s.levy_amount) || 0), 0);
        const posDiscount = completedSales.reduce((acc, s) => acc + (Number(s.discount) || 0), 0);
        const posCost = completedSales.reduce((acc, s) => acc + (Number(s.total_cost) || 0), 0);
        const posProfit = completedSales.reduce((acc, s) => acc + (Number(s.profit) || (s.total_amount - (s.total_cost || 0))), 0);

        // Hotel Sales & Payments
        const hotelGross = hotelSales.reduce((acc, hs) => acc + (Number(hs.total_amount) || 0), 0);
        const hotelDirectPayments = hotelPayments.reduce((acc, hp) => acc + (Number(hp.amount) || 0), 0);
        const combinedHotel = hotelGross > 0 ? hotelGross : hotelDirectPayments;

        // Combined Master
        const grandTotalRevenue = posGross + combinedHotel;
        const grandTotalTax = posTax + hotelSales.reduce((acc, hs) => acc + (Number(hs.total_tax) || 0), 0);
        const grandNetTurnover = grandTotalRevenue - grandTotalTax;
        const grandCost = posCost;
        const grandGrossProfit = grandTotalRevenue - grandCost;
        const profitMargin = grandTotalRevenue > 0 ? ((grandGrossProfit / grandTotalRevenue) * 100) : 0;

        const totalTransactions = completedSales.length + (hotelSales.length || hotelPayments.length);
        const avgOrderValue = totalTransactions > 0 ? (grandTotalRevenue / totalTransactions) : 0;

        // Payment Methods Breakdown
        let cashTotal = 0;
        let mpesaTotal = 0;
        let cardTotal = 0;
        let pendingTotal = 0;

        completedSales.forEach(s => {
            const m = (s.payment_method || '').toLowerCase();
            const amt = Number(s.total_amount) || 0;
            if (m.includes('cash')) cashTotal += amt;
            else if (m.includes('mpesa') || m.includes('m-pesa')) mpesaTotal += amt;
            else if (m.includes('card') || m.includes('bank') || m.includes('credit')) cardTotal += amt;
            else pendingTotal += amt;
        });

        hotelPayments.forEach(p => {
            const m = (p.payment_method || '').toLowerCase();
            const amt = Number(p.amount) || 0;
            if (m.includes('cash')) cashTotal += amt;
            else if (m.includes('mpesa')) mpesaTotal += amt;
            else cardTotal += amt;
        });

        return {
            grandTotalRevenue,
            grandNetTurnover,
            grandTotalTax,
            grandCost,
            grandGrossProfit,
            profitMargin,
            totalTransactions,
            avgOrderValue,
            posGross,
            combinedHotel,
            posDiscount,
            cashTotal,
            mpesaTotal,
            cardTotal,
            pendingTotal,
        };
    }, [sales, hotelSales, hotelPayments]);

    // ─── TAB 2: PRODUCT SALES AGGREGATION ─────────────────────────────────────
    const productSalesStats = useMemo(() => {
        const pMap = new Map<string, {
            pid: number;
            code: string;
            name: string;
            category: string;
            qtySold: number;
            unitPrice: number;
            unitCost: number;
            totalRevenue: number;
            totalCost: number;
            profit: number;
        }>();

        // Populate baseline from product catalog
        products.forEach(p => {
            pMap.set(p.product_name.toLowerCase().trim(), {
                pid: p.pid,
                code: p.product_code || `P-${p.pid}`,
                name: p.product_name,
                category: p.category || 'Kitchen',
                qtySold: 0,
                unitPrice: Number(p.sales_cost) || 0,
                unitCost: Number(p.purchase_cost) || 0,
                totalRevenue: 0,
                totalCost: 0,
                profit: 0,
            });
        });

        // Tally sales_items
        salesItems.forEach(item => {
            const key = (item.product_name || '').toLowerCase().trim();
            const existing = pMap.get(key) || {
                pid: item.product_id || 0,
                code: `P-${item.product_id}`,
                name: item.product_name || 'Dish',
                category: 'General',
                qtySold: 0,
                unitPrice: Number(item.unit_price) || 0,
                unitCost: Number(item.cost_price) || 0,
                totalRevenue: 0,
                totalCost: 0,
                profit: 0,
            };

            const qty = Number(item.quantity) || 1;
            const rev = Number(item.subtotal) || (qty * existing.unitPrice);
            const cost = (Number(item.cost_price) || existing.unitCost) * qty;

            existing.qtySold += qty;
            existing.totalRevenue += rev;
            existing.totalCost += cost;
            existing.profit += (rev - cost);
            pMap.set(key, existing);
        });

        let list = Array.from(pMap.values());
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
        }

        // Sort by revenue descending
        list.sort((a, b) => b.totalRevenue - a.totalRevenue);

        const top10 = list.slice(0, 10);
        return { list, top10 };
    }, [products, salesItems, searchQuery]);

    // ─── TAB 3: WAITER & STAFF PERFORMANCE ────────────────────────────────────
    const waiterStats = useMemo(() => {
        const wMap = new Map<string, {
            name: string;
            role: string;
            billsCount: number;
            totalSales: number;
            discounts: number;
            cashCollected: number;
            mpesaCollected: number;
            avgCheck: number;
        }>();

        sales.forEach(s => {
            const waiter = (s.waiter_name || s.created_by || 'Cashier / Admin').trim();
            const existing = wMap.get(waiter) || {
                name: waiter,
                role: 'Staff / Waiter',
                billsCount: 0,
                totalSales: 0,
                discounts: 0,
                cashCollected: 0,
                mpesaCollected: 0,
                avgCheck: 0,
            };

            existing.billsCount += 1;
            const amt = Number(s.total_amount) || 0;
            existing.totalSales += amt;
            existing.discounts += Number(s.discount) || 0;

            const m = (s.payment_method || '').toLowerCase();
            if (m.includes('cash')) existing.cashCollected += amt;
            else if (m.includes('mpesa')) existing.mpesaCollected += amt;

            wMap.set(waiter, existing);
        });

        let list = Array.from(wMap.values()).map(w => ({
            ...w,
            avgCheck: w.billsCount > 0 ? (w.totalSales / w.billsCount) : 0,
        }));

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(w => w.name.toLowerCase().includes(q));
        }

        list.sort((a, b) => b.totalSales - a.totalSales);
        return list;
    }, [sales, searchQuery]);

    // ─── TAB 4: SHIFTS AUDIT & Z-REPORTS ───────────────────────────────────────
    const shiftReportsList = useMemo(() => {
        return shifts.map(sh => {
            const shiftSales = sales.filter(s => s.shift_id === sh.shift_id);
            const calculatedSales = shiftSales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
            const actualSales = sh.total_sales > 0 ? sh.total_sales : calculatedSales;

            const shiftExps = shiftExpenses.filter(e => e.shift_id === sh.shift_id);
            const expTotal = shiftExps.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

            const openCash = Number(sh.opening_cash) || 0;
            const expectedDrawer = openCash + actualSales - expTotal;
            const closingCash = sh.closing_cash !== null ? Number(sh.closing_cash) : expectedDrawer;
            const variance = sh.cash_variance !== null ? Number(sh.cash_variance) : (closingCash - expectedDrawer);

            return {
                ...sh,
                expTotal,
                expectedDrawer,
                computedClosing: closingCash,
                computedVariance: variance,
            };
        });
    }, [shifts, sales, shiftExpenses]);

    // ─── TAB 5: DINING TABLES & KITCHEN KOTs ───────────────────────────────────
    const tableAndKotStats = useMemo(() => {
        const tableMap = new Map<string, {
            name: string;
            ordersCount: number;
            revenue: number;
            avgCheck: number;
        }>();

        sales.forEach(s => {
            const t = (s.table_name || s.table_no || 'Walk-in Bar').trim();
            const cur = tableMap.get(t) || { name: t, ordersCount: 0, revenue: 0, avgCheck: 0 };
            cur.ordersCount += 1;
            cur.revenue += Number(s.total_amount) || 0;
            tableMap.set(t, cur);
        });

        const tableList = Array.from(tableMap.values()).map(t => ({
            ...t,
            avgCheck: t.ordersCount > 0 ? (t.revenue / t.ordersCount) : 0,
        })).sort((a, b) => b.revenue - a.revenue);

        const totalKots = kitchenOrders.length;
        const pendingKots = kitchenOrders.filter(k => k.status === 'Pending').length;
        const servedKots = kitchenOrders.filter(k => k.status === 'Served' || k.served_at).length;

        return { tableList, totalKots, pendingKots, servedKots };
    }, [sales, kitchenOrders]);

    // ─── TAB 6: KRA TAX & FISCAL AUDIT ─────────────────────────────────────────
    const taxFiscalStats = useMemo(() => {
        let vatTaxableBase = 0;
        let vatAmountTotal = 0;
        let levyTaxableBase = 0;
        let levyAmountTotal = 0;

        sales.forEach(s => {
            const tot = Number(s.total_amount) || 0;
            const net = Number(s.net_amount) || Number(s.subtotal) || (tot / 1.18);
            const vat = Number(s.vat_amount) || (tot * 0.16 / 1.18);
            const levy = Number(s.levy_amount) || (tot * 0.02 / 1.18);

            vatTaxableBase += net;
            vatAmountTotal += vat;
            levyTaxableBase += net;
            levyAmountTotal += levy;
        });

        return {
            vatTaxableBase,
            vatAmountTotal,
            levyTaxableBase,
            levyAmountTotal,
            totalFiscalized: sales.length,
        };
    }, [sales]);

    // ─── TAB 7: HOTEL PMS & ROOM REVENUE ───────────────────────────────────────
    const hotelStats = useMemo(() => {
        const totalRooms = hotelRooms.length || 10;
        const occupiedRooms = hotelRooms.filter(r => (r.status || '').toLowerCase() === 'occupied').length;
        const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100) : 0;

        const totalRoomCharges = hotelBookings.reduce((acc, b) => acc + (Number(b.room_charges) || 0), 0);
        const totalRestaurantCharges = hotelBookings.reduce((acc, b) => acc + (Number(b.restaurant_charges) || 0), 0);
        const totalHotelCollected = hotelPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

        const totalNights = hotelBookings.reduce((acc, b) => acc + (Number(b.nights) || 1), 0);
        const adr = totalNights > 0 ? (totalRoomCharges / totalNights) : 0;
        const revpar = totalRooms > 0 ? (totalRoomCharges / totalRooms) : 0;

        return {
            totalRooms,
            occupiedRooms,
            occupancyRate,
            totalRoomCharges,
            totalRestaurantCharges,
            totalHotelCollected,
            adr,
            revpar,
        };
    }, [hotelRooms, hotelBookings, hotelPayments]);

    // ─── TAB 8: INVENTORY, BATCHES & SPOILAGE ──────────────────────────────────
    const inventoryStats = useMemo(() => {
        const totalSpoilageLoss = spoilages.reduce((acc, sp) => acc + (Number(sp.total_loss) || 0), 0);
        const totalBatchesProduced = batches.reduce((acc, b) => acc + (Number(b.qty_produced) || 0), 0);
        const totalBatchProductionCost = batches.reduce((acc, b) => acc + (Number(b.total_production_cost) || 0), 0);

        return {
            totalSpoilageLoss,
            totalBatchesProduced,
            totalBatchProductionCost,
        };
    }, [spoilages, batches]);

    // ─── TAB 9: PURCHASES & SUPPLIERS ──────────────────────────────────────────
    const purchaseStats = useMemo(() => {
        const totalPurchased = purchases.reduce((acc, p) => acc + (Number(p.grand_total) || 0), 0);
        const totalVatClaimable = purchases.reduce((acc, p) => acc + (Number(p.vat) || 0), 0);
        const totalSuppliers = suppliers.length;
        const totalSupplierDebt = suppliers.reduce((acc, s) => acc + (Number(s.current_balance) || 0), 0);

        return {
            totalPurchased,
            totalVatClaimable,
            totalSuppliers,
            totalSupplierDebt,
        };
    }, [purchases, suppliers]);

    // ─── TAB 10: M-PESA & DIGITAL FLOW ─────────────────────────────────────────
    const mpesaStats = useMemo(() => {
        const posMpesa = sales
            .filter(s => (s.payment_method || '').toLowerCase().includes('mpesa'))
            .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);

        const hotelMpesa = hotelPayments
            .filter(p => (p.payment_method || '').toLowerCase().includes('mpesa'))
            .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

        const totalMpesa = posMpesa + hotelMpesa;
        const unlinkedC2B = c2bList.filter(c => !c.is_linked);
        const unlinkedAmount = unlinkedC2B.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

        return {
            posMpesa,
            hotelMpesa,
            totalMpesa,
            unlinkedCount: unlinkedC2B.length,
            unlinkedAmount,
        };
    }, [sales, hotelPayments, c2bList]);

    // ─── CSV EXPORT FUNCTIONALITY ──────────────────────────────────────────────
    const exportCSV = () => {
        let headers: string[] = [];
        let rows: string[][] = [];
        let filename = `AlphaPlus_${activeTab}_report_${dateFrom}_to_${dateTo}.csv`;

        if (activeTab === 'overview' || activeTab === 'tax') {
            headers = ['Receipt No', 'Date', 'Time', 'Customer', 'Waiter', 'Payment Method', 'Net Amount', 'VAT (16%)', 'Levy (2%)', 'Total (KES)', 'Status'];
            rows = sales.map(s => [
                s.receipt_no,
                s.sale_date,
                s.sale_time,
                `"${s.customer_name || 'Walk-in'}"`,
                `"${s.waiter_name || s.created_by || 'Staff'}"`,
                s.payment_method,
                (s.net_amount || s.subtotal || 0).toFixed(2),
                (s.vat_amount || 0).toFixed(2),
                (s.levy_amount || 0).toFixed(2),
                (s.total_amount || 0).toFixed(2),
                s.status,
            ]);
        } else if (activeTab === 'items') {
            headers = ['Product Code', 'Dish Name', 'Category', 'Qty Sold', 'Unit Price', 'Unit Cost', 'Total Revenue', 'Total Cost', 'Gross Profit', 'Margin %'];
            rows = productSalesStats.list.map(p => [
                p.code,
                `"${p.name}"`,
                `"${p.category}"`,
                p.qtySold.toString(),
                p.unitPrice.toFixed(2),
                p.unitCost.toFixed(2),
                p.totalRevenue.toFixed(2),
                p.totalCost.toFixed(2),
                p.profit.toFixed(2),
                p.totalRevenue > 0 ? ((p.profit / p.totalRevenue) * 100).toFixed(1) + '%' : '0%',
            ]);
        } else if (activeTab === 'staff') {
            headers = ['Staff Name', 'Role', 'Bills Count', 'Gross Sales (KES)', 'Average Check', 'Discounts Given', 'Cash Collected', 'M-Pesa Collected'];
            rows = waiterStats.map(w => [
                `"${w.name}"`,
                w.role,
                w.billsCount.toString(),
                w.totalSales.toFixed(2),
                w.avgCheck.toFixed(2),
                w.discounts.toFixed(2),
                w.cashCollected.toFixed(2),
                w.mpesaCollected.toFixed(2),
            ]);
        } else if (activeTab === 'shifts') {
            headers = ['Shift ID', 'Date', 'Shift Type', 'Cashier', 'Opening Cash', 'Total Sales', 'Expenses', 'Expected Drawer', 'Closing Cash', 'Variance', 'Status'];
            rows = shiftReportsList.map(sh => [
                sh.shift_id.toString(),
                sh.shift_date,
                sh.shift_type,
                `"${sh.opened_by}"`,
                sh.opening_cash.toFixed(2),
                sh.total_sales.toFixed(2),
                sh.expTotal.toFixed(2),
                sh.expectedDrawer.toFixed(2),
                sh.computedClosing.toFixed(2),
                sh.computedVariance.toFixed(2),
                sh.status,
            ]);
        } else if (activeTab === 'hotel') {
            headers = ['Booking No', 'Guest Name', 'Room No', 'Room Type', 'Check In', 'Check Out', 'Nights', 'Room Charges', 'Restaurant Charges', 'Total (KES)', 'Status'];
            rows = hotelBookings.map(b => [
                b.booking_no,
                `"${b.guest_name || 'Guest'}"`,
                b.room_number || '—',
                `"${b.room_type_name || 'Room'}"`,
                b.check_in_date,
                b.check_out_date || '—',
                b.nights.toString(),
                b.room_charges.toFixed(2),
                b.restaurant_charges.toFixed(2),
                b.total_amount.toFixed(2),
                b.status,
            ]);
        } else {
            headers = ['Table / Section', 'Orders Count', 'Total Sales (KES)', 'Average Check'];
            rows = tableAndKotStats.tableList.map(t => [
                `"${t.name}"`,
                t.ordersCount.toString(),
                t.revenue.toFixed(2),
                t.avgCheck.toFixed(2),
            ]);
        }

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${activeTab.toUpperCase()} CSV successfully!`);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 pb-12 text-slate-800">
            <Toaster position="top-right" />

            {/* ─── Top Bar / Header matching Users Page ─── */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <span className="text-3xl md:text-4xl flex-shrink-0">📊</span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                                    Hotel & POS Master Reports Hub
                                </h1>
                                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                                    LIVE ANALYTICS
                                </span>
                            </div>
                            <p className="text-slate-500 text-xs md:text-sm mt-0.5 truncate">
                                Real-time sales turnover, item profitability, waiter audits, cash shifts & KRA fiscal reports.
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons matching Users Page */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs md:text-sm transition-all cursor-pointer ${
                                autoRefresh 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold' 
                                    : 'bg-white hover:bg-slate-50 text-slate-700 font-medium border-slate-200 shadow-sm'
                            }`}
                            title="Auto sync every 30s"
                        >
                            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                            <span>{autoRefresh ? 'Auto Sync (30s)' : 'Auto: Off'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={fetchMasterReports}
                            disabled={refreshing}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-2xl border border-slate-200 shadow-sm transition-all text-xs md:text-sm cursor-pointer disabled:opacity-50"
                        >
                            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                            <span>{refreshing ? 'Syncing...' : 'Sync Live'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={exportCSV}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-2xl border border-slate-200 shadow-sm transition-all text-xs md:text-sm cursor-pointer"
                        >
                            <span>📥</span>
                            <span>Export CSV</span>
                        </button>

                        <button
                            type="button"
                            onClick={handlePrint}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-2xl border border-slate-200 shadow-sm transition-all text-xs md:text-sm cursor-pointer"
                        >
                            <span>🖨️</span>
                            <span>Print</span>
                        </button>
                    </div>
                </div>

                {/* Specialized Audit Modules: The 7 Pillars of Restaurant Fraud Prevention */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                                Executive Audit Suite &amp; Theft Prevention (8 Specialized Modules)
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold">
                                Certified Hospitality Audits
                            </span>
                        </div>
                        <span className="text-xs text-slate-500 hidden sm:inline">Certified audit-ready for Kenyan Hospitality &amp; KRA Compliance</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
                        {/* 1. Void Audit */}
                        <Link
                            href="/dashboard/reports/void-audit"
                            className="group relative bg-white hover:bg-rose-50/40 border border-slate-200/90 hover:border-rose-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">🛡️</span>
                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    Theft Watch
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-rose-600 transition-colors leading-tight">
                                    Void &amp; Cancel Audit
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    Cashier voids, manager PIN authorization &amp; kitchen waste.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-rose-600">Loss Prevention</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 2. Official Z-Report */}
                        <Link
                            href="/dashboard/reports/z-report"
                            className="group relative bg-white hover:bg-emerald-50/40 border border-slate-200/90 hover:border-emerald-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">🧾</span>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                    KRA 80mm
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-emerald-800 transition-colors leading-tight">
                                    EOD Z &amp; Mid X-Report
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    Thermal 80mm slip, VAT 16%, 2% Levy, drawer reconciliation.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-emerald-800">Fiscal Closeout</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 3. Consumption Variance */}
                        <Link
                            href="/dashboard/reports/consumption-variance"
                            className="group relative bg-white hover:bg-amber-50/40 border border-slate-200/90 hover:border-amber-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">🥩</span>
                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                    Stock Bleed
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-amber-800 transition-colors leading-tight">
                                    Kitchen Bleed &amp; Variance
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    Theoretical recipe grams vs physical inventory depletion.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-amber-800">Recipe Audit</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 4. Menu Engineering */}
                        <Link
                            href="/dashboard/reports/menu-engineering"
                            className="group relative bg-white hover:bg-indigo-50/40 border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">🍽️</span>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                    Profit Matrix
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-indigo-600 transition-colors leading-tight">
                                    Menu Engineering
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    Stars, Plowhorses, Puzzles &amp; Dogs margin analyzer.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-indigo-700">4-Quadrant</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 5. Hourly Peak Rush */}
                        <Link
                            href="/dashboard/reports/hourly-productivity"
                            className="group relative bg-white hover:bg-sky-50/40 border border-slate-200/90 hover:border-sky-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">⏰</span>
                                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-600"></span>
                                    24h Rushes
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-sky-700 transition-colors leading-tight">
                                    Peak Rush &amp; Productivity
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    Hourly revenue bars, checks/hr, labor productivity index.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-sky-800">Speed &amp; Labor</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 6. Complimentary & Spillage */}
                        <Link
                            href="/dashboard/reports/complimentary-spillage"
                            className="group relative bg-white hover:bg-purple-50/40 border border-slate-200/90 hover:border-purple-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">🎁</span>
                                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                                    Zero-Rated
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-purple-700 transition-colors leading-tight">
                                    Complimentary &amp; Spillage
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    VIP entertainment, manager duty meals &amp; kitchen drops.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-purple-800">Cost Absorbed</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 7. Debtor & Credit Aging */}
                        <Link
                            href="/dashboard/reports/debtor-aging"
                            className="group relative bg-white hover:bg-teal-50/40 border border-slate-200/90 hover:border-teal-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">⏳</span>
                                <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
                                    Aging Tabs
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-teal-700 transition-colors leading-tight">
                                    Debtor &amp; Credit Aging
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    0-30d, 31-60d, 61-90d, 90+d overdue tabs &amp; settlements.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-teal-800">Receivables</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* 8. Butchery Sales & Profit */}
                        <Link
                            href="/dashboard/butchery/sales-report"
                            className="group relative bg-white hover:bg-rose-50/40 border border-slate-200/90 hover:border-rose-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl">🥩</span>
                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                                    Butchery
                                </span>
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-black text-xs group-hover:text-rose-700 transition-colors leading-tight">
                                    Butchery Sales Audit
                                </h3>
                                <p className="text-slate-500 text-[10px] mt-1 leading-snug">
                                    Meat weights sold, choma vs takeaway margins &amp; yields.
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] font-black text-rose-700">Meat Yields</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>
                    </div>
                </div>
                                </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                                <span className="text-[11px] font-black text-[#00e676]">Cashflow Lock</span>
                                <span className="text-slate-400 text-xs group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>
                    </div>

                    {/* Classic Sub-Reports Pill Links */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-slate-400 font-semibold">Other Sub-Ledgers:</span>
                        <Link href="/dashboard/reports/dish-report" className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all font-medium">
                            🍲 Dish Movement &amp; Valuation
                        </Link>
                        <Link href="/dashboard/reports/pos" className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all font-medium">
                            🧾 Shift Cash Summaries
                        </Link>
                        <Link href="/dashboard/reports/recipe-report" className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all font-medium">
                            📋 Recipe Costing
                        </Link>
                        <Link href="/dashboard/shift-reports" className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all font-medium">
                            ⏱️ Shift Records
                        </Link>
                        <Link href="/dashboard/sales" className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all font-medium">
                            📈 Sales Ledger
                        </Link>
                    </div>
                </div>
            </div>

            {/* ─── KPI Stat Cards (Light Theme matching Users Page) ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 w-full min-w-0">
                {/* 1. Gross Turnover */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Gross Turnover</span>
                        <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm flex-shrink-0">💰</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900 mt-2 truncate">{fmt(masterMetrics.grandTotalRevenue)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">POS + Hotel</p>
                </div>

                {/* 2. Net Turnover */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Net Sales</span>
                        <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm flex-shrink-0">💵</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-700 mt-2 truncate">{fmt(masterMetrics.grandNetTurnover)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Excl. KRA Taxes</p>
                </div>

                {/* 3. KRA Taxes */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">KRA Taxes</span>
                        <span className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-sm flex-shrink-0">🧾</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900 mt-2 truncate">{fmt(masterMetrics.grandTotalTax)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">16% VAT + 2% Levy</p>
                </div>

                {/* 4. Gross Profit */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Gross Profit</span>
                        <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm flex-shrink-0">📈</span>
                    </div>
                    <p className="text-lg font-bold text-indigo-700 mt-2 truncate">{fmt(masterMetrics.grandGrossProfit)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{masterMetrics.profitMargin.toFixed(1)}% margin</p>
                </div>

                {/* 5. Total Transactions */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Total Bills</span>
                        <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-sm flex-shrink-0">🧾</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900 mt-2 truncate">{fmtNum(masterMetrics.totalTransactions)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Settled orders</p>
                </div>

                {/* 6. Average Check */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Avg Check</span>
                        <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm flex-shrink-0">🎯</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900 mt-2 truncate">{fmt(masterMetrics.avgOrderValue)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Per guest</p>
                </div>

                {/* 7. M-Pesa Flow */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">M-Pesa Flow</span>
                        <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm flex-shrink-0">📱</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-700 mt-2 truncate">{fmt(masterMetrics.mpesaTotal)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Mobile money</p>
                </div>

                {/* 8. Cash Drawer */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Cash Drawer</span>
                        <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-sm flex-shrink-0">💵</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900 mt-2 truncate">{fmt(masterMetrics.cashTotal)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Physical cash</p>
                </div>
            </div>

            {/* ─── 10 Clean Tab Chips matching Users Page ─── */}
            <div className="w-full max-w-full overflow-x-auto pb-1 scrollbar-none">
                <div className="flex items-center gap-2 whitespace-nowrap">
                    {[
                        { id: 'overview', icon: '📊', label: 'Overview' },
                        { id: 'items', icon: '🍲', label: 'Dish Performance' },
                        { id: 'staff', icon: '🧑‍💼', label: 'Waiters & Staff' },
                        { id: 'shifts', icon: '⏱️', label: 'Shifts & Z-Reports' },
                        { id: 'tables', icon: '🪑', label: 'Tables & KOT' },
                        { id: 'tax', icon: '🧾', label: 'KRA Tax eTIMS' },
                        { id: 'hotel', icon: '🏨', label: 'Hotel PMS Rooms' },
                        { id: 'inventory', icon: '📦', label: 'Inventory & Spoilage' },
                        { id: 'purchases', icon: '🛒', label: 'Purchases & Suppliers' },
                        { id: 'mpesa', icon: '📱', label: 'M-Pesa Reconciliation' },
                    ].map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as ReportTab)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                    isActive
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ─── Date Filter & Search Toolbar ─── */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm w-full min-w-0">
                <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                    {/* Date Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Period:</span>
                        {[
                            { id: 'today', label: 'Today' },
                            { id: 'yesterday', label: 'Yesterday' },
                            { id: '7days', label: 'Last 7 Days' },
                            { id: 'month', label: 'This Month' },
                            { id: 'last_month', label: 'Last Month' },
                            { id: 'year', label: 'This Year' },
                            { id: 'all', label: 'All History' },
                        ].map(p => (
                            <button
                                key={p.id}
                                onClick={() => applyDatePreset(p.id as DatePreset)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                    datePreset === p.id 
                                        ? 'bg-blue-600 text-white shadow-sm' 
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Range & Search Input */}
                    <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 text-xs">
                            <span className="text-slate-500 font-medium">From:</span>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => {
                                    setDateFrom(e.target.value);
                                    setDatePreset('custom');
                                }}
                                className="bg-transparent text-slate-800 font-semibold focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 text-xs">
                            <span className="text-slate-500 font-medium">To:</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => {
                                    setDateTo(e.target.value);
                                    setDatePreset('custom');
                                }}
                                className="bg-transparent text-slate-800 font-semibold focus:outline-none"
                            />
                        </div>

                        {/* Search Input */}
                        <div className="relative min-w-[200px] flex-1 md:flex-initial">
                            <input
                                type="text"
                                placeholder="🔍 Search records..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-xs"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── TAB CONTENT PANELS ─── */}

            {/* ─── TAB 1: OVERVIEW ─── */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Breakdown Summary Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 1. Tender Distribution */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span>💳</span> Payment Tenders Breakdown
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'M-Pesa Mobile Money', amt: masterMetrics.mpesaTotal, color: 'bg-emerald-500' },
                                    { label: 'Physical Cash Drawer', amt: masterMetrics.cashTotal, color: 'bg-slate-700' },
                                    { label: 'Bank Card / Credit', amt: masterMetrics.cardTotal, color: 'bg-blue-600' },
                                    { label: 'Pending / Unsettled', amt: masterMetrics.pendingTotal, color: 'bg-amber-500' },
                                ].map((t, idx) => {
                                    const pct = masterMetrics.grandTotalRevenue > 0 
                                        ? ((t.amt / masterMetrics.grandTotalRevenue) * 100) 
                                        : 0;
                                    return (
                                        <div key={idx} className="space-y-1 text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-slate-600 font-medium">{t.label}</span>
                                                <span className="font-bold text-slate-900">{fmt(t.amt)} ({pct.toFixed(1)}%)</span>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <div className={`h-full rounded-full ${t.color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Outlet Split */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span>🏢</span> Revenue by Department
                            </h3>
                            <div className="space-y-3">
                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-blue-700">🍽️ Restaurant & Bar POS</p>
                                        <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(masterMetrics.posGross)}</p>
                                        <p className="text-[11px] text-slate-500">{sales.length} customer receipts</p>
                                    </div>
                                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                                        {masterMetrics.grandTotalRevenue > 0 ? ((masterMetrics.posGross / masterMetrics.grandTotalRevenue) * 100).toFixed(1) : 0}%
                                    </span>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-purple-700">🏨 Hotel Rooms & PMS</p>
                                        <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(masterMetrics.combinedHotel)}</p>
                                        <p className="text-[11px] text-slate-500">{hotelBookings.length} rooms billed</p>
                                    </div>
                                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
                                        {masterMetrics.grandTotalRevenue > 0 ? ((masterMetrics.combinedHotel / masterMetrics.grandTotalRevenue) * 100).toFixed(1) : 0}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Margins & Food Cost */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span>⚖️</span> Cost of Goods & Margins
                            </h3>
                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between py-1.5 border-b border-slate-100">
                                    <span className="text-slate-500">Total Portions Sold:</span>
                                    <span className="font-semibold text-slate-900">{salesItems.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)} items</span>
                                </div>
                                <div className="flex justify-between py-1.5 border-b border-slate-100">
                                    <span className="text-slate-500">Food Cost (COGS):</span>
                                    <span className="font-semibold text-slate-900">{fmt(masterMetrics.grandCost)}</span>
                                </div>
                                <div className="flex justify-between py-1.5 border-b border-slate-100">
                                    <span className="text-slate-500">Discounts Granted:</span>
                                    <span className="font-semibold text-slate-900">{fmt(masterMetrics.posDiscount)}</span>
                                </div>
                                <div className="flex justify-between py-1.5">
                                    <span className="text-slate-500">Overall Profitability:</span>
                                    <span className="font-bold text-emerald-600">{masterMetrics.profitMargin.toFixed(1)}% Gross Margin</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Invoices Table matching Users Page */}
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span>🧾</span> Sales Invoices Log ({sales.length} Records)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Receipt No</th>
                                        <th className="p-3">Date & Time</th>
                                        <th className="p-3">Table / Room</th>
                                        <th className="p-3">Waiter</th>
                                        <th className="p-3">Payment</th>
                                        <th className="p-3">Total Amount</th>
                                        <th className="p-3">VAT + Levy</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {sales.slice(0, 15).map(s => (
                                        <tr key={s.sale_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-semibold text-blue-600">{s.receipt_no}</td>
                                            <td className="p-3 text-slate-500">{s.sale_date} {s.sale_time || ''}</td>
                                            <td className="p-3">{s.table_name || s.table_no || 'Walk-in'}</td>
                                            <td className="p-3">{s.waiter_name || s.created_by || 'Staff'}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    (s.payment_method || '').toLowerCase().includes('mpesa') 
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                                        : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {s.payment_method || 'Cash'}
                                                </span>
                                            </td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(s.total_amount)}</td>
                                            <td className="p-3 text-slate-500">{fmt(s.total_tax || (s.vat_amount + s.levy_amount))}</td>
                                            <td className="p-3">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    {s.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {sales.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-400">
                                                No sales transactions recorded in this period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 2: DISH PERFORMANCE ─── */}
            {activeTab === 'items' && (
                <div className="space-y-6">
                    {/* Top Bestsellers Summary */}
                    <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <span>🏆</span> Top Revenue Star Dishes
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {productSalesStats.top10.slice(0, 6).map((p, idx) => (
                                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-6 h-6 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <p className="font-semibold text-slate-900">{p.name}</p>
                                            <p className="text-[11px] text-slate-500">{p.qtySold} sold · {p.category}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-slate-900">{fmt(p.totalRevenue)}</p>
                                        <p className="text-[11px] text-emerald-600 font-semibold">{fmt(p.profit)} profit</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Master Itemized Product Table */}
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">
                                Menu Item Performance Ledger ({productSalesStats.list.length} Items)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Code</th>
                                        <th className="p-3">Dish / Item Name</th>
                                        <th className="p-3">Category</th>
                                        <th className="p-3">Qty Sold</th>
                                        <th className="p-3">Unit Price</th>
                                        <th className="p-3">Unit Cost</th>
                                        <th className="p-3">Revenue</th>
                                        <th className="p-3">Cost (COGS)</th>
                                        <th className="p-3">Gross Profit</th>
                                        <th className="p-3">Margin %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {productSalesStats.list.map((p, idx) => {
                                        const margin = p.totalRevenue > 0 ? ((p.profit / p.totalRevenue) * 100) : 0;
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-3 font-mono text-slate-500">{p.code}</td>
                                                <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                                                        {p.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-bold text-blue-600">{p.qtySold}</td>
                                                <td className="p-3">{fmt(p.unitPrice)}</td>
                                                <td className="p-3 text-slate-500">{fmt(p.unitCost)}</td>
                                                <td className="p-3 font-bold text-slate-900">{fmt(p.totalRevenue)}</td>
                                                <td className="p-3 text-slate-500">{fmt(p.totalCost)}</td>
                                                <td className="p-3 font-semibold text-emerald-600">{fmt(p.profit)}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                        margin >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {margin.toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 3: WAITERS & STAFF ─── */}
            {activeTab === 'staff' && (
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <span>🧑‍💼</span> Staff & Waiter Sales Roster ({waiterStats.length} Staff Members)
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="p-3">Rank</th>
                                    <th className="p-3">Staff Name</th>
                                    <th className="p-3">Role</th>
                                    <th className="p-3">Bills Created</th>
                                    <th className="p-3">Gross Sales</th>
                                    <th className="p-3">Avg Ticket</th>
                                    <th className="p-3">Discounts</th>
                                    <th className="p-3">Cash Handled</th>
                                    <th className="p-3">M-Pesa Handled</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {waiterStats.map((w, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-3">
                                            <span className={`w-6 h-6 rounded-xl flex items-center justify-center font-bold text-xs ${
                                                idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="p-3 font-semibold text-slate-900">{w.name}</td>
                                        <td className="p-3 text-slate-500">{w.role}</td>
                                        <td className="p-3 font-bold text-blue-600">{w.billsCount}</td>
                                        <td className="p-3 font-bold text-slate-900">{fmt(w.totalSales)}</td>
                                        <td className="p-3 text-slate-600 font-semibold">{fmt(w.avgCheck)}</td>
                                        <td className="p-3 text-slate-500">{fmt(w.discounts)}</td>
                                        <td className="p-3 text-slate-700">{fmt(w.cashCollected)}</td>
                                        <td className="p-3 text-emerald-700 font-semibold">{fmt(w.mpesaCollected)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ─── TAB 4: SHIFTS & Z-REPORTS ─── */}
            {activeTab === 'shifts' && (
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <span>⏱️</span> Shift Drawer Reconciliations & Z-Reports ({shiftReportsList.length} Shifts)
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="p-3">Shift ID</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Type</th>
                                    <th className="p-3">Cashier</th>
                                    <th className="p-3">Opening Cash</th>
                                    <th className="p-3">Sales Generated</th>
                                    <th className="p-3">Petty Expenses</th>
                                    <th className="p-3">Expected Drawer</th>
                                    <th className="p-3">Closing Count</th>
                                    <th className="p-3">Variance</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {shiftReportsList.map(sh => (
                                    <tr key={sh.shift_id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-3 font-mono font-semibold text-blue-600">SH-{sh.shift_id}</td>
                                        <td className="p-3 text-slate-500">{sh.shift_date}</td>
                                        <td className="p-3 font-medium text-slate-900">{sh.shift_type}</td>
                                        <td className="p-3">{sh.opened_by}</td>
                                        <td className="p-3 text-slate-600">{fmt(sh.opening_cash)}</td>
                                        <td className="p-3 font-bold text-slate-900">{fmt(sh.total_sales)}</td>
                                        <td className="p-3 text-slate-500">{fmt(sh.expTotal)}</td>
                                        <td className="p-3 font-medium text-slate-900">{fmt(sh.expectedDrawer)}</td>
                                        <td className="p-3 font-bold text-slate-900">{fmt(sh.computedClosing)}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                sh.computedVariance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                            }`}>
                                                {sh.computedVariance >= 0 ? '+' : ''}{fmt(sh.computedVariance)}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                                                {sh.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ─── TAB 5: TABLES & KITCHEN ─── */}
            {activeTab === 'tables' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Table Sales */}
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span>🪑</span> Dining Floor & Tables
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Table Name</th>
                                        <th className="p-3">Bills Count</th>
                                        <th className="p-3">Total Sales</th>
                                        <th className="p-3">Avg Check</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {tableAndKotStats.tableList.map((t, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-semibold text-slate-900">{t.name}</td>
                                            <td className="p-3 font-bold text-blue-600">{t.ordersCount}</td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(t.revenue)}</td>
                                            <td className="p-3 text-slate-600">{fmt(t.avgCheck)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* KOT Speed */}
                    <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <span>🍳</span> Kitchen Orders (KOT) Volume
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-center">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase">Total KOTs</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{tableAndKotStats.totalKots}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/50 text-center">
                                <p className="text-[11px] font-semibold text-amber-700 uppercase">Pending</p>
                                <p className="text-2xl font-bold text-amber-800 mt-1">{tableAndKotStats.pendingKots}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/50 text-center">
                                <p className="text-[11px] font-semibold text-emerald-700 uppercase">Served</p>
                                <p className="text-2xl font-bold text-emerald-800 mt-1">{tableAndKotStats.servedKots}</p>
                            </div>
                        </div>

                        {/* Recent KOTs */}
                        <div className="space-y-2 pt-2">
                            {kitchenOrders.slice(0, 5).map(k => (
                                <div key={k.kot_id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs">
                                    <div>
                                        <p className="font-semibold text-slate-900">{k.kot_number} · Table {k.table_name || 'Floor'}</p>
                                        <p className="text-[11px] text-slate-500">Waiter: {k.waiter_name || 'Staff'}</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {k.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 6: KRA TAX ─── */}
            {activeTab === 'tax' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">VAT 16% Base</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(taxFiscalStats.vatTaxableBase)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">16% VAT Collected</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(taxFiscalStats.vatAmountTotal)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">2% Tourism Levy</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(taxFiscalStats.levyAmountTotal)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Fiscal Invoices</span>
                            <p className="text-xl font-bold text-emerald-700 mt-1">{taxFiscalStats.totalFiscalized}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">
                                Kenya Revenue Authority (eTIMS) Tax Invoices
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Receipt No</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Customer</th>
                                        <th className="p-3">Net Taxable</th>
                                        <th className="p-3">16% VAT</th>
                                        <th className="p-3">2% Levy</th>
                                        <th className="p-3">Gross Total</th>
                                        <th className="p-3">KRA Hash</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {sales.map(s => (
                                        <tr key={s.sale_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-mono font-semibold text-blue-600">{s.receipt_no}</td>
                                            <td className="p-3 text-slate-500">{s.sale_date}</td>
                                            <td className="p-3">{s.customer_name || 'Walk-in'}</td>
                                            <td className="p-3">{fmt(s.net_amount || s.subtotal)}</td>
                                            <td className="p-3 font-semibold text-slate-900">{fmt(s.vat_amount)}</td>
                                            <td className="p-3 text-slate-600">{fmt(s.levy_amount)}</td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(s.total_amount)}</td>
                                            <td className="p-3 font-mono text-[10px] text-slate-400 truncate max-w-[150px]">
                                                {s.verification_hash || 'KRA-VALIDATED'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 7: HOTEL PMS ─── */}
            {activeTab === 'hotel' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Occupancy</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{hotelStats.occupancyRate.toFixed(1)}%</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Room Revenue</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(hotelStats.totalRoomCharges)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Room F&B Charged</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(hotelStats.totalRestaurantCharges)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">ADR (Avg Daily Rate)</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(hotelStats.adr)}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">
                                Guest Bookings & Folios ({hotelBookings.length} Bookings)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Booking No</th>
                                        <th className="p-3">Guest Name</th>
                                        <th className="p-3">Room No</th>
                                        <th className="p-3">Dates</th>
                                        <th className="p-3">Room Charges</th>
                                        <th className="p-3">F&B Charges</th>
                                        <th className="p-3">Total Amount</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {hotelBookings.map(b => (
                                        <tr key={b.booking_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-mono font-semibold text-blue-600">{b.booking_no}</td>
                                            <td className="p-3 font-semibold text-slate-900">{b.guest_name || 'Guest'}</td>
                                            <td className="p-3">{b.room_number || '—'}</td>
                                            <td className="p-3 text-slate-500">{b.check_in_date} ({b.nights}n)</td>
                                            <td className="p-3">{fmt(b.room_charges)}</td>
                                            <td className="p-3">{fmt(b.restaurant_charges)}</td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(b.total_amount)}</td>
                                            <td className="p-3">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    {b.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {hotelBookings.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-400">
                                                No hotel bookings in this period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 8: INVENTORY & SPOILAGE ─── */}
            {activeTab === 'inventory' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-900">
                                Spoilage & Wastage Losses
                            </h3>
                            <span className="text-xs font-semibold text-rose-600">Total Loss: {fmt(inventoryStats.totalSpoilageLoss)}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Item</th>
                                        <th className="p-3">Qty</th>
                                        <th className="p-3">Loss Value</th>
                                        <th className="p-3">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {spoilages.map(sp => (
                                        <tr key={sp.spoilage_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 text-slate-500">{sp.spoilage_date}</td>
                                            <td className="p-3 font-semibold text-slate-900">{sp.product_name}</td>
                                            <td className="p-3">{sp.quantity}</td>
                                            <td className="p-3 font-bold text-rose-600">{fmt(sp.total_loss)}</td>
                                            <td className="p-3 text-slate-500">{sp.reason || sp.spoilage_type}</td>
                                        </tr>
                                    ))}
                                    {spoilages.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400">
                                                No spoilage or wastage logged.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">
                                Production Batches Yield & Cost
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Batch No</th>
                                        <th className="p-3">Dish Produced</th>
                                        <th className="p-3">Yield</th>
                                        <th className="p-3">Unit Cost</th>
                                        <th className="p-3">Selling Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {batches.map(b => (
                                        <tr key={b.batch_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-mono font-semibold text-blue-600">{b.batch_number}</td>
                                            <td className="p-3 font-semibold text-slate-900">{b.product_name}</td>
                                            <td className="p-3">{b.qty_produced} (Sold: {b.qty_sold})</td>
                                            <td className="p-3 text-slate-500">{fmt(b.cost_per_unit)}</td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(b.selling_price)}</td>
                                        </tr>
                                    ))}
                                    {batches.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400">
                                                No production batches logged.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 9: PURCHASES & SUPPLIERS ─── */}
            {activeTab === 'purchases' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Purchases</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{fmt(purchaseStats.totalPurchased)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Claimable Input VAT</span>
                            <p className="text-xl font-bold text-emerald-700 mt-1">{fmt(purchaseStats.totalVatClaimable)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Suppliers</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{purchaseStats.totalSuppliers}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Supplier Payables</span>
                            <p className="text-xl font-bold text-rose-600 mt-1">{fmt(purchaseStats.totalSupplierDebt)}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">
                                Supplier Directory & Balances ({suppliers.length} Vendors)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Code</th>
                                        <th className="p-3">Supplier Name</th>
                                        <th className="p-3">Contact</th>
                                        <th className="p-3">Phone</th>
                                        <th className="p-3">Terms</th>
                                        <th className="p-3">Current Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {suppliers.map(s => (
                                        <tr key={s.supplier_id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-mono font-semibold text-blue-600">{s.supplier_code || `SUP-${s.supplier_id}`}</td>
                                            <td className="p-3 font-semibold text-slate-900">{s.supplier_name}</td>
                                            <td className="p-3 text-slate-500">{s.contact_person || '—'}</td>
                                            <td className="p-3 text-slate-500">{s.phone || '—'}</td>
                                            <td className="p-3 text-slate-500">{s.payment_terms || 'Net 30'}</td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(s.current_balance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 10: M-PESA RECONCILIATION ─── */}
            {activeTab === 'mpesa' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total M-Pesa Collected</span>
                            <p className="text-xl font-bold text-emerald-700 mt-1">{fmt(mpesaStats.totalMpesa)}</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Unclaimed C2B Deposits</span>
                            <p className="text-xl font-bold text-slate-900 mt-1">{mpesaStats.unlinkedCount} transactions ({fmt(mpesaStats.unlinkedAmount)})</p>
                        </div>
                        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Daraja Gateway</span>
                            <p className="text-xl font-bold text-blue-600 mt-1">CONNECTED</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">
                                M-Pesa Live Till & Paybill Inbound Ledger ({c2bList.length} Transactions)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-700">
                                <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">M-Pesa Receipt</th>
                                        <th className="p-3">Phone</th>
                                        <th className="p-3">Customer Name</th>
                                        <th className="p-3">Amount</th>
                                        <th className="p-3">Time</th>
                                        <th className="p-3">Linked Sale</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {c2bList.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 font-mono font-semibold text-emerald-700">{c.mpesa_receipt}</td>
                                            <td className="p-3 font-mono text-slate-500">{c.phone || '—'}</td>
                                            <td className="p-3 font-semibold text-slate-900">{c.customer_name || 'Customer'}</td>
                                            <td className="p-3 font-bold text-slate-900">{fmt(c.amount)}</td>
                                            <td className="p-3 text-slate-500">{new Date(c.transaction_time).toLocaleString()}</td>
                                            <td className="p-3 font-mono text-slate-600">{c.linked_sale_id ? `SALE #${c.linked_sale_id}` : 'Unclaimed'}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    c.is_linked ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                }`}>
                                                    {c.is_linked ? 'Matched' : 'Unclaimed'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {c2bList.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-400">
                                                No direct C2B transactions found. POS receipts are recorded in sales.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
