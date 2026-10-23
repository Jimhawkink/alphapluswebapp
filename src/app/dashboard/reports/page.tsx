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
    const [departmentFilter, setDepartmentFilter] = useState<'all' | 'pos' | 'hotel' | 'kitchen'>('all');
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
    const [lastSyncTime, setLastSyncTime] = useState<string>('');
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Records
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [salesItems, setSalesItems] = useState<SaleItemRecord[]>([]);
    const [shifts, setShifts] = useState<ShiftRecord[]>([]);
    const [shiftExpenses, setShiftExpenses] = useState<ShiftExpense[]>([]);
    const [shiftDrops, setShiftDrops] = useState<ShiftCashDrop[]>([]);
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

    // Drilldown Modals
    const [selectedShiftForModal, setSelectedShiftForModal] = useState<ShiftRecord | null>(null);
    const [selectedWaiterForModal, setSelectedWaiterForModal] = useState<string | null>(null);

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
            const fromIso = `${dateFrom}T00:00:00`;
            const toIso = `${dateTo}T23:59:59`;

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

            // 4. Fetch Shift Expenses & Drops
            const { data: expData } = await supabase
                .from('shift_expenses')
                .select('*')
                .order('recorded_at', { ascending: false });
            setShiftExpenses((expData || []) as ShiftExpense[]);

            const { data: dropsData } = await supabase
                .from('shift_cash_drops')
                .select('*')
                .order('drop_time', { ascending: false });
            setShiftDrops((dropsData || []) as ShiftCashDrop[]);

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

            setLastSyncTime(new Date().toLocaleTimeString());
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
        const slow10 = list.filter(p => p.qtySold > 0).slice(-10);

        return { list, top10, slow10 };
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
            // Find sales during shift if shift_id matched
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

        // KOT Speed Stats
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
        let zeroRatedAmount = 0;

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
            zeroRatedAmount,
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
            spoilagesCount: spoilages.length,
            batchesCount: batches.length,
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
            headers = ['Receipt No', 'Date', 'Time', 'Customer', 'Waiter', 'Payment Method', 'Net Amount', 'VAT (16%)', 'Levy (2%)', 'Total (KES)', 'Status', 'KRA Hash'];
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
                s.verification_hash || '—',
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
        } else if (activeTab === 'inventory') {
            headers = ['Spoilage ID', 'Date', 'Product', 'Quantity', 'Unit Cost', 'Loss Amount', 'Type', 'Reason', 'Recorded By'];
            rows = spoilages.map(sp => [
                sp.spoilage_id.toString(),
                sp.spoilage_date,
                `"${sp.product_name}"`,
                sp.quantity.toString(),
                sp.unit_cost.toFixed(2),
                sp.total_loss.toFixed(2),
                sp.spoilage_type,
                `"${sp.reason || 'None'}"`,
                `"${sp.recorded_by || 'Staff'}"`,
            ]);
        } else if (activeTab === 'purchases') {
            headers = ['Purchase No', 'Date', 'Supplier', 'Invoice No', 'Sub Total', 'VAT', 'Grand Total', 'Status', 'Payment'];
            rows = purchases.map(p => [
                p.purchase_no,
                p.purchase_date,
                `"${p.supplier_name || 'Supplier'}"`,
                p.supplier_invoice || '—',
                p.sub_total.toFixed(2),
                p.vat.toFixed(2),
                p.grand_total.toFixed(2),
                p.status,
                p.payment_status,
            ]);
        } else if (activeTab === 'mpesa') {
            headers = ['Receipt No', 'Phone', 'Customer', 'Amount (KES)', 'Time', 'Linked Sale ID', 'Match Status'];
            rows = c2bList.map(c => [
                c.mpesa_receipt,
                c.phone || '—',
                `"${c.customer_name || 'Customer'}"`,
                c.amount.toFixed(2),
                c.transaction_time,
                c.linked_sale_id ? c.linked_sale_id.toString() : '—',
                c.is_linked ? 'Matched' : 'Unclaimed',
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

    // ─── NATIVE PRINT ACTION ───────────────────────────────────────────────────
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-3 md:p-6 space-y-6">
            <Toaster position="top-right" />

            {/* ─── PRINT CSS STYLING ─── */}
            <style jsx global>{`
                @media print {
                    body {
                        background: #ffffff !important;
                        color: #000000 !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    .print-clean {
                        border: 1px solid #cbd5e1 !important;
                        box-shadow: none !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                    }
                }
            `}</style>

            {/* ─── HEADER & REAL-TIME CONTROLS ─── */}
            <div className="no-print bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 text-2xl font-black">
                            📊
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                                    AlphaPlus Master Reports & Analytics
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    LIVE DB V2.4
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 font-medium">
                                Comprehensive POS Ledger, Hotel PMS, KRA eTIMS Tax, Shifts Z-Reports, Waiters & Inventory Costing
                            </p>
                        </div>
                    </div>

                    {/* Top Right Actions */}
                    <div className="flex items-center gap-2 flex-wrap self-stretch lg:self-auto justify-end">
                        {/* Auto-Refresh Toggle */}
                        <button
                            type="button"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                                autoRefresh 
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' 
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                            title="Auto sync every 30s"
                        >
                            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                            <span>{autoRefresh ? 'Live (30s)' : 'Auto: Off'}</span>
                        </button>

                        {/* Live Sync Button */}
                        <button
                            type="button"
                            onClick={fetchMasterReports}
                            disabled={refreshing}
                            className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                            <span>{refreshing ? 'Syncing...' : 'Sync Live'}</span>
                        </button>

                        {/* Export CSV */}
                        <button
                            type="button"
                            onClick={exportCSV}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>📥</span>
                            <span>Export CSV</span>
                        </button>

                        {/* Print Report */}
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>🖨️</span>
                            <span>Print Report</span>
                        </button>
                    </div>
                </div>

                {/* ─── DATE PRESETS & CUSTOM RANGE PICKER ─── */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                    {/* Date Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider mr-1">Period:</span>
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
                                type="button"
                                onClick={() => applyDatePreset(p.id as DatePreset)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    datePreset === p.id 
                                        ? 'bg-indigo-600 text-white shadow-sm' 
                                        : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Range Inputs */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                            <span className="text-slate-400 font-bold">From:</span>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => {
                                    setDateFrom(e.target.value);
                                    setDatePreset('custom');
                                }}
                                className="bg-transparent text-white focus:outline-none font-bold"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                            <span className="text-slate-400 font-bold">To:</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => {
                                    setDateTo(e.target.value);
                                    setDatePreset('custom');
                                }}
                                className="bg-transparent text-white focus:outline-none font-bold"
                            />
                        </div>

                        {/* Search Filter */}
                        <div className="relative min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search active report..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1.5 text-slate-400 hover:text-white text-xs"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sub-Reports Quick Links */}
                <div className="mt-4 pt-3 border-t border-slate-800/50 flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-slate-500 font-bold">Quick Specialized Reports:</span>
                    <Link href="/dashboard/reports/dish-report" className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-indigo-400 border border-indigo-900/40 hover:border-indigo-500 transition-all font-bold">
                        🍲 Dish Movement & Valuation
                    </Link>
                    <Link href="/dashboard/reports/pos" className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-emerald-400 border border-emerald-900/40 hover:border-emerald-500 transition-all font-bold">
                        🧾 Shift Cash Summaries
                    </Link>
                    <Link href="/dashboard/reports/recipe-report" className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-pink-400 border border-pink-900/40 hover:border-pink-500 transition-all font-bold">
                        📋 Recipe Costing & Food Margins
                    </Link>
                    <Link href="/dashboard/shift-reports" className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-amber-900/40 hover:border-amber-500 transition-all font-bold">
                        ⏱️ Shift Records Hub
                    </Link>
                    <Link href="/dashboard/sales" className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-cyan-400 border border-cyan-900/40 hover:border-cyan-500 transition-all font-bold">
                        📈 Live Sales Ledger
                    </Link>
                </div>
            </div>

            {/* ─── 8 MASSIVE HIGH-CONTRAST MASTER KPI CARDS ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* 1. Grand Turnover */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">💰 Gross Turnover</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmt(masterMetrics.grandTotalRevenue)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">POS + Hotel Rooms</p>
                </div>

                {/* 2. Net Sales Turnover */}
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-900 border border-emerald-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-emerald-300 tracking-wider">💵 Net Turnover</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmt(masterMetrics.grandNetTurnover)}</p>
                    <p className="text-[10px] text-emerald-400 mt-0.5 font-bold">Excl. KRA Taxes</p>
                </div>

                {/* 3. KRA Taxes Collected */}
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-950 via-slate-900 to-orange-900 border border-amber-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-amber-300 tracking-wider">🧾 KRA Taxes</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmt(masterMetrics.grandTotalTax)}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5 font-bold">VAT 16% + Levy 2%</p>
                </div>

                {/* 4. Gross Profit */}
                <div className="relative overflow-hidden bg-gradient-to-br from-purple-950 via-slate-900 to-purple-900 border border-purple-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-purple-300 tracking-wider">📈 Gross Profit</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmt(masterMetrics.grandGrossProfit)}</p>
                    <p className="text-[10px] text-purple-400 mt-0.5 font-bold">{masterMetrics.profitMargin.toFixed(1)}% margin</p>
                </div>

                {/* 5. Total Transactions */}
                <div className="relative overflow-hidden bg-gradient-to-br from-cyan-950 via-slate-900 to-cyan-900 border border-cyan-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-cyan-300 tracking-wider">🧾 Total Bills</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmtNum(masterMetrics.totalTransactions)}</p>
                    <p className="text-[10px] text-cyan-400 mt-0.5 font-medium">Orders settled</p>
                </div>

                {/* 6. Average Spend (AOV) */}
                <div className="relative overflow-hidden bg-gradient-to-br from-sky-950 via-slate-900 to-blue-900 border border-sky-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-sky-300 tracking-wider">🎯 Avg Check</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmt(masterMetrics.avgOrderValue)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Per dining guest</p>
                </div>

                {/* 7. M-Pesa Digital Flow */}
                <div className="relative overflow-hidden bg-gradient-to-br from-green-950 via-slate-900 to-emerald-950 border border-green-800/50 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-green-300 tracking-wider">📱 M-Pesa Flow</p>
                    <p className="text-lg font-black text-emerald-400 mt-1 truncate">{fmt(masterMetrics.mpesaTotal)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Paybill & Till</p>
                </div>

                {/* 8. Cash Drawer Tenders */}
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-3.5 shadow-lg">
                    <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">💵 Cash Drawer</p>
                    <p className="text-lg font-black text-white mt-1 truncate">{fmt(masterMetrics.cashTotal)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Physical cash</p>
                </div>
            </div>

            {/* ─── 10 SUPER COMPREHENSIVE TABS SELECTOR ─── */}
            <div className="no-print bg-slate-950 border border-slate-800 p-1.5 rounded-2xl shadow-xl flex items-center gap-1.5 overflow-x-auto">
                {[
                    { id: 'overview', icon: '📊', label: 'Master Overview' },
                    { id: 'items', icon: '🍲', label: 'Dish Performance' },
                    { id: 'staff', icon: '🧑‍💼', label: 'Waiters & Staff' },
                    { id: 'shifts', icon: '⏱️', label: 'Shifts & Z-Reports' },
                    { id: 'tables', icon: '🪑', label: 'Tables & KOT' },
                    { id: 'tax', icon: '🧾', label: 'KRA Tax eTIMS' },
                    { id: 'hotel', icon: '🏨', label: 'Hotel PMS Rooms' },
                    { id: 'inventory', icon: '📦', label: 'Inventory & Spoilage' },
                    { id: 'purchases', icon: '🛒', label: 'Purchases & Suppliers' },
                    { id: 'mpesa', icon: '📱', label: 'M-Pesa Reconciliation' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as ReportTab)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                            activeTab === tab.id
                                ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white shadow-lg shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ─── TAB CONTENT CONTAINERS ─── */}

            {/* ─── TAB 1: MASTER OVERVIEW ─── */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Tender & Channel Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 1. Tender Breakdown Card */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                <span>💳</span> Payment Tenders Distribution
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'M-Pesa Mobile Money', amt: masterMetrics.mpesaTotal, color: 'bg-emerald-500', barBg: 'bg-emerald-500/20' },
                                    { label: 'Physical Cash Drawer', amt: masterMetrics.cashTotal, color: 'bg-amber-500', barBg: 'bg-amber-500/20' },
                                    { label: 'Bank Card / Credit Folio', amt: masterMetrics.cardTotal, color: 'bg-indigo-500', barBg: 'bg-indigo-500/20' },
                                    { label: 'Pending / Unsettled Balances', amt: masterMetrics.pendingTotal, color: 'bg-rose-500', barBg: 'bg-rose-500/20' },
                                ].map((t, idx) => {
                                    const pct = masterMetrics.grandTotalRevenue > 0 
                                        ? ((t.amt / masterMetrics.grandTotalRevenue) * 100) 
                                        : 0;
                                    return (
                                        <div key={idx} className="space-y-1">
                                            <div className="flex justify-between text-xs font-bold">
                                                <span className="text-slate-300">{t.label}</span>
                                                <span className="text-white">{fmt(t.amt)} ({pct.toFixed(1)}%)</span>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                                                <div className={`h-full rounded-full ${t.color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Outlet Split (POS vs Hotel) */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                <span>🏢</span> Revenue by Department Outlet
                            </h3>
                            <div className="space-y-4">
                                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black text-indigo-400 uppercase">🍽️ Restaurant & Bar POS</p>
                                        <p className="text-lg font-black text-white mt-0.5">{fmt(masterMetrics.posGross)}</p>
                                        <p className="text-[10px] text-slate-400">{sales.length} customer receipts</p>
                                    </div>
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300">
                                        {masterMetrics.grandTotalRevenue > 0 ? ((masterMetrics.posGross / masterMetrics.grandTotalRevenue) * 100).toFixed(1) : 0}%
                                    </span>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black text-purple-400 uppercase">🏨 Hotel Lodging & PMS</p>
                                        <p className="text-lg font-black text-white mt-0.5">{fmt(masterMetrics.combinedHotel)}</p>
                                        <p className="text-[10px] text-slate-400">{hotelBookings.length} rooms billed</p>
                                    </div>
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300">
                                        {masterMetrics.grandTotalRevenue > 0 ? ((masterMetrics.combinedHotel / masterMetrics.grandTotalRevenue) * 100).toFixed(1) : 0}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Executive Food & Margin Summary */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                <span>⚖️</span> Cost of Goods & Margins
                            </h3>
                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between py-1.5 border-b border-slate-800">
                                    <span className="text-slate-400">Total Dishes Sold:</span>
                                    <span className="font-bold text-white">{salesItems.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)} portions</span>
                                </div>
                                <div className="flex justify-between py-1.5 border-b border-slate-800">
                                    <span className="text-slate-400">Total Food Cost (COGS):</span>
                                    <span className="font-bold text-rose-400">{fmt(masterMetrics.grandCost)}</span>
                                </div>
                                <div className="flex justify-between py-1.5 border-b border-slate-800">
                                    <span className="text-slate-400">Total Discounts Granted:</span>
                                    <span className="font-bold text-amber-400">{fmt(masterMetrics.posDiscount)}</span>
                                </div>
                                <div className="flex justify-between py-1.5 border-b border-slate-800">
                                    <span className="text-slate-400">Overall Profitability:</span>
                                    <span className="font-black text-emerald-400">{masterMetrics.profitMargin.toFixed(1)}% Gross Margin</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Transaction Feed Table */}
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                <span>🧾</span> Recent Sales Invoices ({sales.length} Records)
                            </h3>
                            <span className="text-xs text-slate-500">Showing completed transactions in selected date range</span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
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
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {sales.slice(0, 15).map(s => (
                                        <tr key={s.sale_id} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3 font-bold text-indigo-400">{s.receipt_no}</td>
                                            <td className="p-3">{s.sale_date} {s.sale_time || ''}</td>
                                            <td className="p-3">{s.table_name || s.table_no || 'Walk-in'}</td>
                                            <td className="p-3">{s.waiter_name || s.created_by || 'Staff'}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                    (s.payment_method || '').toLowerCase().includes('mpesa') 
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                }`}>
                                                    {s.payment_method || 'Cash'}
                                                </span>
                                            </td>
                                            <td className="p-3 font-black text-white">{fmt(s.total_amount)}</td>
                                            <td className="p-3 text-slate-400">{fmt(s.total_tax || (s.vat_amount + s.levy_amount))}</td>
                                            <td className="p-3">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                                                    {s.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {sales.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-500">
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

            {/* ─── TAB 2: DISH & MENU PERFORMANCE ─── */}
            {activeTab === 'items' && (
                <div className="space-y-6">
                    {/* Top 10 Bestsellers vs Slow Movers Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Top 10 Bestsellers */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                                <span>🏆</span> Top Revenue Star Dishes
                            </h3>
                            <div className="space-y-2">
                                {productSalesStats.top10.map((p, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-black text-[10px]">
                                                {idx + 1}
                                            </span>
                                            <div>
                                                <p className="font-bold text-white">{p.name}</p>
                                                <p className="text-[10px] text-slate-400">{p.qtySold} portions sold · {p.category}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-emerald-400">{fmt(p.totalRevenue)}</p>
                                            <p className="text-[10px] text-slate-400">{fmt(p.profit)} profit</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Category Contribution */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                                <span>📊</span> Product Mix & Margin Summary
                            </h3>
                            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 text-xs">
                                <div className="flex justify-between py-1 border-b border-slate-800">
                                    <span className="text-slate-400">Total Products in Catalog:</span>
                                    <span className="font-bold text-white">{products.length} menu items</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800">
                                    <span className="text-slate-400">Active Dishes with Sales:</span>
                                    <span className="font-bold text-emerald-400">{productSalesStats.list.filter(p => p.qtySold > 0).length} selling</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800">
                                    <span className="text-slate-400">Total Portions Served:</span>
                                    <span className="font-black text-white">{productSalesStats.list.reduce((acc, p) => acc + p.qtySold, 0)} portions</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-400">Average Dish Selling Price:</span>
                                    <span className="font-bold text-indigo-400">
                                        {fmt(products.length > 0 ? (products.reduce((acc, p) => acc + (Number(p.sales_cost) || 0), 0) / products.length) : 0)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Master Itemized Product Table */}
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                                Full Menu Item Performance Ledger ({productSalesStats.list.length} Items)
                            </h3>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
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
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {productSalesStats.list.map((p, idx) => {
                                        const margin = p.totalRevenue > 0 ? ((p.profit / p.totalRevenue) * 100) : 0;
                                        return (
                                            <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                                                <td className="p-3 font-mono text-slate-400">{p.code}</td>
                                                <td className="p-3 font-bold text-white">{p.name}</td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300">
                                                        {p.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-black text-indigo-400">{p.qtySold}</td>
                                                <td className="p-3">{fmt(p.unitPrice)}</td>
                                                <td className="p-3 text-slate-400">{fmt(p.unitCost)}</td>
                                                <td className="p-3 font-black text-emerald-400">{fmt(p.totalRevenue)}</td>
                                                <td className="p-3 text-rose-400">{fmt(p.totalCost)}</td>
                                                <td className="p-3 font-bold text-purple-300">{fmt(p.profit)}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                        margin >= 50 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
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

            {/* ─── TAB 3: WAITERS & CASHIER STAFF ─── */}
            {activeTab === 'staff' && (
                <div className="space-y-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                <span>🧑‍💼</span> Staff & Waiter Sales Leaderboard ({waiterStats.length} Staff Members)
                            </h3>
                            <span className="text-xs text-slate-500">Performance rankings by total turnover generated</span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th className="p-3">Rank</th>
                                        <th className="p-3">Staff Name</th>
                                        <th className="p-3">Role</th>
                                        <th className="p-3">Bills Created</th>
                                        <th className="p-3">Gross Sales</th>
                                        <th className="p-3">Avg Ticket Size</th>
                                        <th className="p-3">Discounts</th>
                                        <th className="p-3">Cash Handled</th>
                                        <th className="p-3">M-Pesa Handled</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {waiterStats.map((w, idx) => (
                                        <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                                                    idx === 0 ? 'bg-amber-500 text-black' : idx === 1 ? 'bg-slate-300 text-black' : 'bg-slate-800 text-slate-300'
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                            </td>
                                            <td className="p-3 font-bold text-white text-sm">{w.name}</td>
                                            <td className="p-3 text-slate-400">{w.role}</td>
                                            <td className="p-3 font-black text-indigo-400">{w.billsCount}</td>
                                            <td className="p-3 font-black text-emerald-400 text-sm">{fmt(w.totalSales)}</td>
                                            <td className="p-3 text-cyan-300 font-bold">{fmt(w.avgCheck)}</td>
                                            <td className="p-3 text-rose-400">{fmt(w.discounts)}</td>
                                            <td className="p-3 text-amber-300">{fmt(w.cashCollected)}</td>
                                            <td className="p-3 text-emerald-300">{fmt(w.mpesaCollected)}</td>
                                        </tr>
                                    ))}
                                    {waiterStats.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-slate-500">
                                                No waiter or staff sales found for this period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 4: SHIFTS AUDIT & Z-REPORTS ─── */}
            {activeTab === 'shifts' && (
                <div className="space-y-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                <span>⏱️</span> Shift Drawer Audits & Z-Reports ({shiftReportsList.length} Shifts)
                            </h3>
                            <span className="text-xs text-slate-500">Cash variance reconciliation & drawer safe counts</span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th className="p-3">Shift ID</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Type</th>
                                        <th className="p-3">Opened By</th>
                                        <th className="p-3">Opening Cash</th>
                                        <th className="p-3">Sales Generated</th>
                                        <th className="p-3">Petty Expenses</th>
                                        <th className="p-3">Expected Drawer</th>
                                        <th className="p-3">Closing Count</th>
                                        <th className="p-3">Variance</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {shiftReportsList.map(sh => (
                                        <tr key={sh.shift_id} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3 font-mono font-bold text-indigo-400">SH-{sh.shift_id}</td>
                                            <td className="p-3">{sh.shift_date}</td>
                                            <td className="p-3 font-bold text-white">{sh.shift_type}</td>
                                            <td className="p-3">{sh.opened_by}</td>
                                            <td className="p-3 text-slate-300">{fmt(sh.opening_cash)}</td>
                                            <td className="p-3 font-bold text-emerald-400">{fmt(sh.total_sales)}</td>
                                            <td className="p-3 text-rose-400">{fmt(sh.expTotal)}</td>
                                            <td className="p-3 font-bold text-cyan-300">{fmt(sh.expectedDrawer)}</td>
                                            <td className="p-3 font-black text-white">{fmt(sh.computedClosing)}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    sh.computedVariance >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                                                }`}>
                                                    {sh.computedVariance >= 0 ? '+' : ''}{fmt(sh.computedVariance)}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    sh.status === 'Open' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                                                }`}>
                                                    {sh.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {shiftReportsList.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="p-8 text-center text-slate-500">
                                                No shift records found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 5: TABLES & KITCHEN KOT ─── */}
            {activeTab === 'tables' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Table Revenue Ranking */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                <span>🪑</span> Dining Floor & Table Performance
                            </h3>
                            <div className="overflow-x-auto rounded-2xl border border-slate-800">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
                                        <tr>
                                            <th className="p-3">Table Name</th>
                                            <th className="p-3">Bills Count</th>
                                            <th className="p-3">Total Sales</th>
                                            <th className="p-3">Avg Check</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-medium">
                                        {tableAndKotStats.tableList.map((t, idx) => (
                                            <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                                                <td className="p-3 font-bold text-white">{t.name}</td>
                                                <td className="p-3 font-bold text-indigo-400">{t.ordersCount}</td>
                                                <td className="p-3 font-black text-emerald-400">{fmt(t.revenue)}</td>
                                                <td className="p-3 text-cyan-300">{fmt(t.avgCheck)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Kitchen KOT Performance */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                <span>🍳</span> Kitchen Orders (KOT) Speed & Volume
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Total KOTs</p>
                                    <p className="text-xl font-black text-white mt-1">{tableAndKotStats.totalKots}</p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                                    <p className="text-[10px] font-bold uppercase text-amber-400">Pending</p>
                                    <p className="text-xl font-black text-amber-400 mt-1">{tableAndKotStats.pendingKots}</p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                                    <p className="text-[10px] font-bold uppercase text-emerald-400">Served</p>
                                    <p className="text-xl font-black text-emerald-400 mt-1">{tableAndKotStats.servedKots}</p>
                                </div>
                            </div>

                            {/* Recent KOTs */}
                            <div className="space-y-2 mt-4">
                                {kitchenOrders.slice(0, 5).map(k => (
                                    <div key={k.kot_id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                                        <div>
                                            <p className="font-bold text-indigo-300">{k.kot_number} · Table {k.table_name || 'Floor'}</p>
                                            <p className="text-[10px] text-slate-500">Waiter: {k.waiter_name || 'Staff'}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            k.status === 'Served' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                                        }`}>
                                            {k.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 6: KRA TAX & ETIMS COMPLIANCE ─── */}
            {activeTab === 'tax' && (
                <div className="space-y-6">
                    {/* KRA Metrics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-slate-400">VAT 16% Taxable Base</p>
                            <p className="text-xl font-black text-white mt-1">{fmt(taxFiscalStats.vatTaxableBase)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Net turnover before VAT</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-amber-400">16% VAT Output Tax</p>
                            <p className="text-xl font-black text-amber-400 mt-1">{fmt(taxFiscalStats.vatAmountTotal)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Payable to KRA</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-cyan-400">2% Catering Tourism Levy</p>
                            <p className="text-xl font-black text-cyan-400 mt-1">{fmt(taxFiscalStats.levyAmountTotal)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Tourism fund levy</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-emerald-400">Total Fiscal Receipts</p>
                            <p className="text-xl font-black text-emerald-400 mt-1">{taxFiscalStats.totalFiscalized}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">eTIMS compliant invoices</p>
                        </div>
                    </div>

                    {/* Fiscal Invoices Table */}
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                            Kenya Revenue Authority (eTIMS) Tax Invoice Register
                        </h3>
                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th className="p-3">Receipt No</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Customer / PIN</th>
                                        <th className="p-3">Net Taxable Base</th>
                                        <th className="p-3">16% VAT</th>
                                        <th className="p-3">2% Levy</th>
                                        <th className="p-3">Gross Total</th>
                                        <th className="p-3">Verification Hash</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {sales.map(s => (
                                        <tr key={s.sale_id} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3 font-mono font-bold text-indigo-400">{s.receipt_no}</td>
                                            <td className="p-3">{s.sale_date}</td>
                                            <td className="p-3">{s.customer_name || 'Walk-in Consumer'}</td>
                                            <td className="p-3">{fmt(s.net_amount || s.subtotal)}</td>
                                            <td className="p-3 text-amber-300">{fmt(s.vat_amount)}</td>
                                            <td className="p-3 text-cyan-300">{fmt(s.levy_amount)}</td>
                                            <td className="p-3 font-black text-white">{fmt(s.total_amount)}</td>
                                            <td className="p-3 font-mono text-[10px] text-slate-500 truncate max-w-[150px]">
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

            {/* ─── TAB 7: HOTEL PMS & ROOMS ─── */}
            {activeTab === 'hotel' && (
                <div className="space-y-6">
                    {/* Hotel KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-slate-400">Occupancy Rate</p>
                            <p className="text-xl font-black text-indigo-400 mt-1">{hotelStats.occupancyRate.toFixed(1)}%</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{hotelStats.occupiedRooms} / {hotelStats.totalRooms} rooms</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-emerald-400">Total Room Charges</p>
                            <p className="text-xl font-black text-emerald-400 mt-1">{fmt(hotelStats.totalRoomCharges)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Accommodation revenue</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-purple-400">Room Folio F&B Charges</p>
                            <p className="text-xl font-black text-purple-400 mt-1">{fmt(hotelStats.totalRestaurantCharges)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Charged to guest rooms</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-amber-400">ADR (Avg Daily Rate)</p>
                            <p className="text-xl font-black text-amber-400 mt-1">{fmt(hotelStats.adr)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">RevPAR: {fmt(hotelStats.revpar)}</p>
                        </div>
                    </div>

                    {/* Bookings Folio Table */}
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                            Hotel Guest Bookings & Folios ({hotelBookings.length} Bookings)
                        </h3>
                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
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
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {hotelBookings.map(b => (
                                        <tr key={b.booking_id} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3 font-mono font-bold text-indigo-400">{b.booking_no}</td>
                                            <td className="p-3 font-bold text-white">{b.guest_name || 'Guest'}</td>
                                            <td className="p-3">{b.room_number || '—'} ({b.room_type_name || 'Room'})</td>
                                            <td className="p-3">{b.check_in_date} to {b.check_out_date || 'Ongoing'} ({b.nights}n)</td>
                                            <td className="p-3">{fmt(b.room_charges)}</td>
                                            <td className="p-3 text-purple-300">{fmt(b.restaurant_charges)}</td>
                                            <td className="p-3 font-black text-emerald-400">{fmt(b.total_amount)}</td>
                                            <td className="p-3">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                                                    {b.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {hotelBookings.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-500">
                                                No hotel bookings recorded in this date range.
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
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Spoilage Log */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
                                    <span>⚠️</span> Spoilage & Wastage Losses
                                </h3>
                                <span className="text-xs font-black text-rose-400">Total Loss: {fmt(inventoryStats.totalSpoilageLoss)}</span>
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-slate-800">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
                                        <tr>
                                            <th className="p-3">Date</th>
                                            <th className="p-3">Item</th>
                                            <th className="p-3">Qty</th>
                                            <th className="p-3">Loss Value</th>
                                            <th className="p-3">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-medium">
                                        {spoilages.map(sp => (
                                            <tr key={sp.spoilage_id} className="hover:bg-slate-900/60 transition-colors">
                                                <td className="p-3">{sp.spoilage_date}</td>
                                                <td className="p-3 font-bold text-white">{sp.product_name}</td>
                                                <td className="p-3 text-indigo-400">{sp.quantity}</td>
                                                <td className="p-3 font-black text-rose-400">{fmt(sp.total_loss)}</td>
                                                <td className="p-3 text-slate-400">{sp.reason || sp.spoilage_type}</td>
                                            </tr>
                                        ))}
                                        {spoilages.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-500">
                                                    No spoilage or wastage incidents recorded.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Production Batches Log */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                                <span>🍲</span> Production Batches Yield & Cost
                            </h3>
                            <div className="overflow-x-auto rounded-2xl border border-slate-800">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
                                        <tr>
                                            <th className="p-3">Batch No</th>
                                            <th className="p-3">Dish Produced</th>
                                            <th className="p-3">Yield</th>
                                            <th className="p-3">Unit Cost</th>
                                            <th className="p-3">Selling Price</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-medium">
                                        {batches.map(b => (
                                            <tr key={b.batch_id} className="hover:bg-slate-900/60 transition-colors">
                                                <td className="p-3 font-mono font-bold text-indigo-400">{b.batch_number}</td>
                                                <td className="p-3 font-bold text-white">{b.product_name}</td>
                                                <td className="p-3 text-cyan-300">{b.qty_produced} (Sold: {b.qty_sold})</td>
                                                <td className="p-3 text-rose-400">{fmt(b.cost_per_unit)}</td>
                                                <td className="p-3 font-black text-emerald-400">{fmt(b.selling_price)}</td>
                                            </tr>
                                        ))}
                                        {batches.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-500">
                                                    No production batches recorded.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 9: PURCHASES & SUPPLIERS ─── */}
            {activeTab === 'purchases' && (
                <div className="space-y-6">
                    {/* Suppliers Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-slate-400">Total Purchases</p>
                            <p className="text-xl font-black text-white mt-1">{fmt(purchaseStats.totalPurchased)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{purchases.length} supplier invoices</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-emerald-400">Claimable Input VAT</p>
                            <p className="text-xl font-black text-emerald-400 mt-1">{fmt(purchaseStats.totalVatClaimable)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Offset against sales tax</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-indigo-400">Active Suppliers</p>
                            <p className="text-xl font-black text-indigo-400 mt-1">{purchaseStats.totalSuppliers}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Vendors registered</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-rose-400">Supplier Payables</p>
                            <p className="text-xl font-black text-rose-400 mt-1">{fmt(purchaseStats.totalSupplierDebt)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Outstanding balances</p>
                        </div>
                    </div>

                    {/* Suppliers Directory */}
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                            Supplier Directory & Payables Ledger ({suppliers.length} Vendors)
                        </h3>
                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th className="p-3">Code</th>
                                        <th className="p-3">Supplier Name</th>
                                        <th className="p-3">Contact Person</th>
                                        <th className="p-3">Phone</th>
                                        <th className="p-3">Payment Terms</th>
                                        <th className="p-3">Current Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {suppliers.map(s => (
                                        <tr key={s.supplier_id} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3 font-mono font-bold text-indigo-400">{s.supplier_code || `SUP-${s.supplier_id}`}</td>
                                            <td className="p-3 font-bold text-white text-sm">{s.supplier_name}</td>
                                            <td className="p-3 text-slate-400">{s.contact_person || '—'}</td>
                                            <td className="p-3">{s.phone || '—'}</td>
                                            <td className="p-3">{s.payment_terms || 'Net 30'}</td>
                                            <td className="p-3 font-black text-rose-400">{fmt(s.current_balance)}</td>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-emerald-400">Total M-Pesa Collected</p>
                            <p className="text-xl font-black text-emerald-400 mt-1">{fmt(mpesaStats.totalMpesa)}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">POS + Hotel PMS</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-amber-400">Unlinked C2B Deposits</p>
                            <p className="text-xl font-black text-amber-400 mt-1">{mpesaStats.unlinkedCount} transactions</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{fmt(mpesaStats.unlinkedAmount)} unclaimed</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
                            <p className="text-[10px] font-black uppercase text-indigo-400">Live Daraja Sync</p>
                            <p className="text-xl font-black text-white mt-1">CONNECTED</p>
                            <p className="text-[10px] text-emerald-400 mt-0.5 font-bold">Saf-Daraja C2B Active</p>
                        </div>
                    </div>

                    {/* M-Pesa Transactions Log */}
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                            M-Pesa Live Till & Paybill Inbound Ledger ({c2bList.length} Transactions)
                        </h3>
                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900 text-[11px] font-black uppercase text-slate-400 border-b border-slate-800">
                                    <tr>
                                        <th className="p-3">M-Pesa Receipt</th>
                                        <th className="p-3">Sender Phone</th>
                                        <th className="p-3">Customer Name</th>
                                        <th className="p-3">Amount (KES)</th>
                                        <th className="p-3">Time</th>
                                        <th className="p-3">Linked Sale ID</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-medium">
                                    {c2bList.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-900/60 transition-colors">
                                            <td className="p-3 font-mono font-bold text-emerald-400">{c.mpesa_receipt}</td>
                                            <td className="p-3 font-mono">{c.phone || '—'}</td>
                                            <td className="p-3 font-bold text-white">{c.customer_name || 'Customer'}</td>
                                            <td className="p-3 font-black text-emerald-400">{fmt(c.amount)}</td>
                                            <td className="p-3">{new Date(c.transaction_time).toLocaleString()}</td>
                                            <td className="p-3 font-mono text-indigo-400">{c.linked_sale_id ? `SALE #${c.linked_sale_id}` : 'Unclaimed'}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    c.is_linked ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                                                }`}>
                                                    {c.is_linked ? 'Matched' : 'Unclaimed'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {c2bList.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-500">
                                                No direct C2B mobile transactions found. POS M-Pesa receipts are logged directly in Sales.
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
