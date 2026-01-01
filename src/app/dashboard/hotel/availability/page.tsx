'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Room {
    room_id: number;
    room_number: string;
    floor_number: number;
    room_type_name: string;
    bed_type: string;
    room_rate: number;
    status: string;
    housekeeping_status: string;
    current_guest_name: string;
    check_in_date: string;
    expected_checkout: string;
}

interface Reservation {
    reservation_id: number;
    room_id: number;
    room_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    status: string;
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    'Vacant': { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-700' },
    'Occupied': { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700' },
    'Reserved': { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700' },
    'Under Repair': { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700' },
    'Dirty': { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
    'Blocked': { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' },
};

export default function AvailabilityPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewDays, setViewDays] = useState(7);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + viewDays);
            const [roomData, resData] = await Promise.all([
                supabase.from('hotel_rooms').select('*').eq('active', true).order('room_number'),
                supabase.from('hotel_reservations').select('*').gte('check_out_date', startDate).lte('check_in_date', endDate.toISOString().split('T')[0]).in('status', ['Confirmed', 'Checked-In']),
            ]);
            setRooms(roomData.data || []);
            setReservations(resData.data || []);
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, [startDate, viewDays]);

    useEffect(() => { loadData(); }, [loadData]);

    const getDates = () => {
        const dates = [];
        for (let i = 0; i < viewDays; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            dates.push(date);
        }
        return dates;
    };

    const getRoomStatusForDate = (room: Room, date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        // Check if room is currently occupied
        if (room.status === 'Occupied' && room.check_in_date && room.expected_checkout) {
            if (dateStr >= room.check_in_date && dateStr <= room.expected_checkout) {
                return { status: 'Occupied', guest: room.current_guest_name };
            }
        }

        // Check reservations
        const reservation = reservations.find(r => r.room_id === room.room_id && dateStr >= r.check_in_date && dateStr < r.check_out_date);
        if (reservation) {
            return { status: reservation.status === 'Checked-In' ? 'Occupied' : 'Reserved', guest: reservation.guest_name };
        }

        // Check if blocked or under repair
        if (room.status === 'Blocked' || room.status === 'Under Repair') {
            return { status: room.status, guest: null };
        }

        // Check if dirty (only for today)
        if (dateStr === today && room.housekeeping_status === 'Dirty') {
            return { status: 'Dirty', guest: null };
        }

        return { status: 'Vacant', guest: null };
    };

    const dates = getDates();
    const floors = Array.from(new Set(rooms.map(r => r.floor_number))).sort();

    const stats = {
        total: rooms.length * viewDays,
        available: 0,
        occupied: 0,
        reserved: 0,
    };

    rooms.forEach(room => {
        dates.forEach(date => {
            const { status } = getRoomStatusForDate(room, date);
            if (status === 'Vacant') stats.available++;
            else if (status === 'Occupied') stats.occupied++;
            else if (status === 'Reserved') stats.reserved++;
        });
    });

    const occupancyRate = stats.total > 0 ? (((stats.occupied + stats.reserved) / stats.total) * 100).toFixed(1) : '0';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📊</span>
                        Room Availability
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">View room availability calendar</p>
                </div>
                <button onClick={loadData} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🔄 Refresh</button>
            </div>

            {/* Stats - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">✅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Available</p>
                    <p className="text-3xl font-bold mt-1">{stats.available}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
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
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📈</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Occupancy Rate</p>
                    <p className="text-3xl font-bold mt-1">{occupancyRate}%</p>
                </div>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="text-sm font-semibold text-gray-700">🎨 Legend:</span>
                    {Object.entries(statusColors).map(([status, colors]) => (
                        <div key={status} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded ${colors.bg} ${colors.border} border-2`} />
                            <span className="text-sm text-gray-600">{status}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 mr-2">📅 Start Date:</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 mr-2">📆 Days:</label>
                        <select value={viewDays} onChange={(e) => setViewDays(parseInt(e.target.value))} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                            <option value={7}>7 Days</option>
                            <option value={14}>14 Days</option>
                            <option value={30}>30 Days</option>
                        </select>
                    </div>
                    <button onClick={() => setStartDate(new Date().toISOString().split('T')[0])} className="px-4 py-2 bg-cyan-50 text-cyan-600 rounded-xl font-medium hover:bg-cyan-100">Today</button>
                </div>
            </div>

            {/* Availability Grid */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse min-w-max">
                        <thead>
                            <tr className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                                <th className="px-4 py-3 text-left sticky left-0 bg-gradient-to-r from-cyan-500 to-cyan-600 z-10">Room</th>
                                {dates.map(date => {
                                    const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                    return (
                                        <th key={date.toISOString()} className={`px-2 py-3 text-center min-w-[80px] ${isToday ? 'bg-yellow-500' : isWeekend ? 'bg-cyan-700' : ''}`}>
                                            <div className="text-xs font-medium">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                            <div className="text-sm font-bold">{date.getDate()}</div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={viewDays + 1} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-500 rounded-full animate-spin" />
                                        <span className="text-gray-500">Loading...</span>
                                    </div>
                                </td></tr>
                            ) : rooms.length === 0 ? (
                                <tr><td colSpan={viewDays + 1} className="px-4 py-12 text-center">
                                    <span className="text-5xl">🏨</span>
                                    <p className="text-gray-500 mt-2">No rooms found</p>
                                </td></tr>
                            ) : (
                                floors.map(floor => (
                                    <React.Fragment key={`floor-${floor}`}>
                                        <tr className="bg-gray-100">
                                            <td colSpan={viewDays + 1} className="px-4 py-2 text-sm font-bold text-gray-600 sticky left-0 bg-gray-100">
                                                🏢 Floor {floor}
                                            </td>
                                        </tr>
                                        {rooms.filter(r => r.floor_number === floor).map(room => (
                                            <tr key={room.room_id} className="border-t border-gray-100 hover:bg-gray-50">
                                                <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
                                                    <div className="font-semibold text-gray-800">🚪 {room.room_number}</div>
                                                    <div className="text-xs text-gray-500">{room.room_type_name}</div>
                                                </td>
                                                {dates.map(date => {
                                                    const { status, guest } = getRoomStatusForDate(room, date);
                                                    const colors = statusColors[status] || statusColors['Vacant'];
                                                    return (
                                                        <td key={date.toISOString()} className="px-1 py-1">
                                                            <div className={`p-2 rounded-lg ${colors.bg} ${colors.border} border text-center min-h-[40px] flex items-center justify-center`} title={guest || status}>
                                                                <span className={`text-xs font-medium ${colors.text} truncate max-w-[70px]`}>
                                                                    {guest ? guest.split(' ')[0] : status === 'Vacant' ? '✓' : status.charAt(0)}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
