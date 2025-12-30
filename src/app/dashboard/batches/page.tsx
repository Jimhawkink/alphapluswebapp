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
    const totalCost = batches.reduce((sum, b) => sum + ((b.qty_remaining || 0) * (b.cost_per_unit || 0)), 0);
    const totalProfit = totalValue - totalCost;

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
                <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">➕ New Batch</button>
            </div>

            {/* Light Gradient Stat Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 border border-indigo-100 shadow-sm">
                    <span className="text-3xl">📦</span>
                    <p className="text-sm text-indigo-600 mt-2">Total Batches</p>
                    <p className="text-3xl font-bold text-indigo-700">{batches.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100 shadow-sm">
                    <span className="text-3xl">🍳</span>
                    <p className="text-sm text-green-600 mt-2">Total Produced</p>
                    <p className="text-3xl font-bold text-green-700">{totalProduced}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-5 border border-cyan-100 shadow-sm">
                    <span className="text-3xl">📊</span>
                    <p className="text-sm text-cyan-600 mt-2">Remaining</p>
                    <p className="text-3xl font-bold text-cyan-700">{totalRemaining}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100 shadow-sm">
                    <span className="text-3xl">💰</span>
                    <p className="text-sm text-amber-600 mt-2">Stock Value</p>
                    <p className="text-2xl font-bold text-amber-700">Ksh {totalValue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
                    <span className="text-3xl">📈</span>
                    <p className="text-sm text-emerald-600 mt-2">Total Profit</p>
                    <p className="text-2xl font-bold text-emerald-700">Ksh {totalProfit.toLocaleString()}</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border flex gap-4 items-center">
                <span className="font-semibold">Color Legend:</span>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs">🟢 Today</span>
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">🟡 1 Day Old</span>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">🟠 2 Days Old</span>
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs">🔴 3+ Days Old</span>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden shadow-lg overflow-x-auto">
                <table className="w-full min-w-[1200px]">
                    <thead className="bg-gradient-to-r from-indigo-600 to-purple-700">
                        <tr>
                            <th className="text-left py-4 px-3 font-bold text-xs text-white">📦 BATCH #</th>
                            <th className="text-left py-4 px-3 font-bold text-xs text-white">🍽️ PRODUCT</th>
                            <th className="text-center py-4 px-3 font-bold text-xs text-white">📅 DATE</th>
                            <th className="text-center py-4 px-3 font-bold text-xs text-white">⏰ DAYS OLD</th>
                            <th className="text-center py-4 px-3 font-bold text-xs text-white">🔢 PRODUCED</th>
                            <th className="text-center py-4 px-3 font-bold text-xs text-white">📊 REMAINING</th>
                            <th className="text-right py-4 px-3 font-bold text-xs text-white">💰 COST/UNIT</th>
                            <th className="text-right py-4 px-3 font-bold text-xs text-white">💵 SELL PRICE</th>
                            <th className="text-right py-4 px-3 font-bold text-xs text-white">📈 PROFIT</th>
                            <th className="text-right py-4 px-3 font-bold text-xs text-white">🏷️ VALUE</th>
                            <th className="text-center py-4 px-3 font-bold text-xs text-white">📍 STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? <tr><td colSpan={11} className="py-16 text-center"><div className="flex items-center justify-center gap-3"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><span>Loading batches...</span></div></td></tr> :
                            batches.length === 0 ? <tr><td colSpan={11} className="py-16 text-center text-gray-500">📦 No batches found. Create your first batch!</td></tr> :
                                batches.map(b => {
                                    const daysOld = getDaysOld(b.production_date);
                                    const isOutOfStock = (b.qty_remaining || 0) <= 0;
                                    const profitPerUnit = (b.sales_rate || 0) - (b.cost_per_unit || 0);
                                    const totalProfit = profitPerUnit * (b.qty_remaining || 0);
                                    const totalValue = (b.qty_remaining || 0) * (b.sales_rate || 0);
                                    return (
                                        <tr key={b.batch_id} className={`border-t ${getRowColor(daysOld)} hover:bg-indigo-50/50 transition-colors`}>
                                            <td className="py-3 px-3"><span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{b.batch_number}</span></td>
                                            <td className="py-3 px-3 font-semibold text-gray-800 text-sm">{b.product_name}</td>
                                            <td className="py-3 px-3 text-center text-gray-600 text-sm">{new Date(b.production_date).toLocaleDateString()}</td>
                                            <td className="py-3 px-3 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${daysOld === 0 ? 'bg-green-200 text-green-800' : daysOld === 1 ? 'bg-yellow-200 text-yellow-800' : daysOld === 2 ? 'bg-orange-200 text-orange-800' : 'bg-red-200 text-red-800'}`}>{daysOld}d</span></td>
                                            <td className="py-3 px-3 text-center font-bold">{b.qty_produced}</td>
                                            <td className="py-3 px-3 text-center"><span className={`px-2 py-1 rounded-lg font-bold text-sm ${b.qty_remaining > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{b.qty_remaining}</span></td>
                                            <td className="py-3 px-3 text-right text-sm text-gray-700">Ksh {(b.cost_per_unit || 0).toLocaleString()}</td>
                                            <td className="py-3 px-3 text-right text-sm font-semibold text-blue-600">Ksh {(b.sales_rate || 0).toLocaleString()}</td>
                                            <td className="py-3 px-3 text-right"><span className={`font-bold text-sm ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Ksh {totalProfit.toLocaleString()}</span></td>
                                            <td className="py-3 px-3 text-right font-bold text-purple-600 text-sm">Ksh {totalValue.toLocaleString()}</td>
                                            <td className="py-3 px-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${isOutOfStock ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {isOutOfStock ? '❌ Out' : '✅ In Stock'}
                                                </span>
                                            </td>
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
