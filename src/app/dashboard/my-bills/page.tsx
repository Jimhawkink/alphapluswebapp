'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Bill {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    table_name: string;
    table_no: string;
    customer_name: string;
    total_amount: number;
    payment_method: string;
    status: string;
    waiter_name: string;
    items: BillItem[];
}

interface BillItem {
    item_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

export default function MyBillsPage() {
    const [bills, setBills] = useState<Bill[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [waiterName, setWaiterName] = useState('');
    const [waiters, setWaiters] = useState<{ user_id: number; name: string }[]>([]);
    const [expandedBill, setExpandedBill] = useState<number | null>(null);
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

    // Stats
    const [totalPaid, setTotalPaid] = useState(0);
    const [totalUnpaid, setTotalUnpaid] = useState(0);
    const [paidCount, setPaidCount] = useState(0);
    const [unpaidCount, setUnpaidCount] = useState(0);

    // Load waiters on mount
    useEffect(() => {
        const loadWaiters = async () => {
            const { data } = await supabase
                .from('users')
                .select('user_id, name')
                .eq('active', true)
                .order('name');
            if (data) setWaiters(data);
        };
        loadWaiters();

        // Try to restore last selected waiter from localStorage
        const savedWaiter = localStorage.getItem('alpha_hotel_selected_waiter');
        if (savedWaiter) setWaiterName(savedWaiter);
    }, []);

    // Load bills for selected waiter
    const loadBills = useCallback(async () => {
        if (!waiterName) return;
        setIsLoading(true);

        try {
            const { data: salesData, error } = await supabase
                .from('sales')
                .select('*')
                .eq('sale_date', dateFilter)
                .ilike('waiter_name', `%${waiterName}%`)
                .order('sale_datetime', { ascending: false });

            if (error) throw error;

            const salesWithItems: Bill[] = await Promise.all(
                (salesData || []).map(async (sale) => {
                    const { data: items } = await supabase
                        .from('sales_items')
                        .select('*')
                        .eq('sale_id', sale.sale_id);
                    return { ...sale, items: items || [] };
                })
            );

            setBills(salesWithItems);

            // Calculate stats
            const paid = salesWithItems.filter(b => b.status === 'Completed');
            const unpaid = salesWithItems.filter(b => b.status === 'Pending');
            setPaidCount(paid.length);
            setUnpaidCount(unpaid.length);
            setTotalPaid(paid.reduce((s, b) => s + (b.total_amount || 0), 0));
            setTotalUnpaid(unpaid.reduce((s, b) => s + (b.total_amount || 0), 0));

        } catch (err: any) {
            console.error('Error loading bills:', err);
            toast.error('Failed to load bills');
        }
        setIsLoading(false);
    }, [waiterName, dateFilter]);

    useEffect(() => {
        if (waiterName) {
            loadBills();
            localStorage.setItem('alpha_hotel_selected_waiter', waiterName);
        }
    }, [waiterName, loadBills]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!waiterName) return;
        const interval = setInterval(loadBills, 30000);
        return () => clearInterval(interval);
    }, [waiterName, loadBills]);

    // Filter bills by tab
    const filteredBills = bills.filter(b => {
        if (activeTab === 'paid') return b.status === 'Completed';
        if (activeTab === 'unpaid') return b.status === 'Pending';
        return true;
    });

