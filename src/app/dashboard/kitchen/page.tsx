'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface KOTItem {
  item_id: number;
  sale_id: number;
  product_name: string;
  quantity: number;
  notes: string;
  status: string; // 'Pending' | 'Preparing' | 'Ready' | 'Done'
  done?: boolean;
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
  status: string; // 'Pending' | 'Preparing' | 'Ready' | 'Completed'
  items: KOTItem[];
  elapsed: number; // seconds
}

export default function MasterKitchenDisplaySystem() {
  const [orders, setOrders] = useState<KOTOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<KOTOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStation, setFilterStation] = useState<'All' | 'Grill' | 'Hot Kitchen' | 'Bar' | 'Pantry'>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Pending' | 'Preparing' | 'Ready'>('All');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const prevCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Dual-tone kitchen dinner bell chime
  const playKitchenChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      // Tone 1: High crisp ding (784 Hz - G5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(784, now);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      // Tone 2: Warm acoustic resonance (1046 Hz - C6)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046, now + 0.12);
      gain2.gain.setValueAtTime(0.35, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.9);
    } catch {
      // Audio autoplay policy handled
    }
  }, []);

  const enableAudio = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      setAudioEnabled(true);
      playKitchenChime();
      toast.success('Kitchen chime sound enabled! 🔔', {
        style: { background: '#0a1219', color: '#00e676', border: '1px solid #162a2e' }
      });
    } catch {
      setAudioEnabled(true);
    }
  };

  // Comprehensive Query: Loads active orders from today / last 24h
  const loadKitchenOrders = useCallback(async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch sales that are active in kitchen
      const { data: salesData, error } = await supabase
        .from('sales')
        .select('*')
        .or(`created_at.gte.${twentyFourHoursAgo},sale_date.eq.${today}`)
        .order('sale_id', { ascending: true });

      if (error) {
        console.error('Error fetching kitchen orders:', error);
        setLoading(false);
        return;
      }

      if (!salesData || salesData.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Filter for active non-completed kitchen tickets (or completed in last 2 hours for recall)
      const activeSales = salesData.filter(s => {
        const st = (s.status || '').toLowerCase();
        return st === 'pending' || st === 'preparing' || st === 'ready' || st === 'open' || st === 'unpaid';
      });

      const bumpedSales = salesData.filter(s => {
        const st = (s.status || '').toLowerCase();
        return st === 'completed' || st === 'done';
      }).slice(-16);

      // Load all items for these sales
      const allSaleIds = [...activeSales.map(s => s.sale_id), ...bumpedSales.map(s => s.sale_id)];
      let itemsMap: Record<number, KOTItem[]> = {};

      if (allSaleIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('sales_items')
          .select('*')
          .in('sale_id', allSaleIds);

        if (itemsData) {
          itemsData.forEach((item: any) => {
            if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
            itemsMap[item.sale_id].push({
              item_id: item.item_id,
              sale_id: item.sale_id,
              product_name: item.product_name,
              quantity: item.quantity,
              notes: item.notes || '',
              status: item.status || 'Pending',
              done: item.status === 'Ready' || item.status === 'Done',
            });
          });
        }
      }

      // Map active KOT orders
      const builtOrders: KOTOrder[] = activeSales.map(s => {
        const orderTime = s.sale_datetime || s.created_at || new Date().toISOString();
        const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(orderTime).getTime()) / 1000));
        let normalizedStatus = s.status;
        if (normalizedStatus === 'Open' || normalizedStatus === 'Unpaid') normalizedStatus = 'Pending';

        return {
          sale_id: s.sale_id,
          receipt_no: s.receipt_no,
          table_name: s.table_name || '',
          room_name: s.room_name || '',
          order_type: s.order_type || 'Dine In',
          waiter_name: s.waiter_name || s.created_by || 'Server',
          sale_datetime: orderTime,
          kot_number: s.kot_number || `KOT-#${s.sale_id}`,
          customer_name: s.customer_name || '',
          status: normalizedStatus,
          items: itemsMap[s.sale_id] || [],
          elapsed: elapsedSec,
        };
      });

      // Map recalled / bumped orders
      const builtBumped: KOTOrder[] = bumpedSales.map(s => {
        const orderTime = s.sale_datetime || s.created_at || new Date().toISOString();
        const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(orderTime).getTime()) / 1000));
        return {
          sale_id: s.sale_id,
          receipt_no: s.receipt_no,
          table_name: s.table_name || '',
          room_name: s.room_name || '',
          order_type: s.order_type || 'Dine In',
          waiter_name: s.waiter_name || s.created_by || 'Server',
          sale_datetime: orderTime,
          kot_number: s.kot_number || `KOT-#${s.sale_id}`,
          customer_name: s.customer_name || '',
          status: 'Completed',
          items: itemsMap[s.sale_id] || [],
          elapsed: elapsedSec,
        };
      });

      // Play acoustic chime if a new ticket arrived
      if (builtOrders.length > prevCountRef.current && prevCountRef.current > 0) {
        playKitchenChime();
        toast('🔔 New Kitchen Order Placed!', {
          icon: '👨‍🍳',
          style: { background: '#0a1219', color: '#00e676', border: '1px solid #162a2e' }
        });
      }
      prevCountRef.current = builtOrders.length;

      setOrders(builtOrders);
      setCompletedOrders(builtBumped.reverse());
    } catch (err) {
      console.error('KDS load error:', err);
    } finally {
      setLoading(false);
    }
  }, [playKitchenChime]);

  // Initial load and live polling every 7 seconds
  useEffect(() => {
    loadKitchenOrders();
    const interval = setInterval(loadKitchenOrders, 7000);
    return () => clearInterval(interval);
  }, [loadKitchenOrders]);

  // Second-by-second elapsed timer update
  useEffect(() => {
    const timer = setInterval(() => {
      setOrders(prev =>
        prev.map(o => ({
          ...o,
          elapsed: Math.max(0, Math.floor((Date.now() - new Date(o.sale_datetime).getTime()) / 1000)),
        }))
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Toggle individual item strike-through (Check off item as cooked)
  const toggleItemDone = (orderId: number, itemId: number) => {
    setOrders(prev =>
      prev.map(order => {
        if (order.sale_id !== orderId) return order;
        return {
          ...order,
          items: order.items.map(item =>
            item.item_id === itemId ? { ...item, done: !item.done } : item
          ),
        };
      })
    );
  };

  // Bump / Progress Order Status
  const bumpOrder = async (order: KOTOrder) => {
    setUpdatingId(order.sale_id);
    let nextStatus = 'Preparing';
    if (order.status === 'Pending') nextStatus = 'Preparing';
    else if (order.status === 'Preparing') nextStatus = 'Ready';
    else if (order.status === 'Ready') nextStatus = 'Completed';

    try {
      const { error } = await supabase
        .from('sales')
        .update({ status: nextStatus })
        .eq('sale_id', order.sale_id);

      if (error) {
        toast.error('Failed to bump ticket: ' + error.message);
      } else {
        if (nextStatus === 'Ready') {
          playKitchenChime();
          toast.success(`Order #${order.kot_number} is READY! Waiter notified.`, {
            style: { background: '#0a1e17', color: '#00e676', border: '1px solid #00e676' }
          });
        } else if (nextStatus === 'Completed') {
          toast.success(`Ticket #${order.kot_number} bumped to archive.`, {
            style: { background: '#0a1219', color: '#fff', border: '1px solid #162a2e' }
          });
        }

        // Local state update for instant UI feedback
        if (nextStatus === 'Completed') {
          setOrders(prev => prev.filter(o => o.sale_id !== order.sale_id));
          setCompletedOrders(prev => [{ ...order, status: 'Completed' }, ...prev]);
        } else {
          setOrders(prev =>
            prev.map(o => (o.sale_id === order.sale_id ? { ...o, status: nextStatus } : o))
          );
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Restore bumped order
  const restoreOrder = async (order: KOTOrder) => {
    try {
      const { error } = await supabase
        .from('sales')
        .update({ status: 'Preparing' })
        .eq('sale_id', order.sale_id);

      if (error) {
        toast.error('Could not restore ticket');
      } else {
        toast.success(`Order #${order.kot_number} restored to Preparing.`);
        setCompletedOrders(prev => prev.filter(o => o.sale_id !== order.sale_id));
        setOrders(prev => [{ ...order, status: 'Preparing' }, ...prev]);
        setShowRecallModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Format Elapsed Time (MM:SS)
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Station filtering
  const filteredOrders = orders.filter(o => {
    if (filterStatus !== 'All' && o.status !== filterStatus) return false;
    if (filterStation === 'Grill') {
      return o.items.some(i => i.product_name.toLowerCase().includes('choma') || i.product_name.toLowerCase().includes('meat') || i.product_name.toLowerCase().includes('mbuzi') || i.product_name.toLowerCase().includes('beef') || i.product_name.toLowerCase().includes('grill'));
    }
    if (filterStation === 'Bar') {
      return o.items.some(i => i.product_name.toLowerCase().includes('beer') || i.product_name.toLowerCase().includes('tusker') || i.product_name.toLowerCase().includes('wine') || i.product_name.toLowerCase().includes('soda') || i.product_name.toLowerCase().includes('water') || i.product_name.toLowerCase().includes('juice'));
    }
    if (filterStation === 'Hot Kitchen') {
      return o.items.some(i => !i.product_name.toLowerCase().includes('beer') && !i.product_name.toLowerCase().includes('tusker') && !i.product_name.toLowerCase().includes('wine') && !i.product_name.toLowerCase().includes('soda'));
    }
    return true;
  });

  const pendingCount = orders.filter(o => o.status === 'Pending').length;
  const preparingCount = orders.filter(o => o.status === 'Preparing').length;
  const readyCount = orders.filter(o => o.status === 'Ready').length;

  return (
    <div className="min-h-screen bg-[#060b0f] text-gray-100 p-3 sm:p-5 -m-4 sm:-m-6 space-y-4 select-none font-sans relative overflow-x-hidden">
      
      {/* Background Cyber Emerald Glow Accents */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00e676]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* ==================================================================== */}
      {/* 1. SUPER EMERALD TOP COMMAND BAR                                     */}
      {/* ==================================================================== */}
      <div className="relative bg-[#0a1219]/90 backdrop-blur-2xl border border-[#162a2e] rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-2xl shadow-emerald-950/20">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00e676] via-emerald-500 to-teal-700 flex items-center justify-center text-black text-2xl shadow-lg shadow-[#00e676]/20 flex-shrink-0 font-bold border border-[#00e676]/30">
            👨‍🍳
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>AlphaPlus</span>
                <span className="text-[#00e676] drop-shadow-[0_0_12px_rgba(0,230,118,0.4)]">KDS Pass</span>
              </h1>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-[#00e676] border border-[#00e676]/40 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
                Live Cyber Cook Line
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-2 font-mono flex-wrap">
              <span className="text-[#00e676] font-bold bg-[#132029] px-2 py-0.5 rounded-md border border-[#162a2e]">
                {liveTime.toLocaleTimeString('en-GB')} EAT
              </span>
              <span>•</span>
              <span className="text-gray-300 font-semibold">{orders.length} Active Orders on Pass</span>
              <span>•</span>
              <span className="text-emerald-400/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Auto-Live
              </span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {!audioEnabled ? (
            <button
              onClick={enableAudio}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black rounded-xl text-xs font-black shadow-lg shadow-amber-950/40 transition-all flex items-center gap-1.5 animate-bounce active:scale-95"
            >
              🔔 Enable Chime
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-[#0e1721] text-[#00e676] border border-[#00e676]/40 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
              Chime Active
            </span>
          )}

          <button
            onClick={() => setShowRecallModal(true)}
            className="px-3.5 py-2 bg-[#0e1721] hover:bg-[#132029] text-gray-200 border border-[#162a2e] hover:border-[#00e676]/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
          >
            ↩ Recall Bumped ({completedOrders.length})
          </button>

          <button
            onClick={() => { setLoading(true); loadKitchenOrders(); }}
            className="px-3.5 py-2 bg-[#0e1721] hover:bg-[#132029] text-gray-200 border border-[#162a2e] hover:border-[#00e676]/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
          >
            ↻ Refresh
          </button>

          <Link
            href="/dashboard/pos"
            className="px-3.5 py-2 bg-gradient-to-r from-[#00e676] to-emerald-600 hover:from-[#00c853] hover:to-emerald-500 text-black rounded-xl text-xs font-black transition-all flex items-center gap-1 shadow-md shadow-[#00e676]/20 active:scale-95"
          >
            POS Terminal →
          </Link>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. STATION & STATUS FILTER BAR (SUPER EMERALD STRIP)                 */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#0a1219]/90 border border-[#162a2e] backdrop-blur-xl rounded-2xl p-3 px-4 shadow-xl">
        {/* Stations Filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase text-[#00e676] mr-1 tracking-wider flex items-center gap-1">
            <span>🔥</span> Station:
          </span>
          {(['All', 'Hot Kitchen', 'Grill', 'Bar', 'Pantry'] as const).map(st => (
            <button
              key={st}
              onClick={() => setFilterStation(st)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                filterStation === st
                  ? 'bg-gradient-to-r from-[#00e676] to-emerald-500 text-black border-transparent shadow-md shadow-[#00e676]/30 font-black'
                  : 'bg-[#0e1721] text-gray-300 border-[#162a2e] hover:border-[#00e676]/40 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Status Counters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('All')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
              filterStatus === 'All'
                ? 'bg-[#132029] text-white border-[#00e676]/40 shadow-sm'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            All ({orders.length})
          </button>
          <button
            onClick={() => setFilterStatus('Pending')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filterStatus === 'Pending'
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-sm shadow-rose-950/40'
                : 'text-rose-400 border-rose-500/20 bg-rose-950/20 hover:bg-rose-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('Preparing')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filterStatus === 'Preparing'
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-950/40'
                : 'text-amber-400 border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Cooking ({preparingCount})
          </button>
          <button
            onClick={() => setFilterStatus('Ready')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
              filterStatus === 'Ready'
                ? 'bg-emerald-950/90 text-[#00e676] border-[#00e676]/60 shadow-sm shadow-[#00e676]/20'
                : 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20 hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#00e676]" />
            Ready ({readyCount})
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. ORDER CARDS GRID (WORLD-CLASS CYBER EMERALD THEME)                */}
      {/* ==================================================================== */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-28 text-gray-500 space-y-3">
          <div className="w-10 h-10 border-3 border-[#00e676] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-gray-400 font-mono">Syncing Cook Line Pass...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-[#0a1219] border border-[#162a2e] rounded-3xl p-16 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-20 h-20 rounded-3xl bg-[#00e676]/10 border border-[#00e676]/30 flex items-center justify-center text-4xl mx-auto shadow-inner">
            🍽️
          </div>
          <h2 className="text-2xl font-black text-white">All Kitchen Orders Cleared</h2>
          <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            The cook line is running smoothly and tickets are clear. New dining, room service, and bar orders will pop up in real-time with an acoustic bell chime.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map(order => {
            const isLate = order.elapsed >= 900; // 15+ mins
            const isWarning = order.elapsed >= 600 && order.elapsed < 900; // 10-15 mins

            // Card border & header theme colors based on state
            let borderStyle = 'border-[#162a2e] hover:border-[#00e676]/40';
            let headerBg = 'bg-[#0e1721] text-gray-200 border-b border-[#162a2e]';
            let timerColor = 'text-[#00e676]';

            if (order.status === 'Ready') {
              borderStyle = 'border-[#00e676] shadow-xl shadow-[#00e676]/20 bg-gradient-to-b from-[#00e676]/5 to-transparent';
              headerBg = 'bg-gradient-to-r from-emerald-950/90 to-[#0e241e] text-[#00e676] border-b border-[#00e676]/30';
              timerColor = 'text-[#00e676]';
            } else if (order.status === 'Preparing') {
              borderStyle = isLate
                ? 'border-rose-500 animate-pulse shadow-lg shadow-rose-950/50'
                : 'border-amber-500/60 shadow-lg shadow-amber-950/30';
              headerBg = 'bg-gradient-to-r from-amber-950/80 to-[#1e1a12] text-amber-300 border-b border-amber-500/30';
              timerColor = isLate ? 'text-rose-400 font-black' : 'text-amber-400';
            } else {
              // Pending
              borderStyle = isLate
                ? 'border-rose-500 animate-pulse shadow-lg shadow-rose-950/50'
                : 'border-rose-500/50 shadow-lg shadow-rose-950/30';
              headerBg = 'bg-gradient-to-r from-rose-950/80 to-[#221015] text-rose-300 border-b border-rose-500/30';
              timerColor = isLate ? 'text-rose-400 font-black' : 'text-rose-300';
            }

            const locationLabel = order.table_name
              ? `TABLE ${order.table_name.toUpperCase()}`
              : order.room_name
              ? `ROOM ${order.room_name.toUpperCase()}`
              : order.order_type.toUpperCase();

            return (
              <div
                key={order.sale_id}
                className={`bg-[#0a1219] rounded-2xl border-2 ${borderStyle} shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-200`}
              >
                {/* Ticket Header */}
                <div>
                  <div className={`p-3.5 ${headerBg} flex items-center justify-between gap-2`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-black tracking-wide text-white">
                          {locationLabel}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-black/60 px-2 py-0.5 rounded text-[#00e676] border border-[#162a2e]">
                          {order.kot_number}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 mt-1 truncate">
                        Server: <strong className="text-white">{order.waiter_name}</strong>
                      </p>
                    </div>

                    {/* Digital Elapsed Timer */}
                    <div className="text-right flex-shrink-0">
                      <span className={`text-base font-black font-mono tracking-tight ${timerColor}`}>
                        {formatTime(order.elapsed)}
                      </span>
                      <p className="text-[9px] uppercase font-bold text-gray-400 mt-0.5">
                        {isLate ? '⚠️ DELAY' : order.status}
                      </p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="p-3.5 space-y-2">
                    {order.items.length === 0 ? (
                      <p className="text-xs text-gray-500 italic py-2">No item lines on this check</p>
                    ) : (
                      order.items.map(item => (
                        <div
                          key={item.item_id}
                          onClick={() => toggleItemDone(order.sale_id, item.item_id)}
                          className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 border ${
                            item.done
                              ? 'bg-[#060b0f]/60 border-transparent opacity-40 line-through text-gray-500'
                              : 'bg-[#0e1721] hover:bg-[#132029] border-[#162a2e] hover:border-[#00e676]/30 text-gray-100 shadow-sm'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              item.done
                                ? 'bg-[#00e676] border-[#00e676] text-black font-black text-xs'
                                : 'border-[#162a2e] bg-[#132029]'
                            }`}
                          >
                            {item.done ? '✓' : ''}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold leading-snug">
                              <span className="text-[#00e676] font-black font-mono mr-1.5 text-sm">
                                {item.quantity}x
                              </span>
                              {item.product_name}
                            </p>
                            {item.notes && (
                              <p className="text-[10px] font-bold text-amber-300 mt-1 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 inline-block shadow-sm">
                                📝 {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Ticket Footer Action Button */}
                <div className="p-3 bg-[#060b0f] border-t border-[#142226]">
                  {order.status === 'Pending' && (
                    <button
                      onClick={() => bumpOrder(order)}
                      disabled={updatingId === order.sale_id}
                      className="w-full py-2.5 rounded-xl font-black text-xs bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-950/50 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <span>👨‍🍳 START PREPARING</span>
                    </button>
                  )}

                  {order.status === 'Preparing' && (
                    <button
                      onClick={() => bumpOrder(order)}
                      disabled={updatingId === order.sale_id}
                      className="w-full py-2.5 rounded-xl font-black text-xs bg-gradient-to-r from-[#00e676] to-emerald-500 hover:from-[#00c853] hover:to-emerald-400 text-black shadow-lg shadow-[#00e676]/30 transition-all flex items-center justify-center gap-1.5 active:scale-95 animate-pulse"
                    >
                      <span>🔔 MARK READY &amp; CHIME</span>
                    </button>
                  )}

                  {order.status === 'Ready' && (
                    <button
                      onClick={() => bumpOrder(order)}
                      disabled={updatingId === order.sale_id}
                      className="w-full py-2.5 rounded-xl font-black text-xs bg-[#132029] hover:bg-[#1a2b37] text-white border border-[#162a2e] hover:border-[#00e676]/40 shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <span>✓ BUMP / COMPLETE TICKET</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. RECALL BUMPED TICKETS MODAL (SUPER EMERALD GLASS)                 */}
      {/* ==================================================================== */}
      {showRecallModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a1219] border border-[#162a2e] rounded-3xl max-w-2xl w-full p-6 text-white space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#142226]">
              <div className="flex items-center gap-2.5">
                <span className="text-xl text-[#00e676]">↩</span>
                <div>
                  <h3 className="text-base font-black text-white">Recently Bumped &amp; Completed Tickets</h3>
                  <p className="text-xs text-gray-400">Restore accidentally completed kitchen tickets to active pass</p>
                </div>
              </div>
              <button
                onClick={() => setShowRecallModal(false)}
                className="w-8 h-8 rounded-full bg-[#132029] text-gray-300 hover:text-white hover:bg-[#1a2b37] flex items-center justify-center border border-white/5"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
              {completedOrders.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-12">No completed orders in recent history</p>
              ) : (
                completedOrders.map(ord => (
                  <div
                    key={ord.sale_id}
                    className="p-3.5 rounded-2xl bg-[#0e1721] border border-[#162a2e] flex items-center justify-between gap-3 text-xs shadow-sm hover:border-[#00e676]/30 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white">
                          {ord.table_name ? `Table ${ord.table_name}` : ord.room_name ? `Room ${ord.room_name}` : ord.order_type}
                        </span>
                        <span className="font-mono text-[#00e676] bg-black/60 px-1.5 py-0.5 rounded border border-[#162a2e]">
                          {ord.kot_number}
                        </span>
                        <span className="text-gray-400">• Server: {ord.waiter_name}</span>
                      </div>
                      <p className="text-gray-400 mt-1.5 text-[11px]">
                        {ord.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ') || 'No items listed'}
                      </p>
                    </div>

                    <button
                      onClick={() => restoreOrder(ord)}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-[#00e676] to-emerald-600 hover:from-[#00c853] hover:to-emerald-500 text-black font-black rounded-xl text-xs flex-shrink-0 shadow-md shadow-[#00e676]/20 transition-all active:scale-95"
                    >
                      Restore to Pass
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#142226] text-right">
              <button
                onClick={() => setShowRecallModal(false)}
                className="px-4 py-2 bg-[#132029] hover:bg-[#1a2b37] text-gray-300 hover:text-white rounded-xl text-xs font-bold border border-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
