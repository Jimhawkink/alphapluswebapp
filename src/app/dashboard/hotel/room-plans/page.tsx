'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface RoomPlan {
    plan_id: number;
    plan_code: string;
    plan_name: string;
    description: string;
    rate_modifier: number;
    includes_breakfast: boolean;
    includes_lunch: boolean;
    includes_dinner: boolean;
    color: string;
    icon: string;
    active: boolean;
}

const defaultPlan = { plan_code: '', plan_name: '', description: '', rate_modifier: 1.0, includes_breakfast: false, includes_lunch: false, includes_dinner: false, color: '#10B981', icon: '📋' };
const iconOptions = ['📋', '🍳', '🍽️', '🍴', '⭐', '👑', '🌟', '💫', '🎯', '🏆'];
const colorOptions = [
    { name: 'Green', value: '#10B981' }, { name: 'Blue', value: '#3B82F6' }, { name: 'Purple', value: '#8B5CF6' },
    { name: 'Orange', value: '#F59E0B' }, { name: 'Red', value: '#EF4444' }, { name: 'Pink', value: '#EC4899' },
    { name: 'Gray', value: '#6B7280' }, { name: 'Cyan', value: '#06B6D4' },
];

export default function RoomPlansPage() {
    const [plans, setPlans] = useState<RoomPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<RoomPlan | null>(null);
    const [formData, setFormData] = useState(defaultPlan);
    const [isSaving, setIsSaving] = useState(false);

    const loadPlans = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('room_plans').select('*').order('rate_modifier');
            if (error) throw error;
            setPlans(data || []);
        } catch (err) {
            console.error('Error loading plans:', err);
            toast.error('Failed to load room plans');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadPlans(); }, [loadPlans]);

    const openAddModal = () => { setEditingPlan(null); setFormData(defaultPlan); setShowModal(true); };

    const openEditModal = (plan: RoomPlan) => {
        setEditingPlan(plan);
        setFormData({
            plan_code: plan.plan_code || '',
            plan_name: plan.plan_name || '',
            description: plan.description || '',
            rate_modifier: plan.rate_modifier || 1.0,
            includes_breakfast: plan.includes_breakfast || false,
            includes_lunch: plan.includes_lunch || false,
            includes_dinner: plan.includes_dinner || false,
            color: plan.color || '#10B981',
            icon: plan.icon || '📋',
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.plan_name.trim()) { toast.error('Plan name is required'); return; }
        setIsSaving(true);
        try {
            if (editingPlan) {
                const { error } = await supabase.from('room_plans').update(formData).eq('plan_id', editingPlan.plan_id);
                if (error) throw error;
                toast.success('Room plan updated ✓');
            } else {
                const { error } = await supabase.from('room_plans').insert({ ...formData, active: true });
                if (error) throw error;
                toast.success('Room plan created ✓');
            }
            setShowModal(false);
            loadPlans();
        } catch (err) {
            console.error('Error saving plan:', err);
            toast.error('Failed to save room plan');
        }
        setIsSaving(false);
    };

    const deletePlan = async (plan: RoomPlan) => {
        if (!confirm(`Delete plan "${plan.plan_name}"?`)) return;
        try {
            const { error } = await supabase.from('room_plans').delete().eq('plan_id', plan.plan_id);
            if (error) throw error;
            toast.success('Plan deleted');
            loadPlans();
        } catch (err) {
            console.error('Error deleting plan:', err);
            toast.error('Failed to delete');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📋</span>
                        Room Plans
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Configure rate plans and meal packages</p>
                </div>
                <button onClick={openAddModal} className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                    <span className="text-xl">➕</span> Add Plan
                </button>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
                            <div className="h-12 w-12 bg-gray-200 rounded-xl mb-4" />
                            <div className="h-6 bg-gray-200 rounded mb-2" />
                            <div className="h-4 bg-gray-200 rounded w-2/3" />
                        </div>
                    ))
                ) : plans.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <span className="text-6xl">📋</span>
                        <p className="text-gray-500 mt-4">No room plans found</p>
                        <button onClick={openAddModal} className="mt-4 px-6 py-3 bg-emerald-500 text-white rounded-xl">Add First Plan</button>
                    </div>
                ) : (
                    plans.map(plan => (
                        <div key={plan.plan_id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 group">
                            <div className="h-2" style={{ backgroundColor: plan.color || '#10B981' }} />
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${plan.color}20` }}>
                                        {plan.icon || '📋'}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button onClick={() => openEditModal(plan)} className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg text-sm">✏️</button>
                                        <button onClick={() => deletePlan(plan)} className="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm">🗑️</button>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 text-xs font-bold rounded" style={{ backgroundColor: `${plan.color}20`, color: plan.color }}>{plan.plan_code}</span>
                                <h3 className="text-lg font-bold text-gray-800 mt-2">{plan.plan_name}</h3>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{plan.description || 'No description'}</p>

                                {/* Meals Included */}
                                <div className="flex gap-2 mt-4">
                                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${plan.includes_breakfast ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                        🍳 Breakfast
                                    </span>
                                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${plan.includes_lunch ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                        🍽️ Lunch
                                    </span>
                                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${plan.includes_dinner ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                        🍴 Dinner
                                    </span>
                                </div>

                                {/* Rate Modifier */}
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <p className="text-xs text-gray-500">Rate Modifier</p>
                                    <p className="text-xl font-bold" style={{ color: plan.color }}>×{plan.rate_modifier?.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">{editingPlan ? '✏️ Edit Plan' : '➕ Add Plan'}</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Plan Code</label>
                                    <input type="text" value={formData.plan_code} onChange={(e) => setFormData({ ...formData, plan_code: e.target.value.toUpperCase() })} placeholder="e.g. BB" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Plan Name *</label>
                                    <input type="text" value={formData.plan_name} onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })} placeholder="e.g. Bed & Breakfast" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Plan description..." rows={2} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Rate Modifier (×)</label>
                                <input type="number" step="0.01" value={formData.rate_modifier} onChange={(e) => setFormData({ ...formData, rate_modifier: parseFloat(e.target.value) || 1.0 })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500" min={0.5} max={5} />
                                <p className="text-xs text-gray-500 mt-1">Base rate × {formData.rate_modifier} = Final rate</p>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Meals Included</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={formData.includes_breakfast} onChange={(e) => setFormData({ ...formData, includes_breakfast: e.target.checked })} className="w-5 h-5 rounded text-emerald-500" />
                                        <span>🍳 Breakfast</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={formData.includes_lunch} onChange={(e) => setFormData({ ...formData, includes_lunch: e.target.checked })} className="w-5 h-5 rounded text-emerald-500" />
                                        <span>🍽️ Lunch</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={formData.includes_dinner} onChange={(e) => setFormData({ ...formData, includes_dinner: e.target.checked })} className="w-5 h-5 rounded text-emerald-500" />
                                        <span>🍴 Dinner</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Icon</label>
                                <div className="flex flex-wrap gap-2">
                                    {iconOptions.map(icon => (
                                        <button key={icon} type="button" onClick={() => setFormData({ ...formData, icon })} className={`w-10 h-10 rounded-xl text-xl transition-all ${formData.icon === icon ? 'bg-emerald-100 ring-2 ring-emerald-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{icon}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {colorOptions.map(c => (
                                        <button key={c.value} type="button" onClick={() => setFormData({ ...formData, color: c.value })} className={`w-8 h-8 rounded-lg transition-all ${formData.color === c.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c.value }} title={c.name} />
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : '💾 Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
