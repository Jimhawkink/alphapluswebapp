'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface MeatStock {
    stock_id: number;
    stock_code: string;
    meat_type_id: number;
    meat_type_name: string;
    purchase_date: string;
    initial_weight_kg: number;
    available_kg: number;
    sold_kg: number;
    loss_kg: number;
    cost_per_kg: number;
    selling_price: number;
    supplier_name: string;
    batch_no: string;
    status: string;
    days_old: number;
}

interface MeatType {
    meat_type_id: number;
    meat_type_name: string;
}

export default function MeatBatchesPage() {
    const [batches, setBatches] = useState<MeatStock[]>([]);
    const [meatTypes, setMeatTypes] = useState<MeatType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        meat_type_id: 0,
        purchase_date: new Date().toISOString().split('T')[0],
        initial_weight_kg: 0,
        cost_per_kg: 0,
        selling_price: 0,
        supplier_name: '',
        batch_no: ''
    });

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load stock/batches from meat_stock table
            const { data: stockData, error } = await supabase
                .from('meat_stock')
                .select('*, meat_types(meat_type_name)')
                .order('stock_id', { ascending: false });

            if (error) throw error;

            const today = new Date();
            setBatches((stockData || []).map(b => {
                const purchaseDate = new Date(b.purchase_date);
                const daysOld = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
                return {
                    stock_id: b.stock_id,
                    stock_code: b.stock_code || `STK-${b.stock_id}`,
                    meat_type_id: b.meat_type_id,
                    meat_type_name: (b as any).meat_types?.meat_type_name || 'Unknown',
                    purchase_date: b.purchase_date,
                    initial_weight_kg: b.initial_weight_kg || 0,
                    available_kg: b.available_kg || 0,
                    sold_kg: b.sold_kg || 0,
                    loss_kg: b.loss_kg || 0,
                    cost_per_kg: b.cost_per_kg || 0,
                    selling_price: b.selling_price || 0,
                    supplier_name: b.supplier_name || '',
                    batch_no: b.batch_no || '',
                    status: b.status || 'Available',
                    days_old: daysOld
                };
            }));

            // Load meat types
            const { data: types, error: typesError } = await supabase
                .from('meat_types')
                .select('meat_type_id, meat_type_name')
                .eq('is_active', true)
                .order('meat_type_name');

            if (typesError) {
                console.error('Error loading meat types:', typesError);
                toast.error('Failed to load meat types - check RLS policies');
            }
            console.log('Loaded meat types:', types);
            setMeatTypes(types || []);

        } catch (err: any) {
            console.error('Error loading batches:', err);
            toast.error(err.message || 'Failed to load batches');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const generateStockCode = () => {
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `STK-${date}-${rand}`;
    };

    const openModal = (batch?: MeatStock) => {
        if (batch) {
            setEditingId(batch.stock_id);
            setFormData({
                meat_type_id: batch.meat_type_id,
                purchase_date: batch.purchase_date,
                initial_weight_kg: batch.initial_weight_kg,
                cost_per_kg: batch.cost_per_kg,
                selling_price: batch.selling_price,
                supplier_name: batch.supplier_name,
                batch_no: batch.batch_no
            });
        } else {
            setEditingId(null);
            setFormData({
                meat_type_id: meatTypes[0]?.meat_type_id || 0,
                purchase_date: new Date().toISOString().split('T')[0],
                initial_weight_kg: 0,
                cost_per_kg: 0,
                selling_price: 0,
                supplier_name: '',
                batch_no: ''
            });
        }
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.meat_type_id) {
            toast.error('Please select a meat type');
            return;
        }
        if (formData.initial_weight_kg <= 0 && !editingId) {
            toast.error('Please enter weight');
            return;
        }

        setIsSaving(true);
        try {
            if (editingId) {
                // Update existing stock
                const { error } = await supabase
                    .from('meat_stock')
                    .update({
                        meat_type_id: formData.meat_type_id,
                        purchase_date: formData.purchase_date,
                        cost_per_kg: formData.cost_per_kg,
                        selling_price: formData.selling_price,
                        supplier_name: formData.supplier_name,
                        batch_no: formData.batch_no
                    })
                    .eq('stock_id', editingId);

                if (error) throw error;
                toast.success('✅ Batch updated!');
            } else {
                // Create new stock entry
                const { error } = await supabase
                    .from('meat_stock')
                    .insert({
                        stock_code: generateStockCode(),
                        meat_type_id: formData.meat_type_id,
                        purchase_date: formData.purchase_date,
                        initial_weight_kg: formData.initial_weight_kg,
                        available_kg: formData.initial_weight_kg,
                        sold_kg: 0,
                        loss_kg: 0,
                        cost_per_kg: formData.cost_per_kg,
                        selling_price: formData.selling_price,
                        supplier_name: formData.supplier_name,
                        batch_no: formData.batch_no,
                        status: 'Available'
                    });

                if (error) throw error;
                toast.success('✅ New batch created!');
            }

            setShowModal(false);
            loadData();
        } catch (err: any) {
            console.error('Save error:', err);
            toast.error(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const totalValue = batches.reduce((sum, b) => sum + (b.available_kg * b.selling_price), 0);
    const totalWeight = batches.reduce((sum, b) => sum + b.available_kg, 0);
    const totalCost = batches.reduce((sum, b) => sum + (b.available_kg * b.cost_per_kg), 0);
    const activeBatches = batches.filter(b => b.available_kg > 0).length;

    const getRowColor = (daysOld: number) => {
        if (daysOld === 0) return 'bg-green-50';
        if (daysOld === 1) return 'bg-yellow-50';
        if (daysOld === 2) return 'bg-orange-50';
        return 'bg-red-50';
    };

    const getDaysColor = (daysOld: number) => {
        if (daysOld === 0) return 'bg-green-200 text-green-800';
        if (daysOld === 1) return 'bg-yellow-200 text-yellow-800';
        if (daysOld === 2) return 'bg-orange-200 text-orange-800';
        return 'bg-red-200 text-red-800';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 rounded-3xl p-5 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/butchery" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ←
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                📦 Meat Stock / Batches
                            </h1>
                            <p className="text-white/80 text-sm">Track inventory by batch (FIFO)</p>
                        </div>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="px-5 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-colors flex items-center gap-2"
                    >
                        ➕ New Batch
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-4 border border-purple-100 text-center">
                    <span className="text-2xl">📦</span>
                    <p className="text-xs text-purple-600 mt-1">Total Batches</p>
                    <p className="text-2xl font-bold text-purple-700">{batches.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100 text-center">
                    <span className="text-2xl">✅</span>
                    <p className="text-xs text-green-600 mt-1">Active</p>
                    <p className="text-2xl font-bold text-green-700">{activeBatches}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-100 text-center">
                    <span className="text-2xl">⚖️</span>
                    <p className="text-xs text-amber-600 mt-1">Total Weight</p>
                    <p className="text-2xl font-bold text-amber-700">{totalWeight.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100 text-center">
                    <span className="text-2xl">💰</span>
                    <p className="text-xs text-blue-600 mt-1">Stock Value</p>
                    <p className="text-lg font-bold text-blue-700">KES {totalValue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-100 text-center">
                    <span className="text-2xl">📈</span>
                    <p className="text-xs text-emerald-600 mt-1">Profit Potential</p>
                    <p className="text-lg font-bold text-emerald-700">KES {(totalValue - totalCost).toLocaleString()}</p>
                </div>
            </div>

            {/* Batches Table */}
            <div className="bg-white rounded-2xl border shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px]">
                        <thead className="bg-gradient-to-r from-purple-600 to-violet-700">
                            <tr>
                                <th className="text-left py-4 px-3 font-bold text-xs text-white">📦 CODE</th>
                                <th className="text-left py-4 px-3 font-bold text-xs text-white">🥩 MEAT TYPE</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">📅 DATE</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">⏰ DAYS</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">⚖️ INITIAL</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">📊 AVAILABLE</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">🛒 SOLD</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">💰 COST/KG</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">💵 SELL/KG</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">📈 VALUE</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">📍 STATUS</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">⚙️</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={12} className="py-16 text-center">
                                        <div className="flex items-center justify-center gap-3">
                                            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span>Loading batches...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : batches.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="py-16 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-5xl">📦</span>
                                            <p>No batches yet. Create your first batch!</p>
                                            <button
                                                onClick={() => openModal()}
                                                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                                            >
                                                ➕ Add First Batch
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                batches.map(batch => (
                                    <tr key={batch.stock_id} className={`border-t ${getRowColor(batch.days_old)} hover:bg-purple-50/50 transition-colors`}>
                                        <td className="py-3 px-3">
                                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{batch.stock_code}</span>
                                        </td>
                                        <td className="py-3 px-3 font-semibold text-gray-800 text-sm">{batch.meat_type_name}</td>
                                        <td className="py-3 px-3 text-center text-gray-600 text-sm">
                                            {new Date(batch.purchase_date).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getDaysColor(batch.days_old)}`}>
                                                {batch.days_old}d
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-center font-bold">{batch.initial_weight_kg.toFixed(1)}</td>
                                        <td className="py-3 px-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg font-bold text-sm ${batch.available_kg > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                {batch.available_kg.toFixed(1)} Kg
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-center text-sm text-orange-600 font-semibold">{batch.sold_kg.toFixed(1)} Kg</td>
                                        <td className="py-3 px-3 text-right text-sm text-gray-700">KES {batch.cost_per_kg.toLocaleString()}</td>
                                        <td className="py-3 px-3 text-right text-sm font-semibold text-blue-600">KES {batch.selling_price.toLocaleString()}</td>
                                        <td className="py-3 px-3 text-right font-bold text-purple-600 text-sm">
                                            KES {(batch.available_kg * batch.selling_price).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${batch.available_kg <= 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                }`}>
                                                {batch.available_kg <= 0 ? '❌ Sold Out' : '✅ Available'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            <button
                                                onClick={() => openModal(batch)}
                                                className="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg text-sm hover:bg-blue-200 transition-colors"
                                            >
                                                ✏️
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                            📦 {editingId ? 'Edit' : 'New'} Stock Batch
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">🥩 Meat Type *</label>
                                <select
                                    value={formData.meat_type_id}
                                    onChange={(e) => setFormData({ ...formData, meat_type_id: parseInt(e.target.value) })}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                >
                                    <option value={0}>Select meat type</option>
                                    {meatTypes.map(type => (
                                        <option key={type.meat_type_id} value={type.meat_type_id}>
                                            {type.meat_type_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">📅 Purchase Date</label>
                                <input
                                    type="date"
                                    value={formData.purchase_date}
                                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                />
                            </div>

                            {!editingId && (
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block">⚖️ Initial Weight (Kg) *</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.initial_weight_kg || ''}
                                        onChange={(e) => setFormData({ ...formData, initial_weight_kg: parseFloat(e.target.value) || 0 })}
                                        placeholder="e.g. 50"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block">💰 Cost per Kg</label>
                                    <input
                                        type="number"
                                        value={formData.cost_per_kg || ''}
                                        onChange={(e) => setFormData({ ...formData, cost_per_kg: parseFloat(e.target.value) || 0 })}
                                        placeholder="e.g. 400"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block">💵 Selling Price/Kg</label>
                                    <input
                                        type="number"
                                        value={formData.selling_price || ''}
                                        onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                                        placeholder="e.g. 550"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">🏪 Supplier</label>
                                <input
                                    type="text"
                                    value={formData.supplier_name}
                                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                    placeholder="Supplier name"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">🏷️ Batch Number (Optional)</label>
                                <input
                                    type="text"
                                    value={formData.batch_no}
                                    onChange={(e) => setFormData({ ...formData, batch_no: e.target.value })}
                                    placeholder="e.g. BTH-001"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 border border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
                            >
                                {isSaving ? 'Saving...' : editingId ? '✅ Update' : '✅ Create Batch'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
