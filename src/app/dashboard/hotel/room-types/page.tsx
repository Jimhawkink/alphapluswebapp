'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface RoomType {
    room_type_id: number;
    type_code: string;
    type_name: string;
    description: string;
    base_rate: number;
    max_occupancy: number;
    amenities: string[];
    icon: string;
    color: string;
    active: boolean;
}

const defaultType: { type_code: string; type_name: string; description: string; base_rate: number; max_occupancy: number; amenities: string[]; icon: string; color: string } = { type_code: '', type_name: '', description: '', base_rate: 0, max_occupancy: 2, amenities: [], icon: '🛏️', color: '#3B82F6' };
const iconOptions = ['🛏️', '✨', '🌟', '💼', '👑', '🏰', '🌴', '🎯', '🏆', '💎'];
const colorOptions = [
    { name: 'Blue', value: '#3B82F6' }, { name: 'Purple', value: '#8B5CF6' }, { name: 'Green', value: '#10B981' },
    { name: 'Orange', value: '#F59E0B' }, { name: 'Red', value: '#EF4444' }, { name: 'Pink', value: '#EC4899' },
    { name: 'Cyan', value: '#06B6D4' }, { name: 'Indigo', value: '#6366F1' },
];
const amenityOptions = ['TV', 'WiFi', 'AC', 'Minibar', 'Safe', 'Balcony', 'Kitchen', 'Jacuzzi', 'Ocean View', 'Pool Access', 'Gym Access', 'Room Service'];

