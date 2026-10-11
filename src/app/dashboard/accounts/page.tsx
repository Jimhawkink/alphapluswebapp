'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Account {
    account_id: number;
    account_code: string;
    account_name: string;
    account_type: 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity';
    balance: number;
    description: string;
    active: boolean;
    created_at: string;
}

interface JournalEntry {
    entry_id: number;
    entry_date: string;
    reference_no: string;
    description: string;
    debit_account: string;
    credit_account: string;
    amount: number;
    created_by: string;
    created_at: string;
}

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'] as const;

const TYPE_COLORS: Record<string, string> = {
    Asset:     'bg-emerald-100 text-emerald-700',
    Liability: 'bg-red-100 text-red-700',
    Income:    'bg-blue-100 text-blue-700',
    Expense:   'bg-orange-100 text-orange-700',
    Equity:    'bg-purple-100 text-purple-700',
};

const TYPE_GRADIENTS: Record<string, string> = {
    Asset:     'from-emerald-500 to-teal-600',
    Liability: 'from-red-500 to-rose-600',
    Income:    'from-blue-500 to-indigo-600',
    Expense:   'from-orange-500 to-amber-600',
    Equity:    'from-purple-500 to-violet-600',
};

const emptyAccount = {
    account_code: '',
    account_name: '',
    account_type: 'Asset' as const,
    balance: 0,
    description: '',
    active: true,
};

