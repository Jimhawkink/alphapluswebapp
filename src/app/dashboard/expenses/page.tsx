'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

export interface Expense {
    expense_id: number;
    expense_name: string;
    expense_date: string;
    expense_type: string;
    category: string;
    description: string | null;
    amount: number;
    payment_mode: string;
    reference_no: string | null;
    created_by: string;
    created_at?: string;
}

const CATEGORIES = [
    { id: 'Supplies', label: 'Supplies & Groceries', icon: '📦', color: 'from-amber-500 to-orange-600', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
    { id: 'Utilities', label: 'Utilities (Power/Water/Gas)', icon: '💡', color: 'from-blue-500 to-indigo-600', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
    { id: 'Salaries', label: 'Wages & Staff Casuals', icon: '👥', color: 'from-emerald-500 to-teal-600', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { id: 'Maintenance', label: 'Repairs & Maintenance', icon: '🔧', color: 'from-violet-500 to-purple-600', badge: 'bg-violet-100 text-violet-800 border-violet-200' },
    { id: 'Transport', label: 'Transport & Logistics', icon: '🚚', color: 'from-cyan-500 to-blue-600', badge: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    { id: 'Rent', label: 'Rent & Leasehold', icon: '🏢', color: 'from-rose-500 to-red-600', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
    { id: 'Marketing', label: 'Marketing & Ads', icon: '📢', color: 'from-pink-500 to-rose-600', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
    { id: 'Kitchen Petty', label: 'Kitchen Petty Cash', icon: '🍳', color: 'from-orange-500 to-amber-600', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
    { id: 'Other', label: 'Sundry / Miscellaneous', icon: '📝', color: 'from-slate-500 to-gray-600', badge: 'bg-slate-100 text-slate-800 border-slate-200' }
] as const;

const QUICK_AMOUNTS = [200, 500, 1000, 1500, 2000, 3000, 5000];

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUsingFallbackTable, setIsUsingFallbackTable] = useState(false);
    
    // Filters
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<string>('All');
    const [activeDatePreset, setActiveDatePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month');

    // New Expense Form State
    const [formData, setFormData] = useState({
        expense_name: '',
        category: 'Supplies',
        description: '',
        amount: '',
        payment_mode: 'Cash',
        reference_no: '',
        expense_date: new Date().toISOString().split('T')[0]
    });

    // Date Preset Handler
    const handleSetDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom') => {
        setActiveDatePreset(preset);
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        if (preset === 'today') {
            setDateFrom(todayStr);
            setDateTo(todayStr);
        } else if (preset === 'yesterday') {
            const yest = new Date();
            yest.setDate(yest.getDate() - 1);
            const yestStr = yest.toISOString().split('T')[0];
            setDateFrom(yestStr);
            setDateTo(yestStr);
        } else if (preset === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            setDateFrom(weekAgo.toISOString().split('T')[0]);
            setDateTo(todayStr);
        } else if (preset === 'month') {
            const monthAgo = new Date();
            monthAgo.setDate(monthAgo.getDate() - 30);
            setDateFrom(monthAgo.toISOString().split('T')[0]);
            setDateTo(todayStr);
        }
    };

    // Load Expenses with automatic fallback between public.expenses, shift_expenses, and offline cache
    const loadExpenses = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Try public.expenses table
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .gte('expense_date', dateFrom)
                .lte('expense_date', dateTo)
                .order('expense_date', { ascending: false });

            const isMissing = error && (
                error.message?.includes('schema cache') || 
                error.message?.includes('does not exist') || 
                error.code === 'PGRST205' || 
                error.code === '42P01'
            );

            if (isMissing) {
                setIsUsingFallbackTable(true);
                // Fallback to shift_expenses
                const { data: shiftData } = await supabase
                    .from('shift_expenses')
                    .select('*')
                    .gte('recorded_at', `${dateFrom}T00:00:00`)
                    .lte('recorded_at', `${dateTo}T23:59:59`)
                    .order('recorded_at', { ascending: false });

                const mappedShift: Expense[] = (shiftData || []).map((s: any) => ({
                    expense_id: s.expense_id,
                    expense_name: s.expense_description || s.expense_category || 'Operating Expense',
                    expense_date: s.recorded_at ? s.recorded_at.split('T')[0] : dateFrom,
                    expense_type: s.expense_category || 'Operating Expense',
                    category: s.expense_category || 'Other',
                    description: s.expense_description || null,
                    amount: Number(s.amount) || 0,
                    payment_mode: 'Cash',
                    reference_no: `SE-${s.expense_id}`,
                    created_by: s.recorded_by || 'Cashier',
                    created_at: s.recorded_at
                }));

                // Load any local fallback expenses
                let offlineList: Expense[] = [];
                try {
                    const localRaw = localStorage.getItem('alphaplus_offline_expenses');
                    if (localRaw) {
                        offlineList = JSON.parse(localRaw).filter(
                            (le: Expense) => le.expense_date >= dateFrom && le.expense_date <= dateTo
                        );
                    }
                } catch (_) {}

                setExpenses([...offlineList, ...mappedShift]);
            } else if (!error && data) {
                setIsUsingFallbackTable(false);
                setExpenses(data);
            } else if (error) {
                console.error('Expenses query error:', error);
            }
        } catch (err: any) {
            console.error('Failed to load expenses:', err);
        } finally {
            setIsLoading(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadExpenses();
    }, [loadExpenses]);

    // Handle Save with Auto-Fallback
    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const amt = Number(formData.amount);
        if (!formData.expense_name.trim()) {
            toast.error('Please enter an expense title/name');
            return;
        }
        if (!formData.category) {
            toast.error('Please select an expense category');
            return;
        }
        if (!amt || amt <= 0) {
            toast.error('Please enter a valid expense amount');
            return;
        }

        setIsSaving(true);
        const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        const user = userData ? JSON.parse(userData) : null;
        const loggedInName = user?.name || user?.user_name || 'Admin';

        try {
            // Attempt 1: Insert into public.expenses
            const { error: expError } = await supabase.from('expenses').insert({
                expense_name: formData.expense_name.trim(),
                expense_type: formData.category,
                category: formData.category,
                description: formData.description.trim() || null,
                amount: amt,
                payment_mode: formData.payment_mode,
                reference_no: formData.reference_no.trim() || null,
                expense_date: formData.expense_date || new Date().toISOString().split('T')[0],
                created_by: loggedInName
            });

            if (expError) {
                const isMissing = expError.message?.includes('schema cache') || 
                                  expError.message?.includes('does not exist') || 
                                  expError.code === 'PGRST205' || 
                                  expError.code === '42P01';

                if (isMissing) {
                    setIsUsingFallbackTable(true);
                    // Automatic fallback to shift_expenses
                    const { error: shiftErr } = await supabase.from('shift_expenses').insert({
                        expense_category: formData.category,
                        expense_description: `${formData.expense_name.trim()}${formData.description ? ' - ' + formData.description.trim() : ''}${formData.payment_mode !== 'Cash' ? ' [' + formData.payment_mode + ']' : ''}`,
                        amount: amt,
                        recorded_by: loggedInName,
                        recorded_at: new Date().toISOString()
                    });

                    if (shiftErr) {
                        // Resilient Offline Local Storage
                        const localRaw = localStorage.getItem('alphaplus_offline_expenses');
                        const localSaved: Expense[] = localRaw ? JSON.parse(localRaw) : [];
                        const fallbackItem: Expense = {
                            expense_id: Date.now(),
                            expense_name: formData.expense_name.trim(),
                            expense_type: formData.category,
                            category: formData.category,
                            description: formData.description.trim() || null,
                            amount: amt,
                            payment_mode: formData.payment_mode,
                            reference_no: formData.reference_no.trim() || `EXP-${Date.now().toString().slice(-4)}`,
                            expense_date: formData.expense_date || new Date().toISOString().split('T')[0],
                            created_by: loggedInName,
                            created_at: new Date().toISOString()
                        };
                        localSaved.unshift(fallbackItem);
                        localStorage.setItem('alphaplus_offline_expenses', JSON.stringify(localSaved));
                        toast.success('✅ Expense saved to Local Ledger (Supabase table pending setup)', { icon: '💾' });
                    } else {
                        toast.success('✅ Expense recorded in Shift Expenses ledger!', { icon: '💸' });
                    }

                    setShowModal(false);
                    resetForm();
                    loadExpenses();
                    return;
                } else {
                    toast.error(`Failed to save: ${expError.message || 'Unknown error'}`);
                    return;
                }
            }

            toast.success('🎉 Expense saved successfully!');
            setShowModal(false);
            resetForm();
            loadExpenses();
        } catch (err: any) {
            console.error('Error saving expense:', err);
            toast.error(`Unexpected error: ${err.message || 'Failed to save'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setFormData({
            expense_name: '',
            category: 'Supplies',
            description: '',
            amount: '',
            payment_mode: 'Cash',
            reference_no: '',
            expense_date: new Date().toISOString().split('T')[0]
        });
    };

    // Delete Expense
    const deleteExpense = async (exp: Expense) => {
        if (!confirm(`Are you sure you want to delete "${exp.expense_name}" (Ksh ${exp.amount.toLocaleString()})?`)) return;

        try {
            const { error } = await supabase.from('expenses').delete().eq('expense_id', exp.expense_id);
            if (error) {
                // If in fallback mode, delete from shift_expenses
                await supabase.from('shift_expenses').delete().eq('expense_id', exp.expense_id);
                // Also clean local storage
                try {
                    const localRaw = localStorage.getItem('alphaplus_offline_expenses');
                    if (localRaw) {
                        const localSaved: Expense[] = JSON.parse(localRaw);
                        const updated = localSaved.filter(e => e.expense_id !== exp.expense_id);
                        localStorage.setItem('alphaplus_offline_expenses', JSON.stringify(updated));
                    }
                } catch (_) {}
            }
            toast.success('Expense deleted successfully');
            loadExpenses();
        } catch (err) {
            toast.error('Failed to delete expense');
        }
    };

    // Copy SQL Script helper
    const copySetupSQL = () => {
        const sql = `CREATE TABLE IF NOT EXISTS public.expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_name VARCHAR(255) NOT NULL,
    expense_type VARCHAR(100),
    category VARCHAR(100),
    description TEXT,
    amount NUMERIC DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    created_by VARCHAR(100),
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.expenses TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(sql);
            toast.success('📋 Supabase SQL query copied to clipboard! Paste into Supabase SQL Editor.');
        } else {
            prompt('Copy this SQL script:', sql);
        }
    };

    // Export CSV
    const exportCSV = () => {
        if (expenses.length === 0) {
            toast.error('No expenses to export');
            return;
        }
        const headers = ['ID', 'Date', 'Expense Name', 'Category', 'Description', 'Amount (Ksh)', 'Payment Mode', 'Reference No', 'Created By'];
        const rows = filteredExpenses.map(e => [
            e.expense_id,
            e.expense_date,
            `"${(e.expense_name || '').replace(/"/g, '""')}"`,
            `"${(e.category || '').replace(/"/g, '""')}"`,
            `"${(e.description || '').replace(/"/g, '""')}"`,
            e.amount,
            e.payment_mode,
            `"${(e.reference_no || '').replace(/"/g, '""')}"`,
            `"${(e.created_by || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `AlphaPlus_Expenses_${dateFrom}_to_${dateTo}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('📥 Expenses CSV exported successfully!');
    };

    // Filtered Expenses
    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            const matchesCat = selectedCategoryFilter === 'All' || (e.category || '').toLowerCase() === selectedCategoryFilter.toLowerCase();
            const matchesPay = paymentFilter === 'All' || (e.payment_mode || '').toLowerCase() === paymentFilter.toLowerCase();
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch = !q || 
                (e.expense_name || '').toLowerCase().includes(q) ||
                (e.description || '').toLowerCase().includes(q) ||
                (e.category || '').toLowerCase().includes(q) ||
                (e.reference_no || '').toLowerCase().includes(q) ||
                (e.created_by || '').toLowerCase().includes(q);

            return matchesCat && matchesPay && matchesSearch;
        });
    }, [expenses, selectedCategoryFilter, paymentFilter, searchQuery]);

    // Financial Computations
    const totalGross = useMemo(() => {
        return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }, [filteredExpenses]);

    const cashShare = useMemo(() => {
        return filteredExpenses.filter(e => (e.payment_mode || '').toLowerCase().includes('cash')).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }, [filteredExpenses]);

    const mpesaShare = useMemo(() => {
        return filteredExpenses.filter(e => {
            const pm = (e.payment_mode || '').toLowerCase();
            return pm.includes('mpesa') || pm.includes('m-pesa') || pm.includes('till') || pm.includes('paybill');
        }).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }, [filteredExpenses]);

    const bankShare = useMemo(() => {
        return totalGross - cashShare - mpesaShare;
    }, [totalGross, cashShare, mpesaShare]);

    const categoryBreakdown = useMemo(() => {
        const map = new Map<string, number>();
        filteredExpenses.forEach(e => {
            const cat = e.category || 'Other';
            map.set(cat, (map.get(cat) || 0) + (Number(e.amount) || 0));
        });
        return Array.from(map.entries())
            .map(([name, amount]) => ({
                name,
                amount,
                percent: totalGross > 0 ? (amount / totalGross) * 100 : 0
            }))
            .sort((a, b) => b.amount - a.amount);
    }, [filteredExpenses, totalGross]);

    const topCategory = categoryBreakdown[0] || { name: 'None', amount: 0, percent: 0 };
    const avgExpense = filteredExpenses.length > 0 ? totalGross / filteredExpenses.length : 0;

    return (
        <div className="space-y-6 pb-16 text-slate-800 animate-in fade-in duration-300">
            <Toaster position="top-right" />

            {/* ─── Ultra-Premium Header Banner ─── */}
            <div className="relative overflow-hidden rounded-3xl bg-white/75 backdrop-blur-2xl border border-white/80 p-6 md:p-8 shadow-[0_8px_32px_rgba(244,63,94,0.08)]">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-gradient-to-br from-rose-500/15 via-pink-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-1/3 -mb-10 w-48 h-48 bg-gradient-to-tr from-amber-400/10 to-rose-400/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap mb-2">
                            <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                                <span>Operating Expenditure</span>
                            </span>
                            <span className="text-xs font-bold text-slate-500 bg-white/80 px-2.5 py-0.5 rounded-lg border border-slate-200/80">
                                Real-Time Cashflow Ledger
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <span className="w-11 h-11 bg-gradient-to-tr from-rose-500 to-pink-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg shadow-rose-500/30">
                                💸
                            </span>
                            <span>Executive Expenses &amp; Petty Cash Hub</span>
                        </h1>
                        <p className="text-slate-600 text-xs sm:text-sm mt-1.5 max-w-2xl font-medium">
                            Comprehensive general ledger for supplier invoices, market purchases, utility payments, kitchen petty cash, and daily operating vouchers.
                        </p>
                    </div>

                    {/* Action Header Buttons */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                            type="button"
                            onClick={exportCSV}
                            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 rounded-2xl text-xs font-black shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
                            title="Export Filtered Expenses to CSV Spreadsheet"
                        >
                            <span>📥</span>
                            <span>Export CSV</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 rounded-2xl text-xs font-black shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
                            title="Print Ledger"
                        >
                            <span>🖨️</span>
                            <span>Print</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { resetForm(); setShowModal(true); }}
                            className="px-5 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 hover:from-rose-500 hover:to-pink-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-600/30 hover:shadow-rose-600/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                        >
                            <span className="text-sm">➕</span>
                            <span>Record New Expense</span>
                        </button>
                    </div>
                </div>

                {/* Database Setup Notice if Standalone Table Missing */}
                {isUsingFallbackTable && (
                    <div className="mt-5 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-pink-500/10 border border-amber-300/70 backdrop-blur-md rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-slate-800">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl flex-shrink-0">⚠️</span>
                            <div>
                                <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                                    <span>Operating in Resilient Mode via</span>
                                    <code className="bg-white/90 px-1.5 py-0.5 rounded text-rose-700 font-mono text-[11px] font-black border border-rose-200">
                                        shift_expenses
                                    </code>
                                </p>
                                <p className="text-[11px] text-slate-600 mt-0.5">
                                    The standalone <code className="font-mono text-slate-800 font-bold">public.expenses</code> table is not yet created in Supabase. Your expenses are automatically saved and tracked in the shift ledger. Run the SQL script to unlock the dedicated table.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={copySetupSQL}
                            className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer flex-shrink-0"
                        >
                            <span>📋</span>
                            <span>Copy Supabase SQL Setup</span>
                        </button>
                    </div>
                )}
            </div>

            {/* ─── 4 Glassmorphic KPI Hero Cards ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Gross Expenses */}
                <div className="relative overflow-hidden rounded-3xl bg-white/75 backdrop-blur-xl border border-white/80 p-5 shadow-[0_8px_24px_rgba(244,63,94,0.06)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.12)] transition-all group">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-rose-600 tracking-wider">Gross Total Expenses</span>
                        <span className="w-8 h-8 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/80 flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform">
                            💸
                        </span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 font-mono tracking-tight">
                        Ksh {totalGross.toLocaleString()}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-500 font-semibold">{filteredExpenses.length} Total Vouchers</span>
                        <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full text-[10px]">
                            {activeDatePreset.toUpperCase()}
                        </span>
                    </div>
                </div>

                {/* 2. Top Expense Category */}
                <div className="relative overflow-hidden rounded-3xl bg-white/75 backdrop-blur-xl border border-white/80 p-5 shadow-[0_8px_24px_rgba(244,63,94,0.06)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.12)] transition-all group">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-amber-600 tracking-wider">Top Expenditure Category</span>
                        <span className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform">
                            🏷️
                        </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 mt-2 truncate">
                        {topCategory.name}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="font-mono font-black text-slate-700">Ksh {topCategory.amount.toLocaleString()}</span>
                        <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px]">
                            {topCategory.percent.toFixed(1)}% Share
                        </span>
                    </div>
                </div>

                {/* 3. Tender Channels Breakdown */}
                <div className="relative overflow-hidden rounded-3xl bg-white/75 backdrop-blur-xl border border-white/80 p-5 shadow-[0_8px_24px_rgba(244,63,94,0.06)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.12)] transition-all group">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-emerald-600 tracking-wider">Tender / Payment Channels</span>
                        <span className="w-8 h-8 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform">
                            💳
                        </span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 flex items-center gap-1">💵 Cash at Till:</span>
                            <span className="font-mono font-black text-slate-900">Ksh {cashShare.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 flex items-center gap-1">📱 M-Pesa / Mobile:</span>
                            <span className="font-mono font-black text-emerald-700">Ksh {mpesaShare.toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px]">
                        <span className="text-slate-400">Bank/PDQ/Other:</span>
                        <span className="font-mono font-bold text-slate-700">Ksh {bankShare.toLocaleString()}</span>
                    </div>
                </div>

                {/* 4. Average Spend & Efficiency */}
                <div className="relative overflow-hidden rounded-3xl bg-white/75 backdrop-blur-xl border border-white/80 p-5 shadow-[0_8px_24px_rgba(244,63,94,0.06)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.12)] transition-all group">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-indigo-600 tracking-wider">Average Ticket &amp; Records</span>
                        <span className="w-8 h-8 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/80 flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform">
                            📊
                        </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-slate-900 mt-2 font-mono">
                        Ksh {Math.round(avgExpense).toLocaleString()}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-500 font-semibold">Per Entry Avg</span>
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full text-[10px]">
                            {filteredExpenses.length} Records
                        </span>
                    </div>
                </div>
            </div>

            {/* ─── Glassmorphic Filter & Category Navigation Bar ─── */}
            <div className="rounded-3xl bg-white/75 backdrop-blur-xl border border-white/80 p-5 shadow-sm space-y-4">
                {/* Horizontal Category Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                        type="button"
                        onClick={() => setSelectedCategoryFilter('All')}
                        className={`px-3.5 py-1.5 rounded-2xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                            selectedCategoryFilter === 'All'
                                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-500/30'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                    >
                        ✨ All Categories ({expenses.length})
                    </button>
                    {CATEGORIES.map(c => {
                        const count = expenses.filter(e => (e.category || '').toLowerCase() === c.id.toLowerCase()).length;
                        const isSelected = selectedCategoryFilter.toLowerCase() === c.id.toLowerCase();
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedCategoryFilter(c.id)}
                                className={`px-3 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                                    isSelected
                                        ? 'bg-slate-900 text-white shadow-md'
                                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                                }`}
                            >
                                <span>{c.icon}</span>
                                <span>{c.id}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Filter Controls Row */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-2 border-t border-slate-100">
                    {/* Search Bar */}
                    <div className="md:col-span-4 relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search expense, recipient, reference..."
                            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-rose-500 rounded-2xl text-xs font-semibold text-slate-800 outline-none transition-all"
                        />
                    </div>

                    {/* Date Presets Quick Pills */}
                    <div className="md:col-span-4 flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/80 overflow-x-auto">
                        <button
                            type="button"
                            onClick={() => handleSetDatePreset('today')}
                            className={`flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                                activeDatePreset === 'today' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSetDatePreset('yesterday')}
                            className={`flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                                activeDatePreset === 'yesterday' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Yesterday
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSetDatePreset('week')}
                            className={`flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                                activeDatePreset === 'week' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            7 Days
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSetDatePreset('month')}
                            className={`flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                                activeDatePreset === 'month' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            30 Days
                        </button>
                    </div>

                    {/* Custom Date Pickers */}
                    <div className="md:col-span-4 flex items-center gap-2">
                        <div className="flex-1">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => { setDateFrom(e.target.value); setActiveDatePreset('custom'); }}
                                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                title="From Date"
                            />
                        </div>
                        <span className="text-slate-400 font-bold text-xs">to</span>
                        <div className="flex-1">
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => { setDateTo(e.target.value); setActiveDatePreset('custom'); }}
                                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                title="To Date"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={loadExpenses}
                            className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow transition-all cursor-pointer text-xs font-bold"
                            title="Refresh Query"
                        >
                            🔄
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Ultra-Detailed Glassmorphic Expenses Ledger Table ─── */}
            <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-base">📋</span>
                        <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                            Expenses Ledger Records ({filteredExpenses.length})
                        </h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-semibold">Payment Filter:</span>
                        <select
                            value={paymentFilter}
                            onChange={e => setPaymentFilter(e.target.value)}
                            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                        >
                            <option value="All">All Payment Modes</option>
                            <option value="Cash">Cash Only</option>
                            <option value="M-Pesa">M-Pesa Only</option>
                            <option value="Card">Bank / Card Only</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-gradient-to-r from-rose-50/70 via-pink-50/50 to-slate-50/70 text-slate-700 text-[10px] font-black uppercase tracking-wider border-b border-rose-100/60">
                            <tr>
                                <th className="py-3.5 px-4">#</th>
                                <th className="py-3.5 px-4">Date</th>
                                <th className="py-3.5 px-4">Expense Title &amp; Details</th>
                                <th className="py-3.5 px-4">Category</th>
                                <th className="py-3.5 px-4">Payment Channel</th>
                                <th className="py-3.5 px-4">Reference / Receipt</th>
                                <th className="py-3.5 px-4">Recorded By</th>
                                <th className="py-3.5 px-4 text-right">Amount (Ksh)</th>
                                <th className="py-3.5 px-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-20 text-center">
                                        <div className="w-8 h-8 border-3 border-rose-500/30 border-t-rose-600 rounded-full animate-spin mx-auto mb-2" />
                                        <p className="text-xs font-bold text-rose-600">Loading expense ledger...</p>
                                    </td>
                                </tr>
                            ) : filteredExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-20 text-center">
                                        <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2">
                                            💸
                                        </div>
                                        <p className="text-sm font-black text-slate-800">No expenses recorded for this period</p>
                                        <p className="text-xs text-slate-500 mt-1">Click &quot;Record New Expense&quot; to record petty cash or operating bills.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredExpenses.map((exp, idx) => {
                                    const catMeta = CATEGORIES.find(c => c.id.toLowerCase() === (exp.category || '').toLowerCase()) || CATEGORIES[CATEGORIES.length - 1];
                                    const isMpesa = (exp.payment_mode || '').toLowerCase().includes('mpesa') || (exp.payment_mode || '').toLowerCase().includes('m-pesa');
                                    const isCash = (exp.payment_mode || '').toLowerCase().includes('cash');

                                    return (
                                        <tr key={exp.expense_id || idx} className="hover:bg-rose-50/30 transition-colors">
                                            <td className="py-3 px-4 font-mono text-slate-400 font-bold">{idx + 1}</td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <span className="font-bold text-slate-900 block font-mono">
                                                    {exp.expense_date}
                                                </span>
                                                {exp.created_at && (
                                                    <span className="text-[10px] text-slate-400 block">
                                                        {new Date(exp.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="font-black text-slate-900 text-xs sm:text-sm">
                                                    {exp.expense_name}
                                                </div>
                                                {exp.description && (
                                                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                                        {exp.description}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 border ${catMeta.badge}`}>
                                                    <span>{catMeta.icon}</span>
                                                    <span>{exp.category || exp.expense_type}</span>
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1 border ${
                                                    isMpesa 
                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                                        : isCash 
                                                        ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                                        : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                                }`}>
                                                    <span>{isMpesa ? '📱' : isCash ? '💵' : '💳'}</span>
                                                    <span>{exp.payment_mode || 'Cash'}</span>
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">
                                                {exp.reference_no ? (
                                                    <span className="bg-slate-100 px-2 py-0.5 rounded-md font-bold text-[10px]">
                                                        {exp.reference_no}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/60">
                                                    {exp.created_by || 'Admin'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-black text-rose-600 text-sm">
                                                Ksh {Number(exp.amount || 0).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => deleteExpense(exp)}
                                                    className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-200/80 transition-all inline-flex items-center justify-center cursor-pointer shadow-xs"
                                                    title="Delete this expense"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        <tfoot className="bg-gradient-to-r from-rose-50/80 via-pink-50/60 to-slate-50/80 border-t-2 border-rose-200/80 font-black text-xs text-slate-900">
                            <tr>
                                <td colSpan={4} className="py-4 px-4 uppercase text-slate-600 font-bold">
                                    Total Filtered Expenditure ({filteredExpenses.length} entries)
                                </td>
                                <td colSpan={3} className="py-4 px-4 text-xs font-semibold text-slate-500">
                                    Cash: Ksh {cashShare.toLocaleString()} • M-Pesa: Ksh {mpesaShare.toLocaleString()}
                                </td>
                                <td className="py-4 px-4 text-right font-mono text-base font-black text-rose-600">
                                    Ksh {totalGross.toLocaleString()}
                                </td>
                                <td className="py-4 px-4" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* ─── Ultra-Premium Glassmorphic New Expense Modal ─── */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white/95 backdrop-blur-2xl rounded-3xl p-6 sm:p-7 w-full max-w-lg border border-white shadow-[0_20px_60px_rgba(244,63,94,0.2)] space-y-5 text-slate-800 max-h-[92vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center text-xl shadow-md shadow-rose-500/20">
                                    💸
                                </span>
                                <div>
                                    <h3 className="font-black text-lg text-slate-900">Record New Operating Expense</h3>
                                    <p className="text-[11px] text-slate-500 font-medium">Post to expense ledger &amp; adjust till cash reconciliation</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Expense Title */}
                            <div>
                                <label className="text-xs font-black uppercase text-slate-700 block mb-1">
                                    Expense Title / Item Name <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.expense_name}
                                    onChange={e => setFormData({ ...formData, expense_name: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 focus:bg-white border-2 border-slate-200 focus:border-rose-500 rounded-2xl text-xs font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400"
                                    placeholder="e.g., KPLC Electricity Bill, Cooking Gas Refill, Market Tomatoes..."
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* Category Selector with Visual Icons */}
                            <div>
                                <label className="text-xs font-black uppercase text-slate-700 block mb-1">
                                    Category <span className="text-rose-500">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {CATEGORIES.map(c => {
                                        const isSelected = formData.category.toLowerCase() === c.id.toLowerCase();
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, category: c.id })}
                                                className={`p-2 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    isSelected
                                                        ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-xs'
                                                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                                                }`}
                                            >
                                                <span>{c.icon}</span>
                                                <span className="truncate">{c.id}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Amount Input with Quick Preset Tiles */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-black uppercase text-slate-700">
                                        Expense Amount (Ksh) <span className="text-rose-500">*</span>
                                    </label>
                                    <span className="text-[11px] font-bold text-rose-600 font-mono">
                                        {formData.amount ? `Ksh ${Number(formData.amount).toLocaleString()}` : ''}
                                    </span>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Ksh</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="any"
                                        value={formData.amount}
                                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full pl-12 pr-3.5 py-2.5 bg-slate-50 focus:bg-white border-2 border-slate-200 focus:border-rose-500 rounded-2xl text-base font-black font-mono text-slate-900 outline-none transition-all placeholder:text-slate-400"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>

                                {/* Quick amount tiles */}
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    <span className="text-[10px] text-slate-400 font-semibold">Fast:</span>
                                    {QUICK_AMOUNTS.map(amt => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, amount: String(amt) })}
                                            className="px-2 py-1 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer"
                                        >
                                            +{amt.toLocaleString()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Payment Mode Selector */}
                            <div>
                                <label className="text-xs font-black uppercase text-slate-700 block mb-1">
                                    Payment Tender Channel
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'Cash', label: 'Cash (Till)', icon: '💵' },
                                        { id: 'M-Pesa', label: 'M-Pesa Till', icon: '📱' },
                                        { id: 'Card', label: 'Bank / Card', icon: '💳' }
                                    ].map(pm => (
                                        <button
                                            key={pm.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, payment_mode: pm.id })}
                                            className={`py-2 px-3 rounded-xl border text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                                formData.payment_mode === pm.id
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                                            }`}
                                        >
                                            <span>{pm.icon}</span>
                                            <span>{pm.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Reference Number & Date */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-700 block mb-1">
                                        Receipt / Ref No.
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.reference_no}
                                        onChange={e => setFormData({ ...formData, reference_no: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                        placeholder="e.g., KPLC-98213, INV-004"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black uppercase text-slate-700 block mb-1">
                                        Expense Date
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.expense_date}
                                        onChange={e => setFormData({ ...formData, expense_date: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Description / Voucher Notes */}
                            <div>
                                <label className="text-xs font-black uppercase text-slate-700 block mb-1">
                                    Notes &amp; Description (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl text-xs font-medium text-slate-800 outline-none resize-none"
                                    placeholder="Add any specific details, vendor name or authorization note..."
                                />
                            </div>

                            {/* Modal Actions */}
                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-6 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    <span>{isSaving ? '⏳' : '💾'}</span>
                                    <span>{isSaving ? 'Recording...' : 'Confirm & Save Expense'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
