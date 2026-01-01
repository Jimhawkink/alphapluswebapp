'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Room {
    room_id: number;
    room_number: string;
    room_name: string;
    floor_number: number;
    room_type_id: number;
    room_type_name: string;
    bed_type: string;
    bed_count: number;
    is_vip: boolean;
    is_suite: boolean;
    has_tv: boolean;
    has_wifi: boolean;
    has_ac: boolean;
    has_balcony: boolean;
    has_kitchen: boolean;
    has_minibar: boolean;
    room_rate: number;
    status: string;
    housekeeping_status: string;
    current_guest_name: string;
    check_in_date: string;
    expected_checkout: string;
    active: boolean;
}

interface RoomType {
    room_type_id: number;
    type_code: string;
    type_name: string;
    color: string;
    icon: string;
}

const statusColors: Record<string, { bg: string; text: string; gradient: string }> = {
    'Vacant': { bg: 'bg-emerald-100', text: 'text-emerald-700', gradient: 'from-emerald-400 to-green-500' },
    'Occupied': { bg: 'bg-blue-100', text: 'text-blue-700', gradient: 'from-blue-400 to-indigo-500' },
    'Reserved': { bg: 'bg-purple-100', text: 'text-purple-700', gradient: 'from-purple-400 to-violet-500' },
    'Under Repair': { bg: 'bg-orange-100', text: 'text-orange-700', gradient: 'from-orange-400 to-red-500' },
    'Dirty': { bg: 'bg-amber-100', text: 'text-amber-700', gradient: 'from-amber-400 to-yellow-500' },
    'Blocked': { bg: 'bg-gray-100', text: 'text-gray-700', gradient: 'from-gray-400 to-slate-500' },
};

const housekeepingColors: Record<string, { bg: string; text: string }> = {
    'Clean': { bg: 'bg-green-100', text: 'text-green-700' },
    'Dirty': { bg: 'bg-red-100', text: 'text-red-700' },
    'In Progress': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    'Inspected': { bg: 'bg-blue-100', text: 'text-blue-700' },
};

