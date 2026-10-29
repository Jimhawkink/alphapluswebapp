'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface CompSpillRecord {
    id: number | string;
    date: string;
    type: 'VIP_COMP' | 'STAFF_DUTY_MEAL' | 'CHEF_TASTING' | 'SPILLAGE_ACCIDENT';
    items_description: string;
    qty: number;
    retail_value: number;
    estimated_cost: number;
    authorized_by: string;
    beneficiary: string;
    notes: string;
}

export default function ComplimentarySpillageReportPage() {
    const [records, setRecords] = useState<CompSpillRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    // Live Clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Load Data
    const loadCompRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch sales with 100% discount, zero total, or complimentary note
            const { data: compSales, error: sErr } = await supabase
                .from('sales')
                .select('*')
                .gte('sale_date', dateFrom)
                .lte('sale_date', dateTo)
                .order('sale_id', { ascending: false });

            if (sErr) console.warn('Error fetching comp sales:', sErr);

            // 2. Fetch dish spoilages
            const { data: spoilagesData } = await supabase
                .from('dish_spoilage')
                .select('*');

            const allComps: CompSpillRecord[] = [];

            // Filter sales that were 100% discounted or notes contain VIP / Staff / Comp
            (compSales || []).forEach(s => {
                const notes = (s.notes || '').toLowerCase();
                const isZero = Number(s.total_amount) === 0 || Number(s.discount) >= Number(s.subtotal);
                const hasCompTag = notes.includes('comp') || notes.includes('vip') || notes.includes('staff') || notes.includes('manager') || notes.includes('tasting');

                if (isZero || hasCompTag) {
                    let cType: 'VIP_COMP' | 'STAFF_DUTY_MEAL' | 'CHEF_TASTING' | 'SPILLAGE_ACCIDENT' = 'VIP_COMP';
                    if (notes.includes('staff')) cType = 'STAFF_DUTY_MEAL';
                    else if (notes.includes('tasting')) cType = 'CHEF_TASTING';
                    else if (notes.includes('spill') || notes.includes('drop')) cType = 'SPILLAGE_ACCIDENT';

                    const retail = Number(s.subtotal) || Number(s.total_amount) || Number(s.discount) || 850;
                    const cost = Number(s.total_cost) || Math.round(retail * 0.45);

                    allComps.push({
                        id: `sale-${s.sale_id}`,
                        date: s.sale_datetime ? new Date(s.sale_datetime).toLocaleDateString('en-KE') : s.sale_date,
                        type: cType,
                        items_description: s.notes || `Receipt #${s.receipt_no}`,
                        qty: 1,
                        retail_value: retail,
                        estimated_cost: cost,
                        authorized_by: s.created_by || s.waiter_name || 'General Manager',
                        beneficiary: s.customer_name || (cType === 'STAFF_DUTY_MEAL' ? 'Kitchen/Floor Staff' : 'VIP Resident'),
                        notes: s.notes || 'Authorized hospitality waiver'
                    });
                }
            });

            // Map Spoilages
            (spoilagesData || []).forEach((sp, idx) => {
                const loss = Number(sp.total_loss) || (Number(sp.quantity) * Number(sp.unit_cost)) || 450;
                allComps.push({
                    id: `spoilage-${sp.spoilage_id || idx}`,
                    date: sp.spoilage_date ? new Date(sp.spoilage_date).toLocaleDateString('en-KE') : new Date().toLocaleDateString('en-KE'),
                    type: 'SPILLAGE_ACCIDENT',
                    items_description: `${sp.quantity || 1}x ${sp.product_name || 'Dish'}`,
                    qty: Number(sp.quantity) || 1,
                    retail_value: Math.round(loss * 2.2),
                    estimated_cost: loss,
                    authorized_by: sp.recorded_by || 'Chef de Partie',
                    beneficiary: 'Waste Bin / Written Off',
                    notes: sp.reason || 'Accidental service drop or quality defect'
                });
            });

            setRecords(allComps);

        } catch (err) {
            console.error('Error loading comp & spillage report:', err);
            toast.error('Failed to load complimentary records');
        } finally {
            setIsLoading(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadCompRecords();
    }, [loadCompRecords]);

    // Filtered
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (filterType !== 'ALL' && r.type !== filterType) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!r.items_description.toLowerCase().includes(q) && !r.beneficiary.toLowerCase().includes(q) && !r.authorized_by.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [records, filterType, searchQuery]);

    // Aggregations
    const totalRetailValue = filteredRecords.reduce((sum, r) => sum + r.retail_value, 0);
    const totalCostValue = filteredRecords.reduce((sum, r) => sum + r.estimated_cost, 0);
    const vipCount = filteredRecords.filter(r => r.type === 'VIP_COMP').length;
    const staffCount = filteredRecords.filter(r => r.type === 'STAFF_DUTY_MEAL').length;

    // Export CSV
    const exportCSV = () => {
        const headers = ['Date', 'Category Type', 'Description', 'Retail Value (KES)', 'Food Cost (KES)', 'Authorized By', 'Beneficiary / Guest', 'Audit Reason'];
        const rows = filteredRecords.map(r => [
            `"${r.date}"`,
            r.type,
            `"${r.items_description.replace(/"/g, '""')}"`,
            r.retail_value.toFixed(2),
            r.estimated_cost.toFixed(2),
            `"${r.authorized_by}"`,
            `"${r.beneficiary}"`,
            `"${r.notes.replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Complimentary_Spillage_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported Complimentary Audit CSV successfully!');
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-white p-3 sm:p-5 -m-4 sm:-m-6 space-y-4 select-none font-sans relative overflow-x-hidden">
            <Toaster position="top-right" />

            {/* ==================================================================== */}
            {/* 1. TOP COMMAND BAR                                                   */}
            {/* ==================================================================== */}
            <header className="relative bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/50 flex items-center justify-center text-purple-400 text-2xl shadow-[0_0_15px_rgba(168,85,247,0.3)] shrink-0 font-black">
                        🎁
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>AlphaPlus</span>
                                <span className="text-purple-400 drop-shadow-[0_0_20px_rgba(168,85,247,0.8)]">Complimentary &amp; Spillage Audit</span>
                            </h1>
                            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/40 backdrop-blur-md flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.25)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_#c084fc] animate-pulse" />
                                Zero-Rated, VIP Entertainment &amp; Waste Log
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2.5 font-mono flex-wrap">
                            <span className="text-[#00e676] font-black bg-[#0c161e] px-2.5 py-0.5 rounded-lg border border-[#00e676]/30 shadow-inner">
                                {liveTime.toLocaleTimeString('en-GB')} EAT
                            </span>
                            <span>•</span>
                            <span className="text-white font-bold">{filteredRecords.length} Authorizations Logged</span>
                            <span>•</span>
                            <span className="text-gray-300">Tracking hospitality allowances &amp; wastage</span>
                        </div>
                    </div>
                </div>

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
                        🖨️ Print
                    </button>
                </div>
            </header>

            {/* ==================================================================== */}
            {/* 2. HUD CARDS                                                         */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-purple-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>👑 VIP / Comp Retail Value</span>
                        <span className="text-base text-purple-400">🎁</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-purple-400 font-mono">
                            KES {totalRetailValue.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Waiver menu value given</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-rose-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>📉 Food Cost Expensed</span>
                        <span className="text-base text-rose-400">🥩</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-rose-400 font-mono">
                            KES {totalCostValue.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Kitchen raw cost absorbed</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-[#00e676]/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>👨‍🍳 Staff Duty Meals</span>
                        <span className="text-base text-[#00e676]">🍲</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-white font-mono">
                            {staffCount}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Staff meal authorisations</p>
                    </div>
                </div>

                <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl p-4 shadow-lg hover:border-amber-500/40 transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
                        <span>👑 VIP Guest Entertained</span>
                        <span className="text-base text-amber-400">✨</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                            {vipCount}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Complimentary tables</p>
                    </div>
                </div>
            </div>

            {/* Neon Accent Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-purple-500 via-[#00e676] to-transparent shadow-[0_0_10px_#a855f7] rounded-full" />

            {/* ==================================================================== */}
            {/* 3. FILTER STRIP                                                      */}
            {/* ==================================================================== */}
            <div className="bg-[#080e14] border border-[#162a2e] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search items, beneficiary, authorizer..."
                        className="p-2.5 bg-[#0c161e] border border-[#162a2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00e676] min-w-[220px]"
                    />

                    <div className="flex items-center gap-1 bg-[#0c161e] p-1 rounded-xl border border-[#162a2e]">
                        {[
                            { id: 'ALL', label: 'ALL' },
                            { id: 'VIP_COMP', label: '👑 VIP COMP' },
                            { id: 'STAFF_DUTY_MEAL', label: '👨‍🍳 STAFF MEAL' },
                            { id: 'CHEF_TASTING', label: '🍷 TASTING' },
                            { id: 'SPILLAGE_ACCIDENT', label: '🗑️ SPILLAGE' },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setFilterType(t.id)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                    filterType === t.id
                                        ? 'bg-[#00e676] text-black shadow-sm'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

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
                        onClick={loadCompRecords}
                        className="px-3 py-2 bg-[#0c161e] hover:bg-[#132230] text-[#00e676] border border-[#162a2e] rounded-xl text-xs font-bold"
                    >
                        Filter
                    </button>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 4. COMPLIMENTARY & SPILLAGE AUDIT DATAGRID                           */}
            {/* ==================================================================== */}
            <div className="bg-[#0c161e] border border-[#162a2e] rounded-2xl overflow-hidden shadow-2xl">
                {isLoading ? (
                    <div className="p-16 text-center text-gray-400 space-y-3">
                        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-mono">Loading complimentary waivers and spillage logs...</p>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 space-y-2">
                        <span className="text-4xl block">🎁</span>
                        <h3 className="text-base font-bold text-white">No Complimentary or Spillage Records</h3>
                        <p className="text-xs text-gray-500">All meals were charged normally in this date range.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#080e14] border-b border-[#162a2e] text-[11px] font-black uppercase text-gray-400 tracking-wider">
                                    <th className="p-3.5">Date / ID</th>
                                    <th className="p-3.5">Category Type</th>
                                    <th className="p-3.5">Dishes / Description</th>
                                    <th className="p-3.5">Retail Value</th>
                                    <th className="p-3.5">Kitchen Cost</th>
                                    <th className="p-3.5">Authorized By</th>
                                    <th className="p-3.5">Beneficiary / Table</th>
                                    <th className="p-3.5 text-right">Reason / Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-mono">
                                {filteredRecords.map(record => (
                                    <tr key={record.id} className="hover:bg-[#101c26] transition-colors">
                                        <td className="p-3.5">
                                            <p className="text-white font-bold">{record.date}</p>
                                            <span className="text-[10px] text-gray-500 font-mono">{record.id}</span>
                                        </td>

                                        <td className="p-3.5 font-sans">
                                            {record.type === 'VIP_COMP' ? (
                                                <span className="bg-purple-950/80 text-purple-300 border border-purple-500/50 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                                    👑 VIP COMP
                                                </span>
                                            ) : record.type === 'STAFF_DUTY_MEAL' ? (
                                                <span className="bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/50 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                                    👨‍🍳 STAFF MEAL
                                                </span>
                                            ) : record.type === 'CHEF_TASTING' ? (
                                                <span className="bg-amber-950/80 text-amber-300 border border-amber-500/50 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                                    🍷 TASTING
                                                </span>
                                            ) : (
                                                <span className="bg-rose-950/80 text-rose-300 border border-rose-500/50 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                                    🗑️ SPILLAGE
                                                </span>
                                            )}
                                        </td>

                                        <td className="p-3.5 font-sans text-gray-200 max-w-xs font-semibold">
                                            {record.items_description}
                                        </td>

                                        <td className="p-3.5 text-purple-400 font-black">
                                            KES {record.retail_value.toLocaleString()}
                                        </td>

                                        <td className="p-3.5 text-rose-400 font-black">
                                            KES {record.estimated_cost.toLocaleString()}
                                        </td>

                                        <td className="p-3.5 font-sans text-white font-bold">
                                            {record.authorized_by}
                                        </td>

                                        <td className="p-3.5 font-sans text-gray-300">
                                            {record.beneficiary}
                                        </td>

                                        <td className="p-3.5 text-right font-sans text-[11px] text-gray-400 max-w-xs truncate">
                                            {record.notes}
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
