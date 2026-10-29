'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface DebtorAccount {
    id: string | number;
    account_name: string;
    contact_phone: string;
    account_type: 'CORPORATE' | 'HOTEL_GUEST_FOLIO' | 'VIP_WALKIN' | 'CATERING';
    credit_limit: number;
    current_0_30: number;
    overdue_31_60: number;
    overdue_61_90: number;
    overdue_90_plus: number;
    total_balance: number;
    last_payment_date: string;
    status: 'ACTIVE' | 'WATCHLIST' | 'BLOCKED';
}

export default function DebtorAgingReportPage() {
    const [debtors, setDebtors] = useState<DebtorAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'current' | 'overdue' | 'delinquent'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDebtor, setSelectedDebtor] = useState<DebtorAccount | null>(null);

    // Settlement Modal state
    const [settleAmount, setSettleAmount] = useState('');
    const [settleMethod, setSettleMethod] = useState<'Cash' | 'M-Pesa' | 'Bank EFT'>('M-Pesa');
    const [settleRef, setSettleRef] = useState('');
    const [isSettling, setIsSettling] = useState(false);

    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const loadDebtors = useCallback(async () => {
        setIsLoading(true);
        try {
            // Benchmark Kenyan corporate accounts and hotel guest tabs
            const benchmarkDebtors: DebtorAccount[] = [
                {
                    id: 1,
                    account_name: 'Safaricom Regional Office Staff Account',
                    contact_phone: '+254 722 000 111',
                    account_type: 'CORPORATE',
                    credit_limit: 250000,
                    current_0_30: 45000,
                    overdue_31_60: 18500,
                    overdue_61_90: 0,
                    overdue_90_plus: 0,
                    total_balance: 63500,
                    last_payment_date: '2026-10-15',
                    status: 'ACTIVE'
                },
                {
                    id: 2,
                    account_name: 'County Ministry of Agriculture Delegation',
                    contact_phone: '+254 711 223 344',
                    account_type: 'CORPORATE',
                    credit_limit: 300000,
                    current_0_30: 0,
                    overdue_31_60: 42000,
                    overdue_61_90: 85000,
                    overdue_90_plus: 0,
                    total_balance: 127000,
                    last_payment_date: '2026-08-20',
                    status: 'WATCHLIST'
                },
                {
                    id: 3,
                    account_name: 'Apex Law Chambers Advocates',
                    contact_phone: '+254 733 456 789',
                    account_type: 'CORPORATE',
                    credit_limit: 150000,
                    current_0_30: 22000,
                    overdue_31_60: 0,
                    overdue_61_90: 0,
                    overdue_90_plus: 0,
                    total_balance: 22000,
                    last_payment_date: '2026-10-24',
                    status: 'ACTIVE'
                },
                {
                    id: 4,
                    account_name: 'Dr. John Kibet (Room 304 Suite Folio)',
                    contact_phone: '+254 720 987 654',
                    account_type: 'HOTEL_GUEST_FOLIO',
                    credit_limit: 80000,
                    current_0_30: 34500,
                    overdue_31_60: 0,
                    overdue_61_90: 0,
                    overdue_90_plus: 0,
                    total_balance: 34500,
                    last_payment_date: '2026-10-28',
                    status: 'ACTIVE'
                },
                {
                    id: 5,
                    account_name: 'Eagle Eye Security Services Ltd',
                    contact_phone: '+254 700 123 456',
                    account_type: 'CORPORATE',
                    credit_limit: 100000,
                    current_0_30: 0,
                    overdue_31_60: 0,
                    overdue_61_90: 38000,
                    overdue_90_plus: 47500,
                    total_balance: 85500,
                    last_payment_date: '2026-06-12',
                    status: 'BLOCKED'
                }
            ];

            setDebtors(benchmarkDebtors);
        } catch (err: any) {
            console.error('Debtor aging load error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDebtors();
    }, [loadDebtors]);

    const filteredDebtors = useMemo(() => {
        return debtors.filter(d => {
            if (activeTab === 'current' && d.current_0_30 === 0) return false;
            if (activeTab === 'overdue' && d.overdue_31_60 === 0) return false;
            if (activeTab === 'delinquent' && d.overdue_61_90 === 0 && d.overdue_90_plus === 0) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    d.account_name.toLowerCase().includes(q) ||
                    d.contact_phone.toLowerCase().includes(q) ||
                    d.account_type.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [debtors, activeTab, searchQuery]);

    // Financial KPI Summary
    const totalReceivable = debtors.reduce((sum, d) => sum + d.total_balance, 0);
    const totalCurrent = debtors.reduce((sum, d) => sum + d.current_0_30, 0);
    const totalOverdue30 = debtors.reduce((sum, d) => sum + d.overdue_31_60, 0);
    const totalDelinquent = debtors.reduce((sum, d) => sum + d.overdue_61_90 + d.overdue_90_plus, 0);

    // Settlement Handler
    const handleSettle = () => {
        const amt = parseFloat(settleAmount);
        if (!amt || amt <= 0) {
            toast.error('Enter a valid settlement amount (> 0)');
            return;
        }
        if (!selectedDebtor) return;

        setIsSettling(true);
        setTimeout(() => {
            setDebtors(prev => prev.map(d => {
                if (d.id === selectedDebtor.id) {
                    const newBal = Math.max(0, d.total_balance - amt);
                    return {
                        ...d,
                        total_balance: newBal,
                        current_0_30: Math.max(0, d.current_0_30 - amt),
                        last_payment_date: new Date().toISOString().split('T')[0]
                    };
                }
                return d;
            }));
            toast.success(`Received ${fmt(amt)} for ${selectedDebtor.account_name} via ${settleMethod}! 💰`);
            setIsSettling(false);
            setSelectedDebtor(null);
            setSettleAmount('');
            setSettleRef('');
        }, 600);
    };

    // Export CSV
    const exportCSV = () => {
        const headers = [
            'Account Name',
            'Phone',
            'Type',
            'Credit Limit (KES)',
            'Current 0-30 Days',
            'Overdue 31-60 Days',
            'Critical 61-90 Days',
            'Delinquent 90+ Days',
            'Total Balance (KES)',
            'Status'
        ];

        const rows = filteredDebtors.map(d => [
            `"${d.account_name.replace(/"/g, '""')}"`,
            `"${d.contact_phone}"`,
            `"${d.account_type}"`,
            d.credit_limit.toFixed(2),
            d.current_0_30.toFixed(2),
            d.overdue_31_60.toFixed(2),
            d.overdue_61_90.toFixed(2),
            d.overdue_90_plus.toFixed(2),
            d.total_balance.toFixed(2),
            `"${d.status}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Debtor_Aging_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Debtor Aging report CSV exported! 📄');
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
            <Toaster position="top-right" />

            {/* ── 1. ULTRA EXECUTIVE HEADER (BRIGHT WHITE THEME) ─────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-teal-600 via-teal-700 to-indigo-800 rounded-2xl flex items-center justify-center text-white text-3xl shadow-md shadow-teal-100 flex-shrink-0">
                        ⏳
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                                Credit Customer / Debtor Aging Report
                            </h1>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                                Accounts Receivable &amp; Tab Aging
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Auditing corporate accounts, hotel room folios, and debtor aging buckets: 0–30d, 31–60d, 61–90d, 90+d bad debt prevention.
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={() => loadDebtors()}
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
                        className="px-4 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-black border border-teal-200 transition-all flex items-center gap-1.5"
                    >
                        <span>🖨️</span>
                        <span>Print Aging Statement</span>
                    </button>

                    <Link
                        href="/dashboard/bill-payment"
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-indigo-200 hover:-translate-y-0.5"
                    >
                        <span>💳</span>
                        <span>Bill Payment Terminal →</span>
                    </Link>
                </div>
            </div>

            {/* ── 2. EXECUTIVE METRIC KPI CARDS ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-indigo-700 mb-1">Total Outstanding Debt</div>
                    <div className="text-xl font-black text-gray-900">{fmt(totalReceivable)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Across {debtors.length} active credit accounts</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-emerald-800 mb-1">Current (0–30 Days)</div>
                    <div className="text-xl font-black text-emerald-800">{fmt(totalCurrent)}</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">Healthy credit terms</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-amber-700 mb-1">Overdue (31–60 Days)</div>
                    <div className="text-xl font-black text-amber-800">{fmt(totalOverdue30)}</div>
                    <div className="text-[10px] text-amber-600 mt-0.5">Statement reminders sent</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs">
                    <div className="text-[11px] font-black uppercase text-rose-700 mb-1">Delinquent (61+ Days)</div>
                    <div className="text-xl font-black text-rose-700">{fmt(totalDelinquent)}</div>
                    <div className="text-[10px] text-rose-500 mt-0.5">Requires credit hold / collection</div>
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
                    <span>All Debtors ({debtors.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('current')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'current'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-800 hover:bg-emerald-50'
                    }`}
                >
                    <span>🟢</span>
                    <span>Current 0–30 Days</span>
                </button>
                <button
                    onClick={() => setActiveTab('overdue')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'overdue'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-amber-800 hover:bg-amber-50'
                    }`}
                >
                    <span>🟡</span>
                    <span>Overdue 31–60 Days</span>
                </button>
                <button
                    onClick={() => setActiveTab('delinquent')}
                    className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'delinquent'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-rose-700 hover:bg-rose-50'
                    }`}
                >
                    <span>🔴</span>
                    <span>Delinquent 61+ Days</span>
                </button>
            </div>

            {/* ── 4. FILTER CONTROL BAR ────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                    <div className="relative flex-1">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            placeholder="Search company account name or phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 font-medium placeholder-gray-400"
                        />
                    </div>
                </div>
            </div>

            {/* ── 5. LUXURY DATA TABLE (BRIGHT WHITE THEME) ────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                                <th className="p-4 pl-6">Debtor Account</th>
                                <th className="p-4">Contact Phone</th>
                                <th className="p-4 text-right">Credit Limit</th>
                                <th className="p-4 text-right">0–30 Days</th>
                                <th className="p-4 text-right">31–60 Days</th>
                                <th className="p-4 text-right">61–90 Days</th>
                                <th className="p-4 text-right">90+ Days</th>
                                <th className="p-4 text-right">Total Balance</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 pr-6 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs text-gray-700 font-medium">
                            {filteredDebtors.map(d => (
                                <tr key={d.id} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="p-4 pl-6 font-bold text-gray-900">
                                        <div>{d.account_name}</div>
                                        <div className="text-[10px] text-gray-400 font-normal">{d.account_type}</div>
                                    </td>
                                    <td className="p-4 font-mono text-gray-600">{d.contact_phone}</td>
                                    <td className="p-4 text-right font-mono text-gray-600">{fmt(d.credit_limit)}</td>
                                    <td className="p-4 text-right font-mono text-emerald-800">{fmt(d.current_0_30)}</td>
                                    <td className="p-4 text-right font-mono text-amber-800">{fmt(d.overdue_31_60)}</td>
                                    <td className="p-4 text-right font-mono text-rose-600">{fmt(d.overdue_61_90)}</td>
                                    <td className="p-4 text-right font-mono font-black text-rose-700">{fmt(d.overdue_90_plus)}</td>
                                    <td className="p-4 text-right font-mono font-black text-gray-900">{fmt(d.total_balance)}</td>
                                    <td className="p-4 text-center">
                                        {d.status === 'ACTIVE' && (
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                🟢 ACTIVE
                                            </span>
                                        )}
                                        {d.status === 'WATCHLIST' && (
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                                                🟡 WATCH
                                            </span>
                                        )}
                                        {d.status === 'BLOCKED' && (
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-200">
                                                🔴 HOLD
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 pr-6 text-center">
                                        <button
                                            onClick={() => {
                                                setSelectedDebtor(d);
                                                setSettleAmount(d.total_balance.toString());
                                            }}
                                            className="px-3 py-1.5 bg-gray-50 hover:bg-emerald-50 text-emerald-800 border border-gray-200 hover:border-emerald-200 rounded-xl text-xs font-bold transition-all"
                                        >
                                            Settle Tab
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 6. SETTLEMENT MODAL ───────────────────────────────────────────── */}
            {selectedDebtor && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-gray-200 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <span className="text-2xl">💳</span>
                                <div>
                                    <h3 className="text-base font-black text-gray-900">Settle Credit Account Tab</h3>
                                    <p className="text-xs text-gray-500">{selectedDebtor.account_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedDebtor(null)}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-4 bg-gray-50 rounded-2xl space-y-2 border border-gray-200">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Current Outstanding:</span>
                                    <span className="font-black text-base text-gray-900">{fmt(selectedDebtor.total_balance)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Last Payment:</span>
                                    <span className="font-mono text-gray-700">{selectedDebtor.last_payment_date}</span>
                                </div>
                            </div>

                            <div className="space-y-2 pt-1">
                                <label className="block text-xs font-bold text-gray-700">Settlement Amount (KES)</label>
                                <input
                                    type="number"
                                    value={settleAmount}
                                    onChange={(e) => setSettleAmount(e.target.value)}
                                    placeholder="Enter amount..."
                                    className="w-full py-2.5 px-3 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:bg-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-700">Payment Tender</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['M-Pesa', 'Cash', 'Bank EFT'].map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setSettleMethod(m as any)}
                                            className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                                settleMethod === m
                                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-700">Reference / M-Pesa Code</label>
                                <input
                                    type="text"
                                    value={settleRef}
                                    onChange={(e) => setSettleRef(e.target.value)}
                                    placeholder="e.g. SLK892348A"
                                    className="w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                                />
                            </div>
                        </div>

                        <div className="pt-2 flex items-center gap-2">
                            <button
                                onClick={handleSettle}
                                disabled={isSettling}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2"
                            >
                                <span>{isSettling ? 'Processing...' : 'Confirm Receipt & Settle'}</span>
                            </button>
                            <button
                                onClick={() => setSelectedDebtor(null)}
                                className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
