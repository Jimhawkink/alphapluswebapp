'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface SaleItem {
    item_id: number;
    product_name: string;
    product_code: string;
    qty: number;
    unit_price: number;
    total_price: number;
    discount: number;
}

interface SaleRecord {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    customer_name: string;
    customer_phone: string;
    order_type: string;
    subtotal: number;
    discount: number;
    tax_amount: number;
    total_amount: number;
    payment_method: string;
    waiter_name: string;
    table_name: string;
    shift_name: string;
    items: SaleItem[];
}

interface ReturnItem {
    item_id: number;
    product_name: string;
    qty_sold: number;
    unit_price: number;
    qty_to_return: number;
    selected: boolean;
}

const RETURN_REASONS = [
    'Customer not satisfied',
    'Wrong item delivered',
    'Item was cold / not fresh',
    'Overcharged / billing error',
    'Duplicate order',
    'Customer changed mind',
    'Quality issue',
    'Allergy / dietary concern',
    'Manager approval',
    'Other',
];

export default function SalesReturnPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [sale, setSale] = useState<SaleRecord | null>(null);
    const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
    const [reason, setReason] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [returnMethod, setReturnMethod] = useState('Cash Refund');
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState<'search' | 'select' | 'confirm' | 'done'>('search');
    const [completedReturn, setCompletedReturn] = useState<{ refNo: string; amount: number } | null>(null);

    // Recent returns
    const [recentReturns, setRecentReturns] = useState<any[]>([]);
    const [loadingRecent, setLoadingRecent] = useState(false);
    const [showRecent, setShowRecent] = useState(false);

    const searchReceipt = useCallback(async () => {
        const q = searchQuery.trim();
        if (!q) { toast.error('Enter a receipt number or customer name'); return; }
        setSearching(true);
        setSale(null);
        try {
            // Search by receipt_no or customer name
            const { data, error } = await supabase
                .from('sales')
                .select('*, sales_items(*)')
                .or(`receipt_no.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`)
                .order('sale_datetime', { ascending: false })
                .limit(5);

            if (error) throw error;
            if (!data || data.length === 0) { toast.error('No sale found for: ' + q); setSearching(false); return; }

            const row = data[0];
            const items: SaleItem[] = (row.sales_items || []).map((i: any) => ({
                item_id: i.item_id || i.id,
                product_name: i.product_name,
                product_code: i.product_code || '',
                qty: i.qty || i.quantity || 0,
                unit_price: i.unit_price || 0,
                total_price: i.total_price || 0,
                discount: i.discount || 0,
            }));

            const saleRec: SaleRecord = {
                sale_id: row.sale_id,
                receipt_no: row.receipt_no,
                sale_date: row.sale_date,
                sale_time: row.sale_time,
                customer_name: row.customer_name || 'Walk-in',
                customer_phone: row.customer_phone || '',
                order_type: row.order_type || 'Quick Sale',
                subtotal: row.subtotal || 0,
                discount: row.discount || 0,
                tax_amount: row.tax_amount || 0,
                total_amount: row.total_amount || 0,
                payment_method: row.payment_method || 'Cash',
                waiter_name: row.waiter_name || '',
                table_name: row.table_name || '',
                shift_name: row.shift_name || '',
                items,
            };

            setSale(saleRec);
            setReturnItems(items.map(i => ({
                item_id: i.item_id,
                product_name: i.product_name,
                qty_sold: i.qty,
                unit_price: i.unit_price,
                qty_to_return: i.qty,
                selected: false,
            })));
            setStep('select');
        } catch (err: any) {
            toast.error('Search failed: ' + err.message);
        }
        setSearching(false);
    }, [searchQuery]);

    const loadRecentReturns = async () => {
        setLoadingRecent(true);
        try {
            const { data } = await supabase
                .from('sales_returns')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);
            setRecentReturns(data || []);
            setShowRecent(true);
        } catch { setRecentReturns([]); }
        setLoadingRecent(false);
    };

    const toggleItem = (idx: number) => {
        setReturnItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
    };

    const setQty = (idx: number, val: number) => {
        setReturnItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const clamped = Math.min(Math.max(0, val), item.qty_sold);
            return { ...item, qty_to_return: clamped, selected: clamped > 0 };
        }));
    };

    const selectedItems = returnItems.filter(i => i.selected && i.qty_to_return > 0);
    const refundTotal = selectedItems.reduce((s, i) => s + (i.unit_price * i.qty_to_return), 0);

    const processReturn = async () => {
        if (selectedItems.length === 0) { toast.error('Select at least one item to return'); return; }
        const finalReason = reason === 'Other' ? customReason.trim() : reason;
        if (!finalReason) { toast.error('Select a return reason'); return; }
        if (!sale) return;

        setIsProcessing(true);
        try {
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            const refNo = `RET-${Date.now()}`;

            const returnPayload = {
                return_ref: refNo,
                original_sale_id: sale.sale_id,
                original_receipt_no: sale.receipt_no,
                return_date: new Date().toISOString().split('T')[0],
                customer_name: sale.customer_name,
                customer_phone: sale.customer_phone,
                return_reason: finalReason,
                return_method: returnMethod,
                refund_amount: refundTotal,
                items_returned: JSON.stringify(selectedItems.map(i => ({
                    product_name: i.product_name,
                    qty_returned: i.qty_to_return,
                    unit_price: i.unit_price,
                    subtotal: i.unit_price * i.qty_to_return,
                }))),
                processed_by: userData?.name || 'Admin',
                created_at: new Date().toISOString(),
            };

            const { error } = await supabase.from('sales_returns').insert(returnPayload);
            if (error && error.code !== '42P01') throw error;

            // Log each returned item as a stock movement reversal
            for (const item of selectedItems) {
                await supabase.from('stock_movements').insert({
                    movement_date: new Date().toISOString().split('T')[0],
                    product_name: item.product_name,
                    movement_type: 'Sales Return',
                    quantity: item.qty_to_return,
                    unit: 'PCS',
                    unit_cost: item.unit_price,
                    total_cost: item.unit_price * item.qty_to_return,
                    reference_no: refNo,
                    reference_type: 'sales_return',
                    reason: finalReason,
                    created_by: userData?.name || 'Admin',
                    created_at: new Date().toISOString(),
                }).maybeSingle();
            }

            setCompletedReturn({ refNo, amount: refundTotal });
            setStep('done');
            toast.success(`✅ Return processed! Ref: ${refNo}`);
        } catch (err: any) {
            toast.error('Failed: ' + err.message);
        }
        setIsProcessing(false);
    };

    const reset = () => {
        setStep('search');
        setSale(null);
        setReturnItems([]);
        setSearchQuery('');
        setReason('');
        setCustomReason('');
        setReturnMethod('Cash Refund');
        setCompletedReturn(null);
        setShowRecent(false);
    };

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">↩️</span>
                    Sales Return / Refund
                </h1>
                <button onClick={loadRecentReturns} disabled={loadingRecent}
                    className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm">
                    {loadingRecent ? '⏳...' : '📋 Recent Returns'}
                </button>
            </div>

            {/* Progress Steps */}
            <div className="bg-white rounded-2xl border p-4 flex items-center justify-between">
                {[
                    { key: 'search',  label: '1. Find Receipt', icon: '🔍' },
                    { key: 'select',  label: '2. Select Items',  icon: '📦' },
                    { key: 'confirm', label: '3. Confirm',       icon: '✅' },
                    { key: 'done',    label: '4. Done',          icon: '🎉' },
                ].map((s, i) => (
                    <div key={s.key} className="flex items-center flex-1">
                        <div className={`flex items-center gap-2 text-sm font-semibold ${step === s.key ? 'text-orange-600' : ['done', 'confirm', 'select'].indexOf(step) > ['done', 'confirm', 'select', 'search'].indexOf(s.key) || step === 'done' ? 'text-emerald-600' : 'text-gray-300'}`}>
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s.key ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-300' : 'bg-gray-100 text-gray-400'}`}>{s.icon}</span>
                            <span className="hidden sm:block">{s.label}</span>
                        </div>
                        {i < 3 && <div className="flex-1 h-0.5 bg-gray-100 mx-2" />}
                    </div>
                ))}
            </div>

            {/* ── STEP 1: SEARCH ── */}
            {step === 'search' && (
                <div className="bg-white rounded-2xl border p-8 text-center space-y-6">
                    <div>
                        <div className="text-6xl mb-4">🔍</div>
                        <h2 className="text-xl font-bold text-gray-800">Find Original Receipt</h2>
                        <p className="text-sm text-gray-500 mt-1">Search by receipt number, customer name or phone</p>
                    </div>
                    <div className="max-w-lg mx-auto">
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchReceipt()}
                                placeholder="e.g. REC-0001 or John Doe or 07..."
                                className="flex-1 px-5 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-500 outline-none font-mono"
                            />
                            <button onClick={searchReceipt} disabled={searching}
                                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {searching ? '⏳' : '🔍 Search'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── STEP 2: SELECT ITEMS ── */}
            {step === 'select' && sale && (
                <div className="space-y-4">
                    {/* Sale Summary */}
                    <div className="bg-white rounded-2xl border overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-500 to-red-600 px-5 py-4 text-white flex items-center justify-between">
                            <div>
                                <h2 className="font-black text-lg">Receipt: {sale.receipt_no}</h2>
                                <p className="text-orange-200 text-xs mt-0.5">{sale.sale_date} • {sale.customer_name} • {sale.order_type}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs opacity-70">Total Paid</p>
                                <p className="text-2xl font-black">{fmt(sale.total_amount)}</p>
                            </div>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-3 gap-3 text-center text-sm mb-5">
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs text-gray-500">Payment</p>
                                    <p className="font-bold text-gray-800">{sale.payment_method}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs text-gray-500">Served By</p>
                                    <p className="font-bold text-gray-800">{sale.waiter_name || 'N/A'}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs text-gray-500">Table</p>
                                    <p className="font-bold text-gray-800">{sale.table_name || 'N/A'}</p>
                                </div>
                            </div>

                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Select Items to Return</h3>
                            <div className="space-y-3">
                                {returnItems.map((item, idx) => (
                                    <div key={item.item_id}
                                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${item.selected ? 'border-orange-300 bg-orange-50' : 'border-gray-100 hover:border-gray-200'}`}>
                                        <input type="checkbox" checked={item.selected} onChange={() => toggleItem(idx)}
                                            className="w-5 h-5 accent-orange-500 cursor-pointer flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="font-bold text-gray-800">{item.product_name}</p>
                                            <p className="text-xs text-gray-500">{fmt(item.unit_price)} × {item.qty_sold} sold</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Return qty:</span>
                                            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                                                <button onClick={() => setQty(idx, item.qty_to_return - 1)}
                                                    className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold">−</button>
                                                <span className="w-10 text-center text-sm font-bold">{item.qty_to_return}</span>
                                                <button onClick={() => setQty(idx, item.qty_to_return + 1)}
                                                    className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold">+</button>
                                            </div>
                                            <span className={`text-sm font-black w-24 text-right ${item.selected ? 'text-orange-700' : 'text-gray-400'}`}>
                                                {item.selected ? fmt(item.unit_price * item.qty_to_return) : '—'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Refund Summary */}
                    {selectedItems.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-orange-700 font-semibold">{selectedItems.length} item(s) selected for return</p>
                                <p className="text-xs text-orange-500 mt-0.5">{selectedItems.map(i => `${i.product_name} (×${i.qty_to_return})`).join(', ')}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-orange-600">Total Refund</p>
                                <p className="text-3xl font-black text-orange-700">{fmt(refundTotal)}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between">
                        <button onClick={() => setStep('search')} className="px-6 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                            ← Change Receipt
                        </button>
                        <button onClick={() => { if (selectedItems.length === 0) { toast.error('Select at least one item'); return; } setStep('confirm'); }}
                            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg transition-all text-sm">
                            Confirm Return →
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 3: CONFIRM ── */}
            {step === 'confirm' && sale && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border p-6 space-y-5">
                        <h2 className="font-bold text-gray-800 text-lg">✅ Confirm Return Details</h2>

                        {/* Return Reason */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-2">Return Reason <span className="text-red-500">*</span></label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {RETURN_REASONS.map(r => (
                                    <button key={r} onClick={() => setReason(r)}
                                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-all border-2 ${reason === r ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'}`}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                            {reason === 'Other' && (
                                <textarea value={customReason} onChange={e => setCustomReason(e.target.value)}
                                    placeholder="Describe the return reason..." rows={2}
                                    className="mt-3 w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-orange-500 outline-none resize-none" />
                            )}
                        </div>

                        {/* Refund Method */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-2">Refund Method</label>
                            <div className="flex flex-wrap gap-2">
                                {['Cash Refund', 'M-Pesa Refund', 'Store Credit', 'Card Refund', 'Replacement'].map(m => (
                                    <button key={m} onClick={() => setReturnMethod(m)}
                                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border-2 ${returnMethod === m ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}>
                                        {m === 'Cash Refund' ? '💵' : m === 'M-Pesa Refund' ? '📱' : m === 'Store Credit' ? '🏪' : m === 'Card Refund' ? '💳' : '🔄'} {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Final Summary */}
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                            <h3 className="font-bold text-red-800 mb-3">📋 Return Summary</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-600">Original Receipt</span><strong>{sale.receipt_no}</strong></div>
                                <div className="flex justify-between"><span className="text-gray-600">Customer</span><strong>{sale.customer_name}</strong></div>
                                <div className="flex justify-between"><span className="text-gray-600">Items Returning</span><strong>{selectedItems.length} item(s)</strong></div>
                                <div className="flex justify-between"><span className="text-gray-600">Refund Method</span><strong>{returnMethod}</strong></div>
                                <div className="flex justify-between text-base pt-2 border-t"><span className="font-bold text-red-700">Total Refund</span><strong className="text-red-700 text-xl">{fmt(refundTotal)}</strong></div>
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button onClick={() => setStep('select')} className="px-6 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                                ← Back
                            </button>
                            <button onClick={processReturn} disabled={isProcessing}
                                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50">
                                {isProcessing ? '⏳ Processing...' : '✅ Process Return & Refund'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── STEP 4: DONE ── */}
            {step === 'done' && completedReturn && (
                <div className="bg-white rounded-2xl border p-12 text-center space-y-6">
                    <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                        <span className="text-5xl">✅</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800">Return Processed!</h2>
                        <p className="text-gray-500 mt-1">The sales return has been recorded successfully</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 max-w-sm mx-auto">
                        <p className="text-sm text-gray-500">Return Reference</p>
                        <p className="text-xl font-black text-emerald-700 font-mono">{completedReturn.refNo}</p>
                        <p className="text-sm text-gray-500 mt-3">Refund Amount</p>
                        <p className="text-3xl font-black text-emerald-700">{fmt(completedReturn.amount)}</p>
                        <p className="text-xs text-gray-500 mt-2">via {returnMethod}</p>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <button onClick={reset}
                            className="px-6 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">
                            ↩️ New Return
                        </button>
                        <button onClick={() => window.print()}
                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:shadow-lg">
                            🖨️ Print Receipt
                        </button>
                    </div>
                </div>
            )}

            {/* Recent Returns List */}
            {showRecent && (
                <div className="bg-white rounded-2xl border overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-500 to-red-600 px-5 py-4 text-white flex items-center justify-between">
                        <h3 className="font-bold">📋 Recent Sales Returns</h3>
                        <button onClick={() => setShowRecent(false)} className="text-white opacity-70 hover:opacity-100">✕</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Return Ref</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Original Receipt</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Customer</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Reason</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-500">Amount</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentReturns.length === 0 ? (
                                    <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">No returns found</td></tr>
                                ) : recentReturns.map((r, i) => (
                                    <tr key={r.return_id || i} className="border-t border-gray-100 hover:bg-orange-50/30">
                                        <td className="px-4 py-3 font-mono text-xs text-orange-600 font-bold">{r.return_ref}</td>
                                        <td className="px-4 py-3 text-sm font-semibold">{r.original_receipt_no}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{r.customer_name}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{r.return_reason}</td>
                                        <td className="px-4 py-3 text-right font-black text-red-700">{fmt(r.refund_amount)}</td>
                                        <td className="px-4 py-3 text-xs text-gray-400">{r.return_date}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
