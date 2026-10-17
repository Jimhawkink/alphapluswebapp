'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, c2bSupabase } from '@/lib/supabase'; // Import both clients
import toast from 'react-hot-toast';
import { generateCustomerBillHTML, printReceipt, loadCompanyInfo, createReceiptData, ReceiptData } from '@/lib/receiptPrinter';

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

            // Print PAID receipt after successful full payment
            if (isFullyPaid) {
                try {
                    const company = await loadCompanyInfo();
                    const combinedMethod = paymentMethodNames.length > 1
                        ? `Split (${paymentMethodNames.join(' + ')})`
                        : paymentMethodNames[0];

                    // Create receipt data with all tax details
                    const receiptData = createReceiptData(
                        selectedBill.receipt_no,
                        (selectedBill.items || []).map(item => ({
                            name: item.product_name || 'Item',
                            qty: item.quantity || 1,
                            price: item.unit_price || 0,
                            notes: item.notes,
                            discount: item.discount || 0
                        })),
                        combinedMethod,
                        newPaidAmount,
                        currentUser?.name || 'Cashier',
                        {
                            customerName: selectedBill.customer_name || customerName || 'Walk-in Customer',
                            mpesaReceipt: selectedC2B?.mpesa_receipt || mpesaReceipt || selectedBill.mpesa_code,
                            tableNo: selectedBill.table_name,
                            orderNotes: selectedBill.notes,
                            shiftCode: selectedBill.shift_code,
                            discount: selectedBill.discount || 0,
                            isPaid: true,
                            taxMode: 'inclusive' as 'inclusive' | 'exclusive',
                            vatRate: 16,
                            levyRate: 2,
                            hotelName: company.name
                        }
                    );

                    // Generate and print PAID customer bill with QR code
                    const receiptHTML = await generateCustomerBillHTML(receiptData, company, true); // isPaid = true
                    printReceipt(receiptHTML);
                    toast.success('🖨️ Receipt printed!');
                } catch (printErr) {
                    console.error('Error printing receipt:', printErr);
                    // Don't block payment if print fails
                }
            }

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
        <div className="space-y-4">
            {/* Header - Compact */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">💰</span>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Bill Payment</h1>
                        <p className="text-xs text-gray-500">Receive payments for pending bills</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadBills}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
                    >
                        <span>🔄</span>
                        <span className="font-medium text-gray-700">Refresh</span>
                    </button>
                    <a
                        href="/dashboard/bills"
                        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
                    >
                        <span>📋</span>
                        <span className="font-medium text-gray-700">All Bills</span>
                    </a>
                </div>
            </div>

            {/* Stats Strip - Compact Inline */}
            <div className="flex items-center gap-6 bg-white rounded-xl px-5 py-3 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-amber-500">⏳</span>
                    <span className="text-sm text-gray-600">Pending:</span>
                    <span className="font-bold text-amber-600">{stats.totalPending}</span>
                    <span className="text-xs text-gray-400">(Ksh {stats.totalPendingAmount.toLocaleString()})</span>
                </div>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex items-center gap-2">
                    <span className="text-green-500">✅</span>
                    <span className="text-sm text-gray-600">Paid:</span>
                    <span className="font-bold text-green-600">{stats.totalPaid}</span>
                    <span className="text-xs text-gray-400">(Ksh {stats.totalPaidAmount.toLocaleString()})</span>
                </div>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex items-center gap-2">
                    <span className="text-blue-500">🧾</span>
                    <span className="text-sm text-gray-600">Selected:</span>
                    <span className="font-bold text-blue-600">{selectedBill?.receipt_no || '-'}</span>
                </div>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex items-center gap-2">
                    <span className="text-red-500">💳</span>
                    <span className="text-sm text-gray-600">Balance:</span>
                    <span className="font-bold text-red-600">Ksh {outstandingAmount.toLocaleString()}</span>
                </div>
            </div>

            {/* Main Content - 3 Column Layout */}
            <div className="grid grid-cols-12 gap-6">
                {/* Bills List - Left Panel */}
                <div className="col-span-5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Compact Filters */}
                    <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search receipt, customer, M-Pesa code..."
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
                            />
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium"
                            >
                                <option value="All">All</option>
                                <option value="Pending">⏳ Pending</option>
                                <option value="Paid">✅ Paid</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-xs"
                            />
                            <span className="text-gray-400 text-xs">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-xs"
                            />
                            <select
                                value={filterUser}
                                onChange={(e) => setFilterUser(e.target.value)}
                                className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs"
                            >
                                <option value="All">All Users</option>
                                {users.map(user => (
                                    <option key={user} value={user}>{user}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Bills Table - Compact */}
                    <div className="max-h-[420px] overflow-y-auto">
                        {isLoading ? (
                            <div className="p-6 text-center">
                                <div className="inline-block animate-spin text-2xl mb-2">🔄</div>
                                <p className="text-gray-500 text-sm">Loading...</p>
                            </div>
                        ) : filteredBills.length === 0 ? (
                            <div className="p-6 text-center">
                                <span className="text-3xl block mb-2">📭</span>
                                <p className="text-gray-500 text-sm">No bills found</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Receipt</th>
                                        <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Date</th>
                                        <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Total</th>
                                        <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Balance</th>
                                        <th className="text-center py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredBills.map(bill => (
                                        <tr
                                            key={bill.sale_id}
                                            onClick={() => selectBill(bill)}
                                            className={`cursor-pointer transition-all ${selectedBill?.sale_id === bill.sale_id
                                                ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                                                : 'hover:bg-gray-50'
                                                }`}
                                        >
                                            <td className="py-2 px-3">
                                                <span className="text-[11px] font-semibold text-indigo-600">
                                                    {bill.receipt_no}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-[11px] text-gray-500">
                                                {new Date(bill.sale_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                            </td>
                                            <td className="py-2 px-2 text-right text-xs font-medium text-gray-700">
                                                {bill.total_amount?.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-2 text-right text-xs font-bold text-red-600">
                                                {Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0)).toLocaleString()}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                <span className={`text-[10px] font-bold ${bill.status === 'Completed' || bill.status === 'Paid' ? 'text-green-600' : 'text-amber-600'}`}>
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
                <div className="col-span-4 space-y-3">
                    {/* Bill Details Card - Clean */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                            <span className="text-base">🧾</span>
                            <h3 className="font-semibold text-gray-700 text-sm">Bill Details</h3>
                        </div>
                        <div className="p-4">
                            {selectedBill ? (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Receipt</p>
                                            <p className="font-bold text-gray-800">{selectedBill.receipt_no}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Customer</p>
                                            <p className="font-medium text-gray-700 text-sm">{selectedBill.customer_name || 'Walk-in'}</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Date</span>
                                        <span className="text-gray-700">{selectedBill.sale_date}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Status</span>
                                        <span className={`font-semibold ${selectedBill.status === 'Pending' ? 'text-amber-600' : 'text-green-600'}`}>
                                            {selectedBill.status === 'Pending' ? '⏳ Not Paid' : '✅ Paid'}
                                        </span>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Bill Total</span>
                                            <span className="font-semibold text-gray-800">Ksh {selectedBill.total_amount?.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Paid</span>
                                            <span className="font-semibold text-green-600">Ksh {paidAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-red-50 p-2.5 rounded-lg">
                                            <span className="text-red-700 font-medium text-sm">Balance</span>
                                            <span className="font-bold text-red-600 text-lg">Ksh {outstandingAmount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-400">
                                    <span className="text-3xl block mb-2">👆</span>
                                    <p className="text-sm">Select a bill</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payment Method Card - Clean */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                            <span className="text-base">💳</span>
                            <h3 className="font-semibold text-gray-700 text-sm">Payment</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {/* Payment Mode Toggle - Compact */}
                            <div className="flex p-1 bg-gray-100 rounded-lg">
                                <button
                                    onClick={() => setPaymentMode('STK_PUSH')}
                                    className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${paymentMode === 'STK_PUSH'
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <span>📲</span> STK Push
                                </button>
                                <button
                                    onClick={() => setPaymentMode('CALLBACK')}
                                    className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${paymentMode === 'CALLBACK'
                                        ? 'bg-white text-amber-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <span>📥</span> Callback
                                </button>
                            </div>

                            {/* Customer Name - Compact */}
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">
                                    Customer Name {paymentMode === 'CALLBACK' ? '*' : ''}
                                </label>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Enter customer name"
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
                                    disabled={!selectedBill}
                                />
                            </div>

                            {paymentMode === 'STK_PUSH' && (
                                <>
                                    {/* Payment Type & Amount Row */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                                            <select
                                                value={paymentMethod}
                                                onChange={(e) => setPaymentMethod(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium"
                                                disabled={!selectedBill || outstandingAmount <= 0}
                                            >
                                                <option value="Cash">💵 Cash</option>
                                                <option value="M-Pesa">📱 M-Pesa</option>
                                                <option value="Card">💳 Card</option>
                                                <option value="Bank Transfer">🏦 Bank</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-500 mb-1 block">Amount</label>
                                            <input
                                                type="number"
                                                value={paymentAmount}
                                                onChange={(e) => setPaymentAmount(e.target.value)}
                                                className="w-full px-3 py-2 bg-green-50 border border-green-200 rounded-lg font-bold text-gray-800 text-center"
                                                placeholder="0"
                                                disabled={!selectedBill || outstandingAmount <= 0}
                                            />
                                        </div>
                                    </div>

                                    {/* M-Pesa Panel - Compact */}
                                    {paymentMethod === 'M-Pesa' && selectedBill && outstandingAmount > 0 && (
                                        <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={mpesaPhone}
                                                    onChange={(e) => setMpesaPhone(e.target.value)}
                                                    placeholder="2547XXXXXXXX"
                                                    className="flex-1 px-3 py-2 bg-white border border-green-200 rounded-lg text-sm font-medium"
                                                />
                                                <button
                                                    onClick={initiateMpesaPayment}
                                                    disabled={isProcessing}
                                                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    Send
                                                </button>
                                            </div>
                                            <div className={`${mpesaStatusColor} text-white px-3 py-1.5 rounded text-center text-xs font-medium`}>
                                                {mpesaStatus}
                                            </div>
                                            {mpesaReceipt && (
                                                <div className="bg-white px-3 py-2 rounded border border-green-200 flex justify-between items-center text-sm">
                                                    <span className="text-gray-500">Receipt:</span>
                                                    <span className="font-bold text-green-600">{mpesaReceipt}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Callback Mode Panel - Compact C2B DataGrid */}
                            {paymentMode === 'CALLBACK' && selectedBill && outstandingAmount > 0 && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-amber-700">
                                            <span className="text-lg">📥</span>
                                            <h4 className="font-semibold text-sm">C2B Payments</h4>
                                        </div>
                                        <button
                                            onClick={loadC2BPayments}
                                            className="text-sm hover:scale-110 transition-transform"
                                        >
                                            {loadingC2B ? '⏳' : '🔄'}
                                        </button>
                                    </div>

                                    {/* Till & Amount Row */}
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-white rounded-lg p-2 text-center">
                                            <p className="text-[10px] text-gray-500 uppercase">Till</p>
                                            <p className="text-sm font-bold text-gray-800">9830453</p>
                                        </div>
                                        <div className="flex-1 bg-white rounded-lg p-2 text-center">
                                            <p className="text-[10px] text-gray-500 uppercase">Balance</p>
                                            <p className="text-sm font-bold text-green-600">Ksh {outstandingAmount.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* C2B DataGrid - Compact */}
                                    <div className="bg-white rounded-lg p-2">
                                        {loadingC2B ? (
                                            <div className="flex justify-center py-4">
                                                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : c2bPayments.length === 0 ? (
                                            <div className="text-center py-4">
                                                <p className="text-gray-400 text-xs mb-2">No unlinked payments</p>
                                                <button
                                                    onClick={loadC2BPayments}
                                                    className="bg-amber-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-amber-600"
                                                >
                                                    Load
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="max-h-40 overflow-y-auto space-y-1">
                                                {c2bPayments.map(payment => (
                                                    <div
                                                        key={payment.id}
                                                        onClick={() => selectC2BPayment(payment)}
                                                        className={`flex justify-between items-center p-2 rounded cursor-pointer text-sm ${selectedC2B?.id === payment.id
                                                            ? 'bg-green-50 border border-green-400'
                                                            : 'bg-gray-50 hover:bg-amber-50'
                                                            }`}
                                                    >
                                                        <div>
                                                            <p className="font-semibold text-gray-800 text-xs">
                                                                {payment.mpesa_receipt || payment.id}
                                                            </p>
                                                            <p className="text-gray-500 text-[10px]">
                                                                {payment.customer_name || 'Customer'}
                                                            </p>
                                                        </div>
                                                        <p className="font-bold text-green-600 text-xs">
                                                            Ksh {(payment.amount || 0).toLocaleString()}
                                                        </p>
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
                                            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
                                        >
                                            {isProcessing ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <>✅ Link & Save</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Split Payment UI - Compact */}
                            {selectedBill && outstandingAmount > 0 && (
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-semibold text-purple-700 text-sm flex items-center gap-1">
                                            <span>💸</span> Split Payment
                                        </h4>
                                        <button
                                            onClick={addSplitPayment}
                                            disabled={parseFloat(paymentAmount) <= 0}
                                            className="px-2 py-1 bg-purple-500 text-white rounded text-xs font-bold hover:bg-purple-600 disabled:opacity-50"
                                        >
                                            + Add
                                        </button>
                                    </div>

                                    {/* Split Payments List */}
                                    {splitPayments.length > 0 && (
                                        <div className="space-y-1">
                                            {splitPayments.map((payment, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-white p-1.5 rounded border border-purple-100 text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm">
                                                            {payment.method === 'Cash' ? '💵' : payment.method === 'M-Pesa' ? '📱' : '💳'}
                                                        </span>
                                                        <span className="font-medium text-gray-700 text-xs">{payment.method}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-bold text-purple-700 text-xs">
                                                            Ksh {payment.amount.toLocaleString()}
                                                        </span>
                                                        <button
                                                            onClick={() => removeSplitPayment(idx)}
                                                            className="p-0.5 text-red-500 hover:bg-red-50 rounded text-xs"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Summary */}
                                            <div className="bg-purple-100 p-2 rounded text-xs space-y-0.5">
                                                <div className="flex justify-between text-purple-700">
                                                    <span>Split Total:</span>
                                                    <span className="font-bold">Ksh {splitPaymentTotal.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-purple-700">
                                                    <span>Remaining:</span>
                                                    <span className={`font-bold ${remainingAfterSplit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                        Ksh {remainingAfterSplit.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={clearSplitPayments}
                                                className="w-full py-1 text-red-600 bg-red-50 rounded text-xs font-medium hover:bg-red-100"
                                            >
                                                🗑️ Clear
                                            </button>
                                        </div>
                                    )}

                                    {splitPayments.length === 0 && (
                                        <p className="text-[10px] text-purple-600 text-center">
                                            Add multiple payment methods
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons - Compact */}
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                    onClick={payFullBalance}
                                    disabled={!selectedBill || outstandingAmount <= 0 || isProcessing || splitPayments.length > 0}
                                    className="py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1 transition-all"
                                >
                                    <span>💯</span>
                                    <span>Pay Full</span>
                                </button>
                                <button
                                    onClick={() => processPayment(false)}
                                    disabled={!selectedBill || outstandingAmount <= 0 || isProcessing}
                                    className="py-2.5 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1 transition-all"
                                >
                                    <span>✅</span>
                                    <span>{splitPayments.length > 0 ? `Process (${splitPayments.length})` : 'Process'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Order Items - Right Panel - Clean */}
                <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                        <span className="text-base">🍽️</span>
                        <h3 className="font-semibold text-gray-700 text-sm">Order Items</h3>
                    </div>
                    <div className="p-3 max-h-[380px] overflow-y-auto">
                        {selectedBill && selectedBill.items && selectedBill.items.length > 0 ? (
                            <div className="space-y-1.5">
                                {selectedBill.items.map((item, idx) => (
                                    <div key={idx} className="bg-gray-50 p-2 rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-gray-800 text-sm">{item.product_name}</p>
                                                <p className="text-[10px] text-gray-500">{item.quantity} × {item.unit_price?.toLocaleString()}</p>
                                            </div>
                                            <p className="font-bold text-gray-800 text-sm">{item.subtotal?.toLocaleString()}</p>
                                        </div>
                                        {item.notes && (
                                            <p className="text-[10px] text-amber-600 mt-0.5 italic">📝 {item.notes}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-400">
                                <span className="text-3xl block mb-2">📦</span>
                                <p className="text-sm">{selectedBill ? 'No items' : 'Select a bill'}</p>
                            </div>
                        )}
                    </div>

                    {/* Summary - Compact */}
                    {selectedBill && (
                        <div className="border-t border-gray-100 p-3 bg-gray-50">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-500">Subtotal:</span>
                                <span className="font-medium">{selectedBill.subtotal?.toLocaleString()}</span>
                            </div>
                            {selectedBill.discount > 0 && (
                                <div className="flex justify-between text-xs text-green-600 mb-1">
                                    <span>Discount:</span>
                                    <span>-{selectedBill.discount?.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-sm pt-2 border-t border-gray-200">
                                <span>Total:</span>
                                <span className="text-indigo-600">{selectedBill.total_amount?.toLocaleString()}</span>
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
