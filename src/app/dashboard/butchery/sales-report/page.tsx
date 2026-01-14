'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface MeatSale {
    sale_id: number;
    sale_code: string;
    meat_type_name: string;
    weight_kg: number;
    price_per_kg: number;
    total_amount: number;
    discount: number;
    net_amount: number;
    cost_per_kg: number;
    payment_mode: string;
    customer_name: string;
    sale_date: string;
}

export default function ButcherySalesReportPage() {
    const [sales, setSales] = useState<MeatSale[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [paymentFilter, setPaymentFilter] = useState('All');

    const loadSales = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('meat_sales')
                .select('*')
                .gte('sale_date', `${dateFrom}T00:00:00`)
                .lte('sale_date', `${dateTo}T23:59:59`)
                .order('sale_date', { ascending: false });

            if (paymentFilter !== 'All') {
                query = query.eq('payment_mode', paymentFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            setSales((data || []).map(s => ({
                sale_id: s.sale_id,
                sale_code: s.sale_code,
                meat_type_name: s.meat_type_name || 'Meat',
                weight_kg: s.weight_kg || 0,
                price_per_kg: s.price_per_kg || 0,
                total_amount: s.total_amount || 0,
                discount: s.discount || 0,
                net_amount: s.net_amount || 0,
                cost_per_kg: s.cost_per_kg || 0,
                payment_mode: s.payment_mode || 'Cash',
                customer_name: s.customer_name || '',
                sale_date: s.sale_date
            })));

        } catch (err) {
            console.error('Error loading sales:', err);
            toast.error('Failed to load sales');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSales();
    }, [dateFrom, dateTo, paymentFilter]);

    // Summary calculations
    const totalSales = sales.reduce((sum, s) => sum + s.net_amount, 0);
    const totalWeight = sales.reduce((sum, s) => sum + s.weight_kg, 0);
    const totalDiscount = sales.reduce((sum, s) => sum + s.discount, 0);
    const totalCost = sales.reduce((sum, s) => sum + (s.weight_kg * s.cost_per_kg), 0);
    const totalProfit = totalSales - totalCost;

    const cashSales = sales.filter(s => s.payment_mode === 'Cash').reduce((sum, s) => sum + s.net_amount, 0);
    const mpesaSales = sales.filter(s => s.payment_mode === 'M-Pesa').reduce((sum, s) => sum + s.net_amount, 0);
    const creditSales = sales.filter(s => s.payment_mode === 'Credit').reduce((sum, s) => sum + s.net_amount, 0);

    const exportToExcel = () => {
        const headers = ['Sale Code', 'Date', 'Meat Type', 'Weight (Kg)', 'Price/Kg', 'Amount', 'Discount', 'Net Amount', 'Cost/Kg', 'Profit', 'Payment', 'Customer'];
        const rows = sales.map(s => [
            s.sale_code,
            new Date(s.sale_date).toLocaleDateString(),
            s.meat_type_name,
            s.weight_kg.toFixed(2),
            s.price_per_kg,
            s.total_amount,
            s.discount,
            s.net_amount,
            s.cost_per_kg,
            (s.net_amount - (s.weight_kg * s.cost_per_kg)).toFixed(0),
            s.payment_mode,
            s.customer_name || '-'
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `butchery_sales_${dateFrom}_to_${dateTo}.csv`;
        a.click();
        toast.success('Report exported!');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 rounded-3xl p-5 text-white shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/butchery" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                            ←
                        </Link>
                        <div>
                            <h1 className="text-2xl font-extrabold flex items-center gap-2">
                                📋 Sales Report
                            </h1>
                            <p className="text-white/80 text-sm">Butchery Sales Analytics</p>
                        </div>
                    </div>
                    <button
                        onClick={exportToExcel}
                        className="px-5 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-colors flex items-center gap-2"
                    >
                        📥 Export
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">From:</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="p-2 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">To:</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="p-2 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Payment:</label>
                        <select
                            value={paymentFilter}
                            onChange={(e) => setPaymentFilter(e.target.value)}
                            className="p-2 border border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                        >
                            <option value="All">All</option>
                            <option value="Cash">Cash</option>
                            <option value="M-Pesa">M-Pesa</option>
                            <option value="Card">Card</option>
                            <option value="Credit">Credit</option>
                        </select>
                    </div>
                    <button
                        onClick={loadSales}
                        className="px-4 py-2 bg-purple-500 text-white rounded-xl font-semibold hover:bg-purple-600 transition-colors"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100 text-center">
                    <span className="text-2xl">💰</span>
                    <p className="text-xs text-green-600 mt-1">Total Sales</p>
                    <p className="text-xl font-bold text-green-700">KES {totalSales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-4 border border-cyan-100 text-center">
                    <span className="text-2xl">⚖️</span>
                    <p className="text-xs text-cyan-600 mt-1">Weight Sold</p>
                    <p className="text-xl font-bold text-cyan-700">{totalWeight.toFixed(1)} Kg</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-4 border border-purple-100 text-center">
                    <span className="text-2xl">📈</span>
                    <p className="text-xs text-purple-600 mt-1">Profit</p>
                    <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        KES {totalProfit.toLocaleString()}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-4 border border-amber-100 text-center">
                    <span className="text-2xl">💵</span>
                    <p className="text-xs text-amber-600 mt-1">Cash</p>
                    <p className="text-xl font-bold text-amber-700">KES {cashSales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl p-4 border border-green-100 text-center">
                    <span className="text-2xl">📱</span>
                    <p className="text-xs text-green-600 mt-1">M-Pesa</p>
                    <p className="text-xl font-bold text-green-700">KES {mpesaSales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-4 border border-red-100 text-center">
                    <span className="text-2xl">📋</span>
                    <p className="text-xs text-red-600 mt-1">Credit</p>
                    <p className="text-xl font-bold text-red-700">KES {creditSales.toLocaleString()}</p>
                </div>
            </div>

            {/* Sales Table */}
            <div className="bg-white rounded-2xl border shadow-lg overflow-hidden">
                <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-violet-50">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-gray-800">📋 Sales Details</h2>
                        <span className="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-sm font-semibold">
                            {sales.length} transactions
                        </span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px]">
                        <thead className="bg-gradient-to-r from-purple-600 to-violet-700">
                            <tr>
                                <th className="text-left py-4 px-3 font-bold text-xs text-white">🧾 CODE</th>
                                <th className="text-left py-4 px-3 font-bold text-xs text-white">📅 DATE</th>
                                <th className="text-left py-4 px-3 font-bold text-xs text-white">🥩 MEAT</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">⚖️ WEIGHT</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">💵 PRICE/KG</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">💰 AMOUNT</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">🏷️ DISC</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">💎 NET</th>
                                <th className="text-right py-4 px-3 font-bold text-xs text-white">📈 PROFIT</th>
                                <th className="text-center py-4 px-3 font-bold text-xs text-white">💳 PAY</th>
                                <th className="text-left py-4 px-3 font-bold text-xs text-white">👤 CUSTOMER</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={11} className="py-16 text-center">
                                        <div className="flex items-center justify-center gap-3">
                                            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span>Loading sales...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : sales.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="py-16 text-center text-gray-500">
                                        📋 No sales found for this period
                                    </td>
                                </tr>
                            ) : (
                                sales.map(sale => {
                                    const profit = sale.net_amount - (sale.weight_kg * sale.cost_per_kg);
                                    return (
                                        <tr key={sale.sale_id} className="border-t hover:bg-purple-50/30 transition-colors">
                                            <td className="py-3 px-3">
                                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{sale.sale_code}</span>
                                            </td>
                                            <td className="py-3 px-3 text-sm text-gray-600">
                                                {new Date(sale.sale_date).toLocaleDateString()}
                                            </td>
                                            <td className="py-3 px-3 font-semibold text-gray-800 text-sm">{sale.meat_type_name}</td>
                                            <td className="py-3 px-3 text-center">
                                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold text-sm">
                                                    {sale.weight_kg.toFixed(2)} Kg
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-right text-gray-700 text-sm">KES {sale.price_per_kg}</td>
                                            <td className="py-3 px-3 text-right text-gray-700">KES {sale.total_amount.toLocaleString()}</td>
                                            <td className="py-3 px-3 text-right text-orange-600">{sale.discount > 0 ? `-${sale.discount}` : '-'}</td>
                                            <td className="py-3 px-3 text-right font-bold text-green-600">KES {sale.net_amount.toLocaleString()}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`font-bold text-sm ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    KES {profit.toFixed(0)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${sale.payment_mode === 'Cash' ? 'bg-green-100 text-green-700' :
                                                    sale.payment_mode === 'M-Pesa' ? 'bg-emerald-100 text-emerald-700' :
                                                        sale.payment_mode === 'Credit' ? 'bg-red-100 text-red-700' :
                                                            'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {sale.payment_mode}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-sm text-gray-600">{sale.customer_name || '-'}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {sales.length > 0 && (
                            <tfoot className="bg-gray-50 font-bold">
                                <tr className="border-t-2">
                                    <td colSpan={3} className="py-4 px-3 text-gray-700">TOTALS</td>
                                    <td className="py-4 px-3 text-center text-blue-700">{totalWeight.toFixed(2)} Kg</td>
                                    <td className="py-4 px-3"></td>
                                    <td className="py-4 px-3 text-right text-gray-700">
                                        KES {sales.reduce((sum, s) => sum + s.total_amount, 0).toLocaleString()}
                                    </td>
                                    <td className="py-4 px-3 text-right text-orange-600">-{totalDiscount.toLocaleString()}</td>
                                    <td className="py-4 px-3 text-right text-green-700">KES {totalSales.toLocaleString()}</td>
                                    <td className="py-4 px-3 text-right">
                                        <span className={totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}>
                                            KES {totalProfit.toLocaleString()}
                                        </span>
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
