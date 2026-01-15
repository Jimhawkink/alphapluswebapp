'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

// M-Pesa API URL - uses Supabase Edge Functions
const MPESA_API_URL = 'https://pxcdaivlvltmdifxietb.supabase.co/functions/v1';

interface MeatStock {
    stock_id: number;
    stock_code: string;
    meat_type_name: string;
    available_kg: number;
    cost_per_kg: number;
    selling_price: number;
    days_old: number;
}

interface ButcheryDashboard {
    todaySales: number;
    todayWeightSold: number;
    todayTransactions: number;
    availableStock: number;
}

interface TodaySale {
    sale_id: number;
    sale_code: string;
    meat_type_name: string;
    weight_kg: number;
    net_amount: number;
    payment_mode: string;
}

export default function ButcheryPOSPage() {
    // State
    const [batches, setBatches] = useState<MeatStock[]>([]);
    const [dashboard, setDashboard] = useState<ButcheryDashboard>({ todaySales: 0, todayWeightSold: 0, todayTransactions: 0, availableStock: 0 });
    const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
    const [saleCode, setSaleCode] = useState('SAL000001');
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Form state
    const [selectedBatch, setSelectedBatch] = useState<MeatStock | null>(null);
    const [amount, setAmount] = useState('');
    const [discount, setDiscount] = useState('0');
    const [customerName, setCustomerName] = useState('');
    const [customerContact, setCustomerContact] = useState('');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [notes, setNotes] = useState('');

    // M-Pesa State
    const [mpesaMode, setMpesaMode] = useState<'STK_PUSH' | 'CALLBACK'>('STK_PUSH');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [mpesaStatus, setMpesaStatus] = useState<'idle' | 'sending' | 'waiting' | 'success' | 'failed'>('idle');
    const [mpesaStatusMessage, setMpesaStatusMessage] = useState('');
    const [checkoutRequestId, setCheckoutRequestId] = useState('');
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // C2B Payment State
    interface C2BPayment {
        id: number;
        trans_id: string;
        trans_amount: number;
        msisdn: string;
        first_name: string;
        is_linked: boolean;
    }
    const [c2bPayments, setC2bPayments] = useState<C2BPayment[]>([]);
    const [selectedC2B, setSelectedC2B] = useState<C2BPayment | null>(null);
    const [loadingC2B, setLoadingC2B] = useState(false);

    // Calculated values
    const amountValue = parseFloat(amount) || 0;
    const discountValue = parseFloat(discount) || 0;
    const pricePerKg = selectedBatch?.selling_price || 0;
    const weightKg = pricePerKg > 0 ? amountValue / pricePerKg : 0;
    const netAmount = amountValue - discountValue;

    // Load data
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            // Load stock/batches with available quantity from meat_stock table
            const { data: stockData, error: stockError } = await supabase
                .from('meat_stock')
                .select('*, meat_types(meat_type_name)')
                .gt('available_kg', 0)
                .order('purchase_date', { ascending: true }); // FIFO - oldest first

            if (stockError) throw stockError;

            setBatches((stockData || []).map(b => {
                const purchaseDate = new Date(b.purchase_date);
                const daysOld = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
                return {
                    stock_id: b.stock_id,
                    stock_code: b.stock_code || `STK-${b.stock_id}`,
                    meat_type_name: (b as any).meat_types?.meat_type_name || 'Unknown',
                    available_kg: b.available_kg || 0,
                    cost_per_kg: b.cost_per_kg || 0,
                    selling_price: b.selling_price || 0,
                    days_old: daysOld
                };
            }));

            // Load today's sales from meat_sales table
            const { data: salesData } = await supabase
                .from('meat_sales')
                .select('*')
                .gte('sale_date', todayStr)
                .order('sale_date', { ascending: false });

            const sales = salesData || [];
            setTodaySales(sales.slice(0, 5).map(s => ({
                sale_id: s.sale_id,
                sale_code: s.sale_code,
                meat_type_name: s.meat_type_name || 'Meat',
                weight_kg: s.weight_kg,
                net_amount: s.net_amount,
                payment_mode: s.payment_mode
            })));

            // Calculate dashboard
            const totalSales = sales.reduce((sum, s) => sum + (s.net_amount || 0), 0);
            const totalWeight = sales.reduce((sum, s) => sum + (s.weight_kg || 0), 0);
            const totalStock = (stockData || []).reduce((sum, s) => sum + (s.available_kg || 0), 0);

            setDashboard({
                todaySales: totalSales,
                todayWeightSold: totalWeight,
                todayTransactions: sales.length,
                availableStock: totalStock
            });

            // Generate next sale code
            const nextNum = sales.length + 1;
            setSaleCode(`SAL${String(nextNum).padStart(6, '0')}`);

        } catch (err: any) {
            console.error('Error loading data:', err);
            toast.error(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    // Format phone number
    const formatMpesaPhone = (phone: string): string => {
        let cleaned = phone.replace(/\s/g, '').replace(/\+/g, '').replace(/-/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (!cleaned.startsWith('254')) {
            cleaned = '254' + cleaned;
        }
        return cleaned;
    };

    // Validate Kenyan phone
    const isValidKenyanPhone = (phone: string): boolean => {
        const cleaned = phone.replace(/\s/g, '').replace(/\+/g, '').replace(/-/g, '');
        return /^(07\d{8}|01\d{8}|254\d{9})$/.test(cleaned);
    };

    // Initiate M-Pesa STK Push
    const handleMpesaSTKPush = async () => {
        if (!isValidKenyanPhone(mpesaPhone)) {
            toast.error('📱 Please enter a valid Kenyan phone number');
            return;
        }

        setMpesaStatus('sending');
        setMpesaStatusMessage('Sending STK Push...');

        try {
            const phone = formatMpesaPhone(mpesaPhone);
            const response = await fetch(`${MPESA_API_URL}/stkpush`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    amount: Math.ceil(netAmount),
                    accountReference: saleCode,
                    transactionDesc: `Butchery Sale - ${selectedBatch?.meat_type_name || 'Meat'}`,
                }),
            });

            const data = await response.json();

            if (data.success && (data.CheckoutRequestID || data.checkoutRequestId)) {
                const requestId = data.CheckoutRequestID || data.checkoutRequestId;
                setCheckoutRequestId(requestId);
                setMpesaStatus('waiting');
                setMpesaStatusMessage('📲 Enter your M-Pesa PIN on your phone...');

                // Save transaction to Supabase with correct column names
                await supabase.from('mpesa_transactions').insert({
                    checkout_request_id: requestId,
                    phone_number: phone,
                    amount: netAmount,
                    account_reference: saleCode,
                    status: 'Pending',
                });

                // Start polling
                startStatusPolling(requestId);
            } else {
                setMpesaStatus('failed');
                setMpesaStatusMessage(data.error || data.message || 'Failed to send STK Push');
            }
        } catch (err: any) {
            setMpesaStatus('failed');
            setMpesaStatusMessage(err.message || 'Network error');
        }
    };

    // Poll for M-Pesa payment status
    const startStatusPolling = (requestId: string) => {
        let attempts = 0;
        const maxAttempts = 24;

        pollIntervalRef.current = setInterval(async () => {
            attempts++;

            try {
                const response = await fetch(`${MPESA_API_URL}/status?checkoutRequestId=${requestId}`);
                const data = await response.json();

                if (data.ResultCode === 0 && data.MpesaReceiptNumber) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('success');
                    setMpesaStatusMessage(`✅ Payment received! Receipt: ${data.MpesaReceiptNumber}`);
                    setPaymentReference(data.MpesaReceiptNumber);

                    // Auto-complete the sale
                    setTimeout(() => processSale(data.MpesaReceiptNumber), 1000);
                } else if (data.ResultCode !== undefined && data.ResultCode !== null && data.ResultCode !== 0) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('failed');
                    const desc = data.ResultCode === 1032 ? 'Cancelled by User' :
                        data.ResultCode === 1 ? 'Insufficient Funds' :
                            `Payment failed (Code: ${data.ResultCode})`;
                    setMpesaStatusMessage(desc);
                } else if (attempts >= maxAttempts) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('failed');
                    setMpesaStatusMessage('⏰ Payment timeout - please check your M-Pesa messages');
                }
            } catch {
                // Continue polling on error
            }
        }, 5000);
    };

    // Reset M-Pesa state
    const resetMpesaState = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }
        setMpesaStatus('idle');
        setMpesaStatusMessage('');
        setCheckoutRequestId('');
        setSelectedC2B(null);
    };

    // Load unlinked C2B payments
    const loadC2BPayments = async () => {
        setLoadingC2B(true);
        try {
            const { data, error } = await supabase
                .from('c2b_transactions')
                .select('*')
                .eq('is_linked', false)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            setC2bPayments(data || []);
        } catch (err: any) {
            console.error('Error loading C2B payments:', err);
            setC2bPayments([]);
        } finally {
            setLoadingC2B(false);
        }
    };

    // Select C2B payment
    const selectC2BPayment = (payment: C2BPayment) => {
        setSelectedC2B(payment);
        setPaymentReference(payment.trans_id);
    };

    // Process sale
    const processSale = async (mpesaReceipt?: string) => {
        if (!selectedBatch) {
            toast.error('🥩 Please select a batch!');
            return;
        }
        if (amountValue <= 0) {
            toast.error('💰 Please enter a valid amount!');
            return;
        }
        if (weightKg > selectedBatch.available_kg) {
            toast.error(`⚠️ Insufficient stock! Available: ${selectedBatch.available_kg.toFixed(2)} Kg`);
            return;
        }

        setIsProcessing(true);
        try {
            const finalPaymentMode = paymentMode === 'M-Pesa' ? 'M-Pesa' : paymentMode;
            const finalReference = mpesaReceipt || paymentReference || null;

            // 1. Insert sale into meat_sales table
            const { error: saleError } = await supabase
                .from('meat_sales')
                .insert({
                    sale_code: saleCode,
                    stock_id: selectedBatch.stock_id,
                    weight_kg: Math.round(weightKg * 1000) / 1000,
                    price_per_kg: pricePerKg,
                    total_amount: Math.round(amountValue),
                    discount: Math.round(discountValue),
                    net_amount: Math.round(netAmount),
                    payment_mode: finalPaymentMode,
                    payment_reference: finalReference,
                    mpesa_receipt_number: mpesaReceipt || null,
                    checkout_request_id: checkoutRequestId || null,
                    customer_name: customerName || null,
                    customer_contact: customerContact || null,
                    notes: notes || null,
                    served_by: 'Web POS',
                    sale_date: new Date().toISOString()
                });

            if (saleError) throw saleError;

            // 2. Update meat_stock
            const newAvailable = selectedBatch.available_kg - weightKg;
            const { data: currentStock } = await supabase
                .from('meat_stock')
                .select('sold_kg')
                .eq('stock_id', selectedBatch.stock_id)
                .single();

            const newSoldKg = (currentStock?.sold_kg || 0) + weightKg;

            const { error: stockError } = await supabase
                .from('meat_stock')
                .update({
                    available_kg: newAvailable,
                    sold_kg: newSoldKg,
                    status: newAvailable <= 0 ? 'Sold Out' : 'Available'
                })
                .eq('stock_id', selectedBatch.stock_id);

            if (stockError) throw stockError;

            toast.success(`✅ Sale processed! ${saleCode}${mpesaReceipt ? ` | M-Pesa: ${mpesaReceipt}` : ''}`);

            // Reset form
            setSelectedBatch(null);
            setAmount('');
            setDiscount('0');
            setCustomerName('');
            setCustomerContact('');
            setPaymentMode('Cash');
            setPaymentReference('');
            setNotes('');
            setMpesaPhone('');
            resetMpesaState();
            setShowPaymentModal(false);

            // Reload data
            loadData();

        } catch (err: any) {
            console.error('Error processing sale:', err);
            toast.error(`❌ ${err.message || 'Sale failed'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const paymentMethods = [
        { id: 'Cash', icon: '💵', label: 'Cash' },
        { id: 'M-Pesa', icon: '📱', label: 'M-Pesa' },
        { id: 'Card', icon: '💳', label: 'Card' },
        { id: 'Credit', icon: '📋', label: 'Credit' },
    ];

    const getDaysColor = (days: number) => {
        if (days === 0) return 'text-green-600 bg-green-100';
        if (days === 1) return 'text-yellow-600 bg-yellow-100';
        if (days === 2) return 'text-orange-600 bg-orange-100';
        return 'text-red-600 bg-red-100';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-3xl p-5 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/butchery" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ←
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                🥩 Butchery POS
                            </h1>
                            <p className="text-white/80 text-sm">Meat Sales System (By Batch - FIFO)</p>
                        </div>
                    </div>
                    <div className="px-4 py-2 bg-white/20 rounded-xl">
                        <p className="text-sm opacity-80">Sale #</p>
                        <p className="font-bold text-lg">{saleCode}</p>
                    </div>
                </div>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">💰</span>
                        <span className="text-sm opacity-90">Today Sales</span>
                    </div>
                    <p className="text-xl font-bold">KES {dashboard.todaySales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">⚖️</span>
                        <span className="text-sm opacity-90">Weight Sold</span>
                    </div>
                    <p className="text-xl font-bold">{dashboard.todayWeightSold.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-4 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">🧾</span>
                        <span className="text-sm opacity-90">Transactions</span>
                    </div>
                    <p className="text-xl font-bold">{dashboard.todayTransactions}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">📦</span>
                        <span className="text-sm opacity-90">Stock Available</span>
                    </div>
                    <p className="text-xl font-bold">{dashboard.availableStock.toFixed(1)} Kg</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Sale Form */}
                <div className="col-span-2 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
                        🥩 New Sale
                    </h2>

                    <div className="space-y-5">
                        {/* Batch Selection */}
                        <div>
                            <label className="text-gray-400 text-sm mb-2 block">Select Batch (FIFO - Oldest First)</label>
                            <select
                                value={selectedBatch?.stock_id || ''}
                                onChange={(e) => {
                                    const batch = batches.find(b => b.stock_id === parseInt(e.target.value));
                                    setSelectedBatch(batch || null);
                                }}
                                className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-red-500 focus:outline-none"
                            >
                                <option value="">🥩 Tap to select batch</option>
                                {batches.map(batch => (
                                    <option key={batch.stock_id} value={batch.stock_id}>
                                        [{batch.days_old}d] {batch.meat_type_name} - {batch.stock_code} ({batch.available_kg.toFixed(1)} Kg) @ KES {batch.selling_price}/Kg
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Batch Info */}
                        {selectedBatch && (
                            <div className="flex justify-between text-sm">
                                <span className="text-green-400">📦 Available: {selectedBatch.available_kg.toFixed(2)} Kg</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${getDaysColor(selectedBatch.days_old)}`}>
                                    {selectedBatch.days_old}d old
                                </span>
                                <span className="text-cyan-400">💵 Price: KES {selectedBatch.selling_price}/Kg</span>
                            </div>
                        )}

                        {/* Amount Input */}
                        <div>
                            <label className="text-gray-400 text-sm mb-2 block">💰 Enter Amount (KES)</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Enter amount e.g. 500"
                                className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-red-500 focus:outline-none text-xl"
                            />
                        </div>

                        {/* Weight Display */}
                        {amountValue > 0 && pricePerKg > 0 && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-gray-400 text-sm">⚖️ Meat Weight</p>
                                        <p className="text-green-400 text-2xl font-bold">
                                            {weightKg < 1
                                                ? `${weightKg.toFixed(3)} Kg (${(weightKg * 1000).toFixed(0)}g)`
                                                : `${weightKg.toFixed(3)} Kg`
                                            }
                                        </p>
                                    </div>
                                    <span className="text-4xl">🥩</span>
                                </div>
                            </div>
                        )}

                        {/* Discount & Net */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-gray-400 text-sm mb-2 block">🏷️ Discount</label>
                                <input
                                    type="number"
                                    value={discount}
                                    onChange={(e) => setDiscount(e.target.value)}
                                    className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm mb-2 block">💵 Net Amount</label>
                                <div className="w-full p-4 bg-green-500/10 border border-green-500 rounded-xl text-green-400 font-bold text-center text-lg">
                                    KES {netAmount.toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Customer */}
                        <div>
                            <label className="text-gray-400 text-sm mb-2 block">👤 Customer (Optional)</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Customer name"
                                className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                            />
                        </div>

                        {/* Process Button */}
                        <button
                            onClick={() => setShowPaymentModal(true)}
                            disabled={!selectedBatch || amountValue <= 0 || isProcessing}
                            className="w-full py-4 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-bold text-lg hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">💳</span>
                            PROCEED TO PAYMENT
                        </button>
                    </div>
                </div>

                {/* Today's Sales */}
                <div className="bg-gray-800 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-white flex items-center gap-2">
                            📋 Today&apos;s Sales
                        </h2>
                        <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-bold">
                            {todaySales.length} transactions
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-8">
                            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </div>
                    ) : todaySales.length === 0 ? (
                        <div className="text-center py-8">
                            <span className="text-5xl mb-2 block">🥩</span>
                            <p className="text-gray-400">No sales yet today</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {todaySales.map(sale => (
                                <div key={sale.sale_id} className="bg-gray-700/50 rounded-xl p-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-white font-semibold text-sm">{sale.sale_code}</p>
                                            <p className="text-gray-400 text-xs">{sale.meat_type_name} • {sale.weight_kg.toFixed(2)} Kg</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-green-400 font-bold">KES {sale.net_amount.toLocaleString()}</p>
                                            <span className="text-cyan-400 text-xs">{sale.payment_mode}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                💳 Payment
                            </h2>
                            <button
                                onClick={() => {
                                    resetMpesaState();
                                    setShowPaymentModal(false);
                                }}
                                className="text-gray-400 hover:text-white text-2xl"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Amount Display */}
                        <div className="bg-gradient-to-r from-green-500/20 to-cyan-500/10 rounded-2xl p-6 text-center mb-6">
                            <p className="text-gray-400 text-sm">💵 Amount to Pay</p>
                            <p className="text-green-400 text-4xl font-extrabold">KES {netAmount.toLocaleString()}</p>
                        </div>

                        {/* Payment Methods */}
                        <p className="text-gray-400 text-sm mb-3">Select Payment Method</p>
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            {paymentMethods.map(method => (
                                <button
                                    key={method.id}
                                    onClick={() => {
                                        setPaymentMode(method.id);
                                        resetMpesaState();
                                    }}
                                    className={`p-3 rounded-xl border-2 transition-all ${paymentMode === method.id
                                        ? 'bg-red-500 border-red-500 text-white'
                                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                                        }`}
                                >
                                    <span className="text-2xl block mb-1">{method.icon}</span>
                                    <span className="text-xs">{method.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* M-Pesa Options */}
                        {paymentMode === 'M-Pesa' && (
                            <div className="mb-6">
                                {/* Mode Toggle */}
                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => { setMpesaMode('STK_PUSH'); resetMpesaState(); }}
                                        className={`flex-1 py-3 rounded-xl font-medium transition-all ${mpesaMode === 'STK_PUSH'
                                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                            }`}
                                    >
                                        📲 STK Push
                                    </button>
                                    <button
                                        onClick={() => { setMpesaMode('CALLBACK'); resetMpesaState(); }}
                                        className={`flex-1 py-3 rounded-xl font-medium transition-all ${mpesaMode === 'CALLBACK'
                                            ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                            }`}
                                    >
                                        📥 Callback
                                    </button>
                                </div>

                                {/* STK Push Mode */}
                                {mpesaMode === 'STK_PUSH' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-gray-400 text-sm mb-2 block">📱 Customer Phone Number</label>
                                            <input
                                                type="tel"
                                                value={mpesaPhone}
                                                onChange={(e) => setMpesaPhone(e.target.value)}
                                                placeholder="07XX XXX XXX"
                                                className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-green-500 focus:outline-none"
                                                disabled={mpesaStatus === 'sending' || mpesaStatus === 'waiting'}
                                            />
                                        </div>

                                        {/* Status Display */}
                                        {mpesaStatus !== 'idle' && (
                                            <div className={`p-4 rounded-xl flex items-center gap-3 ${mpesaStatus === 'sending' ? 'bg-amber-500/20 border border-amber-500' :
                                                mpesaStatus === 'waiting' ? 'bg-blue-500/20 border border-blue-500' :
                                                    mpesaStatus === 'success' ? 'bg-green-500/20 border border-green-500' :
                                                        'bg-red-500/20 border border-red-500'
                                                }`}>
                                                {(mpesaStatus === 'sending' || mpesaStatus === 'waiting') && (
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                )}
                                                <span className={`${mpesaStatus === 'sending' ? 'text-amber-400' :
                                                    mpesaStatus === 'waiting' ? 'text-blue-400' :
                                                        mpesaStatus === 'success' ? 'text-green-400' :
                                                            'text-red-400'
                                                    }`}>{mpesaStatusMessage}</span>
                                            </div>
                                        )}

                                        {/* Send STK Button */}
                                        {(mpesaStatus === 'idle' || mpesaStatus === 'failed') && (
                                            <button
                                                onClick={handleMpesaSTKPush}
                                                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-xl transition-all"
                                            >
                                                📤 Send STK Push
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Callback Mode */}
                                {mpesaMode === 'CALLBACK' && (
                                    <div className="space-y-4">
                                        <div className="bg-gray-700 rounded-xl p-4 text-center">
                                            <p className="text-gray-400 text-sm">Pay to Till Number</p>
                                            <p className="text-green-400 text-3xl font-bold">9830453</p>
                                        </div>
                                        <div className="bg-green-500/10 border border-green-500 rounded-xl p-4 text-center">
                                            <p className="text-gray-400 text-sm">Amount</p>
                                            <p className="text-green-400 text-2xl font-bold">KES {netAmount.toLocaleString()}</p>
                                        </div>

                                        {/* C2B Payments DataGrid */}
                                        <div className="bg-gray-700 rounded-xl p-4">
                                            <div className="flex justify-between items-center mb-3">
                                                <h4 className="text-white font-medium">📥 Unlinked Payments</h4>
                                                <button
                                                    onClick={loadC2BPayments}
                                                    className="text-xl hover:scale-110 transition-transform"
                                                >
                                                    {loadingC2B ? '⏳' : '🔄'}
                                                </button>
                                            </div>

                                            {loadingC2B ? (
                                                <div className="flex justify-center py-4">
                                                    <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                                                </div>
                                            ) : c2bPayments.length === 0 ? (
                                                <div className="text-center py-4">
                                                    <p className="text-gray-400 text-sm mb-2">No unlinked payments found</p>
                                                    <button
                                                        onClick={loadC2BPayments}
                                                        className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                                                    >
                                                        Load Payments
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="max-h-40 overflow-y-auto space-y-2">
                                                    {c2bPayments.map(payment => (
                                                        <div
                                                            key={payment.id}
                                                            onClick={() => selectC2BPayment(payment)}
                                                            className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-all border-2 ${selectedC2B?.id === payment.id
                                                                    ? 'bg-green-500/20 border-green-500'
                                                                    : 'bg-gray-600 border-transparent hover:bg-gray-500'
                                                                }`}
                                                        >
                                                            <div>
                                                                <p className="text-white font-medium">{payment.trans_id}</p>
                                                                <p className="text-gray-400 text-xs">{payment.msisdn} • {payment.first_name}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-green-400 font-bold">KES {payment.trans_amount.toLocaleString()}</p>
                                                                {selectedC2B?.id === payment.id && (
                                                                    <p className="text-green-400 text-xs">✓ Selected</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Manual Entry Fallback */}
                                        <div>
                                            <label className="text-gray-400 text-sm mb-2 block">📱 Or Enter Receipt Code Manually</label>
                                            <input
                                                type="text"
                                                value={paymentReference}
                                                onChange={(e) => setPaymentReference(e.target.value.toUpperCase())}
                                                placeholder="Enter M-Pesa code e.g. RLJ5XXXXXX"
                                                className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-green-500 focus:outline-none uppercase"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Reference for non-M-Pesa */}
                        {paymentMode !== 'Cash' && paymentMode !== 'M-Pesa' && (
                            <div className="mb-6">
                                <label className="text-gray-400 text-sm mb-2 block">💳 Reference</label>
                                <input
                                    type="text"
                                    value={paymentReference}
                                    onChange={(e) => setPaymentReference(e.target.value)}
                                    placeholder="Enter reference..."
                                    className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-red-500 focus:outline-none"
                                />
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    resetMpesaState();
                                    setShowPaymentModal(false);
                                }}
                                className="flex-1 py-4 border-2 border-gray-600 text-gray-300 rounded-xl font-semibold hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            {/* Only show Complete button for non-M-Pesa or Callback mode */}
                            {(paymentMode !== 'M-Pesa' || mpesaMode === 'CALLBACK') && (
                                <button
                                    onClick={() => processSale()}
                                    disabled={isProcessing}
                                    className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            ✅ Complete Sale
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
