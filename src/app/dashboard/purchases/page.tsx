'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Purchase {
    purchase_id: number;
    purchase_no: string;
    purchase_date: string;
    supplier_id: number;
    supplier_name: string;
    supplier_invoice: string;
    sub_total: number;
    discount: number;
    vat: number;
    grand_total: number;
    status: string;
    payment_status: string;
    created_by: string;
    created_at: string;
}

interface PurchaseItem {
    pp_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    quantity: number;
    unit: string;
    rate: number;
    total_amount: number;
}

export default function PurchasesPage() {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // View Modal
    const [showViewModal, setShowViewModal] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalPurchases: 0,
        totalAmount: 0,
        paidCount: 0,
        pendingCount: 0
    });

    const loadPurchases = useCallback(async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('purchases')
                .select('*')
                .order('purchase_id', { ascending: false });

            if (dateFrom) {
                query = query.gte('purchase_date', dateFrom);
            }
            if (dateTo) {
                query = query.lte('purchase_date', dateTo);
            }

            const { data, error } = await query;

            if (error) throw error;
            setPurchases(data || []);

            // Calculate stats
            const purchasesData = data || [];
            setStats({
                totalPurchases: purchasesData.length,
                totalAmount: purchasesData.reduce((sum, p) => sum + (p.grand_total || 0), 0),
                paidCount: purchasesData.filter(p => p.payment_status === 'Paid').length,
                pendingCount: purchasesData.filter(p => p.payment_status !== 'Paid').length
            });
        } catch (err) {
            console.error('Error loading purchases:', err);
            toast.error('Failed to load purchases');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadPurchases();
    }, [loadPurchases]);

    const viewPurchaseDetails = async (purchase: Purchase) => {
        setSelectedPurchase(purchase);
        setShowViewModal(true);
        setIsLoadingItems(true);

        try {
            const { data, error } = await supabase
                .from('purchase_products')
                .select('*')
                .eq('purchase_id', purchase.purchase_id);

            if (error) throw error;
            setPurchaseItems(data || []);
        } catch (err) {
            console.error('Error loading purchase items:', err);
            toast.error('Failed to load purchase items');
        }
        setIsLoadingItems(false);
    };

    const deletePurchase = async (purchase: Purchase) => {
        if (!confirm(`Delete purchase ${purchase.purchase_no}? This will also delete all items.`)) return;

        try {
            const { error } = await supabase
                .from('purchases')
                .delete()
                .eq('purchase_id', purchase.purchase_id);

            if (error) throw error;
            toast.success('Purchase deleted');
            loadPurchases();
        } catch (err) {
            console.error('Error deleting purchase:', err);
            toast.error('Failed to delete purchase');
        }
    };

    const filteredPurchases = purchases.filter(p =>
        p.purchase_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📋</span>
                        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Purchase Records
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-1">View and manage all purchase entries</p>
                </div>
                <div className="flex gap-3">
                    <a
                        href="/dashboard/purchase"
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                    >
                        <span>➕</span> New Purchase
                    </a>
                    <button
                        onClick={loadPurchases}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                    >
                        <span>🔄</span> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">📋</span>
                        <span className="font-medium opacity-90">Total Purchases</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalPurchases}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">💰</span>
                        <span className="font-medium opacity-90">Total Amount</span>
                    </div>
                    <p className="text-3xl font-bold">Ksh {stats.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">✅</span>
                        <span className="font-medium opacity-90">Paid</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.paidCount}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">⏳</span>
                        <span className="font-medium opacity-90">Pending</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.pendingCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="grid grid-cols-5 gap-4">
                    <div className="col-span-2">
                        <label className="text-xs font-medium text-gray-500 mb-1 block">🔍 Search</label>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by invoice or supplier..."
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 From Date</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">📅 To Date</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={loadPurchases}
                            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                        >
                            🔍 Apply
                        </button>
                    </div>
                </div>
            </div>

            {/* Purchases Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="p-16 text-center">
                            <div className="inline-block animate-spin text-5xl mb-4">🔄</div>
                            <p className="text-gray-500">Loading purchases...</p>
                        </div>
                    ) : filteredPurchases.length === 0 ? (
                        <div className="p-16 text-center">
                            <span className="text-6xl block mb-4">📭</span>
                            <p className="text-gray-500 text-lg">No purchases found</p>
                            <a
                                href="/dashboard/purchase"
                                className="mt-4 inline-block px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600"
                            >
                                ➕ Create First Purchase
                            </a>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                                <tr>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Invoice #</th>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Date</th>
                                    <th className="text-left py-4 px-4 text-xs font-bold text-gray-600 uppercase">Supplier</th>
                                    <th className="text-right py-4 px-4 text-xs font-bold text-gray-600 uppercase">Amount</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-gray-600 uppercase">Status</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-gray-600 uppercase">Payment</th>
                                    <th className="text-center py-4 px-4 text-xs font-bold text-gray-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPurchases.map((purchase) => (
                                    <tr key={purchase.purchase_id} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-semibold">
                                                {purchase.purchase_no}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-700">
                                            {new Date(purchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="font-medium text-gray-800">{purchase.supplier_name || 'N/A'}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-green-600">
                                            Ksh {(purchase.grand_total || 0).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${purchase.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                    purchase.status === 'Pending' ? 'bg-orange-100 text-orange-700' :
                                                        'bg-gray-100 text-gray-700'
                                                }`}>
                                                {purchase.status || 'Pending'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${purchase.payment_status === 'Paid' ? 'bg-cyan-100 text-cyan-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                {purchase.payment_status || 'Unpaid'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => viewPurchaseDetails(purchase)}
                                                    className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"
                                                    title="View Details"
                                                >
                                                    👁️
                                                </button>
                                                <button
                                                    onClick={() => deletePurchase(purchase)}
                                                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* View Purchase Modal */}
            {showViewModal && selectedPurchase && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    📋 Purchase Details - {selectedPurchase.purchase_no}
                                </h2>
                                <button
                                    onClick={() => setShowViewModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Purchase Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-sm text-gray-500">Invoice No</p>
                                    <p className="font-bold text-gray-800">{selectedPurchase.purchase_no}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-sm text-gray-500">Date</p>
                                    <p className="font-bold text-gray-800">
                                        {new Date(selectedPurchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-sm text-gray-500">Supplier</p>
                                    <p className="font-bold text-gray-800">{selectedPurchase.supplier_name || 'N/A'}</p>
                                </div>
                                <div className="p-4 bg-green-50 rounded-xl">
                                    <p className="text-sm text-green-600">Grand Total</p>
                                    <p className="font-bold text-2xl text-green-700">Ksh {selectedPurchase.grand_total.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Items */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <span>📦</span> Purchase Items
                                </h3>
                                {isLoadingItems ? (
                                    <div className="text-center py-8 text-gray-400">Loading items...</div>
                                ) : purchaseItems.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">No items found</div>
                                ) : (
                                    <table className="w-full">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">#</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Code</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Item</th>
                                                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-600">Qty</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Rate</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {purchaseItems.map((item, idx) => (
                                                <tr key={item.pp_id} className="border-t border-gray-100">
                                                    <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                                                    <td className="py-3 px-4 font-mono text-sm text-gray-600">{item.product_code}</td>
                                                    <td className="py-3 px-4 font-medium text-gray-800">{item.product_name}</td>
                                                    <td className="py-3 px-4 text-center">{item.quantity} {item.unit}</td>
                                                    <td className="py-3 px-4 text-right">Ksh {item.rate?.toLocaleString()}</td>
                                                    <td className="py-3 px-4 text-right font-bold text-green-600">Ksh {item.total_amount?.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setShowViewModal(false)}
                                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg"
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
