'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface MeatBatch {
    batch_id: number;
    batch_code: string;
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
    const [batches, setBatches] = useState<MeatBatch[]>([]);
    const [dashboard, setDashboard] = useState<ButcheryDashboard>({ todaySales: 0, todayWeightSold: 0, todayTransactions: 0, availableStock: 0 });
    const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
    const [saleCode, setSaleCode] = useState('SAL000001');
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Form state
    const [selectedBatch, setSelectedBatch] = useState<MeatBatch | null>(null);
    const [amount, setAmount] = useState('');
    const [discount, setDiscount] = useState('0');
    const [customerName, setCustomerName] = useState('');
    const [customerContact, setCustomerContact] = useState('');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [notes, setNotes] = useState('');

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

            // Load batches with available quantity
            const { data: batchData, error: batchError } = await supabase
                .from('meat_batches')
                .select('*, meat_types(meat_type_name)')
                .gt('available_kg', 0)
                .order('purchase_date', { ascending: true });

            if (batchError) throw batchError;

            setBatches((batchData || []).map(b => {
                const purchaseDate = new Date(b.purchase_date);
                const daysOld = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
                return {
                    batch_id: b.batch_id,
                    batch_code: b.batch_code,
                    meat_type_name: (b as any).meat_types?.meat_type_name || 'Unknown',
                    available_kg: b.available_kg || 0,
                    cost_per_kg: b.cost_per_kg || 0,
                    selling_price: b.selling_price || 0,
                    days_old: daysOld
                };
            }));

            // Load today's sales
            const { data: salesData } = await supabase
                .from('butchery_sales')
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
            const totalStock = (batchData || []).reduce((sum, s) => sum + (s.available_kg || 0), 0);

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

    // Process sale
    const processSale = async () => {
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
            // Insert sale
            const { error: saleError } = await supabase
                .from('butchery_sales')
                .insert({
                    sale_code: saleCode,
                    batch_id: selectedBatch.batch_id,
                    meat_type_name: selectedBatch.meat_type_name,
                    weight_kg: weightKg,
                    price_per_kg: pricePerKg,
                    total_amount: amountValue,
                    discount: discountValue,
                    net_amount: netAmount,
                    cost_per_kg: selectedBatch.cost_per_kg,
                    payment_mode: paymentMode,
                    payment_reference: paymentReference || null,
                    customer_name: customerName || null,
                    customer_contact: customerContact || null,
                    notes: notes || null,
                    sale_date: new Date().toISOString()
                });

            if (saleError) throw saleError;

            // Update batch
            const newAvailable = selectedBatch.available_kg - weightKg;
            const { error: batchError } = await supabase
                .from('meat_batches')
                .update({
                    available_kg: newAvailable,
                    status: newAvailable <= 0 ? 'Sold Out' : 'Active'
                })
                .eq('batch_id', selectedBatch.batch_id);

            if (batchError) throw batchError;

            toast.success(`✅ Sale processed! ${saleCode}`);

            // Reset form
            setSelectedBatch(null);
            setAmount('');
            setDiscount('0');
            setCustomerName('');
            setCustomerContact('');
            setPaymentMode('Cash');
            setPaymentReference('');
            setNotes('');
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
                            <p className="text-white/80 text-sm">Meat Sales System (By Batch)</p>
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
                                value={selectedBatch?.batch_id || ''}
                                onChange={(e) => {
                                    const batch = batches.find(b => b.batch_id === parseInt(e.target.value));
                                    setSelectedBatch(batch || null);
                                }}
                                className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-red-500 focus:outline-none"
                            >
                                <option value="">🥩 Tap to select batch</option>
                                {batches.map(batch => (
                                    <option key={batch.batch_id} value={batch.batch_id}>
                                        [{batch.days_old}d] {batch.meat_type_name} - {batch.batch_code} ({batch.available_kg.toFixed(1)} Kg) @ KES {batch.selling_price}/Kg
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
                    <div className="bg-gray-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                💳 Payment
                            </h2>
                            <button
                                onClick={() => setShowPaymentModal(false)}
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
                                    onClick={() => setPaymentMode(method.id)}
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

                        {/* Reference */}
                        {paymentMode !== 'Cash' && (
                            <div className="mb-6">
                                <label className="text-gray-400 text-sm mb-2 block">
                                    {paymentMode === 'M-Pesa' ? '📱 M-Pesa Transaction Code' : '💳 Reference'}
                                </label>
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
                                onClick={() => setShowPaymentModal(false)}
                                className="flex-1 py-4 border-2 border-gray-600 text-gray-300 rounded-xl font-semibold hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={processSale}
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
