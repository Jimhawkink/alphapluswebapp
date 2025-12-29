'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface SalesReturn {
    return_id: number;
    return_no: string;
    return_date: string;
    original_sale_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    reason: string;
    status: string;
    processed_by: string;
}

export default function SalesReturnPage() {
    const [returns, setReturns] = useState<SalesReturn[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({ original_sale_id: '', product_name: '', quantity: 1, unit_price: 0, reason: '' });

    const loadReturns = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('sales_returns').select('*').order('return_id', { ascending: false });
        setReturns(data || []);
        setIsLoading(false);
    };

    useEffect(() => { loadReturns(); }, []);

    const generateReturnNo = async () => {
        const { data } = await supabase.from('sales_returns').select('return_no').order('return_id', { ascending: false }).limit(1);
        if (data && data.length > 0) {
            const match = data[0].return_no.match(/SR-(\d+)/);
            if (match) return `SR-${String(parseInt(match[1]) + 1).padStart(4, '0')}`;
        }
        return 'SR-0001';
    };

    const handleSave = async () => {
        if (!formData.product_name || formData.quantity <= 0) { toast.error('Fill required fields'); return; }
        setIsSaving(true);
        const returnNo = await generateReturnNo();
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;
        const { error } = await supabase.from('sales_returns').insert({
            return_no: returnNo,
            return_date: new Date().toISOString().split('T')[0],
            original_sale_id: formData.original_sale_id,
            product_name: formData.product_name,
            quantity: formData.quantity,
            unit_price: formData.unit_price,
            total_amount: formData.quantity * formData.unit_price,
            reason: formData.reason,
            status: 'Completed',
            processed_by: user?.name || 'Admin'
        });
        if (error) toast.error('Failed'); else { toast.success('Return processed!'); setShowModal(false); loadReturns(); }
        setIsSaving(false);
    };

    const totalReturns = returns.reduce((sum, r) => sum + (r.total_amount || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center text-white text-2xl">↩️</span>
                    Sales Returns
                </h1>
                <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold">➕ New Return</button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-5 text-white"><span className="text-3xl">↩️</span><p className="text-sm opacity-80 mt-2">Total Returns</p><p className="text-3xl font-bold">{returns.length}</p></div>
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white"><span className="text-3xl">💰</span><p className="text-sm opacity-80 mt-2">Return Value</p><p className="text-3xl font-bold">Ksh {totalReturns.toLocaleString()}</p></div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white"><span className="text-3xl">✅</span><p className="text-sm opacity-80 mt-2">Completed</p><p className="text-3xl font-bold">{returns.filter(r => r.status === 'Completed').length}</p></div>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-orange-50 to-red-50">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-xs">Return #</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Date</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Original Sale</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Product</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Qty</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Amount</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Reason</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? <tr><td colSpan={8} className="py-16 text-center">Loading...</td></tr> :
                            returns.length === 0 ? <tr><td colSpan={8} className="py-16 text-center text-gray-500">No returns</td></tr> :
                                returns.map(r => (
                                    <tr key={r.return_id} className="border-t hover:bg-orange-50/30">
                                        <td className="py-3 px-4"><span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg font-semibold">{r.return_no}</span></td>
                                        <td className="py-3 px-4">{new Date(r.return_date).toLocaleDateString()}</td>
                                        <td className="py-3 px-4 text-gray-600">{r.original_sale_id || '-'}</td>
                                        <td className="py-3 px-4 font-medium">{r.product_name}</td>
                                        <td className="py-3 px-4 text-center">{r.quantity}</td>
                                        <td className="py-3 px-4 text-right font-bold text-red-600">Ksh {r.total_amount?.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-sm text-gray-600">{r.reason}</td>
                                        <td className="py-3 px-4 text-center"><span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">{r.status}</span></td>
                                    </tr>
                                ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">↩️ New Sales Return</h2>
                        <div className="space-y-4">
                            <div><label className="text-sm text-gray-600">Original Sale ID</label><input value={formData.original_sale_id} onChange={e => setFormData({ ...formData, original_sale_id: e.target.value })} className="w-full p-3 border rounded-xl" placeholder="e.g. INV-0001" /></div>
                            <div><label className="text-sm text-gray-600">Product Name *</label><input value={formData.product_name} onChange={e => setFormData({ ...formData, product_name: e.target.value })} className="w-full p-3 border rounded-xl" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-sm text-gray-600">Quantity *</label><input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                                <div><label className="text-sm text-gray-600">Unit Price</label><input type="number" value={formData.unit_price} onChange={e => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                            </div>
                            <div><label className="text-sm text-gray-600">Reason</label><select value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} className="w-full p-3 border rounded-xl"><option>Wrong Order</option><option>Quality Issue</option><option>Overcharge</option><option>Customer Request</option><option>Other</option></select></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold">{isSaving ? 'Processing...' : '✅ Process Return'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
