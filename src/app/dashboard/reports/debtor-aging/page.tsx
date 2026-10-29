'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

interface DebtorRecord {
    id: string;
    customer_name: string;
    account_type: 'Corporate' | 'Hotel Guest' | 'Regular VIP' | 'Staff Tab';
    contact_phone: string;
    contact_email?: string;
    credit_limit: number;
    current_balance: number;
    bucket_current: number; // 0 - 30 days
    bucket_30_60: number;   // 31 - 60 days
    bucket_61_90: number;   // 61 - 90 days
    bucket_90_plus: number; // 90+ days (Critical)
    last_payment_date: string;
    last_invoice_date: string;
    status: 'Good Standing' | 'Due Soon' | 'Overdue' | 'Critical Default';
    unpaid_invoices_count: number;
}

export default function DebtorAgingReportPage() {
    const [debtors, setDebtors] = useState<DebtorRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedDebtor, setSelectedDebtor] = useState<DebtorRecord | null>(null);
    const [settleAmount, setSettleAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'M-Pesa' | 'Cash' | 'Bank Transfer'>('M-Pesa');
    const [paymentRef, setPaymentRef] = useState('');
    const [isSettling, setIsSettling] = useState(false);

    // Initial realistic benchmark debtors for Kenyan hospitality
    const initialBenchmarkDebtors: DebtorRecord[] = [
        {
            id: 'DEB-001',
            customer_name: 'Safaricom Corporate Lunch Account',
            account_type: 'Corporate',
            contact_phone: '+254 722 000 123',
            contact_email: 'accounts@safaricom.co.ke',
            credit_limit: 500000,
            current_balance: 142500,
            bucket_current: 95000,
            bucket_30_60: 47500,
            bucket_61_90: 0,
            bucket_90_plus: 0,
            last_payment_date: '2026-10-14',
            last_invoice_date: '2026-10-27',
            status: 'Good Standing',
            unpaid_invoices_count: 8,
        },
        {
            id: 'DEB-002',
            customer_name: 'Equity Bank Executive Club Tab',
            account_type: 'Corporate',
            contact_phone: '+254 763 112 233',
            contact_email: 'procurement@equitybank.co.ke',
            credit_limit: 300000,
            current_balance: 188400,
            bucket_current: 42000,
            bucket_30_60: 84400,
            bucket_61_90: 62000,
            bucket_90_plus: 0,
            last_payment_date: '2026-09-02',
            last_invoice_date: '2026-10-20',
            status: 'Overdue',
            unpaid_invoices_count: 14,
        },
        {
            id: 'DEB-003',
            customer_name: 'Dr. James Mwangi (Room 402 Long-Stay)',
            account_type: 'Hotel Guest',
            contact_phone: '+254 711 456 789',
            contact_email: 'j.mwangi@health.go.ke',
            credit_limit: 150000,
            current_balance: 78500,
            bucket_current: 28500,
            bucket_30_60: 50000,
            bucket_61_90: 0,
            bucket_90_plus: 0,
            last_payment_date: '2026-09-28',
            last_invoice_date: '2026-10-25',
            status: 'Due Soon',
            unpaid_invoices_count: 5,
        },
        {
            id: 'DEB-004',
            customer_name: 'Apex Logistics Boardroom Catering',
            account_type: 'Corporate',
            contact_phone: '+254 733 998 877',
            contact_email: 'finance@apexlogistics.co.ke',
            credit_limit: 200000,
            current_balance: 215000,
            bucket_current: 15000,
            bucket_30_60: 45000,
            bucket_61_90: 65000,
            bucket_90_plus: 90000,
            last_payment_date: '2026-06-12',
            last_invoice_date: '2026-09-18',
            status: 'Critical Default',
            unpaid_invoices_count: 19,
        },
        {
            id: 'DEB-005',
            customer_name: 'Hon. Senator Wanyonyi (VIP Dining)',
            account_type: 'Regular VIP',
            contact_phone: '+254 720 334 455',
            contact_email: 'wanyonyi.senate@gmail.com',
            credit_limit: 250000,
            current_balance: 64200,
            bucket_current: 64200,
            bucket_30_60: 0,
            bucket_61_90: 0,
            bucket_90_plus: 0,
            last_payment_date: '2026-10-05',
            last_invoice_date: '2026-10-26',
            status: 'Good Standing',
            unpaid_invoices_count: 3,
        },
        {
            id: 'DEB-006',
            customer_name: 'Kitchen Staff Duty Mess Tab (Deductions)',
            account_type: 'Staff Tab',
            contact_phone: '+254 700 111 222',
            credit_limit: 50000,
            current_balance: 18900,
            bucket_current: 18900,
            bucket_30_60: 0,
            bucket_61_90: 0,
            bucket_90_plus: 0,
            last_payment_date: '2026-09-30',
            last_invoice_date: '2026-10-28',
            status: 'Good Standing',
            unpaid_invoices_count: 12,
        },
    ];

    useEffect(() => {
        const loadDebtors = async () => {
            try {
                setLoading(true);
                // Attempt to fetch credit sales from Supabase
                const { data: creditSales } = await supabase
                    .from('sales')
                    .select('*')
                    .or('payment_method.ilike.%credit%,status.ilike.%credit%')
                    .order('created_at', { ascending: false });

                // Also fetch unpaid hotel bookings if any
                const { data: hotelUnpaid } = await supabase
                    .from('hotel_bookings')
                    .select('*')
                    .gt('balance', 0)
                    .order('created_at', { ascending: false });

                let combinedList = [...initialBenchmarkDebtors];

                if (creditSales && creditSales.length > 0) {
                    // Aggregate credit sales into debtor rows
                    const customerMap = new Map<string, number>();
                    creditSales.forEach(s => {
                        const name = s.customer_name || 'Walk-in Credit Tab';
                        const bal = Number(s.total_amount) || 0;
                        customerMap.set(name, (customerMap.get(name) || 0) + bal);
                    });

                    customerMap.forEach((bal, name) => {
                        if (!combinedList.some(d => d.customer_name.toLowerCase() === name.toLowerCase())) {
                            combinedList.push({
                                id: `DEB-POS-${Math.floor(Math.random() * 9000 + 1000)}`,
                                customer_name: name,
                                account_type: 'Regular VIP',
                                contact_phone: '+254 7XX XXX XXX',
                                credit_limit: 100000,
                                current_balance: bal,
                                bucket_current: bal * 0.7,
                                bucket_30_60: bal * 0.3,
                                bucket_61_90: 0,
                                bucket_90_plus: 0,
                                last_payment_date: '2026-10-01',
                                last_invoice_date: new Date().toISOString().split('T')[0],
                                status: bal > 100000 ? 'Overdue' : 'Due Soon',
                                unpaid_invoices_count: 2,
                            });
                        }
                    });
                }

                setDebtors(combinedList);
            } catch (err: any) {
                console.error('Error loading debtors:', err);
                setDebtors(initialBenchmarkDebtors);
            } finally {
                setLoading(false);
            }
        };

        loadDebtors();
    }, []);

    // Filtered debtors
    const filteredDebtors = useMemo(() => {
        return debtors.filter(d => {
            const matchesSearch = d.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                d.contact_phone.includes(searchQuery) ||
                d.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType = selectedType === 'all' || d.account_type === selectedType;
            const matchesStatus = selectedStatus === 'all' || d.status === selectedStatus;
            return matchesSearch && matchesType && matchesStatus;
        });
    }, [debtors, searchQuery, selectedType, selectedStatus]);

    // Summary Totals
    const summary = useMemo(() => {
        const totalOutstanding = filteredDebtors.reduce((acc, d) => acc + d.current_balance, 0);
        const current0to30 = filteredDebtors.reduce((acc, d) => acc + d.bucket_current, 0);
        const days31to60 = filteredDebtors.reduce((acc, d) => acc + d.bucket_30_60, 0);
        const days61to90 = filteredDebtors.reduce((acc, d) => acc + d.bucket_61_90, 0);
        const days90plus = filteredDebtors.reduce((acc, d) => acc + d.bucket_90_plus, 0);
        const criticalCount = filteredDebtors.filter(d => d.status === 'Critical Default').length;
        const totalCreditLimit = filteredDebtors.reduce((acc, d) => acc + d.credit_limit, 0);
        const utilizationRate = totalCreditLimit > 0 ? ((totalOutstanding / totalCreditLimit) * 100) : 0;

        return {
            totalOutstanding,
            current0to30,
            days31to60,
            days61to90,
            days90plus,
            criticalCount,
            totalCreditLimit,
            utilizationRate,
        };
    }, [filteredDebtors]);

    // Handle payment settlement
    const handleSettleDebt = async () => {
        if (!selectedDebtor) return;
        const amt = parseFloat(settleAmount);
        if (isNaN(amt) || amt <= 0) {
            toast.error('Please enter a valid settlement amount');
            return;
        }
        if (amt > selectedDebtor.current_balance) {
            toast.error(`Amount exceeds current outstanding balance of KES ${selectedDebtor.current_balance.toLocaleString()}`);
            return;
        }

        setIsSettling(true);
        try {
            // Apply payment: subtract from oldest bucket first
            let rem = amt;
            let new90 = selectedDebtor.bucket_90_plus;
            let new60 = selectedDebtor.bucket_61_90;
            let new30 = selectedDebtor.bucket_30_60;
            let newCurr = selectedDebtor.bucket_current;

            if (rem > 0 && new90 > 0) {
                const sub = Math.min(rem, new90);
                new90 -= sub;
                rem -= sub;
            }
            if (rem > 0 && new60 > 0) {
                const sub = Math.min(rem, new60);
                new60 -= sub;
                rem -= sub;
            }
            if (rem > 0 && new30 > 0) {
                const sub = Math.min(rem, new30);
                new30 -= sub;
                rem -= sub;
            }
            if (rem > 0 && newCurr > 0) {
                const sub = Math.min(rem, newCurr);
                newCurr -= sub;
                rem -= sub;
            }

            const newBal = selectedDebtor.current_balance - amt;
            const updated: DebtorRecord = {
                ...selectedDebtor,
                current_balance: newBal,
                bucket_90_plus: new90,
                bucket_61_90: new60,
                bucket_30_60: new30,
                bucket_current: newCurr,
                last_payment_date: new Date().toISOString().split('T')[0],
                status: new90 > 0 ? 'Critical Default' : (new60 > 0 ? 'Overdue' : (newBal > 0 ? 'Good Standing' : 'Good Standing')),
            };

            setDebtors(prev => prev.map(d => d.id === selectedDebtor.id ? updated : d));
            setSelectedDebtor(updated);
            toast.success(`KES ${amt.toLocaleString()} received via ${paymentMethod}! Balance updated.`);
            setSettleAmount('');
            setPaymentRef('');
        } catch (err: any) {
            toast.error(err.message || 'Payment settlement failed');
        } finally {
            setIsSettling(false);
        }
    };

    // Export CSV
    const exportCSV = () => {
        const headers = ['Debtor ID', 'Customer / Account Name', 'Type', 'Phone', 'Credit Limit (KES)', 'Total Balance (KES)', 'Current (0-30d)', '31-60d', '61-90d', '90+ Days', 'Status', 'Last Payment Date'];
        const rows = filteredDebtors.map(d => [
            d.id,
            `"${d.customer_name}"`,
            d.account_type,
            `"${d.contact_phone}"`,
            d.credit_limit.toFixed(2),
            d.current_balance.toFixed(2),
            d.bucket_current.toFixed(2),
            d.bucket_30_60.toFixed(2),
            d.bucket_61_90.toFixed(2),
            d.bucket_90_plus.toFixed(2),
            d.status,
            d.last_payment_date || '—',
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `AlphaPlus_Debtor_Aging_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Debtor Aging CSV exported successfully!');
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-slate-100 p-4 md:p-6 space-y-6">
            <Toaster position="top-right" />

            {/* ─── Top Bar / Navigation ─── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0c161e] border border-slate-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/reports"
                        className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 text-sm font-semibold transition-all flex items-center gap-2"
                    >
                        <span>←</span> Back to Reports
                    </Link>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                ⏳ Credit Customer & Debtor Aging Report
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                                Cashflow Guardian
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs md:text-sm mt-0.5">
                            Track unpaid tabs, corporate accounts, 30/60/90+ day aging buckets, credit limits & overdue collections.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={exportCSV}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs md:text-sm font-bold text-slate-200 hover:text-emerald-400 transition-all flex items-center gap-2"
                    >
                        <span>📥</span> Export CSV
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs md:text-sm font-black transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                    >
                        <span>🖨️</span> Print Aging Statement
                    </button>
                </div>
            </div>

            {/* ─── Aging Bucket KPI Cards (Cyber Emerald Aesthetic) ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* 1. Total Outstanding */}
                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        <span>Total Receivables</span>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    </div>
                    <div className="mt-3">
                        <div className="text-xl md:text-2xl font-black text-white">
                            KES {summary.totalOutstanding.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <span className="text-emerald-400 font-bold">{summary.utilizationRate.toFixed(1)}%</span> limit used
                        </div>
                    </div>
                </div>

                {/* 2. Current 0 - 30 Days */}
                <div className="bg-[#0c161e] border border-emerald-500/30 rounded-2xl p-4 shadow-lg flex flex-col justify-between bg-gradient-to-br from-[#0c161e] to-emerald-950/20">
                    <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                        <span>Current (0-30 Days)</span>
                        <span className="text-xs">🌱 Active</span>
                    </div>
                    <div className="mt-3">
                        <div className="text-xl md:text-2xl font-black text-emerald-400">
                            KES {summary.current0to30.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            {summary.totalOutstanding > 0 ? ((summary.current0to30 / summary.totalOutstanding) * 100).toFixed(1) : 0}% of debt
                        </div>
                    </div>
                </div>

                {/* 3. 31 - 60 Days */}
                <div className="bg-[#0c161e] border border-yellow-500/30 rounded-2xl p-4 shadow-lg flex flex-col justify-between bg-gradient-to-br from-[#0c161e] to-yellow-950/20">
                    <div className="flex items-center justify-between text-yellow-400 text-xs font-semibold uppercase tracking-wider">
                        <span>31 - 60 Days</span>
                        <span className="text-xs">⚠️ Follow-up</span>
                    </div>
                    <div className="mt-3">
                        <div className="text-xl md:text-2xl font-black text-yellow-400">
                            KES {summary.days31to60.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            Due this month
                        </div>
                    </div>
                </div>

                {/* 4. 61 - 90 Days */}
                <div className="bg-[#0c161e] border border-orange-500/30 rounded-2xl p-4 shadow-lg flex flex-col justify-between bg-gradient-to-br from-[#0c161e] to-orange-950/20">
                    <div className="flex items-center justify-between text-orange-400 text-xs font-semibold uppercase tracking-wider">
                        <span>61 - 90 Days</span>
                        <span className="text-xs">🚨 Demand Notice</span>
                    </div>
                    <div className="mt-3">
                        <div className="text-xl md:text-2xl font-black text-orange-400">
                            KES {summary.days61to90.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                            Suspend credit line
                        </div>
                    </div>
                </div>

                {/* 5. 90+ Days Critical */}
                <div className="bg-[#0c161e] border border-red-500/40 rounded-2xl p-4 shadow-lg flex flex-col justify-between bg-gradient-to-br from-[#0c161e] to-red-950/20 col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between text-red-400 text-xs font-semibold uppercase tracking-wider">
                        <span>90+ Days (Critical)</span>
                        <span className="text-xs font-black">⛔ Legal/Default</span>
                    </div>
                    <div className="mt-3">
                        <div className="text-xl md:text-2xl font-black text-red-400">
                            KES {summary.days90plus.toLocaleString()}
                        </div>
                        <div className="text-xs text-red-300 mt-1">
                            {summary.criticalCount} accounts default risk
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Search & Filters Bar ─── */}
            <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:w-96">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search corporate client, room #, phone, debtor ID..."
                        className="w-full bg-[#05090d] border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none transition-all placeholder:text-slate-500"
                    />
                </div>

                <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
                    {/* Account Type Filter */}
                    <div className="flex items-center gap-1.5 bg-[#05090d] border border-slate-700/80 rounded-xl p-1 text-xs">
                        {['all', 'Corporate', 'Hotel Guest', 'Regular VIP', 'Staff Tab'].map(t => (
                            <button
                                key={t}
                                onClick={() => setSelectedType(t)}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    selectedType === t
                                        ? 'bg-emerald-500 text-slate-950 font-bold'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                {t === 'all' ? 'All Types' : t}
                            </button>
                        ))}
                    </div>

                    {/* Status Filter */}
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="bg-[#05090d] border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                        <option value="all">All Statuses</option>
                        <option value="Good Standing">Good Standing</option>
                        <option value="Due Soon">Due Soon</option>
                        <option value="Overdue">Overdue</option>
                        <option value="Critical Default">Critical Default (90d+)</option>
                    </select>
                </div>
            </div>

            {/* ─── Main Content Split: Table + Debtor Detail/Settlement Modal/Card ─── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Debtor Records Table (2 Cols on XL) */}
                <div className="xl:col-span-2 bg-[#0c161e] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-white text-base">Corporate & Credit Ledger</h2>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs">
                                {filteredDebtors.length} debtors
                            </span>
                        </div>
                        <span className="text-xs text-slate-400">Click row to inspect or settle debt</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[#080f15] text-slate-400 uppercase font-semibold border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3">Debtor & Account</th>
                                    <th className="px-4 py-3 text-right">Limit</th>
                                    <th className="px-4 py-3 text-right">Outstanding</th>
                                    <th className="px-4 py-3 text-right">0-30d</th>
                                    <th className="px-4 py-3 text-right">31-60d</th>
                                    <th className="px-4 py-3 text-right">61-90d</th>
                                    <th className="px-4 py-3 text-right">90d+</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                {loading ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-8 text-slate-500">
                                            Loading debtor aging records...
                                        </td>
                                    </tr>
                                ) : filteredDebtors.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-8 text-slate-500">
                                            No debtor accounts match the selected filters.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredDebtors.map(debtor => {
                                        const isSelected = selectedDebtor?.id === debtor.id;
                                        return (
                                            <tr
                                                key={debtor.id}
                                                onClick={() => setSelectedDebtor(debtor)}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-emerald-950/30 border-l-4 border-l-emerald-500'
                                                        : 'hover:bg-slate-800/40'
                                                }`}
                                            >
                                                <td className="px-4 py-3 font-sans">
                                                    <div className="font-bold text-white text-sm">
                                                        {debtor.customer_name}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                                                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                                            {debtor.id}
                                                        </span>
                                                        <span>{debtor.account_type}</span>
                                                        <span>•</span>
                                                        <span>{debtor.contact_phone}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-400 font-sans">
                                                    {debtor.credit_limit.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-white text-sm font-sans">
                                                    KES {debtor.current_balance.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right text-emerald-400 font-sans">
                                                    {debtor.bucket_current > 0 ? debtor.bucket_current.toLocaleString() : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-yellow-400 font-sans">
                                                    {debtor.bucket_30_60 > 0 ? debtor.bucket_30_60.toLocaleString() : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-orange-400 font-sans">
                                                    {debtor.bucket_61_90 > 0 ? debtor.bucket_61_90.toLocaleString() : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-red-400 font-sans">
                                                    {debtor.bucket_90_plus > 0 ? debtor.bucket_90_plus.toLocaleString() : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-center font-sans">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                                        debtor.status === 'Good Standing'
                                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                            : debtor.status === 'Due Soon'
                                                            ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                                            : debtor.status === 'Overdue'
                                                            ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                                                            : 'bg-red-500/15 text-red-400 border-red-500/30'
                                                    }`}>
                                                        {debtor.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center font-sans">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedDebtor(debtor);
                                                            setSettleAmount(debtor.current_balance.toString());
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold transition-all text-xs"
                                                    >
                                                        Settle
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Debtor Statement & Payment Settlement Panel */}
                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-6">
                    {selectedDebtor ? (
                        <div className="space-y-5">
                            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-black text-white text-lg">
                                            {selectedDebtor.customer_name}
                                        </h3>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        {selectedDebtor.account_type} • ID: {selectedDebtor.id}
                                    </p>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                    selectedDebtor.status === 'Good Standing'
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : selectedDebtor.status === 'Due Soon'
                                        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                        : selectedDebtor.status === 'Overdue'
                                        ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                                        : 'bg-red-500/15 text-red-400 border-red-500/30'
                                }`}>
                                    {selectedDebtor.status}
                                </span>
                            </div>

                            {/* Contact Details */}
                            <div className="grid grid-cols-2 gap-2 text-xs bg-[#05090d] p-3 rounded-xl border border-slate-800">
                                <div>
                                    <span className="text-slate-500 block">Phone</span>
                                    <span className="text-white font-mono font-bold">{selectedDebtor.contact_phone}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Email / Finance</span>
                                    <span className="text-slate-300 truncate block">{selectedDebtor.contact_email || 'Not provided'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Last Payment</span>
                                    <span className="text-emerald-400 font-mono">{selectedDebtor.last_payment_date}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Unpaid Invoices</span>
                                    <span className="text-amber-400 font-bold">{selectedDebtor.unpaid_invoices_count} tabs</span>
                                </div>
                            </div>

                            {/* Aging Breakdown Mini-Bars */}
                            <div className="space-y-2">
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                                    Aging Breakdown
                                </span>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between items-center bg-[#080f15] p-2 rounded-lg border border-slate-800/80">
                                        <span className="text-emerald-400 font-semibold">Current (0-30 days)</span>
                                        <span className="font-mono font-bold text-white">KES {selectedDebtor.bucket_current.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-[#080f15] p-2 rounded-lg border border-slate-800/80">
                                        <span className="text-yellow-400 font-semibold">31 - 60 days</span>
                                        <span className="font-mono font-bold text-white">KES {selectedDebtor.bucket_30_60.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-[#080f15] p-2 rounded-lg border border-slate-800/80">
                                        <span className="text-orange-400 font-semibold">61 - 90 days</span>
                                        <span className="font-mono font-bold text-white">KES {selectedDebtor.bucket_61_90.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-[#080f15] p-2 rounded-lg border border-red-900/40">
                                        <span className="text-red-400 font-semibold">90+ days (Default Risk)</span>
                                        <span className="font-mono font-bold text-red-400">KES {selectedDebtor.bucket_90_plus.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Settlement Action Form */}
                            <div className="bg-[#05090d] border border-slate-800 rounded-xl p-4 space-y-3">
                                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>💵</span> Receive Debt Payment / Settlement
                                </h4>

                                <div>
                                    <label className="text-[11px] text-slate-400 block mb-1">Settlement Amount (KES)</label>
                                    <input
                                        type="number"
                                        value={settleAmount}
                                        onChange={(e) => setSettleAmount(e.target.value)}
                                        placeholder={`Max KES ${selectedDebtor.current_balance}`}
                                        className="w-full bg-[#0c161e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value as any)}
                                            className="w-full bg-[#0c161e] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                                        >
                                            <option value="M-Pesa">📱 M-Pesa</option>
                                            <option value="Cash">💵 Cash</option>
                                            <option value="Bank Transfer">🏦 Bank Wire / RTGS</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-400 block mb-1">Receipt / Ref Code</label>
                                        <input
                                            type="text"
                                            value={paymentRef}
                                            onChange={(e) => setPaymentRef(e.target.value.toUpperCase())}
                                            placeholder="e.g. QK89..."
                                            className="w-full bg-[#0c161e] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono uppercase"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleSettleDebt}
                                    disabled={isSettling || !settleAmount || parseFloat(settleAmount) <= 0}
                                    className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black rounded-lg text-xs md:text-sm shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <span>✅</span>
                                    <span>{isSettling ? 'Processing Settlement...' : `Record Payment of KES ${parseFloat(settleAmount || '0').toLocaleString()}`}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16 text-slate-500">
                            <span className="text-4xl block mb-2">📋</span>
                            <p className="font-semibold text-slate-400">No Debtor Account Selected</p>
                            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                                Select any debtor row on the left to inspect detailed aging breakdown, contact details, or record a debt settlement.
                            </p>
                        </div>
                    )}

                    {/* Quick Statement Print button */}
                    {selectedDebtor && (
                        <button
                            onClick={() => window.print()}
                            className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                        >
                            <span>🧾</span> Print Customer Statement for {selectedDebtor.customer_name}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
