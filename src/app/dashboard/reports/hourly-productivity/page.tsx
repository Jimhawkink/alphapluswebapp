'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface HourlyMetric {
    hour: number;
    hour_label: string;
    revenue: number;
    checks_count: number;
    avg_check: number;
    active_staff_count: number;
    revenue_per_staff: number;
    rush_type: 'PEAK_RUSH' | 'STEADY' | 'SLOW' | 'DEAD_HOUR';
}

export default function HourlyProductivityReportPage() {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [hourlyData, setHourlyData] = useState<HourlyMetric[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Live clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Load Hourly Sales
    const loadHourlyMetrics = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data: salesData, error } = await supabase
                .from('sales')
                .select('*')
                .gte('sale_date', selectedDate)
                .lte('sale_date', selectedDate)
                .neq('status', 'Void')
                .neq('status', 'Voided')
                .neq('status', 'Cancelled');

            if (error) throw error;

            const sales = salesData || [];

            // Initialize 24-hour slots (0 to 23)
            const hoursMap: Record<number, { revenue: number; checks: number; staffSet: Set<string> }> = {};
            for (let h = 0; h < 24; h++) {
                hoursMap[h] = { revenue: 0, checks: 0, staffSet: new Set() };
            }

            // Tally sales by hour
            sales.forEach(s => {
                let hourNum = 12; // default
                if (s.sale_time) {
                    const parts = s.sale_time.split(':');
                    if (parts.length > 0) hourNum = parseInt(parts[0], 10);
                } else if (s.sale_datetime || s.created_at) {
                    const dt = new Date(s.sale_datetime || s.created_at);
                    hourNum = dt.getHours();
                }

                if (hourNum >= 0 && hourNum <= 23) {
                    const amt = Number(s.total_amount) || 0;
                    hoursMap[hourNum].revenue += amt;
                    hoursMap[hourNum].checks += 1;
                    if (s.waiter_name) hoursMap[hourNum].staffSet.add(s.waiter_name);
                    if (s.created_by) hoursMap[hourNum].staffSet.add(s.created_by);
                }
            });

            // Calculate peak averages
            const allRevs = Object.values(hoursMap).map(v => v.revenue);
            const maxRev = Math.max(...allRevs, 1);
            const totalDayRev = allRevs.reduce((a, b) => a + b, 0);
            const avgHourRev = totalDayRev / 24;

            const result: HourlyMetric[] = [];
            for (let h = 0; h < 24; h++) {
                const info = hoursMap[h];
                const rev = info.revenue;
                const checks = info.checks;
                const avgChk = checks > 0 ? Math.round(rev / checks) : 0;
                const staffCount = Math.max(1, info.staffSet.size || (checks > 0 ? 2 : 1));
                const revPerStaff = Math.round(rev / staffCount);

                let rush: 'PEAK_RUSH' | 'STEADY' | 'SLOW' | 'DEAD_HOUR' = 'DEAD_HOUR';
                if (rev >= avgHourRev * 1.8 && rev > 0) rush = 'PEAK_RUSH';
                else if (rev >= avgHourRev * 0.9 && rev > 0) rush = 'STEADY';
                else if (rev > 0) rush = 'SLOW';

                const startH = String(h).padStart(2, '0') + ':00';
                const endH = String(h === 23 ? 0 : h + 1).padStart(2, '0') + ':00';

                result.push({
                    hour: h,
                    hour_label: `${startH} - ${endH}`,
                    revenue: rev,
                    checks_count: checks,
                    avg_check: avgChk,
                    active_staff_count: checks > 0 ? staffCount : 0,
                    revenue_per_staff: checks > 0 ? revPerStaff : 0,
                    rush_type: rush
                });
            }

            setHourlyData(result);

        } catch (err) {
            console.error('Error fetching hourly productivity:', err);
            toast.error('Failed to load hourly sales distribution');
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadHourlyMetrics();
    }, [loadHourlyMetrics]);

    // Summary Calculations
    const totalDaySales = hourlyData.reduce((sum, h) => sum + h.revenue, 0);
    const totalChecks = hourlyData.reduce((sum, h) => sum + h.checks_count, 0);

    const peakHour = useMemo(() => {
        if (hourlyData.length === 0) return null;
        return [...hourlyData].sort((a, b) => b.revenue - a.revenue)[0];
    }, [hourlyData]);

    const maxHourRevenue = peakHour?.revenue || 1;

    // Export CSV
    const exportCSV = () => {
        const headers = ['Hour Window', 'Revenue (KES)', 'Checks Count', 'Average Check (KES)', 'Active Staff', 'Revenue per Staff (KES)', 'Status'];
        const rows = hourlyData.map(h => [
            `"${h.hour_label}"`,
            h.revenue.toFixed(2),
            h.checks_count.toString(),
            h.avg_check.toFixed(2),
            h.active_staff_count.toString(),
            h.revenue_per_staff.toFixed(2),
            h.rush_type
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Hourly_Productivity_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported Hourly Productivity CSV successfully!');
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-white p-3 sm:p-5 -m-4 sm:-m-6 space-y-4 select-none font-sans relative overflow-x-hidden">
            <Toaster position="top-right" />

            {/* ==================================================================== */}
            {/* 1. TOP COMMAND BAR                                                   */}
            {/* ==================================================================== */}
            <header className="relative bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-[#00e676]/15 border border-[#00e676]/50 flex items-center justify-center text-[#00e676] text-2xl shadow-[0_0_15px_rgba(0,230,118,0.3)] shrink-0 font-black">
                        ⏰
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>AlphaPlus</span>
                                <span className="text-[#00e676] drop-shadow-[0_0_20px_rgba(0,230,118,0.8)]">Hourly Peak &amp; Productivity</span>
                            </h1>
                            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-[#00e676] border border-[#00e676]/40 backdrop-blur-md flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,230,118,0.25)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] shadow-[0_0_6px_#00e676] animate-pulse" />
                                Rush Hour &amp; Staff Productivity Analysis
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2.5 font-mono flex-wrap">
                            <span className="text-[#00e676] font-black bg-[#0c161e] px-2.5 py-0.5 rounded-lg border border-[#00e676]/30 shadow-inner">
                                {liveTime.toLocaleTimeString('en-GB')} EAT
                            </span>
                            <span>•</span>
                            <span className="text-white font-bold">{totalChecks} Total Checks</span>
                            <span>•</span>
                            <span className="text-gray-300">Revenue: KES {totalDaySales.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="p-2 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#00e676]"
                    />
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
                        🖨️ Print
                    </button>
                </div>
            </header>

            {/* ==================================================================== */}
            {/* 2. HUD CARDS                                                         */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-[#00e676]/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>🔥 Peak Rush Window</span>
                        <span className="text-base text-[#00e676]">👑</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-[#00e676] font-mono">
                            {peakHour ? peakHour.hour_label : '13:00 - 14:00'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                            KES {peakHour?.revenue.toLocaleString()} ({peakHour?.checks_count} checks)
                        </p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-cyan-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>💵 Avg Check per Hour</span>
                        <span className="text-base text-cyan-400">📊</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">
                            KES {totalChecks > 0 ? Math.round(totalDaySales / totalChecks).toLocaleString() : 0}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Average ticket size</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-amber-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>⚡ Staff Productivity</span>
                        <span className="text-base text-amber-400">👨‍🍳</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                            KES {peakHour?.revenue_per_staff.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Peak revenue per staff hour</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-purple-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>💤 Happy Hour Window</span>
                        <span className="text-base text-purple-400">🍹</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-purple-400 font-mono">
                            15:00 - 17:00
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Ideal for beverage discounts</p>
                    </div>
                </div>
            </div>

            {/* Neon Accent Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-[#00e676] via-cyan-400 to-transparent shadow-[0_0_10px_#00e676] rounded-full" />

            {/* ==================================================================== */}
            {/* 3. HOURLY DISTRIBUTION BARS & DATAGRID                               */}
            {/* ==================================================================== */}
            <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between pb-2 border-b border-[#162a2e]">
                    <h3 className="text-xs font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5">
                        <span>📊</span> 24-Hour Sales Intensity Breakdown
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">Day: {selectedDate}</span>
                </div>

                {isLoading ? (
                    <div className="p-16 text-center text-gray-400 space-y-3">
                        <div className="w-10 h-10 border-2 border-[#00e676] border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-mono">Compiling hourly sales transactions...</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {hourlyData
                            .filter(h => h.revenue > 0 || (h.hour >= 6 && h.hour <= 23))
                            .map(item => {
                                const barPercent = maxHourRevenue > 0 ? Math.round((item.revenue / maxHourRevenue) * 100) : 0;

                                return (
                                    <div
                                        key={item.hour}
                                        className="p-3 bg-[#080e14] border border-[#162a2e] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#00e676]/40 transition-all font-mono"
                                    >
                                        <div className="flex items-center gap-3 w-44 shrink-0">
                                            <span className="text-xs font-bold text-white">{item.hour_label}</span>
                                            {item.rush_type === 'PEAK_RUSH' ? (
                                                <span className="text-[9px] bg-rose-500 text-black font-black px-1.5 py-0.5 rounded">RUSH 🔥</span>
                                            ) : item.rush_type === 'STEADY' ? (
                                                <span className="text-[9px] bg-[#00e676] text-black font-black px-1.5 py-0.5 rounded">ACTIVE</span>
                                            ) : item.revenue > 0 ? (
                                                <span className="text-[9px] bg-amber-400 text-black font-black px-1.5 py-0.5 rounded">LIGHT</span>
                                            ) : (
                                                <span className="text-[9px] text-gray-500">QUIET</span>
                                            )}
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="flex-1 min-w-0 flex items-center gap-3">
                                            <div className="w-full bg-[#05090d] h-3 rounded-full overflow-hidden border border-white/5">
                                                <div
                                                    style={{ width: `${barPercent}%` }}
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        item.rush_type === 'PEAK_RUSH'
                                                            ? 'bg-gradient-to-r from-amber-400 to-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                                                            : 'bg-gradient-to-r from-teal-500 to-[#00e676]'
                                                    }`}
                                                />
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="flex items-center gap-4 text-xs shrink-0 justify-end">
                                            <div className="text-right">
                                                <p className="font-black text-white">KES {item.revenue.toLocaleString()}</p>
                                                <p className="text-[10px] text-gray-400">{item.checks_count} orders · Avg KES {item.avg_check.toLocaleString()}</p>
                                            </div>
                                            {item.active_staff_count > 0 && (
                                                <div className="text-right text-[11px] text-gray-300 font-sans border-l border-white/10 pl-3">
                                                    <p className="text-[#00e676] font-bold font-mono">KES {item.revenue_per_staff.toLocaleString()}</p>
                                                    <p className="text-[10px] text-gray-400">/ staff hr</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

        </div>
    );
}
