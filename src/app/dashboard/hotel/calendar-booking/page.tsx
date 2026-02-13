'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

/* ─── Types ────────────────────────────────────────────────────────── */
interface Room {
    room_id: number;
    room_number: string;
    floor_number: number;
    room_type_name: string;
    bed_type: string;
    room_rate: number;
    status: string;
    active: boolean;
}

interface Reservation {
    reservation_id: number;
    reservation_no: string;
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
    room_rate: number;
    total_amount: number;
    advance_paid: number;
    balance_amount: number;
    payment_status: string;
    status: string;
    booking_source: string;
    special_requests: string;
}

/* ─── Status Colour Map ───────────────────────────────────────────── */
const barColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    Confirmed: { bg: 'linear-gradient(135deg,#6366f1,#818cf8)', border: '#6366f1', text: '#fff', dot: '#818cf8' },
    'Checked-In': { bg: 'linear-gradient(135deg,#10b981,#34d399)', border: '#10b981', text: '#fff', dot: '#34d399' },
    Pending: { bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', border: '#f59e0b', text: '#fff', dot: '#fbbf24' },
    'Checked-Out': { bg: 'linear-gradient(135deg,#94a3b8,#cbd5e1)', border: '#94a3b8', text: '#475569', dot: '#cbd5e1' },
    Cancelled: { bg: 'linear-gradient(135deg,#ef4444,#f87171)', border: '#ef4444', text: '#fff', dot: '#f87171' },
    'No-Show': { bg: 'linear-gradient(135deg,#f97316,#fb923c)', border: '#f97316', text: '#fff', dot: '#fb923c' },
};

const CELL_W = 110;   // px per day column
const ROW_H = 64;     // px per room row
const LABEL_W = 180;  // px for room label column

