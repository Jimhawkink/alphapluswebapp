'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface MeatStock {
    stock_id: number;
    stock_code: string;
    meat_type_name: string;
    available_kg: number;
    days_old: number;
}

interface WeightLoss {
    loss_id: number;
    stock_id: number;
    stock_code: string;
    meat_type_name: string;
    loss_weight_kg: number;
    loss_type: string;
    reason: string;
    recorded_by: string;
    recorded_at: string;
}

export default function WeightLossPage() {
    const [lossRecords, setLossRecords] = useState<WeightLoss[]>([]);
    const [batches, setBatches] = useState<MeatStock[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        stock_id: 0,
        loss_weight_kg: 0,
        loss_type: 'Drying',
        reason: ''
    });

    const lossTypes = [
        { id: 'Drying', icon: '💨', label: 'Drying Loss', description: 'Water evaporation' },
        { id: 'Bone', icon: '🦴', label: 'Bone Weight', description: 'Bones removed' },
        { id: 'Trim', icon: '✂️', label: 'Trimming', description: 'Fat & trimmings' },
        { id: 'Spoilage', icon: '🗑️', label: 'Spoilage', description: 'Damaged/spoiled' },
        { id: 'Other', icon: '📋', label: 'Other', description: 'Other losses' },
    ];

    const loadData = async () => {
        setIsLoading(true);
        try {
            const today = new Date();

            // Load weight loss records from meat_weight_losses table
            const { data: losses, error } = await supabase
                .from('meat_weight_losses')
                .select('*, meat_stock(stock_code, meat_types(meat_type_name))')
                .order('recorded_at', { ascending: false });

            if (error) throw error;
            setLossRecords((losses || []).map(l => ({
                loss_id: l.loss_id,
                stock_id: l.stock_id,
                stock_code: (l as any).meat_stock?.stock_code || '',
                meat_type_name: (l as any).meat_stock?.meat_types?.meat_type_name || 'Unknown',
                loss_weight_kg: l.loss_weight_kg,
                loss_type: l.loss_type,
                reason: l.reason || '',
                recorded_by: l.recorded_by || 'System',
                recorded_at: l.recorded_at
            })));

            // Load stock/batches with available quantity from meat_stock table
            const { data: stockData } = await supabase
                .from('meat_stock')
                .select('*, meat_types(meat_type_name)')
                .gt('available_kg', 0)
                .order('purchase_date');

            setBatches((stockData || []).map(b => {
                const purchaseDate = new Date(b.purchase_date);
                const daysOld = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
                return {
                    stock_id: b.stock_id,
                    stock_code: b.stock_code || `STK-${b.stock_id}`,
                    meat_type_name: (b as any).meat_types?.meat_type_name || 'Unknown',
                    available_kg: b.available_kg || 0,
                    days_old: daysOld
                };
            }));

        } catch (err: any) {
            console.error('Error loading data:', err);
            toast.error(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSave = async () => {
        if (!formData.stock_id) {
            toast.error('Please select a batch');
            return;
        }
        if (formData.loss_weight_kg <= 0) {
            toast.error('Please enter loss weight');
            return;
        }

        const selectedBatch = batches.find(b => b.stock_id === formData.stock_id);
        if (selectedBatch && formData.loss_weight_kg > selectedBatch.available_kg) {
            toast.error(`Loss weight cannot exceed available stock (${selectedBatch.available_kg.toFixed(2)} Kg)`);
            return;
        }

        setIsSaving(true);
        try {
            // Insert loss record into meat_weight_losses table
            const { error: lossError } = await supabase
                .from('meat_weight_losses')
                .insert({
                    stock_id: formData.stock_id,
                    loss_weight_kg: formData.loss_weight_kg,
                    loss_type: formData.loss_type,
                    reason: formData.reason || null,
                    recorded_by: 'Web',
                    recorded_at: new Date().toISOString()
                });

            if (lossError) throw lossError;

            // Update meat_stock - decrease available_kg, increase loss_kg
            const { data: currentStock } = await supabase
                .from('meat_stock')
                .select('available_kg, loss_kg')
                .eq('stock_id', formData.stock_id)
                .single();

            const newAvailable = (currentStock?.available_kg || 0) - formData.loss_weight_kg;
            const newLossKg = (currentStock?.loss_kg || 0) + formData.loss_weight_kg;

            const { error: stockError } = await supabase
                .from('meat_stock')
                .update({
                    available_kg: newAvailable,
                    loss_kg: newLossKg,
                    status: newAvailable <= 0 ? 'Sold Out' : 'Available'
                })
                .eq('stock_id', formData.stock_id);

            if (stockError) throw stockError;

            toast.success('✅ Weight loss recorded!');
            setShowModal(false);
            setFormData({ stock_id: 0, loss_weight_kg: 0, loss_type: 'Drying', reason: '' });
            loadData();

        } catch (err: any) {
            console.error('Save error:', err);
            toast.error(err.message || 'Failed to record');
        } finally {
            setIsSaving(false);
        }
    };

    const totalLoss = lossRecords.reduce((sum, r) => sum + r.loss_weight_kg, 0);
    const todayLoss = lossRecords
        .filter(r => new Date(r.recorded_at).toDateString() === new Date().toDateString())
        .reduce((sum, r) => sum + r.loss_weight_kg, 0);

    const getLossIcon = (type: string) => {
        return lossTypes.find(t => t.id === type)?.icon || '📋';
    };

    const getLossColor = (type: string) => {
        switch (type) {
            case 'Drying': return 'bg-blue-100 text-blue-700';
            case 'Bone': return 'bg-gray-100 text-gray-700';
            case 'Trim': return 'bg-yellow-100 text-yellow-700';
            case 'Spoilage': return 'bg-red-100 text-red-700';
            default: return 'bg-purple-100 text-purple-700';
        }
    };

    const getDaysColor = (days: number) => {
        if (days === 0) return 'text-green-600';
        if (days === 1) return 'text-yellow-600';
        if (days === 2) return 'text-orange-600';
        return 'text-red-600';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 rounded-3xl p-5 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/butchery" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ←
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                ⚖️ Weight Loss
                            </h1>
                            <p className="text-white/80 text-sm">Track bone, drying & other losses by batch</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-5 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-colors flex items-center gap-2"
                    >
                        ➕ Record Loss
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-5 border border-orange-100">
                    <span className="text-3xl">⚖️</span>
                    <p className="text-sm text-orange-600 mt-2">Total Records</p>
                    <p className="text-3xl font-bold text-orange-700">{lossRecords.length}</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-5 border border-red-100">
                    <span className="text-3xl">📉</span>
                    <p className="text-sm text-red-600 mt-2">Total Loss</p>
                    <p className="text-3xl font-bold text-red-700">{totalLoss.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-5 border border-amber-100">
                    <span className="text-3xl">📅</span>
                    <p className="text-sm text-amber-600 mt-2">Today&apos;s Loss</p>
                    <p className="text-3xl font-bold text-amber-700">{todayLoss.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
                    <span className="text-3xl">💨</span>
                    <p className="text-sm text-blue-600 mt-2">Drying Loss</p>
                    <p className="text-3xl font-bold text-blue-700">
                        {lossRecords.filter(r => r.loss_type === 'Drying').reduce((sum, r) => sum + r.loss_weight_kg, 0).toFixed(1)} Kg
                    </p>
                </div>
            </div>

            {/* Loss Type Quick Stats */}
            <div className="grid grid-cols-5 gap-3">
                {lossTypes.map(type => {
                    const typeTotal = lossRecords.filter(r => r.loss_type === type.id).reduce((sum, r) => sum + r.loss_weight_kg, 0);
                    return (
                        <div key={type.id} className="bg-white rounded-xl p-4 border shadow-sm text-center">
                            <span className="text-3xl">{type.icon}</span>
                            <p className="text-xs text-gray-500 mt-1">{type.label}</p>
                            <p className="font-bold text-gray-800">{typeTotal.toFixed(1)} Kg</p>
                        </div>
                    );
                })}
            </div>

            {/* Loss Records Table */}
            <div className="bg-white rounded-2xl border shadow-lg overflow-hidden">
                <div className="p-4 border-b bg-gradient-to-r from-orange-50 to-amber-50">
                    <h2 className="font-bold text-gray-800">📋 Weight Loss Records</h2>
                </div>
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">📦 BATCH</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">🥩 MEAT TYPE</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600 text-sm">⚖️ LOSS (Kg)</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600 text-sm">📌 TYPE</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">📝 REASON</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600 text-sm">📅 DATE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center">
                                    <div className="flex items-center justify-center gap-3">
                                        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span>Loading records...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : lossRecords.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-gray-500">
                                    <div className="flex flex-col items-center gap-3">
                                        <span className="text-5xl">⚖️</span>
                                        <p>No weight loss records yet</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            lossRecords.map(record => (
                                <tr key={record.loss_id} className="border-t hover:bg-orange-50/30 transition-colors">
                                    <td className="py-3 px-4">
                                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{record.stock_code}</span>
                                    </td>
                                    <td className="py-3 px-4 font-semibold text-gray-800">{record.meat_type_name}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-bold">
                                            -{record.loss_weight_kg.toFixed(2)} Kg
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getLossColor(record.loss_type)}`}>
                                            {getLossIcon(record.loss_type)} {record.loss_type}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-gray-600 text-sm">{record.reason || '-'}</td>
                                    <td className="py-3 px-4 text-center text-gray-500 text-sm">
                                        {new Date(record.recorded_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                            ⚖️ Record Weight Loss
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">🥩 Select Batch *</label>
                                <select
                                    value={formData.stock_id}
                                    onChange={(e) => setFormData({ ...formData, stock_id: parseInt(e.target.value) })}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
                                >
                                    <option value={0}>Select batch</option>
                                    {batches.map(batch => (
                                        <option key={batch.stock_id} value={batch.stock_id}>
                                            [{batch.days_old}d] {batch.meat_type_name} - {batch.stock_code} ({batch.available_kg.toFixed(1)} Kg)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">📌 Loss Type *</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {lossTypes.map(type => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, loss_type: type.id })}
                                            className={`p-3 rounded-xl border-2 transition-all text-center ${formData.loss_type === type.id
                                                ? 'bg-orange-500 border-orange-500 text-white'
                                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-orange-300'
                                                }`}
                                        >
                                            <span className="text-xl block">{type.icon}</span>
                                            <span className="text-xs">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">⚖️ Loss Weight (Kg) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.loss_weight_kg || ''}
                                    onChange={(e) => setFormData({ ...formData, loss_weight_kg: parseFloat(e.target.value) || 0 })}
                                    placeholder="e.g. 2.5"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">📝 Reason (Optional)</label>
                                <textarea
                                    value={formData.reason}
                                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                    placeholder="Describe the reason for weight loss..."
                                    rows={3}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none resize-none"
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
                                className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
                            >
                                {isSaving ? 'Recording...' : '✅ Record Loss'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
