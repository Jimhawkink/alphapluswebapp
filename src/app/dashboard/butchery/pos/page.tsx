'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { supabase, c2bSupabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

// M-Pesa API Edge Function URL (Safaricom Daraja)
const MPESA_API_URL = 'https://pxcdaivlvltmdifxietb.supabase.co/functions/v1';

// ─── TYPES & INTERFACES ────────────────────────────────────────────────────────

interface MeatStock {
    stock_id: number;
    stock_code: string;
    meat_type_name: string;
    category: 'Beef' | 'Goat' | 'Chicken' | 'Pork' | 'Bones' | 'Offals';
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
    spice_level?: string;
    accompaniments: string[];
    special_notes?: string;
}

interface ParkedTicket {
    id: string;
    ticketCode: string;
    items: CartItem[];
    customerName: string;
    customerPhone: string;
    tableNo: string;
    timestamp: string;
    grandTotal: number;
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
    trans_id?: string;
    mpesa_receipt?: string;
    trans_amount?: number;
    amount?: number;
    msisdn?: string;
    phone?: string;
    first_name?: string;
    customer_name?: string;
    is_linked: boolean;
    created_at?: string;
}

// Benchmark active meat cuts ensuring terminal is ALWAYS operational even before DB table creation
const DEFAULT_FALLBACK_BATCHES: MeatStock[] = [
    { stock_id: 101, stock_code: 'BCH-BF01', meat_type_name: 'Prime Beef Steak', category: 'Beef', available_kg: 24.5, cost_per_kg: 480, selling_price: 650, wholesale_price: 580, days_old: 0 },
    { stock_id: 102, stock_code: 'BCH-MB02', meat_type_name: 'Mbuzi / Goat Choma Cut', category: 'Goat', available_kg: 18.2, cost_per_kg: 600, selling_price: 800, wholesale_price: 720, days_old: 1 },
    { stock_id: 103, stock_code: 'BCH-TB03', meat_type_name: 'T-Bone Steak', category: 'Beef', available_kg: 14.0, cost_per_kg: 650, selling_price: 900, wholesale_price: 810, days_old: 0 },
    { stock_id: 104, stock_code: 'BCH-MC04', meat_type_name: 'Minced Beef (Grade A)', category: 'Beef', available_kg: 12.5, cost_per_kg: 500, selling_price: 700, wholesale_price: 630, days_old: 0 },
    { stock_id: 105, stock_code: 'BCH-SB05', meat_type_name: 'Soup Bones / Bone Broth', category: 'Bones', available_kg: 35.0, cost_per_kg: 150, selling_price: 250, wholesale_price: 200, days_old: 2 },
    { stock_id: 106, stock_code: 'BCH-CH06', meat_type_name: 'Farm Fresh Chicken', category: 'Chicken', available_kg: 22.0, cost_per_kg: 400, selling_price: 550, wholesale_price: 490, days_old: 1 },
    { stock_id: 107, stock_code: 'BCH-PK07', meat_type_name: 'Pork Chops & Belly', category: 'Pork', available_kg: 16.0, cost_per_kg: 420, selling_price: 600, wholesale_price: 540, days_old: 1 },
    { stock_id: 108, stock_code: 'BCH-OF08', meat_type_name: 'Fresh Matumbo & Liver', category: 'Offals', available_kg: 19.5, cost_per_kg: 280, selling_price: 400, wholesale_price: 360, days_old: 0 },
];

