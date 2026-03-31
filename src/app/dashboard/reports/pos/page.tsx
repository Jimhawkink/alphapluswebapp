'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface ShiftReport {
    shift_id: number;
    shift_type: string;
    start_time: string;
    end_time: string;
    opening_cash: number;
    closing_cash: number;
    status: string;
    opened_by: string;
    closed_by: string;
    totalSales: number;
    cashSales: number;
    mpesaSales: number;
    creditSales: number;
    orderCount: number;
}

export default function POSReportsPage() {
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [shifts, setShifts] = useState<ShiftReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([]);
    const [dailySales, setDailySales] = useState<{ date: string; total: number; orders: number }[]>([]);

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Load shifts
            const { data: shiftData } = await supabase
                .from('shifts')
                .select('shift_id, shift_type, start_time, end_time, opening_cash, closing_cash, status, opened_by, closed_by')
                .gte('start_time', `${dateFrom}T00:00:00`)
                .lte('start_time', `${dateTo}T23:59:59`)
                .order('start_time', { ascending: false });

            // 2. Load completed sales for the period
            const { data: salesData } = await supabase
                .from('sales')
                .select('sale_id, sale_datetime, total_amount, payment_method, status, shift_id')
                .gte('sale_datetime', `${dateFrom}T00:00:00`)
                .lte('sale_datetime', `${dateTo}T23:59:59`)
                .eq('status', 'Completed');

            // 3. Load top selling products
            const { data: itemsData } = await supabase
                .from('sales_items')
                .select('product_name, quantity, subtotal, sale_id, sales!inner(sale_datetime, status)')
                .gte('sales.sale_datetime', `${dateFrom}T00:00:00`)
                .lte('sales.sale_datetime', `${dateTo}T23:59:59`)
                .eq('sales.status', 'Completed');

            // Build shift reports
            const shiftMap = new Map<number, { total: number; cash: number; mpesa: number; credit: number; orders: number }>();
            (salesData || []).forEach((s: any) => {
                const sid = s.shift_id || 0;
                const cur = shiftMap.get(sid) || { total: 0, cash: 0, mpesa: 0, credit: 0, orders: 0 };
                cur.total += s.total_amount || 0;
                cur.orders++;
                if (s.payment_method === 'Cash') cur.cash += s.total_amount || 0;
                else if (s.payment_method === 'Mpesa') cur.mpesa += s.total_amount || 0;
                else if (s.payment_method === 'Credit') cur.credit += s.total_amount || 0;
                shiftMap.set(sid, cur);
            });

            const shiftReports: ShiftReport[] = (shiftData || []).map((sh: any) => {
                const sm = shiftMap.get(sh.shift_id) || { total: 0, cash: 0, mpesa: 0, credit: 0, orders: 0 };
                return {
                    shift_id: sh.shift_id,
                    shift_type: sh.shift_type || 'Day',
                    start_time: sh.start_time || '',
                    end_time: sh.end_time || '',
                    opening_cash: sh.opening_cash || 0,
                    closing_cash: sh.closing_cash || 0,
                    status: sh.status || 'Open',
                    opened_by: sh.opened_by || '',
                    closed_by: sh.closed_by || '',
                    totalSales: sm.total,
                    cashSales: sm.cash,
                    mpesaSales: sm.mpesa,
                    creditSales: sm.credit,
                    orderCount: sm.orders,
                };
            });
            setShifts(shiftReports);

            // Build top products
            const prodMap = new Map<string, { qty: number; revenue: number }>();
            (itemsData || []).forEach((item: any) => {
                const cur = prodMap.get(item.product_name) || { qty: 0, revenue: 0 };
                cur.qty += item.quantity || 0;
                cur.revenue += item.subtotal || 0;
                prodMap.set(item.product_name, cur);
            });
            const topProds = Array.from(prodMap.entries())
                .map(([name, v]) => ({ name, ...v }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10);
            setTopProducts(topProds);

            // Build daily sales
            const dayMap = new Map<string, { total: number; orders: number }>();
            (salesData || []).forEach((s: any) => {
                const day = s.sale_datetime?.split('T')[0] || '';
                const cur = dayMap.get(day) || { total: 0, orders: 0 };
                cur.total += s.total_amount || 0;
                cur.orders++;
                dayMap.set(day, cur);
            });
            const dailyArr = Array.from(dayMap.entries())
                .map(([date, v]) => ({ date, ...v }))
                .sort((a, b) => a.date.localeCompare(b.date));
            setDailySales(dailyArr);

        } catch (err) { console.error(err); }
        setLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadReport(); }, [loadReport]);

    const grandTotal = shifts.reduce((s, sh) => s + sh.totalSales, 0);
    const grandCash = shifts.reduce((s, sh) => s + sh.cashSales, 0);
    const grandMpesa = shifts.reduce((s, sh) => s + sh.mpesaSales, 0);
    const grandCredit = shifts.reduce((s, sh) => s + sh.creditSales, 0);
    const grandOrders = shifts.reduce((s, sh) => s + sh.orderCount, 0);

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const maxDaily = Math.max(...dailySales.map(d => d.total), 1);

    return (
        <div className="space-y-6 animate-rise">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">🧾 POS Reports</h1>
                    <p className="text-sm text-gray-500 mt-1">Shift summaries, daily sales, and top-selling products</p>
                </div>
                <button onClick={loadReport} className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2">🔄 Refresh</button>
            </div>

            {/* Gradient KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💰 Total Sales</p>
                    <p className="text-2xl font-black mt-2">{fmt(grandTotal)}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💵 Cash</p>
                    <p className="text-2xl font-black mt-2">{fmt(grandCash)}</p>
                </div>
                <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">📱 M-Pesa</p>
                    <p className="text-2xl font-black mt-2">{fmt(grandMpesa)}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💳 Credit</p>
                    <p className="text-2xl font-black mt-2">{fmt(grandCredit)}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">📋 Orders</p>
                    <p className="text-2xl font-black mt-2">{grandOrders}</p>
                </div>
                <div className="bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">📊 Avg Order</p>
                    <p className="text-2xl font-black mt-2">{fmt(grandOrders > 0 ? grandTotal / grandOrders : 0)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="neo-card p-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="neo-card flex items-center justify-center py-20"><div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading reports...</span></div>
            ) : (
                <>
                    {/* Daily Sales Bar Chart */}
                    {dailySales.length > 0 && (
                        <div className="neo-card p-5">
                            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">📊 Daily Sales Trend</h3>
                            <div className="flex items-end gap-2" style={{ height: '160px' }}>
                                {dailySales.map(d => (
                                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-600">{fmt(d.total)}</span>
                                        <div className="w-full bg-gradient-to-t from-teal-500 to-emerald-400 rounded-t-lg transition-all hover:opacity-80"
                                            style={{ height: `${(d.total / maxDaily) * 120}px`, minHeight: '4px' }} />
                                        <span className="text-[10px] text-gray-400">{new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Shift Reports */}
                        <div className="neo-card overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5">
                                <h3 className="text-sm font-bold text-white">⏰ Shift Reports ({shifts.length})</h3>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {shifts.length === 0 ? (
                                    <p className="text-center text-gray-400 text-sm py-12">No shifts found</p>
                                ) : shifts.map(sh => (
                                    <div key={sh.shift_id} className="p-4 border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sh.status === 'Open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{sh.status}</span>
                                                <span className="text-sm font-bold text-gray-800">{sh.shift_type}</span>
                                            </div>
                                            <span className="text-sm font-black text-blue-600">{fmt(sh.totalSales)}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                            <span>📅 {sh.start_time ? new Date(sh.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</span>
                                            <span>👤 {sh.opened_by}</span>
                                            <span>📋 {sh.orderCount} orders</span>
                                        </div>
                                        <div className="flex gap-3 mt-2 text-[11px]">
                                            <span className="text-amber-600 font-bold">💵 {fmt(sh.cashSales)}</span>
                                            <span className="text-green-600 font-bold">📱 {fmt(sh.mpesaSales)}</span>
                                            <span className="text-orange-600 font-bold">💳 {fmt(sh.creditSales)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Top Selling Products */}
                        <div className="neo-card overflow-hidden">
                            <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3.5">
                                <h3 className="text-sm font-bold text-white">🏆 Top Selling Products</h3>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {topProducts.length === 0 ? (
                                    <p className="text-center text-gray-400 text-sm py-12">No product data found</p>
                                ) : topProducts.map((p, i) => (
                                    <div key={p.name} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-orange-50/30 transition-colors">
                                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-700' : 'bg-gray-300'}`}>{i + 1}</span>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-800">{p.name}</p>
                                            <p className="text-xs text-gray-500">{p.qty} units sold</p>
                                        </div>
                                        <span className="text-sm font-black text-orange-600">{fmt(p.revenue)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
