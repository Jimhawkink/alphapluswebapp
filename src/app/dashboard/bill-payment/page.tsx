'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// Type definitions
interface SaleItem {
    item_id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes?: string;
}

interface Bill {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    waiter_name?: string;
    customer_name?: string;
    total_amount: number;
    amount_paid: number;
    status: string;
    items?: SaleItem[];
}

function BillPaymentContent() {
    const searchParams = useSearchParams();
    const preSelectedId = searchParams.get('id');

    const [bills, setBills] = useState<Bill[]>([]);
    const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('Pending');

    // Payment states
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [mpesaPhone, setMpesaPhone] = useState('254');

    // Calculate amounts
    const outstandingAmount = selectedBill ? Math.max(0, (selectedBill.total_amount || 0) - (selectedBill.amount_paid || 0)) : 0;

    // Load bills
    const loadBills = useCallback(async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('sales')
                .select(`*, sales_items (*)`)
                .order('sale_datetime', { ascending: false })
                .limit(50);

            if (filterStatus === 'Pending') {
                query = query.eq('status', 'Pending');
            }

            const { data, error } = await query;
            if (error) throw error;

            const transformedBills: Bill[] = (data || []).map(sale => ({
                ...sale,
                items: sale.sales_items || []
            }));

            setBills(transformedBills);

            if (preSelectedId && !selectedBill) {
                const bill = transformedBills.find(b => b.sale_id === parseInt(preSelectedId));
                if (bill) {
                    setSelectedBill(bill);
                    setPaymentAmount(Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)).toString());
                }
            }
        } catch (err) {
            console.error('Error loading bills:', err);
            toast.error('Failed to load bills');
        }
        setIsLoading(false);
    }, [filterStatus, preSelectedId, selectedBill]);

    useEffect(() => {
        loadBills();
    }, [loadBills]);

    // Filter bills
    const filteredBills = bills.filter(bill => {
        const query = searchQuery.toLowerCase();
        return bill.receipt_no?.toLowerCase().includes(query) ||
            bill.waiter_name?.toLowerCase().includes(query);
    });

    // Select a bill
    const selectBill = (bill: Bill) => {
        setSelectedBill(bill);
        setPaymentAmount(Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)).toString());
    };

    // Process payment
    const processPayment = async () => {
        if (!selectedBill) {
            toast.error('Please select a bill first');
            return;
        }

        const amount = parseFloat(paymentAmount) || 0;
        if (amount <= 0 || amount > outstandingAmount) {
            toast.error('Invalid payment amount');
            return;
        }

        setIsProcessing(true);
        try {
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            const newPaidAmount = (selectedBill.amount_paid || 0) + amount;
            const isFullyPaid = newPaidAmount >= selectedBill.total_amount;

            const { error } = await supabase
                .from('sales')
                .update({
                    amount_paid: newPaidAmount,
                    payment_method: paymentMethod,
                    status: isFullyPaid ? 'Completed' : 'Pending',
                    paid_at: isFullyPaid ? new Date().toISOString() : null,
                    paid_by: currentUser?.name || 'Unknown',
                    updated_at: new Date().toISOString()
                })
                .eq('sale_id', selectedBill.sale_id);

            if (error) throw error;

            toast.success(isFullyPaid ? '✅ Bill fully paid!' : '💰 Partial payment recorded');
            await loadBills();
            setSelectedBill(null);
            setPaymentAmount('');
        } catch (err) {
            console.error('Error:', err);
            toast.error('Payment failed');
        }
        setIsProcessing(false);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white">💰</span>
                        Bill Payment
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Receive payments for pending orders</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadBills} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors">
                        🔄 Refresh
                    </button>
                    <a href="/dashboard/bills" className="px-4 py-2 bg-gray-50 text-gray-600 rounded-lg font-medium hover:bg-gray-100 transition-colors">
                        📋 All Bills
                    </a>
                </div>
            </div>

            {/* Main Layout - 2 Column */}
            <div className="grid grid-cols-5 gap-6">
                {/* Left: Bills List */}
                <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Search & Filter */}
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="🔍 Search receipt or waiter..."
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                        />
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => setFilterStatus('Pending')}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'Pending' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                            >
                                ⏳ Pending
                            </button>
                            <button
                                onClick={() => setFilterStatus('All')}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'All' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                            >
                                📋 All
                            </button>
                        </div>
                    </div>

                    {/* Bills List */}
                    <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
                        {isLoading ? (
                            <div className="p-8 text-center text-gray-400">
                                <span className="animate-spin inline-block text-2xl">🔄</span>
                                <p className="mt-2">Loading...</p>
                            </div>
                        ) : filteredBills.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <span className="text-4xl">📭</span>
                                <p className="mt-2">No bills found</p>
                            </div>
                        ) : (
                            filteredBills.map(bill => (
                                <div
                                    key={bill.sale_id}
                                    onClick={() => selectBill(bill)}
                                    className={`p-4 cursor-pointer transition-all hover:bg-blue-50 ${selectedBill?.sale_id === bill.sale_id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-gray-800">{bill.receipt_no}</p>
                                            <p className="text-xs text-gray-500">{bill.waiter_name || 'Walk-in'} • {new Date(bill.sale_date).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-gray-800">Ksh {bill.total_amount?.toLocaleString()}</p>
                                            <p className={`text-xs font-medium ${bill.status === 'Pending' ? 'text-amber-600' : 'text-green-600'}`}>
                                                {bill.status === 'Pending' ? '⏳ Pending' : '✅ Paid'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Payment Panel */}
                <div className="col-span-3 space-y-4">
                    {/* Selected Bill Details */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">🧾</span>
                            Bill Details
                        </h3>

                        {selectedBill ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <p className="text-xs text-gray-500 mb-1">Receipt</p>
                                        <p className="font-bold text-gray-800">{selectedBill.receipt_no}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <p className="text-xs text-gray-500 mb-1">Waiter</p>
                                        <p className="font-bold text-gray-800">{selectedBill.waiter_name || 'N/A'}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <p className="text-xs text-gray-500 mb-1">Date</p>
                                        <p className="font-bold text-gray-800">{new Date(selectedBill.sale_date).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                {/* Order Items */}
                                <div className="border rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b">
                                        <p className="text-sm font-semibold text-gray-600">Order Items</p>
                                    </div>
                                    <div className="divide-y max-h-40 overflow-y-auto">
                                        {selectedBill.items?.map((item, idx) => (
                                            <div key={idx} className="px-4 py-2 flex justify-between text-sm">
                                                <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                                <span className="font-medium">{item.subtotal?.toLocaleString()}</span>
                                            </div>
                                        )) || <p className="p-4 text-gray-400 text-sm">No items</p>}
                                    </div>
                                </div>

                                {/* Totals */}
                                <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Bill Total</span>
                                        <span className="font-bold text-lg">Ksh {selectedBill.total_amount?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Paid</span>
                                        <span className="font-bold text-green-600">Ksh {selectedBill.amount_paid?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-2">
                                        <span className="text-red-600 font-medium">Balance Due</span>
                                        <span className="font-bold text-xl text-red-600">Ksh {outstandingAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <span className="text-5xl block mb-3">👈</span>
                                <p>Select a bill from the list</p>
                            </div>
                        )}
                    </div>

                    {/* Payment Form */}
                    {selectedBill && outstandingAmount > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600">💳</span>
                                Process Payment
                            </h3>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 block mb-2">Payment Method</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
                                    >
                                        <option value="Cash">💵 Cash</option>
                                        <option value="M-Pesa">📱 M-Pesa</option>
                                        <option value="Card">💳 Card</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 block mb-2">Amount (Ksh)</label>
                                    <input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        placeholder={outstandingAmount.toString()}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 font-bold text-lg"
                                    />
                                </div>
                            </div>

                            {paymentMethod === 'M-Pesa' && (
                                <div className="mb-4">
                                    <label className="text-sm font-medium text-gray-600 block mb-2">M-Pesa Phone</label>
                                    <input
                                        type="text"
                                        value={mpesaPhone}
                                        onChange={(e) => setMpesaPhone(e.target.value)}
                                        placeholder="254XXXXXXXXX"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => { setPaymentAmount(outstandingAmount.toString()); }}
                                    className="py-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors"
                                >
                                    💯 Full Amount
                                </button>
                                <button
                                    onClick={processPayment}
                                    disabled={isProcessing}
                                    className="py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
                                >
                                    {isProcessing ? '⏳ Processing...' : '✅ Confirm Payment'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function BillPaymentPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><span className="animate-spin text-4xl">🔄</span></div>}>
            <BillPaymentContent />
        </Suspense>
    );
}
