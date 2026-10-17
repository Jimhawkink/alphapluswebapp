'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SaleItem { product_name: string; quantity: number; unit_price: number; subtotal: number; }
interface Sale {
    sale_id: number; receipt_no: string; total_amount: number; amount_paid: number;
    status: string; customer_name?: string; sale_datetime: string;
    waiter_name?: string; table_name?: string; table_no?: string;
    mpesa_code?: string; mpesa_receipt?: string; checkout_request_id?: string;
    customer_phone?: string; updated_at?: string;
}
type PayState = 'idle'|'sending'|'waiting'|'success'|'insufficient'|'cancelled'|'failed'|'timeout';

// ── Confetti particle component ──────────────────────────────────────────────
function Confetti() {
    const colors = ['#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#ef4444','#06b6d4','#84cc16'];
    const particles = Array.from({length: 80}, (_, i) => ({
        id: i,
        color: colors[i % colors.length],
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 3,
        size: 6 + Math.random() * 10,
        rotate: Math.random() * 360,
    }));
    return (
        <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'hidden',zIndex:9999}}>
            <style>{`
                @keyframes fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
                @keyframes sway{0%,100%{margin-left:0}50%{margin-left:40px}}
                @keyframes pop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:1}}
                @keyframes shimmer{0%,100%{opacity:1}50%{opacity:0.6}}
                @keyframes bounce-in{0%{transform:translateY(30px) scale(0.8);opacity:0}60%{transform:translateY(-10px) scale(1.05)}100%{transform:translateY(0) scale(1);opacity:1}}
                @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(16,185,129,0.5)}50%{box-shadow:0 0 40px rgba(16,185,129,0.9),0 0 60px rgba(16,185,129,0.4)}}
                @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
                @keyframes spin-slow{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
                @keyframes firework{0%{transform:scale(0) rotate(0deg);opacity:1}100%{transform:scale(1) rotate(180deg);opacity:0}}
            `}</style>
            {particles.map(p => (
                <div key={p.id} style={{
                    position:'absolute', left:`${p.left}%`, top:'-20px',
                    width:`${p.size}px`, height:`${p.size * 0.4}px`,
                    background: p.color, borderRadius: p.id%3===0?'50%':'2px',
                    animation: `fall ${p.duration}s ${p.delay}s linear infinite, sway ${p.duration*0.7}s ${p.delay}s ease-in-out infinite`,
                    transform: `rotate(${p.rotate}deg)`,
                }} />
            ))}
        </div>
    );
}

// ── Firework burst ────────────────────────────────────────────────────────────
function Fireworks() {
    const bursts = [
        {top:'15%',left:'10%',color:'#f59e0b'},{top:'20%',right:'10%',color:'#ec4899'},
        {top:'5%',left:'50%',color:'#3b82f6'},{top:'30%',left:'25%',color:'#10b981'},
        {top:'10%',right:'25%',color:'#8b5cf6'},
    ];
    return (
        <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:9998}}>
            {bursts.map((b,i)=>(
                <div key={i} style={{position:'absolute',...b,fontSize:32,animation:`firework 1.5s ${i*0.3}s ease-out infinite`}}>✨</div>
            ))}
        </div>
    );
}

