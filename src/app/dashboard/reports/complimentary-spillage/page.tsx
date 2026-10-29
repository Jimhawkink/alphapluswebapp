'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface CompSpillageRecord {
    id: string | number;
    voucher_no: string;
    timestamp: string;
    recipient_type: 'VIP_ENTERTAINMENT' | 'STAFF_DUTY_MEAL' | 'KITCHEN_DROP_SPILLAGE' | 'CHEF_TASTING';
    beneficiary_name: string;
    authorized_by: string;
    items_description: string;
    estimated_cost: number;
    reason_notes: string;
}

export default function ComplimentarySpillageReportPage() {
    const [records, setRecords] = useState<CompSpillageRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'VIP_ENTERTAINMENT' | 'STAFF_DUTY_MEAL' | 'KITCHEN_DROP_SPILLAGE'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<CompSpillageRecord | null>(null);

    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Benchmark Kenyan hotel & restaurant records
            const benchmarkList: CompSpillageRecord[] = [
                {
                    id: 1,
                    voucher_no: 'CMP-00104',
                    timestamp: `${dateTo} 13:30`,
                    recipient_type: 'VIP_ENTERTAINMENT',
                    beneficiary_name: 'Board Chairman & Investors',
                    authorized_by: 'General Manager PIN',
                    items_description: '2x Goat Choma Platter, 4x Sparkling Water, 1x Fruit Salad',
                    estimated_cost: 4800,
                    reason_notes: 'Quarterly board meeting hospitality lunch'
                },
                {
                    id: 2,
                    voucher_no: 'CMP-00105',
                    timestamp: `${dateTo} 15:00`,
                    recipient_type: 'STAFF_DUTY_MEAL',
                    beneficiary_name: 'Kitchen & Floor Shift Team (8 staff)',
                    authorized_by: 'Executive Chef',
                    items_description: '8x Beef Stew with Brown Ugali & Sukuma',
                    estimated_cost: 3200,
                    reason_notes: 'Afternoon kitchen brigade standard duty meal'
                },
                {
                    id: 3,
                    voucher_no: 'SPL-00088',
                    timestamp: `${dateTo} 19:40`,
                    recipient_type: 'KITCHEN_DROP_SPILLAGE',
                    beneficiary_name: 'Main Dining Floor Runner',
                    authorized_by: 'Floor Supervisor PIN',
                    items_description: '1x Whole Fried Tilapia & Chips (Tray slipped near doorway)',
                    estimated_cost: 950,
                    reason_notes: 'Server collided with guest swinging door; re-cooked immediately'
                },
                {
                    id: 4,
                    voucher_no: 'CMP-00106',
                    timestamp: `${dateTo} 11:15`,
                    recipient_type: 'CHEF_TASTING',
                    beneficiary_name: 'Sous Chef Daniel',
                    authorized_by: 'F&B Director',
                    items_description: 'Sample Portion: Mushroom Pepper Steak Sauce & Gravy',
                    estimated_cost: 350,
                    reason_notes: 'Pre-service recipe seasoning & thickness verification'
                },
                {
                    id: 5,
                    voucher_no: 'CMP-00107',
                    timestamp: `${dateTo} 20:30`,
                    recipient_type: 'VIP_ENTERTAINMENT',
                    beneficiary_name: 'County Health Inspector',
                    authorized_by: 'Operations Manager',
                    items_description: '1x Mixed Grill Sizzler, 1x Fresh Passion Juice',
                    estimated_cost: 1650,
                    reason_notes: 'Official guest courtesy meal'
                }
            ];

            setRecords(benchmarkList);
        } catch (err: any) {
            console.error('Spillage load error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [dateTo]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (activeTab !== 'all' && r.recipient_type !== activeTab) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    r.voucher_no.toLowerCase().includes(q) ||
                    r.beneficiary_name.toLowerCase().includes(q) ||
                    r.items_description.toLowerCase().includes(q) ||
                    r.authorized_by.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [records, activeTab, searchQuery]);

    // Financial calculations
    const totalCost = filteredRecords.reduce((sum, r) => sum + r.estimated_cost, 0);
    const vipCost = records.filter(r => r.recipient_type === 'VIP_ENTERTAINMENT').reduce((sum, r) => sum + r.estimated_cost, 0);
    const staffCost = records.filter(r => r.recipient_type === 'STAFF_DUTY_MEAL').reduce((sum, r) => sum + r.estimated_cost, 0);
    const spillageCost = records.filter(r => r.recipient_type === 'KITCHEN_DROP_SPILLAGE').reduce((sum, r) => sum + r.estimated_cost, 0);

    const exportCSV = () => {
        const headers = [
            'Voucher #',
            'Date & Time',
            'Category',
            'Beneficiary / Recipient',
            'Authorizer PIN',
            'Items & Quantities',
            'Estimated Cost (KES)',
            'Reason / Notes'
        ];

        const rows = filteredRecords.map(r => [
            `"${r.voucher_no}"`,
            `"${r.timestamp}"`,
            `"${r.recipient_type}"`,
            `"${r.beneficiary_name.replace(/"/g, '""')}"`,
            `"${r.authorized_by}"`,
            `"${r.items_description.replace(/"/g, '""')}"`,
            r.estimated_cost.toFixed(2),
            `"${r.reason_notes.replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Complimentary_Spillage_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Spillage report CSV exported! 📄');
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
            <Toaster position="top-right" />

            {/* ── 1. ULTRA EXECUTIVE HEADER (BRIGHT WHITE THEME) ─────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 rounded-2xl flex items-center justify-center text-white text-3xl shadow-md shadow-violet-100 flex-shrink-0">
                        🎁
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                                Complimentary, Manager Meals &amp; Spillage Report
                            </h1>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-violet-50 text-violet-800 border border-violet-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                                Non-Revenue Food Ledger
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Tracking VIP entertainment, staff duty meals, chef tastings &amp; dropped food so it is never recorded as theft or shrinkage.
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
                        className="px-4 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-800 rounded-xl text-xs font-black border border-violet-200 transition-all flex items-center gap-1.5"
                    >
                        <span>🖨️</span>
                        <span>Print Voucher Log</span>
                    </button>

                    <Link
                        href="/dashboard/expenses"
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-indigo-200 hover:-translate-y-0.5"
                    >
                        <span>💵</span>
                        <span>Finance Expenses →</span>
                    </Link>
                </div>
            </div>

            {/* ── 2. EXECUTIVE METRIC KPI CARDS ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-2xl p-4 border border-violet-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-violet-800 mb-1">Total Non-Revenue Cost</div>
                    <div className="text-xl font-black text-violet-900">{fmt(totalCost)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Written off from kitchen inventory</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-indigo-700 mb-1">VIP &amp; Entertainment</div>
                    <div className="text-xl font-black text-indigo-900">{fmt(vipCost)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Authorized guest courtesy</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-emerald-800 mb-1">Staff Duty Meals</div>
                    <div className="text-xl font-black text-emerald-900">{fmt(staffCost)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Culinary &amp; floor personnel</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-rose-700 mb-1">Kitchen Drops &amp; Spillage</div>
                    <div className="text-xl font-black text-rose-700">{fmt(spillageCost)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Accidental food loss</div>
                </div>
            </div>

            {/* ── 3. LUXURY TAB NAVIGATION BAR ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-1.5 border border-gray-200/80 shadow-xs flex items-center gap-1.5 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'all'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <span>📋</span>
                    <span>All Entries ({records.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('VIP_ENTERTAINMENT')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'VIP_ENTERTAINMENT'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <span>🎁</span>
                    <span>VIP &amp; Owner Entertainment</span>
                </button>
                <button
                    onClick={() => setActiveTab('STAFF_DUTY_MEAL')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'STAFF_DUTY_MEAL'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <span>🍽️</span>
                    <span>Staff Duty Meals</span>
                </button>
                <button
                    onClick={() => setActiveTab('KITCHEN_DROP_SPILLAGE')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'KITCHEN_DROP_SPILLAGE'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-rose-700 hover:bg-rose-50'
                    }`}
                >
                    <span>⚠️</span>
                    <span>Kitchen Spillage &amp; Drops</span>
                </button>
            </div>

            {/* ── 4. FILTER CONTROL BAR ────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                    <div className="relative flex-1">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            placeholder="Search voucher #, recipient, dish, or authorizer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 font-medium placeholder-gray-400"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="py-1.5 px-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-700 rounded-xl font-medium"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="py-1.5 px-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-700 rounded-xl font-medium"
                    />
                </div>
            </div>

            {/* ── 5. LUXURY DATA TABLE (BRIGHT WHITE THEME) ────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                                <th className="p-4 pl-6">Voucher #</th>
                                <th className="p-4">Date &amp; Time</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Beneficiary / Recipient</th>
                                <th className="p-4">Authorized By</th>
                                <th className="p-4">Dishes &amp; Items</th>
                                <th className="p-4 text-right">Est. Food Cost</th>
                                <th className="p-4 pr-6 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs text-gray-700 font-medium">
                            {filteredRecords.map(r => (
                                <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="p-4 pl-6 font-mono font-bold text-gray-900">{r.voucher_no}</td>
                                    <td className="p-4 text-gray-500 text-[11px]">{r.timestamp}</td>
                                    <td className="p-4">
                                        {r.recipient_type === 'VIP_ENTERTAINMENT' && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                🎁 VIP Comp
                                            </span>
                                        )}
                                        {r.recipient_type === 'STAFF_DUTY_MEAL' && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                🍽️ Staff Duty
                                            </span>
                                        )}
                                        {r.recipient_type === 'KITCHEN_DROP_SPILLAGE' && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                ⚠️ Spillage
                                            </span>
                                        )}
                                        {r.recipient_type === 'CHEF_TASTING' && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                👨‍🍳 Tasting
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 font-bold text-gray-900">{r.beneficiary_name}</td>
                                    <td className="p-4 text-gray-600">🔑 {r.authorized_by}</td>
                                    <td className="p-4 max-w-[280px] truncate text-gray-800">{r.items_description}</td>
                                    <td className="p-4 text-right font-mono font-black text-rose-600">{fmt(r.estimated_cost)}</td>
                                    <td className="p-4 pr-6 text-center">
                                        <button
                                            onClick={() => setSelectedRecord(r)}
                                            className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-xl text-xs font-bold transition-all"
                                        >
                                            View Voucher
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 6. VOUCHER MODAL DRAWER ──────────────────────────────────────── */}
            {selectedRecord && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-gray-200 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <span className="text-2xl">🎁</span>
                                <div>
                                    <h3 className="text-base font-black text-gray-900">Complimentary Food Voucher</h3>
                                    <p className="text-xs text-gray-500 font-mono">{selectedRecord.voucher_no} • {selectedRecord.timestamp}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedRecord(null)}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-4 bg-gray-50 rounded-2xl space-y-2 border border-gray-200">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Beneficiary / Recipient:</span>
                                    <span className="font-bold text-gray-900">{selectedRecord.beneficiary_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Authorized Manager PIN:</span>
                                    <span className="font-bold text-indigo-700">{selectedRecord.authorized_by}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Recorded Reason:</span>
                                    <span className="font-medium text-gray-800">{selectedRecord.reason_notes}</span>
                                </div>
                            </div>

                            <div className="p-4 bg-violet-50 rounded-2xl border border-violet-200 space-y-1">
                                <div className="text-[11px] font-black uppercase text-violet-800">Items &amp; Inventory Write-Off</div>
                                <p className="font-mono text-gray-900">{selectedRecord.items_description}</p>
                                <div className="flex justify-between pt-1 font-black text-sm text-violet-900 border-t border-violet-200">
                                    <span>Food Cost Impact:</span>
                                    <span>{fmt(selectedRecord.estimated_cost)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex items-center gap-2">
                            <button
                                onClick={() => {
                                    window.print();
                                    toast.success('Dispatched to thermal printer!');
                                }}
                                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2"
                            >
                                <span>🖨️</span>
                                <span>Print Thermal Voucher</span>
                            </button>
                            <button
                                onClick={() => setSelectedRecord(null)}
                                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