/* ─── Main Component ──────────────────────────────────────────────── */
export default function CalendarBookingPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewDays, setViewDays] = useState(14);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    });

    // Filters
    const [filterFloor, setFilterFloor] = useState('All');
    const [filterType, setFilterType] = useState('All');
    const [searchRoom, setSearchRoom] = useState('');

    // Modals
    const [selectedBooking, setSelectedBooking] = useState<Reservation | null>(null);
    const [quickBook, setQuickBook] = useState<{ room: Room; date: Date } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Quick-book form
    const [qbForm, setQbForm] = useState({
        guest_name: '', guest_phone: '', guest_email: '',
        check_out_date: '', nights: 1, adults: 1, children: 0,
        advance_paid: 0, booking_source: 'Direct', special_requests: '',
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    /* ─── Data Loading ─────────────────────────────────────────────── */
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + viewDays + 1);
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const [roomData, resData] = await Promise.all([
                supabase.from('hotel_rooms').select('*').eq('active', true).order('floor_number').order('room_number'),
                supabase.from('hotel_reservations').select('*')
                    .gte('check_out_date', startStr)
                    .lte('check_in_date', endStr)
                    .not('status', 'eq', 'Cancelled'),
            ]);
            setRooms(roomData.data || []);
            setReservations(resData.data || []);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load calendar data');
        }
        setIsLoading(false);
    }, [startDate, viewDays]);

    useEffect(() => { loadData(); }, [loadData]);

    /* ─── Helpers ──────────────────────────────────────────────────── */
    const dates: Date[] = [];
    for (let i = 0; i < viewDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const todayStr = fmt(new Date());

    const navigateDays = (n: number) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + n);
        setStartDate(d);
    };

    const goToday = () => {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        setStartDate(d);
    };

    /* ─── Filters ──────────────────────────────────────────────────── */
    const floors = Array.from(new Set(rooms.map(r => r.floor_number))).sort((a, b) => a - b);
    const roomTypes = Array.from(new Set(rooms.map(r => r.room_type_name))).sort();

    const filteredRooms = rooms.filter(r => {
        if (filterFloor !== 'All' && r.floor_number !== parseInt(filterFloor)) return false;
        if (filterType !== 'All' && r.room_type_name !== filterType) return false;
        if (searchRoom && !r.room_number.toLowerCase().includes(searchRoom.toLowerCase())) return false;
        return true;
    });

    /* ─── Stats ────────────────────────────────────────────────────── */
    const todayArrivals = reservations.filter(r => r.check_in_date === todayStr && (r.status === 'Confirmed' || r.status === 'Pending')).length;
    const todayDepartures = reservations.filter(r => r.check_out_date === todayStr && r.status === 'Checked-In').length;
    const todayOccupied = reservations.filter(r => {
        return r.check_in_date <= todayStr && r.check_out_date > todayStr && (r.status === 'Checked-In' || r.status === 'Confirmed');
    }).length;
    const occupancyPct = rooms.length > 0 ? Math.round((todayOccupied / rooms.length) * 100) : 0;

    /* ─── Booking Bar Position ─────────────────────────────────────── */
    const getBarStyle = (res: Reservation) => {
        const ciDate = new Date(res.check_in_date);
        const coDate = new Date(res.check_out_date);
        const gridStart = startDate;
        const gridEnd = new Date(startDate);
        gridEnd.setDate(gridEnd.getDate() + viewDays);

        const barStart = ciDate < gridStart ? gridStart : ciDate;
        const barEnd = coDate > gridEnd ? gridEnd : coDate;

        const startOffset = Math.max(0, (barStart.getTime() - gridStart.getTime()) / 86400000);
        const span = Math.max(0.5, (barEnd.getTime() - barStart.getTime()) / 86400000);

        const colors = barColors[res.status] || barColors['Pending'];

        return {
            left: startOffset * CELL_W + 4,
            width: span * CELL_W - 8,
            background: colors.bg,
            borderColor: colors.border,
            color: colors.text,
        };
    };

    /* ─── Quick Book Submit ─────────────────────────────────────────── */
    const handleQuickBook = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickBook) return;
        if (!qbForm.guest_name.trim()) { toast.error('Guest name required'); return; }
        setIsSaving(true);
        try {
            const checkIn = fmt(quickBook.date);
            const checkOut = qbForm.check_out_date;
            if (!checkOut || checkOut <= checkIn) { toast.error('Invalid check-out date'); setIsSaving(false); return; }
            const nights = Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
            const totalAmount = quickBook.room.room_rate * nights;
            const reservationNo = `RSV-${Date.now().toString().slice(-8)}`;

            const { error } = await supabase.from('hotel_reservations').insert({
                reservation_no: reservationNo,
                guest_name: qbForm.guest_name,
                guest_phone: qbForm.guest_phone,
                guest_email: qbForm.guest_email,
                room_id: quickBook.room.room_id,
                room_number: quickBook.room.room_number,
                room_type_name: quickBook.room.room_type_name,
                check_in_date: checkIn,
                check_out_date: checkOut,
                nights,
                adults: qbForm.adults,
                children: qbForm.children,
                room_rate: quickBook.room.room_rate,
                total_room_charge: totalAmount,
                total_amount: totalAmount,
                advance_paid: qbForm.advance_paid,
                balance_amount: totalAmount - qbForm.advance_paid,
                payment_status: qbForm.advance_paid >= totalAmount ? 'Paid' : qbForm.advance_paid > 0 ? 'Partial' : 'Pending',
                status: 'Confirmed',
                booking_source: qbForm.booking_source,
                special_requests: qbForm.special_requests,
            });
            if (error) throw error;

            await supabase.from('hotel_rooms').update({ status: 'Reserved', updated_at: new Date().toISOString() }).eq('room_id', quickBook.room.room_id);
            toast.success(`✅ Booking ${reservationNo} created!`);
            setQuickBook(null);
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Failed to create booking');
        }
        setIsSaving(false);
    };

    const openQuickBook = (room: Room, date: Date) => {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        setQbForm({
            guest_name: '', guest_phone: '', guest_email: '',
            check_out_date: fmt(nextDay), nights: 1, adults: 1, children: 0,
            advance_paid: 0, booking_source: 'Direct', special_requests: '',
        });
        setQuickBook({ room, date });
    };

    /* ─── Status Update ────────────────────────────────────────────── */
    const updateBookingStatus = async (res: Reservation, newStatus: string) => {
        try {
            const { error } = await supabase.from('hotel_reservations').update({ status: newStatus }).eq('reservation_id', res.reservation_id);
            if (error) throw error;
            if (newStatus === 'Cancelled') {
                await supabase.from('hotel_rooms').update({ status: 'Vacant' }).eq('room_id', res.room_id);
            }
            toast.success(`Reservation ${newStatus}`);
            setSelectedBooking(null);
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Failed to update');
        }
    };

    /* ─── Render ───────────────────────────────────────────────────── */
    return (
        <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
            {/* ═══ Header ═══ */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff', boxShadow: '0 8px 24px rgba(99,102,241,.3)' }}>📆</div>
                    <div>
                        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a2332', margin: 0, letterSpacing: -0.5 }}>Calendar Booking</h1>
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>Visual room booking timeline</p>
                    </div>
                </div>
                <button onClick={loadData} style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,.25)', transition: 'transform .15s', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                >🔄 Refresh</button>
            </div>

            {/* ═══ Stats Cards ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                {[
                    { label: 'Total Rooms', value: rooms.length, icon: '🏨', gradient: 'linear-gradient(135deg,#6366f1,#818cf8)', shadowColor: 'rgba(99,102,241,.3)' },
                    { label: "Today's Arrivals", value: todayArrivals, icon: '🛬', gradient: 'linear-gradient(135deg,#10b981,#34d399)', shadowColor: 'rgba(16,185,129,.3)' },
                    { label: "Today's Departures", value: todayDepartures, icon: '🛫', gradient: 'linear-gradient(135deg,#f59e0b,#fbbf24)', shadowColor: 'rgba(245,158,11,.3)' },
                    { label: 'Occupancy Rate', value: `${occupancyPct}%`, icon: '📊', gradient: 'linear-gradient(135deg,#ec4899,#f472b6)', shadowColor: 'rgba(236,72,153,.3)' },
                ].map((card, i) => (
                    <div key={i} style={{ background: card.gradient, borderRadius: 20, padding: '20px 22px', color: '#fff', boxShadow: `0 8px 24px ${card.shadowColor}`, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.12)' }} />
                        <div style={{ position: 'absolute', bottom: -14, left: -14, width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 10 }}>{card.icon}</div>
                        <p style={{ fontSize: 11, opacity: .85, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: .8 }}>{card.label}</p>
                        <p style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 0' }}>{card.value}</p>
                    </div>
                ))}
            </div>

            {/* ═══ Controls Bar ═══ */}
            <div style={{ background: '#fff', borderRadius: 18, padding: '14px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #f1f5f9', marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                {/* Navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => navigateDays(-viewDays)} title="Previous" style={navBtnStyle}>⏪</button>
                    <button onClick={() => navigateDays(-7)} title="Back 7 days" style={navBtnStyle}>◀️</button>
                    <button onClick={goToday} style={{ ...navBtnStyle, background: '#6366f1', color: '#fff', fontWeight: 700, padding: '6px 16px' }}>Today</button>
                    <button onClick={() => navigateDays(7)} title="Forward 7 days" style={navBtnStyle}>▶️</button>
                    <button onClick={() => navigateDays(viewDays)} title="Next" style={navBtnStyle}>⏩</button>
                </div>

                {/* Date Range Display */}
                <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', padding: '0 10px', borderLeft: '2px solid #e2e8f0', borderRight: '2px solid #e2e8f0' }}>
                    {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {dates.length > 0 ? dates[dates.length - 1].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </div>

                {/* View Toggle */}
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                    {[7, 14, 30].map(d => (
                        <button key={d} onClick={() => setViewDays(d)} style={{
                            padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: viewDays === d ? '#6366f1' : 'transparent',
                            color: viewDays === d ? '#fff' : '#64748b',
                            transition: 'all .15s',
                        }}>{d}D</button>
                    ))}
                </div>

                {/* Separator */}
                <div style={{ flex: 1 }} />

                {/* Filters */}
                <input value={searchRoom} onChange={e => setSearchRoom(e.target.value)} placeholder="🔍 Room..." style={inputStyle} />
                <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} style={inputStyle}>
                    <option value="All">🏢 All Floors</option>
                    {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
                    <option value="All">🏷️ All Types</option>
                    {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            {/* ═══ Legend ═══ */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 16, paddingLeft: 4 }}>
                {Object.entries(barColors).map(([status, c]) => (
                    <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                        <div style={{ width: 18, height: 10, borderRadius: 4, background: c.bg, border: `1.5px solid ${c.border}` }} />
                        {status}
                    </div>
                ))}
            </div>

            {/* ═══ Gantt Calendar Grid ═══ */}
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 2px 12px rgba(0,0,0,.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                {isLoading ? (
                    <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ width: 44, height: 44, border: '4px solid rgba(99,102,241,.2)', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                        <p style={{ color: '#94a3b8' }}>Loading calendar...</p>
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    </div>
                ) : (
                    <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
                        <div style={{ display: 'flex', minWidth: LABEL_W + CELL_W * viewDays }}>
                            {/* Room Labels Column */}
                            <div style={{ width: LABEL_W, minWidth: LABEL_W, position: 'sticky', left: 0, zIndex: 20, background: '#fff', borderRight: '2px solid #e2e8f0' }}>
                                {/* Header cell */}
                                <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#475569', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderBottom: '2px solid #e2e8f0' }}>
                                    🚪 Rooms ({filteredRooms.length})
                                </div>
                                {/* Room rows */}
                                {filteredRooms.map(room => (
                                    <div key={room.room_id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid #f1f5f9', gap: 10, cursor: 'default' }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 10, background: room.status === 'Occupied' ? 'linear-gradient(135deg,#10b981,#34d399)' : room.status === 'Reserved' ? 'linear-gradient(135deg,#6366f1,#818cf8)' : 'linear-gradient(135deg,#22d3ee,#67e8f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                            {room.room_number}
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{room.room_type_name}</div>
                                            <div style={{ fontSize: 10, color: '#94a3b8' }}>Floor {room.floor_number} • {room.bed_type || 'Bed'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Timeline Grid */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                {/* Date Headers */}
                                <div style={{ display: 'flex', height: 56, borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 15, background: '#fff' }}>
                                    {dates.map(date => {
                                        const ds = fmt(date);
                                        const isToday = ds === todayStr;
                                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                        return (
                                            <div key={ds} style={{
                                                width: CELL_W, minWidth: CELL_W, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                background: isToday ? 'linear-gradient(135deg,#6366f1,#818cf8)' : isWeekend ? '#faf5ff' : '#f8fafc',
                                                color: isToday ? '#fff' : isWeekend ? '#7c3aed' : '#475569',
                                                borderRight: '1px solid #f1f5f9', transition: 'background .2s',
                                            }}>
                                                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', opacity: .8 }}>
                                                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                                </span>
                                                <span style={{ fontSize: 17, fontWeight: 800 }}>{date.getDate()}</span>
                                                <span style={{ fontSize: 9, opacity: .7 }}>
                                                    {date.toLocaleDateString('en-US', { month: 'short' })}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Room Rows with Booking Bars */}
                                {filteredRooms.map(room => {
                                    const roomReservations = reservations.filter(r => r.room_id === room.room_id);
                                    return (
                                        <div key={room.room_id} style={{ position: 'relative', height: ROW_H, borderBottom: '1px solid #f1f5f9', display: 'flex' }}>
                                            {/* Background cells (clickable for booking) */}
                                            {dates.map(date => {
                                                const ds = fmt(date);
                                                const isToday = ds === todayStr;
                                                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                                const hasBooking = roomReservations.some(r => r.check_in_date <= ds && r.check_out_date > ds);
                                                return (
                                                    <div key={ds}
                                                        onClick={() => !hasBooking && openQuickBook(room, date)}
                                                        style={{
                                                            width: CELL_W, minWidth: CELL_W, height: ROW_H,
                                                            borderRight: '1px solid #f8fafc',
                                                            background: isToday ? 'rgba(99,102,241,.04)' : isWeekend ? 'rgba(139,92,246,.02)' : 'transparent',
                                                            cursor: hasBooking ? 'default' : 'pointer',
                                                            transition: 'background .15s',
                                                        }}
                                                        onMouseOver={e => { if (!hasBooking) e.currentTarget.style.background = 'rgba(99,102,241,.08)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = isToday ? 'rgba(99,102,241,.04)' : isWeekend ? 'rgba(139,92,246,.02)' : 'transparent'; }}
                                                        title={hasBooking ? '' : `Book Room ${room.room_number} on ${ds}`}
                                                    />
                                                );
                                            })}

                                            {/* Booking Bars (absolute positioned) */}
                                            {roomReservations.map(res => {
                                                const style = getBarStyle(res);
                                                return (
                                                    <div key={res.reservation_id}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedBooking(res); }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: 10,
                                                            left: style.left,
                                                            width: style.width,
                                                            height: ROW_H - 20,
                                                            background: style.background,
                                                            borderRadius: 10,
                                                            border: `2px solid ${style.borderColor}`,
                                                            color: style.color,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '0 10px',
                                                            cursor: 'pointer',
                                                            overflow: 'hidden',
                                                            whiteSpace: 'nowrap',
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            boxShadow: '0 2px 8px rgba(0,0,0,.12)',
                                                            transition: 'transform .12s, box-shadow .12s',
                                                            zIndex: 10,
                                                        }}
                                                        onMouseOver={e => { e.currentTarget.style.transform = 'scaleY(1.12)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.2)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.transform = 'scaleY(1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)'; }}
                                                        title={`${res.guest_name} • ${res.status} • ${res.check_in_date} → ${res.check_out_date}`}
                                                    >
                                                        <span style={{ marginRight: 6 }}>👤</span>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.guest_name}</span>
                                                        {style.width > 140 && <span style={{ marginLeft: 'auto', opacity: .8, fontSize: 10, paddingLeft: 8 }}>{res.nights || ''}🌙</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}

                                {/* Today marker line */}
                                {dates.some(d => fmt(d) === todayStr) && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: dates.findIndex(d => fmt(d) === todayStr) * CELL_W + CELL_W / 2,
                                        width: 2,
                                        height: '100%',
                                        background: 'linear-gradient(to bottom, #6366f1, #a78bfa)',
                                        zIndex: 12,
                                        opacity: 0.6,
                                        pointerEvents: 'none',
                                    }} />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ Booking Detail Modal ═══ */}
            {selectedBooking && (
                <div style={overlayStyle} onClick={() => setSelectedBooking(null)}>
                    <div style={{ ...modalStyle, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                        <div style={{ background: barColors[selectedBooking.status]?.bg || barColors['Pending'].bg, padding: '20px 24px', borderRadius: '20px 20px 0 0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>📋 Booking Details</h2>
                                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: .85 }}>{selectedBooking.reservation_no}</p>
                            </div>
                            <button onClick={() => setSelectedBooking(null)} style={closeBtnStyle}>✕</button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                <InfoBlock icon="👤" label="Guest" value={selectedBooking.guest_name} />
                                <InfoBlock icon="📞" label="Phone" value={selectedBooking.guest_phone || 'N/A'} />
                                <InfoBlock icon="🚪" label="Room" value={`${selectedBooking.room_number} • ${selectedBooking.room_type_name}`} />
                                <InfoBlock icon="📅" label="Check-In" value={selectedBooking.check_in_date} />
                                <InfoBlock icon="📅" label="Check-Out" value={selectedBooking.check_out_date} />
                                <InfoBlock icon="🌙" label="Nights" value={String(selectedBooking.nights || '')} />
                                <InfoBlock icon="💰" label="Total" value={`Ksh ${(selectedBooking.total_amount || 0).toLocaleString()}`} />
                                <InfoBlock icon="💳" label="Advance" value={`Ksh ${(selectedBooking.advance_paid || 0).toLocaleString()}`} />
                                <InfoBlock icon="📍" label="Source" value={selectedBooking.booking_source || 'Direct'} />
                                <InfoBlock icon="⚡" label="Status" value={selectedBooking.status} />
                            </div>
                            {selectedBooking.special_requests && (
                                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 13, color: '#475569' }}>
                                    📝 <strong>Special Requests:</strong> {selectedBooking.special_requests}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {selectedBooking.status === 'Confirmed' && (
                                    <button onClick={() => updateBookingStatus(selectedBooking, 'Checked-In')} style={{ ...actionBtnStyle, background: 'linear-gradient(135deg,#10b981,#34d399)' }}>🔑 Check-In</button>
                                )}
                                {(selectedBooking.status === 'Pending' || selectedBooking.status === 'Confirmed') && (
                                    <button onClick={() => updateBookingStatus(selectedBooking, 'Cancelled')} style={{ ...actionBtnStyle, background: 'linear-gradient(135deg,#ef4444,#f87171)' }}>❌ Cancel</button>
                                )}
                                <button onClick={() => setSelectedBooking(null)} style={{ ...actionBtnStyle, background: '#e2e8f0', color: '#475569' }}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Quick Book Modal ═══ */}
            {quickBook && (
                <div style={overlayStyle} onClick={() => setQuickBook(null)}>
                    <div style={{ ...modalStyle, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div style={{ background: 'linear-gradient(135deg,#6366f1,#a78bfa)', padding: '20px 24px', borderRadius: '20px 20px 0 0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>➕ Quick Book</h2>
                                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: .85 }}>Room {quickBook.room.room_number} • {quickBook.room.room_type_name} • {fmt(quickBook.date)}</p>
                            </div>
                            <button onClick={() => setQuickBook(null)} style={closeBtnStyle}>✕</button>
                        </div>
                        <form onSubmit={handleQuickBook} style={{ padding: 24 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={labelStyle}>👤 Guest Name *</label>
                                    <input value={qbForm.guest_name} onChange={e => setQbForm({ ...qbForm, guest_name: e.target.value })} placeholder="Full Name" required style={fieldStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>📞 Phone</label>
                                    <input value={qbForm.guest_phone} onChange={e => setQbForm({ ...qbForm, guest_phone: e.target.value })} placeholder="0712345678" style={fieldStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>✉️ Email</label>
                                    <input value={qbForm.guest_email} onChange={e => setQbForm({ ...qbForm, guest_email: e.target.value })} placeholder="email@example.com" style={fieldStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>📅 Check-In</label>
                                    <input type="date" value={fmt(quickBook.date)} readOnly style={{ ...fieldStyle, background: '#f1f5f9', color: '#94a3b8' }} />
                                </div>
                                <div>
                                    <label style={labelStyle}>📅 Check-Out *</label>
                                    <input type="date" value={qbForm.check_out_date} onChange={e => setQbForm({ ...qbForm, check_out_date: e.target.value })} min={fmt(quickBook.date)} required style={fieldStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>👥 Adults</label>
                                    <input type="number" value={qbForm.adults} onChange={e => setQbForm({ ...qbForm, adults: parseInt(e.target.value) || 1 })} min={1} style={fieldStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>👶 Children</label>
                                    <input type="number" value={qbForm.children} onChange={e => setQbForm({ ...qbForm, children: parseInt(e.target.value) || 0 })} min={0} style={fieldStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>📍 Source</label>
                                    <select value={qbForm.booking_source} onChange={e => setQbForm({ ...qbForm, booking_source: e.target.value })} style={fieldStyle}>
                                        <option>Direct</option><option>Phone</option><option>Website</option><option>Walk-in</option><option>OTA</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>💰 Advance</label>
                                    <input type="number" value={qbForm.advance_paid} onChange={e => setQbForm({ ...qbForm, advance_paid: parseFloat(e.target.value) || 0 })} min={0} style={fieldStyle} />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={labelStyle}>📝 Special Requests</label>
                                    <textarea value={qbForm.special_requests} onChange={e => setQbForm({ ...qbForm, special_requests: e.target.value })} rows={2} placeholder="Any notes..." style={{ ...fieldStyle, resize: 'vertical' }} />
                                </div>
                            </div>

                            {/* Price Summary */}
                            <div style={{ background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', borderRadius: 14, padding: 16, marginBottom: 20, border: '1px solid #ddd6fe' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#475569' }}>
                                    <span>Rate per night:</span>
                                    <span style={{ fontWeight: 700 }}>Ksh {quickBook.room.room_rate?.toLocaleString()}</span>
                                </div>
                                {qbForm.check_out_date && qbForm.check_out_date > fmt(quickBook.date) && (() => {
                                    const nights = Math.max(1, Math.ceil((new Date(qbForm.check_out_date).getTime() - quickBook.date.getTime()) / 86400000));
                                    const total = quickBook.room.room_rate * nights;
                                    return (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#475569' }}>
                                                <span>Nights:</span><span style={{ fontWeight: 700 }}>{nights} 🌙</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#6366f1', paddingTop: 8, borderTop: '1px solid #ddd6fe' }}>
                                                <span>Total:</span><span>Ksh {total.toLocaleString()}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <button type="button" onClick={() => setQuickBook(null)} style={{ flex: 1, padding: '12px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" disabled={isSaving} style={{ flex: 1, padding: '12px 0', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: isSaving ? .6 : 1 }}>
                                    {isSaving ? '⏳ Booking...' : '📆 Book Now'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && filteredRooms.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <div style={{ fontSize: 56 }}>🏨</div>
                    <p style={{ color: '#94a3b8', fontSize: 16, marginTop: 12 }}>No rooms found matching your filters</p>
                </div>
            )}
        </div>
    );
}

/* ─── Sub-components & Styles ──────────────────────────────────────── */
function InfoBlock({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>{icon} {label}</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>{value}</p>
        </div>
    );
}

const navBtnStyle: React.CSSProperties = {
    padding: '6px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
    background: '#f1f5f9', fontSize: 14, transition: 'background .15s',
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
};

const modalStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 20, width: '100%', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 24px 60px rgba(0,0,0,.2)',
};

const closeBtnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.2)',
    color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const actionBtnStyle: React.CSSProperties = {
    padding: '10px 20px', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700,
    fontSize: 13, cursor: 'pointer', transition: 'transform .1s',
};

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 12, fontSize: 13, outline: 'none', transition: 'border-color .15s', boxSizing: 'border-box',
};

const inputStyle: React.CSSProperties = {
    padding: '7px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10,
    fontSize: 12, outline: 'none', minWidth: 100,
};