export default function PayPage({ params }: { params: { receiptNo: string } }) {
    const receiptNo = decodeURIComponent(params.receiptNo);
    const [sale, setSale] = useState<Sale|null>(null);
    const [items, setItems] = useState<SaleItem[]>([]);
    const [hotelName, setHotelName] = useState('AlphaPlus Hotel');
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [phone, setPhone] = useState('');
    const [payState, setPayState] = useState<PayState>('idle');
    const [mpesaCode, setMpesaCode] = useState('');
    const [paidPhone, setPaidPhone] = useState('');
    const [paidAt, setPaidAt] = useState('');
    const [msg, setMsg] = useState('');
    const pollRef = useRef<NodeJS.Timeout|null>(null);
    const timeoutRef = useRef<NodeJS.Timeout|null>(null);

    useEffect(() => { loadAll(); return () => { clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!); }; }, []);

    async function loadAll() {
        setLoading(true);
        // Load hotel name
        const { data: settings } = await supabase.from('organisation_settings')
            .select('setting_value').eq('setting_key','hotel_name').single();
        if (settings?.setting_value) setHotelName(settings.setting_value);

        // Load sale
        const { data: s } = await supabase.from('sales').select('*').eq('receipt_no', receiptNo).single();
        if (!s) { setNotFound(true); setLoading(false); return; }
        setSale(s);
        if (s.status === 'Paid' && (s.mpesa_code || s.mpesa_receipt)) {
            setMpesaCode(s.mpesa_code || s.mpesa_receipt || '');
            setPayState('success');
            setPaidAt(new Date(s.updated_at || s.sale_datetime).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
        }
        // Load items
        const { data: it } = await supabase.from('sales_items').select('*').eq('sale_id', s.sale_id);
        setItems(it || []);
        setLoading(false);
    }

    function fmt(raw: string) {
        let p = raw.replace(/\s|-|\+/g,'');
        if (p.startsWith('0')) p = '254'+p.slice(1);
        else if(!p.startsWith('254')) p = '254'+p;
        return p;
    }
    function valid(raw: string) { return /^(07\d{8}|01\d{8}|254\d{9})$/.test(raw.replace(/\s|-|\+/g,'')); }

    async function handlePay() {
        if (!sale||!valid(phone)) { setMsg('Please enter a valid Safaricom number (07xx or 01xx)'); return; }
        const outstanding = sale.total_amount - (sale.amount_paid||0);
        if (outstanding<=0) { setMsg('This bill is already fully paid!'); return; }
        setPayState('sending'); setMsg('');
        const formatted = fmt(phone);
        setPaidPhone(formatted);
        try {
            const res = await fetch('/api/mpesa/stkpush',{method:'POST',headers:{'Content-Type':'application/json'},
                body: JSON.stringify({phone:formatted,amount:outstanding,reference:sale.receipt_no,description:`Bill Payment - ${sale.receipt_no}`})});
            const data = await res.json();
            if (!data.success||!data.checkoutRequestId) { setPayState('failed'); setMsg(data.error||'Failed to send STK push. Try again.'); return; }
            setPayState('waiting');
            poll(data.checkoutRequestId, outstanding);
            timeoutRef.current = setTimeout(()=>{ clearInterval(pollRef.current!); setPayState('timeout'); setMsg('Payment timed out. Please try again.'); },150000);
        } catch { setPayState('failed'); setMsg('Network error. Please try again.'); }
    }

    function poll(cid: string, amount: number) {
        pollRef.current = setInterval(async()=>{
            try {
                // Check sales table first (callback updates it)
                const {data: s} = await supabase.from('sales').select('status,mpesa_code,mpesa_receipt,updated_at,amount_paid').eq('receipt_no',receiptNo).single();
                if (s?.status==='Paid'&&(s?.mpesa_code||s?.mpesa_receipt)) {
                    clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!);
                    const code = s.mpesa_code||s.mpesa_receipt||'';
                    setMpesaCode(code); setPayState('success');
                    setPaidAt(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
                    setSale(prev=>prev?{...prev,status:'Paid',mpesa_code:code,amount_paid:amount}:prev);
                    return;
                }
                // Check API
                const r = await fetch(`/api/mpesa/check-status?checkoutRequestId=${cid}`);
                const d = await r.json();
                if (d.status==='pending'||d.pending) return;
                const code = d.resultCode??d.ResultCode;
                if (code===4999||code===undefined||code===null) return;
                clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!);
                if (code===0) {
                    const rc = d.mpesaReceipt||d.MpesaReceiptNumber||'';
                    setMpesaCode(rc); setPayState('success');
                    setPaidAt(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
                    await supabase.from('sales').update({status:'Paid',payment_method:'M-Pesa',amount_paid:amount,mpesa_code:rc}).eq('receipt_no',receiptNo);
                } else if (code===1) { setPayState('insufficient'); setMsg('Insufficient M-Pesa balance. Please top up and try again.'); }
                else if (code===1032||code===17) { setPayState('cancelled'); setMsg('Payment cancelled. Please try again when ready.'); }
                else if (code===2001) { setPayState('failed'); setMsg('Wrong PIN entered. Please try again.'); }
                else { setPayState('failed'); setMsg(`Payment failed (Code: ${code}). Please try again.`); }
            } catch {}
        },5000);
    }

    const outstanding = sale ? sale.total_amount-(sale.amount_paid||0) : 0;
    const firstName = sale?.customer_name ? sale.customer_name.split(' ')[0] : 'Valued Guest';
    const now = new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

    if (loading) return (
        <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#667eea,#764ba2)',fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
            <div style={{width:50,height:50,border:'4px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin-slow 0.8s linear infinite'}} />
            <p style={{color:'#fff',marginTop:16,fontSize:16}}>Loading your bill...</p>
        </div>
    );

    if (notFound) return (
        <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f0f4ff',fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",padding:20}}>
            <div style={{fontSize:64}}>🔍</div>
            <h2 style={{color:'#1e293b',marginTop:12}}>Receipt Not Found</h2>
            <p style={{color:'#64748b'}}>Receipt <strong>{receiptNo}</strong> could not be found.</p>
        </div>
    );

    // ── SUCCESS SCREEN ────────────────────────────────────────────────────────
    if (payState==='success') return (
        <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#064e3b,#065f46,#047857)',fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",padding:'20px 16px',display:'flex',flexDirection:'column',alignItems:'center'}}>
            <Confetti />
            <Fireworks />
            <style>{`
                @keyframes bounce-in{0%{transform:translateY(40px) scale(0.8);opacity:0}60%{transform:translateY(-8px) scale(1.05)}100%{transform:translateY(0) scale(1);opacity:1}}
                @keyframes glow{0%,100%{box-shadow:0 0 30px rgba(16,185,129,0.6)}50%{box-shadow:0 0 60px rgba(16,185,129,1),0 0 80px rgba(52,211,153,0.5)}}
                @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
                @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
                @keyframes pulse-ring{0%{transform:scale(1);opacity:1}100%{transform:scale(1.5);opacity:0}}
            `}</style>

            {/* Hotel Header */}
            <div style={{textAlign:'center',marginBottom:20,animation:'bounce-in 0.6s ease-out both',color:'#fff'}}>
                <div style={{fontSize:36,marginBottom:4,animation:'float 3s ease-in-out infinite'}}>🏨</div>
                <h1 style={{margin:0,fontSize:22,fontWeight:800,letterSpacing:0.5}}>{hotelName}</h1>
                <p style={{margin:'4px 0 0',opacity:0.8,fontSize:13}}>Welcome to our Cashless Payment System 🌟</p>
                <p style={{margin:'2px 0 0',opacity:0.7,fontSize:11}}>{now}</p>
            </div>

            {/* Big success card */}
            <div style={{width:'100%',maxWidth:420,background:'rgba(255,255,255,0.08)',backdropFilter:'blur(20px)',borderRadius:24,border:'1px solid rgba(255,255,255,0.2)',padding:'28px 20px',animation:'bounce-in 0.7s 0.1s ease-out both'}}>

                {/* Checkmark */}
                <div style={{textAlign:'center',marginBottom:20}}>
                    <div style={{position:'relative',display:'inline-block'}}>
                        <div style={{width:90,height:90,borderRadius:'50%',background:'linear-gradient(135deg,#10b981,#059669)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',animation:'glow 2s ease-in-out infinite',fontSize:44}}>✅</div>
                        <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:90,height:90,borderRadius:'50%',border:'3px solid #10b981',animation:'pulse-ring 1.5s ease-out infinite'}} />
                    </div>
                    <h2 style={{color:'#fff',fontSize:24,fontWeight:800,margin:'12px 0 4px'}}>Payment Successful! 🎉</h2>
                    <p style={{color:'rgba(255,255,255,0.8)',fontSize:14,margin:0}}>Your payment has been confirmed</p>
                </div>

                {/* M-Pesa Code — BIG and prominent */}
                <div style={{background:'linear-gradient(135deg,#f59e0b,#d97706)',borderRadius:16,padding:'16px 20px',marginBottom:16,textAlign:'center',boxShadow:'0 8px 24px rgba(245,158,11,0.4)'}}>
                    <p style={{color:'rgba(255,255,255,0.8)',fontSize:11,fontWeight:600,letterSpacing:2,textTransform:'uppercase',margin:'0 0 4px'}}>M-Pesa Transaction Code</p>
                    <p style={{color:'#fff',fontSize:28,fontWeight:900,letterSpacing:3,margin:0,fontFamily:'monospace'}}>{mpesaCode||'CONFIRMED'}</p>
                    <p style={{color:'rgba(255,255,255,0.7)',fontSize:10,margin:'4px 0 0'}}>Save this code for your records</p>
                </div>

                {/* Payment Details Grid */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                    <DetailBox icon="💰" label="Amount Paid" value={`Ksh ${sale!.total_amount.toFixed(2)}`} highlight />
                    <DetailBox icon="📱" label="Payment Mode" value="M-Pesa (Buy Goods)" />
                    <DetailBox icon="📞" label="Phone Used" value={paidPhone ? `+${paidPhone}` : sale?.customer_phone||'—'} />
                    <DetailBox icon="🧾" label="Receipt No" value={receiptNo} />
                    <DetailBox icon="🕐" label="Time Paid" value={paidAt||now} />
                    <DetailBox icon="👨‍🍳" label="Served By" value={sale?.waiter_name||'—'} />
                    {(sale?.table_name||sale?.table_no) && <DetailBox icon="🪑" label="Table" value={sale?.table_name||sale?.table_no||'—'} />}
                </div>

                {/* Items ordered */}
                {items.length > 0 && (
                    <div style={{background:'rgba(255,255,255,0.06)',borderRadius:12,padding:'12px 14px',marginBottom:16}}>
                        <p style={{color:'rgba(255,255,255,0.7)',fontSize:11,fontWeight:600,letterSpacing:1.5,textTransform:'uppercase',margin:'0 0 8px'}}>Items Ordered</p>
                        {items.map((it,i)=>(
                            <div key={i} style={{display:'flex',justifyContent:'space-between',color:'rgba(255,255,255,0.9)',fontSize:13,padding:'3px 0',borderBottom: i<items.length-1?'1px solid rgba(255,255,255,0.08)':'none'}}>
                                <span>{it.quantity}× {it.product_name}</span>
                                <span style={{fontWeight:600}}>Ksh {it.subtotal.toFixed(2)}</span>
                            </div>
                        ))}
                        <div style={{display:'flex',justifyContent:'space-between',color:'#fff',fontSize:15,fontWeight:700,marginTop:8,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.2)'}}>
                            <span>Total</span><span>Ksh {sale!.total_amount.toFixed(2)}</span>
                        </div>
                    </div>
                )}

                {/* Thank you note */}
                <div style={{background:'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))',borderRadius:16,padding:'18px 16px',textAlign:'center',border:'1px solid rgba(139,92,246,0.3)'}}>
                    <div style={{fontSize:28,marginBottom:6}}>💎</div>
                    <h3 style={{color:'#fff',fontSize:18,fontWeight:800,margin:'0 0 6px'}}>
                        Thank You{firstName!=='Valued Guest'?`, ${firstName}`:''}! 🙏
                    </h3>
                    <p style={{color:'rgba(255,255,255,0.85)',fontSize:13,margin:'0 0 8px',lineHeight:1.6}}>
                        We truly appreciate your business and trust in our cashless payment system. You are a <strong>valued customer</strong> and we look forward to serving you again!
                    </p>
                    <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.1)',borderRadius:20,padding:'6px 14px',fontSize:12,color:'rgba(255,255,255,0.9)'}}>
                        ⭐ Valued Customer of {hotelName}
                    </div>
                </div>

                <p style={{textAlign:'center',color:'rgba(255,255,255,0.4)',fontSize:10,marginTop:16}}>
                    Powered by AlphaPlus Hotel POS • {now}
                </p>
            </div>
        </div>
    );

    // ── PAYMENT INPUT SCREEN ──────────────────────────────────────────────────
    return (
        <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%)',fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",padding:'20px 16px',display:'flex',flexDirection:'column',alignItems:'center'}}>
            <style>{`
                @keyframes bounce-in{0%{transform:translateY(30px) scale(0.95);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
                @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
                @keyframes spin-slow{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
                @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
                input:focus{outline:none;border-color:#3b82f6!important;box-shadow:0 0 0 3px rgba(59,130,246,0.25)!important;}
            `}</style>

            {/* Header */}
            <div style={{textAlign:'center',marginBottom:20,animation:'bounce-in 0.5s ease-out both',color:'#fff'}}>
                <div style={{fontSize:32,animation:'float 3s ease-in-out infinite'}}>🏨</div>
                <h1 style={{margin:'6px 0 2px',fontSize:20,fontWeight:800}}>{hotelName}</h1>
                <p style={{margin:0,color:'rgba(255,255,255,0.6)',fontSize:12}}>Cashless Payment System • {now}</p>
                <div style={{display:'inline-block',marginTop:8,background:'rgba(16,185,129,0.15)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:20,padding:'4px 14px',fontSize:11,color:'#34d399'}}>
                    🔒 Secure M-Pesa Payment
                </div>
            </div>

            <div style={{width:'100%',maxWidth:420,animation:'bounce-in 0.5s 0.1s ease-out both'}}>

                {/* Receipt header */}
                <div style={{background:'linear-gradient(135deg,#1d4ed8,#4f46e5)',borderRadius:'20px 20px 0 0',padding:'20px',textAlign:'center',color:'#fff'}}>
                    <p style={{margin:'0 0 4px',fontSize:11,opacity:0.7,letterSpacing:2,textTransform:'uppercase'}}>Bill Payment</p>
                    <h2 style={{margin:'0 0 4px',fontSize:24,fontWeight:800}}>{receiptNo}</h2>
                    {sale?.waiter_name && <p style={{margin:0,fontSize:12,opacity:0.8}}>👨‍🍳 Served by: <strong>{sale.waiter_name}</strong></p>}
                    {(sale?.table_name||sale?.table_no) && <p style={{margin:'2px 0 0',fontSize:11,opacity:0.7}}>🪑 {sale?.table_name||sale?.table_no}</p>}
                </div>

                {/* Bill details */}
                <div style={{background:'#fff',padding:'16px 20px',boxShadow:'0 4px 24px rgba(0,0,0,0.3)'}}>
                    {/* Items */}
                    {items.length>0&&(
                        <div style={{marginBottom:12}}>
                            {items.map((it,i)=>(
                                <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'#374151',padding:'4px 0',borderBottom:i<items.length-1?'1px dashed #f3f4f6':'none'}}>
                                    <span style={{color:'#6b7280'}}>{it.quantity}× <span style={{color:'#111827'}}>{it.product_name}</span></span>
                                    <span style={{fontWeight:600}}>Ksh {it.subtotal.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{borderTop:'2px solid #e5e7eb',paddingTop:10,display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontWeight:700,fontSize:16}}>Total</span>
                        <span style={{fontWeight:800,fontSize:18,color:'#1d4ed8'}}>Ksh {sale!.total_amount.toFixed(2)}</span>
                    </div>
                    {sale!.amount_paid>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                            <span style={{color:'#16a34a',fontSize:14}}>Paid</span>
                            <span style={{color:'#16a34a',fontWeight:600}}>Ksh {sale!.amount_paid.toFixed(2)}</span>
                        </div>
                    )}
                    {outstanding>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:8,padding:'10px 12px',background:'#fef2f2',borderRadius:10,border:'1.5px solid #fca5a5'}}>
                            <span style={{color:'#dc2626',fontWeight:700}}>Balance Due</span>
                            <span style={{color:'#dc2626',fontWeight:800,fontSize:20}}>Ksh {outstanding.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Payment panel */}
                <div style={{background:'#fff',borderRadius:'0 0 20px 20px',padding:'20px',boxShadow:'0 8px 32px rgba(0,0,0,0.4)'}}>
                    {sale!.status==='Paid' ? (
                        <div style={{textAlign:'center',padding:'20px 0'}}>
                            <div style={{fontSize:48}}>✅</div>
                            <h3 style={{color:'#16a34a',margin:'8px 0 4px'}}>Bill Already Paid</h3>
                            {(sale!.mpesa_code||sale!.mpesa_receipt) && (
                                <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:12,padding:'10px 16px',marginTop:8}}>
                                    <p style={{margin:0,fontSize:12,color:'#16a34a'}}>M-Pesa Code</p>
                                    <p style={{margin:'2px 0 0',fontSize:20,fontWeight:800,color:'#15803d',fontFamily:'monospace'}}>{sale!.mpesa_code||sale!.mpesa_receipt}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,padding:'10px 14px',background:'#eff6ff',borderRadius:12}}>
                                <span style={{fontSize:20}}>📱</span>
                                <div>
                                    <p style={{margin:0,fontSize:13,fontWeight:700,color:'#1e40af'}}>M-Pesa STK Push</p>
                                    <p style={{margin:0,fontSize:11,color:'#3b82f6'}}>Enter your number → You'll get a prompt → Enter PIN</p>
                                </div>
                            </div>

                            <label style={{display:'block',fontSize:13,fontWeight:600,color:'#374151',marginBottom:6}}>Your Safaricom Number</label>
                            <input
                                type="tel" placeholder="07XX XXX XXX or 01XX XXX XXX"
                                value={phone} onChange={e=>setPhone(e.target.value)}
                                disabled={payState==='waiting'||payState==='sending'}
                                style={{width:'100%',padding:'14px',fontSize:18,border:'2px solid #d1d5db',borderRadius:12,boxSizing:'border-box',fontFamily:'monospace',letterSpacing:1,transition:'all 0.2s'}}
                            />

                            {msg&&(
                                <div style={{marginTop:10,padding:'10px 14px',borderRadius:10,border:'1px solid',
                                    background:payState==='insufficient'?'#fef3c7':payState==='cancelled'?'#f3f4f6':'#fee2e2',
                                    borderColor:payState==='insufficient'?'#f59e0b':payState==='cancelled'?'#d1d5db':'#fca5a5',
                                    color:payState==='insufficient'?'#92400e':payState==='cancelled'?'#374151':'#991b1b',fontSize:13}}>
                                    {payState==='insufficient'&&'⚠️ '}{payState==='cancelled'&&'ℹ️ '}{payState==='failed'&&'❌ '}{msg}
                                </div>
                            )}

                            {payState==='waiting'?(
                                <div style={{display:'flex',alignItems:'center',gap:12,marginTop:14,padding:'16px',background:'#eff6ff',borderRadius:12,border:'1px solid #bfdbfe'}}>
                                    <div style={{width:28,height:28,border:'3px solid #bfdbfe',borderTopColor:'#1d4ed8',borderRadius:'50%',animation:'spin-slow 0.8s linear infinite',flexShrink:0}} />
                                    <div>
                                        <p style={{margin:0,fontWeight:700,color:'#1e40af',fontSize:14}}>Check your phone!</p>
                                        <p style={{margin:'2px 0 0',color:'#3b82f6',fontSize:12}}>Enter your M-Pesa PIN to confirm Ksh {outstanding.toFixed(2)}</p>
                                    </div>
                                </div>
                            ):(
                                <button onClick={handlePay} disabled={payState==='sending'}
                                    style={{width:'100%',marginTop:14,padding:'16px',background:payState==='sending'?'#9ca3af':'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',border:'none',borderRadius:14,fontSize:18,fontWeight:800,cursor:payState==='sending'?'not-allowed':'pointer',boxShadow:'0 4px 16px rgba(22,163,74,0.4)',transition:'all 0.2s'}}>
                                    {payState==='sending'?'⏳ Sending...':`💳 Pay Ksh ${outstanding.toFixed(2)} via M-Pesa`}
                                </button>
                            )}

                            <div style={{display:'flex',justifyContent:'center',gap:16,marginTop:14}}>
                                {['🔒 Secure','⚡ Instant','✅ M-Pesa'].map(t=>(
                                    <span key={t} style={{fontSize:11,color:'#9ca3af',display:'flex',alignItems:'center',gap:3}}>{t}</span>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <p style={{textAlign:'center',color:'rgba(255,255,255,0.3)',fontSize:10,marginTop:16}}>
                    Powered by AlphaPlus Hotel POS • {hotelName}
                </p>
            </div>
        </div>
    );
}

// Detail box component for success screen
function DetailBox({icon,label,value,highlight=false}:{icon:string;label:string;value:string;highlight?:boolean}) {
    return (
        <div style={{background:highlight?'rgba(16,185,129,0.2)':'rgba(255,255,255,0.08)',borderRadius:12,padding:'10px 12px',border:highlight?'1px solid rgba(16,185,129,0.4)':'1px solid rgba(255,255,255,0.1)'}}>
            <div style={{fontSize:16,marginBottom:3}}>{icon}</div>
            <p style={{margin:0,fontSize:10,color:'rgba(255,255,255,0.55)',textTransform:'uppercase',letterSpacing:1}}>{label}</p>
            <p style={{margin:'2px 0 0',fontSize:13,fontWeight:700,color:highlight?'#34d399':'#fff',wordBreak:'break-all'}}>{value}</p>
        </div>
    );
}
