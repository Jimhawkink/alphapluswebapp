'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SaleItem { product_name: string; quantity: number; unit_price: number; subtotal: number; }
interface SaleData {
  sale_id: number; receipt_no: string; total_amount: number; status: string;
  payment_method: string; table_no?: string; waiter_name?: string;
  sale_datetime: string; items: SaleItem[];
}

type PayStatus = 'idle' | 'sending' | 'waiting' | 'success' | 'failed' | 'cancelled' | 'insufficient';

export default function PublicPayPage({ params }: { params: { receiptNo: string } }) {
  const { receiptNo } = params;
  const [sale, setSale] = useState<SaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [payStatus, setPayStatus] = useState<PayStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [checkoutId, setCheckoutId] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollCount = useRef(0);

  // Load sale from DB by receipt_no
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: salesData } = await supabase
        .from('sales')
        .select('sale_id, receipt_no, total_amount, status, payment_method, table_no, waiter_name, sale_datetime')
        .eq('receipt_no', receiptNo)
        .single();

      if (!salesData) { setLoading(false); return; }

      const { data: items } = await supabase
        .from('sales_items')
        .select('product_name, quantity, unit_price, subtotal')
        .eq('sale_id', salesData.sale_id);

      setSale({ ...salesData, items: items || [] });
      setLoading(false);
    };
    load();
  }, [receiptNo]);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const formatPhone = (p: string) => {
    let c = p.replace(/\s|-|\+/g, '');
    if (c.startsWith('0')) c = '254' + c.slice(1);
    else if (!c.startsWith('254')) c = '254' + c;
    return c;
  };

  const startPolling = (cid: string) => {
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current++;
      if (pollCount.current > 30) {
        // 2.5 min timeout
        clearInterval(pollRef.current!);
        setPayStatus('failed');
        setStatusMsg('Payment timed out. Please try again.');
        return;
      }
      try {
        const r = await fetch(`/api/mpesa/check-status?checkoutRequestId=${cid}`);
        const d = await r.json();

        if (d.status === 'completed' || d.resultCode === 0) {
          clearInterval(pollRef.current!);
          setMpesaCode(d.mpesaReceipt || '');
          setPayStatus('success');
          setStatusMsg('Payment confirmed! ✅');
        } else if (d.resultCode === 1 || d.resultDescription?.toLowerCase().includes('insufficient')) {
          clearInterval(pollRef.current!);
          setPayStatus('insufficient');
          setStatusMsg('Insufficient M-Pesa balance. Please top up and try again.');
        } else if (d.resultCode === 1032 || d.resultCode === 17 || d.resultDescription?.toLowerCase().includes('cancel')) {
          clearInterval(pollRef.current!);
          setPayStatus('cancelled');
          setStatusMsg('Payment was cancelled. Try again if needed.');
        } else if (d.resultCode === 2001) {
          clearInterval(pollRef.current!);
          setPayStatus('failed');
          setStatusMsg('Wrong PIN entered. Transaction failed.');
        }
        // else still pending — keep polling
      } catch { /* keep polling */ }
    }, 5000);
  };

  const handlePay = async () => {
    if (!phone.trim()) { alert('Please enter your M-Pesa phone number'); return; }
    if (!sale) return;

    setPayStatus('sending');
    setStatusMsg('Sending STK Push to your phone...');

    try {
      const res = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formatPhone(phone),
          amount: Math.ceil(sale.total_amount),
          reference: receiptNo,
          description: `Bill ${receiptNo}`,
        }),
      });
      const data = await res.json();

      if (data.success && data.CheckoutRequestID) {
        setCheckoutId(data.CheckoutRequestID);
        setPayStatus('waiting');
        setStatusMsg('📲 Check your phone — enter your M-Pesa PIN to complete payment');
        startPolling(data.CheckoutRequestID);
      } else {
        setPayStatus('failed');
        setStatusMsg(data.error || 'Failed to send STK push. Please try again.');
      }
    } catch {
      setPayStatus('failed');
      setStatusMsg('Network error. Please check your connection and try again.');
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPayStatus('idle');
    setStatusMsg('');
    setMpesaCode('');
    setCheckoutId('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-5xl mb-4">⏳</div>
          <p className="text-gray-600 font-medium">Loading bill details...</p>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Bill Not Found</h1>
          <p className="text-gray-500 text-sm">Receipt <strong>{receiptNo}</strong> could not be found.</p>
        </div>
      </div>
    );
  }

  const alreadyPaid = sale.status === 'Completed' || sale.payment_method?.toLowerCase() !== 'pending';

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white text-center">
          <div className="text-4xl mb-2">🏨</div>
          <h1 className="text-xl font-bold">Pay Your Bill</h1>
          <p className="text-green-100 text-sm mt-1">Receipt: {receiptNo}</p>
          {sale.table_no && <p className="text-green-100 text-xs mt-1">🪑 Table {sale.table_no}</p>}
        </div>

        <div className="p-6">

          {/* Bill Summary */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-5">
            <h2 className="font-bold text-gray-700 text-sm mb-3">📋 Bill Summary</h2>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {sale.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600">
                  <span>{item.product_name} × {item.quantity}</span>
                  <span className="font-medium">Ksh {item.subtotal.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-gray-300 mt-3 pt-3 flex justify-between items-center">
              <span className="font-bold text-gray-700">TOTAL DUE</span>
              <span className="text-2xl font-black text-green-600">Ksh {sale.total_amount.toLocaleString()}</span>
            </div>
          </div>

          {/* Already Paid */}
          {alreadyPaid ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-3">✅</div>
              <h2 className="text-lg font-bold text-green-700">Already Paid</h2>
              <p className="text-gray-500 text-sm mt-1">This bill has been settled.</p>
            </div>

          ) : payStatus === 'success' ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-lg font-bold text-green-700">Payment Successful!</h2>
              {mpesaCode && <p className="text-sm text-gray-600 mt-2 font-mono bg-green-50 rounded-xl py-2 px-3">M-Pesa Code: <strong>{mpesaCode}</strong></p>}
              <p className="text-xs text-gray-400 mt-3">Thank you for dining with us!</p>
            </div>

          ) : payStatus === 'insufficient' ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">💸</div>
              <h2 className="text-lg font-bold text-red-600">Insufficient Balance</h2>
              <p className="text-sm text-gray-500 mt-1">Please top up your M-Pesa and try again.</p>
              <button onClick={reset} className="mt-4 w-full py-3 bg-green-600 text-white rounded-xl font-semibold">Try Again</button>
            </div>

          ) : payStatus === 'cancelled' ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">❌</div>
              <h2 className="text-lg font-bold text-orange-600">Payment Cancelled</h2>
              <p className="text-sm text-gray-500 mt-1">You cancelled the M-Pesa prompt.</p>
              <button onClick={reset} className="mt-4 w-full py-3 bg-green-600 text-white rounded-xl font-semibold">Try Again</button>
            </div>

          ) : payStatus === 'waiting' ? (
            <div className="text-center py-6">
              <div className="text-5xl animate-pulse mb-3">📲</div>
              <h2 className="text-base font-bold text-gray-800">Check Your Phone</h2>
              <p className="text-sm text-gray-500 mt-2">An M-Pesa prompt has been sent to <strong>{phone}</strong></p>
              <p className="text-sm text-gray-500 mt-1">Enter your PIN to pay <strong className="text-green-700">Ksh {sale.total_amount.toLocaleString()}</strong></p>
              <div className="mt-4 flex justify-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <p className="text-xs text-gray-400 mt-4">Waiting for confirmation...</p>
              <button onClick={reset} className="mt-3 text-xs text-gray-400 underline">Cancel</button>
            </div>

          ) : (
            /* Payment Form */
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">📱 M-Pesa Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX or 254XXXXXXXXX"
                className="w-full p-4 border-2 border-gray-200 rounded-2xl text-lg focus:border-green-500 focus:outline-none mb-2"
              />
              <p className="text-xs text-gray-400 mb-5">Enter the number to receive the M-Pesa STK Push prompt</p>

              {payStatus === 'failed' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                  ⚠️ {statusMsg}
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={payStatus === 'sending' || !phone.trim()}
                className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
              >
                {payStatus === 'sending' ? '⏳ Sending...' : `📤 Pay Ksh ${sale.total_amount.toLocaleString()} via M-Pesa`}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">Powered by Alpha Plus Hotel POS</p>
          <p className="text-xs text-gray-300">🔒 Secure M-Pesa Payment</p>
        </div>
      </div>
    </div>
  );
}
