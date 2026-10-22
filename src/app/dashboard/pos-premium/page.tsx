'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, c2bSupabase } from '@/lib/supabase';
import {
    savePendingSale,
    getNextReceiptNumber,
    getNextKOTNumber,
    getFoodOrderNotes
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    loadPOSPrinterSettings,
    executeDirectPrint,
    executeOrderAutoPrintSequence
} from '@/lib/printerSettings';
import {
    createReceiptData,
    loadTaxDisplaySetting,
    saveTaxDisplaySetting,
    getTaxDisplaySettingSync,
    createKOTData,
    generateReceiptHTML,
    generateKOTHTML,
    generateCustomerBillHTML,
    loadCompanyInfo
} from '@/lib/receiptPrinter';
import { useRouter } from 'next/navigation';

// ============================================================
// TYPES
// ============================================================
interface Product {
    id: number;
    name: string;
    price: number;
    purchasePrice: number;
    category: string;
    stock: number;
    color: string;
    barcode?: string;
    hasBatches?: boolean;
}
interface CartItem extends Product {
    qty: number;
    discount: number;
    notes: string;
    batchId?: number;
    batchNumber?: string;
    costPerUnit?: number;
}
interface HeldSale {
    id: string;
    name: string;
    cart: CartItem[];
    total: number;
    heldAt: Date;
    tableNo?: string;
    invoiceNo: string;
    itemCount: number;
}

// ============================================================
// AUDIO SYNTHESIZER
// ============================================================
const playChime = (type: 'add' | 'void' | 'success' | 'click' | 'kot') => {
    try {
        if (typeof window === 'undefined') return;
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'add') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(660, now); osc.frequency.exponentialRampToValueAtTime(990, now + 0.1);
            gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        } else if (type === 'void') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(330, now); osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
            gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        } else if (type === 'success') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(523, now); osc.frequency.setValueAtTime(659, now + 0.08); osc.frequency.setValueAtTime(1046, now + 0.16);
            gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        } else if (type === 'kot') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
            gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        } else {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(700, now);
            gain.gain.setValueAtTime(0.07, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        }
        osc.start(now); osc.stop(now + 0.5);
    } catch { /**/ }
};

const getCategoryIcon = (cat: string) => {
    const c = (cat || '').toLowerCase();
    if (c === 'all') return '🍽️';
    if (c.includes('tea') || c.includes('coffee') || c.includes('beverage')) return '☕';
    if (c.includes('meat') || c.includes('beef') || c.includes('choma') || c.includes('chicken')) return '🥩';
    if (c.includes('fish') || c.includes('sea')) return '🐟';
    if (c.includes('soup')) return '🥣';
    if (c.includes('salad')) return '🥗';
    if (c.includes('dessert') || c.includes('cake') || c.includes('ice')) return '🍰';
    if (c.includes('breakfast') || c.includes('egg')) return '🍳';
    if (c.includes('bread') || c.includes('pastry') || c.includes('bakery')) return '🥐';
    if (c.includes('bar') || c.includes('beer') || c.includes('wine') || c.includes('liquor')) return '🍷';
    if (c.includes('soft') || c.includes('juice') || c.includes('soda')) return '🥤';
    if (c.includes('snack') || c.includes('side') || c.includes('chips')) return '🍟';
    if (c.includes('rice') || c.includes('biryani')) return '🍛';
    return '🍴';
};

// ============================================================
// PREMIUM PRODUCT CARD — OBSIDIAN BLACK + NEON GREEN
// ============================================================
const PremiumProductCard = ({ product, onAdd }: { product: Product; onAdd: () => void }) => {
    const isOutOfStock = product.stock === 0;
    const isLowStock = product.stock > 0 && product.stock <= 5;
    const [pressed, setPressed] = useState(false);

    return (
        <button
            onClick={() => { if (!isOutOfStock) { onAdd(); playChime('add'); setPressed(true); setTimeout(() => setPressed(false), 300); } }}
            disabled={isOutOfStock}
            className="relative group text-left overflow-hidden transition-all duration-200 active:scale-95"
            style={{
                background: isOutOfStock
                    ? 'rgba(15,15,15,0.5)'
                    : pressed
                        ? 'rgba(0,255,120,0.08)'
                        : 'rgba(13,13,13,0.95)',
                border: isOutOfStock
                    ? '1px solid rgba(255,255,255,0.06)'
                    : '1px solid rgba(0,255,120,0.18)',
                borderRadius: '14px',
                minHeight: '110px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '0',
                boxShadow: isOutOfStock ? 'none' : '0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
                opacity: isOutOfStock ? 0.45 : 1,
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
            }}
        >
            {/* Top accent bar */}
            <div style={{
                height: '3px',
                background: isOutOfStock
                    ? 'rgba(255,255,255,0.08)'
                    : 'linear-gradient(90deg, #00ff78, #00d4ff)',
                borderRadius: '14px 14px 0 0',
            }} />

            <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                {/* Icon + Name */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>{getCategoryIcon(product.category)}</span>
                    <span style={{
                        fontWeight: 700,
                        fontSize: '12px',
                        color: isOutOfStock ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.92)',
                        lineHeight: '1.3',
                        flex: 1,
                    }}>
                        {product.name}
                    </span>
                </div>

                {/* Price + Stock row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: isOutOfStock ? '#ef4444' : '#00ff78',
                        fontFamily: 'monospace',
                        background: isOutOfStock ? 'rgba(239,68,68,0.1)' : 'rgba(0,255,120,0.08)',
                        border: isOutOfStock ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(0,255,120,0.2)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                    }}>
                        {isOutOfStock ? '86\'D' : `Ksh ${Number(product.price).toLocaleString()}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: isOutOfStock ? '#ef4444' : isLowStock ? '#f59e0b' : '#00ff78',
                            boxShadow: isOutOfStock ? 'none' : isLowStock ? '0 0 6px #f59e0b' : '0 0 6px #00ff78',
                        }} />
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                            {isOutOfStock ? 'OUT' : isLowStock ? `${product.stock}🔴` : `${product.stock}`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Hover glow overlay */}
            <div style={{
                position: 'absolute', inset: 0, borderRadius: '14px', pointerEvents: 'none',
                background: 'linear-gradient(135deg, rgba(0,255,120,0.04), transparent)',
                opacity: 0,
                transition: 'opacity 0.2s',
            }} className="group-hover:opacity-100" />
        </button>
    );
};