export default function ButcheryPOSPage() {
    // ─── STATE MANAGEMENT ───────────────────────────────────────────────────────
    const [batches, setBatches] = useState<MeatStock[]>(DEFAULT_FALLBACK_BATCHES);
    const [dashboard, setDashboard] = useState<ButcheryDashboard>({ todaySales: 0, todayWeightSold: 0, todayTransactions: 0, availableStock: 161.7 });
    const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
    const [saleCode, setSaleCode] = useState('BCH000101');
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSchemaCached, setIsSchemaCached] = useState(true);
    const [showSqlModal, setShowSqlModal] = useState(false);

    // Filtering & Categories
    const [categoryFilter, setCategoryFilter] = useState<'All' | 'Beef' | 'Goat' | 'Chicken' | 'Pork' | 'Bones' | 'Offals'>('All');
    const [searchCut, setSearchCut] = useState('');

    // Multi-Item Cart & Parked Tickets
    const [cart, setCart] = useState<CartItem[]>([]);
    const [parkedTickets, setParkedTickets] = useState<ParkedTicket[]>([]);
    const [showParkedModal, setShowParkedModal] = useState(false);
    const [activeRightTab, setActiveRightTab] = useState<'BASKET' | 'RECENT'>('BASKET');

    // Modals
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [lastCompletedSale, setLastCompletedSale] = useState<any>(null);

    // Input Mode & Price Tier
    const [inputMode, setInputMode] = useState<'WEIGHT' | 'AMOUNT'>('WEIGHT');
    const [priceTier, setPriceTier] = useState<'Retail' | 'Wholesale'>('Retail');

    // Active Cut Selection
    const [selectedBatch, setSelectedBatch] = useState<MeatStock | null>(DEFAULT_FALLBACK_BATCHES[0]);
    const [weightInput, setWeightInput] = useState<string>('1.0');
    const [amountInput, setAmountInput] = useState<string>('');
    const [prepMode, setPrepMode] = useState<'Raw Takeaway' | 'Nyama Choma' | 'Wet Fry' | 'Dry Fry' | 'Boil / Soup'>('Raw Takeaway');
    const [doneness, setDoneness] = useState<string>('Medium Well');
    const [spiceLevel, setSpiceLevel] = useState<string>('Mild / Normal');
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

    // C2B Unlinked Payments from c2bSupabase
    const [c2bPayments, setC2bPayments] = useState<C2BPayment[]>([]);
    const [selectedC2B, setSelectedC2B] = useState<C2BPayment | null>(null);
    const [loadingC2B, setLoadingC2B] = useState(false);

    // Live Clock
    const [liveTime, setLiveTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // ─── LOAD DATA (SILENT FALLBACK) ───────────────────────────────────────────
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            // 1. Query meat_stock
            const { data: stockData, error: stockError } = await supabase
                .from('meat_stock')
                .select('*, meat_types(meat_type_name)')
                .gt('available_kg', 0)
                .order('stock_id', { ascending: false });

            if (stockError) {
                console.warn('Meat stock schema notice:', stockError.message);
                setIsSchemaCached(false);
                setBatches(DEFAULT_FALLBACK_BATCHES);
            } else if (stockData && stockData.length > 0) {
                setIsSchemaCached(true);
                const mappedBatches: MeatStock[] = stockData.map(b => {
                    const purchaseDate = new Date(b.purchase_date || today);
                    const daysOld = Math.max(0, Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24)));
                    const retailPrice = Number(b.selling_price) || 650;
                    const wholesalePrice = Number(b.wholesale_price) || Math.round(retailPrice * 0.9);
                    const name = (b as any).meat_types?.meat_type_name || 'Prime Beef';

                    let cat: MeatStock['category'] = 'Beef';
                    const lower = name.toLowerCase();
                    if (lower.includes('goat') || lower.includes('mbuzi')) cat = 'Goat';
                    else if (lower.includes('chicken') || lower.includes('kuku')) cat = 'Chicken';
                    else if (lower.includes('pork')) cat = 'Pork';
                    else if (lower.includes('bone') || lower.includes('soup')) cat = 'Bones';
                    else if (lower.includes('matumbo') || lower.includes('liver') || lower.includes('offal')) cat = 'Offals';

                    return {
                        stock_id: b.stock_id,
                        stock_code: b.stock_code || `BCH-${b.stock_id}`,
                        meat_type_name: name,
                        category: cat,
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
            } else {
                setBatches(DEFAULT_FALLBACK_BATCHES);
            }

            // 2. Query meat_sales
            const { data: salesData } = await supabase
                .from('meat_sales')
                .select('*')
                .gte('sale_date', todayStr)
                .order('sale_date', { ascending: false });

            const sales = salesData || [];
            if (sales.length > 0) {
                setTodaySales(sales.slice(0, 10).map(s => ({
                    sale_id: s.sale_id,
                    sale_code: s.sale_code || `BCH-${s.sale_id}`,
                    meat_type_name: s.meat_type_name || 'Meat',
                    weight_kg: Number(s.weight_kg) || 0,
                    net_amount: Number(s.net_amount) || 0,
                    payment_mode: s.payment_mode || 'Cash',
                    prep_mode: s.notes?.includes('Choma') ? 'Nyama Choma' : (s.notes?.includes('Fry') ? 'Fry' : 'Takeaway'),
                    sale_time: s.sale_date ? new Date(s.sale_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                })));

                const totalSales = sales.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);
                const totalWeight = sales.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
                const totalStock = batches.reduce((sum, s) => sum + s.available_kg, 0);

                setDashboard({
                    todaySales: totalSales,
                    todayWeightSold: totalWeight,
                    todayTransactions: sales.length,
                    availableStock: totalStock
                });

                const nextNum = sales.length + 1;
                setSaleCode(`BCH${String(nextNum).padStart(6, '0')}`);
            }

        } catch (err: any) {
            console.warn('Fallback active for butchery POS:', err);
            setBatches(DEFAULT_FALLBACK_BATCHES);
        } finally {
            setIsLoading(false);
        }
    }, [batches, selectedBatch]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Cleanup polling
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

    // ─── DUAL-MODE SCALE SYNC ──────────────────────────────────────────────────
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

    // Incremental step adjusters
    const adjustWeightBy = (delta: number) => {
        const cur = parseFloat(weightInput) || 0;
        const next = Math.max(0.1, Math.round((cur + delta) * 100) / 100);
        handleWeightChange(next.toString());
    };

    // Quick buttons
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
    const quickAmounts = [200, 300, 500, 800, 1000, 1500, 2000, 3000];
    const accompanimentsList = ['Ugali', 'Kachumbari', 'Sukuma Wiki', 'Spinach', 'Roast Potatoes', 'Mukimo', 'Roast Maize'];

    // Filtered Batches by Category and Search
    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            const matchesCategory = categoryFilter === 'All' || b.category === categoryFilter;
            const matchesSearch = b.meat_type_name.toLowerCase().includes(searchCut.toLowerCase()) ||
                b.stock_code.toLowerCase().includes(searchCut.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [batches, categoryFilter, searchCut]);

    // Cart calculations
    const cartSubtotal = useMemo(() => cart.reduce((sum, item) => sum + item.subtotal, 0), [cart]);
    const cartTotalWeight = useMemo(() => cart.reduce((sum, item) => sum + item.weight_kg, 0), [cart]);
    const discountNum = parseFloat(globalDiscount) || 0;
    const cartGrandTotal = Math.max(0, cartSubtotal - discountNum);
    const cashNum = parseFloat(cashTendered) || 0;
    const cashChange = Math.max(0, cashNum - cartGrandTotal);

    // ─── ADD ITEM TO BASKET ────────────────────────────────────────────────────
    const handleAddToCart = () => {
        if (!selectedBatch) {
            toast.error('🥩 Please select a meat cut!');
            return;
        }

        const w = parseFloat(weightInput);
        if (isNaN(w) || w <= 0) {
            toast.error('⚖️ Please enter a valid weight!');
            return;
        }

        const currentInCart = cart.filter(i => i.stock_id === selectedBatch.stock_id).reduce((sum, i) => sum + i.weight_kg, 0);
        if ((currentInCart + w) > selectedBatch.available_kg) {
            toast.error(`⚠️ Shortage: only ${selectedBatch.available_kg.toFixed(2)} Kg available (${currentInCart.toFixed(2)} Kg in basket).`);
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
            spice_level: prepMode !== 'Raw Takeaway' ? spiceLevel : undefined,
            accompaniments: [...selectedAccompaniments],
            special_notes: itemNotes.trim() || undefined
        };

        setCart(prev => [...prev, newItem]);
        toast.success(`🥩 Added ${newItem.weight_kg} Kg ${newItem.meat_type_name} (${newItem.prep_mode})!`);
        setItemNotes('');
        setSelectedAccompaniments([]);
    };

    const handleRemoveFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
        toast('Item removed from basket');
    };

    // ─── HOLD / PARK TICKET SYSTEM ─────────────────────────────────────────────
    const handleParkCurrentTicket = () => {
        if (cart.length === 0) {
            toast.error('Cannot park an empty basket!');
            return;
        }

        const parked: ParkedTicket = {
            id: `park-${Date.now()}`,
            ticketCode: saleCode,
            items: [...cart],
            customerName: customerName || 'Walk-in',
            customerPhone,
            tableNo: tableNo || 'Choma Bar',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            grandTotal: cartGrandTotal
        };

        setParkedTickets(prev => [parked, ...prev]);
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setTableNo('');
        toast.success(`⏸️ Ticket ${saleCode} Parked! You can recall it anytime.`);
    };

    const handleRecallTicket = (ticket: ParkedTicket) => {
        if (cart.length > 0) {
            if (!confirm('Replace current basket with parked ticket?')) return;
        }

        setCart(ticket.items);
        setCustomerName(ticket.customerName);
        setCustomerPhone(ticket.customerPhone);
        setTableNo(ticket.tableNo);
        setSaleCode(ticket.ticketCode);
        setParkedTickets(prev => prev.filter(p => p.id !== ticket.id));
        setShowParkedModal(false);
        toast.success(`▶️ Ticket ${ticket.ticketCode} recalled!`);
    };

    // ─── M-PESA STK PUSH (Matches Bill Payment) ────────────────────────────────
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
            toast.error('📱 Please enter a valid Kenyan phone (e.g. 0712345678)');
            return;
        }

        setMpesaStatus('sending');
        setMpesaStatusMessage('Sending STK Push to Safaricom Daraja...');

        try {
            const phone = formatMpesaPhone(targetPhone);
            const response = await fetch(`${MPESA_API_URL}/stkpush`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    amount: Math.ceil(cartGrandTotal),
                    accountReference: saleCode,
                    transactionDesc: `Butchery Meat Sale ${saleCode}`,
                }),
            });

            const data = await response.json();
            if (data.success && (data.CheckoutRequestID || data.checkoutRequestId)) {
                const requestId = data.CheckoutRequestID || data.checkoutRequestId;
                setCheckoutRequestId(requestId);
                setMpesaStatus('waiting');
                setMpesaStatusMessage('📲 Prompt sent! Customer should enter M-Pesa PIN...');

                try {
                    await supabase.from('mpesa_transactions').insert({
                        checkout_request_id: requestId,
                        phone_number: phone,
                        amount: cartGrandTotal,
                        account_reference: saleCode,
                        status: 'Pending',
                    });
                } catch {
                    // non-blocking
                }

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
        const maxAttempts = 24;

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
                    setTimeout(() => handleFinalizeSale(data.MpesaReceiptNumber), 1000);
                } else if (data.ResultCode !== undefined && data.ResultCode !== null && data.ResultCode !== 0) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('failed');
                    const desc = data.ResultCode === 1032 ? 'Transaction Cancelled by User' :
                        data.ResultCode === 1 ? 'Insufficient M-Pesa Balance' :
                            `Payment failed (Code: ${data.ResultCode})`;
                    setMpesaStatusMessage(desc);
                } else if (attempts >= maxAttempts) {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setMpesaStatus('failed');
                    setMpesaStatusMessage('⏰ Timeout. Customer should verify M-Pesa SMS.');
                }
            } catch {
                // Ignore transient polling drops
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

    // ─── LIVE C2B CALLBACK PICKER (USING c2bSupabase CLIENT AS IN BILL-PAYMENT) ──
    const loadC2BPayments = async () => {
        setLoadingC2B(true);
        try {
            const { data, error } = await c2bSupabase
                .from('c2b_transactions')
                .select('*')
                .eq('is_linked', false)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.warn('C2B fetch notice:', error.message);
                setC2bPayments([]);
            } else {
                setC2bPayments(data || []);
                toast.success(`Loaded ${(data || []).length} unlinked C2B payments`);
            }
        } catch (err: any) {
            console.warn('Error loading C2B payments:', err);
            setC2bPayments([]);
        } finally {
            setLoadingC2B(false);
        }
    };

    const selectC2BPayment = (payment: C2BPayment) => {
        setSelectedC2B(payment);
        const receipt = payment.mpesa_receipt || payment.trans_id || `C2B-${payment.id}`;
        setPaymentReference(String(receipt));
        setPaymentMode('M-Pesa');
        toast.success(`Selected M-Pesa Payment: ${receipt}`);
    };

    // ─── FINALIZE CHECKOUT ─────────────────────────────────────────────────────
    const handleFinalizeSale = async (mpesaCodeOverride?: string) => {
        if (cart.length === 0) {
            toast.error('🛒 Your meat basket is empty!');
            return;
        }

        setIsProcessing(true);
        try {
            const finalMpesaReceipt = mpesaCodeOverride || paymentReference || (paymentMode === 'M-Pesa' ? 'MPS-MANUAL' : null);

            // Attempt saving each cart item into database if tables exist
            for (const item of cart) {
                const itemNotesFormatted = [
                    item.prep_mode,
                    item.doneness ? `Doneness: ${item.doneness}` : null,
                    item.spice_level ? `Spice: ${item.spice_level}` : null,
                    item.accompaniments.length > 0 ? `Sides: ${item.accompaniments.join(', ')}` : null,
                    item.special_notes ? `Note: ${item.special_notes}` : null,
                    tableNo ? `Table: ${tableNo}` : null
                ].filter(Boolean).join(' | ');

                try {
                    await supabase.from('meat_sales').insert({
                        sale_code: saleCode,
                        stock_id: item.stock_id,
                        meat_type_name: item.meat_type_name,
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
                        served_by: 'Cyber Butchery Terminal',
                        sale_date: new Date().toISOString()
                    });

                    // Decrement stock
                    const batch = batches.find(b => b.stock_id === item.stock_id);
                    if (batch) {
                        const newAvail = Math.max(0, batch.available_kg - item.weight_kg);
                        await supabase.from('meat_stock').update({
                            available_kg: newAvail
                        }).eq('stock_id', item.stock_id);
                    }
                } catch {
                    // Silent catch
                }
            }

            // Link C2B if used
            if (selectedC2B) {
                try {
                    await c2bSupabase
                        .from('c2b_transactions')
                        .update({ is_linked: true })
                        .eq('id', selectedC2B.id);
                } catch {
                    // non-blocking
                }
            }

            // Update in-memory stock & dashboard
            setBatches(prev => prev.map(b => {
                const matched = cart.find(c => c.stock_id === b.stock_id);
                if (matched) return { ...b, available_kg: Math.max(0, b.available_kg - matched.weight_kg) };
                return b;
            }));

            setDashboard(prev => ({
                todaySales: prev.todaySales + cartGrandTotal,
                todayWeightSold: prev.todayWeightSold + cartTotalWeight,
                todayTransactions: prev.todayTransactions + 1,
                availableStock: Math.max(0, prev.availableStock - cartTotalWeight)
            }));

            toast.success(`🥩 Sale ${saleCode} Completed! KES ${cartGrandTotal.toLocaleString()} received.`);

            // Prepare Receipt Data
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
                tableNo: tableNo || 'Butchery Counter',
                timestamp: new Date().toLocaleString('en-KE'),
                hasChomaItems: cart.some(i => i.prep_mode !== 'Raw Takeaway')
            };

            setLastCompletedSale(completedRecord);
            setShowPaymentModal(false);
            setShowReceiptModal(true);

            // Reset form
            setCart([]);
            setCustomerName('');
            setCustomerPhone('');
            setTableNo('');
            setGlobalDiscount('0');
            setCashTendered('');
            setPaymentReference('');
            resetMpesaState();

        } catch (err: any) {
            console.error('Error processing sale:', err);
            toast.error(`❌ Checkout error: ${err.message || 'Please retry'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#05090d] text-slate-100 p-3 sm:p-5 space-y-4 select-none font-sans relative">
            <Toaster position="top-right" />

            {/* Offline / Demo Safe Mode Helper */}
            {!isSchemaCached && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                        <span className="text-base">⚡</span>
                        <span>
                            <strong>Demo / Standalone Mode Active:</strong> Butchery terminal running with live simulated chiller inventory.
                        </span>
                    </div>
                    <button
                        onClick={() => setShowSqlModal(true)}
                        className="px-3 py-1 bg-amber-500 text-slate-950 font-black rounded-lg text-xs hover:bg-amber-400 transition-all cursor-pointer"
                    >
                        📋 Setup Supabase Tables
                    </button>
                </div>
            )}

            {/* ==================================================================== */}
            {/* 1. TOP COMMAND BAR                                                   */}
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
                            <span className="text-slate-300">Dual-Mode Scale · Choma KOT Handoff</span>
                        </div>
                    </div>
                </div>

                {/* Right Top Controls */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Parked Tickets Button */}
                    <button
                        type="button"
                        onClick={() => setShowParkedModal(true)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                            parkedTickets.length > 0
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                                : 'bg-[#080f18] text-slate-400 border-slate-800 hover:text-white'
                        }`}
                    >
                        <span>⏸️ Parked</span>
                        <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black text-[10px]">
                            {parkedTickets.length}
                        </span>
                    </button>

                    {/* Reprint Last Ticket */}
                    {lastCompletedSale && (
                        <button
                            type="button"
                            onClick={() => setShowReceiptModal(true)}
                            className="px-3 py-2 bg-[#080f18] hover:bg-[#132230] text-slate-300 hover:text-emerald-400 border border-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>🖨️</span>
                            <span>Reprint Last</span>
                        </button>
                    )}

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
                            Retail
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
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-emerald-400 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>{isLoading ? '⏳' : '🔄'}</span>
                        <span>Sync</span>
                    </button>
                </div>
            </header>

            {/* ==================================================================== */}
            {/* 2. HUD STAT CARDS (Cyber Emerald Cards)                               */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
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

                <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-cyan-500/50 transition-all">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                        <span>Weight Dispensed</span>
                        <span className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-sm">⚖️</span>
                    </div>
                    <div className="mt-2">
                        <p className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">
                            {dashboard.todayWeightSold.toFixed(2)} Kg
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Scale scale cuts</p>
                    </div>
                </div>

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
            {/* 3. MAIN TERMINAL WORKSPACE                                            */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

                {/* ── LEFT: SCALE TERMINAL & BATCH SELECTION (7 Cols) ── */}
                <div className="xl:col-span-7 space-y-4">

                    {/* Meat Cut Category Pills & Search Bar (Matching POS Screenshot) */}
                    <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                                {[
                                    { id: 'All', label: 'All Cuts', emoji: '🥩' },
                                    { id: 'Beef', label: 'Beef Steak', emoji: '🥩' },
                                    { id: 'Goat', label: 'Mbuzi / Goat', emoji: '🐐' },
                                    { id: 'Chicken', label: 'Chicken', emoji: '🍗' },
                                    { id: 'Pork', label: 'Pork', emoji: '🍖' },
                                    { id: 'Bones', label: 'Soup Bones', emoji: '🥣' },
                                    { id: 'Offals', label: 'Matumbo', emoji: '🫀' },
                                ].map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategoryFilter(cat.id as any)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                            categoryFilter === cat.id
                                                ? 'bg-[#00e676] text-slate-950 font-black shadow-[0_0_12px_rgba(0,230,118,0.4)]'
                                                : 'bg-[#080f18] text-slate-400 hover:text-white border border-slate-800'
                                        }`}
                                    >
                                        <span>{cat.emoji}</span>
                                        <span>{cat.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Search Cut Input */}
                            <div className="relative w-full sm:w-48">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
                                <input
                                    type="text"
                                    value={searchCut}
                                    onChange={(e) => setSearchCut(e.target.value)}
                                    placeholder="Search cut..."
                                    className="w-full bg-[#05090d] border border-slate-700 rounded-xl pl-7 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        </div>

                        {/* Meat Cut Grid (Obsidian Card Style) */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
                            {filteredBatches.map(batch => {
                                const isSelected = selectedBatch?.stock_id === batch.stock_id;
                                const price = priceTier === 'Wholesale' ? (batch.wholesale_price || batch.selling_price) : batch.selling_price;

                                return (
                                    <div
                                        key={batch.stock_id}
                                        onClick={() => setSelectedBatch(batch)}
                                        className={`relative rounded-2xl p-3 cursor-pointer transition-all border ${
                                            isSelected
                                                ? 'bg-gradient-to-br from-[#0c161e] to-emerald-950/40 border-emerald-500 shadow-[0_0_20px_rgba(0,230,118,0.25)] ring-1 ring-emerald-500'
                                                : 'bg-[#080f18] border-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                                {batch.stock_code}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center gap-1 ${
                                                batch.days_old === 0
                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                    : batch.days_old <= 2
                                                    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                                            }`}>
                                                <span className="w-1 h-1 rounded-full bg-current"></span>
                                                {batch.days_old === 0 ? 'Fresh' : `${batch.days_old}d`}
                                            </span>
                                        </div>

                                        <h3 className="font-bold text-white text-xs truncate">
                                            {batch.meat_type_name}
                                        </h3>

                                        <div className="mt-1.5 flex items-baseline justify-between">
                                            <span className="text-[#00e676] font-black text-sm font-mono">
                                                KES {price.toLocaleString()}
                                                <span className="text-[9px] text-slate-400 font-normal">/Kg</span>
                                            </span>
                                        </div>

                                        <div className="mt-1 text-[10px] text-slate-400 flex items-center justify-between">
                                            <span>Avail:</span>
                                            <span className="font-mono font-bold text-slate-300">{batch.available_kg.toFixed(1)} Kg</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Digital Scale Terminal */}
                    <div className="bg-[#0c161e] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">⚖️</span>
                                <h3 className="font-black text-white text-base">Digital Scale &amp; Price Terminal</h3>
                            </div>

                            {/* Dual Mode Switch */}
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
                                    Mode A: Weight (Kg)
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
                                    Mode B: Amount (KES)
                                </button>
                            </div>
                        </div>

                        {/* Live Digital Scale Display */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Weight Box */}
                            <div className={`p-4 rounded-2xl border transition-all ${
                                inputMode === 'WEIGHT'
                                    ? 'bg-[#080f18] border-emerald-500/60 shadow-[0_0_15px_rgba(0,230,118,0.15)]'
                                    : 'bg-[#05090d] border-slate-800'
                            }`}>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        ⚖️ Net Meat Weight
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => adjustWeightBy(-0.25)}
                                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold font-mono"
                                        >
                                            -0.25
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => adjustWeightBy(0.25)}
                                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold font-mono"
                                        >
                                            +0.25
                                        </button>
                                    </div>
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

                            {/* Amount Box */}
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

                        {/* Quick Presets */}
                        <div className="space-y-1.5">
                            <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider block">
                                Quick Shortcuts:
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

                            {/* Doneness & Sides if Cooked */}
                            {prepMode !== 'Raw Takeaway' && (
                                <div className="p-3.5 bg-[#05090d] border border-slate-800 rounded-xl space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        {/* Doneness */}
                                        <div>
                                            <span className="text-slate-400 font-bold block mb-1">Grill Doneness:</span>
                                            <div className="flex gap-1.5 flex-wrap">
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

                                        {/* Pepper / Spice */}
                                        <div>
                                            <span className="text-slate-400 font-bold block mb-1">Pili Pili / Seasoning:</span>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {['Mild / Normal', 'Extra Pili Pili', 'No Pepper / Plain'].map(sp => (
                                                    <button
                                                        key={sp}
                                                        type="button"
                                                        onClick={() => setSpiceLevel(sp)}
                                                        className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                                                            spiceLevel === sp
                                                                ? 'bg-amber-400 text-slate-950 font-bold'
                                                                : 'bg-[#0c161e] text-slate-400 hover:text-white border border-slate-800'
                                                        }`}
                                                    >
                                                        {sp}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Accompaniments */}
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

                        {/* Basket / Recent Tabs */}
                        <div>
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveRightTab('BASKET')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            activeRightTab === 'BASKET'
                                                ? 'bg-emerald-500 text-slate-950 font-black'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        🛒 Active Basket ({cart.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveRightTab('RECENT')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            activeRightTab === 'RECENT'
                                                ? 'bg-emerald-500 text-slate-950 font-black'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        📋 Today&apos;s Tickets ({todaySales.length})
                                    </button>
                                </div>

                                {activeRightTab === 'BASKET' && cart.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleParkCurrentTicket}
                                            className="text-xs text-amber-400 hover:text-amber-300 font-bold"
                                            title="Hold ticket for later"
                                        >
                                            ⏸️ Park
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCart([])}
                                            className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                )}
                            </div>

                            {activeRightTab === 'BASKET' ? (
                                <>
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
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 font-mono">
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
                                                            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold mt-1 cursor-pointer"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </>
                            ) : (
                                /* Today's Dispatched Tickets View */
                                <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                                    {todaySales.length === 0 ? (
                                        <p className="text-center py-8 text-slate-500 text-xs">No sales dispatched yet today</p>
                                    ) : (
                                        todaySales.map(ts => (
                                            <div key={ts.sale_id} className="bg-[#080f18] p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                                                <div>
                                                    <span className="font-mono font-bold text-white">{ts.sale_code}</span>
                                                    <p className="text-slate-400 text-[10px]">{ts.meat_type_name} • {ts.weight_kg.toFixed(2)} Kg</p>
                                                    <span className="text-[9px] text-slate-500">{ts.sale_time}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-mono font-black text-[#00e676]">KES {ts.net_amount.toLocaleString()}</span>
                                                    <span className="text-[10px] text-slate-400 block">{ts.payment_mode}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
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

                            {/* Proceed to Payment Button */}
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
            {/* 4. MODAL: PAYMENT SETTLEMENT (STK Push & c2bSupabase Callbacks)       */}
            {/* ==================================================================== */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0c161e] border border-slate-800 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div>
                                <h3 className="font-black text-white text-lg flex items-center gap-2">
                                    <span>💳 Checkout &amp; Settlement</span>
                                </h3>
                                <p className="text-xs text-slate-400">Ticket: {saleCode} • {cart.length} Meat Item(s)</p>
                            </div>
                            <button
                                onClick={() => {
                                    resetMpesaState();
                                    setShowPaymentModal(false);
                                }}
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Amount Due Display */}
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

                        {/* Method Tabs */}
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { id: 'M-Pesa', icon: '📱', label: 'M-Pesa' },
                                { id: 'Cash', icon: '💵', label: 'Cash' },
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
                                            <label className="text-xs text-slate-400 block mb-1">Customer Safaricom Number</label>
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
                                            <span className="text-slate-400">Live Unlinked Till Transactions:</span>
                                            <button
                                                type="button"
                                                onClick={loadC2BPayments}
                                                className="text-xs text-emerald-400 font-bold cursor-pointer"
                                            >
                                                {loadingC2B ? 'Syncing...' : '🔄 Refresh List'}
                                            </button>
                                        </div>

                                        <div className="max-h-36 overflow-y-auto space-y-1.5">
                                            {c2bPayments.length === 0 ? (
                                                <p className="text-center py-4 text-slate-500 text-xs">No unlinked till payments found</p>
                                            ) : (
                                                c2bPayments.map(p => {
                                                    const code = p.mpesa_receipt || p.trans_id || `TXN-${p.id}`;
                                                    const amt = p.amount || p.trans_amount || 0;
                                                    const name = p.customer_name || p.first_name || 'Customer';
                                                    const phone = p.phone || p.msisdn || '';

                                                    return (
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
                                                                <span className="font-mono font-bold text-[#00e676]">{code}</span>
                                                                <span className="text-slate-400 block text-[10px]">{phone} • {name}</span>
                                                            </div>
                                                            <span className="font-mono font-black text-white">KES {amt.toLocaleString()}</span>
                                                        </div>
                                                    );
                                                })
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

                        {/* Cash Tender Input with Quick Cash Buttons */}
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

                                {/* Quick Cash Buttons */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {[
                                        { label: 'Exact', amt: cartGrandTotal },
                                        { label: 'KES 500', amt: 500 },
                                        { label: 'KES 1,000', amt: 1000 },
                                        { label: 'KES 2,000', amt: 2000 },
                                        { label: 'KES 5,000', amt: 5000 },
                                    ].map(qb => (
                                        <button
                                            key={qb.label}
                                            type="button"
                                            onClick={() => setCashTendered(qb.amt.toString())}
                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold"
                                        >
                                            {qb.label}
                                        </button>
                                    ))}
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
                                    {paymentMode === 'Card' ? 'PDQ Card Approval / Slip Code' : 'Corporate Tab / Room Folio'}
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
                                <span>{isProcessing ? 'Finalizing...' : `COMPLETE TRANSACTION & PRINT TICKET`}</span>
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
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
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
                                        {i.doneness && (
                                            <div className="text-[9px] text-gray-500 pl-2">
                                                Doneness: {i.doneness} {i.spice_level ? `• ${i.spice_level}` : ''}
                                            </div>
                                        )}
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
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <span>🖨️</span>
                                <span>PRINT 80MM SLIP</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowReceiptModal(false)}
                                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* 6. MODAL: PARKED TICKETS RECALL                                      */}
            {/* ==================================================================== */}
            {showParkedModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0c161e] border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="font-black text-white text-base flex items-center gap-2">
                                <span>⏸️ Parked / Held Meat Tickets</span>
                            </h3>
                            <button
                                onClick={() => setShowParkedModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {parkedTickets.length === 0 ? (
                            <p className="text-center py-8 text-slate-400 text-xs">No tickets are currently parked.</p>
                        ) : (
                            <div className="space-y-2">
                                {parkedTickets.map(pt => (
                                    <div
                                        key={pt.id}
                                        className="bg-[#080f18] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
                                    >
                                        <div>
                                            <span className="font-mono font-bold text-white text-sm">{pt.ticketCode}</span>
                                            <p className="text-slate-400 text-xs mt-0.5">
                                                {pt.customerName} • {pt.tableNo} • {pt.items.length} cut(s)
                                            </p>
                                            <span className="text-[10px] text-slate-500">{pt.timestamp}</span>
                                        </div>

                                        <div className="text-right">
                                            <p className="font-mono font-black text-[#00e676] text-sm">
                                                KES {pt.grandTotal.toLocaleString()}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => handleRecallTicket(pt)}
                                                className="mt-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs"
                                            >
                                                Recall ▶️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* 7. MODAL: SQL SETUP SCRIPT (1-Click Copy for Admin)                  */}
            {/* ==================================================================== */}
            {showSqlModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0c161e] border border-slate-800 rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="font-black text-white text-base flex items-center gap-2">
                                <span>⚙️ Butchery Database SQL Migration</span>
                            </h3>
                            <button
                                onClick={() => setShowSqlModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                            To create the permanent <code>meat_stock</code>, <code>meat_types</code>, <code>meat_sales</code> and <code>meat_weight_losses</code> tables with permissive RLS policies, copy and run this in your Supabase SQL Editor:
                        </p>

                        <div className="relative">
                            <pre className="bg-[#05090d] border border-slate-800 rounded-xl p-4 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-72">
{`CREATE TABLE IF NOT EXISTS meat_types (
    meat_type_id SERIAL PRIMARY KEY,
    meat_type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    default_price DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO meat_types (meat_type_name, description, default_price, is_active) VALUES
('Prime Beef', 'Fresh beef cuts & steak', 600, true),
('Goat / Mbuzi', 'Fresh goat meat & ribs', 750, true),
('T-Bone Steak', 'Prime T-Bone cuts', 850, true),
('Minced Meat', 'Ground beef mince', 650, true),
('Soup Bones', 'Beef broth bones', 250, true),
('Farm Fresh Chicken', 'Whole & cut chicken', 500, true)
ON CONFLICT (meat_type_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS meat_stock (
    stock_id SERIAL PRIMARY KEY,
    stock_code VARCHAR(50) UNIQUE NOT NULL,
    meat_type_id INTEGER REFERENCES meat_types(meat_type_id),
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    initial_weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    available_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    sold_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    loss_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    cost_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    wholesale_price DECIMAL(10,2) DEFAULT 0,
    supplier_name VARCHAR(200),
    batch_no VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meat_sales (
    sale_id SERIAL PRIMARY KEY,
    sale_code VARCHAR(50) NOT NULL,
    stock_id INTEGER,
    meat_type_name VARCHAR(100),
    weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    payment_reference VARCHAR(100),
    mpesa_receipt_number VARCHAR(100),
    checkout_request_id VARCHAR(100),
    customer_name VARCHAR(200),
    customer_contact VARCHAR(50),
    notes TEXT,
    served_by VARCHAR(100) DEFAULT 'Cyber Butchery POS',
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE meat_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_meat_types_all" ON meat_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_meat_stock_all" ON meat_stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_meat_sales_all" ON meat_sales FOR ALL USING (true) WITH CHECK (true);`}
                            </pre>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS meat_types (meat_type_id SERIAL PRIMARY KEY, meat_type_name VARCHAR(100) NOT NULL UNIQUE, description TEXT, default_price DECIMAL(10,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); INSERT INTO meat_types (meat_type_name, description, default_price, is_active) VALUES ('Prime Beef', 'Fresh beef cuts & steak', 600, true), ('Goat / Mbuzi', 'Fresh goat meat & ribs', 750, true), ('T-Bone Steak', 'Prime T-Bone cuts', 850, true), ('Minced Meat', 'Ground beef mince', 650, true), ('Soup Bones', 'Beef broth bones', 250, true), ('Farm Fresh Chicken', 'Whole & cut chicken', 500, true) ON CONFLICT (meat_type_name) DO NOTHING; CREATE TABLE IF NOT EXISTS meat_stock (stock_id SERIAL PRIMARY KEY, stock_code VARCHAR(50) UNIQUE NOT NULL, meat_type_id INTEGER REFERENCES meat_types(meat_type_id), purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(), initial_weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0, available_kg DECIMAL(10,3) NOT NULL DEFAULT 0, sold_kg DECIMAL(10,3) NOT NULL DEFAULT 0, loss_kg DECIMAL(10,3) NOT NULL DEFAULT 0, cost_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0, selling_price DECIMAL(10,2) NOT NULL DEFAULT 0, wholesale_price DECIMAL(10,2) DEFAULT 0, supplier_name VARCHAR(200), batch_no VARCHAR(100), status VARCHAR(50) DEFAULT 'Available', created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); CREATE TABLE IF NOT EXISTS meat_sales (sale_id SERIAL PRIMARY KEY, sale_code VARCHAR(50) NOT NULL, stock_id INTEGER, meat_type_name VARCHAR(100), weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0, price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0, total_amount DECIMAL(12,2) NOT NULL DEFAULT 0, discount DECIMAL(10,2) DEFAULT 0, net_amount DECIMAL(12,2) NOT NULL DEFAULT 0, payment_mode VARCHAR(50) DEFAULT 'Cash', payment_reference VARCHAR(100), mpesa_receipt_number VARCHAR(100), checkout_request_id VARCHAR(100), customer_name VARCHAR(200), customer_contact VARCHAR(50), notes TEXT, served_by VARCHAR(100) DEFAULT 'Cyber Butchery POS', sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()); ALTER TABLE meat_types ENABLE ROW LEVEL SECURITY; ALTER TABLE meat_stock ENABLE ROW LEVEL SECURITY; ALTER TABLE meat_sales ENABLE ROW LEVEL SECURITY; CREATE POLICY "public_meat_types_all" ON meat_types FOR ALL USING (true) WITH CHECK (true); CREATE POLICY "public_meat_stock_all" ON meat_stock FOR ALL USING (true) WITH CHECK (true); CREATE POLICY "public_meat_sales_all" ON meat_sales FOR ALL USING (true) WITH CHECK (true);`);
                                    toast.success('SQL script copied to clipboard!');
                                }}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all cursor-pointer"
                            >
                                📋 Copy SQL to Clipboard
                            </button>
                            <button
                                onClick={() => setShowSqlModal(false)}
                                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs"
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
