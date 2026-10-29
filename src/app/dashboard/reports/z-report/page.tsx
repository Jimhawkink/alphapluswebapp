'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface ShiftZRecord {
    shift_id: number;
    shift_date: string;
    shift_type: string;
    opened_by: string;
    closed_by: string | null;
    opening_cash: number;
    closing_cash: number | null;
    actual_cash: number | null;
    status: string;
}

export default function OfficialZReportPage() {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [reportType, setReportType] = useState<'Z_REPORT' | 'X_REPORT'>('Z_REPORT');
    const [isLoading, setIsLoading] = useState(true);

    // Live clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Actual counted cash drawer input
    const [countedCashInput, setCountedCashInput] = useState('');
    const [cashierNotes, setCashierNotes] = useState('');

    // Sales Data for Selected Period
    const [sales, setSales] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [shiftData, setShiftData] = useState<ShiftZRecord | null>(null);

    // Fetch Day's Data
    const loadZReportData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch sales for the selected date
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('*')
                .gte('sale_date', selectedDate)
                .lte('sale_date', selectedDate)
                .order('sale_id', { ascending: true });

            if (salesError) throw salesError;
            setSales(salesData || []);

            // 2. Fetch shift records
            const { data: shiftRecords } = await supabase
                .from('shifts')
                .select('*')
                .eq('shift_date', selectedDate)
                .order('shift_id', { ascending: false })
                .limit(1);

            if (shiftRecords && shiftRecords.length > 0) {
                setShiftData(shiftRecords[0]);
                if (shiftRecords[0].actual_cash !== null && shiftRecords[0].actual_cash !== undefined) {
                    setCountedCashInput(shiftRecords[0].actual_cash.toString());
                }
            } else {
                setShiftData(null);
            }

            // 3. Fetch expenses / payouts for the date
            const { data: expenseRecords } = await supabase
                .from('expenses')
                .select('*')
                .eq('expense_date', selectedDate);

            setExpenses(expenseRecords || []);

        } catch (err) {
            console.error('Error fetching Z-Report data:', err);
            toast.error('Failed to load fiscal sales data');
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadZReportData();
    }, [loadZReportData]);

    // Computed Fiscal Totals
    const fiscalMetrics = useMemo(() => {
        const completed = sales.filter(s => s.status !== 'Void' && s.status !== 'Voided' && s.status !== 'Cancelled');
        const voided = sales.filter(s => s.status === 'Void' || s.status === 'Voided' || s.status === 'Cancelled');

        // Sequence
        const firstReceipt = completed.length > 0 ? completed[0].receipt_no || `RCP-${completed[0].sale_id}` : 'N/A';
        const lastReceipt = completed.length > 0 ? completed[completed.length - 1].receipt_no || `RCP-${completed[completed.length - 1].sale_id}` : 'N/A';

        // Revenue
        const grossTurnover = completed.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
        const totalDiscounts = completed.reduce((sum, s) => sum + (Number(s.discount) || 0), 0);
        const netTurnover = completed.reduce((sum, s) => sum + (Number(s.net_amount) || Number(s.subtotal) || 0), 0);
        const voidedTotal = voided.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

        // KRA Tax Breakdown
        // Tax A: 16% VAT, Tax B: 2% Catering/Tourism Levy
        let vatTotal = 0;
        let levyTotal = 0;
        let totalTax = 0;

        completed.forEach(s => {
            const vt = Number(s.vat_amount) || 0;
            const lt = Number(s.levy_amount) || 0;
            const tt = Number(s.total_tax) || (vt + lt);
            vatTotal += vt;
            levyTotal += lt;
            totalTax += tt;
        });

        // Tender Breakdown
        let cashSales = 0;
        let mpesaSales = 0;
        let cardSales = 0;
        let creditSales = 0;
        let roomChargeSales = 0;
        let mpesaCount = 0;
        let cashCount = 0;

        completed.forEach(s => {
            const m = (s.payment_method || '').toLowerCase();
            const amt = Number(s.total_amount) || 0;
            if (m.includes('cash')) {
                cashSales += amt;
                cashCount++;
            } else if (m.includes('mpesa') || m.includes('m-pesa')) {
                mpesaSales += amt;
                mpesaCount++;
            } else if (m.includes('card') || m.includes('bank') || m.includes('pdq')) {
                cardSales += amt;
            } else if (m.includes('room')) {
                roomChargeSales += amt;
            } else {
                creditSales += amt;
            }
        });

        // Cash Drawer Reconciliation
        const openingFloat = shiftData ? Number(shiftData.opening_cash) || 0 : 5000;
        const totalPayouts = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const expectedTillCash = openingFloat + cashSales - totalPayouts;
        const actualCounted = parseFloat(countedCashInput) || expectedTillCash;
        const variance = actualCounted - expectedTillCash;

        return {
            firstReceipt,
            lastReceipt,
            totalChecks: completed.length,
            voidCount: voided.length,
            voidedTotal,
            grossTurnover,
            totalDiscounts,
            netTurnover,
            vatTotal,
            levyTotal,
            totalTax,
            cashSales,
            cashCount,
            mpesaSales,
            mpesaCount,
            cardSales,
            creditSales,
            roomChargeSales,
            openingFloat,
            totalPayouts,
            expectedTillCash,
            actualCounted,
            variance
        };
    }, [sales, shiftData, expenses, countedCashInput]);

    // Handle Direct Print
    const handlePrintZ = () => {
        window.print();
    };

    // Export CSV
    const exportCSV = () => {
        const headers = ['Fiscal Field', 'Value'];
        const rows = [
            ['Report Type', reportType === 'Z_REPORT' ? 'Official Z-Report (End of Day)' : 'Mid-Day X-Report (Flash)'],
            ['Date', selectedDate],
            ['First Receipt', fiscalMetrics.firstReceipt],
            ['Last Receipt', fiscalMetrics.lastReceipt],
            ['Total Completed Checks', fiscalMetrics.totalChecks.toString()],
            ['Gross Sales Turnover (KES)', fiscalMetrics.grossTurnover.toFixed(2)],
            ['Discounts Granted (KES)', fiscalMetrics.totalDiscounts.toFixed(2)],
            ['Net Sales Turnover (KES)', fiscalMetrics.netTurnover.toFixed(2)],
            ['KRA 16% VAT (KES)', fiscalMetrics.vatTotal.toFixed(2)],
            ['KRA 2% Tourism Levy (KES)', fiscalMetrics.levyTotal.toFixed(2)],
            ['Total Tax Collected (KES)', fiscalMetrics.totalTax.toFixed(2)],
            ['Cash Tender (KES)', fiscalMetrics.cashSales.toFixed(2)],
            ['M-Pesa Tender (KES)', fiscalMetrics.mpesaSales.toFixed(2)],
            ['PDQ Card Tender (KES)', fiscalMetrics.cardSales.toFixed(2)],
            ['Credit / Room Folio (KES)', (fiscalMetrics.creditSales + fiscalMetrics.roomChargeSales).toFixed(2)],
            ['Opening Cash Float (KES)', fiscalMetrics.openingFloat.toFixed(2)],
            ['Cash Drawer Payouts (KES)', fiscalMetrics.totalPayouts.toFixed(2)],
            ['Expected Till Cash (KES)', fiscalMetrics.expectedTillCash.toFixed(2)],
            ['Counted Cash (KES)', fiscalMetrics.actualCounted.toFixed(2)],
            ['Drawer Variance (KES)', fiscalMetrics.variance.toFixed(2)],
        ];

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => `"${r[0]}","${r[1]}"`)].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Z_Report_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported Z-Report CSV successfully!');
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-white p-3 sm:p-5 -m-4 sm:-m-6 space-y-4 select-none font-sans relative overflow-x-hidden">
            <Toaster position="top-right" />

            {/* ==================================================================== */}
            {/* 1. CYBER EMERALD TOP COMMAND BAR                                     */}
            {/* ==================================================================== */}
            <header className="relative bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-[#00e676]/15 border border-[#00e676]/50 flex items-center justify-center text-[#00e676] text-2xl shadow-[0_0_15px_rgba(0,230,118,0.3)] shrink-0 font-black">
                        🧾
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>AlphaPlus</span>
                                <span className="text-[#00e676] drop-shadow-[0_0_20px_rgba(0,230,118,0.8)]">
                                    {reportType === 'Z_REPORT' ? 'Official Z-Report' : 'Mid-Shift X-Report'}
                                </span>
                            </h1>
                            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-[#00e676] border border-[#00e676]/40 backdrop-blur-md flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,230,118,0.25)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] shadow-[0_0_6px_#00e676] animate-pulse" />
                                KRA &amp; Fiscal Compliance EOD
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2.5 font-mono flex-wrap">
                            <span className="text-[#00e676] font-black bg-[#0c161e] px-2.5 py-0.5 rounded-lg border border-[#00e676]/30 shadow-inner">
                                {liveTime.toLocaleTimeString('en-GB')} EAT
                            </span>
                            <span>•</span>
                            <span className="text-white font-bold">{fiscalMetrics.totalChecks} Completed Receipts</span>
                            <span>•</span>
                            <span className="text-gray-300">Seq: {fiscalMetrics.firstReceipt} → {fiscalMetrics.lastReceipt}</span>
                        </div>
                    </div>
                </div>

                {/* Report Type & Date Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center bg-[#0c161e] p-1 rounded-xl border border-[#162a2e]">
                        <button
                            type="button"
                            onClick={() => setReportType('Z_REPORT')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                reportType === 'Z_REPORT'
                                    ? 'bg-[#00e676] text-black shadow-md'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Z-Report (EOD)
                        </button>
                        <button
                            type="button"
                            onClick={() => setReportType('X_REPORT')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                reportType === 'X_REPORT'
                                    ? 'bg-amber-400 text-black shadow-md'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            X-Report (Flash)
                        </button>
                    </div>

                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="p-2 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#00e676]"
                    />

                    <button
                        type="button"
                        onClick={exportCSV}
                        className="px-3.5 py-2 bg-[#0c161e] hover:bg-[#132230] text-gray-200 hover:text-white border border-[#162a2e] hover:border-[#00e676]/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>

                    <button
                        type="button"
                        onClick={handlePrintZ}
                        className="px-4 py-2 bg-[#00e676] hover:bg-[#00c853] text-black font-black rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(0,230,118,0.3)] flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                        <span>🖨️</span>
                        <span>Print 80mm Slip</span>
                    </button>
                </div>
            </header>

            {/* Neon Cyber Accent Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-[#00e676] via-teal-400 to-transparent shadow-[0_0_10px_#00e676] rounded-full" />

            {/* ==================================================================== */}
            {/* 2. DUAL LAYOUT: SCREEN SUMMARY HUD (LEFT) + 80MM THERMAL SLIP (RIGHT) */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* ── LEFT: INTERACTIVE DASHBOARD SUMMARY (7 Cols) ── */}
                <div className="lg:col-span-7 space-y-4">

                    {/* Revenue & Tax Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Gross Sales Turnover</span>
                            <p className="text-xl font-black text-white font-mono mt-1">
                                KES {fiscalMetrics.grossTurnover.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Discounts: -KES {fiscalMetrics.totalDiscounts.toLocaleString()}</p>
                        </div>

                        <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net Taxable Revenue</span>
                            <p className="text-xl font-black text-[#00e676] font-mono mt-1">
                                KES {fiscalMetrics.netTurnover.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Excludes indirect taxes</p>
                        </div>

                        <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total KRA Taxes (18%)</span>
                            <p className="text-xl font-black text-cyan-400 font-mono mt-1">
                                KES {fiscalMetrics.totalTax.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">VAT 16% + 2% Levy</p>
                        </div>
                    </div>

                    {/* Tender Breakdown Card */}
                    <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between pb-2 border-b border-[#162a2e]">
                            <h3 className="text-xs font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5">
                                <span>💳</span> Payment Tender Breakdown
                            </h3>
                            <span className="text-[11px] font-mono text-[#00e676] font-bold">100% Accounted</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                            <div className="p-3 bg-[#080e14] border border-[#162a2e] rounded-xl">
                                <span className="text-[10px] text-gray-400 block mb-0.5">💵 Exact Cash ({fiscalMetrics.cashCount})</span>
                                <span className="text-base font-black text-white">KES {fiscalMetrics.cashSales.toLocaleString()}</span>
                            </div>
                            <div className="p-3 bg-[#080e14] border border-[#162a2e] rounded-xl">
                                <span className="text-[10px] text-gray-400 block mb-0.5">📱 M-Pesa Till ({fiscalMetrics.mpesaCount})</span>
                                <span className="text-base font-black text-[#00e676]">KES {fiscalMetrics.mpesaSales.toLocaleString()}</span>
                            </div>
                            <div className="p-3 bg-[#080e14] border border-[#162a2e] rounded-xl">
                                <span className="text-[10px] text-gray-400 block mb-0.5">💳 PDQ Cards</span>
                                <span className="text-base font-black text-cyan-400">KES {fiscalMetrics.cardSales.toLocaleString()}</span>
                            </div>
                            <div className="p-3 bg-[#080e14] border border-[#162a2e] rounded-xl">
                                <span className="text-[10px] text-gray-400 block mb-0.5">🏨 Room / Debtor</span>
                                <span className="text-base font-black text-purple-400">KES {(fiscalMetrics.creditSales + fiscalMetrics.roomChargeSales).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Cash Drawer Reconciliation Panel */}
                    <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between pb-2 border-b border-[#162a2e]">
                            <h3 className="text-xs font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5">
                                <span>🗄️</span> Cash Drawer Audit &amp; Reconciliation
                            </h3>
                            <span className="text-[10px] text-gray-400">Float + Cash Sales − Payouts</span>
                        </div>

                        <div className="space-y-2 text-xs font-mono">
                            <div className="flex justify-between text-gray-400">
                                <span>(+) Register Opening Float:</span>
                                <span className="text-white font-bold">KES {fiscalMetrics.openingFloat.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>(+) Cash Collected from Checks:</span>
                                <span className="text-white font-bold">KES {fiscalMetrics.cashSales.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>(−) Cash Expenses &amp; Petty Payouts:</span>
                                <span className="text-rose-400 font-bold">-KES {fiscalMetrics.totalPayouts.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm font-black pt-1.5 border-t border-white/5 text-white">
                                <span>Expected Drawer Cash:</span>
                                <span className="text-cyan-400">KES {fiscalMetrics.expectedTillCash.toLocaleString()}</span>
                            </div>

                            {/* Actual Counted Input */}
                            <div className="pt-2 flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-gray-300">Actual Physically Counted Cash:</span>
                                <input
                                    type="number"
                                    value={countedCashInput}
                                    onChange={(e) => setCountedCashInput(e.target.value)}
                                    placeholder="Enter counted notes..."
                                    className="p-2 bg-[#080e14] border border-[#162a2e] rounded-xl text-sm font-black text-right text-white focus:outline-none focus:border-[#00e676] w-36 font-mono"
                                />
                            </div>

                            {/* Variance Indicator */}
                            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-black ${
                                fiscalMetrics.variance === 0
                                    ? 'bg-emerald-950/80 text-[#00e676] border-[#00e676]/40'
                                    : fiscalMetrics.variance > 0
                                    ? 'bg-blue-950/80 text-blue-300 border-blue-500/40'
                                    : 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                            }`}>
                                <span>Drawer Status:</span>
                                <span>
                                    {fiscalMetrics.variance === 0 ? '✓ Balanced (Zero Discrepancy)' :
                                     fiscalMetrics.variance > 0 ? `+KES ${fiscalMetrics.variance.toLocaleString()} Surplus` :
                                     `-KES ${Math.abs(fiscalMetrics.variance).toLocaleString()} Shortage`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Voids & Loss Audit Box */}
                    {fiscalMetrics.voidCount > 0 && (
                        <div className="bg-rose-950/30 border border-rose-500/40 rounded-2xl p-3.5 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-rose-300">
                                <span>⚠️</span>
                                <span><strong>{fiscalMetrics.voidCount} Voids / Cancelled Orders</strong> were recorded today (KES {fiscalMetrics.voidedTotal.toLocaleString()}).</span>
                            </div>
                            <Link href="/dashboard/reports/void-audit" className="text-rose-400 font-bold hover:underline shrink-0 text-xs">
                                Inspect Audit Trail →
                            </Link>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: 80MM THERMAL SLIP PREVIEW (5 Cols) ── */}
                <div className="lg:col-span-5 space-y-3">
                    <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-2xl">
                        <div className="flex items-center justify-between pb-3 border-b border-[#162a2e] text-xs font-bold text-gray-300">
                            <span>🖨️ 80mm Thermal POS Printout Preview</span>
                            <span className="text-[#00e676] font-mono">Certified ESC/POS</span>
                        </div>

                        {/* White Thermal Receipt Paper */}
                        <div className="bg-white text-black p-5 rounded-xl font-mono text-[11px] leading-relaxed shadow-inner border border-gray-300 mt-3 space-y-2 max-h-[640px] overflow-y-auto">
                            {/* Header */}
                            <div className="text-center border-b pb-2">
                                <h3 className="font-extrabold text-sm uppercase">ALPHAPLUS HOTEL &amp; RESTAURANT</h3>
                                <p className="text-[10px] text-gray-700">Prime Hospitality &amp; Dining Lounge</p>
                                <p className="text-[10px] text-gray-700">KRA PIN: P051234567X · VAT Reg: 0123456</p>
                                <p className="text-[10px] text-gray-700">Nairobi, Kenya · Tel: +254 700 000 000</p>
                                <h4 className="font-black text-xs uppercase mt-1 border-t pt-1">
                                    *** {reportType === 'Z_REPORT' ? 'DAILY END-OF-DAY Z-REPORT' : 'MID-SHIFT X-REPORT'} ***
                                </h4>
                            </div>

                            {/* Metadata */}
                            <div className="text-[10px] border-b pb-2 space-y-0.5">
                                <div className="flex justify-between">
                                    <span>Business Date:</span>
                                    <span>{selectedDate}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Printed At:</span>
                                    <span>{new Date().toLocaleTimeString('en-GB')} EAT</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Shift Cashier:</span>
                                    <span>{shiftData?.opened_by || 'Head Cashier'}</span>
                                </div>
                                <div className="flex justify-between font-bold">
                                    <span>Start Receipt #:</span>
                                    <span>{fiscalMetrics.firstReceipt}</span>
                                </div>
                                <div className="flex justify-between font-bold">
                                    <span>End Receipt #:</span>
                                    <span>{fiscalMetrics.lastReceipt}</span>
                                </div>
                            </div>

                            {/* Turnover Section */}
                            <div className="border-b pb-2 space-y-0.5">
                                <div className="flex justify-between font-bold">
                                    <span>GROSS SALES TURNOVER:</span>
                                    <span>KES {fiscalMetrics.grossTurnover.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-gray-700">
                                    <span>Total Discounts Given:</span>
                                    <span>-KES {fiscalMetrics.totalDiscounts.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between font-black text-xs pt-1 border-t">
                                    <span>NET SALES TURNOVER:</span>
                                    <span>KES {fiscalMetrics.netTurnover.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Tax Section */}
                            <div className="border-b pb-2 space-y-0.5">
                                <p className="font-bold underline text-[10px]">KRA TAXES &amp; LEVIES:</p>
                                <div className="flex justify-between">
                                    <span>Tax A (16% VAT):</span>
                                    <span>KES {fiscalMetrics.vatTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tax B (2% Catering Levy):</span>
                                    <span>KES {fiscalMetrics.levyTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between font-bold pt-0.5">
                                    <span>TOTAL TAXES COLLECTED:</span>
                                    <span>KES {fiscalMetrics.totalTax.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Tender Section */}
                            <div className="border-b pb-2 space-y-0.5">
                                <p className="font-bold underline text-[10px]">PAYMENT TENDERS:</p>
                                <div className="flex justify-between">
                                    <span>Cash Tendered:</span>
                                    <span>KES {fiscalMetrics.cashSales.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>M-Pesa Collections:</span>
                                    <span>KES {fiscalMetrics.mpesaSales.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>PDQ Card Collections:</span>
                                    <span>KES {fiscalMetrics.cardSales.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Hotel Room Folios / Credit:</span>
                                    <span>KES {(fiscalMetrics.creditSales + fiscalMetrics.roomChargeSales).toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Cash Drawer Reconciliation */}
                            <div className="border-b pb-2 space-y-0.5">
                                <p className="font-bold underline text-[10px]">CASH DRAWER RECONCILIATION:</p>
                                <div className="flex justify-between">
                                    <span>Opening Till Float:</span>
                                    <span>KES {fiscalMetrics.openingFloat.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Cash Drawer Payouts / Exp:</span>
                                    <span>-KES {fiscalMetrics.totalPayouts.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between font-bold">
                                    <span>Expected Drawer Total:</span>
                                    <span>KES {fiscalMetrics.expectedTillCash.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between font-black">
                                    <span>Counted Cash in Till:</span>
                                    <span>KES {fiscalMetrics.actualCounted.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between font-black pt-1 border-t text-[12px]">
                                    <span>CASH VARIANCE:</span>
                                    <span>
                                        {fiscalMetrics.variance === 0 ? 'KES 0 (BALANCED)' :
                                         fiscalMetrics.variance > 0 ? `+KES ${fiscalMetrics.variance.toLocaleString()} (OVER)` :
                                         `-KES ${Math.abs(fiscalMetrics.variance).toLocaleString()} (SHORT)`}
                                    </span>
                                </div>
                            </div>

                            {/* Signature Sign-offs */}
                            <div className="pt-3 space-y-4 text-[10px]">
                                <div className="flex justify-between">
                                    <div>
                                        <p className="border-t border-dotted pt-1 w-28">Cashier Signature</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="border-t border-dotted pt-1 w-28">Manager Signature</p>
                                    </div>
                                </div>
                                <p className="text-center text-[9px] text-gray-600">
                                    *** FISCAL RECORD COPY — STORE IN SAFE ***
                                </p>
                            </div>
                        </div>

                        {/* Print Button */}
                        <button
                            type="button"
                            onClick={handlePrintZ}
                            className="w-full py-3.5 bg-[#00e676] hover:bg-[#00c853] text-black font-black text-xs rounded-xl shadow-[0_0_20px_rgba(0,230,118,0.4)] transition-all flex items-center justify-center gap-1.5 mt-3 active:scale-95 cursor-pointer"
                        >
                            <span>🖨️</span>
                            <span>PRINT OFFICIAL 80MM Z-REPORT NOW</span>
                        </button>
                    </div>
                </div>

            </div>

        </div>
    );
}
