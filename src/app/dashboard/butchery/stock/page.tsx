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
    available_kg: number;
    cost_per_kg: number;
    selling_price: number;
    supplier_name: string;
    status: string;
}

interface MeatType {
    meat_type_id: number;
    meat_type_name: string;
}

export default function MeatStockPage() {
    const [stockItems, setStockItems] = useState<MeatStock[]>([]);
    const [meatTypes, setMeatTypes] = useState<MeatType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        meat_type_id: 0,
        available_kg: 0,
        cost_per_kg: 0,
        selling_price: 0,
        supplier_name: ''
    });

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load stock - only select columns that exist
            const { data: stock, error } = await supabase
                .from('meat_stock')
                .select('stock_id, stock_code, meat_type_id, available_kg, cost_per_kg, selling_price, supplier_name, meat_types(meat_type_name)')
                .order('stock_id', { ascending: false });

            if (error) throw error;
            setStockItems((stock || []).map(s => ({
                stock_id: s.stock_id,
                stock_code: s.stock_code || `STK-${s.stock_id}`,
                meat_type_id: s.meat_type_id,
                meat_type_name: (s as any).meat_types?.meat_type_name || 'Unknown',
                available_kg: s.available_kg || 0,
                cost_per_kg: s.cost_per_kg || 0,
                selling_price: s.selling_price || 0,
                supplier_name: s.supplier_name || '',
                status: (s.available_kg || 0) > 0 ? 'In Stock' : 'Sold Out'
            })));

            // Load meat types
            const { data: types } = await supabase
                .from('meat_types')
                .select('meat_type_id, meat_type_name')
                .order('meat_type_name');

            setMeatTypes(types || []);

        } catch (err: any) {
            console.error('Error loading stock:', err);
            toast.error(err.message || 'Failed to load stock');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openModal = (stock?: MeatStock) => {
        if (stock) {
            setEditingId(stock.stock_id);
            setFormData({
                meat_type_id: stock.meat_type_id,
                available_kg: stock.available_kg,
                cost_per_kg: stock.cost_per_kg,
                selling_price: stock.selling_price,
                supplier_name: stock.supplier_name
            });
        } else {
            setEditingId(null);
            setFormData({
                meat_type_id: meatTypes[0]?.meat_type_id || 0,
                available_kg: 0,
                cost_per_kg: 0,
                selling_price: 0,
                supplier_name: ''
            });
        }
        setShowModal(true);
    };

    const generateStockCode = () => {
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `STK-${date}-${rand}`;
    };

    const handleSave = async () => {
        if (!formData.meat_type_id) {
            toast.error('Please select a meat type');
            return;
        }
        if (formData.available_kg <= 0) {
            toast.error('Please enter weight');
            return;
        }

        setIsSaving(true);
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('meat_stock')
                    .update({
                        meat_type_id: formData.meat_type_id,
                        available_kg: formData.available_kg,
                        cost_per_kg: formData.cost_per_kg,
                        selling_price: formData.selling_price,
                        supplier_name: formData.supplier_name
                    })
                    .eq('stock_id', editingId);

                if (error) throw error;
                toast.success('Stock updated!');
            } else {
                const { error } = await supabase
                    .from('meat_stock')
                    .insert({
                        stock_code: generateStockCode(),
                        meat_type_id: formData.meat_type_id,
                        available_kg: formData.available_kg,
                        cost_per_kg: formData.cost_per_kg,
                        selling_price: formData.selling_price,
                        supplier_name: formData.supplier_name
                    });

                if (error) throw error;
                toast.success('Stock added!');
            }

            setShowModal(false);
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const totalValue = stockItems.reduce((sum, s) => sum + (s.available_kg * s.selling_price), 0);
    const totalWeight = stockItems.reduce((sum, s) => sum + s.available_kg, 0);
    const totalCost = stockItems.reduce((sum, s) => sum + (s.available_kg * s.cost_per_kg), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-700 rounded-3xl p-5 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/butchery" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ←
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                📦 Meat Stock
                            </h1>
                            <p className="text-white/80 text-sm">Inventory Management</p>
                        </div>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="px-5 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-colors"
                    >
                        ➕ Add Stock
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-5 border border-cyan-100">
                    <span className="text-3xl">📦</span>
                    <p className="text-sm text-cyan-600 mt-2">Total Stock Items</p>
                    <p className="text-3xl font-bold text-cyan-700">{stockItems.length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100">
                    <span className="text-3xl">⚖️</span>
                    <p className="text-sm text-amber-600 mt-2">Total Weight</p>
                    <p className="text-3xl font-bold text-amber-700">{totalWeight.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
                    <span className="text-3xl">💰</span>
                    <p className="text-sm text-green-600 mt-2">Stock Value</p>
                    <p className="text-2xl font-bold text-green-700">KES {totalValue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-5 border border-purple-100">
                    <span className="text-3xl">📈</span>
                    <p className="text-sm text-purple-600 mt-2">Potential Profit</p>
                    <p className="text-2xl font-bold text-purple-700">KES {(totalValue - totalCost).toLocaleString()}</p>
                </div>
            </div>

            {/* Stock Table */}
            <div className="bg-white rounded-2xl border shadow-lg overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-cyan-600 to-blue-700">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-sm text-white">📦 STOCK CODE</th>
                            <th className="text-left py-4 px-4 font-bold text-sm text-white">🥩 MEAT TYPE</th>
                            <th className="text-center py-4 px-4 font-bold text-sm text-white">⚖️ AVAILABLE</th>
                            <th className="text-right py-4 px-4 font-bold text-sm text-white">💰 COST/KG</th>
                            <th className="text-right py-4 px-4 font-bold text-sm text-white">💵 SELL/KG</th>
                            <th className="text-right py-4 px-4 font-bold text-sm text-white">📈 VALUE</th>
                            <th className="text-center py-4 px-4 font-bold text-sm text-white">📍 STATUS</th>
                            <th className="text-center py-4 px-4 font-bold text-sm text-white">⚙️</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={8} className="py-16 text-center">
                                    <div className="flex items-center justify-center gap-3">
                                        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span>Loading stock...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : stockItems.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-16 text-center text-gray-500">
                                    📦 No stock items yet. Add your first stock!
                                </td>
                            </tr>
                        ) : (
                            stockItems.map(stock => (
                                <tr key={stock.stock_id} className="border-t hover:bg-cyan-50/30 transition-colors">
                                    <td className="py-3 px-4">
                                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{stock.stock_code}</span>
                                    </td>
                                    <td className="py-3 px-4 font-semibold text-gray-800">{stock.meat_type_name}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`px-3 py-1 rounded-lg font-bold ${stock.available_kg > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {stock.available_kg.toFixed(1)} Kg
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-gray-700">KES {stock.cost_per_kg.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-semibold text-blue-600">KES {stock.selling_price.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-bold text-purple-600">
                                        KES {(stock.available_kg * stock.selling_price).toLocaleString()}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${stock.available_kg > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {stock.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <button
                                            onClick={() => openModal(stock)}
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

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                            📦 {editingId ? 'Edit' : 'Add'} Stock
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">Meat Type *</label>
                                <select
                                    value={formData.meat_type_id}
                                    onChange={(e) => setFormData({ ...formData, meat_type_id: parseInt(e.target.value) })}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
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
                                <label className="text-sm text-gray-600 mb-1 block">Available Weight (Kg) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.available_kg}
                                    onChange={(e) => setFormData({ ...formData, available_kg: parseFloat(e.target.value) || 0 })}
                                    placeholder="e.g. 50"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block">Cost per Kg (KES)</label>
                                    <input
                                        type="number"
                                        value={formData.cost_per_kg}
                                        onChange={(e) => setFormData({ ...formData, cost_per_kg: parseFloat(e.target.value) || 0 })}
                                        placeholder="e.g. 400"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 mb-1 block">Selling Price per Kg</label>
                                    <input
                                        type="number"
                                        value={formData.selling_price}
                                        onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                                        placeholder="e.g. 550"
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">Supplier</label>
                                <input
                                    type="text"
                                    value={formData.supplier_name}
                                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                    placeholder="Supplier name"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
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
                                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
                            >
                                {isSaving ? 'Saving...' : editingId ? '✅ Update' : '✅ Add Stock'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
