'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface OccupancyData {
    date: string;
    totalRooms: number;
    occupied: number;
    vacant: number;
    reserved: number;
    occupancyRate: number;
    revenue: number;
}

interface RoomTypeStats {
    typeName: string;
    total: number;
    occupied: number;
    rate: number;
    revenue: number;
}

export default function OccupancyReportPage() {
    const [occupancyData, setOccupancyData] = useState<OccupancyData[]>([]);
    const [roomTypeStats, setRoomTypeStats] = useState<RoomTypeStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [roomsData, bookingsData, reservationsData] = await Promise.all([
                supabase.from('hotel_rooms').select('room_id, room_type_name, room_rate').eq('active', true),
                supabase.from('hotel_bookings').select('*').gte('check_in_date', dateFrom).lte('check_in_date', dateTo),
                supabase.from('hotel_reservations').select('*').eq('status', 'Confirmed').gte('check_in_date', dateFrom).lte('check_in_date', dateTo),
            ]);

            const rooms = roomsData.data || [];
            const bookings = bookingsData.data || [];
            const reservations = reservationsData.data || [];
            const totalRooms = rooms.length;

            // Generate daily occupancy data
            const dailyData: OccupancyData[] = [];
            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                const dayBookings = bookings.filter(b => b.check_in_date <= dateStr && b.expected_checkout >= dateStr && b.status === 'Checked-In');
                const dayReservations = reservations.filter(r => r.check_in_date <= dateStr && r.check_out_date > dateStr && r.status === 'Confirmed');
                const occupied = dayBookings.length;
                const reserved = dayReservations.length;
                const vacant = totalRooms - occupied - reserved;
                const revenue = dayBookings.reduce((sum, b) => sum + (b.room_rate || 0), 0);
                dailyData.push({
                    date: dateStr,
                    totalRooms,
                    occupied,
                    vacant: Math.max(0, vacant),
                    reserved,
                    occupancyRate: totalRooms > 0 ? (occupied / totalRooms) * 100 : 0,
                    revenue,
                });
            }
            setOccupancyData(dailyData);

            // Room type stats
            const typeGroups: Record<string, { total: number; occupied: number; revenue: number }> = {};
            rooms.forEach(room => {
                const typeName = room.room_type_name || 'Unknown';
                if (!typeGroups[typeName]) typeGroups[typeName] = { total: 0, occupied: 0, revenue: 0 };
                typeGroups[typeName].total++;
            });
            bookings.forEach(b => {
                const typeName = b.room_type_name || 'Unknown';
                if (typeGroups[typeName]) {
                    typeGroups[typeName].occupied++;
                    typeGroups[typeName].revenue += b.room_charges || 0;
                }
            });
            const typeStats = Object.entries(typeGroups).map(([typeName, data]) => ({
                typeName,
                total: data.total,
                occupied: data.occupied,
                rate: data.total > 0 ? (data.occupied / data.total) * 100 : 0,
                revenue: data.revenue,
            }));
            setRoomTypeStats(typeStats);
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load report');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadData(); }, [loadData]);

    const avgOccupancy = occupancyData.length > 0 ? occupancyData.reduce((sum, d) => sum + d.occupancyRate, 0) / occupancyData.length : 0;
    const totalRevenue = occupancyData.reduce((sum, d) => sum + d.revenue, 0);
    const totalRoomNights = occupancyData.reduce((sum, d) => sum + d.occupied, 0);
    const avgDailyRate = totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0;
    const revPAR = occupancyData.length > 0 && occupancyData[0]?.totalRooms > 0 ? totalRevenue / (occupancyData.length * occupancyData[0].totalRooms) : 0;

    const exportReport = () => {
        const headers = ['Date', 'Total Rooms', 'Occupied', 'Vacant', 'Reserved', 'Occupancy %', 'Revenue'];
        const rows = occupancyData.map(d => [d.date, d.totalRooms, d.occupied, d.vacant, d.reserved, d.occupancyRate.toFixed(1), d.revenue]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `occupancy_report_${dateFrom}_to_${dateTo}.csv`;
        a.click();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📈</span>
                        Occupancy Report
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Analyze room occupancy trends</p>
                </div>
                <button onClick={exportReport} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">📥 Export CSV</button>
            </div>

            {/* KPI Cards - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📊</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Avg Occupancy</p>
                    <p className="text-3xl font-bold mt-1">{avgOccupancy.toFixed(1)}%</p>
                </div>
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">💰</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Total Revenue</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🌙</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Room Nights</p>
                    <p className="text-3xl font-bold mt-1">{totalRoomNights}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">💵</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">ADR</p>
                    <p className="text-2xl font-bold mt-1">Ksh {avgDailyRate.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📈</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">RevPAR</p>
                    <p className="text-2xl font-bold mt-1">Ksh {revPAR.toFixed(0)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                    <div><label className="text-sm font-semibold text-gray-700 mr-2">From:</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" /></div>
                    <div><label className="text-sm font-semibold text-gray-700 mr-2">To:</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" /></div>
                    <button onClick={loadData} className="px-5 py-2 bg-purple-50 text-purple-600 rounded-xl font-medium hover:bg-purple-100 flex items-center gap-2">🔄 Generate Report</button>
                </div>
            </div>

            {/* Room Type Stats */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">🏨 Occupancy by Room Type</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {roomTypeStats.map(type => (
                        <div key={type.typeName} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="font-semibold text-gray-800">🛏️ {type.typeName}</span>
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">{type.total} rooms</span>
                            </div>
                            <div className="mb-2">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-600">Occupancy</span>
                                    <span className="font-semibold">{type.rate.toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all" style={{ width: `${type.rate}%` }} />
                                </div>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Revenue</span>
                                <span className="font-bold text-green-600">Ksh {type.revenue.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Daily Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800">📅 Daily Occupancy</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
                                <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Total</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Occupied</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Vacant</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Reserved</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Occupancy %</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-4 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-purple-400/30 border-t-purple-500 rounded-full animate-spin" /><span className="text-gray-500">Loading...</span></div></td></tr>
                            ) : occupancyData.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-12 text-center"><span className="text-5xl">📊</span><p className="text-gray-500 mt-2">No data found</p></td></tr>
                            ) : (
                                occupancyData.slice(0, 31).map((data, idx) => {
                                    const isWeekend = [0, 6].includes(new Date(data.date).getDay());
                                    return (
                                        <tr key={data.date} className={`border-t border-gray-50 hover:bg-purple-50/50 transition-colors ${isWeekend ? 'bg-gray-50' : ''}`}>
                                            <td className="px-4 py-3">
                                                <span className="font-medium text-gray-800">{new Date(data.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">{data.totalRooms}</td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">{data.occupied}</span></td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium">{data.vacant}</span></td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">{data.reserved}</span></td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${data.occupancyRate >= 80 ? 'bg-green-500' : data.occupancyRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${data.occupancyRate}%` }} />
                                                    </div>
                                                    <span className="text-sm font-medium">{data.occupancyRate.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">Ksh {data.revenue.toLocaleString()}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
