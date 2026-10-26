'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { loadCompanyInfo, CompanyInfo } from '@/lib/receiptPrinter';

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export interface SaleItemDetail {
    item_id: number;
    sale_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    profit: number;
}

export interface POSSaleRecord {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    shift_id: number | null;
    shift_name: string | null;
    waiter_name: string;
    table_name: string;
    room_name: string | null;
    order_type: string;
    customer_name: string;
    subtotal: number;
    discount: number;
    tax_amount: number;
    total_amount: number;
    total_cost: number;
    profit: number;
    payment_method: string;
    amount_paid: number;
    change_amount: number;
    status: string;
    vat_amount: number;
    levy_amount: number;
    total_tax: number;
    items?: SaleItemDetail[];
}

export interface POSShiftReport {
    shift_id: number;
    shift_date: string;
    shift_type: string;
    start_time: string;
    end_time: string | null;
    opening_cash: number;
    closing_cash: number | null;
    actual_cash: number | null;
    cash_variance: number | null;
    status: string;
    opened_by: string;
    closed_by: string | null;
    totalSales: number;
    cashSales: number;
    mpesaSales: number;
    cardSales: number;
    creditSales: number;
    orderCount: number;
    totalExpenses: number;
    expectedCash: number;
}

type ActivePOSTab = 
    | 'shifts' 
    | 'hourly' 
    | 'dining_modes' 
    | 'waiters' 
    | 'top_products' 
    | 'tenders' 
    | 'receipts';

type DatePreset = 'today' | 'yesterday' | '7days' | 'month' | 'last_month' | 'year' | 'all' | 'custom';

