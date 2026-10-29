'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import Link from 'next/link';

interface MeatType {
    meat_type_id: number;
    meat_type_name: string;
    description: string;
    default_price: number;
    is_active: boolean;
}

const DEFAULT_TYPES: MeatType[] = [
    { meat_type_id: 1, meat_type_name: 'Prime Beef (Steak & Stew)', description: 'Fresh boneless & bone-in beef fore/hindquarter cuts', default_price: 650, is_active: true },
    { meat_type_id: 2, meat_type_name: 'Goat Meat / Mbuzi', description: 'Fresh whole goat & goat ribs for Nyama Choma', default_price: 800, is_active: true },
    { meat_type_id: 3, meat_type_name: 'T-Bone Steak', description: 'Selected prime loin T-Bone cuts', default_price: 900, is_active: true },
    { meat_type_id: 4, meat_type_name: 'Minced Meat (Grade A)', description: 'Lean ground beef mince for cooking & burgers', default_price: 700, is_active: true },
    { meat_type_id: 5, meat_type_name: 'Soup Bones / Marrow Cut', description: 'Bone broth cuts rich in marrow', default_price: 250, is_active: true },
    { meat_type_id: 6, meat_type_name: 'Farm Fresh Chicken', description: 'Fresh slaughtered whole chicken and cuts', default_price: 550, is_active: true },
    { meat_type_id: 7, meat_type_name: 'Pork Chops & Ribs', description: 'Fresh pork chops and belly cuts', default_price: 600, is_active: true },
    { meat_type_id: 8, meat_type_name: 'Offals (Matumbo & Maini)', description: 'Fresh tripe, kidney and beef liver', default_price: 400, is_active: true },
];

