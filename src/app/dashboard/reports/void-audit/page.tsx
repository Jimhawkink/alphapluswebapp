'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface VoidAuditRecord {
    id: string | number;
    sale_id?: number;
    receipt_no: string;
    timestamp: string;
    table_name: string;
    waiter_name: string;
    authorized_by: string;
    items_summary: string;
    total_amount: number;
    status: 'Voided' | 'Cancelled' | 'Refunded';
    reason: string;
    kitchen_sent: boolean;
    fraud_risk: 'LOW' | 'MEDIUM' | 'HIGH';
    elapsed_minutes: number;
}

export default function VoidAuditReportPage() {
    // State
    const [records, setRecords] = useState<VoidAuditRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRisk, setFilterRisk] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
    const [filterReason, setFilterReason] = useState<string>('ALL');
    const [filterStaff, setFilterStaff] = useState<string>('ALL');
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    // Live clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Load Void & Cancelled Sales
    const loadVoidRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            // Query sales that are voided or cancelled
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('*')
                .or('status.ilike.%void%,status.ilike.%cancel%,status.ilike.%refund%')
                .order('sale_id', { ascending: false });

            if (salesError) {
                console.warn('Error loading void sales:', salesError);
            }

            // Also check recent sales with notes containing void or cancellation
            const { data: allRecentSales } = await supabase
                .from('sales')
                .select('*')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo)
                .order('sale_id', { ascending: false })
                .limit(200);

            // Fetch items for voided sales
            const voidSales = (salesData || []).concat(
                (allRecentSales || []).filter(s => {
                    const st = (s.status || '').toLowerCase();
                    const n = (s.notes || '').toLowerCase();
                    return st === 'void' || st === 'voided' || st === 'cancelled' || n.includes('void') || n.includes('cancel');
                })
            );

            // Deduplicate by sale_id
            const uniqueMap = new Map<number, any>();
            voidSales.forEach(s => {
                if (!uniqueMap.has(s.sale_id)) {
                    uniqueMap.set(s.sale_id, s);
                }
            });
            const uniqueVoidSales = Array.from(uniqueMap.values());

            const saleIds = uniqueVoidSales.map(s => s.sale_id);
            let itemsMap: Record<number, any[]> = {};

            if (saleIds.length > 0) {
                const { data: itemsData } = await supabase
                    .from('sales_items')
                    .select('*')
                    .in('sale_id', saleIds);

                if (itemsData) {
                    itemsData.forEach(item => {
                        if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
                        itemsMap[item.sale_id].push(item);
                    });
                }
            }

            // Build Audit Trail Records
            const mappedRecords: VoidAuditRecord[] = uniqueVoidSales.map(s => {
                const items = itemsMap[s.sale_id] || [];
                const itemsText = items.length > 0
                    ? items.map(i => `${i.quantity}x ${i.product_name || i.dish_name}`).join(', ')
                    : (s.notes || 'Voided Order Check');

                const createdTime = s.sale_datetime || s.created_at || s.sale_date;
                const elapsedMin = createdTime ? Math.max(1, Math.round((Date.now() - new Date(createdTime).getTime()) / (1000 * 60))) : 15;

                // Reason resolution
                let reason = 'Wrong Order Entry';
                const notesLower = (s.notes || '').toLowerCase();
                if (notesLower.includes('walkout') || notesLower.includes('left')) reason = 'Customer Walkout';
                else if (notesLower.includes('cold') || notesLower.includes('quality') || notesLower.includes('bad')) reason = 'Food Quality Rejection';
                else if (notesLower.includes('spill') || notesLower.includes('drop') || notesLower.includes('waste')) reason = 'Accidental Spillage';
                else if (notesLower.includes('waiter') || notesLower.includes('wrong')) reason = 'Staff Punch Error';
                else if (notesLower.includes('delay') || notesLower.includes('slow')) reason = 'Kitchen Preparation Delay';

                // Fraud Risk Algorithm:
                // High Risk if voided after 30+ mins or amount > KES 3,000 or cash payment method
                const amt = Number(s.total_amount) || 0;
                let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
                if (amt >= 3500 || elapsedMin >= 35) risk = 'HIGH';
                else if (amt >= 1200 || elapsedMin >= 15) risk = 'MEDIUM';

                return {
                    id: s.sale_id,
                    sale_id: s.sale_id,
                    receipt_no: s.receipt_no || `RCP-#${s.sale_id}`,
                    timestamp: createdTime ? new Date(createdTime).toLocaleString('en-KE') : new Date().toLocaleString('en-KE'),
                    table_name: s.table_name || s.room_name || s.order_type || 'Takeaway',
                    waiter_name: s.waiter_name || s.created_by || 'Server',
                    authorized_by: s.authorized_by || s.cashier_name || 'Floor Manager',
                    items_summary: itemsText,
                    total_amount: amt,
                    status: (s.status || 'Voided') as any,
                    reason: reason,
                    kitchen_sent: elapsedMin > 5, // if >5 min, food was likely cooked
                    fraud_risk: risk,
                    elapsed_minutes: elapsedMin
                };
            });

            setRecords(mappedRecords);
        } catch (err) {
            console.error('Error fetching void records:', err);
            toast.error('Failed to load void audit data');
        } finally {
            setIsLoading(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadVoidRecords();
    }, [loadVoidRecords]);

    // Unique Staff list for filter
    const staffList = useMemo(() => {
        return Array.from(new Set(records.map(r => r.waiter_name))).filter(Boolean);
    }, [records]);

    // Unique Reasons for filter
    const reasonsList = useMemo(() => {
        return Array.from(new Set(records.map(r => r.reason))).filter(Boolean);
    }, [records]);

    // Filtered Records
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (filterRisk !== 'ALL' && r.fraud_risk !== filterRisk) return false;
            if (filterReason !== 'ALL' && r.reason !== filterReason) return false;
            if (filterStaff !== 'ALL' && r.waiter_name !== filterStaff) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchReceipt = r.receipt_no.toLowerCase().includes(q);
                const matchStaff = r.waiter_name.toLowerCase().includes(q);
                const matchItems = r.items_summary.toLowerCase().includes(q);
                const matchTable = r.table_name.toLowerCase().includes(q);
                if (!matchReceipt && !matchStaff && !matchItems && !matchTable) return false;
            }
            return true;
        });
    }, [records, filterRisk, filterReason, filterStaff, searchQuery]);

    // Metrics Calculations
    const totalLostRevenue = filteredRecords.reduce((sum, r) => sum + r.total_amount, 0);
    const highRiskCount = filteredRecords.filter(r => r.fraud_risk === 'HIGH').length;
    const kitchenWasteCount = filteredRecords.filter(r => r.kitchen_sent).length;
    const avgVoidTime = filteredRecords.length > 0
        ? Math.round(filteredRecords.reduce((sum, r) => sum + r.elapsed_minutes, 0) / filteredRecords.length)
        : 0;

    // Export CSV
    const exportCSV = () => {
        if (filteredRecords.length === 0) {
            toast.error('No records to export');
            return;
        }
        const headers = ['Receipt No', 'Date & Time', 'Table/Room', 'Waiter', 'Authorized By', 'Items Voided', 'Lost Amount (KES)', 'Kitchen Prepared', 'Reason', 'Risk Level'];
        const rows = filteredRecords.map(r => [
            `"${r.receipt_no}"`,
            `"${r.timestamp}"`,
            `"${r.table_name}"`,
            `"${r.waiter_name}"`,
            `"${r.authorized_by}"`,
            `"${r.items_summary.replace(/"/g, '""')}"`,
            r.total_amount.toFixed(2),
            r.kitchen_sent ? 'YES' : 'NO',
            `"${r.reason}"`,
            r.fraud_risk
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Void_Audit_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported Void Audit CSV successfully!');
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-white p-3 sm:p-5 -m-4 sm:-m-6 space-y-4 select-none font-sans relative overflow-x-hidden">
            <Toaster position="top-right" />

            {/* ==================================================================== */}
            {/* 1. CYBER EMERALD TOP COMMAND BAR                                     */}
            {/* ==================================================================== */}
            <header className="relative bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/50 flex items-center justify-center text-rose-400 text-2xl shadow-[0_0_15px_rgba(244,63,94,0.3)] shrink-0 font-black">
                        🛡️
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>AlphaPlus</span>
                                <span className="text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.8)]">Void &amp; Discrepancy Audit</span>
                            </h1>
                            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/40 backdrop-blur-md flex items-center gap-1.5 shadow-[0_0_12px_rgba(244,63,94,0.25)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e] animate-pulse" />
                                Loss &amp; Theft Watchdog
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2.5 font-mono flex-wrap">
                            <span className="text-[#00e676] font-black bg-[#0c161e] px-2.5 py-0.5 rounded-lg border border-[#00e676]/30 shadow-inner">
                                {liveTime.toLocaleTimeString('en-GB')} EAT
                            </span>
                            <span>•</span>
                            <span className="text-white font-bold">{filteredRecords.length} Flagged Incidents</span>
                            <span>•</span>
                            <span className="text-gray-300">Preventing unauthorized cashier &amp; waiter voids</span>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={exportCSV}
                        className="px-3.5 py-2 bg-[#0c161e] hover:bg-[#132230] text-gray-200 hover:text-white border border-[#162a2e] hover:border-[#00e676]/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        📥 Export CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3.5 py-2 bg-[#0c161e] hover:bg-[#132230] text-gray-200 hover:text-white border border-[#162a2e] hover:border-[#00e676]/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        🖨️ Print Audit
                    </button>
                    <Link
                        href="/dashboard/reports"
                        className="px-4 py-2 bg-[#00e676] hover:bg-[#00c853] text-black font-black rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(0,230,118,0.3)] flex items-center gap-1.5"
                    >
                        Master Reports →
                    </Link>
                </div>
            </header>

            {/* ==================================================================== */}
            {/* 2. SUPER PREMIUM KPI SUMMARY CARDS                                   */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-rose-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>💸 Total Lost Revenue</span>
                        <span className="text-base text-rose-400">🛑</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-rose-400 font-mono">
                            KES {totalLostRevenue.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Voided &amp; Cancelled value</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-amber-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>🚨 High Risk Incidents</span>
                        <span className="text-base text-amber-400">⚠️</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                            {highRiskCount}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Late voids (&gt;30m) or high value</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-[#00e676]/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>🍲 Kitchen Waste Created</span>
                        <span className="text-base text-[#00e676]">👨‍🍳</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-white font-mono">
                            {kitchenWasteCount}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Items already sent to KDS</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-cyan-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>⏱️ Avg Time to Void</span>
                        <span className="text-base text-cyan-400">⏳</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">
                            {avgVoidTime} Mins
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Delay before cancellation</p>
                    </div>
                </div>
            </div>

            {/* Neon Cyber Accent Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-rose-500 via-[#00e676] to-transparent shadow-[0_0_10px_rgba(244,63,94,0.6)] rounded-full" />

            {/* ==================================================================== */}
            {/* 3. FILTER STRIP (CYBER OBSIDIAN CONTROLS)                            */}
            {/* ==================================================================== */}
            <div className="bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    {/* Live Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search receipt #, waiter, table, dish..."
                            className="w-full p-2.5 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00e676]"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Fraud Risk Filter */}
                    <div className="flex items-center gap-1 bg-[#0c161e] p-1 rounded-xl border border-[#162a2e]">
                        {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(risk => (
                            <button
                                key={risk}
                                onClick={() => setFilterRisk(risk)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                    filterRisk === risk
                                        ? risk === 'HIGH' ? 'bg-rose-500 text-black shadow-sm' :
                                          risk === 'MEDIUM' ? 'bg-amber-400 text-black shadow-sm' :
                                          risk === 'LOW' ? 'bg-[#00e676] text-black shadow-sm' :
                                          'bg-white text-black shadow-sm'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {risk}
                            </button>
                        ))}
                    </div>

                    {/* Reason Filter */}
                    <select
                        value={filterReason}
                        onChange={(e) => setFilterReason(e.target.value)}
                        className="p-2 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-gray-300 focus:outline-none focus:border-[#00e676]"
                    >
                        <option value="ALL">All Reasons</option>
                        {reasonsList.map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>

                    {/* Staff Filter */}
                    <select
                        value={filterStaff}
                        onChange={(e) => setFilterStaff(e.target.value)}
                        className="p-2 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-gray-300 focus:outline-none focus:border-[#00e676]"
                    >
                        <option value="ALL">All Staff</option>
                        {staffList.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                {/* Date Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="p-2 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#00e676]"
                    />
                    <span className="text-gray-500 text-xs">to</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="p-2 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#00e676]"
                    />
                    <button
                        onClick={loadVoidRecords}
                        className="px-3 py-2 bg-[#0c161e] hover:bg-[#132230] text-[#00e676] border border-[#162a2e] rounded-xl text-xs font-bold"
                    >
                        Filter
                    </button>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 4. AUDIT DATAGRID (CARD BASED CYBER EMERALD DESIGN)                  */}
            {/* ==================================================================== */}
            <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl overflow-hidden shadow-2xl">
                {isLoading ? (
                    <div className="p-16 text-center text-gray-400 space-y-3">
                        <div className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-mono">Auditing sales ledger for voids &amp; discrepancies...</p>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 space-y-2">
                        <span className="text-4xl block">🛡️</span>
                        <h3 className="text-base font-bold text-white">No Suspicious Voids Found</h3>
                        <p className="text-xs text-gray-500">All orders in this date range were finalized or no discrepancy logged.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#080e14] border-b border-[#162a2e] text-[11px] font-black uppercase text-gray-400 tracking-wider">
                                    <th className="p-3.5">Slip # / Time</th>
                                    <th className="p-3.5">Table / Room</th>
                                    <th className="p-3.5">Staff &amp; Authorizer</th>
                                    <th className="p-3.5">Items Voided</th>
                                    <th className="p-3.5">Lost Revenue</th>
                                    <th className="p-3.5">Kitchen Prep</th>
                                    <th className="p-3.5">Reason Code</th>
                                    <th className="p-3.5 text-right">Fraud Risk</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-mono">
                                {filteredRecords.map(record => (
                                    <tr
                                        key={record.id}
                                        className="hover:bg-[#101c26] transition-colors group"
                                    >
                                        {/* Slip & Time */}
                                        <td className="p-3.5">
                                            <p className="font-bold text-white flex items-center gap-1.5">
                                                <span className="text-rose-400">✕</span>
                                                <span>{record.receipt_no}</span>
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{record.timestamp}</p>
                                            <p className="text-[10px] text-gray-500 font-sans">Elapsed: {record.elapsed_minutes}m</p>
                                        </td>

                                        {/* Table / Location */}
                                        <td className="p-3.5">
                                            <span className="bg-[#080e14] text-gray-200 border border-white/5 px-2 py-0.5 rounded text-[11px] font-sans font-bold">
                                                {record.table_name}
                                            </span>
                                        </td>

                                        {/* Staff */}
                                        <td className="p-3.5 font-sans">
                                            <p className="text-white font-bold">{record.waiter_name}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Auth: {record.authorized_by}</p>
                                        </td>

                                        {/* Items */}
                                        <td className="p-3.5 max-w-xs font-sans">
                                            <p className="text-gray-200 line-clamp-2 leading-relaxed text-[11px]">
                                                {record.items_summary}
                                            </p>
                                        </td>

                                        {/* Lost Revenue */}
                                        <td className="p-3.5">
                                            <span className="text-sm font-black text-rose-400 font-mono">
                                                KES {record.total_amount.toLocaleString()}
                                            </span>
                                        </td>

                                        {/* Kitchen Prep */}
                                        <td className="p-3.5 font-sans">
                                            {record.kitchen_sent ? (
                                                <span className="bg-rose-950/80 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded text-[10px] font-bold">
                                                    Cooked (Waste)
                                                </span>
                                            ) : (
                                                <span className="bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/40 px-2 py-0.5 rounded text-[10px] font-bold">
                                                    Pre-Cook Void
                                                </span>
                                            )}
                                        </td>

                                        {/* Reason */}
                                        <td className="p-3.5 font-sans">
                                            <span className="bg-[#080e14] text-gray-300 border border-[#162a2e] px-2 py-0.5 rounded text-[10px] font-semibold">
                                                {record.reason}
                                            </span>
                                        </td>

                                        {/* Risk Badge */}
                                        <td className="p-3.5 text-right font-sans">
                                            {record.fraud_risk === 'HIGH' ? (
                                                <span className="inline-flex items-center gap-1 bg-rose-500 text-black font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md shadow-rose-500/30">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                                                    HIGH RISK
                                                </span>
                                            ) : record.fraud_risk === 'MEDIUM' ? (
                                                <span className="inline-flex items-center gap-1 bg-amber-400 text-black font-black text-[10px] px-2.5 py-0.5 rounded-full">
                                                    MEDIUM
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                    NORMAL
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}
