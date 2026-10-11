'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface KOTItem {
    item_id: number;
    product_name: string;
    quantity: number;
    notes: string;
    status: string;
}

interface KOTOrder {
    sale_id: number;
    receipt_no: string;
    table_name: string;
    room_name: string;
    order_type: string;
    waiter_name: string;
    sale_datetime: string;
    kot_number: string;
    customer_name: string;
    status: string;
    items: KOTItem[];
    elapsed: number; // seconds since order placed
}

const STATUS_COLORS: Record<string, string> = {
    Pending:     'from-red-500 to-rose-600',
    Preparing:   'from-amber-400 to-orange-500',
    Ready:       'from-emerald-500 to-green-600',
    Completed:   'from-gray-400 to-gray-500',
};

const STATUS_TEXT: Record<string, string> = {
    Pending:   'PENDING',
    Preparing: 'PREPARING',
    Ready:     'READY',
    Completed: 'DONE',
};

const STATUS_BADGE: Record<string, string> = {
    Pending:   'bg-red-100 text-red-700',
    Preparing: 'bg-amber-100 text-amber-700',
    Ready:     'bg-emerald-100 text-emerald-700',
    Completed: 'bg-gray-100 text-gray-600',
};

function elapsed(dateStr: string): number {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

function fmtElapsed(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function urgencyClass(sec: number, status: string): string {
    if (status === 'Ready' || status === 'Completed') return 'border-emerald-300';
    if (sec >= 900) return 'border-red-500 animate-pulse'; // 15+ min
    if (sec >= 600) return 'border-orange-400'; // 10+ min
    if (sec >= 300) return 'border-amber-400'; // 5+ min
    return 'border-gray-200';
}

export default function KitchenDisplayPage() {
    const [orders, setOrders] = useState<KOTOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'All' | 'Pending' | 'Preparing' | 'Ready'>('All');
    const [filterSection, setFilterSection] = useState('All');
    const [tick, setTick] = useState(0);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const prevCountRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);

    // Play a beep sound when new orders arrive
    const playBeep = useCallback(() => {
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch { /* browser blocked */ }
    }, []);

    const loadOrders = useCallback(async () => {
        try {
            // Load today's pending/preparing/ready orders
            const today = new Date().toISOString().split('T')[0];
            const { data: salesData, error } = await supabase
                .from('sales')
                .select('sale_id, receipt_no, table_name, room_name, order_type, waiter_name, sale_datetime, kot_number, customer_name, status')
                .gte('sale_datetime', `${today}T00:00:00`)
                .in('status', ['Pending', 'Preparing', 'Ready'])
                .order('sale_datetime', { ascending: true });

            if (error) throw error;

            if (!salesData || salesData.length === 0) {
                setOrders([]);
                setLoading(false);
                return;
            }

            // Load items for all these sales in one query
            const saleIds = salesData.map((s: any) => s.sale_id);
            const { data: itemsData } = await supabase
                .from('sales_items')
                .select('item_id, sale_id, product_name, quantity, notes, status')
                .in('sale_id', saleIds);

            const itemsMap = new Map<number, KOTItem[]>();
            (itemsData || []).forEach((item: any) => {
                if (!itemsMap.has(item.sale_id)) itemsMap.set(item.sale_id, []);
                itemsMap.get(item.sale_id)!.push({
                    item_id: item.item_id,
                    product_name: item.product_name,
                    quantity: item.quantity,
                    notes: item.notes || '',
                    status: item.status || 'Pending',
                });
            });

            const built: KOTOrder[] = salesData.map((s: any) => ({
                sale_id: s.sale_id,
                receipt_no: s.receipt_no,
                table_name: s.table_name || '',
                room_name: s.room_name || '',
                order_type: s.order_type || 'Dine In',
                waiter_name: s.waiter_name || 'N/A',
                sale_datetime: s.sale_datetime,
                kot_number: s.kot_number || `KOT-${s.sale_id}`,
                customer_name: s.customer_name || '',
                status: s.status,
                items: itemsMap.get(s.sale_id) || [],
                elapsed: elapsed(s.sale_datetime),
            }));

            // Check if new orders arrived → beep
            if (built.length > prevCountRef.current && prevCountRef.current > 0) {
                playBeep();
                toast('🔔 New order received!', { icon: '🍽️' });
            }
            prevCountRef.current = built.length;
            setOrders(built);
        } catch (err: any) {
            console.error('KDS load error:', err);
        }
        setLoading(false);
    }, [playBeep]);

    // Live clock tick — updates elapsed times every second
    useEffect(() => {
        const t = setInterval(() => setTick(x => x + 1), 1000);
        return () => clearInterval(t);
    }, []);

    // Auto-refresh orders every 15s
    useEffect(() => {
        loadOrders();
        if (!autoRefresh) return;
        const t = setInterval(loadOrders, 15000);
        return () => clearInterval(t);
    }, [loadOrders, autoRefresh]);

    const updateOrderStatus = async (saleId: number, newStatus: string) => {
        setUpdatingId(saleId);
        const { error } = await supabase
            .from('sales')
            .update({ status: newStatus })
            .eq('sale_id', saleId);

        if (error) {
            toast.error('Failed to update order status');
        } else {
            toast.success(`Order marked as ${newStatus}`);
            setOrders(prev => prev.map(o =>
                o.sale_id === saleId ? { ...o, status: newStatus } : o
            ));
        }
        setUpdatingId(null);
    };

    const bumpOrder = (order: KOTOrder) => {
        if (order.status === 'Pending') updateOrderStatus(order.sale_id, 'Preparing');
        else if (order.status === 'Preparing') updateOrderStatus(order.sale_id, 'Ready');
        else if (order.status === 'Ready') updateOrderStatus(order.sale_id, 'Completed');
    };

    // Get unique sections (tables/rooms)
    const sections = Array.from(new Set(orders.map(o => o.table_name || o.room_name || 'Takeaway').filter(Boolean)));

    const filtered = orders.filter(o => {
        if (filterStatus !== 'All' && o.status !== filterStatus) return false;
        if (filterSection !== 'All') {
            const loc = o.table_name || o.room_name || 'Takeaway';
            if (loc !== filterSection) return false;
        }
        return true;
    });

    const pendingCount = orders.filter(o => o.status === 'Pending').length;
    const preparingCount = orders.filter(o => o.status === 'Preparing').length;
    const readyCount = orders.filter(o => o.status === 'Ready').length;
    const avgWait = orders.length > 0
        ? Math.floor(orders.reduce((s, o) => s + elapsed(o.sale_datetime), 0) / orders.length / 60)
        : 0;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        🍳
                    </span>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Kitchen Display System</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Live order board — auto-refreshes every 15 seconds</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setAutoRefresh(v => !v)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${autoRefresh ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                        {autoRefresh ? '🟢 Live' : '⏸️ Paused'}
                    </button>
                    <button
                        onClick={() => { setLoading(true); loadOrders(); }}
                        className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🔴</span>
                    <p className="text-sm opacity-80 mt-2">Pending Orders</p>
                    <p className="text-4xl font-black mt-1">{pendingCount}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🟡</span>
                    <p className="text-sm opacity-80 mt-2">In Preparation</p>
                    <p className="text-4xl font-black mt-1">{preparingCount}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm opacity-80 mt-2">Ready to Serve</p>
                    <p className="text-4xl font-black mt-1">{readyCount}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">⏱️</span>
                    <p className="text-sm opacity-80 mt-2">Avg Wait Time</p>
                    <p className="text-4xl font-black mt-1">{avgWait}<span className="text-xl font-normal">min</span></p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">Status:</span>
                    {(['All', 'Pending', 'Preparing', 'Ready'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                filterStatus === s
                                    ? s === 'Pending' ? 'bg-red-500 text-white'
                                    : s === 'Preparing' ? 'bg-amber-500 text-white'
                                    : s === 'Ready' ? 'bg-emerald-500 text-white'
                                    : 'bg-gray-800 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Section:</span>
                    <select
                        value={filterSection}
                        onChange={e => setFilterSection(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none"
                    >
                        <option value="All">All Sections</option>
                        {sections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="ml-auto text-xs text-gray-400">
                    Showing <span className="font-bold text-gray-700">{filtered.length}</span> orders
                </div>
            </div>

            {/* Color legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="font-semibold">Urgency:</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-gray-300 inline-block"></span> &lt;5 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-amber-400 inline-block"></span> 5-10 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-orange-400 inline-block"></span> 10-15 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-red-500 inline-block animate-pulse"></span> 15+ min URGENT</span>
            </div>

            {/* Order Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading kitchen orders...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border py-24 text-center">
                    <div className="text-6xl mb-4">🍽️</div>
                    <p className="text-xl font-bold text-gray-400">All Clear!</p>
                    <p className="text-sm text-gray-400 mt-1">No active kitchen orders right now</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map(order => {
                        const sec = elapsed(order.sale_datetime) + tick * 0; // tick triggers re-render
                        const actualSec = elapsed(order.sale_datetime);
                        const loc = order.table_name || order.room_name || 'Takeaway';
                        const nextStatus = order.status === 'Pending' ? '▶ Start Prep' : order.status === 'Preparing' ? '✅ Mark Ready' : order.status === 'Ready' ? '🍽️ Served' : '';

                        return (
                            <div
                                key={order.sale_id}
                                className={`bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-md transition-all ${urgencyClass(actualSec, order.status)}`}
                            >
                                {/* KOT Header */}
                                <div className={`bg-gradient-to-r ${STATUS_COLORS[order.status] || 'from-gray-400 to-gray-500'} px-4 py-3 text-white`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs opacity-80 font-semibold">{order.kot_number}</p>
                                            <p className="text-lg font-black">{loc}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-2xl font-black tabular-nums ${actualSec >= 900 ? 'text-yellow-300' : ''}`}>
                                                {fmtElapsed(actualSec + tick * 0 - tick * 0)}
                                                {/* re-render trick */}
                                                {tick >= 0 ? '' : ''}
                                                {fmtElapsed(elapsed(order.sale_datetime))}
                                            </p>
                                            <p className="text-xs opacity-80">elapsed</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs opacity-90">
                                        <span>👨‍🍳 {order.waiter_name}</span>
                                        <span>•</span>
                                        <span>🍽️ {order.order_type}</span>
                                        {order.customer_name && <><span>•</span><span>👤 {order.customer_name}</span></>}
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="divide-y divide-gray-100">
                                    {order.items.length > 0 ? (
                                        order.items.map((item, idx) => (
                                            <div key={idx} className="flex items-start gap-3 px-4 py-3">
                                                <span className="w-8 h-8 bg-gray-800 text-white rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0">
                                                    {item.quantity}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-800 text-sm">{item.product_name}</p>
                                                    {item.notes && (
                                                        <p className="text-xs text-orange-600 mt-0.5 font-medium">⚠️ {item.notes}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-4 py-4 text-xs text-gray-400 text-center">No items loaded</div>
                                    )}
                                </div>

                                {/* Footer Actions */}
                                <div className="px-4 pb-4 pt-2 flex gap-2">
                                    {nextStatus && order.status !== 'Completed' && (
                                        <button
                                            onClick={() => bumpOrder(order)}
                                            disabled={updatingId === order.sale_id}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50
                                                ${order.status === 'Pending' ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                                                : order.status === 'Preparing' ? 'bg-gradient-to-r from-emerald-500 to-green-600'
                                                : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`}
                                        >
                                            {updatingId === order.sale_id ? '⏳ Updating...' : nextStatus}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => updateOrderStatus(order.sale_id, 'Pending')}
                                        className="px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-all"
                                        title="Reset to Pending"
                                    >
                                        ↩️
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
