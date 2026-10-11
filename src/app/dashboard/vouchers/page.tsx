'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Voucher {
    voucher_id: number;
    voucher_code: string;
    voucher_name: string;
    voucher_type: 'Percentage' | 'Fixed';
    discount_value: number;
    min_order_amount: number;
    max_uses: number;
    used_count: number;
    valid_from: string;
    valid_until: string;
    active: boolean;
    created_by: string;
    created_at: string;
}

const emptyForm = {
    voucher_code: '',
    voucher_name: '',
    voucher_type: 'Percentage' as 'Percentage' | 'Fixed',
    discount_value: '',
    min_order_amount: '',
    max_uses: '',
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    active: true,
};

function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export default function VouchersPage() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editVoucher, setEditVoucher] = useState<Voucher | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
    const [verifyCode, setVerifyCode] = useState('');
    const [verifyResult, setVerifyResult] = useState<{ valid: boolean; voucher?: Voucher; msg: string } | null>(null);

    const loadVouchers = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('vouchers')
                .select('*')
                .order('created_at', { ascending: false });
            if (error && error.code !== '42P01') throw error;
            setVouchers((data || []) as Voucher[]);
        } catch (err: any) {
            console.error(err);
            setVouchers([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadVouchers(); }, [loadVouchers]);

    const openAdd = () => {
        setEditVoucher(null);
        setFormData({ ...emptyForm, voucher_code: generateCode() });
        setShowModal(true);
    };

    const openEdit = (v: Voucher) => {
        setEditVoucher(v);
        setFormData({
            voucher_code: v.voucher_code,
            voucher_name: v.voucher_name,
            voucher_type: v.voucher_type,
            discount_value: String(v.discount_value),
            min_order_amount: String(v.min_order_amount || ''),
            max_uses: String(v.max_uses || ''),
            valid_from: v.valid_from,
            valid_until: v.valid_until,
            active: v.active,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.voucher_code.trim()) { toast.error('Voucher code required'); return; }
        if (!formData.voucher_name.trim()) { toast.error('Voucher name required'); return; }
        const discVal = parseFloat(formData.discount_value);
        if (isNaN(discVal) || discVal <= 0) { toast.error('Enter a valid discount value'); return; }
        if (formData.voucher_type === 'Percentage' && discVal > 100) { toast.error('Percentage cannot exceed 100%'); return; }

        setIsSaving(true);
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const payload = {
            voucher_code: formData.voucher_code.trim().toUpperCase(),
            voucher_name: formData.voucher_name.trim(),
            voucher_type: formData.voucher_type,
            discount_value: discVal,
            min_order_amount: parseFloat(formData.min_order_amount) || 0,
            max_uses: parseInt(formData.max_uses) || 999999,
            valid_from: formData.valid_from,
            valid_until: formData.valid_until,
            active: formData.active,
            created_by: userData?.name || 'Admin',
        };

        try {
            if (editVoucher) {
                const { error } = await supabase.from('vouchers').update(payload).eq('voucher_id', editVoucher.voucher_id);
                if (error) throw error;
                toast.success('Voucher updated!');
            } else {
                const { error } = await supabase.from('vouchers').insert(payload);
                if (error) throw error;
                toast.success('Voucher created!');
            }
            setShowModal(false);
            loadVouchers();
        } catch (err: any) {
            toast.error('Failed: ' + err.message);
        }
        setIsSaving(false);
    };

    const toggleActive = async (v: Voucher) => {
        await supabase.from('vouchers').update({ active: !v.active }).eq('voucher_id', v.voucher_id);
        toast.success(v.active ? 'Voucher deactivated' : 'Voucher activated');
        loadVouchers();
    };

    const deleteVoucher = async (v: Voucher) => {
        if (!confirm(`Delete voucher "${v.voucher_code}"?`)) return;
        await supabase.from('vouchers').delete().eq('voucher_id', v.voucher_id);
        toast.success('Voucher deleted');
        loadVouchers();
    };

    const verifyVoucher = () => {
        const code = verifyCode.trim().toUpperCase();
        const v = vouchers.find(x => x.voucher_code === code);
        if (!v) { setVerifyResult({ valid: false, msg: '❌ Voucher not found' }); return; }
        const now = new Date();
        const from = new Date(v.valid_from);
        const until = new Date(v.valid_until);
        if (!v.active) { setVerifyResult({ valid: false, voucher: v, msg: '⛔ Voucher is inactive' }); return; }
        if (now < from) { setVerifyResult({ valid: false, voucher: v, msg: '⏳ Voucher not yet valid' }); return; }
        if (now > until) { setVerifyResult({ valid: false, voucher: v, msg: '⌛ Voucher has expired' }); return; }
        if (v.used_count >= v.max_uses) { setVerifyResult({ valid: false, voucher: v, msg: '🚫 Usage limit reached' }); return; }
        setVerifyResult({ valid: true, voucher: v, msg: `✅ Valid! ${v.voucher_type === 'Percentage' ? v.discount_value + '% off' : 'Ksh ' + v.discount_value + ' off'}` });
    };

    const today = new Date().toISOString().split('T')[0];
    const isExpired = (v: Voucher) => v.valid_until < today;
    const isNotStarted = (v: Voucher) => v.valid_from > today;

    const voucherStatus = (v: Voucher) => {
        if (!v.active) return { label: 'Inactive', cls: 'bg-gray-100 text-gray-500' };
        if (isExpired(v)) return { label: 'Expired', cls: 'bg-red-100 text-red-700' };
        if (isNotStarted(v)) return { label: 'Upcoming', cls: 'bg-blue-100 text-blue-700' };
        if (v.used_count >= v.max_uses) return { label: 'Used Up', cls: 'bg-orange-100 text-orange-700' };
        return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' };
    };

    const filtered = vouchers.filter(v => {
        const matchSearch = !search || v.voucher_code.includes(search.toUpperCase()) || v.voucher_name.toLowerCase().includes(search.toLowerCase());
        const st = voucherStatus(v).label;
        const matchStatus = filterStatus === 'all'
            || (filterStatus === 'active' && st === 'Active')
            || (filterStatus === 'expired' && st === 'Expired')
            || (filterStatus === 'inactive' && st === 'Inactive');
        return matchSearch && matchStatus;
    });

    const activeCount = vouchers.filter(v => voucherStatus(v).label === 'Active').length;
    const expiredCount = vouchers.filter(v => isExpired(v)).length;
    const totalUsed = vouchers.reduce((s, v) => s + (v.used_count || 0), 0);
    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        🎁
                    </span>
                    Vouchers & Promotions
                </h1>
                <button onClick={openAdd}
                    className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">
                    ➕ Create Voucher
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🎁</span>
                    <p className="text-sm opacity-80 mt-2">Total Vouchers</p>
                    <p className="text-3xl font-bold">{vouchers.length}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm opacity-80 mt-2">Active Now</p>
                    <p className="text-3xl font-bold">{activeCount}</p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-rose-700 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">⌛</span>
                    <p className="text-sm opacity-80 mt-2">Expired</p>
                    <p className="text-3xl font-bold">{expiredCount}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">📊</span>
                    <p className="text-sm opacity-80 mt-2">Total Redemptions</p>
                    <p className="text-3xl font-bold">{totalUsed}</p>
                </div>
            </div>

            {/* Voucher Verifier */}
            <div className="bg-white rounded-2xl border p-5">
                <h3 className="font-bold text-gray-800 mb-3">🔍 Quick Voucher Verifier</h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={verifyCode}
                        onChange={e => { setVerifyCode(e.target.value.toUpperCase()); setVerifyResult(null); }}
                        placeholder="Enter voucher code..."
                        className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:border-pink-500 outline-none tracking-widest"
                    />
                    <button onClick={verifyVoucher}
                        className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-md transition-all">
                        ✅ Verify
                    </button>
                </div>
                {verifyResult && (
                    <div className={`mt-3 p-4 rounded-xl text-sm font-semibold ${verifyResult.valid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        <p className="text-lg font-black mb-1">{verifyResult.msg}</p>
                        {verifyResult.voucher && (
                            <div className="text-xs space-y-0.5 opacity-80 mt-2">
                                <p>Code: <strong>{verifyResult.voucher.voucher_code}</strong> | Name: {verifyResult.voucher.voucher_name}</p>
                                <p>Valid: {verifyResult.voucher.valid_from} → {verifyResult.voucher.valid_until} | Used: {verifyResult.voucher.used_count}/{verifyResult.voucher.max_uses} times</p>
                                {verifyResult.voucher.min_order_amount > 0 && <p>Min order: {fmt(verifyResult.voucher.min_order_amount)}</p>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-center">
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="🔍 Search code or name..."
                    className="flex-1 min-w-[200px] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none" />
                <div className="flex gap-2">
                    {(['all', 'active', 'expired', 'inactive'] as const).map(f => (
                        <button key={f} onClick={() => setFilterStatus(f)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${filterStatus === f ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-gray-400 ml-auto">{filtered.length} vouchers</span>
            </div>

            {/* Vouchers Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading vouchers...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border py-20 text-center">
                    <div className="text-6xl mb-4">🎁</div>
                    <p className="text-xl font-bold text-gray-400">No vouchers found</p>
                    <button onClick={openAdd} className="mt-4 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg text-sm">
                        ➕ Create First Voucher
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(v => {
                        const st = voucherStatus(v);
                        const usagePercent = v.max_uses > 0 ? Math.min(100, (v.used_count / v.max_uses) * 100) : 0;
                        return (
                            <div key={v.voucher_id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all ${!v.active || isExpired(v) ? 'opacity-60' : ''}`}>
                                {/* Ticket Header */}
                                <div className="bg-gradient-to-r from-pink-500 to-rose-600 px-5 py-4 text-white">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-2xl font-black font-mono tracking-widest">{v.voucher_code}</p>
                                            <p className="text-sm opacity-80 mt-0.5">{v.voucher_name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black">
                                                {v.voucher_type === 'Percentage' ? `${v.discount_value}%` : `Ksh ${v.discount_value}`}
                                            </p>
                                            <p className="text-xs opacity-70">{v.voucher_type} Off</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Ticket Tear Line */}
                                <div className="relative flex items-center px-5 -my-2 z-10">
                                    <div className="absolute -left-3 w-5 h-5 rounded-full bg-gray-100 border border-gray-200" />
                                    <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-3" />
                                    <div className="absolute -right-3 w-5 h-5 rounded-full bg-gray-100 border border-gray-200" />
                                </div>

                                {/* Ticket Body */}
                                <div className="px-5 pt-4 pb-3 space-y-2 bg-white">
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>Valid: {v.valid_from}</span>
                                        <span>→ {v.valid_until}</span>
                                    </div>
                                    {v.min_order_amount > 0 && (
                                        <p className="text-xs text-gray-400">Min. order: {fmt(v.min_order_amount)}</p>
                                    )}
                                    {/* Usage Progress */}
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                            <span>Used: {v.used_count}/{v.max_uses === 999999 ? '∞' : v.max_uses}</span>
                                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${st.cls}`}>{st.label}</span>
                                        </div>
                                        {v.max_uses !== 999999 && (
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-pink-500 to-rose-600 rounded-full transition-all"
                                                    style={{ width: `${usagePercent}%` }} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="px-5 pb-4 flex gap-2">
                                    <button onClick={() => openEdit(v)}
                                        className="flex-1 py-2 bg-pink-50 text-pink-700 rounded-xl text-xs font-bold hover:bg-pink-100 transition-all">
                                        ✏️ Edit
                                    </button>
                                    <button onClick={() => toggleActive(v)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${v.active ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                        {v.active ? '⛔ Disable' : '✅ Enable'}
                                    </button>
                                    <button onClick={() => deleteVoucher(v)}
                                        className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="bg-gradient-to-r from-pink-500 to-rose-600 px-6 py-5 text-white flex-shrink-0">
                            <h2 className="text-lg font-bold">{editVoucher ? '✏️ Edit Voucher' : '🎁 Create Voucher'}</h2>
                            <p className="text-pink-200 text-sm mt-0.5">Set discount rules and validity</p>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Voucher Code <span className="text-red-500">*</span></label>
                                    <div className="flex gap-2">
                                        <input type="text" value={formData.voucher_code} onChange={e => setFormData(p => ({ ...p, voucher_code: e.target.value.toUpperCase() }))}
                                            className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono uppercase tracking-widest focus:border-pink-500 outline-none" />
                                        <button onClick={() => setFormData(p => ({ ...p, voucher_code: generateCode() }))}
                                            className="px-2 py-2 bg-pink-50 text-pink-600 rounded-xl text-xs font-bold hover:bg-pink-100" title="Generate random code">
                                            🎲
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Type <span className="text-red-500">*</span></label>
                                    <select value={formData.voucher_type} onChange={e => setFormData(p => ({ ...p, voucher_type: e.target.value as any }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none">
                                        <option value="Percentage">% Percentage Off</option>
                                        <option value="Fixed">Ksh Fixed Amount Off</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Voucher Name / Description <span className="text-red-500">*</span></label>
                                    <input type="text" value={formData.voucher_name} onChange={e => setFormData(p => ({ ...p, voucher_name: e.target.value }))}
                                        placeholder="e.g. 20% Weekend Offer, Happy Hour Deal..." className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                        {formData.voucher_type === 'Percentage' ? 'Discount %' : 'Discount Amount (Ksh)'} <span className="text-red-500">*</span>
                                    </label>
                                    <input type="number" value={formData.discount_value} onChange={e => setFormData(p => ({ ...p, discount_value: e.target.value }))}
                                        placeholder={formData.voucher_type === 'Percentage' ? '0-100' : '0.00'} min="0"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-lg focus:border-pink-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Min. Order Amount (Ksh)</label>
                                    <input type="number" value={formData.min_order_amount} onChange={e => setFormData(p => ({ ...p, min_order_amount: e.target.value }))}
                                        placeholder="0 = no minimum" min="0"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Max Uses (blank = unlimited)</label>
                                    <input type="number" value={formData.max_uses} onChange={e => setFormData(p => ({ ...p, max_uses: e.target.value }))}
                                        placeholder="e.g. 100" min="1"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none" />
                                </div>
                                <div className="flex items-center">
                                    <label className="flex items-center gap-2 cursor-pointer mt-4">
                                        <input type="checkbox" checked={formData.active} onChange={e => setFormData(p => ({ ...p, active: e.target.checked }))}
                                            className="w-4 h-4 accent-pink-600" />
                                        <span className="text-sm font-semibold text-gray-700">Active Voucher</span>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Valid From <span className="text-red-500">*</span></label>
                                    <input type="date" value={formData.valid_from} onChange={e => setFormData(p => ({ ...p, valid_from: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Valid Until <span className="text-red-500">*</span></label>
                                    <input type="date" value={formData.valid_until} onChange={e => setFormData(p => ({ ...p, valid_until: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-pink-500 outline-none" />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowModal(false)} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">Cancel</button>
                                <button onClick={handleSave} disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : editVoucher ? '✅ Update' : '🎁 Create Voucher'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