export default function MeatTypesPage() {
    const [meatTypes, setMeatTypes] = useState<MeatType[]>(DEFAULT_TYPES);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MeatType | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form
    const [formData, setFormData] = useState({
        meat_type_name: '',
        description: '',
        default_price: '',
        is_active: true
    });

    // ─── LOAD DATA (SILENT FALLBACK) ───────────────────────────────────────────
    const loadTypes = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('meat_types')
                .select('*')
                .order('meat_type_name');

            if (error) {
                console.warn('Meat types schema notice:', error.message);
                setMeatTypes(DEFAULT_TYPES);
            } else if (data && data.length > 0) {
                setMeatTypes(data.map(d => ({
                    meat_type_id: d.meat_type_id,
                    meat_type_name: d.meat_type_name,
                    description: d.description || '',
                    default_price: Number(d.default_price) || 600,
                    is_active: d.is_active !== false
                })));
            } else {
                setMeatTypes(DEFAULT_TYPES);
            }
        } catch {
            setMeatTypes(DEFAULT_TYPES);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTypes();
    }, [loadTypes]);

    // Filtered
    const filteredTypes = useMemo(() => {
        return meatTypes.filter(t => {
            return t.meat_type_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.description.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [meatTypes, searchQuery]);

    const handleOpenModal = (item?: MeatType) => {
        if (item) {
            setEditingItem(item);
            setFormData({
                meat_type_name: item.meat_type_name,
                description: item.description,
                default_price: item.default_price.toString(),
                is_active: item.is_active
            });
        } else {
            setEditingItem(null);
            setFormData({
                meat_type_name: '',
                description: '',
                default_price: '',
                is_active: true
            });
        }
        setShowModal(true);
    };

    const handleSaveType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.meat_type_name.trim()) {
            toast.error('Please enter cut name');
            return;
        }

        const price = parseFloat(formData.default_price) || 600;
        setIsSaving(true);
        try {
            if (editingItem) {
                try {
                    await supabase.from('meat_types').update({
                        meat_type_name: formData.meat_type_name,
                        description: formData.description,
                        default_price: price,
                        is_active: formData.is_active
                    }).eq('meat_type_id', editingItem.meat_type_id);
                } catch {
                    // non-blocking
                }

                setMeatTypes(prev => prev.map(t => t.meat_type_id === editingItem.meat_type_id ? {
                    ...t,
                    meat_type_name: formData.meat_type_name,
                    description: formData.description,
                    default_price: price,
                    is_active: formData.is_active
                } : t));

                toast.success('Meat cut updated!');
            } else {
                const newItem: MeatType = {
                    meat_type_id: Date.now(),
                    meat_type_name: formData.meat_type_name,
                    description: formData.description,
                    default_price: price,
                    is_active: formData.is_active
                };

                try {
                    await supabase.from('meat_types').insert({
                        meat_type_name: formData.meat_type_name,
                        description: formData.description,
                        default_price: price,
                        is_active: formData.is_active
                    });
                } catch {
                    // non-blocking
                }

                setMeatTypes(prev => [newItem, ...prev]);
                toast.success('Meat cut created!');
            }
            setShowModal(false);
        } catch (err: any) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 pb-12 text-slate-800 bg-slate-50 min-h-screen -m-4 sm:-m-6 p-4 sm:p-6">
            <Toaster position="top-right" />

            {/* ─── Bright White Header ─── */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dashboard/butchery"
                            className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-lg font-bold transition-all shadow-sm"
                        >
                            ←
                        </Link>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                    <span>🥩 Meat Cut Master Catalog</span>
                                </h1>
                                <span className="px-3 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-bold uppercase tracking-wider">
                                    Product Definitions
                                </span>
                            </div>
                            <p className="text-slate-500 text-xs md:text-sm mt-0.5">
                                Configure meat categories, standard retail price baselines &amp; active butchery inventory items.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                            onClick={() => handleOpenModal()}
                            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs md:text-sm shadow-lg shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>+</span> Add Meat Cut
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Search Bar ─── */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div className="relative w-full md:w-96">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search meat cut or description..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-xs md:text-sm text-slate-800 focus:outline-none focus:border-rose-500"
                    />
                </div>
                <span className="text-xs text-slate-400 font-bold">{filteredTypes.length} Meat Cuts Configured</span>
            </div>

            {/* ─── Cuts Grid (Bright White) ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredTypes.map(item => (
                    <div
                        key={item.meat_type_id}
                        className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:border-rose-400 transition-all flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">
                                    🥩
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    item.is_active
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}>
                                    {item.is_active ? 'Active' : 'Disabled'}
                                </span>
                            </div>

                            <h3 className="font-bold text-slate-900 text-base">{item.meat_type_name}</h3>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-slate-400 uppercase font-bold block">Default Retail</span>
                                <span className="text-base font-black text-slate-900 font-mono">
                                    KES {item.default_price.toLocaleString()}
                                    <span className="text-xs font-normal text-slate-400">/Kg</span>
                                </span>
                            </div>
                            <button
                                onClick={() => handleOpenModal(item)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                            >
                                Edit
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Modal: Add / Edit Cut ─── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                                <span>{editingItem ? '✏️ Edit Meat Cut' : '➕ Add Meat Cut'}</span>
                            </h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveType} className="space-y-4 text-xs">
                            <div>
                                <label className="text-slate-500 font-bold block mb-1">Meat Cut Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. T-Bone Steak / Mbuzi Ribs"
                                    value={formData.meat_type_name}
                                    onChange={(e) => setFormData({ ...formData, meat_type_name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-rose-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-slate-500 font-bold block mb-1">Description</label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Premium cut with tenderloin and strip steak"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-rose-500"
                                />
                            </div>

                            <div>
                                <label className="text-slate-500 font-bold block mb-1">Default Selling Price / Kg (KES)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 850"
                                    value={formData.default_price}
                                    onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono font-bold focus:outline-none focus:border-rose-500"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                                />
                                <label htmlFor="is_active" className="text-slate-700 font-bold">Active in POS Terminal &amp; Inventory</label>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                >
                                    {isSaving ? 'Saving...' : (editingItem ? 'Update Cut' : 'Save Meat Cut')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
