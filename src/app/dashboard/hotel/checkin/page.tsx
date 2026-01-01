'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Room {
    room_id: number;
    room_number: string;
    floor_number: number;
    room_type_id: number;
    room_type_name: string;
    bed_type: string;
    room_rate: number;
    status: string;
    housekeeping_status: string;
}

interface RoomPlan {
    plan_id: number;
    plan_code: string;
    plan_name: string;
    rate_modifier: number;
    includes_breakfast: boolean;
    includes_lunch: boolean;
    includes_dinner: boolean;
}

interface Guest {
    guest_id: number;
    guest_code: string;
    full_name: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    id_type: string;
    id_number: string;
    nationality: string;
    gender: string;
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

function CheckInPageContent() {
    const searchParams = useSearchParams();
    const guestIdFromUrl = searchParams.get('guestId');

    const [rooms, setRooms] = useState<Room[]>([]);
    const [roomPlans, setRoomPlans] = useState<RoomPlan[]>([]);
    const [guests, setGuests] = useState<Guest[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Guest selection mode
    const [guestMode, setGuestMode] = useState<'new' | 'existing'>('new');
    const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
    const [guestSearchQuery, setGuestSearchQuery] = useState('');

    // Form state
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestEmail, setGuestEmail] = useState('');
    const [guestIdType, setGuestIdType] = useState('National ID');
    const [guestIdNumber, setGuestIdNumber] = useState('');
    const [guestNationality, setGuestNationality] = useState('Kenya');
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [nights, setNights] = useState(1);
    const [checkoutDate, setCheckoutDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    const [selectedPlan, setSelectedPlan] = useState<RoomPlan | null>(null);

    // Payment
    const [amountPaid, setAmountPaid] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [mpesaCode, setMpesaCode] = useState('');

    // Receipt
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastBooking, setLastBooking] = useState<{
        bookingNo: string;
        guestName: string;
        roomNumber: string;
        roomType: string;
        checkIn: string;
        checkOut: string;
        nights: number;
        roomRate: number;
        planName: string;
        total: number;
        paid: number;
        balance: number;
        paymentMethod: string;
        isPaid: boolean;
    } | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [roomData, planData, guestData, resData] = await Promise.all([
                supabase.from('hotel_rooms').select('*').in('status', ['Vacant', 'Reserved']).eq('active', true).eq('housekeeping_status', 'Clean').order('room_number'),
                supabase.from('room_plans').select('*').eq('active', true).order('plan_name'),
                supabase.from('hotel_guests').select('*').eq('active', true).order('full_name'),
                supabase.from('hotel_reservations').select('*').eq('status', 'Confirmed').order('check_in_date'),
            ]);
            setRooms(roomData.data || []);
            setRoomPlans(planData.data || []);
            setGuests(guestData.data || []);
            setReservations(resData.data || []);

            // If guest ID is in URL, load that guest
            if (guestIdFromUrl) {
                const guest = (guestData.data || []).find((g: Guest) => g.guest_id === parseInt(guestIdFromUrl));
                if (guest) {
                    setGuestMode('existing');
                    setSelectedGuest(guest);
                    setGuestName(guest.full_name || `${guest.first_name} ${guest.last_name}`);
                    setGuestPhone(guest.phone || '');
                    setGuestEmail(guest.email || '');
                    setGuestIdType(guest.id_type || 'National ID');
                    setGuestIdNumber(guest.id_number || '');
                    setGuestNationality(guest.nationality || 'Kenya');
                    // Auto-open modal
                    setShowModal(true);
                }
            }
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load data');
        }
        setIsLoading(false);
    }, [guestIdFromUrl]);

    useEffect(() => { loadData(); }, [loadData]);

    const openCheckinModal = (room?: Room, reservation?: Reservation) => {
        if (room) {
            setSelectedRoom(room);
            // Set default plan
            if (roomPlans.length > 0) setSelectedPlan(roomPlans[0]);
        }
        setSelectedReservation(reservation || null);
        if (reservation) {
            setGuestMode('existing');
            setGuestName(reservation.guest_name);
            setGuestPhone(reservation.guest_phone || '');
            setNights(reservation.nights);
            setAdults(reservation.adults);
            setCheckoutDate(reservation.check_out_date);
            setAmountPaid(reservation.advance_paid || 0);
        } else if (!selectedGuest) {
            resetForm();
        }
        setShowModal(true);
    };

    const resetForm = () => {
        setGuestMode('new');
        setSelectedGuest(null);
        setGuestName('');
        setGuestPhone('');
        setGuestEmail('');
        setGuestIdType('National ID');
        setGuestIdNumber('');
        setGuestNationality('Kenya');
        setAdults(1);
        setChildren(0);
        setNights(1);
        setCheckoutDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
        setAmountPaid(0);
        setPaymentMethod('Cash');
        setMpesaCode('');
    };

    const selectGuest = (guest: Guest) => {
        setSelectedGuest(guest);
        setGuestName(guest.full_name || `${guest.first_name} ${guest.last_name}`);
        setGuestPhone(guest.phone || '');
        setGuestEmail(guest.email || '');
        setGuestIdType(guest.id_type || 'National ID');
        setGuestIdNumber(guest.id_number || '');
        setGuestNationality(guest.nationality || 'Kenya');
        setGuestSearchQuery('');
    };

    const selectRoom = (room: Room) => {
        setSelectedRoom(room);
        if (roomPlans.length > 0 && !selectedPlan) {
            setSelectedPlan(roomPlans[0]);
        }
    };

    const calculateTotal = () => {
        if (!selectedRoom) return 0;
        const baseRate = selectedRoom.room_rate || 0;
        const planModifier = selectedPlan?.rate_modifier || 1;
        return Math.round(baseRate * planModifier * nights);
    };

    const handleCheckin = async () => {
        if (!guestName.trim()) { toast.error('Guest name is required'); return; }
        if (!selectedRoom) { toast.error('Please select a room'); return; }
        setIsSaving(true);
        try {
            const bookingNo = `BK-${Date.now().toString().slice(-8)}`;
            const totalAmount = calculateTotal();
            const balance = totalAmount - amountPaid;
            const isPaid = amountPaid >= totalAmount;

            // Create or get guest
            let guestId = selectedGuest?.guest_id;
            if (guestMode === 'new' && !guestId) {
                const guestCode = `G-${Date.now().toString().slice(-6)}`;
                const { data: newGuest, error: guestError } = await supabase.from('hotel_guests').insert({
                    guest_code: guestCode,
                    first_name: guestName.split(' ')[0],
                    last_name: guestName.split(' ').slice(1).join(' '),
                    full_name: guestName,
                    phone: guestPhone,
                    email: guestEmail,
                    id_type: guestIdType,
                    id_number: guestIdNumber,
                    nationality: guestNationality,
                    active: true,
                }).select().single();
                if (guestError) throw guestError;
                guestId = newGuest?.guest_id;
            }

            // Create booking
            const { error: bookingError } = await supabase.from('hotel_bookings').insert({
                booking_no: bookingNo,
                reservation_id: selectedReservation?.reservation_id,
                reservation_no: selectedReservation?.reservation_no,
                guest_id: guestId,
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
                plan_id: selectedPlan?.plan_id,
                plan_name: selectedPlan?.plan_name,
                room_rate: selectedRoom.room_rate,
                room_charges: totalAmount,
                total_amount: totalAmount,
                total_paid: amountPaid,
                balance: balance,
                payment_status: isPaid ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Pending',
                status: 'Checked-In',
            });
            if (bookingError) throw bookingError;

            // Create payment if paid
            if (amountPaid > 0) {
                await supabase.from('hotel_payments').insert({
                    payment_no: `PAY-${Date.now().toString().slice(-8)}`,
                    booking_no: bookingNo,
                    guest_id: guestId,
                    guest_name: guestName,
                    room_number: selectedRoom.room_number,
                    amount: amountPaid,
                    payment_method: paymentMethod,
                    mpesa_code: paymentMethod === 'M-Pesa' ? mpesaCode : null,
                    payment_type: 'Room Charge',
                    status: 'Completed',
                });
            }

            // Update room status
            await supabase.from('hotel_rooms').update({
                status: 'Occupied',
                current_guest_id: guestId,
                current_guest_name: guestName,
                current_booking_id: null, // Will be updated with actual booking ID
                check_in_date: new Date().toISOString().split('T')[0],
                expected_checkout: checkoutDate,
                updated_at: new Date().toISOString(),
            }).eq('room_id', selectedRoom.room_id);

            // Update reservation if exists
            if (selectedReservation) {
                await supabase.from('hotel_reservations').update({ status: 'Checked-In' }).eq('reservation_id', selectedReservation.reservation_id);
            }

            // Update guest stats
            if (guestId) {
                try {
                    await supabase.rpc('increment_guest_stays', { p_guest_id: guestId, p_amount: totalAmount });
                } catch {
                    // RPC might not exist, ignore
                }
            }

            setLastBooking({
                bookingNo,
                guestName,
                roomNumber: selectedRoom.room_number,
                roomType: selectedRoom.room_type_name,
                checkIn: new Date().toLocaleDateString(),
                checkOut: new Date(checkoutDate).toLocaleDateString(),
                nights,
                roomRate: selectedRoom.room_rate,
                planName: selectedPlan?.plan_name || 'Room Only',
                total: totalAmount,
                paid: amountPaid,
                balance: balance,
                paymentMethod,
                isPaid,
            });
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
        const receiptWindow = window.open('', '_blank');
        if (!receiptWindow || !lastBooking) return;

        const isPaid = lastBooking.isPaid;
        const watermark = isPaid ? 'PAID' : 'NOT PAID';
        const watermarkColor = isPaid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';

        receiptWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Check-In Receipt - ${lastBooking.bookingNo}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; position: relative; }
                    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 60px; font-weight: bold; color: ${watermarkColor}; z-index: -1; white-space: nowrap; }
                    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .header h1 { font-size: 16px; font-weight: bold; }
                    .header p { font-size: 10px; }
                    .section { margin: 10px 0; padding: 10px 0; border-bottom: 1px dashed #000; }
                    .row { display: flex; justify-content: space-between; padding: 3px 0; }
                    .row.total { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
                    .row.paid { color: #22c55e; }
                    .row.balance { color: #ef4444; font-weight: bold; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; font-size: 14px; margin: 10px 0; }
                    .status-paid { background: #dcfce7; color: #16a34a; }
                    .status-unpaid { background: #fee2e2; color: #dc2626; }
                    .footer { text-align: center; margin-top: 15px; font-size: 10px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="watermark">${watermark}</div>
                
                <div class="header">
                    <h1>🏨 HOTEL CHECK-IN</h1>
                    <p>Alpha Plus Hotel</p>
                    <p>${new Date().toLocaleString()}</p>
                </div>

                <div class="section">
                    <div class="row"><span>Booking No:</span><span class="bold">${lastBooking.bookingNo}</span></div>
                    <div class="row"><span>Guest:</span><span class="bold">${lastBooking.guestName}</span></div>
                </div>

                <div class="section">
                    <div class="row"><span>Room:</span><span class="bold">${lastBooking.roomNumber}</span></div>
                    <div class="row"><span>Room Type:</span><span>${lastBooking.roomType}</span></div>
                    <div class="row"><span>Plan:</span><span>${lastBooking.planName}</span></div>
                </div>

                <div class="section">
                    <div class="row"><span>Check-In:</span><span>${lastBooking.checkIn}</span></div>
                    <div class="row"><span>Check-Out:</span><span>${lastBooking.checkOut}</span></div>
                    <div class="row"><span>Nights:</span><span>${lastBooking.nights}</span></div>
                </div>

                <div class="section">
                    <div class="row"><span>Room Rate:</span><span>Ksh ${lastBooking.roomRate.toLocaleString()}/night</span></div>
                    <div class="row total"><span>TOTAL:</span><span>Ksh ${lastBooking.total.toLocaleString()}</span></div>
                    <div class="row paid"><span>Paid (${lastBooking.paymentMethod}):</span><span>Ksh ${lastBooking.paid.toLocaleString()}</span></div>
                    ${lastBooking.balance > 0 ? `<div class="row balance"><span>BALANCE DUE:</span><span>Ksh ${lastBooking.balance.toLocaleString()}</span></div>` : ''}
                </div>

                <div class="center">
                    <span class="status-badge ${isPaid ? 'status-paid' : 'status-unpaid'}">
                        ${isPaid ? '✓ FULLY PAID' : '⚠ PAYMENT PENDING'}
                    </span>
                </div>

                <div class="footer">
                    <p>Thank you for staying with us!</p>
                    <p>WiFi: AlphaPlus_Guest | Password: welcome123</p>
                    <hr style="margin: 10px 0; border-style: dashed;">
                    <p style="font-size: 8px;">For queries, contact reception</p>
                </div>

                <div class="no-print" style="margin-top: 20px; text-align: center;">
                    <button onclick="window.print()" style="padding: 10px 30px; font-size: 14px; cursor: pointer;">🖨️ Print Receipt</button>
                </div>
            </body>
            </html>
        `);
        receiptWindow.document.close();
    };

    const filteredRooms = rooms.filter(r => r.room_number.includes(searchQuery) || (r.room_type_name || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const todaysReservations = reservations.filter(r => r.check_in_date === new Date().toISOString().split('T')[0]);
    const filteredGuests = guests.filter(g =>
        guestSearchQuery && ((g.full_name || '').toLowerCase().includes(guestSearchQuery.toLowerCase()) ||
            (g.phone || '').includes(guestSearchQuery) ||
            (g.id_number || '').toLowerCase().includes(guestSearchQuery.toLowerCase()))
    );

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
                <div className="flex gap-3">
                    <button onClick={() => { resetForm(); setShowModal(true); }} className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">➕ Walk-In Check-In</button>
                    <button onClick={loadData} className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all">🔄 Refresh</button>
                </div>
            </div>

            {/* Stats - Dashboard Glassmorphic Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">✅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Available Rooms</p>
                    <p className="text-3xl font-bold mt-1">{rooms.filter(r => r.status === 'Vacant').length}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">📅</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Reserved Today</p>
                    <p className="text-3xl font-bold mt-1">{todaysReservations.length}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">🔑</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Pending Check-Ins</p>
                    <p className="text-3xl font-bold mt-1">{reservations.length}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <span className="text-xl">👥</span>
                    </div>
                    <p className="text-xs opacity-80 font-medium">Registered Guests</p>
                    <p className="text-3xl font-bold mt-1">{guests.length}</p>
                </div>
            </div>

            {/* Today's Reserved Arrivals */}
            {todaysReservations.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-2xl p-5 border border-purple-200">
                    <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2">📅 Today&apos;s Expected Arrivals</h3>
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
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 px-6 py-5 text-white sticky top-0 z-10">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">🔑 Guest Check-In</h2>
                                    {selectedRoom && <p className="text-blue-100 mt-1">{selectedRoom.room_type_name} • Room {selectedRoom.room_number} • Ksh {selectedRoom.room_rate?.toLocaleString()}/night</p>}
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Room Selection (if not selected) */}
                            {!selectedRoom && (
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                                    <h3 className="font-bold text-blue-800 mb-3">🚪 Select Room</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                                        {rooms.filter((r): r is Room => r.status === 'Vacant').map(room => (
                                            <button key={room.room_id} onClick={() => selectRoom(room)} className="p-3 rounded-xl text-left transition-all bg-white border border-gray-200 hover:border-blue-400">
                                                <span className="font-bold">{room.room_number}</span>
                                                <p className="text-xs opacity-80">{room.room_type_name}</p>
                                                <p className="text-xs font-semibold">Ksh {room.room_rate?.toLocaleString()}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Guest Selection Mode */}
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-200">
                                <h3 className="font-bold text-green-800 mb-3">👤 Guest Information</h3>
                                <div className="flex gap-3 mb-4">
                                    <button onClick={() => { setGuestMode('new'); setSelectedGuest(null); }} className={`flex-1 py-2 rounded-xl font-semibold transition-all ${guestMode === 'new' ? 'bg-green-500 text-white' : 'bg-white border border-gray-200'}`}>➕ New Guest</button>
                                    <button onClick={() => setGuestMode('existing')} className={`flex-1 py-2 rounded-xl font-semibold transition-all ${guestMode === 'existing' ? 'bg-green-500 text-white' : 'bg-white border border-gray-200'}`}>👥 Existing Guest</button>
                                </div>

                                {guestMode === 'existing' && !selectedGuest && (
                                    <div className="mb-4">
                                        <input type="text" placeholder="🔍 Search guests by name, phone, or ID..." value={guestSearchQuery} onChange={(e) => setGuestSearchQuery(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                        {filteredGuests.length > 0 && (
                                            <div className="mt-2 bg-white border border-gray-200 rounded-xl max-h-40 overflow-y-auto">
                                                {filteredGuests.map(g => (
                                                    <button key={g.guest_id} onClick={() => selectGuest(g)} className="w-full p-3 text-left hover:bg-green-50 border-b border-gray-100 last:border-0">
                                                        <p className="font-semibold">{g.full_name || `${g.first_name} ${g.last_name}`}</p>
                                                        <p className="text-xs text-gray-500">📞 {g.phone} • 🪪 {g.id_number}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectedGuest && (
                                    <div className="mb-4 bg-white rounded-xl p-4 border border-green-300 flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-green-700">✅ {selectedGuest.full_name}</p>
                                            <p className="text-sm text-gray-500">📞 {selectedGuest.phone} • {selectedGuest.guest_code}</p>
                                        </div>
                                        <button onClick={() => { setSelectedGuest(null); setGuestMode('new'); resetForm(); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">✕</button>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">👤 Guest Name *</label>
                                        <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Full Name" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">📞 Phone</label>
                                        <input type="text" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="0712345678" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">✉️ Email</label>
                                        <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="email@example.com" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">🪪 ID Type</label>
                                        <select value={guestIdType} onChange={(e) => setGuestIdType(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500">
                                            <option>National ID</option><option>Passport</option><option>Driving License</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">🔢 ID Number</label>
                                        <input type="text" value={guestIdNumber} onChange={(e) => setGuestIdNumber(e.target.value)} placeholder="ID Number" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Stay Details */}
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-200">
                                <h3 className="font-bold text-amber-800 mb-3">🛏️ Stay Details</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">📅 Check-Out</label>
                                        <input type="date" value={checkoutDate} onChange={(e) => { setCheckoutDate(e.target.value); const d = new Date(e.target.value); const t = new Date(); setNights(Math.max(1, Math.ceil((d.getTime() - t.getTime()) / 86400000))); }} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">🌙 Nights</label>
                                        <input type="number" value={nights} onChange={(e) => setNights(parseInt(e.target.value) || 1)} min={1} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">👥 Adults</label>
                                        <input type="number" value={adults} onChange={(e) => setAdults(parseInt(e.target.value) || 1)} min={1} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">👶 Children</label>
                                        <input type="number" value={children} onChange={(e) => setChildren(parseInt(e.target.value) || 0)} min={0} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500" />
                                    </div>
                                </div>

                                {/* Room Plan Selection */}
                                <div className="mt-4">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">📋 Room Plan</label>
                                    <div className="flex flex-wrap gap-2">
                                        {roomPlans.map(plan => (
                                            <button key={plan.plan_id} onClick={() => setSelectedPlan(plan)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedPlan?.plan_id === plan.plan_id ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 hover:border-amber-400'}`}>
                                                {plan.plan_name}
                                                {plan.includes_breakfast && ' 🍳'}
                                                {plan.includes_dinner && ' 🍽️'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Payment */}
                            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-5 border border-purple-200">
                                <h3 className="font-bold text-purple-800 mb-3">💰 Payment</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">💵 Amount Paid</label>
                                        <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)} min={0} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">💳 Payment Method</label>
                                        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500">
                                            <option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank Transfer</option>
                                        </select>
                                    </div>
                                    {paymentMethod === 'M-Pesa' && (
                                        <div className="col-span-2">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">📱 M-Pesa Code</label>
                                            <input type="text" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value.toUpperCase())} placeholder="e.g. QHXYZ12345" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-mono" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary */}
                            {selectedRoom && (
                                <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl p-5 border border-blue-300">
                                    <div className="flex justify-between items-center mb-2"><span className="text-gray-600">Room Rate:</span><span className="font-semibold">Ksh {selectedRoom.room_rate?.toLocaleString()}/night</span></div>
                                    <div className="flex justify-between items-center mb-2"><span className="text-gray-600">Plan:</span><span className="font-semibold">{selectedPlan?.plan_name || 'Room Only'} (×{selectedPlan?.rate_modifier || 1})</span></div>
                                    <div className="flex justify-between items-center mb-2"><span className="text-gray-600">Nights:</span><span className="font-semibold">{nights}</span></div>
                                    <div className="border-t-2 border-blue-300 pt-3 mt-3 flex justify-between items-center"><span className="text-lg font-bold">Total:</span><span className="text-2xl font-bold text-blue-600">Ksh {calculateTotal().toLocaleString()}</span></div>
                                    {amountPaid > 0 && <div className="flex justify-between items-center mt-2"><span className="text-gray-600">Paid:</span><span className="font-bold text-green-600">Ksh {amountPaid.toLocaleString()}</span></div>}
                                    {amountPaid > 0 && amountPaid < calculateTotal() && <div className="flex justify-between items-center mt-2"><span className="text-gray-600">Balance:</span><span className="font-bold text-orange-600">Ksh {(calculateTotal() - amountPaid).toLocaleString()}</span></div>}
                                    {amountPaid >= calculateTotal() && <div className="text-center mt-3"><span className="px-4 py-2 bg-green-500 text-white rounded-full font-bold">✓ FULLY PAID</span></div>}
                                </div>
                            )}

                            <button onClick={handleCheckin} disabled={isSaving || !selectedRoom} className="w-full py-4 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50">
                                {isSaving ? '⏳ Processing...' : '🔑 Complete Check-In'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {showReceipt && lastBooking && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className={`px-6 py-5 text-white ${lastBooking.isPaid ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-orange-500 to-red-500'}`}>
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">{lastBooking.isPaid ? '✅ Check-In Complete' : '⚠️ Check-In Complete (Unpaid)'}</h2>
                                <button onClick={() => setShowReceipt(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className={`text-center mb-4 py-3 rounded-xl font-bold text-lg ${lastBooking.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {lastBooking.isPaid ? '💚 FULLY PAID' : '💔 PAYMENT PENDING'}
                            </div>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Booking No:</span><span className="font-bold">{lastBooking.bookingNo}</span></div>
                                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Guest:</span><span className="font-bold">{lastBooking.guestName}</span></div>
                                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Room:</span><span className="font-bold">{lastBooking.roomNumber} ({lastBooking.roomType})</span></div>
                                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Check-In:</span><span>{lastBooking.checkIn}</span></div>
                                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Check-Out:</span><span>{lastBooking.checkOut}</span></div>
                                <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Nights:</span><span>{lastBooking.nights}</span></div>
                                <div className="flex justify-between font-bold text-lg border-t pt-3"><span>Total:</span><span>Ksh {lastBooking.total.toLocaleString()}</span></div>
                                <div className="flex justify-between text-green-600"><span>Paid ({lastBooking.paymentMethod}):</span><span>Ksh {lastBooking.paid.toLocaleString()}</span></div>
                                {lastBooking.balance > 0 && <div className="flex justify-between text-red-600 font-bold"><span>Balance Due:</span><span>Ksh {lastBooking.balance.toLocaleString()}</span></div>}
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50">
                            <div className="flex gap-3">
                                <button onClick={() => setShowReceipt(false)} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300">Close</button>
                                <button onClick={printReceipt} className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg">🖨️ Print Receipt</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CheckInPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <CheckInPageContent />
        </Suspense>
    );
}
