'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface DishSaleRow {
    product_name: string;
    total_qty: number;
    total_revenue: number;
    total_cost: number;
    profit: number;
    sale_count: number;
}

interface SaleDetail {
    item_id: number;
    receipt_no: string;
    sale_datetime: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    subtotal: number;
    profit: number;
    customer_name: string;
    payment_method: string;
    cashier: string;
}

export default function DishReportPage() {
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [dishFilter, setDishFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [summary, setSummary] = useState<DishSaleRow[]>([]);
    const [details, setDetails] = useState<SaleDetail[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');
    const [loading, setLoading] = useState(false);
    const [grandTotal, setGrandTotal] = useState({ qty: 0, revenue: 0, cost: 0, profit: 0 });

    const loadCategories = useCallback(async () => {
        const { data } = await supabase.from('products').select('category').not('category', 'is', null);
        const cats = Array.from(new Set((data || []).map((d: any) => d.category).filter(Boolean))).sort();
        setCategories(cats as string[]);
    }, []);

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch sales items with sale info
            let query = supabase
                .from('sales_items')
                .select('item_id, product_name, quantity, unit_price, cost_price, subtotal, profit, sale_id, sales!inner(receipt_no, sale_datetime, customer_name, payment_method, created_by, status)')
                .gte('sales.sale_datetime', `${dateFrom}T00:00:00`)
                .lte('sales.sale_datetime', `${dateTo}T23:59:59`)
                .eq('sales.status', 'Completed');

            const { data, error } = await query;
            if (error) throw error;

            let rows = data || [];

            // Apply dish filter
            if (dishFilter) {
                rows = rows.filter((r: any) => r.product_name?.toLowerCase().includes(dishFilter.toLowerCase()));
            }

            // Apply category filter via product lookup
            if (categoryFilter !== 'All') {
                const { data: prods } = await supabase.from('products').select('pid, product_name').eq('category', categoryFilter);
                const prodNames = new Set((prods || []).map((p: any) => p.product_name?.toLowerCase()));
                rows = rows.filter((r: any) => prodNames.has(r.product_name?.toLowerCase()));
            }

            // Build detail rows
            const detailRows: SaleDetail[] = rows.map((r: any) => ({
                item_id: r.item_id,
                receipt_no: r.sales?.receipt_no || '',
                sale_datetime: r.sales?.sale_datetime || '',
                product_name: r.product_name || '',
                quantity: r.quantity || 0,
                unit_price: r.unit_price || 0,
                cost_price: r.cost_price || 0,
                subtotal: r.subtotal || 0,
                profit: r.profit || ((r.unit_price - (r.cost_price || 0)) * (r.quantity || 1)),
                customer_name: r.sales?.customer_name || 'Walk-in',
                payment_method: r.sales?.payment_method || 'Cash',
                cashier: r.sales?.created_by || '',
            }));
            setDetails(detailRows);

            // Build summary rows
            const map = new Map<string, DishSaleRow>();
            detailRows.forEach(d => {
                const key = d.product_name;
                const cur = map.get(key) || { product_name: key, total_qty: 0, total_revenue: 0, total_cost: 0, profit: 0, sale_count: 0 };
                cur.total_qty += d.quantity;
                cur.total_revenue += d.subtotal;
                cur.total_cost += d.cost_price * d.quantity;
                cur.profit += d.profit;
                cur.sale_count++;
                map.set(key, cur);
            });
            const summaryRows = Array.from(map.values()).sort((a, b) => b.total_revenue - a.total_revenue);
            setSummary(summaryRows);

            // Grand totals
            setGrandTotal({
                qty: summaryRows.reduce((s, r) => s + r.total_qty, 0),
                revenue: summaryRows.reduce((s, r) => s + r.total_revenue, 0),
                cost: summaryRows.reduce((s, r) => s + r.total_cost, 0),
                profit: summaryRows.reduce((s, r) => s + r.profit, 0),
            });
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    }, [dateFrom, dateTo, dishFilter, categoryFilter]);

    useEffect(() => { loadCategories(); }, [loadCategories]);
    useEffect(() => { loadReport(); }, [loadReport]);

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6 animate-rise">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">🧾 Dish Report</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Sales analysis by dish with filters</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setViewMode('summary')} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'summary' ? 'bg-teal-500 text-white shadow-lg' : 'bg-white text-gray-600 border'}`}>📊 Summary</button>
                    <button onClick={() => setViewMode('detail')} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'detail' ? 'bg-teal-500 text-white shadow-lg' : 'bg-white text-gray-600 border'}`}>📋 Detail</button>
                </div>
            </div>

            {/* Filters */}
            <div className="neo-card p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">From Date</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">To Date</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search Dish</label>
                        <input type="text" value={dishFilter} onChange={e => setDishFilter(e.target.value)} placeholder="e.g. Ugali..."
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Category</label>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none">
                            <option value="All">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="neo-card p-4 border-l-4 border-teal-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Total Dishes Sold</p>
                    <p className="text-xl font-black text-gray-800 mt-1">{grandTotal.qty.toLocaleString()}</p>
                </div>
                <div className="neo-card p-4 border-l-4 border-blue-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Total Revenue</p>
                    <p className="text-xl font-black text-gray-800 mt-1">{fmt(grandTotal.revenue)}</p>
                </div>
                <div className="neo-card p-4 border-l-4 border-orange-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Total Cost</p>
                    <p className="text-xl font-black text-gray-800 mt-1">{fmt(grandTotal.cost)}</p>
                </div>
                <div className="neo-card p-4 border-l-4 border-emerald-500">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Total Profit</p>
                    <p className="text-xl font-black text-emerald-600 mt-1">{fmt(grandTotal.profit)}</p>
                </div>
            </div>

            {/* Data Table */}
            <div className="neo-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading report...</span></div>
                ) : viewMode === 'summary' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-teal-600 to-teal-500">
                                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase">#</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase">Dish Name</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Qty Sold</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Revenue</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Cost</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Profit</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase">Margin %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No dish sales found for this period</td></tr>
                                ) : summary.map((r, i) => (
                                    <tr key={r.product_name} className={`border-b border-gray-100 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                        <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                                        <td className="px-4 py-3 text-sm font-bold text-gray-800">🍽️ {r.product_name}</td>
                                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-700">{r.total_qty}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">{fmt(r.total_revenue)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-500">{fmt(r.total_cost)}</td>
                                        <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">{fmt(r.profit)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.total_revenue > 0 ? (r.profit / r.total_revenue * 100 > 30 ? 'bg-emerald-100 text-emerald-700' : r.profit / r.total_revenue * 100 > 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-500'}`}>
                                                {r.total_revenue > 0 ? (r.profit / r.total_revenue * 100).toFixed(1) : 0}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {summary.length > 0 && (
                                <tfoot>
                                    <tr className="bg-gray-100 font-bold">
                                        <td className="px-4 py-3" colSpan={2}><span className="text-sm text-gray-800">TOTALS ({summary.length} dishes)</span></td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-800">{grandTotal.qty}</td>
                                        <td className="px-4 py-3 text-sm text-right text-blue-700">{fmt(grandTotal.revenue)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(grandTotal.cost)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-emerald-700">{fmt(grandTotal.profit)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-800">{grandTotal.revenue > 0 ? (grandTotal.profit / grandTotal.revenue * 100).toFixed(1) : 0}%</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-indigo-600 to-indigo-500">
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Receipt</th>
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Date/Time</th>
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Dish</th>
                                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase">Qty</th>
                                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase">Price</th>
                                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase">Total</th>
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Payment</th>
                                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase">Cashier</th>
                                </tr>
                            </thead>
                            <tbody>
                                {details.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No detailed records found</td></tr>
                                ) : details.map((d, i) => (
                                    <tr key={d.item_id} className={`border-b border-gray-100 hover:bg-indigo-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                        <td className="px-3 py-2 text-xs font-mono text-teal-600">{d.receipt_no}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{d.sale_datetime ? new Date(d.sale_datetime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</td>
                                        <td className="px-3 py-2 text-xs font-bold text-gray-800">{d.product_name}</td>
                                        <td className="px-3 py-2 text-xs text-right font-bold">{d.quantity}</td>
                                        <td className="px-3 py-2 text-xs text-right text-gray-600">{fmt(d.unit_price)}</td>
                                        <td className="px-3 py-2 text-xs text-right font-bold text-blue-600">{fmt(d.subtotal)}</td>
                                        <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${d.payment_method === 'Mpesa' ? 'bg-green-100 text-green-700' : d.payment_method === 'Credit' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{d.payment_method}</span></td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{d.cashier}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
