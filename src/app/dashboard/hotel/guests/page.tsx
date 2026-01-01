'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Guest {
    guest_id: number;
    guest_code: string;
    title: string;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone: string;
    id_type: string;
    id_number: string;
    nationality: string;
    address: string;
    city: string;
    country: string;
    guest_type: string;
    company_name: string;
    loyalty_points: number;
    total_stays: number;
    total_spent: number;
    is_blacklisted: boolean;
    active: boolean;
    created_at: string;
}

const defaultGuest = {
    title: 'Mr.',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    id_type: 'National ID',
    id_number: '',
    nationality: 'Kenyan',
    address: '',
    city: '',
    country: 'Kenya',
    guest_type: 'Walk-in',
    company_name: '',
};

export default function GuestsPage() {
    const [guests, setGuests] = useState<Guest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
    const [formData, setFormData] = useState(defaultGuest);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [isSaving, setIsSaving] = useState(false);

    const loadGuests = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('hotel_guests').select('*').eq('active', true).order('created_at', { ascending: false });
            if (error) throw error;
            setGuests(data || []);
        } catch (err) {
            console.error('Error loading guests:', err);
            toast.error('Failed to load guests');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadGuests(); }, [loadGuests]);

    const generateGuestCode = async (): Promise<string> => {
        const { data } = await supabase.from('hotel_guests').select('guest_code').like('guest_code', 'GST-%').order('guest_code', { ascending: false }).limit(1);
        if (data && data.length > 0) {
            const lastNum = parseInt(data[0].guest_code.replace('GST-', '')) || 0;
            return `GST-${String(lastNum + 1).padStart(5, '0')}`;
        }
        return 'GST-00001';
    };

    const openAddModal = () => {
        setEditingGuest(null);
        setFormData(defaultGuest);
        setShowModal(true);
    };

    const openEditModal = (guest: Guest) => {
        setEditingGuest(guest);
        setFormData({
            title: guest.title || 'Mr.',
            first_name: guest.first_name || '',
            last_name: guest.last_name || '',
            email: guest.email || '',
            phone: guest.phone || '',
            id_type: guest.id_type || 'National ID',
            id_number: guest.id_number || '',
            nationality: guest.nationality || 'Kenyan',
            address: guest.address || '',
            city: guest.city || '',
            country: guest.country || 'Kenya',
            guest_type: guest.guest_type || 'Walk-in',
            company_name: guest.company_name || '',
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.first_name.trim()) { toast.error('First name is required'); return; }
        setIsSaving(true);
        try {
            const fullName = `${formData.title} ${formData.first_name} ${formData.last_name}`.trim();
            if (editingGuest) {
                const { error } = await supabase.from('hotel_guests').update({ ...formData, full_name: fullName, updated_at: new Date().toISOString() }).eq('guest_id', editingGuest.guest_id);
                if (error) throw error;
                toast.success('Guest updated successfully ✓');
            } else {
                const guestCode = await generateGuestCode();
                const { error } = await supabase.from('hotel_guests').insert({ ...formData, guest_code: guestCode, full_name: fullName });
                if (error) throw error;
                toast.success(`Guest ${guestCode} created ✓`);
            }
            setShowModal(false);
            loadGuests();
        } catch (err) {
            console.error('Error saving guest:', err);
            toast.error('Failed to save guest');
        }
        setIsSaving(false);
    };

    const deleteGuest = async (guest: Guest) => {
        if (!confirm(`Delete guest "${guest.full_name}"?`)) return;
        try {
            const { error } = await supabase.from('hotel_guests').update({ active: false }).eq('guest_id', guest.guest_id);
            if (error) throw error;
            toast.success('Guest deleted');
            loadGuests();
        } catch (err) {
            console.error('Error deleting guest:', err);
            toast.error('Failed to delete guest');
        }
    };

    const filteredGuests = guests.filter(g => {
        const matchesSearch = (g.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (g.phone || '').includes(searchQuery) || (g.guest_code || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'All' || g.guest_type === filterType;
        return matchesSearch && matchesType;
    });

    const stats = {
        total: guests.length,
        vip: guests.filter(g => g.guest_type === 'VIP').length,
        corporate: guests.filter(g => g.guest_type === 'Corporate').length,
        regular: guests.filter(g => g.guest_type === 'Regular').length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">👥</span>
                        Guest Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Manage hotel guests & loyalty program</p>
                </div>
                <button onClick={openAddModal} className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                    <span className="text-xl">➕</span> Add Guest
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">👥</span>
                    <p className="text-xs opacity-80 mt-2">Total Guests</p>
                    <p className="text-3xl font-bold">{stats.total}</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">👑</span>
                    <p className="text-xs opacity-80 mt-2">VIP Guests</p>
                    <p className="text-3xl font-bold">{stats.vip}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">🏢</span>
                    <p className="text-xs opacity-80 mt-2">Corporate</p>
                    <p className="text-3xl font-bold">{stats.corporate}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">⭐</span>
                    <p className="text-xs opacity-80 mt-2">Regular</p>
                    <p className="text-3xl font-bold">{stats.regular}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input type="text" placeholder="🔍 Search by name, phone, or code..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                    </div>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                        <option value="All">👥 All Types</option>
                        <option value="Walk-in">🚶 Walk-in</option>
                        <option value="VIP">👑 VIP</option>
                        <option value="Corporate">🏢 Corporate</option>
                        <option value="Regular">⭐ Regular</option>
                    </select>
                    <button onClick={loadGuests} className="px-5 py-3 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 font-medium transition-all flex items-center gap-2">🔄 Refresh</button>
                </div>
            </div>

            {/* Guests Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-purple-500 to-pink-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Code</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Guest Name</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Contact</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">ID</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Type</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Stays</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Total Spent</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={8} className="px-4 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-purple-400/30 border-t-purple-500 rounded-full animate-spin" /><span className="text-gray-500">Loading guests...</span></div></td></tr>
                            ) : filteredGuests.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-12 text-center"><span className="text-5xl">👥</span><p className="text-gray-500 mt-2">No guests found</p><button onClick={openAddModal} className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600">Add First Guest</button></td></tr>
                            ) : (
                                filteredGuests.map(guest => (
                                    <tr key={guest.guest_id} className="border-t border-gray-50 hover:bg-purple-50/50 transition-colors">
                                        <td className="px-4 py-4"><span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">{guest.guest_code}</span></td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold">{(guest.first_name || 'G')[0].toUpperCase()}</div>
                                                <div>
                                                    <p className="font-semibold text-gray-800">{guest.full_name || `${guest.first_name} ${guest.last_name}`}</p>
                                                    <p className="text-xs text-gray-500">{guest.nationality}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-sm text-gray-800">📞 {guest.phone || 'N/A'}</p>
                                            <p className="text-xs text-gray-500">✉️ {guest.email || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-sm text-gray-600">{guest.id_type}</p>
                                            <p className="text-xs text-gray-500">{guest.id_number || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${guest.guest_type === 'VIP' ? 'bg-yellow-100 text-yellow-700' : guest.guest_type === 'Corporate' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                                                {guest.guest_type === 'VIP' ? '👑' : guest.guest_type === 'Corporate' ? '🏢' : '👤'} {guest.guest_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center"><span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">{guest.total_stays || 0}</span></td>
                                        <td className="px-4 py-4 text-right font-bold text-green-600">Ksh {(guest.total_spent || 0).toLocaleString()}</td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => openEditModal(guest)} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl transition-all" title="Edit">✏️</button>
                                                <button onClick={() => deleteGuest(guest)} className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all" title="Delete">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-purple-500 to-pink-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">{editingGuest ? '✏️ Edit Guest' : '➕ Add New Guest'}</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">✕</button>
                            </div>
                            {editingGuest && <p className="text-purple-100 text-sm mt-1">Code: {editingGuest.guest_code}</p>}
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
                                    <select value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                                        <option>Mr.</option><option>Mrs.</option><option>Ms.</option><option>Dr.</option><option>Prof.</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">First Name *</label>
                                    <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} placeholder="First Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name</label>
                                    <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} placeholder="Last Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Phone</label>
                                    <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="0712345678" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">✉️ Email</label>
                                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">🪪 ID Type</label>
                                    <select value={formData.id_type} onChange={(e) => setFormData({ ...formData, id_type: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                                        <option>National ID</option><option>Passport</option><option>Driving License</option><option>Military ID</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">🔢 ID Number</label>
                                    <input type="text" value={formData.id_number} onChange={(e) => setFormData({ ...formData, id_number: e.target.value })} placeholder="ID Number" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">🌍 Nationality</label>
                                    <input type="text" value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })} placeholder="Kenyan" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">👤 Guest Type</label>
                                    <select value={formData.guest_type} onChange={(e) => setFormData({ ...formData, guest_type: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                                        <option>Walk-in</option><option>VIP</option><option>Corporate</option><option>Regular</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">🏢 Company</label>
                                    <input type="text" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="Company Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">📍 Address</label>
                                <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Address" rows={2} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                            </div>
                            <div className="flex gap-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : editingGuest ? '💾 Update Guest' : '➕ Add Guest'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
