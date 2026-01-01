'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Booking {
    booking_id: number;
    booking_no: string;
    guest_name: string;
    guest_phone: string;
    room_id: number;
    room_number: string;
    room_type_name: string;
    check_in_date: string;
    check_in_time: string;
    expected_checkout: string;
    nights: number;
    room_rate: number;
    room_charges: number;
    extra_charges: number;
    restaurant_charges: number;
    laundry_charges: number;
    minibar_charges: number;
    discount_amount: number;
    total_amount: number;
    total_paid: number;
    balance: number;
    payment_status: string;
    status: string;
}

export default function CheckOutPage() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastCheckout, setLastCheckout] = useState<Booking | null>(null);

    // Payment form
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [mpesaCode, setMpesaCode] = useState('');
    const [extraCharges, setExtraCharges] = useState({ restaurant: 0, laundry: 0, minibar: 0, other: 0 });
    const [discount, setDiscount] = useState(0);
    const receiptRef = useRef<HTMLDivElement>(null);

    const loadBookings = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('hotel_bookings').select('*').eq('status', 'Checked-In').order('check_in_date', { ascending: false });
            if (error) throw error;
            setBookings(data || []);
        } catch (err) {
            console.error('Error loading bookings:', err);
            toast.error('Failed to load bookings');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadBookings(); }, [loadBookings]);

    const openCheckoutModal = (booking: Booking) => {
        setSelectedBooking(booking);
        setPaymentAmount(booking.balance || 0);
        setExtraCharges({ restaurant: booking.restaurant_charges || 0, laundry: booking.laundry_charges || 0, minibar: booking.minibar_charges || 0, other: 0 });
        setDiscount(booking.discount_amount || 0);
        setPaymentMethod('Cash');
        setMpesaCode('');
        setShowModal(true);
    };

    const calculateTotal = () => {
        if (!selectedBooking) return 0;
        const roomCharges = selectedBooking.room_charges || 0;
        const extras = extraCharges.restaurant + extraCharges.laundry + extraCharges.minibar + extraCharges.other;
        return roomCharges + extras - discount;
    };

    const calculateBalance = () => {
        if (!selectedBooking) return 0;
        const total = calculateTotal();
        const paid = (selectedBooking.total_paid || 0) + paymentAmount;
        return total - paid;
    };

    const handleCheckout = async () => {
        if (!selectedBooking) return;
        const finalBalance = calculateBalance();
        if (finalBalance > 0 && paymentAmount < finalBalance) {
            if (!confirm(`Guest still owes Ksh ${finalBalance.toLocaleString()}. Proceed anyway?`)) return;
        }
        setIsSaving(true);
        try {
            const total = calculateTotal();
            const totalPaid = (selectedBooking.total_paid || 0) + paymentAmount;

            // Create payment if amount > 0
            if (paymentAmount > 0) {
                const { error: payError } = await supabase.from('hotel_payments').insert({
                    payment_no: `PAY-${Date.now().toString().slice(-8)}`,
                    booking_id: selectedBooking.booking_id,
                    booking_no: selectedBooking.booking_no,
                    guest_name: selectedBooking.guest_name,
                    room_number: selectedBooking.room_number,
                    amount: paymentAmount,
                    payment_method: paymentMethod,
                    mpesa_code: paymentMethod === 'M-Pesa' ? mpesaCode : null,
                    payment_type: 'Checkout Payment',
                    status: 'Completed',
                });
                if (payError) throw payError;
            }

            // Update booking
            const { error: bookError } = await supabase.from('hotel_bookings').update({
                extra_charges: extraCharges.restaurant + extraCharges.laundry + extraCharges.minibar + extraCharges.other,
                restaurant_charges: extraCharges.restaurant,
                laundry_charges: extraCharges.laundry,
                minibar_charges: extraCharges.minibar,
                other_charges: extraCharges.other,
                discount_amount: discount,
                total_amount: total,
                total_paid: totalPaid,
                balance: total - totalPaid,
                payment_status: totalPaid >= total ? 'Paid' : 'Partial',
                status: 'Checked-Out',
                check_out_date: new Date().toISOString().split('T')[0],
                check_out_time: new Date().toTimeString().split(' ')[0],
                check_out_datetime: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('booking_id', selectedBooking.booking_id);
            if (bookError) throw bookError;

            // Update room
            const { error: roomError } = await supabase.from('hotel_rooms').update({
                status: 'Vacant',
                housekeeping_status: 'Dirty',
                current_guest_name: null,
                current_booking_id: null,
                check_in_date: null,
                expected_checkout: null,
                updated_at: new Date().toISOString(),
            }).eq('room_id', selectedBooking.room_id);
            if (roomError) throw roomError;

            setLastCheckout({ ...selectedBooking, total_amount: total, total_paid: totalPaid, balance: total - totalPaid });
            toast.success(`✅ Room ${selectedBooking.room_number} checked out`);
            setShowModal(false);
            setShowReceipt(true);
            loadBookings();
        } catch (err) {
            console.error('Checkout error:', err);
            toast.error('Failed to checkout');
        }
        setIsSaving(false);
    };

    const printReceipt = () => {
        if (receiptRef.current) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                const isPaid = (lastCheckout?.total_paid || 0) >= (lastCheckout?.total_amount || 0);
                printWindow.document.write(`<html><head><title>Checkout Receipt</title><style>body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}h2{text-align:center;margin:0}hr{border:1px dashed #000}.center{text-align:center}.row{display:flex;justify-content:space-between}.bold{font-weight:bold}.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:60px;opacity:0.1;z-index:-1}</style></head><body><div class="watermark">${isPaid ? 'PAID' : 'NOT PAID'}</div>${receiptRef.current.innerHTML}</body></html>`);
                printWindow.document.close();
                printWindow.print();
                printWindow.close();
            }
        }
    };

    const filteredBookings = bookings.filter(b => (b.booking_no || '').toLowerCase().includes(searchQuery.toLowerCase()) || (b.guest_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (b.room_number || '').includes(searchQuery));

    const todayCheckouts = bookings.filter(b => b.expected_checkout === new Date().toISOString().split('T')[0]);
    const overdueCheckouts = bookings.filter(b => b.expected_checkout && new Date(b.expected_checkout) < new Date(new Date().toISOString().split('T')[0]));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🚪</span>
                        Guest Check-Out
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Process guest departures and settle bills</p>
                </div>
                <button onClick={loadBookings} className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🔄 Refresh</button>
            </div>

            {/* Stats - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🏨</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Occupied Rooms</p>
                    <p className="text-3xl font-bold mt-1">{bookings.length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Checkout Today</p>
                    <p className="text-3xl font-bold mt-1">{todayCheckouts.length}</p>
                </div>
                <div className="bg-gradient-to-br from-red-400 via-red-500 to-rose-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">⚠️</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Overdue</p>
                    <p className="text-3xl font-bold mt-1">{overdueCheckouts.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">💰</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Outstanding</p>
                    <p className="text-3xl font-bold mt-1">Ksh {bookings.reduce((sum, b) => sum + (b.balance || 0), 0).toLocaleString()}</p>
                </div>
            </div>

            {/* Alerts */}
            {overdueCheckouts.length > 0 && (
                <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl p-4 text-white flex items-center gap-4">
                    <span className="text-3xl">⚠️</span>
                    <div>
                        <p className="font-bold">Overdue Checkouts!</p>
                        <p className="text-sm opacity-90">{overdueCheckouts.length} guests have exceeded their checkout date</p>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="relative">
                    <input type="text" placeholder="🔍 Search by booking, guest, or room..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                </div>
            </div>

            {/* Bookings Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Booking</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Guest</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Room</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Check-In</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Expected Out</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Total</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Paid</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold">Balance</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={9} className="px-4 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-green-400/30 border-t-green-500 rounded-full animate-spin" /><span className="text-gray-500">Loading...</span></div></td></tr>
                            ) : filteredBookings.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-12 text-center"><span className="text-5xl">🚪</span><p className="text-gray-500 mt-2">No active bookings</p></td></tr>
                            ) : (
                                filteredBookings.map(booking => {
                                    const isOverdue = booking.expected_checkout && new Date(booking.expected_checkout) < new Date(new Date().toISOString().split('T')[0]);
                                    const isToday = booking.expected_checkout === new Date().toISOString().split('T')[0];
                                    return (
                                        <tr key={booking.booking_id} className={`border-t border-gray-50 hover:bg-green-50/50 transition-colors ${isOverdue ? 'bg-red-50' : isToday ? 'bg-amber-50' : ''}`}>
                                            <td className="px-4 py-4"><span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">{booking.booking_no}</span></td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-gray-800">👤 {booking.guest_name}</p>
                                                <p className="text-xs text-gray-500">📞 {booking.guest_phone || 'N/A'}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-gray-800">🚪 {booking.room_number}</p>
                                                <p className="text-xs text-gray-500">{booking.room_type_name}</p>
                                            </td>
                                            <td className="px-4 py-4 text-center text-sm text-gray-700">{booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString() : 'N/A'}</td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : isToday ? 'text-amber-600' : 'text-gray-700'}`}>
                                                    {booking.expected_checkout ? new Date(booking.expected_checkout).toLocaleDateString() : 'N/A'}
                                                    {isOverdue && ' ⚠️'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right font-semibold text-gray-800">Ksh {(booking.total_amount || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right font-semibold text-green-600">Ksh {(booking.total_paid || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-right"><span className={`font-bold ${(booking.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>Ksh {(booking.balance || 0).toLocaleString()}</span></td>
                                            <td className="px-4 py-4 text-center">
                                                <button onClick={() => openCheckoutModal(booking)} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🚪 Checkout</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Checkout Modal */}
            {showModal && selectedBooking && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">🚪 Check-Out Room {selectedBooking.room_number}</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                            <p className="text-green-100 mt-1">👤 {selectedBooking.guest_name}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 rounded-xl p-4">
                                <h4 className="font-semibold text-gray-700 mb-3">📊 Stay Summary</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <span className="text-gray-500">Check-In:</span><span className="font-medium">{selectedBooking.check_in_date}</span>
                                    <span className="text-gray-500">Nights:</span><span className="font-medium">{selectedBooking.nights}</span>
                                    <span className="text-gray-500">Room Rate:</span><span className="font-medium">Ksh {(selectedBooking.room_rate || 0).toLocaleString()}/night</span>
                                    <span className="text-gray-500">Room Charges:</span><span className="font-medium">Ksh {(selectedBooking.room_charges || 0).toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="bg-amber-50 rounded-xl p-4">
                                <h4 className="font-semibold text-amber-700 mb-3">➕ Extra Charges</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs text-gray-600">🍽️ Restaurant</label><input type="number" value={extraCharges.restaurant} onChange={(e) => setExtraCharges({ ...extraCharges, restaurant: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg" min={0} /></div>
                                    <div><label className="text-xs text-gray-600">👔 Laundry</label><input type="number" value={extraCharges.laundry} onChange={(e) => setExtraCharges({ ...extraCharges, laundry: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg" min={0} /></div>
                                    <div><label className="text-xs text-gray-600">🍷 Minibar</label><input type="number" value={extraCharges.minibar} onChange={(e) => setExtraCharges({ ...extraCharges, minibar: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg" min={0} /></div>
                                    <div><label className="text-xs text-gray-600">📦 Other</label><input type="number" value={extraCharges.other} onChange={(e) => setExtraCharges({ ...extraCharges, other: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg" min={0} /></div>
                                </div>
                            </div>
                            <div><label className="text-sm font-semibold text-gray-700">🎁 Discount</label><input type="number" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" min={0} /></div>
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                                <div className="flex justify-between mb-2"><span className="text-gray-600">Room Charges:</span><span className="font-medium">Ksh {(selectedBooking.room_charges || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between mb-2"><span className="text-gray-600">Extra Charges:</span><span className="font-medium">Ksh {(extraCharges.restaurant + extraCharges.laundry + extraCharges.minibar + extraCharges.other).toLocaleString()}</span></div>
                                <div className="flex justify-between mb-2"><span className="text-gray-600">Discount:</span><span className="font-medium text-red-600">- Ksh {discount.toLocaleString()}</span></div>
                                <div className="border-t border-green-200 pt-2 mt-2 flex justify-between"><span className="font-bold">Total:</span><span className="text-xl font-bold text-green-700">Ksh {calculateTotal().toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Already Paid:</span><span className="font-medium text-green-600">Ksh {(selectedBooking.total_paid || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between mt-2 pt-2 border-t border-green-200"><span className="font-bold text-red-600">Balance Due:</span><span className="text-xl font-bold text-red-600">Ksh {(calculateTotal() - (selectedBooking.total_paid || 0)).toLocaleString()}</span></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-semibold text-gray-700">💰 Payment Amount</label><input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" min={0} /></div>
                                <div><label className="text-sm font-semibold text-gray-700">💳 Method</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"><option>Cash</option><option>M-Pesa</option><option>Card</option></select></div>
                            </div>
                            {paymentMethod === 'M-Pesa' && <div><label className="text-sm font-semibold text-gray-700">📱 M-Pesa Code</label><input type="text" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} placeholder="e.g. QKL12345XY" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" /></div>}
                            <button onClick={handleCheckout} disabled={isSaving} className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50">
                                {isSaving ? '⏳ Processing...' : '🚪 Complete Check-Out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {showReceipt && lastCheckout && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 text-white rounded-t-3xl flex items-center justify-between">
                            <h2 className="text-xl font-bold">🧾 Check-Out Receipt</h2>
                            <button onClick={() => setShowReceipt(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                        </div>
                        <div ref={receiptRef} className="p-6">
                            <div className="text-center mb-4">
                                <h2 className="font-bold text-lg">CHECKOUT RECEIPT</h2>
                                <p className="text-sm text-gray-500">{new Date().toLocaleString()}</p>
                            </div>
                            <hr className="my-3 border-dashed" />
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span>Booking:</span><span className="font-bold">{lastCheckout.booking_no}</span></div>
                                <div className="flex justify-between"><span>Guest:</span><span className="font-bold">{lastCheckout.guest_name}</span></div>
                                <div className="flex justify-between"><span>Room:</span><span className="font-bold">{lastCheckout.room_number}</span></div>
                                <hr className="my-2 border-dashed" />
                                <div className="flex justify-between"><span>Total Amount:</span><span className="font-bold">Ksh {(lastCheckout.total_amount || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Amount Paid:</span><span className="font-bold text-green-600">Ksh {(lastCheckout.total_paid || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Balance:</span><span className={`font-bold ${(lastCheckout.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>Ksh {(lastCheckout.balance || 0).toLocaleString()}</span></div>
                            </div>
                            <hr className="my-3 border-dashed" />
                            <div className="text-center">
                                <p className="text-2xl font-bold mb-2" style={{ opacity: 0.3 }}>{(lastCheckout.total_paid || 0) >= (lastCheckout.total_amount || 0) ? 'PAID' : 'NOT PAID'}</p>
                                <p className="text-xs text-gray-500">Thank you for staying with us!</p>
                            </div>
                        </div>
                        <div className="p-4 border-t flex gap-3">
                            <button onClick={() => setShowReceipt(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Close</button>
                            <button onClick={printReceipt} className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg">🖨️ Print</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