export default function RoomsOverviewPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterFloor, setFilterFloor] = useState('All');
    const [filterType, setFilterType] = useState('All');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; room: Room } | null>(null);
    const [showCheckinModal, setShowCheckinModal] = useState(false);
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

    const loadRooms = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('hotel_rooms')
                .select('*')
                .eq('active', true)
                .order('room_number');
            if (error) throw error;
            setRooms(data || []);
        } catch (err) {
            console.error('Error loading rooms:', err);
            toast.error('Failed to load rooms');
        }
        setIsLoading(false);
    }, []);

    const loadRoomTypes = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('room_types')
                .select('*')
                .eq('active', true)
                .order('type_name');
            if (error) throw error;
            setRoomTypes(data || []);
        } catch (err) {
            console.error('Error loading room types:', err);
        }
    }, []);

    useEffect(() => {
        loadRooms();
        loadRoomTypes();
    }, [loadRooms, loadRoomTypes]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, room: Room) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, room });
    };

    const updateRoomStatus = async (room: Room, newStatus: string, housekeepingStatus?: string) => {
        try {
            const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
            if (housekeepingStatus) updates.housekeeping_status = housekeepingStatus;
            if (newStatus === 'Vacant') {
                updates.current_guest_name = null;
                updates.current_booking_id = null;
                updates.check_in_date = null;
                updates.expected_checkout = null;
            }
            const { error } = await supabase.from('hotel_rooms').update(updates).eq('room_id', room.room_id);
            if (error) throw error;
            toast.success(`Room ${room.room_number} updated to ${newStatus}`);
            loadRooms();
        } catch (err) {
            console.error('Error updating room:', err);
            toast.error('Failed to update room');
        }
        setContextMenu(null);
    };

    const filteredRooms = rooms.filter(r => {
        if (filterStatus !== 'All' && r.status !== filterStatus) return false;
        if (filterFloor !== 'All' && r.floor_number !== parseInt(filterFloor)) return false;
        if (filterType !== 'All' && r.room_type_name !== filterType) return false;
        return true;
    });

    const floors = Array.from(new Set(rooms.map(r => r.floor_number))).sort();
    const stats = {
        total: rooms.length,
        vacant: rooms.filter(r => r.status === 'Vacant').length,
        occupied: rooms.filter(r => r.status === 'Occupied').length,
        reserved: rooms.filter(r => r.status === 'Reserved').length,
        dirty: rooms.filter(r => r.housekeeping_status === 'Dirty').length,
        underRepair: rooms.filter(r => r.status === 'Under Repair').length,
    };
    const occupancyRate = stats.total > 0 ? ((stats.occupied / stats.total) * 100).toFixed(1) : '0';

    const getAmenityIcons = (room: Room) => {
        const icons = [];
        if (room.has_tv) icons.push('📺');
        if (room.has_wifi) icons.push('📶');
        if (room.has_ac) icons.push('❄️');
        if (room.has_balcony) icons.push('🌅');
        if (room.has_kitchen) icons.push('🍳');
        if (room.has_minibar) icons.push('🍷');
        if (room.is_vip) icons.push('👑');
        if (room.is_suite) icons.push('🏰');
        return icons;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🏨</span>
                        Rooms Overview
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Manage all hotel rooms • Real-time status updates</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'cards' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>🎴 Cards</button>
                        <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'table' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>📋 Table</button>
                    </div>
                    <button onClick={loadRooms} className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🔄 Refresh</button>
                </div>
            </div>

            {/* Stats Cards - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🏨</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Total Rooms</p>
                    <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">✅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Vacant</p>
                    <p className="text-3xl font-bold mt-1">{stats.vacant}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-amber-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🔑</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Occupied</p>
                    <p className="text-3xl font-bold mt-1">{stats.occupied}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Reserved</p>
                    <p className="text-3xl font-bold mt-1">{stats.reserved}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🧹</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Dirty</p>
                    <p className="text-3xl font-bold mt-1">{stats.dirty}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📊</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Occupancy</p>
                    <p className="text-3xl font-bold mt-1">{occupancyRate}%</p>
                </div>
            </div>

            {/* Status Legend */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm font-semibold text-gray-700">🎨 Status Legend:</span>
                    {Object.entries(statusColors).map(([status, colors]) => (
                        <div key={status} className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${colors.gradient}`} />
                            <span className="text-sm text-gray-600">{status}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap gap-4">
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500">
                        <option value="All">📋 All Status</option>
                        <option value="Vacant">✅ Vacant</option>
                        <option value="Occupied">🔑 Occupied</option>
                        <option value="Reserved">📅 Reserved</option>
                        <option value="Dirty">🧹 Dirty</option>
                        <option value="Under Repair">🔧 Under Repair</option>
                    </select>
                    <select value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500">
                        <option value="All">🏢 All Floors</option>
                        {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
                    </select>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500">
                        <option value="All">🛏️ All Types</option>
                        {roomTypes.map(t => <option key={t.room_type_id} value={t.type_name}>{t.icon} {t.type_name}</option>)}
                    </select>
                </div>
            </div>

            {/* Room Cards View */}
            {viewMode === 'cards' && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {isLoading ? (
                        Array(10).fill(0).map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
                                <div className="h-8 bg-gray-200 rounded mb-4" />
                                <div className="h-4 bg-gray-200 rounded mb-2" />
                                <div className="h-4 bg-gray-200 rounded w-2/3" />
                            </div>
                        ))
                    ) : filteredRooms.length === 0 ? (
                        <div className="col-span-full text-center py-12">
                            <span className="text-6xl">🏨</span>
                            <p className="text-gray-500 mt-4">No rooms found</p>
                        </div>
                    ) : (
                        filteredRooms.map(room => {
                            const sColor = statusColors[room.status] || statusColors['Vacant'];
                            const hColor = housekeepingColors[room.housekeeping_status] || housekeepingColors['Clean'];
                            return (
                                <div
                                    key={room.room_id}
                                    onContextMenu={(e) => handleContextMenu(e, room)}
                                    className={`relative bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group ${room.status === 'Occupied' ? 'border-blue-300' : room.status === 'Reserved' ? 'border-purple-300' : room.status === 'Under Repair' ? 'border-orange-300' : room.status === 'Dirty' ? 'border-amber-300' : 'border-gray-100'}`}
                                >
                                    {/* Top Gradient Bar */}
                                    <div className={`h-2 bg-gradient-to-r ${sColor.gradient}`} />

                                    {/* Room Header */}
                                    <div className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-2xl font-bold text-gray-800">🚪 {room.room_number}</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, room); }}
                                                className="p-1.5 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            >⋮</button>
                                        </div>

                                        {/* Room Type & Floor */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">🏢 Floor {room.floor_number}</span>
                                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">{room.room_type_name || 'Standard'}</span>
                                        </div>

                                        {/* Bed Info */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-sm text-gray-600">🛏️ {room.bed_type} Bed × {room.bed_count}</span>
                                        </div>

                                        {/* Amenities */}
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {getAmenityIcons(room).map((icon, i) => (
                                                <span key={i} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center text-sm">{icon}</span>
                                            ))}
                                        </div>

                                        {/* Rate */}
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-lg font-bold text-green-600">Ksh {room.room_rate?.toLocaleString()}</span>
                                            <span className="text-xs text-gray-500">/night</span>
                                        </div>

                                        {/* Status Badges */}
                                        <div className="flex items-center gap-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${sColor.bg} ${sColor.text}`}>{room.status}</span>
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${hColor.bg} ${hColor.text}`}>{room.housekeeping_status}</span>
                                        </div>

                                        {/* Guest Info (if occupied) */}
                                        {room.status === 'Occupied' && room.current_guest_name && (
                                            <div className="mt-3 p-2 bg-blue-50 rounded-xl">
                                                <p className="text-xs text-blue-600 font-medium">👤 {room.current_guest_name}</p>
                                                {room.expected_checkout && <p className="text-xs text-blue-500">📅 Checkout: {new Date(room.expected_checkout).toLocaleDateString()}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Table View */}
            {viewMode === 'table' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Room No</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Type</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Floor</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Bed</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Amenities</th>
                                    <th className="px-4 py-4 text-right text-sm font-semibold">Rate</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Status</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Housekeeping</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold">Guest</th>
                                    <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr><td colSpan={10} className="px-4 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-blue-400/30 border-t-blue-500 rounded-full animate-spin" /><span className="text-gray-500">Loading rooms...</span></div></td></tr>
                                ) : filteredRooms.length === 0 ? (
                                    <tr><td colSpan={10} className="px-4 py-12 text-center"><span className="text-5xl">🏨</span><p className="text-gray-500 mt-2">No rooms found</p></td></tr>
                                ) : (
                                    filteredRooms.map(room => {
                                        const sColor = statusColors[room.status] || statusColors['Vacant'];
                                        const hColor = housekeepingColors[room.housekeeping_status] || housekeepingColors['Clean'];
                                        return (
                                            <tr key={room.room_id} className="border-t border-gray-50 hover:bg-blue-50/50 transition-colors">
                                                <td className="px-4 py-4"><span className="text-lg font-bold text-gray-800">🚪 {room.room_number}</span></td>
                                                <td className="px-4 py-4"><span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{room.room_type_name || 'Standard'}</span></td>
                                                <td className="px-4 py-4 text-center"><span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">Floor {room.floor_number}</span></td>
                                                <td className="px-4 py-4"><span className="text-sm text-gray-600">🛏️ {room.bed_type} × {room.bed_count}</span></td>
                                                <td className="px-4 py-4"><div className="flex gap-1">{getAmenityIcons(room).slice(0, 4).map((icon, i) => <span key={i}>{icon}</span>)}</div></td>
                                                <td className="px-4 py-4 text-right font-bold text-green-600">Ksh {room.room_rate?.toLocaleString()}</td>
                                                <td className="px-4 py-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${sColor.bg} ${sColor.text}`}>{room.status}</span></td>
                                                <td className="px-4 py-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${hColor.bg} ${hColor.text}`}>{room.housekeeping_status}</span></td>
                                                <td className="px-4 py-4">{room.current_guest_name && <span className="text-sm text-blue-600">👤 {room.current_guest_name}</span>}</td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={(e) => handleContextMenu(e, room)} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl transition-all" title="Actions">⋮</button>
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
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 min-w-[200px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-2 border-b border-gray-100">
                        <p className="font-bold text-gray-800">🚪 Room {contextMenu.room.room_number}</p>
                        <p className="text-xs text-gray-500">{contextMenu.room.room_type_name}</p>
                    </div>
                    <div className="py-1">
                        {contextMenu.room.status === 'Vacant' && (
                            <>
                                <button onClick={() => { setSelectedRoom(contextMenu.room); setShowCheckinModal(true); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-blue-50 text-blue-600 flex items-center gap-2"><span>🔑</span> Check-In Guest</button>
                                <button onClick={() => updateRoomStatus(contextMenu.room, 'Reserved')} className="w-full px-4 py-2 text-left hover:bg-purple-50 text-purple-600 flex items-center gap-2"><span>📅</span> Make Reservation</button>
                            </>
                        )}
                        {contextMenu.room.status === 'Occupied' && (
                            <>
                                <button onClick={() => { setSelectedRoom(contextMenu.room); setShowCheckoutModal(true); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-green-50 text-green-600 flex items-center gap-2"><span>🚪</span> Check-Out Guest</button>
                            </>
                        )}
                        {contextMenu.room.status === 'Reserved' && (
                            <>
                                <button onClick={() => { setSelectedRoom(contextMenu.room); setShowCheckinModal(true); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-blue-50 text-blue-600 flex items-center gap-2"><span>🔑</span> Check-In Guest</button>
                                <button onClick={() => updateRoomStatus(contextMenu.room, 'Vacant')} className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2"><span>❌</span> Cancel Reservation</button>
                            </>
                        )}
                        <div className="border-t border-gray-100 my-1" />
                        <button onClick={() => updateRoomStatus(contextMenu.room, 'Vacant', 'Clean')} className="w-full px-4 py-2 text-left hover:bg-emerald-50 text-emerald-600 flex items-center gap-2"><span>✅</span> Make Vacant & Clean</button>
                        <button onClick={() => updateRoomStatus(contextMenu.room, contextMenu.room.status, 'Dirty')} className="w-full px-4 py-2 text-left hover:bg-amber-50 text-amber-600 flex items-center gap-2"><span>🧹</span> Mark as Dirty</button>
                        <button onClick={() => updateRoomStatus(contextMenu.room, 'Under Repair')} className="w-full px-4 py-2 text-left hover:bg-orange-50 text-orange-600 flex items-center gap-2"><span>🔧</span> Under Repair</button>
                        <button onClick={() => updateRoomStatus(contextMenu.room, 'Blocked')} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-600 flex items-center gap-2"><span>🚫</span> Block Room</button>
                        <div className="border-t border-gray-100 my-1" />
                        <button onClick={() => { setSelectedRoom(contextMenu.room); setShowEditModal(true); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-blue-50 text-blue-600 flex items-center gap-2"><span>✏️</span> Edit Room Details</button>
                    </div>
                </div>
            )}

            {/* Check-In Modal */}
            {showCheckinModal && selectedRoom && (
                <CheckInModal room={selectedRoom} onClose={() => { setShowCheckinModal(false); setSelectedRoom(null); }} onSuccess={() => { setShowCheckinModal(false); setSelectedRoom(null); loadRooms(); }} />
            )}

            {/* Check-Out Modal */}
            {showCheckoutModal && selectedRoom && (
                <CheckOutModal room={selectedRoom} onClose={() => { setShowCheckoutModal(false); setSelectedRoom(null); }} onSuccess={() => { setShowCheckoutModal(false); setSelectedRoom(null); loadRooms(); }} />
            )}
        </div>
    );
}

// Check-In Modal Component
function CheckInModal({ room, onClose, onSuccess }: { room: Room; onClose: () => void; onSuccess: () => void }) {
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestIdType, setGuestIdType] = useState('National ID');
    const [guestIdNumber, setGuestIdNumber] = useState('');
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [nights, setNights] = useState(1);
    const [checkoutDate, setCheckoutDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    const [isSaving, setIsSaving] = useState(false);

    const handleCheckIn = async () => {
        if (!guestName.trim()) { toast.error('Guest name is required'); return; }
        setIsSaving(true);
        try {
            // Generate booking number
            const bookingNo = `BK-${Date.now().toString().slice(-8)}`;

            // Create booking
            const { error: bookingError } = await supabase.from('hotel_bookings').insert({
                booking_no: bookingNo,
                guest_name: guestName,
                guest_phone: guestPhone,
                guest_id_type: guestIdType,
                guest_id_number: guestIdNumber,
                room_id: room.room_id,
                room_number: room.room_number,
                room_type_name: room.room_type_name,
                floor_number: room.floor_number,
                check_in_date: new Date().toISOString().split('T')[0],
                check_in_time: new Date().toTimeString().split(' ')[0],
                expected_checkout: checkoutDate,
                nights,
                adults,
                children,
                room_rate: room.room_rate,
                room_charges: room.room_rate * nights,
                total_amount: room.room_rate * nights,
                balance: room.room_rate * nights,
                status: 'Checked-In',
            });
            if (bookingError) throw bookingError;

            // Update room status
            const { error: roomError } = await supabase.from('hotel_rooms').update({
                status: 'Occupied',
                current_guest_name: guestName,
                check_in_date: new Date().toISOString().split('T')[0],
                expected_checkout: checkoutDate,
                updated_at: new Date().toISOString(),
            }).eq('room_id', room.room_id);
            if (roomError) throw roomError;

            toast.success(`✅ Guest ${guestName} checked into Room ${room.room_number}`);
            onSuccess();
        } catch (err) {
            console.error('Check-in error:', err);
            toast.error('Failed to check-in guest');
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 text-white">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2">🔑 Check-In to Room {room.room_number}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">✕</button>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">👤 Guest Name *</label>
                            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Full Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Phone</label>
                            <input type="text" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="0712345678" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">🪪 ID Type</label>
                            <select value={guestIdType} onChange={(e) => setGuestIdType(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500">
                                <option>National ID</option>
                                <option>Passport</option>
                                <option>Driving License</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">🔢 ID Number</label>
                            <input type="text" value={guestIdNumber} onChange={(e) => setGuestIdNumber(e.target.value)} placeholder="ID Number" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">📅 Checkout Date</label>
                            <input type="date" value={checkoutDate} onChange={(e) => { setCheckoutDate(e.target.value); const d = new Date(e.target.value); const t = new Date(); setNights(Math.ceil((d.getTime() - t.getTime()) / 86400000)); }} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">🌙 Nights</label>
                            <input type="number" value={nights} onChange={(e) => setNights(parseInt(e.target.value) || 1)} min={1} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">👥 Adults</label>
                            <input type="number" value={adults} onChange={(e) => setAdults(parseInt(e.target.value) || 1)} min={1} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">👶 Children</label>
                            <input type="number" value={children} onChange={(e) => setChildren(parseInt(e.target.value) || 0)} min={0} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                        </div>
                    </div>
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Room Rate:</span>
                            <span className="font-bold text-gray-800">Ksh {room.room_rate?.toLocaleString()}/night</span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-gray-600">Nights:</span>
                            <span className="font-bold text-gray-800">{nights}</span>
                        </div>
                        <div className="border-t border-blue-200 mt-3 pt-3 flex justify-between items-center">
                            <span className="text-lg font-bold text-gray-800">Total:</span>
                            <span className="text-xl font-bold text-blue-600">Ksh {(room.room_rate * nights).toLocaleString()}</span>
                        </div>
                    </div>
                    <button onClick={handleCheckIn} disabled={isSaving} className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50">
                        {isSaving ? '⏳ Processing...' : '🔑 Check-In Guest'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Check-Out Modal Component
function CheckOutModal({ room, onClose, onSuccess }: { room: Room; onClose: () => void; onSuccess: () => void }) {
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [mpesaCode, setMpesaCode] = useState('');
    const [amountPaid, setAmountPaid] = useState(0);
    const [totalCharges] = useState(room.room_rate || 0);
    const [isSaving, setIsSaving] = useState(false);

    const handleCheckOut = async () => {
        setIsSaving(true);
        try {
            // Update room status
            const { error } = await supabase.from('hotel_rooms').update({
                status: 'Vacant',
                housekeeping_status: 'Dirty',
                current_guest_name: null,
                current_booking_id: null,
                check_in_date: null,
                expected_checkout: null,
                updated_at: new Date().toISOString(),
            }).eq('room_id', room.room_id);
            if (error) throw error;
            toast.success(`✅ Room ${room.room_number} checked out successfully`);
            onSuccess();
        } catch (err) {
            console.error('Check-out error:', err);
            toast.error('Failed to check-out');
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 text-white">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2">🚪 Check-Out Room {room.room_number}</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">✕</button>
                    </div>
                    {room.current_guest_name && <p className="text-green-100 mt-1">👤 Guest: {room.current_guest_name}</p>}
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-600">Room Charges:</span>
                            <span className="font-bold text-gray-800">Ksh {totalCharges.toLocaleString()}</span>
                        </div>
                        <div className="border-t border-green-200 mt-3 pt-3 flex justify-between items-center">
                            <span className="text-lg font-bold text-gray-800">Total Due:</span>
                            <span className="text-2xl font-bold text-green-600">Ksh {totalCharges.toLocaleString()}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">💳 Payment Method</label>
                        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500">
                            <option>Cash</option>
                            <option>M-Pesa</option>
                            <option>Card</option>
                            <option>Bank Transfer</option>
                        </select>
                    </div>
                    {paymentMethod === 'M-Pesa' && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">📱 M-Pesa Code</label>
                            <input type="text" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} placeholder="e.g. QKL12345XY" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">💰 Amount Paid</label>
                        <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                    </div>
                    <button onClick={handleCheckOut} disabled={isSaving} className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50">
                        {isSaving ? '⏳ Processing...' : '🚪 Complete Check-Out'}
                    </button>
                </div>
            </div>
        </div>
    );
}
