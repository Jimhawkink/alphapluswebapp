'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Reservation {
    reservation_id: number;
    reservation_no: string;
    guest_id: number;
    guest_name: string;
    guest_phone: string;
    guest_email: string;
    room_id: number;
    room_number: string;
    room_type_name: string;
    check_in_date: string;
    check_out_date: string;
    nights: number;
    adults: number;
    children: number;
    plan_name: string;
    room_rate: number;
    total_amount: number;
    advance_paid: number;
    balance_amount: number;
    payment_status: string;
    status: string;
    booking_source: string;
    special_requests: string;
    created_at: string;
}

interface Room {
    room_id: number;
    room_number: string;
    room_type_name: string;
    room_rate: number;
    status: string;
}

interface Guest {
    guest_id: number;
    guest_code: string;
    full_name: string;
    phone: string;
    email: string;
}

interface RoomPlan {
    plan_id: number;
    plan_name: string;
    rate_modifier: number;
}

const statusColors: Record<string, { bg: string; text: string }> = {
    'Pending': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    'Confirmed': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'Checked-In': { bg: 'bg-green-100', text: 'text-green-700' },
    'Checked-Out': { bg: 'bg-gray-100', text: 'text-gray-700' },
    'Cancelled': { bg: 'bg-red-100', text: 'text-red-700' },
    'No-Show': { bg: 'bg-orange-100', text: 'text-orange-700' },
};

