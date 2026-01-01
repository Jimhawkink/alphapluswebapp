'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface RevenueData {
    room_number: string;
    room_type_name: string;
    total_bookings: number;
    total_nights: number;
    room_revenue: number;
    extra_revenue: number;
    total_revenue: number;
    avg_rate: number;
}

interface PaymentSummary {
    method: string;
    count: number;
    amount: number;
}

export default function RoomRevenuePage() {
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [paymentSummary, setPaymentSummary] = useState<PaymentSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [bookingsData, paymentsData, roomsData] = await Promise.all([
                supabase.from('hotel_bookings').select('*').gte('check_in_date', dateFrom).lte('check_in_date', dateTo),
                supabase.from('hotel_payments').select('*').gte('payment_date', dateFrom).lte('payment_date', dateTo).eq('status', 'Completed'),
                supabase.from('hotel_rooms').select('room_id, room_number, room_type_name').eq('active', true),
            ]);

            const bookings = bookingsData.data || [];
            const payments = paymentsData.data || [];
            const rooms = roomsData.data || [];

            // Aggregate revenue by room
            const roomRevenue: Record<string, RevenueData> = {};
            rooms.forEach(room => {
                roomRevenue[room.room_number] = {
                    room_number: room.room_number,
                    room_type_name: room.room_type_name,
                    total_bookings: 0,
                    total_nights: 0,
                    room_revenue: 0,
                    extra_revenue: 0,
                    total_revenue: 0,
                    avg_rate: 0,
                };
            });

            bookings.forEach(b => {
                const roomNum = b.room_number;
                if (roomRevenue[roomNum]) {
                    roomRevenue[roomNum].total_bookings++;
                    roomRevenue[roomNum].total_nights += b.nights || 1;
                    roomRevenue[roomNum].room_revenue += b.room_charges || 0;
                    roomRevenue[roomNum].extra_revenue += (b.restaurant_charges || 0) + (b.laundry_charges || 0) + (b.minibar_charges || 0) + (b.other_charges || 0);
                }
            });

            Object.values(roomRevenue).forEach(r => {
                r.total_revenue = r.room_revenue + r.extra_revenue;
                r.avg_rate = r.total_nights > 0 ? r.room_revenue / r.total_nights : 0;
            });

            setRevenueData(Object.values(roomRevenue).sort((a, b) => b.total_revenue - a.total_revenue));

            // Payment summary
            const paymentMethods: Record<string, { count: number; amount: number }> = {};
            payments.forEach(p => {
                const method = p.payment_method || 'Cash';
                if (!paymentMethods[method]) paymentMethods[method] = { count: 0, amount: 0 };
                paymentMethods[method].count++;
                paymentMethods[method].amount += p.amount || 0;
            });
            setPaymentSummary(Object.entries(paymentMethods).map(([method, data]) => ({ method, ...data })));
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load report');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadData(); }, [loadData]);

    const totalRevenue = revenueData.reduce((sum, r) => sum + r.total_revenue, 0);
    const totalRoomRevenue = revenueData.reduce((sum, r) => sum + r.room_revenue, 0);
    const totalExtraRevenue = revenueData.reduce((sum, r) => sum + r.extra_revenue, 0);
    const totalBookings = revenueData.reduce((sum, r) => sum + r.total_bookings, 0);
    const totalNights = revenueData.reduce((sum, r) => sum + r.total_nights, 0);
    const avgRevPerBooking = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    const exportToExcel = () => {
        const html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
            <head><meta charset="UTF-8"><style>th{background:#6366f1;color:white;padding:10px}td{padding:8px;border:1px solid #ddd}.total{background:#f0f9ff;font-weight:bold}</style></head>
            <body>
            <h2>Room Revenue Report</h2>
            <p>Period: ${dateFrom} to ${dateTo}</p>
            <table border="1">
            <tr><th>Room</th><th>Type</th><th>Bookings</th><th>Nights</th><th>Room Revenue</th><th>Extra Revenue</th><th>Total Revenue</th><th>Avg Rate</th></tr>
            ${revenueData.map(r => `<tr><td>${r.room_number}</td><td>${r.room_type_name}</td><td>${r.total_bookings}</td><td>${r.total_nights}</td><td>${r.room_revenue}</td><td>${r.extra_revenue}</td><td>${r.total_revenue}</td><td>${r.avg_rate.toFixed(0)}</td></tr>`).join('')}
            <tr class="total"><td colspan="4">TOTALS</td><td>${totalRoomRevenue}</td><td>${totalExtraRevenue}</td><td>${totalRevenue}</td><td>-</td></tr>
            </table>
            </body></html>
        `;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `room_revenue_${dateFrom}_to_${dateTo}.xls`;
        a.click();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">💰</span>
                        Room Revenue Report
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Revenue breakdown by room and payment method</p>
                </div>
                <button onClick={exportToExcel} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">📥 Export Excel</button>
            </div>

            {/* KPI Cards - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">💰</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Total Revenue</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🏨</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Room Revenue</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalRoomRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">➕</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Extra Revenue</p>
                    <p className="text-2xl font-bold mt-1">Ksh {totalExtraRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📋</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Bookings</p>
                    <p className="text-3xl font-bold mt-1">{totalBookings}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🌙</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Room Nights</p>
                    <p className="text-3xl font-bold mt-1">{totalNights}</p>
                </div>
                <div className="bg-gradient-to-br from-pink-400 via-pink-500 to-rose-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📊</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Avg/Booking</p>
                    <p className="text-2xl font-bold mt-1">Ksh {avgRevPerBooking.toFixed(0)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                    <div><label className="text-sm font-semibold text-gray-700 mr-2">From:</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" /></div>
                    <div><label className="text-sm font-semibold text-gray-700 mr-2">To:</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" /></div>
                    <button onClick={loadData} className="px-5 py-2 bg-green-50 text-green-600 rounded-xl font-medium hover:bg-green-100 flex items-center gap-2">🔄 Generate</button>
                </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">💳 Revenue by Payment Method</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {paymentSummary.map(p => (
                        <div key={p.method} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{p.method === 'Cash' ? '💵' : p.method === 'M-Pesa' ? '📱' : '💳'}</span>
                                <span className="font-semibold text-gray-800">{p.method}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">{p.count} transactions</span>
                                <span className="font-bold text-green-600">Ksh {p.amount.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Revenue by Room */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800">🚪 Revenue by Room</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                                <th className="px-4 py-3 text-left text-sm font-semibold">Room</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Bookings</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold">Nights</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Room Rev</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Extra Rev</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Total</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Avg Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={8} className="px-4 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-green-400/30 border-t-green-500 rounded-full animate-spin" /></div></td></tr>
                            ) : revenueData.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">No data found</td></tr>
                            ) : (
                                <>
                                    {revenueData.map((r, idx) => (
                                        <tr key={r.room_number} className={`border-t border-gray-50 hover:bg-green-50/50 ${idx < 3 && r.total_revenue > 0 ? 'bg-green-50' : ''}`}>
                                            <td className="px-4 py-3">
                                                <span className="font-semibold text-gray-800">🚪 {r.room_number}</span>
                                                {idx === 0 && r.total_revenue > 0 && <span className="ml-2 text-xs">🏆</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{r.room_type_name}</td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">{r.total_bookings}</span></td>
                                            <td className="px-4 py-3 text-center">{r.total_nights}</td>
                                            <td className="px-4 py-3 text-right font-medium">Ksh {r.room_revenue.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-purple-600">Ksh {r.extra_revenue.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">Ksh {r.total_revenue.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-gray-600">Ksh {r.avg_rate.toFixed(0)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gradient-to-r from-green-100 to-emerald-100 font-bold">
                                        <td className="px-4 py-4" colSpan={2}>TOTALS</td>
                                        <td className="px-4 py-4 text-center">{totalBookings}</td>
                                        <td className="px-4 py-4 text-center">{totalNights}</td>
                                        <td className="px-4 py-4 text-right">Ksh {totalRoomRevenue.toLocaleString()}</td>
                                        <td className="px-4 py-4 text-right text-purple-700">Ksh {totalExtraRevenue.toLocaleString()}</td>
                                        <td className="px-4 py-4 text-right text-green-700">Ksh {totalRevenue.toLocaleString()}</td>
                                        <td className="px-4 py-4 text-right">-</td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
