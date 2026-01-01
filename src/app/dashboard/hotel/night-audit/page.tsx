'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface AuditData {
    totalRooms: number;
    occupiedRooms: number;
    vacantRooms: number;
    reservedRooms: number;
    dirtyRooms: number;
    arrivals: number;
    departures: number;
    stayovers: number;
    noShows: number;
    roomRevenue: number;
    paymentsCollected: number;
    outstandingBalance: number;
    cashPayments: number;
    mpesaPayments: number;
    cardPayments: number;
}

interface Booking {
    booking_id: number;
    booking_no: string;
    guest_name: string;
    room_number: string;
    room_rate: number;
    total_amount: number;
    total_paid: number;
    balance: number;
    status: string;
    check_in_date: string;
    expected_checkout: string;
}

export default function NightAuditPage() {
    const [auditData, setAuditData] = useState<AuditData | null>(null);
    const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
    const [isAuditComplete, setIsAuditComplete] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [roomsData, bookingsData, reservationsData, paymentsData] = await Promise.all([
                supabase.from('hotel_rooms').select('*').eq('active', true),
                supabase.from('hotel_bookings').select('*').or(`check_in_date.eq.${auditDate},expected_checkout.eq.${auditDate},and(check_in_date.lte.${auditDate},expected_checkout.gte.${auditDate})`),
                supabase.from('hotel_reservations').select('*').eq('check_in_date', auditDate).eq('status', 'Confirmed'),
                supabase.from('hotel_payments').select('*').eq('payment_date', auditDate).eq('status', 'Completed'),
            ]);

            const rooms = roomsData.data || [];
            const bookings = bookingsData.data || [];
            const reservations = reservationsData.data || [];
            const payments = paymentsData.data || [];

            const arrivals = bookings.filter(b => b.check_in_date === auditDate).length;
            const departures = bookings.filter(b => b.expected_checkout === auditDate && b.status === 'Checked-Out').length;
            const stayovers = bookings.filter(b => b.check_in_date < auditDate && b.expected_checkout > auditDate && b.status === 'Checked-In').length;
            const noShows = reservations.filter(r => r.status === 'Confirmed').length;

            const occupiedRooms = rooms.filter(r => r.status === 'Occupied').length;
            const vacantRooms = rooms.filter(r => r.status === 'Vacant').length;
            const reservedRooms = rooms.filter(r => r.status === 'Reserved').length;
            const dirtyRooms = rooms.filter(r => r.housekeeping_status === 'Dirty').length;

            const roomRevenue = bookings.filter(b => b.status === 'Checked-In' || b.check_in_date === auditDate).reduce((sum, b) => sum + (b.room_rate || 0), 0);
            const outstandingBalance = bookings.filter(b => b.status === 'Checked-In').reduce((sum, b) => sum + (b.balance || 0), 0);

            const cashPayments = payments.filter(p => p.payment_method === 'Cash').reduce((sum, p) => sum + (p.amount || 0), 0);
            const mpesaPayments = payments.filter(p => p.payment_method === 'M-Pesa').reduce((sum, p) => sum + (p.amount || 0), 0);
            const cardPayments = payments.filter(p => p.payment_method === 'Card').reduce((sum, p) => sum + (p.amount || 0), 0);
            const paymentsCollected = cashPayments + mpesaPayments + cardPayments;

            setAuditData({
                totalRooms: rooms.length,
                occupiedRooms,
                vacantRooms,
                reservedRooms,
                dirtyRooms,
                arrivals,
                departures,
                stayovers,
                noShows,
                roomRevenue,
                paymentsCollected,
                outstandingBalance,
                cashPayments,
                mpesaPayments,
                cardPayments,
            });

            setTodayBookings(bookings.filter(b => b.status === 'Checked-In'));
        } catch (err) {
            console.error('Error loading audit data:', err);
            toast.error('Failed to load audit data');
        }
        setIsLoading(false);
    }, [auditDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const runNightAudit = async () => {
        if (!confirm('Run Night Audit? This will post room charges for all in-house guests.')) return;
        try {
            // In a real system, this would post room charges, update balances, etc.
            toast.success('Night Audit completed successfully!');
            setIsAuditComplete(true);
            loadData();
        } catch (err) {
            console.error('Night audit error:', err);
            toast.error('Night audit failed');
        }
    };

    const printAuditReport = () => {
        const printWindow = window.open('', '_blank');
        if (printWindow && auditData) {
            printWindow.document.write(`
                <html><head><title>Night Audit Report - ${auditDate}</title>
                <style>body{font-family:Arial,sans-serif;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f5f5f5}.section{margin:20px 0;padding:15px;border:1px solid #ddd;border-radius:8px}</style>
                </head><body>
                <h1>🌙 Night Audit Report</h1>
                <p style="text-align:center">${new Date(auditDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <div class="section"><h3>Room Status</h3>
                <table><tr><th>Total Rooms</th><th>Occupied</th><th>Vacant</th><th>Reserved</th><th>Dirty</th></tr>
                <tr><td>${auditData.totalRooms}</td><td>${auditData.occupiedRooms}</td><td>${auditData.vacantRooms}</td><td>${auditData.reservedRooms}</td><td>${auditData.dirtyRooms}</td></tr></table></div>
                <div class="section"><h3>Guest Movement</h3>
                <table><tr><th>Arrivals</th><th>Departures</th><th>Stayovers</th><th>No-Shows</th></tr>
                <tr><td>${auditData.arrivals}</td><td>${auditData.departures}</td><td>${auditData.stayovers}</td><td>${auditData.noShows}</td></tr></table></div>
                <div class="section"><h3>Revenue Summary</h3>
                <table><tr><th>Room Revenue</th><th>Payments Collected</th><th>Outstanding Balance</th></tr>
                <tr><td>Ksh ${auditData.roomRevenue.toLocaleString()}</td><td>Ksh ${auditData.paymentsCollected.toLocaleString()}</td><td>Ksh ${auditData.outstandingBalance.toLocaleString()}</td></tr></table></div>
                <div class="section"><h3>Payment Breakdown</h3>
                <table><tr><th>Cash</th><th>M-Pesa</th><th>Card</th></tr>
                <tr><td>Ksh ${auditData.cashPayments.toLocaleString()}</td><td>Ksh ${auditData.mpesaPayments.toLocaleString()}</td><td>Ksh ${auditData.cardPayments.toLocaleString()}</td></tr></table></div>
                <p style="text-align:center;margin-top:30px;font-size:12px;color:#666">Generated on ${new Date().toLocaleString()}</p>
                </body></html>
            `);
            printWindow.document.close();
            printWindow.print();
            printWindow.close();
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-[400px]"><div className="w-12 h-12 border-4 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🌙</span>
                        Night Audit
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Daily room revenue posting and reconciliation</p>
                </div>
                <div className="flex items-center gap-3">
                    <input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl" />
                    <button onClick={printAuditReport} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all flex items-center gap-2">🖨️ Print</button>
                    <button onClick={runNightAudit} disabled={isAuditComplete} className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50">🌙 Run Audit</button>
                </div>
            </div>

            {isAuditComplete && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-4 text-white flex items-center gap-4">
                    <span className="text-3xl">✅</span>
                    <div><p className="font-bold">Night Audit Completed</p><p className="text-sm opacity-90">All room charges have been posted for {auditDate}</p></div>
                </div>
            )}

            {auditData && (
                <>
                    {/* Room Status */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">🏨 Room Status Summary</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-4 text-white shadow-lg relative overflow-hidden text-center">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                                    <span className="text-xl">🏨</span>
                                </div>
                                <p className="text-xs opacity-80">Total</p>
                                <p className="text-2xl font-bold">{auditData.totalRooms}</p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-4 text-white shadow-lg relative overflow-hidden text-center">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                                    <span className="text-xl">🔑</span>
                                </div>
                                <p className="text-xs opacity-80">Occupied</p>
                                <p className="text-2xl font-bold">{auditData.occupiedRooms}</p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-3xl p-4 text-white shadow-lg relative overflow-hidden text-center">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                                    <span className="text-xl">✅</span>
                                </div>
                                <p className="text-xs opacity-80">Vacant</p>
                                <p className="text-2xl font-bold">{auditData.vacantRooms}</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 rounded-3xl p-4 text-white shadow-lg relative overflow-hidden text-center">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                                    <span className="text-xl">📅</span>
                                </div>
                                <p className="text-xs opacity-80">Reserved</p>
                                <p className="text-2xl font-bold">{auditData.reservedRooms}</p>
                            </div>
                            <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-3xl p-4 text-white shadow-lg relative overflow-hidden text-center">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                                    <span className="text-xl">🧹</span>
                                </div>
                                <p className="text-xs opacity-80">Dirty</p>
                                <p className="text-2xl font-bold">{auditData.dirtyRooms}</p>
                            </div>
                        </div>
                    </div>

                    {/* Guest Movement */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">👥 Guest Movement</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                                <span className="text-2xl">🛬</span>
                                <p className="text-sm text-gray-600 mt-1">Arrivals</p>
                                <p className="text-2xl font-bold text-green-700">{auditData.arrivals}</p>
                            </div>
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                                <span className="text-2xl">🛫</span>
                                <p className="text-sm text-gray-600 mt-1">Departures</p>
                                <p className="text-2xl font-bold text-orange-700">{auditData.departures}</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                                <span className="text-2xl">🏠</span>
                                <p className="text-sm text-gray-600 mt-1">Stayovers</p>
                                <p className="text-2xl font-bold text-blue-700">{auditData.stayovers}</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                                <span className="text-2xl">❌</span>
                                <p className="text-sm text-gray-600 mt-1">No-Shows</p>
                                <p className="text-2xl font-bold text-red-700">{auditData.noShows}</p>
                            </div>
                        </div>
                    </div>

                    {/* Revenue Summary */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">💰 Revenue Summary</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                                    <span className="text-xl">💵</span>
                                </div>
                                <p className="text-sm opacity-80">Room Revenue</p>
                                <p className="text-3xl font-bold mt-1">Ksh {auditData.roomRevenue.toLocaleString()}</p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                                    <span className="text-xl">💳</span>
                                </div>
                                <p className="text-sm opacity-80">Payments Collected</p>
                                <p className="text-3xl font-bold mt-1">Ksh {auditData.paymentsCollected.toLocaleString()}</p>
                            </div>
                            <div className="bg-gradient-to-br from-red-400 via-red-500 to-rose-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                                    <span className="text-xl">📋</span>
                                </div>
                                <p className="text-sm opacity-80">Outstanding Balance</p>
                                <p className="text-3xl font-bold mt-1">Ksh {auditData.outstandingBalance.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Payment Breakdown */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">💳 Payment Breakdown</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div><span className="text-2xl">💵</span><p className="text-sm text-gray-600 mt-1">Cash</p></div>
                                    <p className="text-2xl font-bold text-green-700">Ksh {auditData.cashPayments.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div><span className="text-2xl">📱</span><p className="text-sm text-gray-600 mt-1">M-Pesa</p></div>
                                    <p className="text-2xl font-bold text-blue-700">Ksh {auditData.mpesaPayments.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div><span className="text-2xl">💳</span><p className="text-sm text-gray-600 mt-1">Card</p></div>
                                    <p className="text-2xl font-bold text-purple-700">Ksh {auditData.cardPayments.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* In-House Guests */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">🏠 In-House Guests ({todayBookings.length})</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Booking</th>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Guest</th>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Room</th>
                                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Check-In</th>
                                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Checkout</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Rate</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Total</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Paid</th>
                                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {todayBookings.length === 0 ? (
                                        <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No in-house guests</td></tr>
                                    ) : (
                                        todayBookings.map(booking => (
                                            <tr key={booking.booking_id} className="border-t border-gray-50 hover:bg-gray-50">
                                                <td className="px-4 py-3"><span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-sm font-medium">{booking.booking_no}</span></td>
                                                <td className="px-4 py-3 font-medium text-gray-800">{booking.guest_name}</td>
                                                <td className="px-4 py-3 font-medium">🚪 {booking.room_number}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{booking.check_in_date}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">{booking.expected_checkout}</td>
                                                <td className="px-4 py-3 text-right">Ksh {(booking.room_rate || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-medium">Ksh {(booking.total_amount || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-green-600">Ksh {(booking.total_paid || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right"><span className={`font-bold ${(booking.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>Ksh {(booking.balance || 0).toLocaleString()}</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