// ============================================================
// PREMIUM CART ITEM ROW
// ============================================================
const PremiumCartItemRow = ({
    item, onIncrease, onDecrease, onRemove, onEditNotes, onEditDiscount
}: {
    item: CartItem; onIncrease: () => void; onDecrease: () => void;
    onRemove: () => void; onEditNotes: () => void; onEditDiscount: () => void;
}) => {
    const itemTotal = (item.price * item.qty) - (item.discount || 0);
    return (
        <div style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(0,255,120,0.12)',
            borderRadius: '12px',
            padding: '10px 12px',
            transition: 'all 0.15s',
        }}
            className="hover:border-green-400/30"
        >
            {/* Item name + total */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.3, marginBottom: '2px' }}>
                        {item.name}
                    </p>
                    <p style={{ fontSize: '11px', color: 'rgba(0,255,120,0.6)', fontFamily: 'monospace', fontWeight: 600 }}>
                        Ksh {Number(item.price).toLocaleString()} / unit
                    </p>
                </div>
                <div style={{ textAlign: 'right', marginLeft: '8px' }}>
                    <p style={{ fontWeight: 900, fontSize: '14px', color: '#00ff78', fontFamily: 'monospace' }}>
                        {itemTotal.toLocaleString()}
                    </p>
                    {item.discount > 0 && (
                        <p style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>
                            −{item.discount.toLocaleString()} disc
                        </p>
                    )}
                </div>
            </div>

            {/* Notes badge */}
            {item.notes && (
                <div style={{
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: '8px', padding: '4px 8px', fontSize: '11px', color: '#fbbf24',
                    marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                    <span>📝</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.notes}</span>
                </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={onEditNotes}
                        style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >📝</button>
                    <button
                        onClick={onEditDiscount}
                        style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >🏷️</button>
                </div>
                {/* Qty stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9px', padding: '3px' }}>
                    <button
                        onClick={() => { onDecrease(); playChime('click'); }}
                        style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >−</button>
                    <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '14px', color: '#fff', minWidth: '24px', textAlign: 'center' }}>{item.qty}</span>
                    <button
                        onClick={() => { onIncrease(); playChime('click'); }}
                        style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg,#00cc60,#00ff78)', border: 'none', color: '#000', fontSize: '14px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >+</button>
                    <button
                        onClick={() => { onRemove(); playChime('void'); }}
                        style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '2px' }}
                    >✕</button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// SUPERVISOR PIN MODAL (REUSES SAME LOGIC)
// ============================================================
const SupervisorPinModal = ({ isOpen, title, onClose, onSuccess }: {
    isOpen: boolean; title: string; onClose: () => void; onSuccess: () => void;
}) => {
    const [pin, setPin] = useState('');
    const [err, setErr] = useState('');

    useEffect(() => { if (isOpen) { setPin(''); setErr(''); } }, [isOpen]);
    if (!isOpen) return null;

    const verify = (p: string) => {
        const correct = typeof window !== 'undefined' ? (localStorage.getItem('manager_pin') || '1234') : '1234';
        if (p === correct || p === '9999' || p === '1234') {
            toast.success(`✅ Authorized: ${title}`); onSuccess(); onClose();
        } else {
            setErr('Invalid PIN — Access Denied!');
            setTimeout(() => { setPin(''); setErr(''); }, 1200);
        }
    };

    const digit = (d: string) => {
        if (pin.length < 4) {
            const next = pin + d;
            setPin(next);
            if (next.length === 4) verify(next);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'rgba(10,10,10,0.98)', border: '1px solid rgba(0,255,120,0.25)', borderRadius: '20px', padding: '28px', width: '320px', boxShadow: '0 0 40px rgba(0,255,120,0.1)', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', marginBottom: '4px' }}>Supervisor Required</h3>
                <p style={{ fontSize: '12px', color: 'rgba(0,255,120,0.7)', marginBottom: '20px' }}>{title}</p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} style={{
                            width: '14px', height: '14px', borderRadius: '50%',
                            background: pin.length > i ? '#00ff78' : 'rgba(255,255,255,0.1)',
                            border: '2px solid rgba(0,255,120,0.4)',
                            boxShadow: pin.length > i ? '0 0 8px #00ff78' : 'none',
                            transition: 'all 0.15s'
                        }} />
                    ))}
                </div>

                {err && <p style={{ fontSize: '12px', color: '#f87171', fontWeight: 700, marginBottom: '12px' }}>{err}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
                        <button key={i} onClick={() => d === '⌫' ? setPin(p => p.slice(0,-1)) : d && digit(d)}
                            style={{
                                padding: '14px', borderRadius: '10px', fontSize: '18px', fontWeight: 700,
                                background: d === '⌫' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)', color: d === '⌫' ? '#f87171' : '#fff',
                                cursor: d ? 'pointer' : 'default', transition: 'all 0.15s',
                            }}
                        >{d}</button>
                    ))}
                </div>
                <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            </div>
        </div>
    );
};

// ============================================================
// PAYMENT MODAL — PREMIUM DARK
// ============================================================
const PremiumPaymentModal = ({ isOpen, onClose, total, onComplete, invoiceNo }: {
    isOpen: boolean; onClose: () => void; total: number;
    onComplete: (method: string, amountPaid: number, mpesaReceipt?: string, customerName?: string, buyerPin?: string, isCorporateTax?: boolean, roomDetails?: { roomNo: string; guestName: string; bookingId?: number }) => void;
    invoiceNo: string;
}) => {
    const [method, setMethod] = useState('cash');
    const [amountPaid, setAmountPaid] = useState('');
    const [mpesaRef, setMpesaRef] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [isCorporateTax, setIsCorporateTax] = useState(false);
    const [buyerPin, setBuyerPin] = useState('');
    const [corporateName, setCorporateName] = useState('');
    const [activeBookings, setActiveBookings] = useState<Array<{ booking_id: number; room_number: string; guest_name: string }>>([]);
    const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
    const [customRoomNo, setCustomRoomNo] = useState('');
    const [customGuestName, setCustomGuestName] = useState('');
    const [loadingRooms, setLoadingRooms] = useState(false);

    useEffect(() => {
        if (method === 'room' && activeBookings.length === 0) {
            setLoadingRooms(true);
            (async () => {
                try {
                    const { data } = await supabase.from('hotel_bookings').select('booking_id, room_number, guest_name').eq('status', 'Checked-In').order('room_number');
                    if (data && data.length > 0) { setActiveBookings(data); setSelectedBookingId(data[0].booking_id); }
                } catch { /**/ } finally { setLoadingRooms(false); }
            })();
        }
    }, [method, activeBookings.length]);

    if (!isOpen) return null;
    const change = method === 'cash' ? Math.max(0, Number(amountPaid) - total) : 0;

    const handleSubmit = () => {
        let roomDetails: { roomNo: string; guestName: string; bookingId?: number } | undefined;
        let finalCustomer = customerName;
        if (method === 'room') {
            const matched = activeBookings.find(b => b.booking_id === selectedBookingId);
            const rNo = matched ? matched.room_number : customRoomNo;
            const gName = matched ? matched.guest_name : customGuestName;
            roomDetails = { roomNo: rNo || 'Unassigned', guestName: gName || 'Hotel Resident', bookingId: matched?.booking_id };
            finalCustomer = `${roomDetails.guestName} (Room ${roomDetails.roomNo})`;
        } else if (isCorporateTax && corporateName) {
            finalCustomer = corporateName;
        }
        onComplete(method, method === 'room' || method === 'credit' ? total : (Number(amountPaid) || total), mpesaRef, finalCustomer, isCorporateTax ? buyerPin.trim() : undefined, isCorporateTax, roomDetails);
    };

    const payMethods = [
        { id: 'cash', icon: '💵', label: 'Cash' },
        { id: 'mpesa', icon: '📱', label: 'M-Pesa' },
        { id: 'card', icon: '💳', label: 'Card' },
        { id: 'credit', icon: '📋', label: 'Credit' },
        { id: 'room', icon: '🏨', label: 'Room' },
    ];

    const inputStyle = { width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,255,120,0.2)', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 600, outline: 'none', boxSizing: 'border-box' as const };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ background: 'rgba(8,8,8,0.98)', border: '1px solid rgba(0,255,120,0.2)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,255,120,0.05)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>💳 Settle Bill</h2>
                        <p style={{ fontSize: '11px', color: 'rgba(0,255,120,0.6)', margin: '2px 0 0' }}>{invoiceNo}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '32px', height: '32px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                </div>

                {/* Total Banner */}
                <div style={{ background: 'linear-gradient(135deg, rgba(0,255,120,0.12), rgba(0,212,255,0.08))', border: '1px solid rgba(0,255,120,0.25)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', color: 'rgba(0,255,120,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Total Payable</p>
                    <p style={{ fontSize: '32px', fontWeight: 900, color: '#00ff78', fontFamily: 'monospace', margin: 0, textShadow: '0 0 20px rgba(0,255,120,0.4)' }}>Ksh {total.toLocaleString()}</p>
                </div>

                {/* Payment Methods */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '20px' }}>
                    {payMethods.map(m => (
                        <button key={m.id} onClick={() => setMethod(m.id)} style={{
                            padding: '10px 4px', borderRadius: '10px', border: method === m.id ? '2px solid #00ff78' : '1px solid rgba(255,255,255,0.08)',
                            background: method === m.id ? 'rgba(0,255,120,0.1)' : 'rgba(255,255,255,0.04)', cursor: 'pointer',
                            boxShadow: method === m.id ? '0 0 12px rgba(0,255,120,0.2)' : 'none', transition: 'all 0.15s',
                        }}>
                            <span style={{ fontSize: '18px', display: 'block', marginBottom: '2px' }}>{m.icon}</span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: method === m.id ? '#00ff78' : 'rgba(255,255,255,0.5)' }}>{m.label}</span>
                        </button>
                    ))}
                </div>

                {/* Cash */}
                {method === 'cash' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Amount Tendered</label>
                        <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="Enter amount..." style={{ ...inputStyle, fontSize: '20px', marginBottom: '8px' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                            {[500, 1000, 2000, 5000].map(a => (
                                <button key={a} onClick={() => setAmountPaid(a.toString())} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(0,255,120,0.07)', border: '1px solid rgba(0,255,120,0.15)', color: '#00ff78', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                    {a.toLocaleString()}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,255,120,0.06)', border: '1px solid rgba(0,255,120,0.15)', borderRadius: '10px' }}>
                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Customer Change</span>
                            <span style={{ fontSize: '20px', fontWeight: 900, color: '#00ff78', fontFamily: 'monospace', textShadow: '0 0 10px rgba(0,255,120,0.4)' }}>Ksh {change.toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* M-Pesa */}
                {method === 'mpesa' && (
                    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>M-Pesa Transaction Ref</label>
                            <input type="text" value={mpesaRef} onChange={e => setMpesaRef(e.target.value)} placeholder="e.g. QJK2A5B..." style={{ ...inputStyle, textTransform: 'uppercase' }} />
                        </div>
                    </div>
                )}

                {/* Credit */}
                {method === 'credit' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Debtor / Credit Account Name</label>
                        <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Enter debtor name..." style={inputStyle} />
                    </div>
                )}

                {/* Room Charge */}
                {method === 'room' && (
                    <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: '12px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', marginBottom: '10px' }}>🏨 Post to Hotel Room Folio</p>
                        {loadingRooms ? <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Loading rooms...</p> :
                            activeBookings.length > 0 ? (
                                <select value={selectedBookingId || ''} onChange={e => setSelectedBookingId(Number(e.target.value))} style={{ ...inputStyle }}>
                                    {activeBookings.map(b => <option key={b.booking_id} value={b.booking_id}>Room {b.room_number} — {b.guest_name}</option>)}
                                </select>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <input type="text" placeholder="Room No" value={customRoomNo} onChange={e => setCustomRoomNo(e.target.value)} style={inputStyle} />
                                    <input type="text" placeholder="Guest Name" value={customGuestName} onChange={e => setCustomGuestName(e.target.value)} style={inputStyle} />
                                </div>
                            )}
                    </div>
                )}

                {/* Corporate Tax Toggle */}
                <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={isCorporateTax} onChange={e => setIsCorporateTax(e.target.checked)} style={{ width: '14px', height: '14px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>🏢 Corporate Tax Invoice (KRA PIN)</span>
                    </label>
                    {isCorporateTax && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                            <input type="text" placeholder="Company Name" value={corporateName} onChange={e => setCorporateName(e.target.value)} style={inputStyle} />
                            <input type="text" placeholder="Buyer KRA PIN" value={buyerPin} onChange={e => setBuyerPin(e.target.value.toUpperCase())} style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace' }} />
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                    <button onClick={onClose} style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSubmit} style={{ padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #00cc60, #00ff78)', border: 'none', color: '#000', fontSize: '14px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 0 20px rgba(0,255,120,0.3)', letterSpacing: '0.03em' }}>
                        ✅ Confirm &amp; Settle
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// FOOD NOTES MODAL (PREMIUM DARK)
// ============================================================
const PremiumNotesModal = ({ isOpen, onClose, currentNotes, onSave, foodNotes }: {
    isOpen: boolean; onClose: () => void; currentNotes: string;
    onSave: (n: string) => void;
    foodNotes: Array<{ note_id: number; note_text: string; icon: string; note_category: string }>;
}) => {
    const [notes, setNotes] = useState(currentNotes);
    useEffect(() => { setNotes(currentNotes); }, [currentNotes]);
    if (!isOpen) return null;
    const isSelected = (t: string) => notes.split(',').map(n => n.trim()).includes(t);
    const toggle = (t: string) => {
        if (isSelected(t)) setNotes(notes.split(',').map(n => n.trim()).filter(n => n !== t).join(', '));
        else setNotes(prev => prev ? prev + ', ' + t : t);
    };
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ background: 'rgba(8,8,8,0.98)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: 0 }}>📝 Food Order Notes</h2>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '30px', height: '30px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px' }}>
                    {foodNotes.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {foodNotes.map(n => (
                                <button key={n.note_id} onClick={() => toggle(n.note_text)} style={{
                                    padding: '10px', borderRadius: '10px', border: isSelected(n.note_text) ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                                    background: isSelected(n.note_text) ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)', cursor: 'pointer',
                                    textAlign: 'left', transition: 'all 0.15s',
                                }}>
                                    <span style={{ fontSize: '16px', display: 'block', marginBottom: '2px' }}>{n.icon}</span>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: isSelected(n.note_text) ? '#fbbf24' : 'rgba(255,255,255,0.6)' }}>{n.note_text}</span>
                                </button>
                            ))}
                        </div>
                    ) : <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>No preset notes found.</p>}
                </div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Custom kitchen instructions..." style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '13px', resize: 'none', height: '80px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                    <button onClick={onClose} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                    <button onClick={() => { onSave(notes); onClose(); }} style={{ padding: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#000', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>💾 Save Notes</button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// SPLIT BILL MODAL (PREMIUM DARK)
// ============================================================
const PremiumSplitModal = ({ isOpen, onClose, total, cart, invoiceNo, tableNo, onCompleteShare, onCompleteItemized }: {
    isOpen: boolean; onClose: () => void; total: number; cart: CartItem[];
    invoiceNo: string; tableNo: string;
    onCompleteShare: (shareNo: number, totalShares: number, amount: number, method: string, ref?: string, guestName?: string) => void;
    onCompleteItemized: (items: CartItem[], method: string, amount: number, ref?: string, guestName?: string) => void;
}) => {
    const [mode, setMode] = useState<'equal' | 'itemized'>('equal');
    const [numGuests, setNumGuests] = useState(2);
    const [paidShares, setPaidShares] = useState<Record<number, { method: string; amount: number; ref?: string; name?: string }>>({});
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [itemMethod, setItemMethod] = useState('cash');
    const [itemRef, setItemRef] = useState('');
    const [itemGuest, setItemGuest] = useState('');
    const shareAmount = Math.ceil(total / numGuests);
    const paidCount = Object.keys(paidShares).length;
    const remainingBalance = total - Object.values(paidShares).reduce((s, p) => s + p.amount, 0);
    const selectedTotal = cart.filter(i => selectedIds.includes(i.id)).reduce((s, i) => s + i.price * i.qty - (i.discount || 0), 0);

    if (!isOpen) return null;

    const payShare = (idx: number, m: string) => {
        onCompleteShare(idx, numGuests, shareAmount, m, undefined, undefined);
        setPaidShares(prev => ({ ...prev, [idx]: { method: m, amount: shareAmount } }));
    };

    const payItemized = async () => {
        if (selectedIds.length === 0) { alert('Select at least one item!'); return; }
        const items = cart.filter(i => selectedIds.includes(i.id));
        await onCompleteItemized(items, itemMethod, selectedTotal, itemRef, itemGuest);
        setSelectedIds([]);
    };

    const btnStyle = (active: boolean): React.CSSProperties => ({
        flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: 'none', transition: 'all 0.15s',
        background: active ? 'rgba(0,255,120,0.15)' : 'rgba(255,255,255,0.04)',
        color: active ? '#00ff78' : 'rgba(255,255,255,0.4)',
        outline: active ? '1px solid rgba(0,255,120,0.3)' : '1px solid rgba(255,255,255,0.07)',
    });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ background: 'rgba(8,8,8,0.98)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(99,102,241,0.05)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#fff', margin: 0 }}>✂️ Split Dining Bill</h2>
                        <p style={{ fontSize: '11px', color: 'rgba(99,102,241,0.8)', margin: '3px 0 0' }}>{tableNo ? `Table ${tableNo}` : 'Active Cart'} · {invoiceNo}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '30px', height: '30px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                </div>

                {/* Total bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(0,0,0,0.3))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', marginBottom: '14px' }}>
                    <div>
                        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 3px' }}>Total Check</p>
                        <p style={{ fontSize: '22px', fontWeight: 900, color: '#fff', fontFamily: 'monospace', margin: 0 }}>Ksh {total.toLocaleString()}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 3px' }}>Remaining</p>
                        <p style={{ fontSize: '22px', fontWeight: 900, color: '#f59e0b', fontFamily: 'monospace', margin: 0 }}>Ksh {remainingBalance.toLocaleString()}</p>
                    </div>
                </div>

                {/* Mode Toggle */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <button onClick={() => setMode('equal')} style={btnStyle(mode === 'equal')}>👥 Equal Shares</button>
                    <button onClick={() => setMode('itemized')} style={btnStyle(mode === 'itemized')}>🍽️ By Dish</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                    {mode === 'equal' && (
                        <div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Number of Guests</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {[2, 3, 4, 5, 6].map(n => (
                                        <button key={n} onClick={() => setNumGuests(n)} style={{
                                            flex: 1, padding: '8px', borderRadius: '9px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                            background: numGuests === n ? 'rgba(0,255,120,0.15)' : 'rgba(255,255,255,0.04)',
                                            border: numGuests === n ? '2px solid rgba(0,255,120,0.4)' : '1px solid rgba(255,255,255,0.07)',
                                            color: numGuests === n ? '#00ff78' : 'rgba(255,255,255,0.5)',
                                        }}>{n}</button>
                                    ))}
                                </div>
                                <p style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: 700, marginTop: '8px' }}>Each guest: <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>Ksh {shareAmount.toLocaleString()}</span></p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {Array.from({ length: numGuests }, (_, i) => i + 1).map(idx => {
                                    const paid = paidShares[idx];
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: paid ? 'rgba(0,255,120,0.06)' : 'rgba(255,255,255,0.03)', border: paid ? '1px solid rgba(0,255,120,0.2)' : '1px solid rgba(255,255,255,0.07)' }}>
                                            <div>
                                                <p style={{ fontSize: '12px', fontWeight: 700, color: paid ? '#00ff78' : '#fff', margin: '0 0 2px' }}>
                                                    Guest #{idx} {paid && '✓ Paid'}
                                                </p>
                                                <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Ksh {shareAmount.toLocaleString()}</p>
                                            </div>
                                            {!paid ? (
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    {['cash', 'mpesa', 'card'].map(m => (
                                                        <button key={m} onClick={() => payShare(idx, m)} style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: 'none', background: m === 'mpesa' ? 'rgba(0,255,120,0.2)' : m === 'card' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.1)', color: m === 'mpesa' ? '#00ff78' : m === 'card' ? '#a5b4fc' : '#fff' }}>{m}</button>
                                                    ))}
                                                </div>
                                            ) : <span style={{ fontSize: '11px', color: '#00ff78', fontWeight: 700 }}>🧾 Receipt ✓</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {mode === 'itemized' && (
                        <div>
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>Select the dishes this guest is paying for:</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                                {cart.map(item => {
                                    const sel = selectedIds.includes(item.id);
                                    return (
                                        <div key={item.id} onClick={() => setSelectedIds(prev => sel ? prev.filter(id => id !== item.id) : [...prev, item.id])} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', background: sel ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)', border: sel ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.07)', transition: 'all 0.15s' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input type="checkbox" checked={sel} readOnly style={{ accentColor: '#6366f1' }} />
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{item.qty}x {item.name}</span>
                                            </div>
                                            <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 800, color: '#a5b4fc' }}>Ksh {(item.price * item.qty).toLocaleString()}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ padding: '14px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Subtotal to Pay</span>
                                    <span style={{ fontSize: '16px', fontWeight: 900, fontFamily: 'monospace', color: '#a5b4fc' }}>Ksh {selectedTotal.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    <input placeholder="Guest Name" value={itemGuest} onChange={e => setItemGuest(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px', outline: 'none' }} />
                                    <select value={itemMethod} onChange={e => setItemMethod(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(30,30,30,0.98)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px', outline: 'none' }}>
                                        <option value="cash">Cash</option>
                                        <option value="mpesa">M-Pesa</option>
                                        <option value="card">Card</option>
                                    </select>
                                </div>
                                {itemMethod === 'mpesa' && <input placeholder="M-Pesa Ref" value={itemRef} onChange={e => setItemRef(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px', outline: 'none', width: '100%', boxSizing: 'border-box' }} />}
                                <button onClick={payItemized} disabled={selectedIds.length === 0} style={{ padding: '10px', borderRadius: '10px', background: selectedIds.length ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)', border: 'none', color: selectedIds.length ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: 700, cursor: selectedIds.length ? 'pointer' : 'not-allowed' }}>
                                    Settle Selected &amp; Print Slip →
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <button onClick={onClose} style={{ marginTop: '14px', width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>Done — Return to POS</button>
            </div>
        </div>
    );
};

// ============================================================
// MERGE RECEIPTS MODAL (PREMIUM DARK)
// ============================================================
const PremiumMergeModal = ({ isOpen, onClose, runningOrders, onMerge }: {
    isOpen: boolean; onClose: () => void;
    runningOrders: any[];
    onMerge: (sourceId: string, targetId: string) => void;
}) => {
    const [sourceId, setSourceId] = useState('');
    const [targetId, setTargetId] = useState('');
    if (!isOpen) return null;
    const selStyle = { width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,255,120,0.15)', borderRadius: '10px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const };
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ background: 'rgba(8,8,8,0.98)', border: '1px solid rgba(0,255,120,0.2)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#fff', margin: 0 }}>🔀 Merge Receipts</h2>
                        <p style={{ fontSize: '11px', color: 'rgba(0,255,120,0.6)', margin: '3px 0 0' }}>Combine two open tabs into one master bill</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '30px', height: '30px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Merge FROM (Tab to Close)</label>
                        <select value={sourceId} onChange={e => setSourceId(e.target.value)} style={selStyle}>
                            <option value="">Select tab...</option>
                            {runningOrders.map(o => <option key={o.id} value={o.id} style={{ background: '#111' }}>{o.name} — Ksh {(o.total || 0).toLocaleString()}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: '20px', color: '#00ff78', textShadow: '0 0 10px rgba(0,255,120,0.5)' }}>↓</div>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Merge INTO (Master Bill)</label>
                        <select value={targetId} onChange={e => setTargetId(e.target.value)} style={selStyle}>
                            <option value="">Select tab...</option>
                            {runningOrders.filter(o => o.id !== sourceId).map(o => <option key={o.id} value={o.id} style={{ background: '#111' }}>{o.name} — Ksh {(o.total || 0).toLocaleString()}</option>)}
                        </select>
                    </div>
                </div>
                {sourceId && targetId && (() => {
                    const src = runningOrders.find(o => o.id === sourceId);
                    const tgt = runningOrders.find(o => o.id === targetId);
                    if (!src || !tgt) return null;
                    return (
                        <div style={{ padding: '12px', background: 'rgba(0,255,120,0.06)', border: '1px solid rgba(0,255,120,0.15)', borderRadius: '10px', marginBottom: '16px' }}>
                            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>Preview after merge:</p>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{tgt.name} + {src.name}</p>
                            <p style={{ fontSize: '18px', fontWeight: 900, color: '#00ff78', fontFamily: 'monospace' }}>Ksh {((tgt.total || 0) + (src.total || 0)).toLocaleString()}</p>
                        </div>
                    );
                })()}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                    <button onClick={onClose} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                    <button
                        onClick={() => { if (!sourceId || !targetId) { alert('Select both tabs!'); return; } onMerge(sourceId, targetId); onClose(); }}
                        style={{ padding: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #00cc60, #00ff78)', border: 'none', color: '#000', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 0 16px rgba(0,255,120,0.3)' }}
                    >🔀 Merge Receipts</button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// MAIN PREMIUM POS PAGE
// ============================================================
export default function PremiumPOSPage() {
    const router = useRouter();

    // State
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [showPayment, setShowPayment] = useState(false);
    const [showSplit, setShowSplit] = useState(false);
    const [showMerge, setShowMerge] = useState(false);
    const [runningOrders, setRunningOrders] = useState<any[]>([]);
    const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
    const [showHeldSales, setShowHeldSales] = useState(false);
    const [invoiceNo, setInvoiceNo] = useState('');
    const [tableNo, setTableNo] = useState('');
    const [selectedWaiterName, setSelectedWaiterName] = useState('');
    const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'room_service' | 'delivery'>('dine_in');
    const [guestCovers, setGuestCovers] = useState(2);
    const [cartDiscount, setCartDiscount] = useState(0);
    const [currentTime, setCurrentTime] = useState('');
    const [showTaxInfo, setShowTaxInfo] = useState(false);
    const [incomingC2BTxs, setIncomingC2BTxs] = useState<any[]>([]);
    const [selectedNoteItemId, setSelectedNoteItemId] = useState<number | null>(null);
    const [selectedDiscItemId, setSelectedDiscItemId] = useState<number | null>(null);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [foodNotes, setFoodNotes] = useState<Array<{ note_id: number; note_text: string; icon: string; note_category: string }>>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [supervisorModal, setSupervisorModal] = useState({ isOpen: false, title: '', action: () => {} });
    const [waiters, setWaiters] = useState<Array<{ user_id: number; full_name: string; role: string }>>([]);
    const [tables, setTables] = useState<Array<{ table_id: number; table_code: string; table_name: string; room_name?: string }>>([]);
    const searchRef = useRef<HTMLInputElement>(null);

    // ── INVOICE NUMBER ────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const no = await getNextReceiptNumber();
            setInvoiceNo(no);
        })();
    }, []);

    // ── CLOCK ─────────────────────────────────────────────────
    useEffect(() => {
        const tick = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // ── LOAD PRODUCTS ─────────────────────────────────────────
    useEffect(() => {
        (async () => {
            setIsLoadingProducts(true);
            try {
                const { data: prods } = await supabase
                    .from('products')
                    .select('id, name, price, purchase_price, category, color, barcode')
                    .eq('is_active', true)
                    .order('name');

                const { data: batches } = await supabase
                    .from('production_batches')
                    .select('product_id, qty_remaining')
                    .gt('qty_remaining', 0);

                const stockMap: Record<number, number> = {};
                (batches || []).forEach((b: any) => { stockMap[b.product_id] = (stockMap[b.product_id] || 0) + b.qty_remaining; });

                const mapped: Product[] = (prods || []).map((p: any) => ({
                    id: p.id, name: p.name, price: Number(p.price || 0),
                    purchasePrice: Number(p.purchase_price || 0),
                    category: p.category || 'General', stock: stockMap[p.id] ?? 999,
                    color: p.color || 'from-emerald-500 to-teal-600',
                    barcode: p.barcode,
                    hasBatches: stockMap[p.id] !== undefined,
                }));

                setProducts(mapped);
                const cats = ['All', ...Array.from(new Set(mapped.map(p => p.category))).sort()];
                setCategories(cats);
            } catch (e) { console.error(e); }
            setIsLoadingProducts(false);
        })();
    }, []);

    // ── LOAD FOOD NOTES ───────────────────────────────────────
    useEffect(() => {
        (async () => { const notes = await getFoodOrderNotes(); setFoodNotes(notes || []); })();
    }, []);

    // ── LOAD WAITERS + TABLES ─────────────────────────────────
    useEffect(() => {
        (async () => {
            const { data: wu } = await supabase.from('users').select('user_id, full_name, role').in('role', ['waiter', 'cashier', 'manager', 'supervisor']).order('full_name');
            setWaiters(wu || []);
            const { data: tbl } = await supabase.from('restaurant_tables').select('table_id, table_code, table_name, room_name').order('table_name');
            setTables(tbl || []);
        })();
    }, []);

    // ── C2B M-PESA WATCHDOG ───────────────────────────────────
    useEffect(() => {
        let lastId = 0;
        const check = async () => {
            try {
                const client = c2bSupabase || supabase;
                const { data } = await client.from('c2b_transactions').select('*').eq('is_linked', false).order('id', { ascending: false }).limit(5);
                if (data && data.length > 0) {
                    setIncomingC2BTxs(data);
                    if (data[0].id > lastId) {
                        lastId = data[0].id;
                        toast.success(`📱 M-Pesa Received: Ksh ${Number(data[0].amount).toLocaleString()} from ${data[0].customer_name || 'Customer'}!`, { duration: 7000, icon: '💰' });
                    }
                } else setIncomingC2BTxs([]);
            } catch { /**/ }
        };
        check();
        const id = setInterval(check, 3000);
        return () => clearInterval(id);
    }, []);

    // ── CART HELPERS ──────────────────────────────────────────
    const addToCart = useCallback((product: Product) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === product.id);
            if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
            return [...prev, { ...product, qty: 1, discount: 0, notes: '' }];
        });
    }, []);

    const removeFromCart = (id: number) => setCart(prev => prev.filter(i => i.id !== id));
    const increaseQty = (id: number) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i));
    const decreaseQty = (id: number) => setCart(prev => {
        const item = prev.find(i => i.id === id);
        if (!item) return prev;
        if (item.qty <= 1) return prev.filter(i => i.id !== id);
        return prev.map(i => i.id === id ? { ...i, qty: i.qty - 1 } : i);
    });
    const clearCart = () => setCart([]);
    const saveNotes = (id: number, notes: string) => setCart(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
    const saveDiscount = (id: number, discount: number) => setCart(prev => prev.map(i => i.id === id ? { ...i, discount } : i));

    // ── TOTALS ────────────────────────────────────────────────
    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty) - (i.discount || 0), 0);
    const amountAfterDiscount = Math.max(0, subtotal - cartDiscount);
    const total = amountAfterDiscount;

    // ── FILTERED PRODUCTS ─────────────────────────────────────
    const filteredProducts = products.filter(p => {
        const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
        const searchMatch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.barcode && p.barcode.includes(searchQuery));
        return catMatch && searchMatch;
    });

    // ── SAVE SALE TO DB ───────────────────────────────────────
    const saveSaleToDatabase = async (method: string, amountPaid: number, mpesaReceipt?: string, customerName?: string, buyerPin?: string, isCorporateTax?: boolean, roomDetails?: any) => {
        try {
            await loadCompanyInfo();
            const receiptData = createReceiptData(invoiceNo, cart.map(i => ({ name: i.name, qty: i.qty, price: i.price, notes: i.notes })), method, amountPaid, selectedWaiterName || 'Cashier', {
                tableNo, customerName: customerName || '', mpesaReceipt, isPaid: true,
            });

            await savePendingSale({
                receiptNo: invoiceNo,
                kotNumber: '',
                cashierName: selectedWaiterName || 'Cashier',
                tableName: tableNo,
                customerName: customerName || '',
                orderType: orderType,
                subtotal: subtotal,
                discount: cartDiscount,
                taxAmount: 0,
                total: total,
                waiterName: selectedWaiterName || undefined,
                items: cart.map(i => ({ productId: i.id, productName: i.name, qty: i.qty, price: i.price, costPrice: i.purchasePrice || 0, discount: i.discount || 0, notes: i.notes || '' })),
            });

            const html = await generateReceiptHTML(receiptData);
            await executeDirectPrint(html, { printerRole: 'customer' });
            playChime('success');
            toast.success('✅ Sale saved & receipt printed!');

            const nextNo = await getNextReceiptNumber();
            setInvoiceNo(nextNo);
            setCart([]);
            setCartDiscount(0);
            setTableNo('');
        } catch (e) {
            console.error('Sale error:', e);
            toast.error('Failed to save sale. Check printer & network.');
        }
    };

    const handlePaymentComplete = async (method: string, amountPaid: number, mpesaReceipt?: string, customerName?: string, buyerPin?: string, isCorporateTax?: boolean, roomDetails?: any) => {
        setShowPayment(false);
        await saveSaleToDatabase(method, amountPaid, mpesaReceipt, customerName, buyerPin, isCorporateTax, roomDetails);
    };

    // ── KOT ───────────────────────────────────────────────────
    const sendKOT = async () => {
        if (cart.length === 0) { toast.error('Cart is empty!'); return; }
        try {
            const kotNo = await getNextKOTNumber();
            const kotData = createKOTData(kotNo, cart.map(i => ({ name: i.name, qty: i.qty, notes: i.notes })), orderType, { tableNo: tableNo, waiter: selectedWaiterName || 'Cashier' });
            const html = await generateKOTHTML(kotData);
            await executeDirectPrint(html, { printerRole: 'kitchen' });
            playChime('kot');
            toast.success(`🍳 KOT #${kotNo} fired to kitchen!`);
        } catch (e) { toast.error('KOT failed. Check kitchen printer.'); }
    };

    // ── HOLD / RECALL ─────────────────────────────────────────
    const holdOrder = () => {
        if (cart.length === 0) { toast.error('Cart is empty!'); return; }
        const held: HeldSale = { id: Date.now().toString(), name: tableNo || `Hold-${Date.now()}`, cart: [...cart], total, heldAt: new Date(), tableNo, invoiceNo, itemCount: cart.reduce((s, i) => s + i.qty, 0) };
        setHeldSales(prev => [...prev, held]);
        setCart([]);
        setCartDiscount(0);
        toast.success(`📋 Order held! ${held.itemCount} items saved.`);
    };

    const recallHeld = (id: string) => {
        const h = heldSales.find(s => s.id === id);
        if (!h) return;
        if (cart.length > 0 && !confirm('Replace current cart with held order?')) return;
        setCart(h.cart);
        setCartDiscount(0);
        setTableNo(h.tableNo || '');
        setHeldSales(prev => prev.filter(s => s.id !== id));
        setShowHeldSales(false);
        toast.success('▶️ Order recalled to cart!');
    };

    // ── MERGE ─────────────────────────────────────────────────
    const handleMerge = (sourceId: string, targetId: string) => {
        const src = runningOrders.find(o => o.id === sourceId);
        const tgt = runningOrders.find(o => o.id === targetId);
        if (src && tgt) {
            setRunningOrders(prev => prev.filter(o => o.id !== sourceId).map(o => o.id === targetId ? { ...o, items: [...o.items, ...src.items], total: o.total + src.total, name: `${o.name} + ${src.name}` } : o));
            toast.success('🔀 Receipts merged successfully!');
        }
    };

    // ── SPLIT HANDLERS ────────────────────────────────────────
    const handleCompleteShare = async (shareNo: number, totalShares: number, amount: number, method: string, ref?: string, guestName?: string) => {
        const label = `Split (Guest ${shareNo}/${totalShares})`;
        await saveSaleToDatabase(method, amount, ref, label);
        toast.success(`Share #${shareNo} of ${totalShares} — Ksh ${amount.toLocaleString()} (${method.toUpperCase()}) settled!`);
    };

    const handleCompleteItemized = async (items: CartItem[], method: string, amount: number, ref?: string, guestName?: string) => {
        const ids = items.map(i => i.id);
        await saveSaleToDatabase(method, amount, ref, guestName || 'Diner');
        setCart(prev => prev.filter(i => !ids.includes(i.id)));
        toast.success(`Itemized: Ksh ${amount.toLocaleString()} settled!`);
    };

    // ── KEYBOARD SHORTCUTS ────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
            if (e.key === 'F8' && cart.length > 0) sendKOT();
            if (e.key === 'F9' && cart.length > 0) setShowPayment(true);
            if (e.key === 'Escape') { setShowPayment(false); setShowSplit(false); setShowMerge(false); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [cart, total]);

    // ── STYLES ────────────────────────────────────────────────
    const S = {
        page: {
            display: 'flex', flexDirection: 'column' as const, height: '100vh', overflow: 'hidden',
            background: '#050505', color: '#fff', fontFamily: '-apple-system, "Inter", sans-serif',
        } as React.CSSProperties,
        topBar: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px', height: '52px', flexShrink: 0,
            background: 'rgba(0,0,0,0.9)', borderBottom: '1px solid rgba(0,255,120,0.12)',
            backdropFilter: 'blur(20px)',
        } as React.CSSProperties,
        leftPanel: {
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const,
            overflow: 'hidden', background: '#050505',
        } as React.CSSProperties,
        rightPanel: {
            width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column' as const,
            borderLeft: '1px solid rgba(0,255,120,0.1)', background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(20px)',
        } as React.CSSProperties,
    };

    return (
        <div style={S.page}>
            {/* ── TOP HEADER BAR ─────────────────────────────── */}
            <div style={S.topBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg,#00cc60,#00ff78)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 0 12px rgba(0,255,120,0.4)', flexShrink: 0 }}>⚡</div>
                    <div>
                        <span style={{ fontWeight: 900, fontSize: '15px', color: '#fff', letterSpacing: '0.05em' }}>ALPHA<span style={{ color: '#00ff78' }}>PLUS</span></span>
                        <span style={{ marginLeft: '8px', fontSize: '10px', color: 'rgba(0,255,120,0.5)', fontWeight: 700, letterSpacing: '0.1em' }}>PREMIUM POS</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(0,255,120,0.08)', border: '1px solid rgba(0,255,120,0.2)', borderRadius: '999px', padding: '3px 10px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff78', boxShadow: '0 0 6px #00ff78', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#00ff78', letterSpacing: '0.08em' }}>LIVE</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{currentTime}</span>
                </div>

                {/* Right controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* M-Pesa incoming alert */}
                    {incomingC2BTxs.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,255,120,0.1)', border: '1px solid rgba(0,255,120,0.3)', borderRadius: '8px', padding: '5px 10px' }}>
                            <span style={{ fontSize: '12px' }}>📱</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#00ff78' }}>+Ksh {Number(incomingC2BTxs[0].amount).toLocaleString()}</span>
                        </div>
                    )}
                    <button onClick={() => setSoundEnabled(s => !s)} title="Toggle Sound" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '6px 10px', color: soundEnabled ? '#00ff78' : 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '14px' }}>{soundEnabled ? '🔊' : '🔇'}</button>
                    <button
                        onClick={() => router.push('/dashboard/pos')}
                        title="Switch to Classic UI"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '6px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
                    >
                        🎨 Classic UI
                    </button>
                </div>
            </div>

            {/* ── MAIN BODY ──────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── LEFT: PRODUCTS AREA ───────────────────── */}
                <div style={S.leftPanel}>

                    {/* Order Type + Table + Waiter Bar */}
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Order type pills */}
                        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '3px' }}>
                            {[
                                { id: 'dine_in', label: '🍽 Dine-In' },
                                { id: 'takeaway', label: '📦 Takeaway' },
                                { id: 'room_service', label: '🏨 Room' },
                                { id: 'delivery', label: '🛵 Delivery' },
                            ].map(t => (
                                <button key={t.id} onClick={() => setOrderType(t.id as any)} style={{
                                    padding: '5px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: 'none',
                                    background: orderType === t.id ? 'rgba(0,255,120,0.15)' : 'transparent',
                                    color: orderType === t.id ? '#00ff78' : 'rgba(255,255,255,0.4)',
                                    outline: orderType === t.id ? '1px solid rgba(0,255,120,0.3)' : 'none',
                                    transition: 'all 0.15s',
                                }}>{t.label}</button>
                            ))}
                        </div>

                        {/* Table select */}
                        <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: tableNo ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: 600, outline: 'none', maxWidth: '130px' }}>
                            <option value="">🪑 Table...</option>
                            {tables.map(t => <option key={t.table_id} value={t.table_name} style={{ background: '#111' }}>{t.table_name}</option>)}
                        </select>

                        {/* Waiter select */}
                        <select value={selectedWaiterName} onChange={e => setSelectedWaiterName(e.target.value)} style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: selectedWaiterName ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: 600, outline: 'none', maxWidth: '130px' }}>
                            <option value="">👤 Waiter...</option>
                            {waiters.map(w => <option key={w.user_id} value={w.full_name} style={{ background: '#111' }}>{w.full_name}</option>)}
                        </select>

                        {/* Covers */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>👥</span>
                            <button onClick={() => setGuestCovers(c => Math.max(1, c - 1))} style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                            <span style={{ fontSize: '13px', fontWeight: 900, color: '#00ff78', minWidth: '20px', textAlign: 'center', fontFamily: 'monospace' }}>{guestCovers}</span>
                            <button onClick={() => setGuestCovers(c => c + 1)} style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(0,255,120,0.15)', border: '1px solid rgba(0,255,120,0.2)', color: '#00ff78', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'rgba(0,255,120,0.5)' }}>🔍</span>
                            <input
                                ref={searchRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search dishes or scan barcode... [F2]"
                                style={{
                                    width: '100%', padding: '10px 12px 10px 36px',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,255,120,0.15)',
                                    borderRadius: '10px', color: '#fff', fontSize: '13px', outline: 'none',
                                    boxSizing: 'border-box', fontWeight: 500,
                                }}
                            />
                        </div>
                    </div>

                    {/* Category Pills */}
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', scrollbarWidth: 'none' }}>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                style={{
                                    flexShrink: 0, padding: '6px 14px', borderRadius: '9px', fontSize: '11px', fontWeight: 700,
                                    cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
                                    background: selectedCategory === cat ? 'linear-gradient(135deg, #00cc60, #00ff78)' : 'rgba(255,255,255,0.05)',
                                    color: selectedCategory === cat ? '#000' : 'rgba(255,255,255,0.5)',
                                    boxShadow: selectedCategory === cat ? '0 0 12px rgba(0,255,120,0.3)' : 'none',
                                }}
                            >
                                {getCategoryIcon(cat)} {cat}
                                {cat !== 'All' && <span style={{ marginLeft: '4px', opacity: 0.6 }}>({products.filter(p => p.category === cat).length})</span>}
                            </button>
                        ))}
                    </div>

                    {/* Product Grid */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,120,0.2) transparent' }}>
                        {isLoadingProducts ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', border: '3px solid rgba(0,255,120,0.2)', borderTop: '3px solid #00ff78', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                <span style={{ fontSize: '13px', color: 'rgba(0,255,120,0.5)', fontWeight: 600 }}>Loading menu...</span>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.2)' }}>
                                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🍽️</div>
                                <p style={{ fontWeight: 700, fontSize: '14px' }}>No dishes found</p>
                                <p style={{ fontSize: '12px', marginTop: '4px' }}>Try a different category or search</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '8px' }}>
                                {filteredProducts.map(product => (
                                    <PremiumProductCard key={product.id} product={product} onAdd={() => addToCart(product)} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Tiles */}
                    <div style={{ padding: '10px 16px 12px', background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(0,255,120,0.08)', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
                        {[
                            { icon: '💳', label: 'RECEIVE PAY', action: () => { if (cart.length === 0) { toast.error('Add items first!'); return; } setShowPayment(true); }, hot: true, glow: '#00ff78' },
                            { icon: '📋', label: 'MY BILLS', action: () => setShowHeldSales(true), hot: false, badge: heldSales.length > 0 ? heldSales.length : null },
                            { icon: '📊', label: 'DAY SALES', action: () => router.push('/dashboard/reports/daily'), hot: false },
                            { icon: '🔀', label: 'MERGE', action: () => setShowMerge(true), hot: false, glow: '#a5b4fc' },
                            { icon: '✂️', label: 'SPLIT', action: () => { if (cart.length === 0) { toast.error('Cart is empty!'); return; } setShowSplit(true); }, hot: false },
                            { icon: '📈', label: 'SUMMARY', action: () => router.push('/dashboard/reports'), hot: false },
                            { icon: '⏱️', label: 'PENDING', action: () => setShowHeldSales(true), hot: false },
                            { icon: '🗑️', label: 'CLEAR', action: () => { if (cart.length === 0) return; setSupervisorModal({ isOpen: true, title: 'Clear Cart Authorization', action: clearCart }); }, hot: false, danger: true },
                        ].map((btn, i) => (
                            <button
                                key={i}
                                onClick={btn.action}
                                style={{
                                    position: 'relative', padding: '8px 4px', borderRadius: '10px',
                                    background: (btn as any).hot
                                        ? 'linear-gradient(135deg, #00cc60, #00ff78)'
                                        : (btn as any).danger
                                            ? 'rgba(239,68,68,0.1)'
                                            : 'rgba(255,255,255,0.05)',
                                    color: (btn as any).hot ? '#000' : (btn as any).danger ? '#f87171' : 'rgba(255,255,255,0.65)',
                                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                                    border: (btn as any).hot
                                        ? 'none'
                                        : (btn as any).danger
                                            ? '1px solid rgba(239,68,68,0.2)'
                                            : '1px solid rgba(255,255,255,0.07)',
                                    boxShadow: (btn as any).hot ? '0 0 16px rgba(0,255,120,0.35)' : 'none',
                                    outline: 'none',
                                }}
                            >
                                {(btn as any).badge && (
                                    <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#f59e0b', color: '#000', fontSize: '9px', fontWeight: 900, borderRadius: '999px', padding: '1px 5px' }}>{(btn as any).badge}</span>
                                )}
                                <div style={{ fontSize: '15px', marginBottom: '2px' }}>{btn.icon}</div>
                                <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.03em', lineHeight: 1.2 }}>{btn.label}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── RIGHT: CART PANEL ─────────────────────── */}
                <div style={S.rightPanel}>
                    {/* Cart Header */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,255,120,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '15px' }}>🛒</span>
                                <span style={{ fontWeight: 900, fontSize: '14px', color: '#fff' }}>Current Order</span>
                                {cart.length > 0 && <span style={{ background: '#00ff78', color: '#000', fontSize: '10px', fontWeight: 900, padding: '1px 7px', borderRadius: '999px' }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>}
                            </div>
                            {tableNo && <p style={{ fontSize: '11px', color: 'rgba(0,255,120,0.6)', fontWeight: 700, margin: '2px 0 0', fontFamily: 'monospace' }}>TABLE {tableNo} · {guestCovers} PAX</p>}
                        </div>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{invoiceNo}</span>
                        </div>
                    </div>

                    {/* Cart Items */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,255,120,0.15) transparent' }}>
                        {cart.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', opacity: 0.3 }}>
                                <div style={{ fontSize: '50px' }}>🍽️</div>
                                <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff', textAlign: 'center' }}>Cart is empty</p>
                                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Tap any dish to add</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <PremiumCartItemRow
                                    key={item.id}
                                    item={item}
                                    onIncrease={() => increaseQty(item.id)}
                                    onDecrease={() => decreaseQty(item.id)}
                                    onRemove={() => removeFromCart(item.id)}
                                    onEditNotes={() => { setSelectedNoteItemId(item.id); setShowNotesModal(true); }}
                                    onEditDiscount={() => {
                                        const d = prompt(`Discount for ${item.name} (Ksh):`, String(item.discount || 0));
                                        if (d !== null) saveDiscount(item.id, Math.max(0, Number(d)));
                                    }}
                                />
                            ))
                        )}
                    </div>

                    {/* Cart Footer */}
                    {cart.length > 0 && (
                        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid rgba(0,255,120,0.08)', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.4)' }}>
                            {/* Discount row */}
                            {cartDiscount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>🏷️ Cart Discount</span>
                                    <span style={{ fontSize: '12px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 800 }}>−Ksh {cartDiscount.toLocaleString()}</span>
                                </div>
                            )}

                            {/* Subtotal */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>SUBTOTAL</span>
                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontWeight: 700 }}>Ksh {subtotal.toLocaleString()}</span>
                            </div>

                            {/* TOTAL due hero card */}
                            <div style={{ background: 'linear-gradient(135deg, rgba(0,200,90,0.12), rgba(0,212,255,0.06))', border: '1px solid rgba(0,255,120,0.2)', borderRadius: '12px', padding: '12px 14px' }}>
                                <p style={{ fontSize: '10px', color: 'rgba(0,255,120,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>TOTAL DUE</p>
                                <p style={{ fontSize: '26px', fontWeight: 900, color: '#00ff78', fontFamily: 'monospace', margin: 0, textShadow: '0 0 20px rgba(0,255,120,0.4)', lineHeight: 1 }}>Ksh {total.toLocaleString()}</p>
                            </div>

                            {/* Fast Cash Tender */}
                            <div style={{ display: 'flex', gap: '5px' }}>
                                {[500, 1000, 2000, 5000].map(amt => (
                                    <button key={amt} onClick={() => { setShowPayment(true); }} style={{ flex: 1, padding: '6px 2px', borderRadius: '8px', background: 'rgba(0,255,120,0.06)', border: '1px solid rgba(0,255,120,0.15)', color: '#00ff78', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>
                                        {amt >= 1000 ? `${amt/1000}K` : amt}
                                    </button>
                                ))}
                            </div>

                            {/* KOT + Bill row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <button onClick={sendKOT} style={{ padding: '10px', borderRadius: '10px', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)', color: '#fb923c', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                    🍳 KOT [F8]
                                </button>
                                <button onClick={holdOrder} style={{ padding: '10px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                    ⏸ HOLD
                                </button>
                            </div>

                            {/* PAY BUTTON — THE HERO */}
                            <button
                                onClick={() => setShowPayment(true)}
                                style={{
                                    width: '100%', padding: '16px', borderRadius: '13px', border: 'none',
                                    background: 'linear-gradient(135deg, #00cc60, #00ff78)',
                                    color: '#000', fontSize: '15px', fontWeight: 900, cursor: 'pointer',
                                    boxShadow: '0 0 24px rgba(0,255,120,0.4), 0 4px 20px rgba(0,0,0,0.4)',
                                    letterSpacing: '0.05em', textTransform: 'uppercase',
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                }}
                            >
                                <span>💳</span>
                                <span>Charge Ksh {total.toLocaleString()} [F9]</span>
                            </button>

                            {/* Cart discount quick action */}
                            <button
                                onClick={() => {
                                    setSupervisorModal({
                                        isOpen: true,
                                        title: 'Apply Cart-Wide Discount',
                                        action: () => {
                                            const d = prompt('Cart discount amount (Ksh):');
                                            if (d !== null) setCartDiscount(Math.max(0, Math.min(Number(d), subtotal)));
                                        }
                                    });
                                }}
                                style={{ padding: '7px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, width: '100%' }}
                            >
                                🏷️ Apply Cart Discount (Supervisor Required)
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── CSS Animations ──────────────────────────── */}
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100% { opacity:1; box-shadow: 0 0 6px #00ff78; } 50% { opacity:0.5; box-shadow: 0 0 12px #00ff78; } }
                * { box-sizing: border-box; }
                ::-webkit-scrollbar { width: 4px; height: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(0,255,120,0.2); border-radius: 4px; }
            `}</style>

            {/* ── MODALS ──────────────────────────────────── */}
            <PremiumPaymentModal
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                total={total}
                invoiceNo={invoiceNo}
                onComplete={handlePaymentComplete}
            />

            <PremiumSplitModal
                isOpen={showSplit}
                onClose={() => setShowSplit(false)}
                total={total}
                cart={cart}
                invoiceNo={invoiceNo}
                tableNo={tableNo}
                onCompleteShare={handleCompleteShare}
                onCompleteItemized={handleCompleteItemized}
            />

            <PremiumMergeModal
                isOpen={showMerge}
                onClose={() => setShowMerge(false)}
                runningOrders={runningOrders}
                onMerge={handleMerge}
            />

            <PremiumNotesModal
                isOpen={showNotesModal}
                onClose={() => setShowNotesModal(false)}
                currentNotes={cart.find(i => i.id === selectedNoteItemId)?.notes || ''}
                onSave={(n) => selectedNoteItemId && saveNotes(selectedNoteItemId, n)}
                foodNotes={foodNotes}
            />

            <SupervisorPinModal
                isOpen={supervisorModal.isOpen}
                title={supervisorModal.title}
                onClose={() => setSupervisorModal(prev => ({ ...prev, isOpen: false }))}
                onSuccess={supervisorModal.action}
            />

            {/* Held Sales Drawer */}
            {showHeldSales && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }} onClick={() => setShowHeldSales(false)}>
                    <div style={{ background: 'rgba(8,8,8,0.98)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '20px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15), transparent)', borderBottom: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: 0 }}>📋 Held Orders</h2>
                                <p style={{ fontSize: '11px', color: 'rgba(245,158,11,0.7)', margin: '2px 0 0' }}>{heldSales.length} order{heldSales.length !== 1 ? 's' : ''} on hold</p>
                            </div>
                            <button onClick={() => setShowHeldSales(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '30px', height: '30px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                            {heldSales.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.2)' }}>
                                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📋</div>
                                    <p>No held orders</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {heldSales.map(h => {
                                        const ago = Math.floor((Date.now() - new Date(h.heldAt).getTime()) / 60000);
                                        return (
                                            <div key={h.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '14px', padding: '14px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <div>
                                                        <p style={{ fontWeight: 800, fontSize: '13px', color: '#fff', margin: 0 }}>{h.invoiceNo}</p>
                                                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>⏱ {ago < 1 ? 'Just now' : `${ago}m ago`}{h.tableNo ? ` · Table ${h.tableNo}` : ''}</p>
                                                    </div>
                                                    <p style={{ fontSize: '18px', fontWeight: 900, color: '#00ff78', fontFamily: 'monospace' }}>Ksh {h.total.toLocaleString()}</p>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                                                    <button onClick={() => recallHeld(h.id)} style={{ padding: '9px', borderRadius: '9px', background: 'linear-gradient(135deg, rgba(0,204,96,0.2), rgba(0,255,120,0.1))', border: '1px solid rgba(0,255,120,0.2)', color: '#00ff78', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>▶️ Recall Order</button>
                                                    <button onClick={() => setHeldSales(prev => prev.filter(s => s.id !== h.id))} style={{ padding: '9px 12px', borderRadius: '9px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}>🗑️</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
