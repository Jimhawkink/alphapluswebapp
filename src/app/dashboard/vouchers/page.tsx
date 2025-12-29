'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Voucher {
    voucher_id: number;
    voucher_no: string;
    voucher_date: string;
    voucher_type: string;
    payee_name: string;
    description: string;
    amount: number;
    payment_mode: string;
    reference_no: string;
    approved_by: string;
    status: string;
}

export default function VouchersPage() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({ voucher_type: 'Payment', payee_name: '', description: '', amount: 0, payment_mode: 'Cash', reference_no: '' });

    const loadVouchers = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('vouchers').select('*').order('voucher_id', { ascending: false });
        setVouchers(data || []);
        setIsLoading(false);
    };

    useEffect(() => { loadVouchers(); }, []);

    const generateVoucherNo = async () => {
        const { data } = await supabase.from('vouchers').select('voucher_no').order('voucher_id', { ascending: false }).limit(1);
        if (data && data.length > 0) {
            const match = data[0].voucher_no.match(/VCH-(\d+)/);
            if (match) return `VCH-${String(parseInt(match[1]) + 1).padStart(4, '0')}`;
        }
        return 'VCH-0001';
    };

    const handleSave = async () => {
        if (!formData.payee_name || formData.amount <= 0) { toast.error('Fill required fields'); return; }
        setIsSaving(true);
        const voucherNo = await generateVoucherNo();
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;
        const { error } = await supabase.from('vouchers').insert({
            voucher_no: voucherNo,
            voucher_date: new Date().toISOString().split('T')[0],
            voucher_type: formData.voucher_type,
            payee_name: formData.payee_name,
            description: formData.description,
            amount: formData.amount,
            payment_mode: formData.payment_mode,
            reference_no: formData.reference_no,
            approved_by: user?.name || 'Admin',
            status: 'Approved'
        });
        if (error) toast.error('Failed'); else { toast.success('Voucher created!'); setShowModal(false); loadVouchers(); }
        setIsSaving(false);
    };

    const totalAmount = vouchers.reduce((sum, v) => sum + (v.amount || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl">🧾</span>
                    Vouchers
                </h1>
                <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold">➕ New Voucher</button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 text-white"><span className="text-3xl">🧾</span><p className="text-sm opacity-80 mt-2">Total Vouchers</p><p className="text-3xl font-bold">{vouchers.length}</p></div>
                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-5 text-white"><span className="text-3xl">💰</span><p className="text-sm opacity-80 mt-2">Total Amount</p><p className="text-3xl font-bold">Ksh {totalAmount.toLocaleString()}</p></div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white"><span className="text-3xl">✅</span><p className="text-sm opacity-80 mt-2">Approved</p><p className="text-3xl font-bold">{vouchers.filter(v => v.status === 'Approved').length}</p></div>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-violet-50 to-purple-50">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Voucher #</th>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Date</th>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Type</th>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Payee</th>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Description</th>
                            <th className="text-right py-4 px-4 font-bold text-xs text-gray-600">Amount</th>
                            <th className="text-center py-4 px-4 font-bold text-xs text-gray-600">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? <tr><td colSpan={7} className="py-16 text-center">Loading...</td></tr> :
                            vouchers.length === 0 ? <tr><td colSpan={7} className="py-16 text-center text-gray-500">No vouchers</td></tr> :
                                vouchers.map(v => (
                                    <tr key={v.voucher_id} className="border-t hover:bg-purple-50/30">
                                        <td className="py-3 px-4"><span className="px-3 py-1 bg-violet-100 text-violet-700 rounded-lg font-semibold">{v.voucher_no}</span></td>
                                        <td className="py-3 px-4">{new Date(v.voucher_date).toLocaleDateString()}</td>
                                        <td className="py-3 px-4"><span className="px-2 py-1 bg-gray-100 rounded text-xs">{v.voucher_type}</span></td>
                                        <td className="py-3 px-4 font-medium">{v.payee_name}</td>
                                        <td className="py-3 px-4 text-gray-600 text-sm">{v.description}</td>
                                        <td className="py-3 px-4 text-right font-bold text-purple-600">Ksh {v.amount?.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${v.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{v.status}</span></td>
                                    </tr>
                                ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">🧾 New Voucher</h2>
                        <div className="space-y-4">
                            <div><label className="text-sm text-gray-600">Type</label><select value={formData.voucher_type} onChange={e => setFormData({ ...formData, voucher_type: e.target.value })} className="w-full p-3 border rounded-xl"><option>Payment</option><option>Receipt</option><option>Journal</option></select></div>
                            <div><label className="text-sm text-gray-600">Payee Name *</label><input value={formData.payee_name} onChange={e => setFormData({ ...formData, payee_name: e.target.value })} className="w-full p-3 border rounded-xl" /></div>
                            <div><label className="text-sm text-gray-600">Description</label><input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-3 border rounded-xl" /></div>
                            <div><label className="text-sm text-gray-600">Amount (Ksh) *</label><input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                            <div><label className="text-sm text-gray-600">Payment Mode</label><select value={formData.payment_mode} onChange={e => setFormData({ ...formData, payment_mode: e.target.value })} className="w-full p-3 border rounded-xl"><option>Cash</option><option>M-Pesa</option><option>Bank</option></select></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold">{isSaving ? 'Saving...' : '✅ Save'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
