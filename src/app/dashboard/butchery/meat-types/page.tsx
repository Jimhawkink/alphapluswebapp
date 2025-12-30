'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface MeatType {
    meat_type_id: number;
    meat_type_name: string;
    description: string;
    is_active: boolean;
    created_at: string;
}

export default function MeatTypesPage() {
    const [meatTypes, setMeatTypes] = useState<MeatType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        meat_type_name: '',
        description: '',
        is_active: true
    });

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('meat_types')
                .select('*')
                .order('meat_type_name');

            if (error) throw error;
            setMeatTypes(data || []);
        } catch (err) {
            console.error('Error loading meat types:', err);
            toast.error('Failed to load meat types');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openModal = (meatType?: MeatType) => {
        if (meatType) {
            setEditingId(meatType.meat_type_id);
            setFormData({
                meat_type_name: meatType.meat_type_name,
                description: meatType.description || '',
                is_active: meatType.is_active !== false
            });
        } else {
            setEditingId(null);
            setFormData({
                meat_type_name: '',
                description: '',
                is_active: true
            });
        }
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.meat_type_name.trim()) {
            toast.error('Please enter meat type name');
            return;
        }

        setIsSaving(true);
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('meat_types')
                    .update({
                        meat_type_name: formData.meat_type_name,
                        description: formData.description,
                        is_active: formData.is_active
                    })
                    .eq('meat_type_id', editingId);

                if (error) throw error;
                toast.success('Meat type updated!');
            } else {
                const { error } = await supabase
                    .from('meat_types')
                    .insert({
                        meat_type_name: formData.meat_type_name,
                        description: formData.description,
                        is_active: formData.is_active
                    });

                if (error) throw error;
                toast.success('Meat type created!');
            }

            setShowModal(false);
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this meat type?')) return;

        try {
            const { error } = await supabase
                .from('meat_types')
                .delete()
                .eq('meat_type_id', id);

            if (error) throw error;
            toast.success('Meat type deleted!');
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete');
        }
    };

    const meatEmojis: { [key: string]: string } = {
        'Beef': '🐄',
        'Goat': '🐐',
        'Chicken': '🐔',
        'Pork': '🐷',
        'Lamb': '🐑',
        'Fish': '🐟',
        'Mutton': '🐑',
        default: '🥩'
    };

    const getMeatEmoji = (name: string) => {
        for (const key in meatEmojis) {
            if (name.toLowerCase().includes(key.toLowerCase())) {
                return meatEmojis[key];
            }
        }
        return meatEmojis.default;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-3xl p-5 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/butchery" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ←
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                🥩 Meat Types
                            </h1>
                            <p className="text-white/80 text-sm">Manage meat categories</p>
                        </div>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="px-5 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-colors"
                    >
                        ➕ Add Meat Type
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-5 border border-red-100">
                    <span className="text-3xl">🥩</span>
                    <p className="text-sm text-red-600 mt-2">Total Types</p>
                    <p className="text-3xl font-bold text-red-700">{meatTypes.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm text-green-600 mt-2">Active Types</p>
                    <p className="text-3xl font-bold text-green-700">{meatTypes.filter(m => m.is_active).length}</p>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-2xl p-5 border border-gray-100">
                    <span className="text-3xl">⏸️</span>
                    <p className="text-sm text-gray-600 mt-2">Inactive Types</p>
                    <p className="text-3xl font-bold text-gray-700">{meatTypes.filter(m => !m.is_active).length}</p>
                </div>
            </div>

            {/* Meat Types Grid */}
            <div className="grid grid-cols-4 gap-4">
                {isLoading ? (
                    <div className="col-span-4 text-center py-16">
                        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading meat types...</p>
                    </div>
                ) : meatTypes.length === 0 ? (
                    <div className="col-span-4 text-center py-16">
                        <span className="text-6xl mb-4 block">🥩</span>
                        <p className="text-gray-500 mb-4">No meat types yet</p>
                        <button
                            onClick={() => openModal()}
                            className="px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
                        >
                            Add First Meat Type
                        </button>
                    </div>
                ) : (
                    meatTypes.map(meat => (
                        <div
                            key={meat.meat_type_id}
                            className={`bg-white rounded-2xl border shadow-lg overflow-hidden transition-all hover:shadow-xl ${!meat.is_active ? 'opacity-60' : ''
                                }`}
                        >
                            <div className="bg-gradient-to-r from-red-500 to-rose-600 p-4 text-center">
                                <span className="text-5xl">{getMeatEmoji(meat.meat_type_name)}</span>
                            </div>
                            <div className="p-4">
                                <h3 className="font-bold text-gray-800 text-lg">{meat.meat_type_name}</h3>
                                <p className="text-gray-500 text-sm mb-2 line-clamp-2">{meat.description || 'No description'}</p>
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${meat.is_active !== false
                                        ? 'bg-green-100 text-green-600'
                                        : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {meat.is_active !== false ? '✅ Active' : '⏸️ Inactive'}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openModal(meat)}
                                        className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                                    >
                                        ✏️ Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(meat.meat_type_id)}
                                        className="py-2 px-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                            🥩 {editingId ? 'Edit' : 'Add'} Meat Type
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">Meat Type Name *</label>
                                <input
                                    type="text"
                                    value={formData.meat_type_name}
                                    onChange={(e) => setFormData({ ...formData, meat_type_name: e.target.value })}
                                    placeholder="e.g. Beef, Goat, Chicken"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-red-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Description..."
                                    rows={3}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-red-500 focus:outline-none resize-none"
                                />
                            </div>



                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="w-5 h-5 rounded text-red-500"
                                />
                                <label htmlFor="isActive" className="text-gray-700">Active</label>
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
                                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
                            >
                                {isSaving ? 'Saving...' : editingId ? '✅ Update' : '✅ Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
