'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SaleItem {
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface Sale {
    sale_id: number;
    receipt_no: string;
    total_amount: number;
    amount_paid: number;
    status: string;
    customer_name?: string;
    sale_datetime: string;
    waiter_name?: string;
    table_name?: string;
    table_no?: string;
    mpesa_code?: string;
    mpesa_receipt?: string;
    checkout_request_id?: string;
    customer_phone?: string;
    updated_at?: string;
}

type PayState = 'idle' | 'sending' | 'waiting' | 'success' | 'insufficient' | 'cancelled' | 'failed' | 'timeout';

// ── Confetti particle component ──────────────────────────────────────────────
function Confetti() {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];
    const particles = Array.from({ length: 70 }, (_, i) => ({
        id: i,
        color: colors[i % colors.length],
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 2 + Math.random() * 2.5,
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
    }));
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: 9999 }}>
            <style>{`
                @keyframes fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
                @keyframes sway{0%,100%{margin-left:0}50%{margin-left:30px}}
            `}</style>
            {particles.map(p => (
                <div key={p.id} style={{
                    position: 'absolute', left: `${p.left}%`, top: '-20px',
                    width: `${p.size}px`, height: `${p.size * 0.4}px`,
                    background: p.color, borderRadius: p.id % 3 === 0 ? '50%' : '2px',
                    animation: `fall ${p.duration}s ${p.delay}s linear infinite, sway ${p.duration * 0.7}s ${p.delay}s ease-in-out infinite`,
                    transform: `rotate(${p.rotate}deg)`,
                }} />
            ))}
        </div>
    );
}

// ── Fireworks sparkle ────────────────────────────────────────────────────────
function Fireworks() {
    const bursts = [
        { top: '12%', left: '10%' }, { top: '18%', right: '10%' },
        { top: '8%', left: '50%' }, { top: '25%', left: '25%' },
        { top: '15%', right: '25%' },
    ];
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9998 }}>
            <style>{`
                @keyframes firework{0%{transform:scale(0) rotate(0deg);opacity:1}100%{transform:scale(1.4) rotate(180deg);opacity:0}}
            `}</style>
            {bursts.map((b, i) => (
                <div key={i} style={{ position: 'absolute', ...b, fontSize: 32, animation: `firework 1.5s ${i * 0.3}s ease-out infinite` }}>✨</div>
            ))}
        </div>
    );
}

