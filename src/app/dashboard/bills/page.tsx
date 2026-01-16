'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// Type definitions
interface SaleItem {
    item_id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    discount: number;
    subtotal: number;
    notes?: string;
}

interface Bill {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    shift_id?: number;
    shift_name?: string;
    shift_code?: string;
    waiter_id?: number;
    waiter_name?: string;
    table_id?: number;
    table_name?: string;
    order_type?: string;
    kot_number?: string;
    customer_name?: string;
    customer_phone?: string;
    subtotal: number;
    discount: number;
    tax_amount: number;
    total_amount: number;
    total_cost: number;
    profit: number;
    payment_method: string;
    amount_paid: number;
    change_amount: number;
    mpesa_code?: string;
    status: string;
    notes?: string;
    created_by?: string;
    items?: SaleItem[];
    isExpanded?: boolean;
}

// Collapsible Bill Row Component
const BillRow = ({
    bill,
    isExpanded,
    onToggle,
    onReceivePayment,
    onViewReceipt
}: {
    bill: Bill;
    isExpanded: boolean;
    onToggle: () => void;
    onReceivePayment: () => void;
    onViewReceipt: () => void;
}) => {
    const isPaid = bill.status === 'Completed' || bill.status === 'Paid';
    const isPending = bill.status === 'Pending';

    const getStatusColor = () => {
        if (isPaid) return 'bg-green-100 text-green-700 border-green-200';
        if (isPending) return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-gray-100 text-gray-600 border-gray-200';
    };

    const getStatusIcon = () => {
        if (isPaid) return '✅';
        if (isPending) return '⏳';
        return '📋';
    };

    const getPaymentMethodBadge = () => {
        const method = bill.payment_method?.toLowerCase() || '';
        if (method.includes('mpesa') || method.includes('m-pesa')) {
            return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium flex items-center gap-1"><span>📱</span> M-Pesa</span>;
        }
        if (method.includes('cash')) {
            return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium flex items-center gap-1"><span>💵</span> Cash</span>;
        }
        if (method === 'pending') {
            return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium flex items-center gap-1"><span>⏰</span> Pending</span>;
        }
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">{bill.payment_method || '-'}</span>;
    };

    return (
        <>
            {/* Main Row */}
            <tr className={`border-t border-gray-100 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent transition-all cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                <td className="py-3 px-4">
                    <button
                        onClick={onToggle}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isExpanded
                            ? 'bg-blue-500 text-white rotate-90'
                            : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600'
                            }`}
                    >
                        ▶
                    </button>
                </td>
                <td className="py-3 px-4">
                    <span className="px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-lg text-sm font-bold border border-blue-100">
                        {bill.receipt_no}
                    </span>
                </td>
                <td className="py-3 px-4">
                    <div>
                        <p className="font-medium text-gray-700">{new Date(bill.sale_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        <p className="text-xs text-gray-400">{bill.sale_time?.slice(0, 5) || '--:--'}</p>
                    </div>
                </td>
                <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">👤</span>
                        <span className="font-medium text-gray-700">{bill.waiter_name || bill.created_by || 'Unknown'}</span>
                    </div>
                </td>
                <td className="py-3 px-4">
                    {bill.table_name ? (
                        <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium">
                            🪑 {bill.table_name}
                        </span>
                    ) : (
                        <span className="text-gray-400 text-sm">-</span>
                    )}
                </td>
                <td className="py-3 px-4 text-right">
                    <span className="font-bold text-gray-800">{bill.total_amount?.toLocaleString() || 0}</span>
                </td>
                <td className="py-3 px-4 text-right">
                    <span className={`font-bold ${bill.amount_paid >= bill.total_amount ? 'text-green-600' : 'text-amber-600'}`}>
                        {bill.amount_paid?.toLocaleString() || 0}
                    </span>
                </td>
                <td className="py-3 px-4 text-right">
                    <span className={`font-bold ${(bill.total_amount - bill.amount_paid) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)).toLocaleString()}
                    </span>
                </td>
                <td className="py-3 px-4 text-right">
                    {isPaid ? (
                        <span className={`font-bold ${(bill.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(bill.profit || 0).toLocaleString()}
                        </span>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                </td>
                <td className="py-3 px-4">
                    <div>
                        {getPaymentMethodBadge()}
                        {bill.mpesa_code && (
                            <p className="text-xs text-gray-600 mt-1 font-mono">
                                📱 {bill.mpesa_code}
                            </p>
                        )}
                    </div>
                </td>
                <td className="py-3 px-4">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${getStatusColor()}`}>
                        {getStatusIcon()} {bill.status}
                    </span>
                </td>
                <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onViewReceipt}
                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors"
                            title="View Receipt"
                        >
                            🧾
                        </button>
                        {isPending && (
                            <button
                                onClick={onReceivePayment}
                                className="p-2 hover:bg-green-50 rounded-lg text-green-600 transition-colors"
                                title="Receive Payment"
                            >
                                💰
                            </button>
                        )}
                        <button
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                            title="Print"
                        >
                            🖨️
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded Items Row */}
            {isExpanded && (
                <tr className="bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
                    <td colSpan={11} className="p-4">
                        <div className="bg-white rounded-xl border border-blue-100 overflow-hidden shadow-sm">
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 flex items-center gap-2">
                                <span>🍽️</span>
                                <span className="font-semibold">Order Items</span>
                                <span className="ml-auto text-xs opacity-80">KOT: {bill.kot_number || 'N/A'}</span>
                            </div>
                            {bill.items && bill.items.length > 0 ? (
                                <table className="w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">Item</th>
                                            <th className="text-center py-2 px-4 text-xs font-semibold text-gray-500">Qty</th>
                                            <th className="text-right py-2 px-4 text-xs font-semibold text-gray-500">Unit Price</th>
                                            <th className="text-right py-2 px-4 text-xs font-semibold text-gray-500">Total</th>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bill.items.map((item, idx) => (
                                            <tr key={idx} className="border-t border-gray-50">
                                                <td className="py-2 px-4 font-medium text-gray-700">{item.product_name}</td>
                                                <td className="py-2 px-4 text-center">
                                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold text-sm">
                                                        {item.quantity}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-4 text-right text-gray-600">{item.unit_price?.toLocaleString()}</td>
                                                <td className="py-2 px-4 text-right font-semibold text-gray-800">{item.subtotal?.toLocaleString()}</td>
                                                <td className="py-2 px-4 text-sm text-amber-600 italic">{item.notes || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-8 text-center text-gray-400">
                                    <span className="text-3xl block mb-2">📦</span>
                                    <p>No items found</p>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

export default function BillsPage() {
    const [bills, setBills] = useState<Bill[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedBillId, setExpandedBillId] = useState<number | null>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterShift, setFilterShift] = useState('All');
    const [filterUser, setFilterUser] = useState('All');

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    // Dropdown data
    const [shifts, setShifts] = useState<string[]>([]);
    const [users, setUsers] = useState<string[]>([]);

    // Stats
    const [stats, setStats] = useState({
        totalBills: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        paidCount: 0,
        pendingCount: 0,
        totalProfit: 0
    });

    // Receipt Modal
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

    // Load bills from database
    const loadBills = useCallback(async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('sales')
                .select(`
                    *,
                    sales_items (*)
                `)
                .order('sale_datetime', { ascending: false });

            // Apply date filters
            if (dateFrom) {
                query = query.gte('sale_date', dateFrom);
            }
            if (dateTo) {
                query = query.lte('sale_date', dateTo);
            }
            if (filterStatus !== 'All') {
                query = query.eq('status', filterStatus);
            }
            if (filterShift !== 'All') {
                query = query.eq('shift_name', filterShift);
            }
            if (filterUser !== 'All') {
                query = query.or(`waiter_name.eq.${filterUser},created_by.eq.${filterUser}`);
            }

            const { data, error } = await query;

            if (error) throw error;

            // Transform data
            const transformedBills: Bill[] = (data || []).map(sale => ({
                ...sale,
                items: sale.sales_items || [],
                isExpanded: false
            }));

            setBills(transformedBills);

            // Extract unique shifts and users for filters
            const uniqueShifts: string[] = Array.from(new Set(
                transformedBills.map(b => b.shift_name).filter((s): s is string => Boolean(s))
            ));
            const uniqueUsers: string[] = Array.from(new Set([
                ...transformedBills.map(b => b.waiter_name),
                ...transformedBills.map(b => b.created_by)
            ].filter((u): u is string => Boolean(u))));

            setShifts(uniqueShifts);
            setUsers(uniqueUsers);

            // Calculate stats
            const totalAmount = transformedBills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
            const paidBills = transformedBills.filter(b => b.status === 'Completed' || b.status === 'Paid');
            const pendingBills = transformedBills.filter(b => b.status === 'Pending');
            // Calculate profit ONLY for paid/completed bills
            const totalProfit = paidBills.reduce((sum, b) => sum + (b.profit || 0), 0);

            setStats({
                totalBills: transformedBills.length,
                totalAmount,
                paidAmount: paidBills.reduce((sum, b) => sum + (b.total_amount || 0), 0),
                pendingAmount: pendingBills.reduce((sum, b) => sum + (b.total_amount || 0), 0),
                paidCount: paidBills.length,
                pendingCount: pendingBills.length,
                totalProfit
            });

        } catch (err) {
            console.error('Error loading bills:', err);
            toast.error('Failed to load bills');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo, filterStatus, filterShift, filterUser]);

    useEffect(() => {
        loadBills();
    }, [loadBills]);

    // Filter bills by search query
    const filteredBills = bills.filter(bill => {
        const query = searchQuery.toLowerCase();
        return (
            bill.receipt_no?.toLowerCase().includes(query) ||
            bill.customer_name?.toLowerCase().includes(query) ||
            bill.waiter_name?.toLowerCase().includes(query) ||
            bill.mpesa_code?.toLowerCase().includes(query) ||
            bill.kot_number?.toLowerCase().includes(query)
        );
    });

    // Pagination
    const totalPages = Math.ceil(filteredBills.length / itemsPerPage);
    const paginatedBills = filteredBills.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const toggleBillExpansion = (billId: number) => {
        setExpandedBillId(prev => prev === billId ? null : billId);
    };

    const handleReceivePayment = (bill: Bill) => {
        // Navigate to bill payment page with bill ID
        window.location.href = `/dashboard/bill-payment?id=${bill.sale_id}`;
    };

    const handleViewReceipt = (bill: Bill) => {
        setSelectedBill(bill);
        setShowReceiptModal(true);
    };

    const clearFilters = () => {
        setSearchQuery('');
        setDateFrom('');
        setDateTo('');
        setFilterStatus('All');
        setFilterShift('All');
        setFilterUser('All');
        setCurrentPage(1);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">🧾</span>
                        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Bills Records
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-1">View and manage all sales bills with payment status</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={loadBills}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:shadow-md transition-all"
                    >
                        <span>🔄</span>
                        <span className="font-medium text-blue-700">Refresh</span>
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl hover:shadow-md transition-all">
                        <span>📥</span>
                        <span className="font-medium text-green-700">Export</span>
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl hover:shadow-md transition-all">
                        <span>🖨️</span>
                        <span className="font-medium text-purple-700">Print Report</span>
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/30">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">📊</span>
                        <span className="font-medium opacity-90">Total Bills</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalBills}</p>
                    <p className="text-sm opacity-80 mt-1">Ksh {stats.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-5 border border-green-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-300/50">
                            <span className="text-2xl">💰</span>
                        </div>
                        <span className="text-sm font-bold text-green-700">Total Profit</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">Ksh {stats.totalProfit.toLocaleString()}</p>
                    <p className="text-xs text-green-600 mt-1">From {stats.paidCount} paid bills</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl p-5 border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                            <span className="text-2xl">✅</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">Paid</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{stats.paidCount}</p>
                    <p className="text-sm text-green-600 font-medium">Ksh {stats.paidAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-5 border border-amber-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                            <span className="text-2xl">⏳</span>
                        </div>
                        <span className="text-sm font-medium text-amber-600">Pending</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{stats.pendingCount}</p>
                    <p className="text-sm text-amber-600 font-medium">Ksh {stats.pendingAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-amber-100 rounded-2xl p-5 border border-yellow-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-100 to-amber-100 flex items-center justify-center">
                            <span className="text-2xl">💵</span>
                        </div>
                        <span className="text-sm font-medium text-yellow-700">Cash</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">
                        {bills.filter(b => b.payment_method?.toLowerCase()?.includes('cash')).length}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-teal-50 to-green-100 rounded-2xl p-5 border border-teal-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-teal-100 flex items-center justify-center">
                            <span className="text-2xl">📱</span>
                        </div>
                        <span className="text-sm font-medium text-green-700">M-Pesa</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">
                        {bills.filter(b => b.payment_method?.toLowerCase()?.includes('mpesa') || b.payment_method?.toLowerCase()?.includes('m-pesa')).length}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl">🔍</span>
                    <h3 className="font-semibold text-gray-700">Filters</h3>
                    <button
                        onClick={clearFilters}
                        className="ml-auto text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        Clear All
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-4">
                    {/* Search */}
                    <div className="col-span-2 relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Receipt, Customer, M-Pesa Code..."
                            className="w-full pl-12 pr-4 py-3 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 transition-all"
                        />
                    </div>

                    {/* Date From */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 From Date</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 text-sm"
                        />
                    </div>

                    {/* Date To */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 To Date</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 text-sm"
                        />
                    </div>

                    {/* Status Filter */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📋 Status</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 text-sm"
                        >
                            <option value="All">All Status</option>
                            <option value="Pending">⏳ Pending</option>
                            <option value="Completed">✅ Paid</option>
                        </select>
                    </div>

                    {/* Shift Filter */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">🕐 Shift</label>
                        <select
                            value={filterShift}
                            onChange={(e) => setFilterShift(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 text-sm"
                        >
                            <option value="All">All Shifts</option>
                            {shifts.map(shift => (
                                <option key={shift} value={shift}>{shift}</option>
                            ))}
                        </select>
                    </div>

                    {/* User Filter */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">👤 User</label>
                        <select
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 text-sm"
                        >
                            <option value="All">All Users</option>
                            {users.map(user => (
                                <option key={user} value={user}>{user}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Bills Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-16 text-center">
                        <div className="inline-block animate-spin text-5xl mb-4">🔄</div>
                        <p className="text-gray-500">Loading bills...</p>
                    </div>
                ) : paginatedBills.length === 0 ? (
                    <div className="p-16 text-center">
                        <span className="text-6xl block mb-4">📭</span>
                        <p className="text-gray-500 text-lg">No bills found</p>
                        <p className="text-gray-400 text-sm mt-2">Try adjusting your filters</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                            <tr>
                                <th className="w-12 py-4 px-4"></th>
                                <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Receipt #</th>
                                <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Date & Time</th>
                                <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">User/Waiter</th>
                                <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Table</th>
                                <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                                <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Paid</th>
                                <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Balance</th>
                                <th className="text-right py-4 px-4 text-xs font-bold text-green-600 uppercase tracking-wider">💰 Profit</th>
                                <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Payment</th>
                                <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                                <th className="text-center py-4 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedBills.map(bill => (
                                <BillRow
                                    key={bill.sale_id}
                                    bill={bill}
                                    isExpanded={expandedBillId === bill.sale_id}
                                    onToggle={() => toggleBillExpansion(bill.sale_id)}
                                    onReceivePayment={() => handleReceivePayment(bill)}
                                    onViewReceipt={() => handleViewReceipt(bill)}
                                />
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination Footer */}
                <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">
                            Showing <span className="font-bold text-gray-800">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
                            <span className="font-bold text-gray-800">{Math.min(currentPage * itemsPerPage, filteredBills.length)}</span> of{' '}
                            <span className="font-bold text-gray-800">{filteredBills.length}</span> bills
                        </span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-300"
                        >
                            <option value={10}>10 per page</option>
                            <option value={20}>20 per page</option>
                            <option value={30}>30 per page</option>
                            <option value={50}>50 per page</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ⏮️ First
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ◀️ Previous
                        </button>
                        <span className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-bold">
                            {currentPage} / {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next ▶️
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Last ⏭️
                        </button>
                    </div>
                </div>
            </div>

            {/* Receipt Modal */}
            {showReceiptModal && selectedBill && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
                            <span className="text-4xl mb-2 block">🧾</span>
                            <h2 className="text-xl font-bold text-gray-800">Bill Receipt</h2>
                            <p className="text-sm text-gray-500">#{selectedBill.receipt_no}</p>
                        </div>

                        <div className="space-y-2 text-sm mb-4">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Date:</span>
                                <span className="font-semibold">{selectedBill.sale_date} {selectedBill.sale_time?.slice(0, 5)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Customer:</span>
                                <span>{selectedBill.customer_name || 'Walk-in'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Cashier:</span>
                                <span>{selectedBill.waiter_name || selectedBill.created_by || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Table:</span>
                                <span>{selectedBill.table_name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">KOT:</span>
                                <span>{selectedBill.kot_number || 'N/A'}</span>
                            </div>
                        </div>

                        {/* Items */}
                        {selectedBill.items && selectedBill.items.length > 0 && (
                            <div className="border-t border-dashed border-gray-300 pt-4 mb-4">
                                <h4 className="font-semibold text-gray-700 mb-2">Items</h4>
                                {selectedBill.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-sm py-1">
                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                        <span className="font-medium">{item.subtotal?.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Totals */}
                        <div className="border-t border-dashed border-gray-300 pt-4 mb-4 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Subtotal:</span>
                                <span>Ksh {selectedBill.subtotal?.toLocaleString()}</span>
                            </div>
                            {selectedBill.discount > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span>Discount:</span>
                                    <span>- Ksh {selectedBill.discount?.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total:</span>
                                <span className="text-blue-600">Ksh {selectedBill.total_amount?.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Paid:</span>
                                <span className="text-green-600 font-medium">Ksh {selectedBill.amount_paid?.toLocaleString()}</span>
                            </div>
                            {(selectedBill.total_amount - selectedBill.amount_paid) > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Balance:</span>
                                    <span className="text-red-600 font-bold">Ksh {(selectedBill.total_amount - selectedBill.amount_paid)?.toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Status */}
                        <div className="text-center mb-4">
                            <span className={`px-4 py-2 rounded-full text-sm font-bold ${selectedBill.status === 'Completed' || selectedBill.status === 'Paid'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                                }`}>
                                {selectedBill.status === 'Completed' || selectedBill.status === 'Paid' ? '✅ PAID' : '⏳ PENDING'}
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowReceiptModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2">
                                <span>🖨️</span>
                                <span>Print</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