export default function POSReportsPage() {
    // ─── STATE MANAGEMENT ───────────────────────────────────────────────────
    const [sales, setSales] = useState<POSSaleRecord[]>([]);
    const [shifts, setShifts] = useState<POSShiftReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    // Filter controls
    const [datePreset, setDatePreset] = useState<DatePreset>('7days');
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
    const [search, setSearch] = useState('');
    const [filterMethod, setFilterMethod] = useState('All');
    const [filterDiningMode, setFilterDiningMode] = useState('All');
    const [filterWaiter, setFilterWaiter] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');

    // UI View & Accordions
    const [activeTab, setActiveTab] = useState<ActivePOSTab>('shifts');
    const [expandedShiftId, setExpandedShiftId] = useState<number | null>(null);
    const [expandedReceiptId, setExpandedReceiptId] = useState<number | null>(null);

    // ─── LOAD COMPANY INFO ──────────────────────────────────────────────────
    useEffect(() => {
        loadCompanyInfo().then(info => {
            if (info) setCompanyInfo(info);
        }).catch(err => console.warn('Company info load error:', err));
    }, []);

    // ─── DATE PRESET HANDLER ────────────────────────────────────────────────
    const handleDatePreset = (preset: DatePreset) => {
        setDatePreset(preset);
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        if (preset === 'today') {
            const t = formatDate(today);
            setDateFrom(t);
            setDateTo(t);
        } else if (preset === 'yesterday') {
            const y = new Date();
            y.setDate(today.getDate() - 1);
            const ys = formatDate(y);
            setDateFrom(ys);
            setDateTo(ys);
        } else if (preset === '7days') {
            const past7 = new Date();
            past7.setDate(today.getDate() - 7);
            setDateFrom(formatDate(past7));
            setDateTo(formatDate(today));
        } else if (preset === 'month') {
            const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            setDateFrom(formatDate(startMonth));
            setDateTo(formatDate(today));
        } else if (preset === 'last_month') {
            const startLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const endLast = new Date(today.getFullYear(), today.getMonth(), 0);
            setDateFrom(formatDate(startLast));
            setDateTo(formatDate(endLast));
        } else if (preset === 'year') {
            const startYear = new Date(today.getFullYear(), 0, 1);
            setDateFrom(formatDate(startYear));
            setDateTo(formatDate(today));
        } else if (preset === 'all') {
            setDateFrom('2024-01-01');
            setDateTo(formatDate(today));
        }
    };

    // ─── LOAD DATA ──────────────────────────────────────────────────────────
    const loadReportData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Sales within date range
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('*')
                .gte('sale_datetime', `${dateFrom}T00:00:00`)
                .lte('sale_datetime', `${dateTo}T23:59:59`)
                .order('sale_id', { ascending: false });

            if (salesError) {
                console.warn('Error loading sales data:', salesError);
            }

            const rawSales = salesData || [];
            const saleIds = rawSales.map((s: any) => s.sale_id).slice(0, 150); // limit item join for performance

            // 2. Fetch Sales Items for these sales
            let itemsMap: Record<number, SaleItemDetail[]> = {};
            if (saleIds.length > 0) {
                try {
                    const { data: itemsData } = await supabase
                        .from('sales_items')
                        .select('item_id, sale_id, product_name, quantity, unit_price, subtotal, profit')
                        .in('sale_id', saleIds);

                    (itemsData || []).forEach((item: any) => {
                        if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
                        itemsMap[item.sale_id].push({
                            item_id: item.item_id,
                            sale_id: item.sale_id,
                            product_name: item.product_name,
                            quantity: Number(item.quantity) || 0,
                            unit_price: Number(item.unit_price) || 0,
                            subtotal: Number(item.subtotal) || 0,
                            profit: Number(item.profit) || 0,
                        });
                    });
                } catch (itemErr) {
                    console.warn('Error loading sales items:', itemErr);
                }
            }

            // Map enriched sales
            const builtSales: POSSaleRecord[] = rawSales.map((s: any) => {
                const sub = Number(s.subtotal) || Number(s.total_amount) || 0;
                const disc = Number(s.discount) || 0;
                const tot = Number(s.total_amount) || 0;
                const tax = Number(s.total_tax) || Number(s.tax_amount) || 0;
                const vat = Number(s.vat_amount) || 0;
                const levy = Number(s.levy_amount) || 0;

                return {
                    sale_id: s.sale_id,
                    receipt_no: s.receipt_no || `RCP-${s.sale_id}`,
                    sale_date: s.sale_date || s.sale_datetime?.split('T')[0] || dateTo,
                    sale_time: s.sale_time || s.sale_datetime?.split('T')[1]?.substring(0, 8) || '00:00:00',
                    sale_datetime: s.sale_datetime || s.created_at || new Date().toISOString(),
                    shift_id: s.shift_id || null,
                    shift_name: s.shift_name || null,
                    waiter_name: s.waiter_name || s.created_by || 'Counter Staff',
                    table_name: s.table_name || s.table_no || '',
                    room_name: s.room_name || null,
                    order_type: s.order_type || 'Dine-In',
                    customer_name: s.customer_name || 'Walk-in Guest',
                    subtotal: sub,
                    discount: disc,
                    tax_amount: tax,
                    total_amount: tot,
                    total_cost: Number(s.total_cost) || 0,
                    profit: Number(s.profit) || (tot - (Number(s.total_cost) || 0)),
                    payment_method: s.payment_method || 'Cash',
                    amount_paid: Number(s.amount_paid) || tot,
                    change_amount: Number(s.change_amount) || 0,
                    status: s.status || 'Completed',
                    vat_amount: vat,
                    levy_amount: levy,
                    total_tax: tax,
                    items: itemsMap[s.sale_id] || [],
                };
            });

            setSales(builtSales);

            // 3. Fetch Shifts
            const { data: shiftData, error: shiftError } = await supabase
                .from('shifts')
                .select('*')
                .gte('created_at', `${dateFrom}T00:00:00`)
                .lte('created_at', `${dateTo}T23:59:59`)
                .order('shift_id', { ascending: false });

            if (shiftError) {
                console.warn('Error loading shifts:', shiftError);
            }

            const rawShifts = shiftData || [];

            // Group sales by shift_id
            const shiftSalesMap = new Map<number, {
                total: number;
                cash: number;
                mpesa: number;
                card: number;
                credit: number;
                orders: number;
            }>();

            builtSales.forEach(s => {
                if (!s.shift_id) return;
                const sid = s.shift_id;
                if (!shiftSalesMap.has(sid)) {
                    shiftSalesMap.set(sid, { total: 0, cash: 0, mpesa: 0, card: 0, credit: 0, orders: 0 });
                }
                const entry = shiftSalesMap.get(sid)!;
                const amt = s.total_amount;
                entry.total += amt;
                entry.orders += 1;

                const pm = (s.payment_method || '').toLowerCase();
                if (pm.includes('cash')) entry.cash += amt;
                else if (pm.includes('mpesa')) entry.mpesa += amt;
                else if (pm.includes('card')) entry.card += amt;
                else entry.credit += amt;
            });

            const builtShifts: POSShiftReport[] = rawShifts.map((sh: any) => {
                const sm = shiftSalesMap.get(sh.shift_id) || {
                    total: Number(sh.total_sales) || 0,
                    cash: Number(sh.cash_sales) || 0,
                    mpesa: Number(sh.mpesa_sales) || 0,
                    card: Number(sh.card_sales) || 0,
                    credit: Number(sh.credit_sales) || 0,
                    orders: 0
                };

                const openCash = Number(sh.opening_cash) || 0;
                const expCash = openCash + sm.cash - (Number(sh.total_expenses) || 0);
                const actualCash = sh.closing_cash !== null ? Number(sh.closing_cash) : (sh.actual_cash !== null ? Number(sh.actual_cash) : null);
                const variance = actualCash !== null ? actualCash - expCash : null;

                return {
                    shift_id: sh.shift_id,
                    shift_date: sh.shift_date || sh.created_at?.split('T')[0] || dateTo,
                    shift_type: sh.shift_type || 'Day',
                    start_time: sh.start_time || '',
                    end_time: sh.end_time || null,
                    opening_cash: openCash,
                    closing_cash: actualCash,
                    actual_cash: actualCash,
                    cash_variance: variance,
                    status: sh.status || 'Closed',
                    opened_by: sh.opened_by || 'Cashier',
                    closed_by: sh.closed_by || null,
                    totalSales: sm.total,
                    cashSales: sm.cash,
                    mpesaSales: sm.mpesa,
                    cardSales: sm.card,
                    creditSales: sm.credit,
                    orderCount: sm.orders,
                    totalExpenses: Number(sh.total_expenses) || 0,
                    expectedCash: expCash,
                };
            });

            setShifts(builtShifts);
            if (builtShifts.length > 0 && !expandedShiftId) {
                setExpandedShiftId(builtShifts[0].shift_id);
            }
        } catch (err) {
            console.error('Fatal load error in POS reports:', err);
            toast.error('Could not load POS report data');
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, expandedShiftId]);

    useEffect(() => {
        loadReportData();
    }, [loadReportData]);

    // ─── FILTER LISTS ───────────────────────────────────────────────────────
    const availableWaiters = useMemo(() => {
        const set = new Set(sales.map(s => s.waiter_name).filter(Boolean));
        return ['All', ...Array.from(set)];
    }, [sales]);

    const availableDiningModes = useMemo(() => {
        const set = new Set(sales.map(s => s.order_type).filter(Boolean));
        return ['All', ...Array.from(set)];
    }, [sales]);

    const availableTenders = useMemo(() => {
        const set = new Set(sales.map(s => s.payment_method).filter(Boolean));
        return ['All', ...Array.from(set)];
    }, [sales]);

    // ─── FILTERED SALES ─────────────────────────────────────────────────────
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            if (search) {
                const q = search.toLowerCase();
                const matchReceipt = s.receipt_no.toLowerCase().includes(q);
                const matchWaiter = s.waiter_name.toLowerCase().includes(q);
                const matchCust = s.customer_name.toLowerCase().includes(q);
                const matchTable = s.table_name.toLowerCase().includes(q);
                if (!matchReceipt && !matchWaiter && !matchCust && !matchTable) return false;
            }

            if (filterMethod !== 'All' && s.payment_method !== filterMethod) return false;
            if (filterDiningMode !== 'All' && s.order_type !== filterDiningMode) return false;
            if (filterWaiter !== 'All' && s.waiter_name !== filterWaiter) return false;
            if (filterStatus !== 'All' && s.status !== filterStatus) return false;

            return true;
        });
    }, [sales, search, filterMethod, filterDiningMode, filterWaiter, filterStatus]);

    // ─── EXECUTIVE KPIS ─────────────────────────────────────────────────────
    const posKPIs = useMemo(() => {
        const totalTurnover = filteredSales.reduce((s, r) => s + r.total_amount, 0);
        const totalBills = filteredSales.length;
        const avgBillSize = totalBills > 0 ? totalTurnover / totalBills : 0;

        let mpesaTotal = 0;
        let mpesaCount = 0;
        let cashTotal = 0;
        let cashCount = 0;
        let cardTotal = 0;
        let cardCount = 0;
        let creditTotal = 0;
        let creditCount = 0;

        let totalDiscounts = 0;
        let discountedBills = 0;
        let totalTax = 0;
        let totalCost = 0;
        let totalProfit = 0;

        filteredSales.forEach(s => {
            const amt = s.total_amount;
            const pm = (s.payment_method || '').toLowerCase();

            if (pm.includes('mpesa')) {
                mpesaTotal += amt;
                mpesaCount++;
            } else if (pm.includes('cash')) {
                cashTotal += amt;
                cashCount++;
            } else if (pm.includes('card')) {
                cardTotal += amt;
                cardCount++;
            } else {
                creditTotal += amt;
                creditCount++;
            }

            if (s.discount > 0) {
                totalDiscounts += s.discount;
                discountedBills++;
            }
            totalTax += s.total_tax || 0;
            totalCost += s.total_cost || 0;
            totalProfit += s.profit || (amt - s.total_cost);
        });

        const mpesaShare = totalTurnover > 0 ? (mpesaTotal / totalTurnover) * 100 : 0;
        const cashShare = totalTurnover > 0 ? (cashTotal / totalTurnover) * 100 : 0;
        const profitMargin = totalTurnover > 0 ? (totalProfit / totalTurnover) * 100 : 0;

        return {
            totalTurnover,
            totalBills,
            avgBillSize,
            mpesaTotal,
            mpesaCount,
            mpesaShare,
            cashTotal,
            cashCount,
            cashShare,
            cardTotal,
            cardCount,
            creditTotal,
            creditCount,
            totalDiscounts,
            discountedBills,
            totalTax,
            totalCost,
            totalProfit,
            profitMargin,
        };
    }, [filteredSales]);

    // ─── HOURLY PEAK DISTRIBUTION (00:00 to 23:00) ──────────────────────────
    const hourlyDistribution = useMemo(() => {
        const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            label: `${String(i).padStart(2, '0')}:00`,
            orders: 0,
            revenue: 0,
        }));

        filteredSales.forEach(s => {
            const h = parseInt(s.sale_time.split(':')[0] || '12', 10);
            if (h >= 0 && h < 24) {
                hours[h].orders += 1;
                hours[h].revenue += s.total_amount;
            }
        });

        const maxRev = Math.max(...hours.map(h => h.revenue), 1);
        return { hours, maxRev };
    }, [filteredSales]);

    // ─── WAITER PERFORMANCE LEADERBOARD ─────────────────────────────────────
    const waiterStats = useMemo(() => {
        const map = new Map<string, { orders: number; revenue: number; cash: number; mpesa: number }>();

        filteredSales.forEach(s => {
            const w = s.waiter_name.trim();
            if (!map.has(w)) {
                map.set(w, { orders: 0, revenue: 0, cash: 0, mpesa: 0 });
            }
            const cur = map.get(w)!;
            cur.orders += 1;
            cur.revenue += s.total_amount;
            const pm = (s.payment_method || '').toLowerCase();
            if (pm.includes('cash')) cur.cash += s.total_amount;
            if (pm.includes('mpesa')) cur.mpesa += s.total_amount;
        });

        return Array.from(map.entries()).map(([name, data]) => ({
            name,
            orders: data.orders,
            revenue: data.revenue,
            cash: data.cash,
            mpesa: data.mpesa,
            avgOrder: data.orders > 0 ? data.revenue / data.orders : 0,
            serviceIncentive: data.revenue * 0.05, // 5% recommended service commission
        })).sort((a, b) => b.revenue - a.revenue);
    }, [filteredSales]);

    // ─── DINING MODE PERFORMANCE ────────────────────────────────────────────
    const diningModeStats = useMemo(() => {
        const map = new Map<string, { orders: number; revenue: number }>();

        filteredSales.forEach(s => {
            const mode = s.order_type || 'Dine-In';
            if (!map.has(mode)) {
                map.set(mode, { orders: 0, revenue: 0 });
            }
            const cur = map.get(mode)!;
            cur.orders += 1;
            cur.revenue += s.total_amount;
        });

        const total = posKPIs.totalTurnover || 1;
        return Array.from(map.entries()).map(([mode, data]) => ({
            mode,
            orders: data.orders,
            revenue: data.revenue,
            share: (data.revenue / total) * 100,
            avgTicket: data.orders > 0 ? data.revenue / data.orders : 0,
        })).sort((a, b) => b.revenue - a.revenue);
    }, [filteredSales, posKPIs.totalTurnover]);

    // ─── TOP SELLING DISHES & PRODUCTS ──────────────────────────────────────
    const topProducts = useMemo(() => {
        const map = new Map<string, { qty: number; revenue: number; profit: number }>();

        filteredSales.forEach(s => {
            (s.items || []).forEach(it => {
                const name = it.product_name.trim();
                if (!map.has(name)) {
                    map.set(name, { qty: 0, revenue: 0, profit: 0 });
                }
                const cur = map.get(name)!;
                cur.qty += it.quantity;
                cur.revenue += it.subtotal;
                cur.profit += it.profit;
            });
        });

        const total = posKPIs.totalTurnover || 1;
        return Array.from(map.entries()).map(([name, data]) => ({
            name,
            qty: data.qty,
            revenue: data.revenue,
            avgPrice: data.qty > 0 ? data.revenue / data.qty : 0,
            share: (data.revenue / total) * 100,
        })).sort((a, b) => b.revenue - a.revenue).slice(0, 25);
    }, [filteredSales, posKPIs.totalTurnover]);

    // ─── FORMATTERS ─────────────────────────────────────────────────────────
    const fmt = (n: number) => `Ksh ${Math.round(n).toLocaleString('en-KE')}`;
    const fmtDec = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── PRINT OFFICIAL POS REGISTER REPORT ──────────────────────────────────
    const handlePrintReport = () => {
        const hotelName = companyInfo?.name || 'Alpha Plus Hotel & Restaurant';
        const printContent = document.getElementById('printable-pos-report');
        if (!printContent) return;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OFFICIAL POS REGISTER &amp; TILL AUDIT - ${hotelName}</title>
<style>
  @page { size: A4; margin: 12mm 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #fff; line-height: 1.35; font-size: 11px; }
  .header { border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .hotel-name { font-size: 18px; font-weight: 900; text-transform: uppercase; color: #0f766e; letter-spacing: 0.5px; }
  .hotel-sub { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px; }
  .badge { display: inline-block; background: #0f766e; color: #fff; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc; }
  .kpi-title { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .kpi-value { font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f1f5f9; color: #334155; font-weight: 800; text-transform: uppercase; padding: 6px 6px; border: 1px solid #cbd5e1; text-align: left; }
  td { padding: 5px 6px; border: 1px solid #e2e8f0; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .total-row { background: #f8fafc; font-weight: 900; border-top: 2px solid #0f766e; }
  .signatures { margin-top: 25px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; font-size: 10px; border-top: 1px dashed #cbd5e1; pt-4; }
  .sig-line { border-top: 1px solid #475569; margin-top: 30px; padding-top: 4px; font-weight: 700; text-align: center; color: #334155; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="hotel-name">${hotelName}</div>
      <div class="hotel-sub">Point of Sale (POS) Cash Register &amp; Shift Reconciliation Audit</div>
    </div>
    <div style="text-align: right;">
      <span class="badge">Z-Report Audit</span>
      <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Period: ${dateFrom} to ${dateTo}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Gross POS Turnover</div><div class="kpi-value" style="color: #059669;">${fmt(posKPIs.totalTurnover)}</div></div>
    <div class="kpi-card"><div class="kpi-title">M-Pesa Collections</div><div class="kpi-value" style="color: #16a34a;">${fmt(posKPIs.mpesaTotal)} (${posKPIs.mpesaShare.toFixed(1)}%)</div></div>
    <div class="kpi-card"><div class="kpi-title">Cash in Till</div><div class="kpi-value" style="color: #d97706;">${fmt(posKPIs.cashTotal)} (${posKPIs.cashShare.toFixed(1)}%)</div></div>
    <div class="kpi-card"><div class="kpi-title">Completed Bills</div><div class="kpi-value">${posKPIs.totalBills} Bills (Avg: ${fmt(posKPIs.avgBillSize)})</div></div>
    <div class="kpi-card"><div class="kpi-title">Discounts Granted</div><div class="kpi-value" style="color: #dc2626;">${fmt(posKPIs.totalDiscounts)} (${posKPIs.discountedBills} bills)</div></div>
    <div class="kpi-card"><div class="kpi-title">Statutory Taxes (VAT+Levy)</div><div class="kpi-value">${fmt(posKPIs.totalTax)}</div></div>
  </div>

  <h3 style="font-size: 12px; margin-top: 14px; margin-bottom: 4px; font-weight: 900; color: #0f172a;">Shift Reconciliation Breakdown</h3>
  <table>
    <thead>
      <tr>
        <th>Shift ID</th>
        <th>Date &amp; Type</th>
        <th>Opened By</th>
        <th>Closed By</th>
        <th class="text-right">Opening Float</th>
        <th class="text-right">Expected Cash</th>
        <th class="text-right">Actual Cash</th>
        <th class="text-right">Variance</th>
        <th class="text-right">Total Sales</th>
        <th class="text-center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${shifts.map(sh => `
        <tr>
          <td style="font-family: monospace; font-weight: 700;">SH-${sh.shift_id}</td>
          <td>${sh.shift_date} (${sh.shift_type})</td>
          <td>${sh.opened_by}</td>
          <td>${sh.closed_by || '—'}</td>
          <td class="text-right">${fmt(sh.opening_cash)}</td>
          <td class="text-right">${fmt(sh.expectedCash)}</td>
          <td class="text-right font-bold">${sh.actual_cash !== null ? fmt(sh.actual_cash) : '—'}</td>
          <td class="text-right font-bold" style="color: ${(sh.cash_variance || 0) < 0 ? '#dc2626' : (sh.cash_variance || 0) > 0 ? '#16a34a' : '#475569'};">
            ${sh.cash_variance !== null ? `${(sh.cash_variance || 0) > 0 ? '+' : ''}${fmt(sh.cash_variance)}` : '—'}
          </td>
          <td class="text-right font-bold" style="color: #2563eb;">${fmt(sh.totalSales)}</td>
          <td class="text-center">${sh.status}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="signatures">
    <div><div class="sig-line">Head Cashier / Register Supervisor</div></div>
    <div><div class="sig-line">Internal Auditor / Cost Controller</div></div>
    <div><div class="sig-line">General Manager / Managing Director</div></div>
  </div>
</body>
</html>`;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;
        doc.open();
        doc.write(html);
        doc.close();

        iframe.contentWindow?.focus();
        setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1500);
        }, 350);
        toast.success('Generated official POS print document! 🖨️');
    };

    // ─── EXPORT TO CSV ──────────────────────────────────────────────────────
    const handleExportCSV = () => {
        let csv = 'Receipt No,Date,Time,Cashier / Waiter,Table / Room,Dining Mode,Customer Name,Payment Method,Subtotal,Discount,Tax Amount,Total Amount,Total Cost,Gross Profit,Status\n';

        filteredSales.forEach(s => {
            csv += `"${s.receipt_no}","${s.sale_date}","${s.sale_time}","${s.waiter_name}","${s.table_name || s.room_name || 'Counter'}","${s.order_type}","${s.customer_name}","${s.payment_method}",${s.subtotal},${s.discount},${s.tax_amount},${s.total_amount},${s.total_cost},${s.profit},"${s.status}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `POS_Register_Report_${dateFrom}_to_${dateTo}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported POS Register data to CSV! 📥');
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1700px] mx-auto min-h-screen bg-slate-50 text-slate-800">
            <Toaster position="top-right" />

            {/* Hidden Printable Container */}
            <div id="printable-pos-report" className="hidden" />

            {/* ==================================================================== */}
            {/* 1. TOP HEADER & EXECUTIVE TOOLBAR (GLASSMORPHIC LIGHT THEME)         */}
            {/* ==================================================================== */}
            <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-sky-600 flex items-center justify-center text-2xl shadow-md text-white border-2 border-white/50 shrink-0">
                        🧾
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                                Point of Sale &amp; Register <span className="text-emerald-600">Intelligence</span>
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                                REGISTER AUDIT READY
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-medium flex items-center gap-2 flex-wrap">
                            <span>{companyInfo?.name || 'Alpha Plus Hotel & Restaurant'}</span>
                            <span>•</span>
                            <span>Shift Z-Reports, Tender Reconciliations, Server Rankings &amp; Peak Hour Heatmaps</span>
                        </p>
                    </div>
                </div>

                {/* Right Action Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={loadReportData}
                        className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="Reload latest register data"
                    >
                        <span>🔄</span>
                        <span>Refresh</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-xs font-bold text-slate-700 hover:text-emerald-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="Export Full POS Receipts to CSV"
                    >
                        <span className="text-emerald-600">📥</span>
                        <span>Export CSV</span>
                    </button>

                    <button
                        type="button"
                        onClick={handlePrintReport}
                        className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-xs font-bold text-slate-700 hover:text-teal-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="Print Official Z-Report Audit Sheet"
                    >
                        <span className="text-teal-600">🖨️</span>
                        <span>Print Audit Sheet</span>
                    </button>

                    <Link
                        href="/dashboard/pos"
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                    >
                        <span>🛒</span>
                        <span>Open POS Terminal</span>
                    </Link>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 2. DATE PRESET & SEARCH BAR                                          */}
            {/* ==================================================================== */}
            <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Date Presets */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                    <span className="text-[11px] font-bold uppercase text-slate-400 mr-1 shrink-0">Preset:</span>
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
                            onClick={() => handleDatePreset(p.id as DatePreset)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                datePreset === p.id
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Custom Date Pickers & Search */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                        <span className="text-xs text-slate-500 font-bold">📅</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => { setDateFrom(e.target.value); setDatePreset('custom'); }}
                            className="bg-transparent text-xs font-bold text-slate-800 outline-none"
                        />
                        <span className="text-xs text-slate-400">→</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => { setDateTo(e.target.value); setDatePreset('custom'); }}
                            className="bg-transparent text-xs font-bold text-slate-800 outline-none"
                        />
                    </div>

                    <div className="relative min-w-[220px]">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search receipt, waiter, customer..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-emerald-500 outline-none shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 3. 6 GLASSMORPHIC EXECUTIVE KPI CARDS                                */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                {/* 1. Gross POS Turnover */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Turnover</span>
                        <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">💰</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-slate-900">{fmt(posKPIs.totalTurnover)}</div>
                        <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                            {posKPIs.totalBills} completed checks
                        </p>
                    </div>
                </div>

                {/* 2. M-Pesa Collections */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">M-Pesa Tender</span>
                        <span className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center text-sm font-bold">📱</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-green-600">{fmt(posKPIs.mpesaTotal)}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {posKPIs.mpesaShare.toFixed(1)}% of total sales
                        </p>
                    </div>
                </div>

                {/* 3. Cash in Till */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cash in Till</span>
                        <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-bold">💵</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-amber-600">{fmt(posKPIs.cashTotal)}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {posKPIs.cashShare.toFixed(1)}% of total sales
                        </p>
                    </div>
                </div>

                {/* 4. Average Ticket Size */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Check</span>
                        <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">📊</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-blue-600">{fmt(posKPIs.avgBillSize)}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Spend per customer ticket
                        </p>
                    </div>
                </div>

                {/* 5. Discounts & Comps */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Discounts Given</span>
                        <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-bold">🏷️</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-rose-600">{fmt(posKPIs.totalDiscounts)}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Across {posKPIs.discountedBills} discounted orders
                        </p>
                    </div>
                </div>

                {/* 6. Taxes (VAT + Levy) */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">KRA Tax &amp; Levy</span>
                        <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-bold">🏛️</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-purple-700">{fmt(posKPIs.totalTax)}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            16% VAT + 2% Tourism Levy
                        </p>
                    </div>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 4. MULTI-TAB NAVIGATION STRIP (GLASSMORPHIC)                         */}
            {/* ==================================================================== */}
            <div className="bg-white/80 backdrop-blur-md border border-white/80 p-1.5 rounded-2xl shadow-sm flex items-center gap-1 overflow-x-auto scrollbar-none">
                {[
                    { id: 'shifts', label: '⏰ Shift Z-Reports & Reconciliations', count: shifts.length },
                    { id: 'hourly', label: '🕒 Hourly Sales Rush & Heatmap', count: '24h' },
                    { id: 'dining_modes', label: '🍽️ Dining Channel Distribution', count: diningModeStats.length },
                    { id: 'waiters', label: '👤 Waiter & Server Leaderboard', count: waiterStats.length },
                    { id: 'top_products', label: '🏆 Top 25 Best Selling Dishes', count: topProducts.length },
                    { id: 'tenders', label: '💳 Payment Method Analysis', count: 'Tenders' },
                    { id: 'receipts', label: '🔍 Individual Receipts Log', count: filteredSales.length },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as ActivePOSTab)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                            activeTab === tab.id
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                            activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* ==================================================================== */}
            {/* 5. TAB CONTENTS                                                      */}
            {/* ==================================================================== */}

            {/* ── TAB 1: SHIFT Z-REPORTS & RECONCILIATIONS ───────────────────────── */}
            {activeTab === 'shifts' && (
                <div className="space-y-4">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>⏰</span>
                            <span>Cashier Shift Z-Reports &amp; Till Overage/Shortage Audits</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Tracks every register shift closure, initial opening cash floats, system expected cash, physical count in till, and cash variances.
                        </p>
                    </div>

                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
                                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm font-bold">Loading Shift Closures...</p>
                            </div>
                        ) : shifts.length === 0 ? (
                            <div className="p-16 text-center space-y-3">
                                <span className="text-5xl">⏰</span>
                                <h3 className="text-lg font-black text-slate-800">No Shift Records Found</h3>
                                <p className="text-xs text-slate-500">
                                    No shifts were opened or closed during the selected date period.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                            <th className="py-3.5 px-4 w-10 text-center"></th>
                                            <th className="py-3.5 px-4">Shift &amp; Date</th>
                                            <th className="py-3.5 px-4">Cashier / Opened By</th>
                                            <th className="py-3.5 px-4">Closed By</th>
                                            <th className="py-3.5 px-3 text-right">Opening Float</th>
                                            <th className="py-3.5 px-3 text-right">Expected Cash</th>
                                            <th className="py-3.5 px-3 text-right">Actual Closing Cash</th>
                                            <th className="py-3.5 px-3 text-right">Cash Variance</th>
                                            <th className="py-3.5 px-3 text-right">Total Shift Sales</th>
                                            <th className="py-3.5 px-3 text-center">Bills</th>
                                            <th className="py-3.5 px-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {shifts.map((sh, i) => {
                                            const isExpanded = expandedShiftId === sh.shift_id;
                                            const variance = sh.cash_variance;
                                            return (
                                                <React.Fragment key={sh.shift_id}>
                                                    <tr
                                                        onClick={() => setExpandedShiftId(isExpanded ? null : sh.shift_id)}
                                                        className={`hover:bg-emerald-50/40 transition-colors cursor-pointer ${
                                                            isExpanded ? 'bg-emerald-50/60 font-semibold' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                                        }`}
                                                    >
                                                        <td className="py-3 px-4 text-center">
                                                            <span className={`inline-block transition-transform duration-200 text-slate-400 font-bold ${
                                                                isExpanded ? 'rotate-90 text-emerald-600' : ''
                                                            }`}>
                                                                ▶
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-slate-900">
                                                                Shift #{sh.shift_id} ({sh.shift_type})
                                                            </div>
                                                            <span className="text-[11px] text-slate-500">
                                                                {sh.shift_date} • {sh.start_time} {sh.end_time ? `→ ${sh.end_time}` : '(Active)'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-800 font-medium">
                                                            👤 {sh.opened_by}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-600">
                                                            {sh.closed_by || '—'}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                                                            {fmt(sh.opening_cash)}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                                                            {fmt(sh.expectedCash)}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                                                            {sh.actual_cash !== null ? fmt(sh.actual_cash) : '—'}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-black">
                                                            {variance === null ? (
                                                                <span className="text-slate-400">—</span>
                                                            ) : variance === 0 ? (
                                                                <span className="text-slate-500">Ksh 0 (Balanced)</span>
                                                            ) : variance > 0 ? (
                                                                <span className="text-emerald-600">+{fmt(variance)} (Overage)</span>
                                                            ) : (
                                                                <span className="text-rose-600 font-black">{fmt(variance)} (Shortage)</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-bold text-blue-600">
                                                            {fmt(sh.totalSales)}
                                                        </td>
                                                        <td className="py-3 px-3 text-center font-bold text-slate-700">
                                                            {sh.orderCount}
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                sh.status === 'Open'
                                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                                    : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {sh.status}
                                                            </span>
                                                        </td>
                                                    </tr>

                                                    {/* Expanded Sub-Drawer with Payment Tender Breakdown */}
                                                    {isExpanded && (
                                                        <tr className="bg-slate-50/90 border-y border-slate-200">
                                                            <td colSpan={11} className="p-4 sm:p-6">
                                                                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                                                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                                                        <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                                                                            <span>💳</span>
                                                                            <span>Shift #{sh.shift_id} Tender &amp; Disbursement Breakdown</span>
                                                                        </h4>
                                                                        <span className="text-xs text-slate-500 font-mono">
                                                                            {sh.shift_date} ({sh.shift_type} Shift)
                                                                        </span>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Cash Collected</span>
                                                                            <span className="text-sm font-black text-amber-600 font-mono mt-0.5 block">{fmt(sh.cashSales)}</span>
                                                                        </div>
                                                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">M-Pesa Received</span>
                                                                            <span className="text-sm font-black text-green-600 font-mono mt-0.5 block">{fmt(sh.mpesaSales)}</span>
                                                                        </div>
                                                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">PDQ Card Sales</span>
                                                                            <span className="text-sm font-black text-blue-600 font-mono mt-0.5 block">{fmt(sh.cardSales)}</span>
                                                                        </div>
                                                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Room Charge / Credit</span>
                                                                            <span className="text-sm font-black text-purple-600 font-mono mt-0.5 block">{fmt(sh.creditSales)}</span>
                                                                        </div>
                                                                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                                                                            <span className="text-[10px] uppercase font-bold text-rose-500 block">Shift Expenses Paid</span>
                                                                            <span className="text-sm font-black text-rose-600 font-mono mt-0.5 block">-{fmt(sh.totalExpenses)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-800">
                                            <td className="py-4 px-4 text-center" colSpan={4}>
                                                TOTALS ({shifts.length} SHIFTS)
                                            </td>
                                            <td className="py-4 px-3 text-right font-mono">{fmt(shifts.reduce((s, sh) => s + sh.opening_cash, 0))}</td>
                                            <td className="py-4 px-3 text-right font-mono">{fmt(shifts.reduce((s, sh) => s + sh.expectedCash, 0))}</td>
                                            <td className="py-4 px-3 text-right font-mono text-emerald-700">{fmt(shifts.reduce((s, sh) => s + (sh.actual_cash || 0), 0))}</td>
                                            <td className="py-4 px-3 text-right font-mono text-slate-700">{fmt(shifts.reduce((s, sh) => s + (sh.cash_variance || 0), 0))}</td>
                                            <td className="py-4 px-3 text-right font-mono text-blue-600">{fmt(shifts.reduce((s, sh) => s + sh.totalSales, 0))}</td>
                                            <td className="py-4 px-3 text-center">{shifts.reduce((s, sh) => s + sh.orderCount, 0)}</td>
                                            <td className="py-4 px-3"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 2: HOURLY SALES RUSH & HEATMAP ──────────────────────────────── */}
            {activeTab === 'hourly' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>🕒</span>
                            <span>24-Hour POS Peak Sales &amp; Rush Hour Heatmap</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Visualizes revenue and order distribution across the day. Helps kitchen and service managers optimize staffing for peak lunch and dinner rushes.
                        </p>
                    </div>

                    {/* Visual Bar Chart */}
                    <div className="bg-white/90 backdrop-blur-md border border-white/80 p-6 rounded-3xl shadow-sm space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <span className="text-xs font-bold text-slate-500 uppercase">Hourly Turnover Profile (Ksh)</span>
                            <span className="text-xs font-bold text-emerald-700">Peak: {fmt(hourlyDistribution.maxRev)}</span>
                        </div>

                        <div className="flex items-end gap-1.5 sm:gap-2 pt-6 pb-2 h-48 overflow-x-auto">
                            {hourlyDistribution.hours.map(h => {
                                const heightPct = (h.revenue / hourlyDistribution.maxRev) * 100;
                                const isPeak = h.revenue === hourlyDistribution.maxRev && h.revenue > 0;
                                return (
                                    <div key={h.hour} className="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 group">
                                        <span className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {h.revenue > 0 ? fmt(h.revenue) : ''}
                                        </span>
                                        <div
                                            style={{ height: `${Math.max(6, heightPct)}%` }}
                                            className={`w-full rounded-t-lg transition-all duration-300 ${
                                                isPeak
                                                    ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-md shadow-emerald-200'
                                                    : h.revenue > 0
                                                    ? 'bg-gradient-to-t from-slate-400 to-slate-300 hover:from-emerald-500 hover:to-teal-400'
                                                    : 'bg-slate-200'
                                            }`}
                                        />
                                        <span className="text-[10px] font-mono font-bold text-slate-600 mt-1">
                                            {h.label.split(':')[0]}h
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Hourly Detail Table */}
                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                        <th className="py-3.5 px-4">Time Window</th>
                                        <th className="py-3.5 px-4 text-right">Bills Completed</th>
                                        <th className="py-3.5 px-4 text-right">Revenue Generated</th>
                                        <th className="py-3.5 px-4 text-right">Average Check</th>
                                        <th className="py-3.5 px-4 text-center">% of Turnover</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {hourlyDistribution.hours.filter(h => h.orders > 0).map(h => (
                                        <tr key={h.hour} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4 font-bold text-slate-800">
                                                ⏰ {h.label} – {String(h.hour + 1).padStart(2, '0')}:00
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-slate-700">
                                                {h.orders} orders
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                                                {fmt(h.revenue)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                                                {fmt(h.orders > 0 ? h.revenue / h.orders : 0)}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-slate-700">
                                                {posKPIs.totalTurnover > 0 ? ((h.revenue / posKPIs.totalTurnover) * 100).toFixed(1) : 0}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 3: DINING MODE DISTRIBUTION ────────────────────────────────── */}
            {activeTab === 'dining_modes' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>🍽️</span>
                            <span>Dining Service Channel Distribution</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Revenue and ticket averages across Dine-In Restaurant, Takeaway Counter, Hotel Room Service, and Delivery.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {diningModeStats.map(dm => (
                            <div key={dm.mode} className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                                        Channel
                                    </span>
                                    <h4 className="text-base font-black text-slate-900 mt-2 flex items-center gap-2">
                                        <span>
                                            {dm.mode.toLowerCase().includes('room') ? '🏨' : dm.mode.toLowerCase().includes('take') ? '📦' : dm.mode.toLowerCase().includes('deliv') ? '🛵' : '🍽️'}
                                        </span>
                                        <span>{dm.mode}</span>
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5">{dm.orders} checks punched</p>
                                </div>

                                <div className="mt-4 pt-3 border-t border-slate-100">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-lg font-black text-slate-900 font-mono">{fmt(dm.revenue)}</span>
                                        <span className="text-xs font-black text-emerald-600">{dm.share.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1.5">
                                        <div style={{ width: `${dm.share}%` }} className="bg-emerald-600 h-full rounded-full" />
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-2">
                                        Average check: <strong className="text-slate-700">{fmt(dm.avgTicket)}</strong>
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TAB 4: WAITER & SERVER LEADERBOARD ──────────────────────────────── */}
            {activeTab === 'waiters' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>👤</span>
                            <span>Front-of-House Waiter &amp; Cashier Sales Leaderboard</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Ranked performance of service staff by order count, gross sales volume, average check size, and estimated service commissions.
                        </p>
                    </div>

                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                        <th className="py-3.5 px-4 w-12 text-center">Rank</th>
                                        <th className="py-3.5 px-4">Waiter / Server Name</th>
                                        <th className="py-3.5 px-3 text-right">Bills Punched</th>
                                        <th className="py-3.5 px-3 text-right">Cash Received</th>
                                        <th className="py-3.5 px-3 text-right">M-Pesa Received</th>
                                        <th className="py-3.5 px-4 text-right">Total Sales Generated</th>
                                        <th className="py-3.5 px-4 text-right">Average Check</th>
                                        <th className="py-3.5 px-4 text-right">Est. 5% Service Tip</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {waiterStats.map((w, i) => (
                                        <tr key={w.name} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black mx-auto ${
                                                    i === 0 ? 'bg-amber-400 text-slate-900 shadow-sm' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-700 text-white' : 'text-slate-500'
                                                }`}>
                                                    {i + 1}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-900">
                                                👤 {w.name}
                                            </td>
                                            <td className="py-3 px-3 text-right font-bold text-slate-700">
                                                {w.orders}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono text-amber-600 font-bold">
                                                {fmt(w.cash)}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono text-green-600 font-bold">
                                                {fmt(w.mpesa)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 text-sm">
                                                {fmt(w.revenue)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                                                {fmt(w.avgOrder)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-bold text-blue-600">
                                                {fmt(w.serviceIncentive)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 5: TOP 25 BEST SELLING DISHES ───────────────────────────────── */}
            {activeTab === 'top_products' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>🏆</span>
                            <span>Top 25 Best-Selling Dishes &amp; Drinks by Revenue</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Fastest-moving items at POS registers ranked by total cash turnover.
                        </p>
                    </div>

                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                        <th className="py-3.5 px-4 w-12 text-center">Rank</th>
                                        <th className="py-3.5 px-4">Product Name</th>
                                        <th className="py-3.5 px-3 text-right">Units Sold</th>
                                        <th className="py-3.5 px-3 text-right">Avg Unit Price</th>
                                        <th className="py-3.5 px-4 text-right">Gross Revenue</th>
                                        <th className="py-3.5 px-4 text-center">% Contribution</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {topProducts.map((p, i) => (
                                        <tr key={p.name} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black mx-auto ${
                                                    i === 0 ? 'bg-amber-400 text-slate-900' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-700 text-white' : 'text-slate-500'
                                                }`}>
                                                    {i + 1}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-900">
                                                🍽️ {p.name}
                                            </td>
                                            <td className="py-3 px-3 text-right font-bold text-slate-800">
                                                {p.qty}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono text-slate-600">
                                                {fmt(p.avgPrice)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                                                {fmt(p.revenue)}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-slate-700">
                                                {p.share.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 6: PAYMENT METHOD ANALYSIS ──────────────────────────────────── */}
            {activeTab === 'tenders' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>💳</span>
                            <span>Payment Tender Distribution &amp; Settlement Channels</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Complete reconciliation between mobile money (M-Pesa), physical till cash, electronic PDQ card machines, and company room credits.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-sm text-slate-800">📱 M-Pesa Till</span>
                                <span className="text-xs font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    {posKPIs.mpesaShare.toFixed(1)}%
                                </span>
                            </div>
                            <div className="text-2xl font-black text-green-600 font-mono">{fmt(posKPIs.mpesaTotal)}</div>
                            <p className="text-xs text-slate-500">{posKPIs.mpesaCount} successful transactions</p>
                        </div>

                        <div className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-sm text-slate-800">💵 Physical Cash</span>
                                <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                    {posKPIs.cashShare.toFixed(1)}%
                                </span>
                            </div>
                            <div className="text-2xl font-black text-amber-600 font-mono">{fmt(posKPIs.cashTotal)}</div>
                            <p className="text-xs text-slate-500">{posKPIs.cashCount} cash transactions</p>
                        </div>

                        <div className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-sm text-slate-800">💳 Card / PDQ</span>
                                <span className="text-xs font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                    {posKPIs.totalTurnover > 0 ? ((posKPIs.cardTotal / posKPIs.totalTurnover) * 100).toFixed(1) : 0}%
                                </span>
                            </div>
                            <div className="text-2xl font-black text-blue-600 font-mono">{fmt(posKPIs.cardTotal)}</div>
                            <p className="text-xs text-slate-500">{posKPIs.cardCount} card transactions</p>
                        </div>

                        <div className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-sm text-slate-800">🏨 Credit / Room Charge</span>
                                <span className="text-xs font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                                    {posKPIs.totalTurnover > 0 ? ((posKPIs.creditTotal / posKPIs.totalTurnover) * 100).toFixed(1) : 0}%
                                </span>
                            </div>
                            <div className="text-2xl font-black text-purple-600 font-mono">{fmt(posKPIs.creditTotal)}</div>
                            <p className="text-xs text-slate-500">{posKPIs.creditCount} ledger transfers</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 7: INDIVIDUAL RECEIPTS LOG ─────────────────────────────────── */}
            {activeTab === 'receipts' && (
                <div className="space-y-4">
                    {/* Filters Bar */}
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-3.5 px-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-500 uppercase text-[11px]">Tender:</span>
                            {availableTenders.map(m => (
                                <button
                                    key={m}
                                    onClick={() => setFilterMethod(m)}
                                    className={`px-3 py-1 rounded-xl font-bold transition-all ${
                                        filterMethod === m
                                            ? 'bg-emerald-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-500 uppercase text-[11px]">Server:</span>
                            <select
                                value={filterWaiter}
                                onChange={e => setFilterWaiter(e.target.value)}
                                className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                            >
                                {availableWaiters.map(w => (
                                    <option key={w} value={w}>{w}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Receipts Table */}
                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                        <th className="py-3.5 px-4 w-10 text-center"></th>
                                        <th className="py-3.5 px-4">Receipt #</th>
                                        <th className="py-3.5 px-3">Date &amp; Time</th>
                                        <th className="py-3.5 px-4">Server</th>
                                        <th className="py-3.5 px-3">Table / Room</th>
                                        <th className="py-3.5 px-3">Channel</th>
                                        <th className="py-3.5 px-3">Customer</th>
                                        <th className="py-3.5 px-3 text-right">Subtotal</th>
                                        <th className="py-3.5 px-3 text-right">Discount</th>
                                        <th className="py-3.5 px-4 text-right">Total Paid</th>
                                        <th className="py-3.5 px-3 text-center">Tender</th>
                                        <th className="py-3.5 px-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {filteredSales.map((s, i) => {
                                        const isExpanded = expandedReceiptId === s.sale_id;
                                        return (
                                            <React.Fragment key={s.sale_id}>
                                                <tr
                                                    onClick={() => setExpandedReceiptId(isExpanded ? null : s.sale_id)}
                                                    className={`hover:bg-emerald-50/40 transition-colors cursor-pointer ${
                                                        isExpanded ? 'bg-emerald-50/60 font-semibold' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                                    }`}
                                                >
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`inline-block transition-transform duration-200 text-slate-400 font-bold ${
                                                            isExpanded ? 'rotate-90 text-emerald-600' : ''
                                                        }`}>
                                                            ▶
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                                                        {s.receipt_no}
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-600">
                                                        {s.sale_date} <span className="text-[10px] text-slate-400 block">{s.sale_time}</span>
                                                    </td>
                                                    <td className="py-3 px-4 font-bold text-slate-800">
                                                        👤 {s.waiter_name}
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-600 font-medium">
                                                        {s.table_name ? `Table ${s.table_name}` : s.room_name ? `Room ${s.room_name}` : s.order_type}
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-500">
                                                        {s.order_type}
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-700">
                                                        {s.customer_name}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                                                        {fmt(s.subtotal)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono text-rose-600 font-bold">
                                                        {s.discount > 0 ? `-${fmt(s.discount)}` : '—'}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                                                        {fmt(s.total_amount)}
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                                                            {s.payment_method}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                </tr>

                                                {/* Expanded Receipt Items Sub-Drawer */}
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/90 border-y border-slate-200">
                                                        <td colSpan={12} className="p-4 sm:p-6">
                                                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                                                                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
                                                                    <span>🍽️</span>
                                                                    <span>Ticket Items — {s.receipt_no}</span>
                                                                </h4>

                                                                {(!s.items || s.items.length === 0) ? (
                                                                    <p className="text-xs text-slate-400 italic">No item line data recorded for this sale.</p>
                                                                ) : (
                                                                    <div className="divide-y divide-slate-100 text-xs">
                                                                        {s.items.map(it => (
                                                                            <div key={it.item_id} className="py-2 flex items-center justify-between">
                                                                                <span className="font-bold text-slate-800">
                                                                                    {it.quantity}x {it.product_name}
                                                                                </span>
                                                                                <div className="flex items-center gap-4">
                                                                                    <span className="text-slate-500 font-mono">@{fmtDec(it.unit_price)}</span>
                                                                                    <span className="font-mono font-black text-slate-900">{fmt(it.subtotal)}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
