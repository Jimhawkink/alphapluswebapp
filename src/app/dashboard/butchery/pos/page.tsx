'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

// M-Pesa API Edge Function URL
const MPESA_API_URL = 'https://pxcdaivlvltmdifxietb.supabase.co/functions/v1';

// ─── TYPES & INTERFACES ────────────────────────────────────────────────────────

interface MeatStock {
    stock_id: number;
    stock_code: string;
    meat_type_name: string;
    available_kg: number;
    cost_per_kg: number;
    selling_price: number;
    wholesale_price?: number;
    days_old: number;
}

interface CartItem {
    id: string;
    stock_id: number;
    stock_code: string;
    meat_type_name: string;
    weight_kg: number;
    price_per_kg: number;
    price_tier: 'Retail' | 'Wholesale';
    subtotal: number;
    prep_mode: 'Raw Takeaway' | 'Nyama Choma' | 'Wet Fry' | 'Dry Fry' | 'Boil / Soup';
    doneness?: string;
    accompaniments: string[];
    special_notes?: string;
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
    prep_mode?: string;
    sale_time?: string;
}

interface C2BPayment {
    id: number;
    trans_id: string;
    trans_amount: number;
    msisdn: string;
    first_name: string;
    is_linked: boolean;
}

export default function ButcheryPOSPage() {
    // ─── STATE MANAGEMENT ───────────────────────────────────────────────────────
    const [batches, setBatches] = useState<MeatStock[]>([]);
    const [dashboard, setDashboard] = useState<ButcheryDashboard>({ todaySales: 0, todayWeightSold: 0, todayTransactions: 0, availableStock: 0 });
    const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
    const [saleCode, setSaleCode] = useState('SAL000001');
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // Multi-Item Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [lastCompletedSale, setLastCompletedSale] = useState<any>(null);

    // Input Mode: Weight-First vs Amount-First
    const [inputMode, setInputMode] = useState<'WEIGHT' | 'AMOUNT'>('WEIGHT');
    const [priceTier, setPriceTier] = useState<'Retail' | 'Wholesale'>('Retail');

    // Active Item Selection
    const [selectedBatch, setSelectedBatch] = useState<MeatStock | null>(null);
    const [weightInput, setWeightInput] = useState<string>('1.0');
    const [amountInput, setAmountInput] = useState<string>('');
    const [prepMode, setPrepMode] = useState<'Raw Takeaway' | 'Nyama Choma' | 'Wet Fry' | 'Dry Fry' | 'Boil / Soup'>('Raw Takeaway');
    const [doneness, setDoneness] = useState<string>('Medium Well');
    const [selectedAccompaniments, setSelectedAccompaniments] = useState<string[]>([]);
    const [itemNotes, setItemNotes] = useState<string>('');

    // Global Order Details
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [tableNo, setTableNo] = useState('');
    const [globalDiscount, setGlobalDiscount] = useState<string>('0');
    const [paymentMode, setPaymentMode] = useState<'M-Pesa' | 'Cash' | 'Card' | 'Credit'>('M-Pesa');
    const [cashTendered, setCashTendered] = useState<string>('');
    const [paymentReference, setPaymentReference] = useState('');

    // M-Pesa State
    const [mpesaMode, setMpesaMode] = useState<'STK_PUSH' | 'CALLBACK'>('STK_PUSH');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [mpesaStatus, setMpesaStatus] = useState<'idle' | 'sending' | 'waiting' | 'success' | 'failed'>('idle');
    const [mpesaStatusMessage, setMpesaStatusMessage] = useState('');
    const [checkoutRequestId, setCheckoutRequestId] = useState('');
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // C2B Unlinked Payments
    const [c2bPayments, setC2bPayments] = useState<C2BPayment[]>([]);
    const [selectedC2B, setSelectedC2B] = useState<C2BPayment | null>(null);
    const [loadingC2B, setLoadingC2B] = useState(false);

    // Live Clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // ─── LOAD DATA ─────────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            // 1. Load Batches from meat_stock (FIFO - oldest first)
            const { data: stockData, error: stockError } = await supabase
                .from('meat_stock')
                .select('*, meat_types(meat_type_name)')
                .gt('available_kg', 0)
                .order('purchase_date', { ascending: true });

            if (stockError) throw stockError;

            const mappedBatches: MeatStock[] = (stockData || []).map(b => {
                const purchaseDate = new Date(b.purchase_date || today);
                const daysOld = Math.max(0, Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24)));
                const retailPrice = Number(b.selling_price) || 600;
                // Wholesale price is 10% lower or wholesale_price column if present
                const wholesalePrice = Number(b.wholesale_price) || Math.round(retailPrice * 0.9);

                return {
                    stock_id: b.stock_id,
                    stock_code: b.stock_code || `STK-${b.stock_id}`,
                    meat_type_name: (b as any).meat_types?.meat_type_name || 'Prime Beef',
                    available_kg: Number(b.available_kg) || 0,
                    cost_per_kg: Number(b.cost_per_kg) || 450,
                    selling_price: retailPrice,
                    wholesale_price: wholesalePrice,
                    days_old: daysOld
                };
            });

            setBatches(mappedBatches);
            if (!selectedBatch && mappedBatches.length > 0) {
                setSelectedBatch(mappedBatches[0]);
            }

            // 2. Load Today's Sales from meat_sales
            const { data: salesData } = await supabase
                .from('meat_sales')
                .select('*')
                .gte('sale_date', todayStr)
                .order('sale_date', { ascending: false });

            const sales = salesData || [];
            setTodaySales(sales.slice(0, 10).map(s => ({
                sale_id: s.sale_id,
                sale_code: s.sale_code || `SAL-${s.sale_id}`,
                meat_type_name: s.meat_type_name || 'Meat',
                weight_kg: Number(s.weight_kg) || 0,
                net_amount: Number(s.net_amount) || 0,
                payment_mode: s.payment_mode || 'Cash',
                prep_mode: s.notes?.includes('Choma') ? 'Nyama Choma' : (s.notes?.includes('Fry') ? 'Fry' : 'Takeaway'),
                sale_time: s.sale_date ? new Date(s.sale_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            })));

            // 3. Compute KPI Dashboard
            const totalSales = sales.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);
            const totalWeight = sales.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
            const totalStock = mappedBatches.reduce((sum, s) => sum + s.available_kg, 0);

            setDashboard({
                todaySales: totalSales,
                todayWeightSold: totalWeight,
                todayTransactions: sales.length,
                availableStock: totalStock
            });

            // 4. Generate Next Sale Code
            const nextNum = sales.length + 1;
            setSaleCode(`BCH${String(nextNum).padStart(6, '0')}`);

        } catch (err: any) {
            console.error('Error loading butchery data:', err);
            toast.error(err.message || 'Failed to load butchery stock');
        } finally {
            setIsLoading(false);
        }
    }, [selectedBatch]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // ─── ACTIVE UNIT PRICE ─────────────────────────────────────────────────────
    const activePricePerKg = useMemo(() => {
        if (!selectedBatch) return 0;
        return priceTier === 'Wholesale' ? (selectedBatch.wholesale_price || selectedBatch.selling_price) : selectedBatch.selling_price;
    }, [selectedBatch, priceTier]);

    // ─── DUAL-MODE WEIGHT / AMOUNT SYNC ─────────────────────────────────────────
    const handleWeightChange = (val: string) => {
        setWeightInput(val);
        const w = parseFloat(val);
        if (!isNaN(w) && w > 0 && activePricePerKg > 0) {
            setAmountInput(Math.round(w * activePricePerKg).toString());
        } else {
            setAmountInput('');
        }
    };

    const handleAmountChange = (val: string) => {
        setAmountInput(val);
        const a = parseFloat(val);
        if (!isNaN(a) && a > 0 && activePricePerKg > 0) {
            setWeightInput((a / activePricePerKg).toFixed(3));
        } else {
            setWeightInput('');
        }
    };

    // Quick Weight Buttons (Kg)
    const quickWeights = [
        { label: '250g', val: 0.25 },
        { label: '500g', val: 0.50 },
        { label: '750g', val: 0.75 },
        { label: '1.0 Kg', val: 1.00 },
        { label: '1.5 Kg', val: 1.50 },
        { label: '2.0 Kg', val: 2.00 },
        { label: '3.0 Kg', val: 3.00 },
        { label: '5.0 Kg', val: 5.00 },
    ];

    // Quick Amount Buttons (KES)
    const quickAmounts = [200, 300, 500, 800, 1000, 1500, 2000, 3000];

    // Accompaniment options
    const accompanimentsList = ['Ugali', 'Kachumbari', 'Sukuma Wiki', 'Spinach', 'Roast Potatoes', 'Mukimo', 'Roast Maize'];

    // ─── BASKET / CART CALCULATIONS ────────────────────────────────────────────
    const cartSubtotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + item.subtotal, 0);
    }, [cart]);

    const cartTotalWeight = useMemo(() => {
        return cart.reduce((sum, item) => sum + item.weight_kg, 0);
    }, [cart]);

    const discountNum = parseFloat(globalDiscount) || 0;
    const cartGrandTotal = Math.max(0, cartSubtotal - discountNum);

    // Cash Change
    const cashNum = parseFloat(cashTendered) || 0;
    const cashChange = Math.max(0, cashNum - cartGrandTotal);

    // ─── ADD ITEM TO BASKET ────────────────────────────────────────────────────
    const handleAddToCart = () => {
        if (!selectedBatch) {
            toast.error('🥩 Please select a meat batch!');
            return;
        }

        const w = parseFloat(weightInput);
        if (isNaN(w) || w <= 0) {
            toast.error('⚖️ Please enter a valid weight!');
            return;
        }

        // Check stock availability
        const currentInCart = cart.filter(i => i.stock_id === selectedBatch.stock_id).reduce((sum, i) => sum + i.weight_kg, 0);
        if ((currentInCart + w) > selectedBatch.available_kg) {
            toast.error(`⚠️ Stock shortage! Only ${selectedBatch.available_kg.toFixed(2)} Kg available (${currentInCart.toFixed(2)} Kg already in basket).`);
            return;
        }

        const lineTotal = Math.round(w * activePricePerKg);

        const newItem: CartItem = {
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            stock_id: selectedBatch.stock_id,
            stock_code: selectedBatch.stock_code,
            meat_type_name: selectedBatch.meat_type_name,
            weight_kg: Math.round(w * 1000) / 1000,
            price_per_kg: activePricePerKg,
            price_tier: priceTier,
            subtotal: lineTotal,
            prep_mode: prepMode,
            doneness: prepMode !== 'Raw Takeaway' ? doneness : undefined,
            accompaniments: [...selectedAccompaniments],
            special_notes: itemNotes.trim() || undefined
        };

        setCart(prev => [...prev, newItem]);
        toast.success(`🥩 Added ${newItem.weight_kg} Kg ${newItem.meat_type_name} (${newItem.prep_mode}) to Basket!`);

        // Reset item inputs
        setItemNotes('');
        setSelectedAccompaniments([]);
    };

    const handleRemoveFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
        toast('Item removed from basket');
    };

    const handleClearCart = () => {
        setCart([]);
        toast('Basket cleared');
    };

    // ─── M-PESA STK PUSH INTEGRATION ───────────────────────────────────────────
    const formatMpesaPhone = (phone: string): string => {
        let cleaned = phone.replace(/\s/g, '').replace(/\+/g, '').replace(/-/g, '');
        if (cleaned.startsWith('0')) cleaned = '254' + cleaned.substring(1);
        else if (!cleaned.startsWith('254')) cleaned = '254' + cleaned;
        return cleaned;
    };

    const isValidKenyanPhone = (phone: string): boolean => {
        const cleaned = phone.replace(/\s/g, '').replace(/\+/g, '').replace(/-/g, '');
        return /^(07\d{8}|01\d{8}|254\d{9})$/.test(cleaned);
    };

    const handleMpesaSTKPush = async () => {
        const targetPhone = mpesaPhone || customerPhone;
        if (!isValidKenyanPhone(targetPhone)) {
            toast.error('📱 Please enter a valid Kenyan phone number (e.g. 0712345678)');
            return;
        }

        setMpesaStatus('sending');
        setMpesaStatusMessage('Sending STK Push to Safaricom...');

        try {
            const phone = formatMpesaPhone(targetPhone);
            const response = await fetch(`${MPESA_API_URL}/stkpush`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    amount: Math.ceil(cartGrandTotal),
                    accountReference: saleCode,
                    transactionDesc: `Butchery Sale ${saleCode} (${cart.length} items)`,
                }),
            });

            const data = await response.json();

            if (data.success && (data.CheckoutRequestID || data.checkoutRequestId)) {
                const requestId = data.CheckoutRequestID || data.checkoutRequestId;
                setCheckoutRequestId(requestId);
                setMpesaStatus('waiting');
                setMpesaStatusMessage('📲 PIN Prompt sent! Waiting for customer to enter M-Pesa PIN...');

                // Record pending transaction in Supabase
                await supabase.from('mpesa_transactions').insert({
                    checkout_request_id: requestId,
                    phone_number: phone,
                    amount: cartGrandTotal,
                    account_reference: saleCode,
                    status: 'Pending',
                });

                // Start Polling
                startStatusPolling(requestId);
            } else {
                setMpesaStatus('failed');
                setMpesaStatusMessage(data.error || data.message || 'STK Push rejected by Safaricom');
            }
        } catch (err: any) {
            setMpesaStatus('failed');
            setMpesaStatusMessage(err.message || 'Network error triggering STK Push');
        }
    };

    const startStatusPolling = (requestId: string) => {
        let attempts = 0;
        const maxAttempts = 24; // 2 minutes

        pollIntervalRef.current = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(`${MPESA_API_URL}/status?checkoutRequestId=${requestId}`);
                const data = await response.json();

                if (data.ResultCode === 0 && data.MpesaReceiptNumber) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('success');
                    setMpesaStatusMessage(`✅ M-Pesa Confirmed! Code: ${data.MpesaReceiptNumber}`);
                    setPaymentReference(data.MpesaReceiptNumber);

                    // Finalize sale with M-Pesa receipt code
                    setTimeout(() => handleFinalizeSale(data.MpesaReceiptNumber), 1000);
                } else if (data.ResultCode !== undefined && data.ResultCode !== null && data.ResultCode !== 0) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('failed');
                    const desc = data.ResultCode === 1032 ? 'Transaction Cancelled by User' :
                        data.ResultCode === 1 ? 'Insufficient M-Pesa Balance' :
                            `Payment failed (Error: ${data.ResultCode})`;
                    setMpesaStatusMessage(desc);
                } else if (attempts >= maxAttempts) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('failed');
                    setMpesaStatusMessage('⏰ Payment timed out. Verify customer phone SMS.');
                }
            } catch {
                // Ignore transient polling network drops
            }
        }, 5000);
    };

    const resetMpesaState = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setMpesaStatus('idle');
        setMpesaStatusMessage('');
        setCheckoutRequestId('');
        setSelectedC2B(null);
    };

    // ─── C2B UNLINKED PAYMENT CLAIMING ─────────────────────────────────────────
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

    const selectC2BPayment = (payment: C2BPayment) => {
        setSelectedC2B(payment);
        setPaymentReference(payment.trans_id);
    };

    // ─── FINALIZE CHECKOUT / SALE PROCESSING ───────────────────────────────────
    const handleFinalizeSale = async (mpesaCodeOverride?: string) => {
        if (cart.length === 0) {
            toast.error('🛒 Your meat basket is empty!');
            return;
        }

        setIsProcessing(true);
        try {
            const finalMpesaReceipt = mpesaCodeOverride || paymentReference || (paymentMode === 'M-Pesa' ? 'MPS-MANUAL' : null);

            // Group or process each cart item into meat_sales and reduce meat_stock
            for (const item of cart) {
                // 1. Insert into meat_sales
                const itemNotesFormatted = [
                    item.prep_mode,
                    item.doneness ? `Doneness: ${item.doneness}` : null,
                    item.accompaniments.length > 0 ? `Sides: ${item.accompaniments.join(', ')}` : null,
                    item.special_notes ? `Note: ${item.special_notes}` : null,
                    tableNo ? `Table: ${tableNo}` : null
                ].filter(Boolean).join(' | ');

                const { error: saleErr } = await supabase
                    .from('meat_sales')
                    .insert({
                        sale_code: saleCode,
                        stock_id: item.stock_id,
                        weight_kg: item.weight_kg,
                        price_per_kg: item.price_per_kg,
                        total_amount: item.subtotal,
                        discount: 0,
                        net_amount: item.subtotal,
                        payment_mode: paymentMode,
                        payment_reference: finalMpesaReceipt,
                        mpesa_receipt_number: finalMpesaReceipt,
                        checkout_request_id: checkoutRequestId || null,
                        customer_name: customerName || null,
                        customer_contact: customerPhone || null,
                        notes: itemNotesFormatted || null,
                        served_by: 'Cyber Butchery POS',
                        sale_date: new Date().toISOString()
                    });

                if (saleErr) console.warn('Warning inserting meat_sale item:', saleErr.message);

                // 2. Reduce meat_stock available_kg
                const batch = batches.find(b => b.stock_id === item.stock_id);
                if (batch) {
                    const newAvailable = Math.max(0, batch.available_kg - item.weight_kg);
                    await supabase
                        .from('meat_stock')
                        .update({
                            available_kg: newAvailable,
                            status: newAvailable <= 0 ? 'Sold Out' : 'Available'
                        })
                        .eq('stock_id', item.stock_id);
                }
            }

            // Mark C2B transaction as linked if used
            if (selectedC2B) {
                await supabase
                    .from('c2b_transactions')
                    .update({ is_linked: true })
                    .eq('id', selectedC2B.id);
            }

            toast.success(`🥩 Sale ${saleCode} Completed! KES ${cartGrandTotal.toLocaleString()} received via ${paymentMode}`);

            // Prepare Thermal Receipt & Grill Ticket Data
            const completedRecord = {
                saleCode,
                items: [...cart],
                subtotal: cartSubtotal,
                discount: discountNum,
                grandTotal: cartGrandTotal,
                totalWeight: cartTotalWeight,
                paymentMode,
                paymentRef: finalMpesaReceipt,
                customerName: customerName || 'Walk-in Meat Customer',
                customerPhone: customerPhone || '—',
                tableNo: tableNo || 'Counter',
                timestamp: new Date().toLocaleString('en-KE'),
                hasChomaItems: cart.some(i => i.prep_mode !== 'Raw Takeaway')
            };

            setLastCompletedSale(completedRecord);
            setShowPaymentModal(false);
            setShowReceiptModal(true);

            // Reset basket & form
            setCart([]);
            setCustomerName('');
            setCustomerPhone('');
            setTableNo('');
            setGlobalDiscount('0');
            setCashTendered('');
            setPaymentReference('');
            resetMpesaState();

            // Refresh batch stock
            loadData();

        } catch (err: any) {
            console.error('Error completing butchery sale:', err);
            toast.error(`❌ Checkout failed: ${err.message || 'Please check network'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-slate-100 p-3 sm:p-5 space-y-4 select-none font-sans relative">
            <Toaster position="top-right" />

            {/* ==================================================================== */}
            {/* 1. TOP COMMAND BAR (Obsidian & Emerald Aesthetic)                     */}
            {/* ==================================================================== */}
            <header className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <Link
                        href="/dashboard/butchery"
                        className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-emerald-400 flex items-center justify-center text-xl transition-all font-bold shrink-0 shadow-inner"
                        title="Back to Butchery Hub"
                    >
                        ←
                    </Link>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>🥩 AlphaPlus</span>
                                <span className="text-[#00e676] drop-shadow-[0_0_15px_rgba(0,230,118,0.6)]">Cyber Butchery POS</span>
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-[#00e676] border border-emerald-500/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse"></span>
                                Multi-Item &amp; Choma Bridge
                            </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 font-mono flex-wrap">
                            <span className="text-[#00e676] font-bold bg-[#05090d] px-2 py-0.5 rounded border border-slate-800">
                                {liveTime.toLocaleTimeString('en-GB')} EAT
                            </span>
                            <span>•</span>
                            <span className="text-white font-bold">{saleCode}</span>
                            <span>•</span>
                            <span className="text-slate-300">Dual-Mode Kg/KES · FIFO Batch Depletion</span>
                        </div>
                    </div>
                </div>

                {/* Right Top Controls: Wholesale Toggle & Sync */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Price Tier Toggle */}
                    <div className="flex items-center bg-[#05090d] p-1 rounded-xl border border-slate-700/80">
                        <button
                            type="button"
                            onClick={() => setPriceTier('Retail')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                priceTier === 'Retail'
                                    ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Walk-in Retail
                        </button>
                        <button
                            type="button"
                            onClick={() => setPriceTier('Wholesale')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                priceTier === 'Wholesale'
                                    ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Wholesale (-10%)
                        </button>
                    </div>

                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-emerald-400 transition-all flex items-center gap-1.5"
                    >
                        <span>{isLoading ? '⏳' : '🔄'}</span>
                        <span>Sync Stock</span>
                    </button>
                </div>
            </header>

            {/* ==================================================================== */}
            {/* 2. HUD STAT CARDS (Cyber Emerald Cards matching Screenshot)            */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* 1. Today Meat Sales */}
                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-emerald-500/50 transition-all">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                        <span>Today Sales</span>
                        <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-[#00e676] flex items-center justify-center text-sm">💰</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-[#00e676] font-mono">
                            KES {dashboard.todaySales.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Paid &amp; verified</p>
                    </div>
                </div>

                {/* 2. Weight Sold */}
                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-cyan-500/50 transition-all">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                        <span>Weight Dispensed</span>
                        <span className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-sm">⚖️</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">
                            {dashboard.todayWeightSold.toFixed(2)} Kg
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Scale scale cut count</p>
                    </div>
                </div>

                {/* 3. Completed Tickets */}
                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-indigo-500/50 transition-all">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                        <span>Butchery Tickets</span>
                        <span className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm">🧾</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-white font-mono">
                            {dashboard.todayTransactions} Orders
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Total tickets processed</p>
                    </div>
                </div>

                {/* 4. Total Available Stock */}
                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-amber-500/50 transition-all">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                        <span>Chiller Stock</span>
                        <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-sm">❄️</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                            {dashboard.availableStock.toFixed(1)} Kg
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Active FIFO inventory</p>
                    </div>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 3. MAIN TERMINAL WORKSPACE: LEFT TERMINAL + RIGHT BASKET/RECEIPT      */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

                {/* ── LEFT: SCALE TERMINAL & BATCH SELECTION (7 Cols) ── */}
                <div className="xl:col-span-7 space-y-4">

                    {/* Batch Meat Selection Grid (Cyber Cards matching User's Screenshot) */}
                    <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-black text-white text-base flex items-center gap-2">
                                <span>🥩 Select Meat Cut &amp; Batch</span>
                                <span className="text-xs text-slate-400 font-normal">(Sorted FIFO: Oldest First)</span>
                            </h2>
                            <span className="text-xs font-mono text-[#00e676]">
                                Tier: <span className="font-bold">{priceTier}</span>
                            </span>
                        </div>

                        {batches.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <span className="text-4xl block mb-2">📦</span>
                                <p>No available meat stock found in chiller!</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {batches.map(batch => {
                                    const isSelected = selectedBatch?.stock_id === batch.stock_id;
                                    const price = priceTier === 'Wholesale' ? (batch.wholesale_price || batch.selling_price) : batch.selling_price;

                                    return (
                                        <div
                                            key={batch.stock_id}
                                            onClick={() => setSelectedBatch(batch)}
                                            className={`relative rounded-2xl p-3.5 cursor-pointer transition-all border ${
                                                isSelected
                                                    ? 'bg-gradient-to-br from-[#0c161e] to-emerald-950/40 border-emerald-500 shadow-[0_0_20px_rgba(0,230,118,0.25)] ring-1 ring-emerald-500'
                                                    : 'bg-[#080f18] border-slate-800 hover:border-slate-700'
                                            }`}
                                        >
                                            {/* Top Stock Badge */}
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                                    {batch.stock_code}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                                                    batch.days_old === 0
                                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                        : batch.days_old <= 2
                                                        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                                        : 'bg-red-500/15 text-red-400 border-red-500/30'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                                    {batch.days_old === 0 ? 'Fresh Today' : `${batch.days_old}d Old`}
                                                </span>
                                            </div>

                                            {/* Cut Name */}
                                            <h3 className="font-bold text-white text-sm truncate">
                                                {batch.meat_type_name}
                                            </h3>

                                            {/* Price per Kg (Glowing Neon Green) */}
                                            <div className="mt-2 flex items-baseline justify-between">
                                                <span className="text-[#00e676] font-black text-base font-mono">
                                                    KES {price.toLocaleString()}
                                                    <span className="text-[10px] text-slate-400 font-normal">/Kg</span>
                                                </span>
                                            </div>

                                            {/* Available weight */}
                                            <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
                                                <span>Avail:</span>
                                                <span className="font-mono font-bold text-slate-300">{batch.available_kg.toFixed(2)} Kg</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Dual-Mode Scale Input Terminal */}
                    <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">⚖️</span>
                                <h3 className="font-black text-white text-base">Digital Scale &amp; Price Calculator</h3>
                            </div>

                            {/* Dual Mode Toggle */}
                            <div className="flex items-center bg-[#05090d] p-1 rounded-xl border border-slate-700/80">
                                <button
                                    type="button"
                                    onClick={() => setInputMode('WEIGHT')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        inputMode === 'WEIGHT'
                                            ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Mode A: Enter Weight (Kg)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInputMode('AMOUNT')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        inputMode === 'AMOUNT'
                                            ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Mode B: Enter Amount (KES)
                                </button>
                            </div>
                        </div>

                        {/* Interactive Scale Display */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Weight Input */}
                            <div className={`p-4 rounded-2xl border transition-all ${
                                inputMode === 'WEIGHT'
                                    ? 'bg-[#080f18] border-emerald-500/60 shadow-[0_0_15px_rgba(0,230,118,0.15)]'
                                    : 'bg-[#05090d] border-slate-800'
                            }`}>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        ⚖️ Net Meat Weight
                                    </label>
                                    {inputMode === 'WEIGHT' && (
                                        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                            ACTIVE INPUT
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        step="0.05"
                                        value={weightInput}
                                        onChange={(e) => handleWeightChange(e.target.value)}
                                        placeholder="0.000"
                                        className="w-full bg-transparent text-2xl sm:text-3xl font-black text-white focus:outline-none font-mono"
                                    />
                                    <span className="text-lg font-bold text-slate-400 font-mono">Kg</span>
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono mt-1">
                                    ≈ {((parseFloat(weightInput) || 0) * 1000).toFixed(0)} grams
                                </p>
                            </div>

                            {/* Amount Input */}
                            <div className={`p-4 rounded-2xl border transition-all ${
                                inputMode === 'AMOUNT'
                                    ? 'bg-[#080f18] border-emerald-500/60 shadow-[0_0_15px_rgba(0,230,118,0.15)]'
                                    : 'bg-[#05090d] border-slate-800'
                            }`}>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        💰 Line Total Amount
                                    </label>
                                    {inputMode === 'AMOUNT' && (
                                        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                            ACTIVE INPUT
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-[#00e676] font-mono">KES</span>
                                    <input
                                        type="number"
                                        value={amountInput}
                                        onChange={(e) => handleAmountChange(e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-transparent text-2xl sm:text-3xl font-black text-[#00e676] focus:outline-none font-mono"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono mt-1">
                                    @ KES {activePricePerKg.toLocaleString()} / Kg
                                </p>
                            </div>
                        </div>

                        {/* Quick Presets Buttons (Weight or Amount based on Active Mode) */}
                        <div className="space-y-1.5">
                            <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider block">
                                Quick One-Tap Shortcuts:
                            </span>
                            {inputMode === 'WEIGHT' ? (
                                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                    {quickWeights.map(q => (
                                        <button
                                            key={q.label}
                                            type="button"
                                            onClick={() => handleWeightChange(q.val.toString())}
                                            className={`py-2 px-1 text-center rounded-xl font-mono text-xs font-bold transition-all border ${
                                                parseFloat(weightInput) === q.val
                                                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                                                    : 'bg-[#080f18] hover:bg-[#0f1d28] text-slate-300 border-slate-800'
                                            }`}
                                        >
                                            {q.label}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                    {quickAmounts.map(amt => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => handleAmountChange(amt.toString())}
                                            className={`py-2 px-1 text-center rounded-xl font-mono text-xs font-bold transition-all border ${
                                                parseFloat(amountInput) === amt
                                                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                                                    : 'bg-[#080f18] hover:bg-[#0f1d28] text-slate-300 border-slate-800'
                                            }`}
                                        >
                                            KES {amt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Preparation & Choma / Kitchen Handoff Bridge */}
                        <div className="pt-3 border-t border-slate-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🔥 Preparation Mode (Choma / Kitchen Bridge):</span>
                                </label>
                                <span className="text-[11px] text-emerald-400 font-mono">
                                    {prepMode !== 'Raw Takeaway' ? 'KDS Ticket will be printed' : 'Direct Takeaway'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {[
                                    { id: 'Raw Takeaway', icon: '🥩', label: 'Raw Takeaway' },
                                    { id: 'Nyama Choma', icon: '🔥', label: 'Nyama Choma' },
                                    { id: 'Wet Fry', icon: '🍳', label: 'Wet Fry (Karanga)' },
                                    { id: 'Dry Fry', icon: '🥘', label: 'Dry Fry' },
                                    { id: 'Boil / Soup', icon: '🥣', label: 'Boil / Broth' },
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setPrepMode(p.id as any)}
                                        className={`p-2.5 rounded-xl border text-center transition-all ${
                                            prepMode === p.id
                                                ? 'bg-gradient-to-b from-emerald-500/20 to-teal-950/40 border-emerald-500 text-white font-black shadow-lg shadow-emerald-500/10'
                                                : 'bg-[#080f18] border-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        <span className="text-xl block mb-1">{p.icon}</span>
                                        <span className="text-xs leading-tight block">{p.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Doneness & Accompaniments if Choma/Fry selected */}
                            {prepMode !== 'Raw Takeaway' && (
                                <div className="p-3.5 bg-[#05090d] border border-slate-800 rounded-xl space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400 font-bold">Grill Doneness:</span>
                                        <div className="flex gap-1.5">
                                            {['Medium', 'Medium Well', 'Well Done / Crispy'].map(d => (
                                                <button
                                                    key={d}
                                                    type="button"
                                                    onClick={() => setDoneness(d)}
                                                    className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                                                        doneness === d
                                                            ? 'bg-emerald-500 text-slate-950 font-bold'
                                                            : 'bg-[#0c161e] text-slate-400 hover:text-white border border-slate-800'
                                                    }`}
                                                >
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Accompaniments Pickers */}
                                    <div>
                                        <span className="text-slate-400 text-xs font-bold block mb-1.5">Accompaniments (Side Dishes):</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {accompanimentsList.map(side => {
                                                const isPicked = selectedAccompaniments.includes(side);
                                                return (
                                                    <button
                                                        key={side}
                                                        type="button"
                                                        onClick={() => {
                                                            if (isPicked) setSelectedAccompaniments(prev => prev.filter(s => s !== side));
                                                            else setSelectedAccompaniments(prev => [...prev, side]);
                                                        }}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                                            isPicked
                                                                ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-400 font-bold'
                                                                : 'bg-[#0c161e] border border-slate-800 text-slate-400 hover:text-white'
                                                        }`}
                                                    >
                                                        {isPicked ? '✓ ' : '+ '}{side}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Add to Basket Action */}
                            <button
                                type="button"
                                onClick={handleAddToCart}
                                disabled={!selectedBatch || parseFloat(weightInput || '0') <= 0}
                                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-sm shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <span className="text-lg">🛒</span>
                                <span>ADD CUT TO MEAT BASKET ({parseFloat(weightInput || '0').toFixed(3)} Kg)</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: MULTI-ITEM MEAT BASKET & CHECKOUT (5 Cols) ── */}
                <div className="xl:col-span-5 space-y-4">
                    <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between h-full space-y-4">

                        {/* Basket Header */}
                        <div>
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">🛒</span>
                                    <div>
                                        <h3 className="font-black text-white text-base">Meat Basket</h3>
                                        <p className="text-[11px] text-slate-400">{cart.length} item(s) on ticket</p>
                                    </div>
                                </div>
                                {cart.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearCart}
                                        className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>

                            {/* Customer & Table details */}
                            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                                <div>
                                    <label className="text-slate-400 block mb-1 text-[11px]">Customer (Optional)</label>
                                    <input
                                        type="text"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="e.g. John K."
                                        className="w-full bg-[#05090d] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-slate-400 block mb-1 text-[11px]">Table # / Choma Seat</label>
                                    <input
                                        type="text"
                                        value={tableNo}
                                        onChange={(e) => setTableNo(e.target.value)}
                                        placeholder="e.g. Table 12 / Choma Bar"
                                        className="w-full bg-[#05090d] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                                    />
                                </div>
                            </div>

                            {/* Itemized Cart List */}
                            <div className="mt-4 space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                {cart.length === 0 ? (
                                    <div className="text-center py-10 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                                        <span className="text-3xl block mb-2">🥩</span>
                                        <p className="font-semibold text-slate-400">Basket is empty</p>
                                        <p className="text-xs text-slate-500 mt-1">Select cuts on the left to build order</p>
                                    </div>
                                ) : (
                                    cart.map(item => (
                                        <div
                                            key={item.id}
                                            className="bg-[#080f18] border border-slate-800 rounded-xl p-3 flex items-start justify-between gap-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-white text-xs truncate">
                                                        {item.meat_type_name}
                                                    </h4>
                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                                        {item.stock_code}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                                    {item.weight_kg.toFixed(3)} Kg @ KES {item.price_per_kg.toLocaleString()}/Kg
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        item.prep_mode === 'Raw Takeaway'
                                                            ? 'bg-slate-800 text-slate-300'
                                                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    }`}>
                                                        {item.prep_mode}
                                                    </span>
                                                    {item.doneness && (
                                                        <span className="text-[10px] text-slate-400">({item.doneness})</span>
                                                    )}
                                                    {item.accompaniments.length > 0 && (
                                                        <span className="text-[10px] text-slate-400">+ {item.accompaniments.join(', ')}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="font-black text-white text-sm font-mono block">
                                                    KES {item.subtotal.toLocaleString()}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveFromCart(item.id)}
                                                    className="text-[10px] text-rose-400 hover:text-rose-300 font-bold mt-1"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Order Summary & Totals */}
                        <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                            <div className="flex justify-between text-slate-400">
                                <span>Subtotal ({cartTotalWeight.toFixed(3)} Kg):</span>
                                <span className="font-mono text-white">KES {cartSubtotal.toLocaleString()}</span>
                            </div>

                            <div className="flex justify-between items-center text-slate-400">
                                <span>Discount:</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-slate-500">KES</span>
                                    <input
                                        type="number"
                                        value={globalDiscount}
                                        onChange={(e) => setGlobalDiscount(e.target.value)}
                                        className="w-20 bg-[#05090d] border border-slate-700 rounded px-2 py-1 text-right text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-base">
                                <span className="font-black text-white">GRAND TOTAL:</span>
                                <span className="font-black text-xl text-[#00e676] font-mono">
                                    KES {cartGrandTotal.toLocaleString()}
                                </span>
                            </div>

                            {/* Proceed to Checkout Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (cart.length === 0) {
                                        toast.error('Add cuts to your basket first!');
                                        return;
                                    }
                                    setShowPaymentModal(true);
                                }}
                                disabled={cart.length === 0}
                                className="w-full py-4 bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black rounded-xl text-base shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                            >
                                <span>💳</span>
                                <span>PROCEED TO PAYMENT (KES {cartGrandTotal.toLocaleString()})</span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* ==================================================================== */}
            {/* 4. MODAL: PAYMENT SETTLEMENT (M-Pesa STK, C2B, Cash Tender)           */}
            {/* ==================================================================== */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0c161e] border border-slate-800 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div>
                                <h3 className="font-black text-white text-lg flex items-center gap-2">
                                    <span>💳 Checkout &amp; Payment</span>
                                </h3>
                                <p className="text-xs text-slate-400">Ticket: {saleCode} • {cart.length} Meat Item(s)</p>
                            </div>
                            <button
                                onClick={() => {
                                    resetMpesaState();
                                    setShowPaymentModal(false);
                                }}
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Amount Display Header */}
                        <div className="bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/40 rounded-2xl p-4 text-center">
                            <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider block">
                                Amount Due
                            </span>
                            <span className="text-3xl font-black text-[#00e676] font-mono">
                                KES {cartGrandTotal.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-400 block mt-0.5">
                                Total Weight: {cartTotalWeight.toFixed(3)} Kg
                            </span>
                        </div>

                        {/* Payment Method Selector */}
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { id: 'M-Pesa', icon: '📱', label: 'M-Pesa' },
                                { id: 'Cash', icon: '💵', label: 'Cash Tender' },
                                { id: 'Card', icon: '💳', label: 'PDQ Card' },
                                { id: 'Credit', icon: '📋', label: 'Credit Tab' },
                            ].map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                        setPaymentMode(m.id as any);
                                        resetMpesaState();
                                    }}
                                    className={`p-3 rounded-xl border text-center transition-all ${
                                        paymentMode === m.id
                                            ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400 shadow-lg'
                                            : 'bg-[#080f18] border-slate-800 text-slate-300 hover:border-slate-700'
                                    }`}
                                >
                                    <span className="text-xl block mb-1">{m.icon}</span>
                                    <span className="text-xs block">{m.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* M-Pesa Options */}
                        {paymentMode === 'M-Pesa' && (
                            <div className="space-y-4 bg-[#080f18] border border-slate-800 rounded-2xl p-4">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setMpesaMode('STK_PUSH'); resetMpesaState(); }}
                                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${
                                            mpesaMode === 'STK_PUSH'
                                                ? 'bg-emerald-500 text-slate-950 font-black'
                                                : 'bg-[#0c161e] text-slate-400 hover:text-white border border-slate-800'
                                        }`}
                                    >
                                        📲 Safaricom STK Push
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setMpesaMode('CALLBACK'); resetMpesaState(); loadC2BPayments(); }}
                                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${
                                            mpesaMode === 'CALLBACK'
                                                ? 'bg-amber-400 text-slate-950 font-black'
                                                : 'bg-[#0c161e] text-slate-400 hover:text-white border border-slate-800'
                                        }`}
                                    >
                                        📥 Till / C2B Callback
                                    </button>
                                </div>

                                {mpesaMode === 'STK_PUSH' ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">Customer Phone Number</label>
                                            <input
                                                type="tel"
                                                value={mpesaPhone || customerPhone}
                                                onChange={(e) => setMpesaPhone(e.target.value)}
                                                placeholder="07XX XXX XXX or 254..."
                                                className="w-full bg-[#05090d] border border-slate-700 rounded-xl px-4 py-3 text-white text-base font-mono focus:outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        {mpesaStatus !== 'idle' && (
                                            <div className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs ${
                                                mpesaStatus === 'sending' || mpesaStatus === 'waiting'
                                                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                                                    : mpesaStatus === 'success'
                                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-bold'
                                                    : 'bg-red-500/10 border-red-500/40 text-red-400'
                                            }`}>
                                                {(mpesaStatus === 'sending' || mpesaStatus === 'waiting') && (
                                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                )}
                                                <span>{mpesaStatusMessage}</span>
                                            </div>
                                        )}

                                        {(mpesaStatus === 'idle' || mpesaStatus === 'failed') && (
                                            <button
                                                type="button"
                                                onClick={handleMpesaSTKPush}
                                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs md:text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                                            >
                                                <span>📤</span>
                                                <span>SEND STK PUSH (KES {cartGrandTotal.toLocaleString()})</span>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    /* C2B Callback Mode */
                                    <div className="space-y-3">
                                        <div className="bg-[#0c161e] p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                                            <span className="text-slate-400">Unlinked C2B Payments:</span>
                                            <button
                                                type="button"
                                                onClick={loadC2BPayments}
                                                className="text-xs text-emerald-400 font-bold"
                                            >
                                                {loadingC2B ? 'Syncing...' : '🔄 Refresh List'}
                                            </button>
                                        </div>

                                        <div className="max-h-36 overflow-y-auto space-y-1.5">
                                            {c2bPayments.length === 0 ? (
                                                <p className="text-center py-4 text-slate-500 text-xs">No unlinked till payments found</p>
                                            ) : (
                                                c2bPayments.map(p => (
                                                    <div
                                                        key={p.id}
                                                        onClick={() => selectC2BPayment(p)}
                                                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex justify-between items-center ${
                                                            selectedC2B?.id === p.id
                                                                ? 'bg-emerald-500/20 border-emerald-500 text-white'
                                                                : 'bg-[#05090d] border-slate-800 text-slate-300 hover:border-slate-700'
                                                        }`}
                                                    >
                                                        <div>
                                                            <span className="font-mono font-bold text-[#00e676]">{p.trans_id}</span>
                                                            <span className="text-slate-400 block text-[10px]">{p.msisdn} • {p.first_name}</span>
                                                        </div>
                                                        <span className="font-mono font-black text-white">KES {p.trans_amount.toLocaleString()}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">Manual M-Pesa Code</label>
                                            <input
                                                type="text"
                                                value={paymentReference}
                                                onChange={(e) => setPaymentReference(e.target.value.toUpperCase())}
                                                placeholder="e.g. QK89..."
                                                className="w-full bg-[#05090d] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono uppercase focus:outline-none focus:border-emerald-500 text-xs"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Cash Tender Input */}
                        {paymentMode === 'Cash' && (
                            <div className="space-y-3 bg-[#080f18] border border-slate-800 rounded-2xl p-4">
                                <label className="text-xs text-slate-400 block">Cash Tendered by Customer</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-slate-400 font-mono">KES</span>
                                    <input
                                        type="number"
                                        value={cashTendered}
                                        onChange={(e) => setCashTendered(e.target.value)}
                                        placeholder="Enter amount tendered e.g. 1000"
                                        className="w-full bg-[#05090d] border border-slate-700 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="p-3 bg-[#05090d] rounded-xl border border-slate-800 flex justify-between items-center">
                                    <span className="text-xs text-slate-400 font-semibold">Change to Return:</span>
                                    <span className="font-mono font-black text-lg text-emerald-400">
                                        KES {cashChange.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Card or Credit Reference */}
                        {(paymentMode === 'Card' || paymentMode === 'Credit') && (
                            <div className="space-y-2 bg-[#080f18] border border-slate-800 rounded-2xl p-4">
                                <label className="text-xs text-slate-400 block">
                                    {paymentMode === 'Card' ? 'PDQ Approval / Transaction Ref' : 'Corporate Account / Tab Note'}
                                </label>
                                <input
                                    type="text"
                                    value={paymentReference}
                                    onChange={(e) => setPaymentReference(e.target.value)}
                                    placeholder="Reference..."
                                    className="w-full bg-[#05090d] border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        )}

                        {/* Complete Checkout Button */}
                        {(paymentMode !== 'M-Pesa' || mpesaMode === 'CALLBACK' || mpesaStatus === 'success') && (
                            <button
                                type="button"
                                onClick={() => handleFinalizeSale()}
                                disabled={isProcessing}
                                className="w-full py-4 bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black rounded-xl text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <span>✅</span>
                                <span>{isProcessing ? 'Saving to Database...' : `COMPLETE TRANSACTION & PRINT TICKET`}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* 5. MODAL: THERMAL 80MM RECEIPT & CHOMA KOT PRINT PREVIEW              */}
            {/* ==================================================================== */}
            {showReceiptModal && lastCompletedSale && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0c161e] border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="font-black text-white text-base flex items-center gap-2">
                                <span>🖨️ Butchery Thermal Slip (80mm)</span>
                            </h3>
                            <button
                                onClick={() => setShowReceiptModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* 80mm Certified Receipt Box */}
                        <div className="bg-white text-black p-5 rounded-xl font-mono text-xs shadow-inner space-y-3 leading-tight border border-slate-300">
                            <div className="text-center space-y-0.5 border-b pb-2">
                                <h2 className="font-black text-sm">ALPHAPLUS RESTAURANT &amp; BUTCHERY</h2>
                                <p className="text-[10px]">Prime Cuts &amp; Nyama Choma Hub</p>
                                <p className="text-[10px]">P.O. Box 45000, Nairobi · Kenya</p>
                                <p className="text-[10px]">PIN: P051234567Z · VAT Registered</p>
                            </div>

                            <div className="space-y-0.5 text-[10px] border-b pb-2">
                                <div className="flex justify-between">
                                    <span>TICKET NO:</span>
                                    <span className="font-black">{lastCompletedSale.saleCode}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>DATE &amp; TIME:</span>
                                    <span>{lastCompletedSale.timestamp}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>CUSTOMER:</span>
                                    <span>{lastCompletedSale.customerName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>TABLE / SECTION:</span>
                                    <span className="font-bold">{lastCompletedSale.tableNo}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>PAYMENT TENDER:</span>
                                    <span className="font-bold">{lastCompletedSale.paymentMode} {lastCompletedSale.paymentRef ? `(${lastCompletedSale.paymentRef})` : ''}</span>
                                </div>
                            </div>

                            {/* Itemized Table */}
                            <div className="border-b pb-2 space-y-1.5">
                                <div className="flex justify-between font-bold text-[10px] border-b pb-0.5">
                                    <span>ITEM / PREPARATION</span>
                                    <span>AMOUNT</span>
                                </div>
                                {lastCompletedSale.items.map((i: any, idx: number) => (
                                    <div key={idx} className="space-y-0.5">
                                        <div className="flex justify-between font-bold">
                                            <span>{i.meat_type_name}</span>
                                            <span>KES {i.subtotal.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-gray-600 pl-2">
                                            <span>{i.weight_kg.toFixed(3)} Kg @ {i.price_per_kg}/Kg ({i.prep_mode})</span>
                                        </div>
                                        {i.accompaniments.length > 0 && (
                                            <div className="text-[9px] text-gray-500 pl-2">
                                                Sides: {i.accompaniments.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Totals */}
                            <div className="border-b pb-2 space-y-0.5 text-[11px]">
                                <div className="flex justify-between">
                                    <span>TOTAL NET WEIGHT:</span>
                                    <span className="font-black">{lastCompletedSale.totalWeight.toFixed(3)} Kg</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>SUBTOTAL:</span>
                                    <span>KES {lastCompletedSale.subtotal.toLocaleString()}</span>
                                </div>
                                {lastCompletedSale.discount > 0 && (
                                    <div className="flex justify-between text-gray-600">
                                        <span>DISCOUNT:</span>
                                        <span>-KES {lastCompletedSale.discount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-black text-sm pt-1 border-t">
                                    <span>TOTAL PAID:</span>
                                    <span>KES {lastCompletedSale.grandTotal.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Grill / Choma Station Instructions */}
                            {lastCompletedSale.hasChomaItems && (
                                <div className="p-2 border border-dashed border-black rounded text-[10px] space-y-0.5 bg-gray-50">
                                    <p className="font-black text-center">*** CHOMA / GRILL STATION COPY ***</p>
                                    <p>TABLE: {lastCompletedSale.tableNo}</p>
                                    <p>CHOMA ITEMS: {lastCompletedSale.items.filter((i: any) => i.prep_mode !== 'Raw Takeaway').map((i: any) => `${i.weight_kg.toFixed(3)}Kg ${i.meat_type_name} (${i.prep_mode})`).join(', ')}</p>
                                </div>
                            )}

                            <div className="text-center text-[9px] pt-1">
                                <p>Thank you for choosing AlphaPlus Butchery!</p>
                                <p>Certified Hygienic Meat · KRA Fiscal Compliant</p>
                            </div>
                        </div>

                        {/* Print Actions */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-1.5"
                            >
                                <span>🖨️</span>
                                <span>PRINT 80MM SLIP</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowReceiptModal(false)}
                                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all"
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