export default function RoomTypesPage() {
    const [types, setTypes] = useState<RoomType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingType, setEditingType] = useState<RoomType | null>(null);
    const [formData, setFormData] = useState(defaultType);
    const [isSaving, setIsSaving] = useState(false);

    const loadTypes = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('room_types').select('*').order('base_rate');
            if (error) throw error;
            setTypes(data || []);
        } catch (err) {
            console.error('Error loading room types:', err);
            toast.error('Failed to load room types');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadTypes(); }, [loadTypes]);

    const openAddModal = () => { setEditingType(null); setFormData(defaultType); setShowModal(true); };

    const openEditModal = (type: RoomType) => {
        setEditingType(type);
        setFormData({
            type_code: type.type_code || '',
            type_name: type.type_name || '',
            description: type.description || '',
            base_rate: type.base_rate || 0,
            max_occupancy: type.max_occupancy || 2,
            amenities: type.amenities || [],
            icon: type.icon || '🛏️',
            color: type.color || '#3B82F6',
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.type_name.trim()) { toast.error('Type name is required'); return; }
        setIsSaving(true);
        try {
            if (editingType) {
                const { error } = await supabase.from('room_types').update({ ...formData, updated_at: new Date().toISOString() }).eq('room_type_id', editingType.room_type_id);
                if (error) throw error;
                toast.success('Room type updated ✓');
            } else {
                const { error } = await supabase.from('room_types').insert({ ...formData, active: true });
                if (error) throw error;
                toast.success('Room type created ✓');
            }
            setShowModal(false);
            loadTypes();
        } catch (err) {
            console.error('Error saving room type:', err);
            toast.error('Failed to save room type');
        }
        setIsSaving(false);
    };

    const deleteType = async (type: RoomType) => {
        if (!confirm(`Delete room type "${type.type_name}"?`)) return;
        try {
            const { error } = await supabase.from('room_types').delete().eq('room_type_id', type.room_type_id);
            if (error) throw error;
            toast.success('Room type deleted');
            loadTypes();
        } catch (err) {
            console.error('Error deleting room type:', err);
            toast.error('Failed to delete');
        }
    };

    const toggleAmenity = (amenity: string) => {
        const current = formData.amenities || [];
        if (current.includes(amenity)) {
            setFormData({ ...formData, amenities: current.filter(a => a !== amenity) });
        } else {
            setFormData({ ...formData, amenities: [...current, amenity] });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🛏️</span>
                        Room Types
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Configure room categories and pricing</p>
                </div>
                <button onClick={openAddModal} className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                    <span className="text-xl">➕</span> Add Room Type
                </button>
            </div>

            {/* Room Type Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
                            <div className="h-12 w-12 bg-gray-200 rounded-xl mb-4" />
                            <div className="h-6 bg-gray-200 rounded mb-2" />
                            <div className="h-4 bg-gray-200 rounded w-2/3" />
                        </div>
                    ))
                ) : types.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <span className="text-6xl">🛏️</span>
                        <p className="text-gray-500 mt-4">No room types found</p>
                        <button onClick={openAddModal} className="mt-4 px-6 py-3 bg-indigo-500 text-white rounded-xl">Add First Room Type</button>
                    </div>
                ) : (
                    types.map(type => (
                        <div key={type.room_type_id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 group">
                            <div className="h-3" style={{ backgroundColor: type.color || '#3B82F6' }} />
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ backgroundColor: `${type.color}20` }}>
                                        {type.icon || '🛏️'}
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                        <button onClick={() => openEditModal(type)} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl">✏️</button>
                                        <button onClick={() => deleteType(type)} className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl">🗑️</button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-1 text-xs font-semibold rounded-lg" style={{ backgroundColor: `${type.color}20`, color: type.color }}>{type.type_code}</span>
                                    <h3 className="text-lg font-bold text-gray-800">{type.type_name}</h3>
                                </div>
                                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{type.description || 'No description'}</p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {(type.amenities || []).slice(0, 5).map((a, i) => (
                                        <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">{a}</span>
                                    ))}
                                    {(type.amenities || []).length > 5 && <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">+{type.amenities.length - 5}</span>}
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                    <div>
                                        <p className="text-xs text-gray-500">Max Occupancy</p>
                                        <p className="font-semibold text-gray-800">👥 {type.max_occupancy} guests</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500">Base Rate</p>
                                        <p className="text-xl font-bold text-green-600">Ksh {type.base_rate?.toLocaleString()}</p>
                                    </div>
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
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">{editingType ? '✏️ Edit Room Type' : '➕ Add Room Type'}</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type Code</label>
                                    <input type="text" value={formData.type_code} onChange={(e) => setFormData({ ...formData, type_code: e.target.value.toUpperCase() })} placeholder="e.g. DLX" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type Name *</label>
                                    <input type="text" value={formData.type_name} onChange={(e) => setFormData({ ...formData, type_name: e.target.value })} placeholder="e.g. Deluxe Room" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Room description..." rows={2} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">💰 Base Rate (Ksh)</label>
                                    <input type="number" value={formData.base_rate} onChange={(e) => setFormData({ ...formData, base_rate: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500" min={0} />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">👥 Max Occupancy</label>
                                    <input type="number" value={formData.max_occupancy} onChange={(e) => setFormData({ ...formData, max_occupancy: parseInt(e.target.value) || 2 })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500" min={1} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Icon</label>
                                <div className="flex flex-wrap gap-2">
                                    {iconOptions.map(icon => (
                                        <button key={icon} type="button" onClick={() => setFormData({ ...formData, icon })} className={`w-12 h-12 rounded-xl text-2xl transition-all ${formData.icon === icon ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'bg-gray-50 hover:bg-gray-100'}`}>{icon}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {colorOptions.map(c => (
                                        <button key={c.value} type="button" onClick={() => setFormData({ ...formData, color: c.value })} className={`w-10 h-10 rounded-xl transition-all ${formData.color === c.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c.value }} title={c.name} />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Amenities</label>
                                <div className="flex flex-wrap gap-2">
                                    {amenityOptions.map(amenity => (
                                        <button key={amenity} type="button" onClick={() => toggleAmenity(amenity)} className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${(formData.amenities || []).includes(amenity) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{amenity}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
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