export default function PayPage({ params }: { params: { receiptNo: string } }) {
    const receiptNo = decodeURIComponent(params.receiptNo);
    const [sale, setSale] = useState<Sale | null>(null);
    const [items, setItems] = useState<SaleItem[]>([]);
    const [hotelName, setHotelName] = useState('AlphaPlus Hotel');
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Privacy lock state: If bill is already paid, hide all item details, waiter, table, etc.
    const [isAlreadyPaid, setIsAlreadyPaid] = useState(false);
    // True only if the payment was completed in THIS active browser session
    const [justPaidSuccess, setJustPaidSuccess] = useState(false);

    const [phone, setPhone] = useState('');
    const [payState, setPayState] = useState<PayState>('idle');
    const [mpesaCode, setMpesaCode] = useState('');
    const [paidPhone, setPaidPhone] = useState('');
    const [paidAt, setPaidAt] = useState('');
    const [msg, setMsg] = useState('');
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadAll();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    async function loadAll() {
        setLoading(true);
        try {
            // Load hotel name
            const { data: settings } = await supabase.from('organisation_settings')
                .select('setting_value').eq('setting_key', 'hotel_name').single();
            if (settings?.setting_value) setHotelName(settings.setting_value);

            // Load sale
            const { data: s } = await supabase.from('sales').select('*').eq('receipt_no', receiptNo).single();
            if (!s) {
                setNotFound(true);
                setLoading(false);
                return;
            }

            // Check if this bill is ALREADY fully paid
            const isSettled = (
                s.status === 'Paid' ||
                s.status === 'Completed' ||
                ((s.amount_paid || 0) >= (s.total_amount || 0) && (s.total_amount || 0) > 0)
            );

            if (isSettled) {
                // 🔒 CRITICAL PRIVACY & SECURITY REQUIREMENT:
                // Once a bill has been paid, if anyone scans the QR code again (e.g. if the receipt was lost
                // or discarded and another person picks it up), DO NOT fetch or expose order items,
                // table numbers, waiter identity, or customer phone!
                setSale({
                    sale_id: s.sale_id,
                    receipt_no: s.receipt_no,
                    total_amount: s.total_amount || 0,
                    amount_paid: s.amount_paid || s.total_amount || 0,
                    status: 'Paid',
                    sale_datetime: s.sale_datetime,
                    updated_at: s.updated_at,
                    mpesa_code: s.mpesa_code || s.mpesa_receipt || undefined
                });
                setIsAlreadyPaid(true);
                setLoading(false);
                return; // Stop here! Do NOT query sales_items table!
            }

            // Unpaid bill: load items so active paying customer can review their current bill
            setSale(s);
            const { data: it } = await supabase.from('sales_items').select('*').eq('sale_id', s.sale_id);
            setItems(it || []);
        } catch (e) {
            console.error('Error loading bill:', e);
        } finally {
            setLoading(false);
        }
    }

    function fmt(raw: string) {
        let p = raw.replace(/\s|-|\+/g, '');
        if (p.startsWith('0')) p = '254' + p.slice(1);
        else if (!p.startsWith('254')) p = '254' + p;
        return p;
    }

    function valid(raw: string) {
        return /^(07\d{8}|01\d{8}|254\d{9})$/.test(raw.replace(/\s|-|\+/g, ''));
    }

    async function handlePay() {
        if (!sale || !valid(phone)) {
            setMsg('Please enter a valid Safaricom number (07xx or 01xx)');
            return;
        }
        const outstanding = sale.total_amount - (sale.amount_paid || 0);
        if (outstanding <= 0) {
            setMsg('This bill is already fully paid!');
            return;
        }
        setPayState('sending');
        setMsg('');
        const formatted = fmt(phone);
        setPaidPhone(formatted);
        try {
            const res = await fetch('/api/mpesa/stkpush', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: formatted,
                    amount: outstanding,
                    reference: sale.receipt_no,
                    description: `Bill Payment - ${sale.receipt_no}`
                })
            });
            const data = await res.json();
            if (!data.success || !data.checkoutRequestId) {
                setPayState('failed');
                setMsg(data.error || 'Failed to send STK push. Try again.');
                return;
            }
            setPayState('waiting');
            poll(data.checkoutRequestId, outstanding);
            timeoutRef.current = setTimeout(() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setPayState('timeout');
                setMsg('Payment timed out. Please try again.');
            }, 150000);
        } catch {
            setPayState('failed');
            setMsg('Network error. Please try again.');
        }
    }

    function poll(cid: string, amount: number) {
        pollRef.current = setInterval(async () => {
            try {
                // Check sales table first (M-Pesa callback updates it)
                const { data: s } = await supabase.from('sales')
                    .select('status,mpesa_code,mpesa_receipt,updated_at,amount_paid')
                    .eq('receipt_no', receiptNo)
                    .single();

                if (s?.status === 'Paid' && (s?.mpesa_code || s?.mpesa_receipt)) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    const code = s.mpesa_code || s.mpesa_receipt || '';
                    setMpesaCode(code);
                    setPayState('success');
                    setJustPaidSuccess(true);
                    setPaidAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
                    setSale(prev => prev ? { ...prev, status: 'Paid', mpesa_code: code, amount_paid: amount } : prev);
                    return;
                }

                // Check API status endpoint
                const r = await fetch(`/api/mpesa/check-status?checkoutRequestId=${cid}`);
                const d = await r.json();
                if (d.status === 'pending' || d.pending) return;
                const code = d.resultCode ?? d.ResultCode;
                if (code === 4999 || code === undefined || code === null) return;

                if (pollRef.current) clearInterval(pollRef.current);
                if (timeoutRef.current) clearTimeout(timeoutRef.current);

                if (code === 0) {
                    const rc = d.mpesaReceipt || d.MpesaReceiptNumber || '';
                    setMpesaCode(rc);
                    setPayState('success');
                    setJustPaidSuccess(true);
                    setPaidAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
                    await supabase.from('sales').update({
                        status: 'Paid',
                        payment_method: 'M-Pesa',
                        amount_paid: amount,
                        mpesa_code: rc
                    }).eq('receipt_no', receiptNo);
                } else if (code === 1) {
                    setPayState('insufficient');
                    setMsg('Insufficient M-Pesa balance. Please top up and try again.');
                } else if (code === 1032 || code === 17) {
                    setPayState('cancelled');
                    setMsg('Payment cancelled. Please try again when ready.');
                } else if (code === 2001) {
                    setPayState('failed');
                    setMsg('Wrong PIN entered. Please try again.');
                } else {
                    setPayState('failed');
                    setMsg(`Payment failed (Code: ${code}). Please try again.`);
                }
            } catch { }
        }, 5000);
    }

    const outstanding = sale ? Math.max(0, (sale.total_amount || 0) - (sale.amount_paid || 0)) : 0;
    const now = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // ── LOADING STATE ──────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg,#0f172a,#1e293b,#0f172a)',
                fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
                color: '#fff'
            }}>
                <style>{`
                    @keyframes spin-slow{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
                `}</style>
                <div style={{
                    width: 52,
                    height: 52,
                    border: '4px solid rgba(16,185,129,0.2)',
                    borderTopColor: '#10b981',
                    borderRadius: '50%',
                    animation: 'spin-slow 0.8s linear infinite'
                }} />
                <p style={{ marginTop: 18, fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>Verifying receipt details...</p>
            </div>
        );
    }

    // ── NOT FOUND ──────────────────────────────────────────────────────────────
    if (notFound) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
                padding: 24,
                color: '#fff'
            }}>
                <div style={{ fontSize: 64, marginBottom: 12 }}>🔍</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px', color: '#f1f5f9' }}>Receipt Not Found</h2>
                <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', maxWidth: 360, margin: 0 }}>
                    Receipt <strong>{receiptNo}</strong> does not exist in the system or has expired.
                </p>
            </div>
        );
    }

    // ── 🔒 CASE 1: BILL ALREADY PAID (SECURE PRIVACY-PROTECTED VIEW) ───────────
    // When the QR code is scanned again AFTER payment (e.g. if someone picks up a lost receipt),
    // this view is displayed: ONLY "BILL PAID" with NO items, NO prices, NO table, NO waiter!
    if (isAlreadyPaid) {
        const settledDateStr = sale?.updated_at || sale?.sale_datetime;
        const settledDateFormatted = settledDateStr
            ? new Date(settledDateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : now;

        return (
            <div style={{
                minHeight: '100vh',
                background: 'radial-gradient(ellipse at top, #064e3b 0%, #0f172a 70%, #022c22 100%)',
                fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
                padding: '28px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: '#fff'
            }}>
                <style>{`
                    @keyframes shield-pulse{0%,100%{box-shadow:0 0 25px rgba(16,185,129,0.4), inset 0 0 15px rgba(16,185,129,0.3)}50%{box-shadow:0 0 50px rgba(16,185,129,0.8), inset 0 0 25px rgba(16,185,129,0.5)}}
                    @keyframes fade-slide{0%{transform:translateY(24px);opacity:0}100%{transform:translateY(0);opacity:1}}
                    @keyframes gentle-pulse{0%,100%{opacity:1}50%{opacity:0.6}}
                `}</style>

                {/* Hotel Header */}
                <div style={{ textAlign: 'center', marginBottom: 20, animation: 'fade-slide 0.5s ease-out both' }}>
                    <div style={{ fontSize: 34, marginBottom: 4 }}>🏨</div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: 0.5, color: '#f8fafc' }}>
                        {hotelName}
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                        Official Digital Receipt Verification
                    </p>
                </div>

                {/* Main Glassmorphic Privacy Shield Card */}
                <div style={{
                    width: '100%',
                    maxWidth: 420,
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 24,
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
                    padding: '30px 22px',
                    animation: 'fade-slide 0.6s 0.1s ease-out both',
                    textAlign: 'center'
                }}>
                    {/* Glowing Shield Icon */}
                    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                        <div style={{
                            width: 96,
                            height: 96,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto',
                            fontSize: 48,
                            animation: 'shield-pulse 2.4s ease-in-out infinite'
                        }}>
                            🛡️
                        </div>
                        <div style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#047857',
                            border: '2px solid #fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16,
                            fontWeight: 900,
                            color: '#fff'
                        }}>
                            ✓
                        </div>
                    </div>

                    {/* Prominent Paid Headline */}
                    <h2 style={{
                        color: '#fff',
                        fontSize: 26,
                        fontWeight: 900,
                        letterSpacing: 0.5,
                        margin: '0 0 6px',
                        textTransform: 'uppercase'
                    }}>
                        BILL ALREADY PAID
                    </h2>
                    <p style={{ color: '#34d399', fontSize: 13, fontWeight: 700, margin: '0 0 20px' }}>
                        ✓ Payment Confirmed & Settled in Full
                    </p>

                    {/* Settlement Facts Card */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        borderRadius: 16,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '14px 16px',
                        marginBottom: 16,
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Receipt Number</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>{receiptNo}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Payment Status</span>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 10px',
                                borderRadius: 20,
                                background: 'rgba(16,185,129,0.2)',
                                border: '1px solid rgba(16,185,129,0.4)',
                                color: '#34d399',
                                fontSize: 11,
                                fontWeight: 800
                            }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                                PAID IN FULL
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Settlement Time</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{settledDateFormatted}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Outstanding Balance</span>
                            <span style={{ fontSize: 15, fontWeight: 900, color: '#34d399', fontFamily: 'monospace' }}>Ksh 0.00</span>
                        </div>
                    </div>

                    {/* 🔒 PRIVACY PROTECTION NOTICE — EXPLICITLY HIDDEN ORDER DETAILS */}
                    <div style={{
                        background: 'rgba(6, 78, 59, 0.45)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: 16,
                        padding: '14px 16px',
                        marginBottom: 16,
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 18 }}>🔒</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#a7f3d0' }}>Customer Privacy Protected</span>
                        </div>
                        <p style={{
                            margin: 0,
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: 'rgba(255, 255, 255, 0.85)'
                        }}>
                            This bill has already been settled. In the event this printed receipt was lost, misplaced, or picked up by another individual, <strong>all itemized order contents, table seating, waiter identity, and contact information are permanently locked</strong> to safeguard customer confidentiality.
                        </p>
                    </div>

                    {/* Double-Payment Block Notice */}
                    <div style={{
                        background: 'rgba(30, 58, 138, 0.35)',
                        border: '1px solid rgba(96, 165, 250, 0.3)',
                        borderRadius: 14,
                        padding: '10px 14px',
                        marginBottom: 18
                    }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe', fontWeight: 600 }}>
                            ⚠️ No further payment is required or accepted for this receipt.
                        </p>
                    </div>

                    {/* Verified Badge */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 20,
                        padding: '6px 16px',
                        fontSize: 11,
                        color: 'rgba(255, 255, 255, 0.8)'
                    }}>
                        ✓ Official Digital Verification • AlphaPlus POS
                    </div>
                </div>

                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 20 }}>
                    Powered by AlphaPlus POS System • {hotelName}
                </p>
            </div>
        );
    }

    // ── CASE 2: INSTANT PAYMENT SUCCESS (ACTIVE SESSION ONLY) ───────────────────
    // Customer just hit Pay via STK push in this exact browser tab right now.
    if (justPaidSuccess || payState === 'success') {
        const firstName = sale?.customer_name ? sale.customer_name.split(' ')[0] : 'Valued Guest';

        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg,#064e3b,#065f46,#047857)',
                fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: '#fff'
            }}>
                <Confetti />
                <Fireworks />
                <style>{`
                    @keyframes bounce-in{0%{transform:translateY(40px) scale(0.85);opacity:0}60%{transform:translateY(-6px) scale(1.03)}100%{transform:translateY(0) scale(1);opacity:1}}
                    @keyframes glow{0%,100%{box-shadow:0 0 30px rgba(16,185,129,0.6)}50%{box-shadow:0 0 60px rgba(16,185,129,1),0 0 80px rgba(52,211,153,0.5)}}
                `}</style>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 18, animation: 'bounce-in 0.6s ease-out both' }}>
                    <div style={{ fontSize: 36, marginBottom: 4 }}>🏨</div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{hotelName}</h1>
                    <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: 13 }}>Cashless Payment System 🌟</p>
                    <p style={{ margin: '2px 0 0', opacity: 0.7, fontSize: 11 }}>{now}</p>
                </div>

                {/* Success Card */}
                <div style={{
                    width: '100%',
                    maxWidth: 420,
                    background: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: 24,
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '26px 20px',
                    animation: 'bounce-in 0.7s 0.1s ease-out both'
                }}>
                    {/* Checkmark */}
                    <div style={{ textAlign: 'center', marginBottom: 18 }}>
                        <div style={{
                            width: 86,
                            height: 86,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg,#10b981,#059669)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto',
                            animation: 'glow 2s ease-in-out infinite',
                            fontSize: 44
                        }}>
                            ✅
                        </div>
                        <h2 style={{ color: '#fff', fontSize: 23, fontWeight: 900, margin: '12px 0 4px' }}>
                            Payment Successful! 🎉
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: 0 }}>
                            Your payment has been received and verified
                        </p>
                    </div>

                    {/* M-Pesa Code */}
                    <div style={{
                        background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                        borderRadius: 16,
                        padding: '14px 18px',
                        marginBottom: 16,
                        textAlign: 'center',
                        boxShadow: '0 8px 24px rgba(245,158,11,0.4)'
                    }}>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 3px' }}>
                            M-Pesa Transaction Code
                        </p>
                        <p style={{ color: '#fff', fontSize: 26, fontWeight: 900, letterSpacing: 3, margin: 0, fontFamily: 'monospace' }}>
                            {mpesaCode || 'CONFIRMED'}
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, margin: '4px 0 0' }}>
                            Amount Paid: Ksh {sale?.total_amount ? sale.total_amount.toFixed(2) : '0.00'}
                        </p>
                    </div>

                    {/* Privacy Alert for Active Customer */}
                    <div style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        marginBottom: 16,
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span>🔒</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#34d399' }}>Privacy Lock Activated</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                            Your bill is now cleared. If this page is reloaded or if the physical receipt QR code is scanned in the future, all order details will be locked to safeguard your privacy.
                        </p>
                    </div>

                    {/* Thank You Note */}
                    <div style={{
                        background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))',
                        borderRadius: 16,
                        padding: '16px',
                        textAlign: 'center',
                        border: '1px solid rgba(139,92,246,0.3)'
                    }}>
                        <div style={{ fontSize: 26, marginBottom: 4 }}>💎</div>
                        <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>
                            Thank You{firstName !== 'Valued Guest' ? `, ${firstName}` : ''}! 🙏
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: '0 0 8px', lineHeight: 1.5 }}>
                            We appreciate your visit and trust in our cashless POS. We look forward to serving you again!
                        </p>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>
                            ⭐ Valued Customer of {hotelName}
                        </div>
                    </div>

                    <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 16 }}>
                        Powered by AlphaPlus POS • {paidAt || now}
                    </p>
                </div>
            </div>
        );
    }

    // ── CASE 3: PENDING UNPAID BILL (ACTIVE CUSTOMER PAYMENT FORM) ──────────────
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(160deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%)',
            fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: '#fff'
        }}>
            <style>{`
                @keyframes bounce-in{0%{transform:translateY(30px) scale(0.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
                @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
                @keyframes spin-slow{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
                input:focus{outline:none;border-color:#3b82f6!important;box-shadow:0 0 0 3px rgba(59,130,246,0.25)!important;}
            `}</style>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 18, animation: 'bounce-in 0.5s ease-out both' }}>
                <div style={{ fontSize: 32, animation: 'float 3s ease-in-out infinite' }}>🏨</div>
                <h1 style={{ margin: '6px 0 2px', fontSize: 20, fontWeight: 900 }}>{hotelName}</h1>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Cashless Bill Payment • {now}</p>
                <div style={{ display: 'inline-block', marginTop: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: 11, color: '#34d399', fontWeight: 700 }}>
                    🔒 Secure M-Pesa STK Push
                </div>
            </div>

            <div style={{ width: '100%', maxWidth: 420, animation: 'bounce-in 0.5s 0.1s ease-out both' }}>
                {/* Bill Header */}
                <div style={{
                    background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)',
                    borderRadius: '20px 20px 0 0',
                    padding: '18px 20px',
                    textAlign: 'center',
                    color: '#fff'
                }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, opacity: 0.8, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>
                        Customer Bill
                    </p>
                    <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900 }}>{receiptNo}</h2>
                    {sale?.waiter_name && (
                        <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>👨‍🍳 Served by: <strong>{sale.waiter_name}</strong></p>
                    )}
                    {(sale?.table_name || sale?.table_no) && (
                        <p style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.8 }}>🪑 {sale?.table_name || sale?.table_no}</p>
                    )}
                </div>

                {/* Items Breakdown */}
                <div style={{ background: '#fff', padding: '16px 20px', color: '#111827' }}>
                    {items.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            {items.map((it, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', padding: '4px 0', borderBottom: i < items.length - 1 ? '1px dashed #f3f4f6' : 'none' }}>
                                    <span style={{ color: '#6b7280' }}>
                                        {it.quantity}× <span style={{ color: '#111827', fontWeight: 600 }}>{it.product_name}</span>
                                    </span>
                                    <span style={{ fontWeight: 700 }}>Ksh {it.subtotal.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Total Amount</span>
                        <span style={{ fontWeight: 900, fontSize: 18, color: '#1d4ed8' }}>Ksh {sale?.total_amount ? sale.total_amount.toFixed(2) : '0.00'}</span>
                    </div>
                    {sale && sale.amount_paid > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>Paid</span>
                            <span style={{ color: '#16a34a', fontWeight: 700 }}>Ksh {sale.amount_paid.toFixed(2)}</span>
                        </div>
                    )}
                    {outstanding > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '10px 12px', background: '#fef2f2', borderRadius: 10, border: '1.5px solid #fca5a5' }}>
                            <span style={{ color: '#dc2626', fontWeight: 800 }}>Balance Due</span>
                            <span style={{ color: '#dc2626', fontWeight: 900, fontSize: 19 }}>Ksh {outstanding.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* STK Push Input Card */}
                <div style={{
                    background: '#fff',
                    borderRadius: '0 0 20px 20px',
                    padding: '20px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    color: '#111827'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', background: '#eff6ff', borderRadius: 12 }}>
                        <span style={{ fontSize: 20 }}>📱</span>
                        <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1e40af' }}>M-Pesa STK Push</p>
                            <p style={{ margin: 0, fontSize: 11, color: '#3b82f6' }}>Enter your phone → Tap Pay → Enter M-Pesa PIN</p>
                        </div>
                    </div>

                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                        Safaricom Phone Number
                    </label>
                    <input
                        type="tel"
                        placeholder="07XX XXX XXX or 01XX XXX XXX"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        disabled={payState === 'waiting' || payState === 'sending'}
                        style={{
                            width: '100%',
                            padding: '14px',
                            fontSize: 17,
                            border: '2px solid #d1d5db',
                            borderRadius: 12,
                            boxSizing: 'border-box',
                            fontFamily: 'monospace',
                            letterSpacing: 1,
                            transition: 'all 0.2s',
                            color: '#111827'
                        }}
                    />

                    {msg && (
                        <div style={{
                            marginTop: 10,
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: '1px solid',
                            background: payState === 'insufficient' ? '#fef3c7' : payState === 'cancelled' ? '#f3f4f6' : '#fee2e2',
                            borderColor: payState === 'insufficient' ? '#f59e0b' : payState === 'cancelled' ? '#d1d5db' : '#fca5a5',
                            color: payState === 'insufficient' ? '#92400e' : payState === 'cancelled' ? '#374151' : '#991b1b',
                            fontSize: 13,
                            fontWeight: 600
                        }}>
                            {payState === 'insufficient' && '⚠️ '}
                            {payState === 'cancelled' && 'ℹ️ '}
                            {payState === 'failed' && '❌ '}
                            {msg}
                        </div>
                    )}

                    {payState === 'waiting' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, padding: '16px', background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                            <div style={{ width: 28, height: 28, border: '3px solid #bfdbfe', borderTopColor: '#1d4ed8', borderRadius: '50%', animation: 'spin-slow 0.8s linear infinite', flexShrink: 0 }} />
                            <div>
                                <p style={{ margin: 0, fontWeight: 800, color: '#1e40af', fontSize: 14 }}>Prompt sent to your phone!</p>
                                <p style={{ margin: '2px 0 0', color: '#3b82f6', fontSize: 12 }}>Enter your M-Pesa PIN on your phone to confirm Ksh {outstanding.toFixed(2)}</p>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={handlePay}
                            disabled={payState === 'sending'}
                            style={{
                                width: '100%',
                                marginTop: 14,
                                padding: '15px',
                                background: payState === 'sending' ? '#9ca3af' : 'linear-gradient(135deg,#16a34a,#15803d)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 14,
                                fontSize: 17,
                                fontWeight: 800,
                                cursor: payState === 'sending' ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 16px rgba(22,163,74,0.4)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {payState === 'sending' ? '⏳ Sending Prompt...' : `💳 Pay Ksh ${outstanding.toFixed(2)} via M-Pesa`}
                        </button>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 14 }}>
                        {['🔒 Secure', '⚡ Instant STK', '✅ Safaricom'].map(t => (
                            <span key={t} style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>{t}</span>
                        ))}
                    </div>
                </div>

                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 16 }}>
                    Powered by AlphaPlus POS • {hotelName}
                </p>
            </div>
        </div>
    );
}
