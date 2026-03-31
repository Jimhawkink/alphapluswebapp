'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Sale {
    sale_id: number;
    receipt_no: string;
    sale_datetime: string;
    customer_name: string;
    payment_method: string;
    total_amount: number;
    discount_amount: number;
    status: string;
    created_by: string;
    table_name: string;
    items: SaleItem[];
}

interface SaleItem {
    item_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    discount: number;
}

export default function SalesPage() {
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [filterPayment, setFilterPayment] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

    const loadSales = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('sales')
                .select('sale_id, receipt_no, sale_datetime, customer_name, payment_method, total_amount, discount_amount, status, created_by, table_name')
                .gte('sale_datetime', `${dateFrom}T00:00:00`)
                .lte('sale_datetime', `${dateTo}T23:59:59`)
                .order('sale_datetime', { ascending: false });

            if (filterPayment !== 'All') {
                query = query.eq('payment_method', filterPayment);
            }
            if (filterStatus !== 'All') {
                query = query.eq('status', filterStatus);
            }

            const { data, error } = await query;
            if (error) throw error;

            const salesWithItems: Sale[] = (data || []).map((s: any) => ({
                ...s,
                items: [],
            }));

            setSales(salesWithItems);
        } catch (err) {
            console.error('Error loading sales:', err);
        }
        setLoading(false);
    }, [dateFrom, dateTo, filterPayment, filterStatus]);

    useEffect(() => { loadSales(); }, [loadSales]);

    const viewReceipt = async (sale: Sale) => {
        // Load items for this sale
        const { data: items } = await supabase
            .from('sales_items')
            .select('item_id, product_name, quantity, unit_price, subtotal, discount')
            .eq('sale_id', sale.sale_id);
        setSelectedSale({ ...sale, items: items || [] });
    };

    const filtered = sales.filter(s => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (s.receipt_no || '').toLowerCase().includes(q) || (s.customer_name || '').toLowerCase().includes(q);
        }
        return true;
    });

    const completedSales = filtered.filter(s => s.status === 'Completed');
    const totalRevenue = completedSales.reduce((s, r) => s + (r.total_amount || 0), 0);
    const cashTotal = completedSales.filter(s => s.payment_method === 'Cash').reduce((s, r) => s + (r.total_amount || 0), 0);
    const mpesaTotal = completedSales.filter(s => s.payment_method === 'Mpesa').reduce((s, r) => s + (r.total_amount || 0), 0);
    const creditTotal = completedSales.filter(s => s.payment_method === 'Credit').reduce((s, r) => s + (r.total_amount || 0), 0);
    const pendingTotal = filtered.filter(s => s.status === 'Pending').reduce((s, r) => s + (r.total_amount || 0), 0);

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6 animate-rise">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">📋 Sales Records</h1>
                    <p className="text-sm text-gray-500 mt-1">View and manage all sales transactions</p>
                </div>
                <button onClick={loadSales} className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2">🔄 Refresh</button>
            </div>

            {/* Gradient KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💰 Total Revenue</p>
                    <p className="text-2xl font-black mt-2">{fmt(totalRevenue)}</p>
                    <p className="text-[11px] opacity-75 mt-1">{completedSales.length} transactions</p>
                </div>
                <div className="bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💵 Cash</p>
                    <p className="text-2xl font-black mt-2">{fmt(cashTotal)}</p>
                    <p className="text-[11px] opacity-75 mt-1">{cashTotal > 0 && totalRevenue > 0 ? ((cashTotal/totalRevenue)*100).toFixed(0) : 0}% of total</p>
                </div>
                <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">📱 M-Pesa</p>
                    <p className="text-2xl font-black mt-2">{fmt(mpesaTotal)}</p>
                    <p className="text-[11px] opacity-75 mt-1">{mpesaTotal > 0 && totalRevenue > 0 ? ((mpesaTotal/totalRevenue)*100).toFixed(0) : 0}% of total</p>
                </div>
                <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">💳 Credit</p>
                    <p className="text-2xl font-black mt-2">{fmt(creditTotal)}</p>
                    <p className="text-[11px] opacity-75 mt-1">{creditTotal > 0 && totalRevenue > 0 ? ((creditTotal/totalRevenue)*100).toFixed(0) : 0}% of total</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-semibold opacity-90">⏳ Pending</p>
                    <p className="text-2xl font-black mt-2">{fmt(pendingTotal)}</p>
                    <p className="text-[11px] opacity-75 mt-1">Unpaid orders</p>
                </div>
            </div>

            {/* Filters */}
            <div className="neo-card p-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search</label>
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Invoice or customer..."
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Payment</label>
                        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none">
                            <option value="All">All Payments</option>
                            <option value="Cash">Cash</option>
                            <option value="Mpesa">M-Pesa</option>
                            <option value="Credit">Credit</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Status</label>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-teal-500 outline-none">
                            <option value="All">All Status</option>
                            <option value="Completed">Completed</option>
                            <option value="Pending">Pending</option>
                            <option value="Voided">Voided</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Sales Table */}
            <div className="neo-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading sales...</span></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gradient-to-r from-blue-600 to-indigo-600">
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Receipt</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Date & Time</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Customer</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Table</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Payment</th>
                                    <th className="px-4 py-3.5 text-right text-xs font-bold uppercase">Amount</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase">Status</th>
                                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase">Cashier</th>
                                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={9} className="text-center py-16 text-gray-400 text-sm">No sales records found for this period</td></tr>
                                ) : filtered.map((s, i) => (
                                    <tr key={s.sale_id} className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} ${s.status === 'Voided' ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3.5"><span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-mono font-bold">{s.receipt_no}</span></td>
                                        <td className="px-4 py-3.5 text-sm text-gray-600">
                                            {s.sale_datetime ? new Date(s.sale_datetime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}
                                            <span className="text-gray-400 ml-1">{s.sale_datetime ? new Date(s.sale_datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-sm font-medium text-gray-800">{s.customer_name || 'Walk-in'}</td>
                                        <td className="px-4 py-3.5 text-sm text-gray-500">{s.table_name || '-'}</td>
                                        <td className="px-4 py-3.5">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.payment_method === 'Cash' ? 'bg-yellow-100 text-yellow-700' : s.payment_method === 'Mpesa' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {s.payment_method}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right text-sm font-bold text-gray-800">{fmt(s.total_amount || 0)}</td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : s.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                {s.status === 'Completed' ? '✅' : s.status === 'Pending' ? '⏳' : '❌'} {s.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-sm text-gray-500">{s.created_by || ''}</td>
                                        <td className="px-4 py-3.5 text-center">
                                            <button onClick={() => viewReceipt(s)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="View Receipt">👁️</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Receipt Modal */}
            {selectedSale && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setSelectedSale(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
                            <h2 className="text-lg font-bold">🧾 Receipt Details</h2>
                            <p className="text-blue-200 text-sm mt-0.5">{selectedSale.receipt_no}</p>
                        </div>

                        <div className="p-6 space-y-3">
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Date:</span><span className="font-medium">{selectedSale.sale_datetime ? new Date(selectedSale.sale_datetime).toLocaleString('en-GB') : ''}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Customer:</span><span className="font-medium">{selectedSale.customer_name || 'Walk-in'}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Payment:</span><span className="font-medium">{selectedSale.payment_method}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Cashier:</span><span className="font-medium">{selectedSale.created_by}</span></div>

                            <hr className="border-dashed" />

                            {selectedSale.items.length > 0 ? (
                                <div className="space-y-2">
                                    {selectedSale.items.map(item => (
                                        <div key={item.item_id} className="flex justify-between items-center bg-gray-50 rounded-xl p-3">
                                            <div>
                                                <p className="text-sm font-bold text-gray-800">{item.product_name}</p>
                                                <p className="text-xs text-gray-500">{item.quantity} × {fmt(item.unit_price)}</p>
                                            </div>
                                            <p className="text-sm font-bold text-gray-800">{fmt(item.subtotal)}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-400 text-sm py-3">No items loaded</p>
                            )}

                            <hr className="border-dashed" />

                            {selectedSale.discount_amount > 0 && (
                                <div className="flex justify-between text-sm"><span className="text-gray-500">Discount:</span><span className="text-green-600 font-bold">-{fmt(selectedSale.discount_amount)}</span></div>
                            )}
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total:</span>
                                <span className="text-blue-600">{fmt(selectedSale.total_amount)}</span>
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setSelectedSale(null)} className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">Close</button>
                            <button className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2">🖨️ Print</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