const emptyJournal = {
    entry_date: new Date().toISOString().split('T')[0],
    reference_no: '',
    description: '',
    debit_account_id: '',
    credit_account_id: '',
    amount: '',
};

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [entriesLoading, setEntriesLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'chart' | 'journal' | 'summary'>('chart');
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showJournalModal, setShowJournalModal] = useState(false);
    const [editAccount, setEditAccount] = useState<Account | null>(null);
    const [accountForm, setAccountForm] = useState(emptyAccount);
    const [journalForm, setJournalForm] = useState(emptyJournal);
    const [filterType, setFilterType] = useState('All');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    const loadAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('accounts')
                .select('*')
                .order('account_code');
            if (error) {
                if (error.code === '42P01') {
                    // Table not yet created — show empty with helpful message
                    setAccounts([]);
                    setLoading(false);
                    return;
                }
                throw error;
            }
            setAccounts((data || []) as Account[]);
        } catch (err: any) {
            console.error(err);
            setAccounts([]);
        }
        setLoading(false);
    }, []);

    const loadEntries = useCallback(async () => {
        setEntriesLoading(true);
        try {
            const { data, error } = await supabase
                .from('journal_entries')
                .select('*')
                .gte('entry_date', dateFrom)
                .lte('entry_date', dateTo)
                .order('entry_date', { ascending: false })
                .limit(200);
            if (error && error.code !== '42P01') throw error;
            setEntries((data || []) as JournalEntry[]);
        } catch { setEntries([]); }
        setEntriesLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);
    useEffect(() => { if (activeTab === 'journal') loadEntries(); }, [activeTab, loadEntries]);

    // ─── Auto-populate income/expense from DB ────────────────────────────────
    useEffect(() => {
        const seedFromDB = async () => {
            if (accounts.length > 0) return; // already loaded
            // Try to seed default chart of accounts from sales/expenses
            const defaultAccounts = [
                { account_code: '1001', account_name: 'Cash on Hand', account_type: 'Asset', balance: 0 },
                { account_code: '1002', account_name: 'M-Pesa Account', account_type: 'Asset', balance: 0 },
                { account_code: '1003', account_name: 'Bank Account - KCB', account_type: 'Asset', balance: 0 },
                { account_code: '1100', account_name: 'Accounts Receivable', account_type: 'Asset', balance: 0 },
                { account_code: '1200', account_name: 'Food & Beverage Inventory', account_type: 'Asset', balance: 0 },
                { account_code: '2001', account_name: 'Accounts Payable', account_type: 'Liability', balance: 0 },
                { account_code: '2100', account_name: 'VAT Payable', account_type: 'Liability', balance: 0 },
                { account_code: '3001', account_name: "Owner's Equity", account_type: 'Equity', balance: 0 },
                { account_code: '4001', account_name: 'Food Sales Revenue', account_type: 'Income', balance: 0 },
                { account_code: '4002', account_name: 'Beverage Sales Revenue', account_type: 'Income', balance: 0 },
                { account_code: '4003', account_name: 'Room Revenue', account_type: 'Income', balance: 0 },
                { account_code: '5001', account_name: 'Food & Beverage Cost', account_type: 'Expense', balance: 0 },
                { account_code: '5002', account_name: 'Staff Salaries', account_type: 'Expense', balance: 0 },
                { account_code: '5003', account_name: 'Utilities & Power', account_type: 'Expense', balance: 0 },
                { account_code: '5004', account_name: 'Rent', account_type: 'Expense', balance: 0 },
                { account_code: '5005', account_name: 'Marketing & Advertising', account_type: 'Expense', balance: 0 },
            ];
            // only show them locally if DB table missing
        };
        seedFromDB();
    }, [accounts]);

    const openAddAccount = () => {
        setEditAccount(null);
        setAccountForm(emptyAccount);
        setShowAccountModal(true);
    };

    const openEditAccount = (acc: Account) => {
        setEditAccount(acc);
        setAccountForm({
            account_code: acc.account_code,
            account_name: acc.account_name,
            account_type: acc.account_type,
            balance: acc.balance,
            description: acc.description || '',
            active: acc.active,
        });
        setShowAccountModal(true);
    };

    const saveAccount = async () => {
        if (!accountForm.account_name.trim()) { toast.error('Account name required'); return; }
        if (!accountForm.account_code.trim()) { toast.error('Account code required'); return; }
        setIsSaving(true);
        try {
            const payload = { ...accountForm, account_name: accountForm.account_name.trim(), account_code: accountForm.account_code.trim() };
            if (editAccount) {
                const { error } = await supabase.from('accounts').update(payload).eq('account_id', editAccount.account_id);
                if (error) throw error;
                toast.success('Account updated!');
            } else {
                const { error } = await supabase.from('accounts').insert(payload);
                if (error) throw error;
                toast.success('Account created!');
            }
            setShowAccountModal(false);
            loadAccounts();
        } catch (err: any) {
            toast.error('Save failed: ' + err.message);
        }
        setIsSaving(false);
    };

    const saveJournalEntry = async () => {
        if (!journalForm.description.trim()) { toast.error('Description required'); return; }
        if (!journalForm.debit_account_id || !journalForm.credit_account_id) { toast.error('Select both debit and credit accounts'); return; }
        const amount = parseFloat(journalForm.amount);
        if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
        if (journalForm.debit_account_id === journalForm.credit_account_id) { toast.error('Debit and Credit accounts must be different'); return; }

        setIsSaving(true);
        try {
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            const user = userData?.name || 'Admin';
            const refNo = journalForm.reference_no || `JNL-${Date.now()}`;
            const debitAcc = accounts.find(a => String(a.account_id) === journalForm.debit_account_id);
            const creditAcc = accounts.find(a => String(a.account_id) === journalForm.credit_account_id);

            const { error } = await supabase.from('journal_entries').insert({
                entry_date: journalForm.entry_date,
                reference_no: refNo,
                description: journalForm.description.trim(),
                debit_account: debitAcc?.account_name,
                credit_account: creditAcc?.account_name,
                debit_account_id: parseInt(journalForm.debit_account_id),
                credit_account_id: parseInt(journalForm.credit_account_id),
                amount,
                created_by: user,
            });
            if (error) throw error;

            // Update balances: Debit increases Asset/Expense, decreases Liability/Equity/Income
            // Credit decreases Asset/Expense, increases Liability/Equity/Income
            const debitDelta = (debitAcc?.account_type === 'Asset' || debitAcc?.account_type === 'Expense') ? amount : -amount;
            const creditDelta = (creditAcc?.account_type === 'Asset' || creditAcc?.account_type === 'Expense') ? -amount : amount;

            if (debitAcc) {
                await supabase.from('accounts').update({ balance: (debitAcc.balance || 0) + debitDelta }).eq('account_id', debitAcc.account_id);
            }
            if (creditAcc) {
                await supabase.from('accounts').update({ balance: (creditAcc.balance || 0) + creditDelta }).eq('account_id', creditAcc.account_id);
            }

            toast.success(`✅ Journal entry posted: ${refNo}`);
            setShowJournalModal(false);
            setJournalForm(emptyJournal);
            loadAccounts();
            if (activeTab === 'journal') loadEntries();
        } catch (err: any) {
            toast.error('Failed: ' + err.message);
        }
        setIsSaving(false);
    };

    const deleteAccount = async (acc: Account) => {
        if (!confirm(`Delete account "${acc.account_name}"?`)) return;
        const { error } = await supabase.from('accounts').delete().eq('account_id', acc.account_id);
        if (error) { toast.error('Failed to delete'); return; }
        toast.success('Account deleted');
        loadAccounts();
    };

    const filtered = accounts.filter(a => {
        const matchSearch = !search || a.account_name.toLowerCase().includes(search.toLowerCase()) || a.account_code.includes(search);
        const matchType = filterType === 'All' || a.account_type === filterType;
        return matchSearch && matchType;
    });

    // Summary computations
    const totalAssets = accounts.filter(a => a.account_type === 'Asset').reduce((s, a) => s + (a.balance || 0), 0);
    const totalLiabilities = accounts.filter(a => a.account_type === 'Liability').reduce((s, a) => s + (a.balance || 0), 0);
    const totalIncome = accounts.filter(a => a.account_type === 'Income').reduce((s, a) => s + (a.balance || 0), 0);
    const totalExpenses = accounts.filter(a => a.account_type === 'Expense').reduce((s, a) => s + (a.balance || 0), 0);
    const netProfit = totalIncome - totalExpenses;
    const fmt = (n: number) => `Ksh ${Math.abs(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-slate-700 to-gray-900 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        📒
                    </span>
                    Chart of Accounts & Ledger
                </h1>
                <div className="flex gap-3">
                    <button onClick={() => setShowJournalModal(true)}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                        📝 Post Journal Entry
                    </button>
                    <button onClick={openAddAccount}
                        className="px-5 py-2.5 bg-gradient-to-r from-slate-700 to-gray-900 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                        ➕ Add Account
                    </button>
                </div>
            </div>

            {/* Financial Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-2xl">🏦</span>
                    <p className="text-xs opacity-80 mt-2">Total Assets</p>
                    <p className="text-xl font-black mt-1">{fmt(totalAssets)}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-2xl">📉</span>
                    <p className="text-xs opacity-80 mt-2">Total Liabilities</p>
                    <p className="text-xl font-black mt-1">{fmt(totalLiabilities)}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-2xl">📈</span>
                    <p className="text-xs opacity-80 mt-2">Total Income</p>
                    <p className="text-xl font-black mt-1">{fmt(totalIncome)}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-2xl">💸</span>
                    <p className="text-xs opacity-80 mt-2">Total Expenses</p>
                    <p className="text-xl font-black mt-1">{fmt(totalExpenses)}</p>
                </div>
                <div className={`bg-gradient-to-br ${netProfit >= 0 ? 'from-emerald-600 to-green-700' : 'from-red-600 to-rose-700'} rounded-2xl p-5 text-white shadow-lg`}>
                    <span className="text-2xl">{netProfit >= 0 ? '🟢' : '🔴'}</span>
                    <p className="text-xs opacity-80 mt-2">Net Profit / Loss</p>
                    <p className="text-xl font-black mt-1">{netProfit < 0 ? '-' : ''}{fmt(netProfit)}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                {(['chart', 'journal', 'summary'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm capitalize transition-all ${activeTab === tab ? 'bg-slate-800 text-white shadow-md' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
                        {tab === 'chart' ? '📒 Chart of Accounts' : tab === 'journal' ? '📝 Journal Entries' : '📊 Financial Summary'}
                    </button>
                ))}
            </div>

            {/* ── CHART OF ACCOUNTS TAB ── */}
            {activeTab === 'chart' && (
                <>
                    {/* Filters */}
                    <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-center">
                        <div className="flex-1 min-w-[200px]">
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="🔍 Search accounts..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none" />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {['All', ...ACCOUNT_TYPES].map(t => (
                                <button key={t} onClick={() => setFilterType(t)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterType === t ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-gray-400 ml-auto">{filtered.length} accounts</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading accounts...</span>
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="bg-white rounded-2xl border py-20 text-center">
                            <div className="text-6xl mb-4">📒</div>
                            <p className="text-xl font-bold text-gray-400">No accounts set up yet</p>
                            <p className="text-sm text-gray-400 mt-1">Create your Chart of Accounts to get started</p>
                            <button onClick={openAddAccount} className="mt-4 px-6 py-3 bg-gradient-to-r from-slate-700 to-gray-900 text-white rounded-xl font-semibold hover:shadow-lg text-sm">
                                ➕ Add First Account
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-slate-700 to-gray-800">
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Code</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Account Name</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Type</th>
                                            <th className="px-4 py-3.5 text-right text-xs font-bold uppercase text-white">Balance</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Description</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Status</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((acc, i) => (
                                            <tr key={acc.account_id} className={`border-b border-gray-100 hover:bg-slate-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                <td className="px-4 py-3.5 font-mono text-sm font-bold text-gray-600">{acc.account_code}</td>
                                                <td className="px-4 py-3.5 font-semibold text-gray-800">{acc.account_name}</td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${TYPE_COLORS[acc.account_type]}`}>
                                                        {acc.account_type}
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-3.5 text-right font-black text-sm ${acc.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                    {acc.balance < 0 ? '-' : ''}{fmt(acc.balance)}
                                                </td>
                                                <td className="px-4 py-3.5 text-sm text-gray-500 max-w-[200px] truncate">{acc.description || '-'}</td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${acc.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {acc.active ? '✅ Active' : '⛔ Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="flex gap-1 justify-center">
                                                        <button onClick={() => openEditAccount(acc)}
                                                            className="px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all">
                                                            ✏️ Edit
                                                        </button>
                                                        <button onClick={() => deleteAccount(acc)}
                                                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all">
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── JOURNAL ENTRIES TAB ── */}
            {activeTab === 'journal' && (
                <>
                    <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none" />
                        </div>
                        <button onClick={loadEntries}
                            className="px-5 py-2.5 bg-gradient-to-r from-slate-700 to-gray-900 text-white rounded-xl font-semibold hover:shadow-md transition-all text-sm">
                            🔍 Filter
                        </button>
                        <button onClick={() => setShowJournalModal(true)}
                            className="ml-auto px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-md transition-all text-sm">
                            📝 New Entry
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border overflow-hidden">
                        {entriesLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading journal entries...</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-blue-600 to-indigo-700">
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Date</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Reference</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Description</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Debit Account</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Credit Account</th>
                                            <th className="px-4 py-3.5 text-right text-xs font-bold uppercase text-white">Amount</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Posted By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.length === 0 ? (
                                            <tr><td colSpan={7} className="py-16 text-center text-gray-400 text-sm">📝 No journal entries found</td></tr>
                                        ) : entries.map((e, i) => (
                                            <tr key={e.entry_id} className={`border-b border-gray-100 hover:bg-blue-50/20 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                <td className="px-4 py-3.5 text-sm text-gray-600">
                                                    {new Date(e.entry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3.5 font-mono text-xs text-blue-600 font-bold">{e.reference_no}</td>
                                                <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">{e.description}</td>
                                                <td className="px-4 py-3.5 text-sm text-gray-600">
                                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold">DR {e.debit_account}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-sm text-gray-600">
                                                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-lg text-xs font-semibold">CR {e.credit_account}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right font-black text-sm text-gray-800">{fmt(e.amount)}</td>
                                                <td className="px-4 py-3.5 text-sm text-gray-500">{e.created_by}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── FINANCIAL SUMMARY TAB ── */}
            {activeTab === 'summary' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {ACCOUNT_TYPES.map(type => {
                        const typeAccounts = accounts.filter(a => a.account_type === type);
                        const total = typeAccounts.reduce((s, a) => s + (a.balance || 0), 0);
                        return (
                            <div key={type} className="bg-white rounded-2xl border overflow-hidden">
                                <div className={`bg-gradient-to-r ${TYPE_GRADIENTS[type]} px-5 py-4 text-white flex items-center justify-between`}>
                                    <div>
                                        <h3 className="font-black text-lg">{type} Accounts</h3>
                                        <p className="text-xs opacity-80 mt-0.5">{typeAccounts.length} account(s)</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs opacity-80">Total</p>
                                        <p className="text-xl font-black">{total < 0 ? '-' : ''}{fmt(total)}</p>
                                    </div>
                                </div>
                                {typeAccounts.length === 0 ? (
                                    <div className="py-8 text-center text-gray-400 text-sm">No {type.toLowerCase()} accounts</div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {typeAccounts.map(acc => (
                                            <div key={acc.account_id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50">
                                                <div>
                                                    <span className="text-xs font-mono text-gray-400 mr-2">{acc.account_code}</span>
                                                    <span className="text-sm font-semibold text-gray-800">{acc.account_name}</span>
                                                </div>
                                                <span className={`text-sm font-bold ${acc.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                    {acc.balance < 0 ? '-' : ''}{fmt(acc.balance)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Profit & Loss Summary */}
                    <div className="md:col-span-2 bg-white rounded-2xl border overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-700 to-gray-800 px-5 py-4 text-white">
                            <h3 className="font-black text-lg">📊 Profit & Loss Summary</h3>
                        </div>
                        <div className="p-6 space-y-3">
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="font-semibold text-gray-700">Total Income</span>
                                <span className="font-black text-blue-700">{fmt(totalIncome)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="font-semibold text-gray-700">Total Expenses</span>
                                <span className="font-black text-orange-700">- {fmt(totalExpenses)}</span>
                            </div>
                            <div className={`flex justify-between items-center py-3 px-4 rounded-2xl ${netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                <span className="font-black text-gray-800 text-lg">Net {netProfit >= 0 ? 'Profit' : 'Loss'}</span>
                                <span className={`font-black text-2xl ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {netProfit < 0 ? '-' : ''}{fmt(netProfit)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADD/EDIT ACCOUNT MODAL ── */}
            {showAccountModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-700 to-gray-900 px-6 py-5 text-white">
                            <h2 className="text-lg font-bold">{editAccount ? '✏️ Edit Account' : '➕ New Account'}</h2>
                            <p className="text-slate-300 text-sm mt-0.5">Chart of Accounts</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Account Code <span className="text-red-500">*</span></label>
                                    <input type="text" value={accountForm.account_code} onChange={e => setAccountForm(p => ({ ...p, account_code: e.target.value }))}
                                        placeholder="e.g. 1001" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:border-slate-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Account Type <span className="text-red-500">*</span></label>
                                    <select value={accountForm.account_type} onChange={e => setAccountForm(p => ({ ...p, account_type: e.target.value as any }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none">
                                        {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Account Name <span className="text-red-500">*</span></label>
                                    <input type="text" value={accountForm.account_name} onChange={e => setAccountForm(p => ({ ...p, account_name: e.target.value }))}
                                        placeholder="e.g. Cash on Hand" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Opening Balance (Ksh)</label>
                                    <input type="number" value={accountForm.balance} onChange={e => setAccountForm(p => ({ ...p, balance: parseFloat(e.target.value) || 0 }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none" />
                                </div>
                                <div className="flex items-end pb-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={accountForm.active} onChange={e => setAccountForm(p => ({ ...p, active: e.target.checked }))}
                                            className="w-4 h-4 accent-slate-700" />
                                        <span className="text-sm font-semibold text-gray-700">Active Account</span>
                                    </label>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Description</label>
                                    <textarea value={accountForm.description} onChange={e => setAccountForm(p => ({ ...p, description: e.target.value }))}
                                        placeholder="Optional description..." rows={2}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-slate-500 outline-none resize-none" />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowAccountModal(false)} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">Cancel</button>
                                <button onClick={saveAccount} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-slate-700 to-gray-900 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : editAccount ? '✅ Update' : '✅ Create Account'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── POST JOURNAL ENTRY MODAL ── */}
            {showJournalModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
                            <h2 className="text-lg font-bold">📝 Post Journal Entry</h2>
                            <p className="text-blue-200 text-sm mt-0.5">Double-entry bookkeeping</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Entry Date</label>
                                    <input type="date" value={journalForm.entry_date} onChange={e => setJournalForm(p => ({ ...p, entry_date: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Reference No</label>
                                    <input type="text" value={journalForm.reference_no} onChange={e => setJournalForm(p => ({ ...p, reference_no: e.target.value }))}
                                        placeholder="Auto-generated if blank" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Description <span className="text-red-500">*</span></label>
                                    <input type="text" value={journalForm.description} onChange={e => setJournalForm(p => ({ ...p, description: e.target.value }))}
                                        placeholder="e.g. Cash sales for October 2026" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                        <span className="text-emerald-600">DEBIT Account</span> <span className="text-red-500">*</span>
                                    </label>
                                    <select value={journalForm.debit_account_id} onChange={e => setJournalForm(p => ({ ...p, debit_account_id: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border-2 border-emerald-200 rounded-xl text-sm focus:border-emerald-500 outline-none">
                                        <option value="">Select account...</option>
                                        {accounts.filter(a => a.active).map(a => (
                                            <option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                        <span className="text-red-600">CREDIT Account</span> <span className="text-red-500">*</span>
                                    </label>
                                    <select value={journalForm.credit_account_id} onChange={e => setJournalForm(p => ({ ...p, credit_account_id: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border-2 border-red-200 rounded-xl text-sm focus:border-red-500 outline-none">
                                        <option value="">Select account...</option>
                                        {accounts.filter(a => a.active).map(a => (
                                            <option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Amount (Ksh) <span className="text-red-500">*</span></label>
                                    <input type="number" value={journalForm.amount} onChange={e => setJournalForm(p => ({ ...p, amount: e.target.value }))}
                                        placeholder="0.00" min="0" step="0.01"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold text-center focus:border-blue-500 outline-none" />
                                </div>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                                <strong>Double-Entry Rule:</strong> Debit = Credit. Assets/Expenses increase on Debit; Liabilities/Income/Equity increase on Credit.
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowJournalModal(false)} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">Cancel</button>
                                <button onClick={saveJournalEntry} disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Posting...' : '📝 Post Entry'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
