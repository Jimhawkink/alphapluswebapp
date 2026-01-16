'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, c2bSupabase } from '@/lib/supabase'; // Import both clients
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
    payment_method: string;
    amount_paid: number;
    change_amount: number;
    mpesa_code?: string;
    status: string;
    notes?: string;
    created_by?: string;
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
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterStatus, setFilterStatus] = useState('Pending');
    const [filterUser, setFilterUser] = useState('All');

    // Payment states
    const [paymentMode, setPaymentMode] = useState<'STK_PUSH' | 'CALLBACK'>('STK_PUSH');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [paymentAmount, setPaymentAmount] = useState('0');
    const [customerName, setCustomerName] = useState('');
    const [mpesaPhone, setMpesaPhone] = useState('254');
    const [mpesaStatus, setMpesaStatus] = useState('Ready');
    const [mpesaStatusColor, setMpesaStatusColor] = useState('bg-green-500');
    const [mpesaReceipt, setMpesaReceipt] = useState('');

    // C2B Payments State (flexible schema from Energy App)
    interface C2BPayment {
        id: number;
        is_linked: boolean;
        created_at?: string;
        [key: string]: any; // Allow any additional fields from Energy App
    }
    const [c2bPayments, setC2bPayments] = useState<C2BPayment[]>([]);
    const [selectedC2B, setSelectedC2B] = useState<C2BPayment | null>(null);
    const [loadingC2B, setLoadingC2B] = useState(false);


    // Split payment states
    interface SplitPayment {
        method: string;
        amount: number;
        mpesaCode?: string;
    }
    const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([]);

    // Dropdown data
    const [users, setUsers] = useState<string[]>([]);

    // Stats
    const [stats, setStats] = useState({
        totalPending: 0,
        totalPendingAmount: 0,
        totalPaid: 0,
        totalPaidAmount: 0
    });

    // Calculate outstanding amount
    const outstandingAmount = selectedBill ? Math.max(0, (selectedBill.total_amount || 0) - (selectedBill.amount_paid || 0)) : 0;
    const paidAmount = selectedBill?.amount_paid || 0;

    // Load pending bills
    const loadBills = useCallback(async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('sales')
                .select(`*, sales_items (*)`)
                .order('sale_datetime', { ascending: false });

            // Apply filters
            if (filterStatus !== 'All') {
                if (filterStatus === 'Pending') {
                    query = query.eq('status', 'Pending');
                } else if (filterStatus === 'Paid') {
                    query = query.or('status.eq.Completed,status.eq.Paid');
                }
            }
            if (dateFrom) query = query.gte('sale_date', dateFrom);
            if (dateTo) query = query.lte('sale_date', dateTo);
            if (filterUser !== 'All') {
                query = query.or(`waiter_name.eq.${filterUser},created_by.eq.${filterUser}`);
            }

            const { data, error } = await query;

            if (error) throw error;

            const transformedBills: Bill[] = (data || []).map(sale => ({
                ...sale,
                items: sale.sales_items || []
            }));

            setBills(transformedBills);

            // Extract unique users
            const uniqueUsers: string[] = Array.from(new Set([
                ...transformedBills.map(b => b.waiter_name),
                ...transformedBills.map(b => b.created_by)
            ].filter((u): u is string => Boolean(u))));
            setUsers(uniqueUsers);

            // Calculate stats
            const pendingBills = transformedBills.filter(b => b.status === 'Pending');
            const paidBills = transformedBills.filter(b => b.status === 'Completed' || b.status === 'Paid');

            setStats({
                totalPending: pendingBills.length,
                totalPendingAmount: pendingBills.reduce((sum, b) => sum + (b.total_amount || 0) - (b.amount_paid || 0), 0),
                totalPaid: paidBills.length,
                totalPaidAmount: paidBills.reduce((sum, b) => sum + (b.total_amount || 0), 0)
            });

            // Pre-select bill if ID provided
            if (preSelectedId) {
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
    }, [filterStatus, dateFrom, dateTo, filterUser, preSelectedId]);

    useEffect(() => {
        loadBills();
        loadC2BPayments(); // Auto-load C2B payments on mount
    }, [loadBills]);

    // Load unlinked C2B payments
    const loadC2BPayments = async () => {
        setLoadingC2B(true);
        try {
            const { data, error } = await c2bSupabase // Use Energy App Supabase for C2B
                .from('c2b_transactions')
                .select('*')
                .eq('is_linked', false)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.error('C2B query error:', error);
                toast.error(`Failed to load C2B payments: ${error.message}`);
                setC2bPayments([]);
            } else {
                console.log('✅ C2B Data loaded:', data);
                console.log('📋 First record columns:', data?.[0] ? Object.keys(data[0]) : 'No data');
                setC2bPayments(data || []);
                toast.success(`Loaded ${data?.length || 0} unlinked C2B payments`);
            }
        } catch (err: any) {
            console.error('Error loading C2B payments:', err);
            toast.error(`Error: ${err.message || 'Unknown error'}`);
            setC2bPayments([]);
        } finally {
            setLoadingC2B(false);
        }
    };

    // Select C2B payment (handles Energy App schema)
    const selectC2BPayment = (payment: C2BPayment) => {
        setSelectedC2B(payment);
        // Energy App uses: mpesa_receipt, phone, amount, customer_name
        const receipt = payment.mpesa_receipt || payment.id;
        const amount = payment.amount || 0;
        setMpesaReceipt(String(receipt));
        setPaymentAmount(String(amount));
        setPaymentMethod('M-Pesa');
    };


    // Filter bills by search
    const filteredBills = bills.filter(bill => {
        const query = searchQuery.toLowerCase();
        return (
            bill.receipt_no?.toLowerCase().includes(query) ||
            bill.customer_name?.toLowerCase().includes(query) ||
            bill.waiter_name?.toLowerCase().includes(query) ||
            bill.mpesa_code?.toLowerCase().includes(query)
        );
    });

    // Select a bill
    const selectBill = (bill: Bill) => {
        setSelectedBill(bill);
        setPaymentAmount(Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)).toString());
        setMpesaPhone('254');
        setMpesaStatus('Ready');
        setMpesaStatusColor('bg-green-500');
        setSplitPayments([]);
    };

    // Calculate split payment totals
    const splitPaymentTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0);
    const remainingAfterSplit = outstandingAmount - splitPaymentTotal;

    // Add split payment
    const addSplitPayment = () => {
        const amount = parseFloat(paymentAmount) || 0;
        if (amount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        if (amount > remainingAfterSplit) {
            toast.error(`Amount exceeds remaining balance of Ksh ${remainingAfterSplit.toLocaleString()}`);
            return;
        }

        setSplitPayments([...splitPayments, {
            method: paymentMethod,
            amount: amount,
            mpesaCode: paymentMethod === 'M-Pesa' ? mpesaPhone : undefined
        }]);
        setPaymentAmount('0');
        toast.success(`Added ${paymentMethod} payment of Ksh ${amount.toLocaleString()}`);
    };

    // Remove split payment
    const removeSplitPayment = (index: number) => {
        setSplitPayments(splitPayments.filter((_, i) => i !== index));
    };

    // Clear all split payments
    const clearSplitPayments = () => {
        setSplitPayments([]);
        setPaymentAmount(outstandingAmount.toString());
    };

    // Process payment using database function or direct update
    const processPayment = async (isFullPayment: boolean = false) => {
        if (!selectedBill) {
            toast.error('Please select a bill first');
            return;
        }

        // If we have split payments, process those instead
        const paymentsToProcess = splitPayments.length > 0 ? splitPayments :
            [{ method: paymentMethod, amount: isFullPayment ? outstandingAmount : (parseFloat(paymentAmount) || 0) }];

        const totalPaymentAmount = paymentsToProcess.reduce((sum, p) => sum + p.amount, 0);

        if (totalPaymentAmount <= 0) {
            toast.error('Please enter a valid payment amount or add split payments');
            return;
        }

        if (totalPaymentAmount > outstandingAmount) {
            toast.error('Total payment amount cannot exceed outstanding balance');
            return;
        }

        setIsProcessing(true);

        try {
            // Get current user from localStorage
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            let newPaidAmount = selectedBill.amount_paid || 0;
            const paymentMethodNames: string[] = [];

            // Process each payment
            for (const payment of paymentsToProcess) {
                newPaidAmount += payment.amount;
                paymentMethodNames.push(payment.method);

                const isLastPayment = payment === paymentsToProcess[paymentsToProcess.length - 1];
                const isFullyPaid = newPaidAmount >= selectedBill.total_amount;
                const balanceBefore = selectedBill.total_amount - (newPaidAmount - payment.amount);
                const balanceAfter = selectedBill.total_amount - newPaidAmount;

                // Insert into bill_payments table
                const { error: paymentError } = await supabase
                    .from('bill_payments')
                    .insert({
                        sale_id: selectedBill.sale_id,
                        receipt_no: selectedBill.receipt_no,
                        amount_due: selectedBill.total_amount,
                        amount_paid: payment.amount,
                        balance_before: balanceBefore,
                        balance_after: balanceAfter,
                        payment_method: payment.method,
                        mpesa_code: payment.method === 'M-Pesa' ? (payment as { mpesaCode?: string }).mpesaCode : null,
                        mpesa_phone: payment.method === 'M-Pesa' ? (payment as { mpesaCode?: string }).mpesaCode : null,
                        is_partial: !isFullyPaid,
                        received_by_id: currentUser?.userId || null,
                        received_by_name: currentUser?.name || 'Unknown',
                        shift_id: selectedBill.shift_id,
                        shift_name: selectedBill.shift_name,
                        payment_note: `Split Payment via ${payment.method}`
                    });

                if (paymentError) {
                    console.log('bill_payments insert:', paymentError.message);
                }

                // Update sale record only for the last payment
                if (isLastPayment) {
                    const newChange = Math.max(0, newPaidAmount - selectedBill.total_amount);
                    const combinedMethod = paymentMethodNames.length > 1
                        ? `Split (${paymentMethodNames.join(' + ')})`
                        : paymentMethodNames[0];

                    const { error: updateError } = await supabase
                        .from('sales')
                        .update({
                            amount_paid: newPaidAmount,
                            change_amount: newChange,
                            payment_method: combinedMethod,
                            mpesa_code: selectedC2B?.mpesa_receipt || null, // Save M-Pesa receipt from C2B
                            status: isFullyPaid ? 'Completed' : 'Pending',
                            paid_at: isFullyPaid ? new Date().toISOString() : null,
                            paid_by: isFullyPaid ? (currentUser?.name || 'Unknown') : null,
                            last_payment_at: new Date().toISOString(),
                            last_payment_method: payment.method,
                            partial_payment_count: (selectedBill as unknown as { partial_payment_count?: number }).partial_payment_count ?
                                ((selectedBill as unknown as { partial_payment_count: number }).partial_payment_count + paymentsToProcess.length) : paymentsToProcess.length,
                            updated_at: new Date().toISOString()
                        })
                        .eq('sale_id', selectedBill.sale_id);

                    if (updateError) throw updateError;
                }
            }

            const isFullyPaid = newPaidAmount >= selectedBill.total_amount;
            toast.success(
                isFullyPaid
                    ? `✅ Payment complete! Bill ${selectedBill.receipt_no} is now PAID`
                    : `💰 Payment of Ksh ${totalPaymentAmount.toLocaleString()} received (${paymentsToProcess.length} payment${paymentsToProcess.length > 1 ? 's' : ''})`
            );

            // Mark C2B payment as linked if one was selected
            console.log('🔍 Checking C2B linking:', { selectedC2B: selectedC2B?.id, paymentMethod, mpesaReceipt });
            if (selectedC2B) {
                console.log('🔗 Attempting to mark C2B as linked...');
                try {
                    const { error: linkError } = await c2bSupabase
                        .from('c2b_transactions')
                        .update({
                            is_linked: true
                            // Energy App table only has is_linked column
                        })
                        .eq('id', selectedC2B.id);

                    if (linkError) {
                        console.error('❌ Failed to mark C2B as linked:', linkError);
                    } else {
                        console.log('✅ C2B payment marked as linked:', selectedC2B.id);
                        // Remove from local state
                        setC2bPayments(prev => prev.filter(p => p.id !== selectedC2B.id));
                        setSelectedC2B(null);
                    }
                } catch (linkErr) {
                    console.error('❌ C2B link update error:', linkErr);
                }
            } else {
                console.log('⚠️ No C2B selected, skipping link update');
            }

            // Reload bills and reset
            await loadBills();
            setSelectedBill(null);
            setPaymentAmount('0');
            setSplitPayments([]);

        } catch (err) {
            console.error('Error processing payment:', err);
            toast.error('Failed to process payment');
        }

        setIsProcessing(false);
    };

    // M-Pesa STK Push
    const initiateMpesaPayment = async () => {
        if (!selectedBill) {
            toast.error('Please select a bill first');
            return;
        }

        if (mpesaPhone.length < 12 || mpesaPhone === '254') {
            toast.error('Please enter a valid M-Pesa phone number');
            return;
        }

        setMpesaStatus('Sending STK Push...');
        setMpesaStatusColor('bg-amber-500');
        setIsProcessing(true);

        try {
            // Call M-Pesa API (you would implement this in your API route)
            const response = await fetch('/api/mpesa/stkpush', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: mpesaPhone,
                    amount: outstandingAmount,
                    reference: selectedBill.receipt_no,
                    description: `Bill Payment - ${selectedBill.receipt_no}`
                })
            });

            if (response.ok) {
                setMpesaStatus('Waiting for PIN entry...');
                setMpesaStatusColor('bg-blue-500');
                toast.success('📱 STK Push sent! Please enter your M-Pesa PIN');

                // Start polling for payment status
                // In production, you would poll an endpoint to check if payment completed
            } else {
                throw new Error('Failed to initiate M-Pesa payment');
            }
        } catch {
            setMpesaStatus('Failed - Try Again');
            setMpesaStatusColor('bg-red-500');
            toast.error('Failed to send M-Pesa STK Push');
        }

        setIsProcessing(false);
    };

    // Pay full balance
    const payFullBalance = () => {
        setPaymentAmount(outstandingAmount.toString());
        processPayment(true);
    };

    // Get status badge color
    const getStatusBadge = (status: string) => {
        if (status === 'Completed' || status === 'Paid') {
            return 'bg-green-100 text-green-700 border-green-200';
        }
        if (status === 'Pending') {
            return 'bg-amber-100 text-amber-700 border-amber-200';
        }
        return 'bg-gray-100 text-gray-600 border-gray-200';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">💰</span>
                        <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                            Bill Payment
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-1">Receive payments for pending bills</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={loadBills}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:shadow-md transition-all"
                    >
                        <span>🔄</span>
                        <span className="font-medium text-blue-700">Refresh</span>
                    </button>
                    <a
                        href="/dashboard/bills"
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl hover:shadow-md transition-all"
                    >
                        <span>📋</span>
                        <span className="font-medium text-purple-700">View All Bills</span>
                    </a>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-500/30">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">⏳</span>
                        <span className="font-medium opacity-90">Pending Bills</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalPending}</p>
                    <p className="text-sm opacity-80 mt-1">Ksh {stats.totalPendingAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 rounded-2xl p-5 text-white shadow-lg shadow-green-500/30">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">✅</span>
                        <span className="font-medium opacity-90">Paid Bills</span>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalPaid}</p>
                    <p className="text-sm opacity-80 mt-1">Ksh {stats.totalPaidAmount.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                            <span className="text-2xl">🧾</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600">Selected Bill</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{selectedBill?.receipt_no || '-'}</p>
                    <p className="text-sm text-gray-500">{selectedBill?.customer_name || 'No bill selected'}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center">
                            <span className="text-2xl">💳</span>
                        </div>
                        <span className="text-sm font-medium text-red-600">Outstanding</span>
                    </div>
                    <p className="text-xl font-bold text-red-600">Ksh {outstandingAmount.toLocaleString()}</p>
                </div>
            </div>

            {/* Main Content - 3 Column Layout */}
            <div className="grid grid-cols-12 gap-6">
                {/* Bills List - Left Panel */}
                <div className="col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Filters */}
                    <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xl">🔍</span>
                            <h3 className="font-semibold text-gray-700">Find Bills</h3>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search receipt, customer, M-Pesa code..."
                                className="w-full px-4 py-2.5 bg-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                    placeholder="From"
                                />
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                    placeholder="To"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                >
                                    <option value="All">All Status</option>
                                    <option value="Pending">⏳ Pending</option>
                                    <option value="Paid">✅ Paid</option>
                                </select>
                                <select
                                    value={filterUser}
                                    onChange={(e) => setFilterUser(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
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
                    <div className="max-h-[500px] overflow-y-auto">
                        {isLoading ? (
                            <div className="p-8 text-center">
                                <div className="inline-block animate-spin text-4xl mb-3">🔄</div>
                                <p className="text-gray-500">Loading bills...</p>
                            </div>
                        ) : filteredBills.length === 0 ? (
                            <div className="p-8 text-center">
                                <span className="text-5xl block mb-3">📭</span>
                                <p className="text-gray-500">No bills found</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-500">Receipt</th>
                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-500">Date</th>
                                        <th className="text-left py-3 px-4 text-xs font-bold text-gray-500">M-Pesa Code</th>
                                        <th className="text-right py-3 px-4 text-xs font-bold text-gray-500">Total</th>
                                        <th className="text-right py-3 px-4 text-xs font-bold text-gray-500">Balance</th>
                                        <th className="text-center py-3 px-4 text-xs font-bold text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredBills.map(bill => (
                                        <tr
                                            key={bill.sale_id}
                                            onClick={() => selectBill(bill)}
                                            className={`border-t border-gray-50 cursor-pointer transition-all ${selectedBill?.sale_id === bill.sale_id
                                                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                                : 'hover:bg-gray-50'
                                                }`}
                                        >
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-bold">
                                                    {bill.receipt_no}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600">
                                                {new Date(bill.sale_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                            </td>
                                            <td className="py-3 px-4 text-sm">
                                                {bill.mpesa_code ? (
                                                    <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-mono">
                                                        {bill.mpesa_code}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right font-semibold text-gray-800">
                                                {bill.total_amount?.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-red-600">
                                                {Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusBadge(bill.status)}`}>
                                                    {bill.status === 'Completed' || bill.status === 'Paid' ? '✅' : '⏳'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Payment Panel - Middle */}
                <div className="col-span-4 space-y-4">
                    {/* Bill Details Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-5 py-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <span>🧾</span> Bill Details
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            {selectedBill ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-gray-500">Receipt No.</label>
                                            <p className="font-bold text-gray-800 text-lg">{selectedBill.receipt_no}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-500">Customer</label>
                                            <p className="font-semibold text-gray-700">{selectedBill.customer_name || 'Walk-in Customer'}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-gray-500">Date</label>
                                            <p className="text-gray-700">{selectedBill.sale_date}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-500">Status</label>
                                            <p className={`font-bold ${selectedBill.status === 'Pending' ? 'text-amber-600' : 'text-green-600'}`}>
                                                {selectedBill.status === 'Pending' ? '⏳ Not Paid' : '✅ Paid'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="border-t border-gray-100 pt-4 space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">💵 Bill Total:</span>
                                            <span className="font-bold text-gray-800 text-lg">Ksh {selectedBill.total_amount?.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">✅ Paid Total:</span>
                                            <span className="font-bold text-green-600">Ksh {paidAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between bg-gradient-to-r from-red-50 to-orange-50 p-3 rounded-xl">
                                            <span className="text-red-700 font-medium">💸 Balance:</span>
                                            <span className="font-bold text-red-600 text-xl">Ksh {outstandingAmount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8 text-gray-400">
                                    <span className="text-5xl block mb-3">👆</span>
                                    <p>Select a bill from the list</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payment Method Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-5 py-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <span>💳</span> Payment Method
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Payment Mode Toggle */}
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-2 block">📲 Payment Mode</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPaymentMode('STK_PUSH')}
                                        className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${paymentMode === 'STK_PUSH'
                                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        <span>📲</span> STK Push
                                    </button>
                                    <button
                                        onClick={() => setPaymentMode('CALLBACK')}
                                        className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${paymentMode === 'CALLBACK'
                                            ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        <span>📥</span> Callback
                                    </button>
                                </div>
                            </div>

                            {/* Customer Name */}
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-2 block">
                                    👤 Customer Name {paymentMode === 'CALLBACK' ? '(Required)' : ''}
                                </label>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Enter customer name"
                                    className="w-full px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-300"
                                    disabled={!selectedBill}
                                />
                            </div>

                            {paymentMode === 'STK_PUSH' && (
                                <>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-green-300 font-medium"
                                        disabled={!selectedBill || outstandingAmount <= 0}
                                    >
                                        <option value="Cash">💵 Cash</option>
                                        <option value="M-Pesa">📱 M-Pesa</option>
                                        <option value="Card">💳 Card</option>
                                        <option value="Bank Transfer">🏦 Bank Transfer</option>
                                    </select>

                                    <div>
                                        <label className="text-sm font-medium text-gray-600 mb-2 block">💰 Pay Amount</label>
                                        <input
                                            type="number"
                                            value={paymentAmount}
                                            onChange={(e) => setPaymentAmount(e.target.value)}
                                            className="w-full px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-100 rounded-xl focus:outline-none focus:border-green-400 font-bold text-xl text-center"
                                            placeholder="0.00"
                                            disabled={!selectedBill || outstandingAmount <= 0}
                                        />
                                    </div>

                                    {/* M-Pesa Panel */}
                                    {paymentMethod === 'M-Pesa' && selectedBill && outstandingAmount > 0 && (
                                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 space-y-3">
                                            <h4 className="font-bold text-green-700 flex items-center gap-2">
                                                <span>📱</span> M-Pesa STK Push
                                            </h4>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={mpesaPhone}
                                                    onChange={(e) => setMpesaPhone(e.target.value)}
                                                    placeholder="2547XXXXXXXX"
                                                    className="flex-1 px-4 py-3 bg-white border-2 border-green-200 rounded-xl focus:outline-none focus:border-green-400 font-medium"
                                                />
                                                <button
                                                    onClick={initiateMpesaPayment}
                                                    disabled={isProcessing}
                                                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg disabled:opacity-50"
                                                >
                                                    📤 Send
                                                </button>
                                            </div>
                                            <div className={`${mpesaStatusColor} text-white px-4 py-2 rounded-lg text-center font-medium`}>
                                                M-Pesa Status: {mpesaStatus}
                                            </div>
                                            {mpesaReceipt && (
                                                <div className="bg-white p-3 rounded-lg border border-green-300 flex justify-between items-center">
                                                    <span className="text-gray-600 text-sm">Receipt:</span>
                                                    <span className="font-bold text-green-600">{mpesaReceipt}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Callback Mode Panel with C2B DataGrid */}
                            {paymentMode === 'CALLBACK' && selectedBill && outstandingAmount > 0 && (
                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-xl border-2 border-amber-200 space-y-4">
                                    <div className="flex items-center gap-3 text-amber-700">
                                        <span className="text-3xl">📥</span>
                                        <div>
                                            <h4 className="font-bold">C2B Payment Linking</h4>
                                            <p className="text-sm opacity-80">Select unlinked payment to link</p>
                                        </div>
                                    </div>

                                    {/* Till & Amount Row */}
                                    <div className="flex gap-3">
                                        <div className="flex-1 bg-white rounded-xl p-3 text-center">
                                            <p className="text-gray-500 text-xs">Till Number</p>
                                            <p className="text-xl font-bold text-gray-800">9830453</p>
                                        </div>
                                        <div className="flex-1 bg-white rounded-xl p-3 text-center">
                                            <p className="text-gray-500 text-xs">Balance Due</p>
                                            <p className="text-xl font-bold text-green-600">Ksh {outstandingAmount.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* C2B DataGrid */}
                                    <div className="bg-white rounded-xl p-4">
                                        <div className="flex justify-between items-center mb-3">
                                            <h5 className="text-amber-700 font-bold text-sm">📥 Unlinked Payments</h5>
                                            <button
                                                onClick={loadC2BPayments}
                                                className="text-xl hover:scale-110 transition-transform"
                                            >
                                                {loadingC2B ? '⏳' : '🔄'}
                                            </button>
                                        </div>

                                        {loadingC2B ? (
                                            <div className="flex justify-center py-6">
                                                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : c2bPayments.length === 0 ? (
                                            <div className="text-center py-6">
                                                <p className="text-gray-400 mb-3">No unlinked payments found</p>
                                                <button
                                                    onClick={loadC2BPayments}
                                                    className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-600"
                                                >
                                                    Load Payments
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="max-h-[32rem] overflow-y-auto space-y-2">{/* Increased to 512px for better visibility */}
                                                {c2bPayments.map(payment => (
                                                    <div
                                                        key={payment.id}
                                                        onClick={() => selectC2BPayment(payment)}
                                                        className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-all border-2 ${selectedC2B?.id === payment.id
                                                            ? 'bg-green-50 border-green-500'
                                                            : 'bg-gray-50 border-transparent hover:bg-amber-50'
                                                            }`}
                                                    >
                                                        <div>
                                                            <p className="font-bold text-gray-800">
                                                                {payment.mpesa_receipt || payment.id}
                                                            </p>
                                                            <p className="text-gray-500 text-xs">
                                                                {payment.customer_name || 'Customer'} • Ksh {payment.amount?.toLocaleString() || 0}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-bold text-green-600">
                                                                Ksh {(payment.amount || 0).toLocaleString()}
                                                            </p>
                                                            {selectedC2B?.id === payment.id && (
                                                                <p className="text-green-600 text-xs font-bold">✓ Selected</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Link & Save Button */}
                                    {selectedC2B && (
                                        <button
                                            onClick={() => processPayment()}
                                            disabled={isProcessing}
                                            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isProcessing ? (
                                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <>✅ Link &amp; Save Payment</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Split Payment UI */}
                            {selectedBill && outstandingAmount > 0 && (
                                <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-200 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-purple-700 flex items-center gap-2">
                                            <span>💸</span> Split Payment
                                        </h4>
                                        <button
                                            onClick={addSplitPayment}
                                            disabled={parseFloat(paymentAmount) <= 0}
                                            className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-bold hover:bg-purple-600 disabled:opacity-50"
                                        >
                                            + Add Payment
                                        </button>
                                    </div>

                                    {/* Split Payments List */}
                                    {splitPayments.length > 0 && (
                                        <div className="space-y-2">
                                            {splitPayments.map((payment, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-purple-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">
                                                            {payment.method === 'Cash' ? '💵' : payment.method === 'M-Pesa' ? '📱' : '💳'}
                                                        </span>
                                                        <span className="font-medium text-gray-700">{payment.method}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-purple-700">
                                                            Ksh {payment.amount.toLocaleString()}
                                                        </span>
                                                        <button
                                                            onClick={() => removeSplitPayment(idx)}
                                                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Summary */}
                                            <div className="bg-purple-100 p-3 rounded-lg space-y-1">
                                                <div className="flex justify-between text-sm text-purple-700">
                                                    <span>Total Split Payments:</span>
                                                    <span className="font-bold">Ksh {splitPaymentTotal.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-purple-700">
                                                    <span>Remaining:</span>
                                                    <span className={`font-bold ${remainingAfterSplit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                        Ksh {remainingAfterSplit.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={clearSplitPayments}
                                                className="w-full py-2 text-red-600 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100"
                                            >
                                                🗑️ Clear All Payments
                                            </button>
                                        </div>
                                    )}

                                    {splitPayments.length === 0 && (
                                        <p className="text-xs text-purple-600 text-center">
                                            Add multiple payment methods (e.g., Cash + M-Pesa) for this bill
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={payFullBalance}
                                    disabled={!selectedBill || outstandingAmount <= 0 || isProcessing || splitPayments.length > 0}
                                    className="py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                                >
                                    <span>💯</span>
                                    <span>Pay Full Balance</span>
                                </button>
                                <button
                                    onClick={() => processPayment(false)}
                                    disabled={!selectedBill || outstandingAmount <= 0 || isProcessing}
                                    className="py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                                >
                                    <span>✅</span>
                                    <span>{splitPayments.length > 0 ? `Process ${splitPayments.length} Payments` : 'Process'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Order Items - Right Panel */}
                <div className="col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-5 py-4">
                        <h3 className="font-bold flex items-center gap-2">
                            <span>🍽️</span> Order Items
                        </h3>
                    </div>
                    <div className="p-4 max-h-[450px] overflow-y-auto">
                        {selectedBill && selectedBill.items && selectedBill.items.length > 0 ? (
                            <div className="space-y-2">
                                {selectedBill.items.map((item, idx) => (
                                    <div key={idx} className="bg-gradient-to-r from-gray-50 to-white p-3 rounded-xl border border-gray-100">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-gray-800">{item.product_name}</p>
                                                <p className="text-xs text-gray-500">Qty: {item.quantity} × {item.unit_price?.toLocaleString()}</p>
                                            </div>
                                            <p className="font-bold text-gray-800">{item.subtotal?.toLocaleString()}</p>
                                        </div>
                                        {item.notes && (
                                            <p className="text-xs text-amber-600 mt-1 italic">📝 {item.notes}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <span className="text-5xl block mb-3">📦</span>
                                <p>{selectedBill ? 'No items' : 'Select a bill to view items'}</p>
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    {selectedBill && (
                        <div className="border-t border-gray-100 p-4 bg-gradient-to-r from-gray-50 to-white">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-500">Subtotal:</span>
                                <span className="font-medium">{selectedBill.subtotal?.toLocaleString()}</span>
                            </div>
                            {selectedBill.discount > 0 && (
                                <div className="flex justify-between text-sm text-green-600 mb-1">
                                    <span>Discount:</span>
                                    <span>-{selectedBill.discount?.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
                                <span>Total:</span>
                                <span className="text-blue-600">{selectedBill.total_amount?.toLocaleString()}</span>
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
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="inline-block animate-spin text-5xl mb-4">🔄</div>
                    <p className="text-gray-500">Loading Bill Payment...</p>
                </div>
            </div>
        }>
            <BillPaymentContent />
        </Suspense>
    );
}