export default function ReservationsPage() {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [guests, setGuests] = useState<Guest[]>([]);
    const [plans, setPlans] = useState<RoomPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [filterStatus, setFilterStatus] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        guest_name: '', guest_phone: '', guest_email: '', room_id: 0, room_number: '', room_type_name: '',
        check_in_date: new Date().toISOString().split('T')[0],
        check_out_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        nights: 1, adults: 1, children: 0, plan_id: 0, plan_name: '', room_rate: 0, total_amount: 0,
        advance_paid: 0, payment_method: 'Cash', booking_source: 'Direct', special_requests: '',
    });

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [resData, roomData, guestData, planData] = await Promise.all([
                supabase.from('hotel_reservations').select('*').order('created_at', { ascending: false }),
                supabase.from('hotel_rooms').select('room_id, room_number, room_type_name, room_rate, status').eq('active', true).order('room_number'),
                supabase.from('hotel_guests').select('guest_id, guest_code, full_name, phone, email').eq('active', true).order('full_name'),
                supabase.from('room_plans').select('plan_id, plan_name, rate_modifier').eq('active', true),
            ]);
            setReservations(resData.data || []);
            setRooms(roomData.data || []);
            setGuests(guestData.data || []);
            setPlans(planData.data || []);
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openAddModal = () => {
        setFormData({
            guest_name: '', guest_phone: '', guest_email: '', room_id: 0, room_number: '', room_type_name: '',
            check_in_date: new Date().toISOString().split('T')[0],
            check_out_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            nights: 1, adults: 1, children: 0, plan_id: 0, plan_name: '', room_rate: 0, total_amount: 0,
            advance_paid: 0, payment_method: 'Cash', booking_source: 'Direct', special_requests: '',
        });
        setShowModal(true);
    };

    const calculateNights = (checkIn: string, checkOut: string) => {
        const d1 = new Date(checkIn);
        const d2 = new Date(checkOut);
        return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000));
    };

    const handleRoomSelect = (roomId: number) => {
        const room = rooms.find(r => r.room_id === roomId);
        if (room) {
            const nights = calculateNights(formData.check_in_date, formData.check_out_date);
            setFormData({
                ...formData,
                room_id: room.room_id,
                room_number: room.room_number,
                room_type_name: room.room_type_name,
                room_rate: room.room_rate,
                total_amount: room.room_rate * nights,
            });
        }
    };

    const handleDateChange = (field: 'check_in_date' | 'check_out_date', value: string) => {
        const newData = { ...formData, [field]: value };
        const nights = calculateNights(newData.check_in_date, newData.check_out_date);
        newData.nights = nights;
        newData.total_amount = newData.room_rate * nights;
        setFormData(newData);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.guest_name.trim()) { toast.error('Guest name is required'); return; }
        if (!formData.room_id) { toast.error('Please select a room'); return; }
        setIsSaving(true);
        try {
            const reservationNo = `RSV-${Date.now().toString().slice(-8)}`;
            const { error } = await supabase.from('hotel_reservations').insert({
                reservation_no: reservationNo,
                guest_name: formData.guest_name,
                guest_phone: formData.guest_phone,
                guest_email: formData.guest_email,
                room_id: formData.room_id,
                room_number: formData.room_number,
                room_type_name: formData.room_type_name,
                check_in_date: formData.check_in_date,
                check_out_date: formData.check_out_date,
                nights: formData.nights,
                adults: formData.adults,
                children: formData.children,
                plan_name: formData.plan_name,
                room_rate: formData.room_rate,
                total_room_charge: formData.total_amount,
                total_amount: formData.total_amount,
                advance_paid: formData.advance_paid,
                balance_amount: formData.total_amount - formData.advance_paid,
                payment_status: formData.advance_paid >= formData.total_amount ? 'Paid' : formData.advance_paid > 0 ? 'Partial' : 'Pending',
                status: 'Confirmed',
                booking_source: formData.booking_source,
                special_requests: formData.special_requests,
            });
            if (error) throw error;

            // Update room status
            await supabase.from('hotel_rooms').update({ status: 'Reserved', updated_at: new Date().toISOString() }).eq('room_id', formData.room_id);

            toast.success(`✅ Reservation ${reservationNo} created`);
            setShowModal(false);
            loadData();
        } catch (err) {
            console.error('Error creating reservation:', err);
            toast.error('Failed to create reservation');
        }
        setIsSaving(false);
    };

    const updateStatus = async (res: Reservation, newStatus: string) => {
        try {
            const { error } = await supabase.from('hotel_reservations').update({ status: newStatus }).eq('reservation_id', res.reservation_id);
            if (error) throw error;
            if (newStatus === 'Cancelled') {
                await supabase.from('hotel_rooms').update({ status: 'Vacant' }).eq('room_id', res.room_id);
            }
            toast.success(`Reservation ${newStatus}`);
            loadData();
        } catch (err) {
            console.error('Error updating reservation:', err);
            toast.error('Failed to update');
        }
    };

    const filteredReservations = reservations.filter(r => {
        const matchesSearch = (r.reservation_no || '').toLowerCase().includes(searchQuery.toLowerCase()) || (r.guest_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (r.room_number || '').includes(searchQuery);
        const matchesStatus = filterStatus === 'All' || r.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: reservations.length,
        pending: reservations.filter(r => r.status === 'Pending').length,
        confirmed: reservations.filter(r => r.status === 'Confirmed').length,
        checkedIn: reservations.filter(r => r.status === 'Checked-In').length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📅</span>
                        Reservations
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Manage room bookings and reservations</p>
                </div>
                <button onClick={openAddModal} className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                    <span className="text-xl">➕</span> New Reservation
                </button>
            </div>

            {/* Stats - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📋</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Total</p>
                    <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">⏳</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Pending</p>
                    <p className="text-3xl font-bold mt-1">{stats.pending}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">✅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Confirmed</p>
                    <p className="text-3xl font-bold mt-1">{stats.confirmed}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🔑</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Checked-In</p>
                    <p className="text-3xl font-bold mt-1">{stats.checkedIn}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input type="text" placeholder="🔍 Search reservation, guest, or room..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                    </div>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500">
                        <option value="All">📋 All Status</option>
                        <option value="Pending">⏳ Pending</option>
                        <option value="Confirmed">✅ Confirmed</option>
                        <option value="Checked-In">🔑 Checked-In</option>
                        <option value="Cancelled">❌ Cancelled</option>
                    </select>
                    <button onClick={loadData} className="px-5 py-3 bg-violet-50 text-violet-600 rounded-xl hover:bg-violet-100 font-medium transition-all flex items-center gap-2">🔄 Refresh</button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-violet-500 to-purple-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Reservation #</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Guest</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Room</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Check-In</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Check-Out</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Nights</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Total</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Status</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={9} className="px-4 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-violet-400/30 border-t-violet-500 rounded-full animate-spin" /><span className="text-gray-500">Loading...</span></div></td></tr>
                            ) : filteredReservations.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-12 text-center"><span className="text-5xl">📅</span><p className="text-gray-500 mt-2">No reservations found</p><button onClick={openAddModal} className="mt-4 px-4 py-2 bg-violet-500 text-white rounded-xl">Create Reservation</button></td></tr>
                            ) : (
                                filteredReservations.map(res => {
                                    const sColor = statusColors[res.status] || statusColors['Pending'];
                                    return (
                                        <tr key={res.reservation_id} className="border-t border-gray-50 hover:bg-violet-50/50 transition-colors">
                                            <td className="px-4 py-4"><span className="px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-sm font-semibold">{res.reservation_no}</span></td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-gray-800">👤 {res.guest_name}</p>
                                                <p className="text-xs text-gray-500">📞 {res.guest_phone || 'N/A'}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-gray-800">🚪 {res.room_number}</p>
                                                <p className="text-xs text-gray-500">{res.room_type_name}</p>
                                            </td>
                                            <td className="px-4 py-4 text-center"><span className="text-sm text-gray-700">{res.check_in_date ? new Date(res.check_in_date).toLocaleDateString() : 'N/A'}</span></td>
                                            <td className="px-4 py-4 text-center"><span className="text-sm text-gray-700">{res.check_out_date ? new Date(res.check_out_date).toLocaleDateString() : 'N/A'}</span></td>
                                            <td className="px-4 py-4 text-center"><span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold">{res.nights} 🌙</span></td>
                                            <td className="px-4 py-4 text-right font-bold text-green-600">Ksh {(res.total_amount || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${sColor.bg} ${sColor.text}`}>{res.status}</span></td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    {res.status === 'Confirmed' && <button onClick={() => updateStatus(res, 'Checked-In')} className="p-2 bg-green-100 hover:bg-green-200 text-green-600 rounded-xl text-sm" title="Check-In">🔑</button>}
                                                    {(res.status === 'Pending' || res.status === 'Confirmed') && <button onClick={() => updateStatus(res, 'Cancelled')} className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl text-sm" title="Cancel">❌</button>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">➕ New Reservation</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">👤 Guest Name *</label>
                                    <input type="text" value={formData.guest_name} onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })} placeholder="Full Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Phone</label>
                                    <input type="text" value={formData.guest_phone} onChange={(e) => setFormData({ ...formData, guest_phone: e.target.value })} placeholder="0712345678" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">✉️ Email</label>
                                    <input type="email" value={formData.guest_email} onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })} placeholder="email@example.com" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">🚪 Select Room *</label>
                                <select value={formData.room_id} onChange={(e) => handleRoomSelect(parseInt(e.target.value))} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" required>
                                    <option value={0}>-- Select a Room --</option>
                                    {rooms.filter(r => r.status === 'Vacant').map(room => (
                                        <option key={room.room_id} value={room.room_id}>Room {room.room_number} - {room.room_type_name} (Ksh {room.room_rate?.toLocaleString()}/night)</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📅 Check-In</label>
                                    <input type="date" value={formData.check_in_date} onChange={(e) => handleDateChange('check_in_date', e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📅 Check-Out</label>
                                    <input type="date" value={formData.check_out_date} onChange={(e) => handleDateChange('check_out_date', e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">🌙 Nights</label>
                                    <input type="number" value={formData.nights} readOnly className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">👥 Adults</label>
                                    <input type="number" value={formData.adults} onChange={(e) => setFormData({ ...formData, adults: parseInt(e.target.value) || 1 })} min={1} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">👶 Children</label>
                                    <input type="number" value={formData.children} onChange={(e) => setFormData({ ...formData, children: parseInt(e.target.value) || 0 })} min={0} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📍 Booking Source</label>
                                    <select value={formData.booking_source} onChange={(e) => setFormData({ ...formData, booking_source: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500">
                                        <option>Direct</option>
                                        <option>Phone</option>
                                        <option>Website</option>
                                        <option>Walk-in</option>
                                        <option>OTA</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">💰 Advance Payment</label>
                                    <input type="number" value={formData.advance_paid} onChange={(e) => setFormData({ ...formData, advance_paid: parseFloat(e.target.value) || 0 })} min={0} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">📝 Special Requests</label>
                                <textarea value={formData.special_requests} onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })} rows={2} placeholder="Any special requests..." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-violet-500" />
                            </div>
                            {formData.room_id > 0 && (
                                <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-200">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-600">Room Rate:</span>
                                        <span className="font-semibold">Ksh {formData.room_rate?.toLocaleString()}/night</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-600">Nights:</span>
                                        <span className="font-semibold">{formData.nights}</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-600">Total:</span>
                                        <span className="font-bold text-xl text-violet-600">Ksh {formData.total_amount?.toLocaleString()}</span>
                                    </div>
                                    {formData.advance_paid > 0 && (
                                        <div className="flex justify-between items-center pt-2 border-t border-violet-200">
                                            <span className="text-gray-600">Balance:</span>
                                            <span className="font-bold text-orange-600">Ksh {(formData.total_amount - formData.advance_paid).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex gap-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Creating...' : '📅 Create Reservation'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
