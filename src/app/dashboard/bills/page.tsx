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
        if (isPaid) return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        if (isPending) return 'bg-amber-100 text-amber-700 border border-amber-200';
        return 'bg-gray-100 text-gray-600 border border-gray-200';
    };

    const getStatusIcon = () => {
        if (isPaid) return 'Comp';
        if (isPending) return 'Pend';
        return 'Unknown';
    };

    const getPaymentMethodBadge = () => {
        const method = bill.payment_method?.toLowerCase() || '';
        if (method.includes('mpesa') || method.includes('m-pesa')) {
            return <div className="flex flex-col"><span className="text-sm font-semibold text-gray-700">M-Pesa</span><span className="text-xs text-gray-500 font-mono tracking-wide">{bill.mpesa_code || '-'}</span></div>;
        }
        if (method.includes('cash')) {
            return <span className="text-sm font-semibold text-gray-700">Cash</span>;
        }
        return <span className="text-sm font-medium text-gray-600 capitalize">{bill.payment_method || '-'}</span>;
    };

    return (
        <>
            {/* Main Row */}
            <tr
                onClick={onToggle}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group ${isExpanded ? 'bg-blue-50/40' : 'bg-white'}`}
            >
                <td className="py-5 px-6 w-12 text-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${isExpanded
                            ? 'bg-blue-600 text-white rotate-90 shadow-md'
                            : 'bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>
                </td>
                <td className="py-5 px-6">
                    <span className="font-bold text-gray-800 text-sm tracking-tight group-hover:text-blue-600 transition-colors">
                        {bill.receipt_no}
                    </span>
                </td>
                <td className="py-5 px-6">
                    <div className="flex flex-col">
                        <span className="font-semibold text-gray-700 text-sm">
                            {new Date(bill.sale_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">
                            {bill.sale_time?.slice(0, 5) || '--:--'}
                        </span>
                    </div>
                </td>
                <td className="py-5 px-6">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                            {(bill.waiter_name || bill.created_by || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-700">{bill.waiter_name || bill.created_by || 'Unknown'}</span>
                        </div>
                    </div>
                </td>
                <td className="py-5 px-6">
                    {bill.table_name ? (
                        <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-md text-xs font-semibold border border-purple-100">
                            {bill.table_name}
                        </span>
                    ) : (
                        <span className="text-gray-300 text-sm">-</span>
                    )}
                </td>
                <td className="py-5 px-6 text-right">
                    <span className="font-bold text-gray-900 text-base tabular-nums tracking-tight">
                        {bill.total_amount?.toLocaleString()}
                    </span>
                </td>
                <td className="py-5 px-6 text-right">
                    <span className={`font-bold text-sm tabular-nums ${bill.amount_paid >= bill.total_amount ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {bill.amount_paid?.toLocaleString()}
                    </span>
                </td>
                <td className="py-5 px-6 text-right">
                    {(bill.total_amount - bill.amount_paid) > 0 ? (
                        <span className="font-bold text-red-500 text-base tabular-nums bg-red-50 px-2 py-0.5 rounded-md">
                            {(bill.total_amount - bill.amount_paid).toLocaleString()}
                        </span>
                    ) : (
                        <span className="text-gray-300 font-medium text-sm tabular-nums">0</span>
                    )}
                </td>
                <td className="py-5 px-6 text-right">
                    {isPaid ? (
                        <span className={`font-bold text-sm tabular-nums px-2 py-1 rounded-md ${(bill.profit || 0) >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            +{Math.round(bill.profit || 0).toLocaleString()}
                        </span>
                    ) : (
                        <div className="flex justify-end">
                            <div className="h-1.5 w-8 bg-gray-100 rounded-full"></div>
                        </div>
                    )}
                </td>
                <td className="py-5 px-6">
                    {getPaymentMethodBadge()}
                </td>
                <td className="py-5 px-6 text-center">
                    <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${getStatusColor()}`}>
                        {isPaid && <span className="mr-1">✓</span>}
                        {isPending && <span className="mr-1">!</span>}
                        {bill.status}
                    </span>
                </td>
                <td className="py-5 px-6">
                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewReceipt(); }}
                            className="p-2 bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 hover:text-blue-600 rounded-xl transition-all"
                            title="View Receipt"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </button>
                        {isPending && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onReceivePayment(); }}
                                className="p-2 bg-emerald-50 border border-emerald-200 shadow-sm hover:shadow-md hover:bg-emerald-100 text-emerald-600 rounded-xl transition-all"
                                title="Receive Payment"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.75m-7.5 13.5h-3A2.25 2.25 0 001.5 15H9m-9 0h1.5m0 3h-1.5m6-3v2.25" />
                                </svg>
                            </button>
                        )}
                        <button
                            className="p-2 bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 hover:text-purple-600 rounded-xl transition-all"
                            title="Print"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded Items Row */}
            {isExpanded && (
                <tr className="bg-gray-50/50">
                    <td colSpan={12} className="p-0 border-b border-gray-100">
                        <div className="py-6 px-16 bg-gray-50/50 shadow-inner">
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm max-w-5xl">
                                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                                            </svg>
                                        </div>
                                        <h4 className="font-semibold text-gray-700 text-sm">Order Items</h4>
                                    </div>
                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">KOT: {bill.kot_number || 'N/A'}</span>
                                </div>
                                {bill.items && bill.items.length > 0 ? (
                                    <table className="w-full">
                                        <thead className="bg-white border-b border-gray-100">
                                            <tr>
                                                <th className="text-left py-3 px-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Item Name</th>
                                                <th className="text-center py-3 px-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Qty</th>
                                                <th className="text-right py-3 px-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Unit Price</th>
                                                <th className="text-right py-3 px-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total</th>
                                                <th className="text-left py-3 px-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {bill.items.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="py-3 px-6 font-medium text-gray-700 text-sm">{item.product_name}</td>
                                                    <td className="py-3 px-6 text-center">
                                                        <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-xs border border-blue-100">
                                                            {item.quantity}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-6 text-right text-gray-500 text-sm tabular-nums">{item.unit_price?.toLocaleString()}</td>
                                                    <td className="py-3 px-6 text-right font-bold text-gray-800 text-sm tabular-nums">{item.subtotal?.toLocaleString()}</td>
                                                    <td className="py-3 px-6 text-xs text-gray-400 italic">{item.notes || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-8 text-center text-gray-400">
                                        <span className="text-3xl block mb-2 opacity-30">📦</span>
                                        <p className="text-sm">No items found</p>
                                    </div>
                                )}
                            </div>
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
                        <div className="inline-block animate-spin text-4xl mb-4 text-blue-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                        </div>
                        <p className="text-gray-500 font-medium">Loading bills records...</p>
                    </div>
                ) : paginatedBills.length === 0 ? (
                    <div className="p-20 text-center bg-gray-50/50">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-4xl">📄</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">No bills found</h3>
                        <p className="text-gray-500">Try adjusting your filters or search criteria</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="w-12 py-4 px-6"></th>
                                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Receipt #</th>
                                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Waiter</th>
                                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Table</th>
                                <th className="text-right py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="text-right py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Paid</th>
                                <th className="text-right py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Balance</th>
                                <th className="text-right py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Profit</th>
                                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                                <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
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
