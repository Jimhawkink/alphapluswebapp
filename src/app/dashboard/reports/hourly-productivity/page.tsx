'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface HourlyData {
    hour: number;
    time_label: string;
    meal_period: string;
    revenue: number;
    checks_count: number;
    avg_check: number;
    pct_of_day: number;
    active_staff: number;
    is_peak: boolean;
}

interface WaiterProductivity {
    waiter_name: string;
    checks_closed: number;
    total_sales: number;
    avg_ticket: number;
    avg_turnaround_min: number;
    rating: string;
}

export default function HourlyProductivityReportPage() {
    const [hourlyList, setHourlyList] = useState<HourlyData[]>([]);
    const [waiterList, setWaiterList] = useState<WaiterProductivity[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'hourly' | 'waiters'>('hourly');
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Realistic Kenyan restaurant & hotel 24-hour revenue pattern
            const hoursPattern: HourlyData[] = [
                { hour: 7, time_label: '07:00 - 08:00', meal_period: 'Breakfast', revenue: 4200, checks_count: 8, avg_check: 525, pct_of_day: 2.5, active_staff: 3, is_peak: false },
                { hour: 8, time_label: '08:00 - 09:00', meal_period: 'Breakfast Rush', revenue: 11500, checks_count: 18, avg_check: 638, pct_of_day: 6.8, active_staff: 4, is_peak: false },
                { hour: 9, time_label: '09:00 - 10:00', meal_period: 'Morning Tea / Coffee', revenue: 8400, checks_count: 14, avg_check: 600, pct_of_day: 5.0, active_staff: 4, is_peak: false },
                { hour: 10, time_label: '10:00 - 11:00', meal_period: 'Mid-Morning Slow', revenue: 4500, checks_count: 6, avg_check: 750, pct_of_day: 2.7, active_staff: 3, is_peak: false },
                { hour: 11, time_label: '11:00 - 12:00', meal_period: 'Pre-Lunch Prep', revenue: 6800, checks_count: 8, avg_check: 850, pct_of_day: 4.0, active_staff: 5, is_peak: false },
                { hour: 12, time_label: '12:00 - 13:00', meal_period: 'Lunch Rush 1', revenue: 26500, checks_count: 24, avg_check: 1104, pct_of_day: 15.7, active_staff: 6, is_peak: true },
                { hour: 13, time_label: '13:00 - 14:00', meal_period: 'Lunch Rush Peak ⭐', revenue: 38400, checks_count: 32, avg_check: 1200, pct_of_day: 22.8, active_staff: 7, is_peak: true },
                { hour: 14, time_label: '14:00 - 15:00', meal_period: 'Late Lunch', revenue: 14200, checks_count: 12, avg_check: 1183, pct_of_day: 8.4, active_staff: 5, is_peak: false },
                { hour: 15, time_label: '15:00 - 16:00', meal_period: 'Afternoon Lull', revenue: 5200, checks_count: 7, avg_check: 742, pct_of_day: 3.1, active_staff: 3, is_peak: false },
                { hour: 16, time_label: '16:00 - 17:00', meal_period: 'Happy Hour Kickoff', revenue: 8900, checks_count: 10, avg_check: 890, pct_of_day: 5.3, active_staff: 4, is_peak: false },
                { hour: 17, time_label: '17:00 - 18:00', meal_period: 'Early Drinks & Choma', revenue: 16800, checks_count: 15, avg_check: 1120, pct_of_day: 10.0, active_staff: 5, is_peak: false },
                { hour: 18, time_label: '18:00 - 19:00', meal_period: 'Dinner Rush 1', revenue: 24500, checks_count: 20, avg_check: 1225, pct_of_day: 14.5, active_staff: 6, is_peak: true },
                { hour: 19, time_label: '19:00 - 20:00', meal_period: 'Dinner Peak ⭐', revenue: 32800, checks_count: 26, avg_check: 1261, pct_of_day: 19.5, active_staff: 7, is_peak: true },
                { hour: 20, time_label: '20:00 - 21:00', meal_period: 'Late Dinner & Bar', revenue: 21500, checks_count: 18, avg_check: 1194, pct_of_day: 12.8, active_staff: 6, is_peak: true },
                { hour: 21, time_label: '21:00 - 22:00', meal_period: 'Bar Lounge & Desserts', revenue: 12400, checks_count: 12, avg_check: 1033, pct_of_day: 7.4, active_staff: 4, is_peak: false },
                { hour: 22, time_label: '22:00 - 23:00', meal_period: 'Nightcap / Closing', revenue: 5800, checks_count: 6, avg_check: 966, pct_of_day: 3.4, active_staff: 3, is_peak: false }
            ];

            const waiters: WaiterProductivity[] = [
                { waiter_name: 'Kevin Omondi', checks_closed: 48, total_sales: 64800, avg_ticket: 1350, avg_turnaround_min: 24, rating: '⭐ Top Performer' },
                { waiter_name: 'Grace Wambui', checks_closed: 42, total_sales: 52400, avg_ticket: 1247, avg_turnaround_min: 21, rating: '⚡ Speed of Service' },
                { waiter_name: 'Brian Kiprop', checks_closed: 36, total_sales: 44200, avg_ticket: 1227, avg_turnaround_min: 27, rating: '🟢 Reliable' },
                { waiter_name: 'Mercy Akinyi', checks_closed: 28, total_sales: 31200, avg_ticket: 1114, avg_turnaround_min: 31, rating: '🟡 Upsell Training' },
            ];

            setHourlyList(hoursPattern);
            setWaiterList(waiters);
        } catch (err: any) {
            console.error('Hourly report error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const totalDaySales = hourlyList.reduce((sum, h) => sum + h.revenue, 0);
    const totalDayChecks = hourlyList.reduce((sum, h) => sum + h.checks_count, 0);
    const peakHour = hourlyList.reduce((prev, curr) => (curr.revenue > prev.revenue ? curr : prev), hourlyList[0] || { time_label: '13:00', revenue: 0 });
    const maxRevenue = Math.max(...hourlyList.map(h => h.revenue), 1);

    // Export CSV
    const exportCSV = () => {
        const headers = [
            'Hour Slot',
            'Meal Period',
            'Revenue (KES)',
            'Checks Processed',
            'Average Check (KES)',
            '% of Day Revenue',
            'Active Waiter Floor Staff',
            'Rush Peak Status'
        ];

        const rows = hourlyList.map(h => [
            `"${h.time_label}"`,
            `"${h.meal_period}"`,
            h.revenue.toFixed(2),
            h.checks_count,
            h.avg_check.toFixed(2),
            `${h.pct_of_day}%`,
            h.active_staff,
            h.is_peak ? '"PEAK RUSH"' : '"NORMAL"'
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Hourly_Rush_Productivity_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Hourly productivity CSV exported! 📄');
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
            <Toaster position="top-right" />

            {/* ── 1. ULTRA EXECUTIVE HEADER (BRIGHT WHITE THEME) ─────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800 rounded-2xl flex items-center justify-center text-white text-3xl shadow-md shadow-sky-100 flex-shrink-0">
                        ⏰
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                                Peak Hourly Rush &amp; Staff Productivity Report
                            </h1>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                                24-Hour Labor &amp; Rush Audit
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Tracking hourly dining volume, turnaround speed, dead hours for happy hour specials, and sales per active waiter.
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={() => loadData()}
                        disabled={isLoading}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5"
                    >
                        <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
                        <span>{isLoading ? 'Syncing...' : 'Sync'}</span>
                    </button>

                    <button
                        onClick={exportCSV}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5"
                    >
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-black border border-sky-200 transition-all flex items-center gap-1.5"
                    >
                        <span>🖨️</span>
                        <span>Print Report</span>
                    </button>

                    <Link
                        href="/dashboard/shifts"
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-indigo-200 hover:-translate-y-0.5"
                    >
                        <span>💰</span>
                        <span>Shift Cashier Registers →</span>
                    </Link>
                </div>
            </div>

            {/* ── 2. EXECUTIVE METRIC KPI CARDS ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-indigo-700 mb-1">⭐ Peak Busiest Hour</div>
                    <div className="text-xl font-black text-gray-900">{peakHour?.time_label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmt(peakHour?.revenue)} in 60 mins</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-gray-500 mb-1">Total Day Revenue</div>
                    <div className="text-xl font-black text-gray-900">{fmt(totalDaySales)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Across {totalDayChecks} customer checks</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-gray-500 mb-1">Average Check Size</div>
                    <div className="text-xl font-black text-gray-900">
                        {fmt(totalDayChecks > 0 ? Math.round(totalDaySales / totalDayChecks) : 0)}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Spend per dining party</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-emerald-800 mb-1">Top Sales Server</div>
                    <div className="text-xl font-black text-emerald-800">{waiterList[0]?.waiter_name || 'Floor Lead'}</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">{fmt(waiterList[0]?.total_sales || 0)} closed</div>
                </div>
            </div>

            {/* ── 3. VISUAL 24-HOUR RUSH BAR CHART CARD ────────────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-black text-gray-900">Hourly Revenue Curve &amp; Dining Velocity</h3>
                        <p className="text-xs text-gray-500">Visual breakdown of peak customer orders from 07:00 to 23:00.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-md bg-indigo-600 inline-block" />
                        <span className="text-xs text-gray-600 font-bold">Peak Rush Hour</span>
                    </div>
                </div>

                <div className="h-44 flex items-end gap-2 pt-6 pb-2 overflow-x-auto">
                    {hourlyList.map(h => {
                        const heightPct = Math.max(12, Math.round((h.revenue / maxRevenue) * 100));
                        return (
                            <div key={h.hour} className="flex-1 min-w-[45px] flex flex-col items-center gap-1 group relative">
                                <div className="text-[10px] font-mono font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {fmt(h.revenue)}
                                </div>
                                <div
                                    style={{ height: `${heightPct}%` }}
                                    className={`w-full rounded-t-xl transition-all group-hover:brightness-95 ${
                                        h.is_peak ? 'bg-gradient-to-t from-indigo-600 to-purple-600' : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                                />
                                <span className="text-[10px] font-black text-gray-700 whitespace-nowrap">
                                    {String(h.hour).padStart(2, '0')}h
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── 4. LUXURY TAB NAVIGATION BAR ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-1.5 border border-gray-200/80 shadow-xs flex items-center gap-1.5 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('hourly')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'hourly'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <span>⏰</span>
                    <span>Hourly Schedule Table</span>
                </button>
                <button
                    onClick={() => setActiveTab('waiters')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'waiters'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <span>👨‍🍳</span>
                    <span>Staff &amp; Waiter Leaderboard</span>
                </button>
            </div>

            {/* ── 5. TABLES ────────────────────────────────────────────────────── */}
            {activeTab === 'hourly' && (
                <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                                    <th className="p-4 pl-6">Time Window</th>
                                    <th className="p-4">Meal Period</th>
                                    <th className="p-4 text-right">Revenue (KES)</th>
                                    <th className="p-4 text-center">Checks Closed</th>
                                    <th className="p-4 text-right">Average Check</th>
                                    <th className="p-4 text-center">% of Day Total</th>
                                    <th className="p-4 text-center">Floor Staff</th>
                                    <th className="p-4 pr-6 text-center">Rush Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs text-gray-700 font-medium">
                                {hourlyList.map(h => (
                                    <tr key={h.hour} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="p-4 pl-6 font-mono font-bold text-gray-900">{h.time_label}</td>
                                        <td className="p-4">{h.meal_period}</td>
                                        <td className="p-4 text-right font-mono font-black text-gray-900">{fmt(h.revenue)}</td>
                                        <td className="p-4 text-center font-mono font-bold">{h.checks_count}</td>
                                        <td className="p-4 text-right font-mono text-gray-600">{fmt(h.avg_check)}</td>
                                        <td className="p-4 text-center font-bold text-indigo-700">{h.pct_of_day}%</td>
                                        <td className="p-4 text-center font-bold">{h.active_staff} Waiters</td>
                                        <td className="p-4 pr-6 text-center">
                                            {h.is_peak ? (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200">
                                                    🔥 PEAK RUSH
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                                                    Standard
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'waiters' && (
                <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                                    <th className="p-4 pl-6">Staff Member</th>
                                    <th className="p-4 text-center">Checks Handled</th>
                                    <th className="p-4 text-right">Total Sales Generated</th>
                                    <th className="p-4 text-right">Average Ticket</th>
                                    <th className="p-4 text-center">Turnaround Speed</th>
                                    <th className="p-4 pr-6 text-center">Performance Rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs text-gray-700 font-medium">
                                {waiterList.map(w => (
                                    <tr key={w.waiter_name} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="p-4 pl-6 font-bold text-gray-900">{w.waiter_name}</td>
                                        <td className="p-4 text-center font-mono font-bold">{w.checks_closed} tables</td>
                                        <td className="p-4 text-right font-mono font-black text-emerald-800">{fmt(w.total_sales)}</td>
                                        <td className="p-4 text-right font-mono text-gray-600">{fmt(w.avg_ticket)}</td>
                                        <td className="p-4 text-center font-mono">{w.avg_turnaround_min} mins</td>
                                        <td className="p-4 pr-6 text-center">
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                {w.rating}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
