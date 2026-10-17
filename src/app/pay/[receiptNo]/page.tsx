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
    table_no?: string;
}

type PaymentState = 'idle' | 'sending' | 'waiting' | 'success' | 'insufficient' | 'cancelled' | 'failed' | 'timeout';

export default function PayPage({ params }: { params: { receiptNo: string } }) {
    const receiptNo = decodeURIComponent(params.receiptNo);

    const [sale, setSale] = useState<Sale | null>(null);
    const [items, setItems] = useState<SaleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [phone, setPhone] = useState('');
    const [paymentState, setPaymentState] = useState<PaymentState>('idle');
    const [mpesaReceipt, setMpesaReceipt] = useState('');
    const [resultMessage, setResultMessage] = useState('');

    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadSale();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    async function loadSale() {
        setLoading(true);
        try {
            const { data: saleData, error } = await supabase
                .from('sales')
                .select('*')
                .eq('receipt_no', receiptNo)
                .single();

            if (error || !saleData) { setNotFound(true); setLoading(false); return; }
            setSale(saleData);

            const { data: itemData } = await supabase
                .from('sales_items')
                .select('*')
                .eq('sale_id', saleData.sale_id);

            setItems(itemData || []);
        } catch { setNotFound(true); }
        setLoading(false);
    }

    function formatPhone(raw: string): string {
        let p = raw.replace(/\s|-|\+/g, '');
        if (p.startsWith('0')) p = '254' + p.slice(1);
        else if (!p.startsWith('254')) p = '254' + p;
        return p;
    }

    function isValidPhone(raw: string): boolean {
        return /^(07\d{8}|01\d{8}|254\d{9})$/.test(raw.replace(/\s|-|\+/g, ''));
    }

    async function handlePay() {
        if (!sale || !isValidPhone(phone)) {
            setResultMessage('Please enter a valid Safaricom number (07xx or 01xx)');
            return;
        }

        const outstanding = sale.total_amount - (sale.amount_paid || 0);
        if (outstanding <= 0) {
            setResultMessage('This bill is already fully paid!');
            return;
        }

        setPaymentState('sending');
        setResultMessage('');

        try {
            const res = await fetch('/api/mpesa/stkpush', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: formatPhone(phone),
                    amount: outstanding,
                    reference: sale.receipt_no,
                    description: `Bill Payment - ${sale.receipt_no}`,
                }),
            });

            const data = await res.json();
            if (!data.success || !data.checkoutRequestId) {
                setPaymentState('failed');
                setResultMessage(data.error || 'Failed to send STK push. Try again.');
                return;
            }

            setPaymentState('waiting');
            startPolling(data.checkoutRequestId);

            // 2.5 min timeout
            timeoutRef.current = setTimeout(() => {
                if (pollRef.current) clearInterval(pollRef.current);
                setPaymentState('timeout');
                setResultMessage('Payment timed out. Please try again.');
            }, 150000);

        } catch {
            setPaymentState('failed');
            setResultMessage('Network error. Please try again.');
        }
    }

    function startPolling(checkoutRequestId: string) {
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/mpesa/check-status?checkoutRequestId=${checkoutRequestId}`);
                const data = await res.json();

                if (data.status === 'pending' || (!data.resultCode && data.resultCode !== 0)) return;

                if (pollRef.current) clearInterval(pollRef.current);
                if (timeoutRef.current) clearTimeout(timeoutRef.current);

                const code = data.resultCode ?? data.ResultCode;

                if (code === 0) {
                    setPaymentState('success');
                    setMpesaReceipt(data.mpesaReceipt || data.MpesaReceiptNumber || '');
                    setResultMessage('Payment successful! Thank you.');
                    // Update sale status in DB
                    await supabase.from('sales').update({
                        status: 'Paid', payment_method: 'M-Pesa',
                        amount_paid: sale!.total_amount, mpesa_code: data.mpesaReceipt || ''
                    }).eq('receipt_no', receiptNo);
                } else if (code === 1) {
                    setPaymentState('insufficient');
                    setResultMessage('Insufficient M-Pesa balance. Please top up and try again.');
                } else if (code === 1032 || code === 17) {
                    setPaymentState('cancelled');
                    setResultMessage('Payment cancelled. Please try again when ready.');
                } else if (code === 2001) {
                    setPaymentState('failed');
                    setResultMessage('Wrong PIN entered. Please try again.');
                } else {
                    setPaymentState('failed');
                    setResultMessage(`Payment failed (Code: ${code}). Please try again.`);
                }
            } catch { /* keep polling */ }
        }, 5000);
    }

    const outstanding = sale ? sale.total_amount - (sale.amount_paid || 0) : 0;

    if (loading) return (
        <div style={styles.center}>
            <div style={styles.spinner} />
            <p style={{ color: '#666', marginTop: 16 }}>Loading bill...</p>
        </div>
    );

    if (notFound) return (
        <div style={styles.center}>
            <div style={{ fontSize: 48 }}>🔍</div>
            <h2 style={{ color: '#333', marginTop: 12 }}>Receipt Not Found</h2>
            <p style={{ color: '#666' }}>Receipt <strong>{receiptNo}</strong> could not be found.</p>
        </div>
    );

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ fontSize: 32 }}>📱</div>
                    <h1 style={styles.title}>Pay via M-Pesa</h1>
                    <p style={styles.subtitle}>{receiptNo}</p>
                </div>

                {/* Bill Summary */}
                <div style={styles.section}>
                    {items.length > 0 && (
                        <div style={styles.itemList}>
                            {items.map((item, i) => (
                                <div key={i} style={styles.itemRow}>
                                    <span>{item.quantity}x {item.product_name}</span>
                                    <span>Ksh {item.subtotal.toFixed(2)}</span>
                                </div>
                            ))}
                            <div style={styles.divider} />
                        </div>
                    )}
                    <div style={styles.totalRow}>
                        <span style={styles.totalLabel}>Total</span>
                        <span style={styles.totalValue}>Ksh {sale!.total_amount.toFixed(2)}</span>
                    </div>
                    {sale!.amount_paid > 0 && (
                        <div style={styles.totalRow}>
                            <span style={{ color: '#16a34a' }}>Paid</span>
                            <span style={{ color: '#16a34a' }}>Ksh {sale!.amount_paid.toFixed(2)}</span>
                        </div>
                    )}
                    {outstanding > 0 && (
                        <div style={{ ...styles.totalRow, borderTop: '2px solid #dc2626', paddingTop: 8, marginTop: 4 }}>
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>Balance Due</span>
                            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 20 }}>Ksh {outstanding.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Payment Section */}
                {paymentState === 'success' ? (
                    <div style={styles.successBox}>
                        <div style={{ fontSize: 48 }}>✅</div>
                        <h2 style={{ color: '#16a34a', margin: '8px 0' }}>Payment Received!</h2>
                        {mpesaReceipt && <p style={{ color: '#555' }}>M-Pesa Code: <strong>{mpesaReceipt}</strong></p>}
                        <p style={{ color: '#555' }}>Thank you for your payment.</p>
                    </div>
                ) : sale!.status === 'Paid' ? (
                    <div style={styles.successBox}>
                        <div style={{ fontSize: 48 }}>✅</div>
                        <h2 style={{ color: '#16a34a' }}>Bill Already Paid</h2>
                        {sale!.mpesa_code && <p>M-Pesa Code: <strong>{(sale as any).mpesa_code}</strong></p>}
                    </div>
                ) : (
                    <div style={styles.section}>
                        <label style={styles.label}>Your Safaricom Number</label>
                        <input
                            style={styles.input}
                            type="tel"
                            placeholder="07XX XXX XXX"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            disabled={paymentState === 'waiting' || paymentState === 'sending'}
                        />

                        {resultMessage && (
                            <div style={{
                                ...styles.alertBox,
                                background: paymentState === 'insufficient' ? '#fef3c7' :
                                    paymentState === 'cancelled' ? '#f3f4f6' : '#fee2e2',
                                borderColor: paymentState === 'insufficient' ? '#f59e0b' :
                                    paymentState === 'cancelled' ? '#9ca3af' : '#dc2626',
                            }}>
                                {resultMessage}
                            </div>
                        )}

                        {paymentState === 'waiting' ? (
                            <div style={styles.waitingBox}>
                                <div style={styles.spinner} />
                                <p style={{ color: '#1d4ed8', marginLeft: 12 }}>
                                    Check your phone and enter M-Pesa PIN...
                                </p>
                            </div>
                        ) : (
                            <button
                                style={{
                                    ...styles.payBtn,
                                    opacity: paymentState === 'sending' ? 0.7 : 1,
                                }}
                                onClick={handlePay}
                                disabled={paymentState === 'sending'}
                            >
                                {paymentState === 'sending' ? '⏳ Sending...' : `💳 Pay Ksh ${outstanding.toFixed(2)}`}
                            </button>
                        )}
                    </div>
                )}

                <p style={styles.footer}>Powered by AlphaPlus Hotel POS</p>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" },
    center: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" },
    card: { background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', width: '100%', maxWidth: 420, overflow: 'hidden' },
    header: { background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)', padding: '24px 20px', textAlign: 'center', color: '#fff' },
    title: { margin: '8px 0 4px', fontSize: 22, fontWeight: 700 },
    subtitle: { margin: 0, opacity: 0.85, fontSize: 14 },
    section: { padding: '16px 20px' },
    itemList: { marginBottom: 8 },
    itemRow: { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#555', padding: '3px 0' },
    divider: { borderTop: '1px dashed #ddd', margin: '8px 0' },
    totalRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0' },
    totalLabel: { fontWeight: 600, fontSize: 16 },
    totalValue: { fontWeight: 700, fontSize: 18, color: '#1d4ed8' },
    label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 },
    input: { width: '100%', padding: '12px 14px', fontSize: 18, border: '2px solid #d1d5db', borderRadius: 10, outline: 'none', boxSizing: 'border-box', letterSpacing: 1 },
    payBtn: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 12 },
    alertBox: { padding: 12, borderRadius: 8, border: '1px solid', fontSize: 14, margin: '10px 0' },
    waitingBox: { display: 'flex', alignItems: 'center', padding: 14, background: '#eff6ff', borderRadius: 10, marginTop: 12 },
    successBox: { padding: 24, textAlign: 'center', background: '#f0fdf4' },
    spinner: { width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#1d4ed8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
    footer: { textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '12px 0', borderTop: '1px solid #f3f4f6' },
};
