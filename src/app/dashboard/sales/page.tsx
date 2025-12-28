'use client';

import { useState } from 'react';
import { useCompanyName } from '@/context/SettingsContext';

interface Sale {
    id: number;
    invoiceNo: string;
    date: string;
    time: string;
    customer: string;
    items: number;
    paymentMode: string;
    total: number;
    status: 'paid' | 'credit' | 'voided';
}

const sampleSales: Sale[] = [
    { id: 1, invoiceNo: 'INV-1234', date: '2024-12-27', time: '14:30', customer: 'Walk-in', items: 3, paymentMode: 'Cash', total: 2500, status: 'paid' },
    { id: 2, invoiceNo: 'INV-1233', date: '2024-12-27', time: '14:15', customer: 'John Doe', items: 5, paymentMode: 'M-Pesa', total: 4200, status: 'paid' },
    { id: 3, invoiceNo: 'INV-1232', date: '2024-12-27', time: '13:45', customer: 'ABC Company', items: 8, paymentMode: 'Credit', total: 8500, status: 'credit' },
    { id: 4, invoiceNo: 'INV-1231', date: '2024-12-27', time: '13:00', customer: 'Walk-in', items: 2, paymentMode: 'Cash', total: 1800, status: 'paid' },
    { id: 5, invoiceNo: 'INV-1230', date: '2024-12-27', time: '12:30', customer: 'Mary Jane', items: 4, paymentMode: 'M-Pesa', total: 3200, status: 'paid' },
    { id: 6, invoiceNo: 'INV-1229', date: '2024-12-26', time: '18:00', customer: 'XYZ Ltd', items: 10, paymentMode: 'Credit', total: 12000, status: 'credit' },
    { id: 7, invoiceNo: 'INV-1228', date: '2024-12-26', time: '16:30', customer: 'Walk-in', items: 1, paymentMode: 'Cash', total: 500, status: 'voided' },
];

export default function SalesPage() {
    const [sales, setSales] = useState<Sale[]>(sampleSales);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterPayment, setFilterPayment] = useState('All');
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const companyName = useCompanyName();

    const filteredSales = sales.filter(s => {
        const matchesSearch = s.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.customer.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDate = s.date === filterDate;
        const matchesPayment = filterPayment === 'All' || s.paymentMode === filterPayment;
        return matchesSearch && matchesDate && matchesPayment;
    });

    const todaySales = filteredSales.filter(s => s.status !== 'voided');
    const totalRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const cashTotal = todaySales.filter(s => s.paymentMode === 'Cash').reduce((sum, s) => sum + s.total, 0);
    const mpesaTotal = todaySales.filter(s => s.paymentMode === 'M-Pesa').reduce((sum, s) => sum + s.total, 0);
    const creditTotal = todaySales.filter(s => s.paymentMode === 'Credit').reduce((sum, s) => sum + s.total, 0);

    const viewReceipt = (sale: Sale) => {
        setSelectedSale(sale);
        setShowReceiptModal(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📋</span> Sales Records
                    </h1>
                    <p className="text-gray-500">View and manage all sales transactions</p>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                        <span>📥</span>
                        <span className="font-medium text-gray-600">Export</span>
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                        <span>🖨️</span>
                        <span className="font-medium text-gray-600">Print Report</span>
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-5 text-white col-span-2">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">💰</span>
                        <span className="font-medium opacity-90">Total Revenue</span>
                    </div>
                    <p className="text-3xl font-bold">Ksh {totalRevenue.toLocaleString()}</p>
                    <p className="text-sm opacity-80 mt-1">{todaySales.length} transactions</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center">
                            <span className="text-xl">💵</span>
                        </div>
                        <span className="text-sm font-medium text-yellow-600">Cash</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">Ksh {cashTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <span className="text-xl">📱</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">M-Pesa</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">Ksh {mpesaTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                            <span className="text-xl">💳</span>
                        </div>
                        <span className="text-sm font-medium text-orange-600">Credit</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">Ksh {creditTotal.toLocaleString()}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by invoice or customer..."
                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <select
                        value={filterPayment}
                        onChange={(e) => setFilterPayment(e.target.value)}
                        className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                    >
                        <option value="All">All Payments</option>
                        <option value="Cash">Cash</option>
                        <option value="M-Pesa">M-Pesa</option>
                        <option value="Credit">Credit</option>
                    </select>
                </div>
            </div>

            {/* Sales Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Invoice</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Date & Time</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Customer</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Items</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Payment</th>
                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600">Total</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Status</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSales.map(sale => (
                            <tr key={sale.id} className={`border-t border-gray-50 hover:bg-gray-50 transition-colors ${sale.status === 'voided' ? 'opacity-50' : ''}`}>
                                <td className="py-4 px-4">
                                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                                        {sale.invoiceNo}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-gray-600">
                                    <div>
                                        <p className="font-medium">{sale.date}</p>
                                        <p className="text-xs text-gray-500">{sale.time}</p>
                                    </div>
                                </td>
                                <td className="py-4 px-4 font-medium text-gray-800">{sale.customer}</td>
                                <td className="py-4 px-4 text-center text-gray-600">{sale.items}</td>
                                <td className="py-4 px-4">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${sale.paymentMode === 'Cash' ? 'bg-yellow-100 text-yellow-700' :
                                        sale.paymentMode === 'M-Pesa' ? 'bg-green-100 text-green-700' :
                                            'bg-orange-100 text-orange-700'
                                        }`}>
                                        {sale.paymentMode}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-right font-bold text-gray-800">
                                    Ksh {sale.total.toLocaleString()}
                                </td>
                                <td className="py-4 px-4 text-center">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${sale.status === 'paid' ? 'bg-green-100 text-green-700' :
                                        sale.status === 'credit' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                        {sale.status === 'paid' ? '✅ Paid' : sale.status === 'credit' ? '🔄 Credit' : '❌ Voided'}
                                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => viewReceipt(sale)}
                                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-500"
                                            title="View Receipt"
                                        >
                                            👁️
                                        </button>
                                        <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500" title="Print">
                                            🖨️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Receipt Modal */}
            {showReceiptModal && selectedSale && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
                            <h2 className="text-xl font-bold text-gray-800">{companyName}</h2>
                            <p className="text-sm text-gray-500">Sales Receipt</p>
                        </div>

                        <div className="space-y-2 text-sm mb-4">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Invoice:</span>
                                <span className="font-semibold">{selectedSale.invoiceNo}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Date:</span>
                                <span>{selectedSale.date} {selectedSale.time}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Customer:</span>
                                <span>{selectedSale.customer}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Payment:</span>
                                <span>{selectedSale.paymentMode}</span>
                            </div>
                        </div>

                        <div className="border-t border-dashed border-gray-300 pt-4 mb-4">
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total:</span>
                                <span className="text-blue-600">Ksh {selectedSale.total.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowReceiptModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2">
                                <span>🖨️</span>
                                <span>Print</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