    const formatTime = (datetime: string) => {
        try {
            return new Date(datetime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white px-6 py-5 shadow-lg">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <a href="/dashboard/pos" className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors" title="Back to POS">
                            ← 
                        </a>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">🧑‍💼 My Bills</h1>
                            <p className="text-indigo-200 text-sm">Track your own paid & unpaid bills</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Waiter Selector */}
                        <select
                            value={waiterName}
                            onChange={(e) => setWaiterName(e.target.value)}
                            className="px-4 py-2.5 bg-white/20 border border-white/30 rounded-xl text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
                        >
                            <option value="" className="text-gray-800">Select Waiter...</option>
                            {waiters.map(w => (
                                <option key={w.user_id} value={w.name} className="text-gray-800">{w.name}</option>
                            ))}
                        </select>
                        {/* Date Filter */}
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="px-4 py-2.5 bg-white/20 border border-white/30 rounded-xl text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                        <button
                            onClick={loadBills}
                            className="px-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors"
                        >
                            🔄 Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* No waiter selected */}
                {!waiterName ? (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                        <span className="text-6xl mb-4">🧑‍💼</span>
                        <h2 className="text-xl font-bold text-gray-600 mb-2">Select Your Name</h2>
                        <p className="text-gray-500">Choose your name from the dropdown above to see your bills</p>
                    </div>
                ) : (
                    <>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-gray-500 font-medium">Total Bills</p>
                                        <p className="text-2xl font-bold text-gray-800">{bills.length}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xl">📋</div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 shadow-md border border-green-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-green-600 font-medium">Paid Bills</p>
                                        <p className="text-2xl font-bold text-green-700">{paidCount}</p>
                                        <p className="text-xs text-green-500 font-bold">Ksh {totalPaid.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-xl">✅</div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 shadow-md border border-orange-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-orange-600 font-medium">Unpaid Bills</p>
                                        <p className="text-2xl font-bold text-orange-700">{unpaidCount}</p>
                                        <p className="text-xs text-orange-500 font-bold">Ksh {totalUnpaid.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-xl">⏳</div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 shadow-md border border-purple-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-purple-600 font-medium">Total Revenue</p>
                                        <p className="text-2xl font-bold text-purple-700">Ksh {(totalPaid + totalUnpaid).toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-xl">💰</div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 mb-4">
                            {[
                                { id: 'all' as const, label: 'All Bills', count: bills.length, color: 'blue' },
                                { id: 'paid' as const, label: 'Paid', count: paidCount, color: 'green' },
                                { id: 'unpaid' as const, label: 'Unpaid', count: unpaidCount, color: 'orange' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${activeTab === tab.id
                                        ? `bg-${tab.color}-500 text-white shadow-lg`
                                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                        }`}
                                >
                                    {tab.label}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === tab.id ? 'bg-white/30' : 'bg-gray-100'}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Bills List */}
                        {isLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="animate-spin w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full"></div>
                            </div>
                        ) : filteredBills.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <span className="text-5xl mb-3">📋</span>
                                <p className="font-medium text-gray-500">No {activeTab === 'paid' ? 'paid' : activeTab === 'unpaid' ? 'unpaid' : ''} bills found</p>
                                <p className="text-sm text-gray-400">for {waiterName} on {new Date(dateFilter).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredBills.map(bill => (
                                    <div key={bill.sale_id} className={`bg-white rounded-2xl shadow-md border-2 transition-all hover:shadow-lg ${bill.status === 'Completed' ? 'border-green-200' : 'border-orange-200'}`}>
                                        {/* Bill Header */}
                                        <div
                                            className="p-4 cursor-pointer hover:bg-gray-50 rounded-t-2xl transition-colors"
                                            onClick={() => setExpandedBill(expandedBill === bill.sale_id ? null : bill.sale_id)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${bill.status === 'Completed'
                                                        ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                                                        }`}>
                                                        {bill.status === 'Completed' ? '✅' : '⏳'}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-gray-800">{bill.receipt_no}</h3>
                                                        <p className="text-xs text-gray-500">
                                                            {(bill.table_name || bill.table_no) && `Table ${bill.table_name || bill.table_no} • `}
                                                            {bill.customer_name || 'Walk-in'} • {formatTime(bill.sale_datetime)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-gray-800">Ksh {(bill.total_amount || 0).toLocaleString()}</p>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${bill.status === 'Completed'
                                                                ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                                                }`}>
                                                                {bill.status === 'Completed' ? '✓ PAID' : '○ UNPAID'}
                                                            </span>
                                                            {bill.payment_method && bill.status === 'Completed' && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                                                                    {bill.payment_method}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="text-gray-400 text-sm">{expandedBill === bill.sale_id ? '▲' : '▼'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Items */}
                                        {expandedBill === bill.sale_id && (
                                            <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-2xl">
                                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Order Items</h4>
                                                <div className="space-y-1.5">
                                                    {bill.items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center bg-white rounded-lg p-2.5 text-sm border border-gray-100">
                                                            <div>
                                                                <p className="font-semibold text-gray-800">{item.product_name}</p>
                                                                <p className="text-xs text-gray-500">Qty: {item.quantity} × Ksh {(item.unit_price || 0).toLocaleString()}</p>
                                                            </div>
                                                            <p className="font-bold text-gray-800">Ksh {(item.subtotal || 0).toLocaleString()}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                                                    <span className="text-sm font-bold text-gray-600">Total ({bill.items.length} items)</span>
                                                    <span className="text-lg font-bold text-gray-800">Ksh {(bill.total_amount || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer Summary */}
                        {filteredBills.length > 0 && (
                            <div className="mt-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-indigo-200 text-sm font-medium">
                                            {activeTab === 'all' ? 'All Bills' : activeTab === 'paid' ? 'Paid Bills' : 'Unpaid Bills'} Summary for <strong>{waiterName}</strong>
                                        </p>
                                        <p className="text-indigo-200 text-xs">
                                            {new Date(dateFilter).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm opacity-80">{filteredBills.length} bill{filteredBills.length !== 1 ? 's' : ''}</p>
                                        <p className="text-3xl font-bold">Ksh {filteredBills.reduce((s, b) => s + (b.total_amount || 0), 0).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
