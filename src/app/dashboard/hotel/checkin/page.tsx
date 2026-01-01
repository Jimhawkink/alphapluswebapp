'use client';

import { useState, useEffect, useCallback } from 'react';
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
}

interface Reservation {
    reservation_id: number;
    reservation_no: string;
    guest_name: string;
    guest_phone: string;
    room_id: number;
    room_number: string;
    check_in_date: string;
    check_out_date: string;
    nights: number;
    adults: number;
    total_amount: number;
    advance_paid: number;
    status: string;
}

export default function CheckInPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestIdType, setGuestIdType] = useState('National ID');
    const [guestIdNumber, setGuestIdNumber] = useState('');
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [nights, setNights] = useState(1);
    const [checkoutDate, setCheckoutDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    const [advancePayment, setAdvancePayment] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastBooking, setLastBooking] = useState<{ bookingNo: string; guestName: string; roomNumber: string; total: number } | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [roomData, resData] = await Promise.all([
                supabase.from('hotel_rooms').select('*').in('status', ['Vacant', 'Reserved']).eq('active', true).eq('housekeeping_status', 'Clean').order('room_number'),
                supabase.from('hotel_reservations').select('*').eq('status', 'Confirmed').order('check_in_date'),
            ]);
            setRooms(roomData.data || []);
            setReservations(resData.data || []);
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openCheckinModal = (room: Room, reservation?: Reservation) => {
        setSelectedRoom(room);
        setSelectedReservation(reservation || null);
        if (reservation) {
            setGuestName(reservation.guest_name);
            setGuestPhone(reservation.guest_phone || '');
            setNights(reservation.nights);
            setAdults(reservation.adults);
            setCheckoutDate(reservation.check_out_date);
            setAdvancePayment(reservation.advance_paid || 0);
        } else {
            setGuestName('');
            setGuestPhone('');
            setGuestIdType('National ID');
            setGuestIdNumber('');
            setAdults(1);
            setChildren(0);
            setNights(1);
            setCheckoutDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
            setAdvancePayment(0);
        }
        setShowModal(true);
    };

    const handleCheckin = async () => {
        if (!guestName.trim()) { toast.error('Guest name is required'); return; }
        if (!selectedRoom) return;
        setIsSaving(true);
        try {
            const bookingNo = `BK-${Date.now().toString().slice(-8)}`;
            const totalAmount = selectedRoom.room_rate * nights;

            // Create booking
            const { error: bookingError } = await supabase.from('hotel_bookings').insert({
                booking_no: bookingNo,
                reservation_id: selectedReservation?.reservation_id,
                reservation_no: selectedReservation?.reservation_no,
                guest_name: guestName,
                guest_phone: guestPhone,
                guest_id_type: guestIdType,
                guest_id_number: guestIdNumber,
                room_id: selectedRoom.room_id,
                room_number: selectedRoom.room_number,
                room_type_name: selectedRoom.room_type_name,
                floor_number: selectedRoom.floor_number,
                check_in_date: new Date().toISOString().split('T')[0],
                check_in_time: new Date().toTimeString().split(' ')[0],
                expected_checkout: checkoutDate,
                nights,
                adults,
                children,
                room_rate: selectedRoom.room_rate,
                room_charges: totalAmount,
                total_amount: totalAmount,
                total_paid: advancePayment,
                balance: totalAmount - advancePayment,
                payment_status: advancePayment >= totalAmount ? 'Paid' : advancePayment > 0 ? 'Partial' : 'Pending',
                status: 'Checked-In',
            });
            if (bookingError) throw bookingError;

            // Create payment if advance paid
            if (advancePayment > 0) {
                await supabase.from('hotel_payments').insert({
                    payment_no: `PAY-${Date.now().toString().slice(-8)}`,
                    booking_no: bookingNo,
                    guest_name: guestName,
                    room_number: selectedRoom.room_number,
                    amount: advancePayment,
                    payment_method: paymentMethod,
                    payment_type: 'Advance',
                    status: 'Completed',
                });
            }

            // Update room status
            const { error: roomError } = await supabase.from('hotel_rooms').update({
                status: 'Occupied',
                current_guest_name: guestName,
                check_in_date: new Date().toISOString().split('T')[0],
                expected_checkout: checkoutDate,
                updated_at: new Date().toISOString(),
            }).eq('room_id', selectedRoom.room_id);
            if (roomError) throw roomError;

            // Update reservation if exists
            if (selectedReservation) {
                await supabase.from('hotel_reservations').update({ status: 'Checked-In' }).eq('reservation_id', selectedReservation.reservation_id);
            }

            setLastBooking({ bookingNo, guestName, roomNumber: selectedRoom.room_number, total: totalAmount });
            toast.success(`✅ ${guestName} checked into Room ${selectedRoom.room_number}`);
            setShowModal(false);
            setShowReceipt(true);
            loadData();
        } catch (err) {
            console.error('Check-in error:', err);
            toast.error('Failed to check-in guest');
        }
        setIsSaving(false);
    };

    const printReceipt = () => {
        const receiptContent = document.getElementById('receipt-content');
        if (receiptContent) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`<html><head><title>Check-In Receipt</title><style>body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}h2{text-align:center;margin:0}hr{border:1px dashed #000}.center{text-align:center}.row{display:flex;justify-content:space-between}.bold{font-weight:bold}</style></head><body>${receiptContent.innerHTML}</body></html>`);
                printWindow.document.close();
                printWindow.print();
                printWindow.close();
            }
        }
    };

    const filteredRooms = rooms.filter(r => r.room_number.includes(searchQuery) || (r.room_type_name || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const todaysReservations = reservations.filter(r => r.check_in_date === new Date().toISOString().split('T')[0]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🔑</span>
                        Guest Check-In
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Check-in guests to available rooms</p>
                </div>
                <button onClick={loadData} className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🔄 Refresh</button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">✅</span>
                    <p className="text-xs opacity-80 mt-2">Available Rooms</p>
                    <p className="text-3xl font-bold">{rooms.filter(r => r.status === 'Vacant').length}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">📅</span>
                    <p className="text-xs opacity-80 mt-2">Reserved Today</p>
                    <p className="text-3xl font-bold">{todaysReservations.length}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">🔑</span>
                    <p className="text-xs opacity-80 mt-2">Pending Check-Ins</p>
                    <p className="text-3xl font-bold">{reservations.length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white">
                    <span className="text-3xl">🧹</span>
                    <p className="text-xs opacity-80 mt-2">Ready Rooms</p>
                    <p className="text-3xl font-bold">{rooms.length}</p>
                </div>
            </div>

            {/* Today's Reserved Arrivals */}
            {todaysReservations.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-2xl p-5 border border-purple-200">
                    <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2">📅 Today's Expected Arrivals</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {todaysReservations.map(res => (
                            <div key={res.reservation_id} className="bg-white rounded-xl p-4 shadow-sm border border-purple-100 flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-gray-800">👤 {res.guest_name}</p>
                                    <p className="text-sm text-gray-500">🚪 Room {res.room_number} • {res.nights} nights</p>
                                    <p className="text-xs text-purple-600">{res.reservation_no}</p>
                                </div>
                                <button onClick={() => { const room = rooms.find(r => r.room_id === res.room_id); if (room) openCheckinModal(room, res); }} className="px-4 py-2 bg-purple-500 text-white rounded-xl font-semibold hover:bg-purple-600 transition-all">🔑 Check-In</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="relative">
                    <input type="text" placeholder="🔍 Search available rooms..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                </div>
            </div>

            {/* Available Rooms Grid */}
            <div>
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">✨ Available Rooms (Clean & Ready)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {isLoading ? (
                        Array(10).fill(0).map((_, i) => <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse h-40" />)
                    ) : filteredRooms.length === 0 ? (
                        <div className="col-span-full text-center py-12"><span className="text-6xl">🏨</span><p className="text-gray-500 mt-4">No available rooms</p></div>
                    ) : (
                        filteredRooms.map(room => {
                            const hasReservation = reservations.some(r => r.room_id === room.room_id);
                            return (
                                <div key={room.room_id} className={`bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer ${room.status === 'Reserved' ? 'border-purple-300' : 'border-green-300'}`} onClick={() => openCheckinModal(room)}>
                                    <div className={`h-2 ${room.status === 'Reserved' ? 'bg-gradient-to-r from-purple-400 to-violet-500' : 'bg-gradient-to-r from-green-400 to-emerald-500'}`} />
                                    <div className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xl font-bold text-gray-800">🚪 {room.room_number}</span>
                                            <span className="text-xs text-gray-500">F{room.floor_number}</span>
                                        </div>
                                        <p className="text-sm text-gray-600">{room.room_type_name}</p>
                                        <p className="text-xs text-gray-500">🛏️ {room.bed_type}</p>
                                        <div className="flex items-center justify-between mt-3">
                                            <span className="text-lg font-bold text-green-600">Ksh {room.room_rate?.toLocaleString()}</span>
                                            <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${room.status === 'Reserved' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{room.status}</span>
                                        </div>
                                        {hasReservation && <p className="text-xs text-purple-600 mt-2">📅 Has reservation</p>}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Check-In Modal */}
            {showModal && selectedRoom && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">🔑 Check-In to Room {selectedRoom.room_number}</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                            <p className="text-blue-100 mt-1">{selectedRoom.room_type_name} • Ksh {selectedRoom.room_rate?.toLocaleString()}/night</p>
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
                                        <option>National ID</option><option>Passport</option><option>Driving License</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">🔢 ID Number</label>
                                    <input type="text" value={guestIdNumber} onChange={(e) => setGuestIdNumber(e.target.value)} placeholder="ID Number" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📅 Checkout</label>
                                    <input type="date" value={checkoutDate} onChange={(e) => { setCheckoutDate(e.target.value); const d = new Date(e.target.value); const t = new Date(); setNights(Math.max(1, Math.ceil((d.getTime() - t.getTime()) / 86400000))); }} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">💰 Advance Payment</label>
                                    <input type="number" value={advancePayment} onChange={(e) => setAdvancePayment(parseFloat(e.target.value) || 0)} min={0} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">💳 Payment Method</label>
                                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500">
                                        <option>Cash</option><option>M-Pesa</option><option>Card</option>
                                    </select>
                                </div>
                            </div>
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                                <div className="flex justify-between items-center mb-2"><span className="text-gray-600">Room Rate:</span><span className="font-semibold">Ksh {selectedRoom.room_rate?.toLocaleString()}/night</span></div>
                                <div className="flex justify-between items-center mb-2"><span className="text-gray-600">Nights:</span><span className="font-semibold">{nights}</span></div>
                                <div className="border-t border-blue-200 pt-2 mt-2 flex justify-between items-center"><span className="text-lg font-bold">Total:</span><span className="text-xl font-bold text-blue-600">Ksh {(selectedRoom.room_rate * nights).toLocaleString()}</span></div>
                                {advancePayment > 0 && <div className="flex justify-between items-center mt-2"><span className="text-gray-600">Balance:</span><span className="font-bold text-orange-600">Ksh {(selectedRoom.room_rate * nights - advancePayment).toLocaleString()}</span></div>}
                            </div>
                            <button onClick={handleCheckin} disabled={isSaving} className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50">
                                {isSaving ? '⏳ Processing...' : '🔑 Check-In Guest'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {showReceipt && lastBooking && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 text-white rounded-t-3xl">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">✅ Check-In Complete</h2>
                                <button onClick={() => setShowReceipt(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>
                        <div id="receipt-content" className="p-6">
                            <div className="text-center mb-4">
                                <h2 className="font-bold text-lg">CHECK-IN RECEIPT</h2>
                                <p className="text-sm text-gray-500">{new Date().toLocaleString()}</p>
                            </div>
                            <hr className="my-3 border-dashed" />
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span>Booking No:</span><span className="font-bold">{lastBooking.bookingNo}</span></div>
                                <div className="flex justify-between"><span>Guest:</span><span className="font-bold">{lastBooking.guestName}</span></div>
                                <div className="flex justify-between"><span>Room:</span><span className="font-bold">{lastBooking.roomNumber}</span></div>
                                <div className="flex justify-between"><span>Total Amount:</span><span className="font-bold">Ksh {lastBooking.total.toLocaleString()}</span></div>
                            </div>
                            <hr className="my-3 border-dashed" />
                            <p className="text-center text-xs text-gray-500">Thank you for staying with us!</p>
                        </div>
                        <div className="p-4 border-t">
                            <div className="flex gap-3">
                                <button onClick={() => setShowReceipt(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">Close</button>
                                <button onClick={printReceipt} className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg">🖨️ Print</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
