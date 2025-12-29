'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Batch {
    batch_id: number;
    batch_number: string;
    product_id: number;
    product_name: string;
    production_date: string;
    qty_produced: number;
    qty_remaining: number;
    cost_per_unit: number;
    sales_rate: number;
    expiry_date: string;
    status: string;
    created_by: string;
}

interface Product {
    pid: number;
    product_name: string;
    sales_cost: number;
}

export default function BatchesPage() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({ product_id: 0, qty_produced: 0, cost_per_unit: 0, expiry_days: 3 });

    const loadData = async () => {
        setIsLoading(true);
        const { data: batchData } = await supabase.from('production_batches').select('*').order('batch_id', { ascending: false });
        setBatches(batchData || []);
        const { data: prodData } = await supabase.from('products').select('pid, product_name, sales_cost').eq('active', true);
        setProducts(prodData || []);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const generateBatchNo = () => {
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `BATCH-${date}-${rand}`;
    };

    const handleSave = async () => {
        if (!formData.product_id || formData.qty_produced <= 0) { toast.error('Select product and quantity'); return; }
        setIsSaving(true);
        const product = products.find(p => p.pid === formData.product_id);
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;
        const expiryDate = new Date(Date.now() + formData.expiry_days * 86400000).toISOString().split('T')[0];

        const { error } = await supabase.from('production_batches').insert({
            batch_number: generateBatchNo(),
            product_id: formData.product_id,
            product_name: product?.product_name || '',
            production_date: new Date().toISOString().split('T')[0],
            qty_produced: formData.qty_produced,
            qty_remaining: formData.qty_produced,
            cost_per_unit: formData.cost_per_unit,
            sales_rate: product?.sales_cost || 0,
            expiry_date: expiryDate,
            status: 'Active',
            created_by: user?.name || 'Admin'
        });
        if (error) toast.error('Failed'); else { toast.success('Batch created!'); setShowModal(false); loadData(); }
        setIsSaving(false);
    };

    const totalProduced = batches.reduce((sum, b) => sum + (b.qty_produced || 0), 0);
    const totalRemaining = batches.reduce((sum, b) => sum + (b.qty_remaining || 0), 0);
    const totalValue = batches.reduce((sum, b) => sum + ((b.qty_remaining || 0) * (b.sales_rate || 0)), 0);

    const getDaysOld = (date: string) => Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    const getRowColor = (daysOld: number) => {
        if (daysOld === 0) return 'bg-green-50';
        if (daysOld === 1) return 'bg-yellow-50';
        if (daysOld === 2) return 'bg-orange-50';
        return 'bg-red-50';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl">📦</span>
                    Production Batches
                </h1>
                <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold">➕ New Batch</button>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white"><span className="text-3xl">📦</span><p className="text-sm opacity-80 mt-2">Total Batches</p><p className="text-3xl font-bold">{batches.length}</p></div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white"><span className="text-3xl">🍳</span><p className="text-sm opacity-80 mt-2">Total Produced</p><p className="text-3xl font-bold">{totalProduced}</p></div>
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-5 text-white"><span className="text-3xl">📊</span><p className="text-sm opacity-80 mt-2">Remaining</p><p className="text-3xl font-bold">{totalRemaining}</p></div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white"><span className="text-3xl">💰</span><p className="text-sm opacity-80 mt-2">Stock Value</p><p className="text-2xl font-bold">Ksh {totalValue.toLocaleString()}</p></div>
            </div>

            <div className="bg-white p-4 rounded-xl border flex gap-4 items-center">
                <span className="font-semibold">Color Legend:</span>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs">🟢 Today</span>
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">🟡 1 Day Old</span>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">🟠 2 Days Old</span>
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs">🔴 3+ Days Old</span>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-indigo-50 to-purple-50">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-xs">Batch #</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Product</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Date</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Days Old</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Produced</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Remaining</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Cost/Unit</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Value</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? <tr><td colSpan={9} className="py-16 text-center">Loading...</td></tr> :
                            batches.length === 0 ? <tr><td colSpan={9} className="py-16 text-center text-gray-500">No batches. Create your first batch!</td></tr> :
                                batches.map(b => {
                                    const daysOld = getDaysOld(b.production_date);
                                    return (
                                        <tr key={b.batch_id} className={`border-t ${getRowColor(daysOld)}`}>
                                            <td className="py-3 px-4"><span className="font-mono text-sm">{b.batch_number}</span></td>
                                            <td className="py-3 px-4 font-semibold">{b.product_name}</td>
                                            <td className="py-3 px-4 text-center">{new Date(b.production_date).toLocaleDateString()}</td>
                                            <td className="py-3 px-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${daysOld === 0 ? 'bg-green-200 text-green-800' : daysOld === 1 ? 'bg-yellow-200 text-yellow-800' : daysOld === 2 ? 'bg-orange-200 text-orange-800' : 'bg-red-200 text-red-800'}`}>{daysOld} day{daysOld !== 1 ? 's' : ''}</span></td>
                                            <td className="py-3 px-4 text-center font-bold">{b.qty_produced}</td>
                                            <td className="py-3 px-4 text-center"><span className={`px-3 py-1 rounded-lg font-bold ${b.qty_remaining > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{b.qty_remaining}</span></td>
                                            <td className="py-3 px-4 text-right">Ksh {b.cost_per_unit?.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right font-bold text-purple-600">Ksh {(b.qty_remaining * b.sales_rate).toLocaleString()}</td>
                                            <td className="py-3 px-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${b.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{b.status}</span></td>
                                        </tr>
                                    );
                                })}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">📦 New Production Batch</h2>
                        <div className="space-y-4">
                            <div><label className="text-sm text-gray-600">Product *</label><select value={formData.product_id} onChange={e => { const pid = parseInt(e.target.value); const prod = products.find(p => p.pid === pid); setFormData({ ...formData, product_id: pid, cost_per_unit: prod?.sales_cost || 0 }); }} className="w-full p-3 border rounded-xl"><option value={0}>Select Product</option>{products.map(p => <option key={p.pid} value={p.pid}>{p.product_name}</option>)}</select></div>
                            <div><label className="text-sm text-gray-600">Quantity Produced *</label><input type="number" value={formData.qty_produced} onChange={e => setFormData({ ...formData, qty_produced: parseInt(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                            <div><label className="text-sm text-gray-600">Cost Per Unit</label><input type="number" value={formData.cost_per_unit} onChange={e => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                            <div><label className="text-sm text-gray-600">Expiry Days</label><input type="number" value={formData.expiry_days} onChange={e => setFormData({ ...formData, expiry_days: parseInt(e.target.value) || 3 })} className="w-full p-3 border rounded-xl" /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold">{isSaving ? 'Creating...' : '✅ Create Batch'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
