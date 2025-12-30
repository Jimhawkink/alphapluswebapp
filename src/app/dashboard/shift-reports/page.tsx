'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ShiftReport {
    shift_id: number;
    shift_date: string;
    shift_type: string;
    start_time: string;
    end_time: string;
    opening_cash: number;
    closing_cash: number;
    total_sales: number;
    total_expenses: number;
    total_vouchers: number;
    net_sales: number;
    status: string;
    opened_by: string;
    closed_by: string;
}

export default function ShiftReportsPage() {
    const [shifts, setShifts] = useState<ShiftReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [shiftTypeFilter, setShiftTypeFilter] = useState('All');
    const [selectedShift, setSelectedShift] = useState<ShiftReport | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        totalShifts: 0,
        totalSales: 0,
        totalExpenses: 0,
        totalNet: 0
    });

    const loadShifts = useCallback(async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('shifts')
                .select('*')
                .gte('shift_date', dateFrom)
                .lte('shift_date', dateTo)
                .eq('status', 'Closed')
                .order('shift_date', { ascending: false });

            if (shiftTypeFilter !== 'All') {
                query = query.eq('shift_type', shiftTypeFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            setShifts(data || []);

            // Calculate stats
            const total = data || [];
            setStats({
                totalShifts: total.length,
                totalSales: total.reduce((sum, s) => sum + (s.total_sales || 0), 0),
                totalExpenses: total.reduce((sum, s) => sum + (s.total_expenses || 0), 0),
                totalNet: total.reduce((sum, s) => sum + (s.net_sales || 0), 0)
            });

        } catch (err) {
            console.error('Error loading shifts:', err);
            toast.error('Failed to load shift reports');
        }
        setIsLoading(false);
    }, [dateFrom, dateTo, shiftTypeFilter]);

    useEffect(() => {
        loadShifts();
    }, [loadShifts]);

    const previewShift = (shift: ShiftReport) => {
        setSelectedShift(shift);
        setShowPreview(true);
    };

    const printShiftReport = async (shift: ShiftReport) => {
        // Fetch company info from organisation_settings
        let companyName = 'Your Business Name';
        let companyPhone = '';
        let companyAddress = '';

        try {
            const { data: settingsData } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value');

            if (settingsData && settingsData.length > 0) {
                const settingsMap: { [key: string]: string } = {};
                settingsData.forEach((item: { setting_key: string; setting_value: string }) => {
                    settingsMap[item.setting_key] = item.setting_value;
                });

                companyName = settingsMap['company_name'] || 'Your Business Name';
                companyPhone = settingsMap['phone'] || '';
                companyAddress = settingsMap['address'] || '';

                // Add city if available
                if (settingsMap['city']) {
                    companyAddress = companyAddress ? `${companyAddress}, ${settingsMap['city']}` : settingsMap['city'];
                }
            }
        } catch (err) {
            console.log('Could not fetch organisation settings');
        }

        const shiftType = shift.shift_type === 'Morning' ? 'DAY SHIFT' : 'NIGHT SHIFT';
        const expectedCash = (shift.opening_cash || 0) + (shift.total_sales || 0) - (shift.total_expenses || 0);
        const variance = (shift.closing_cash || 0) - expectedCash;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; width: 80mm; padding: 3mm; font-size: 11px; line-height: 1.4; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .header { border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .company-name { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
        .shift-type { font-size: 14px; font-weight: bold; background: #000; color: #fff; padding: 4px 8px; margin: 8px 0; display: inline-block; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .section { border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }
        .total-row { font-size: 14px; font-weight: bold; background: #f0f0f0; padding: 6px 4px; margin: 4px 0; }
        .positive { color: green; }
        .negative { color: red; }
        .footer { border-top: 2px dashed #000; padding-top: 8px; margin-top: 10px; font-size: 10px; }
        .signature-line { border-bottom: 1px solid #000; margin-top: 20px; padding-bottom: 2px; }
    </style>
</head>
<body>
    <div class="header center">
        <div class="company-name">${companyName.toUpperCase()}</div>
        ${companyAddress ? `<div>${companyAddress}</div>` : ''}
        ${companyPhone ? `<div>Tel: ${companyPhone}</div>` : ''}
        <div style="margin-top: 8px;">═══════════════════════</div>
        <div class="shift-type">${shiftType} REPORT</div>
    </div>

    <div class="section">
        <div class="row"><span>Date:</span><span>${new Date(shift.shift_date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
        <div class="row"><span>Shift Started:</span><span>${shift.start_time || '-'}</span></div>
        <div class="row"><span>Shift Ended:</span><span>${shift.end_time || '-'}</span></div>
        <div class="row"><span>Opened By:</span><span>${shift.opened_by || 'Unknown'}</span></div>
        <div class="row"><span>Closed By:</span><span>${shift.closed_by || 'Admin'}</span></div>
    </div>

    <div class="section">
        <div class="center bold" style="margin-bottom: 6px;">💰 CASH SUMMARY</div>
        <div class="row"><span>Opening Cash:</span><span>Ksh ${(shift.opening_cash || 0).toLocaleString()}</span></div>
        <div class="row bold"><span>Total Sales:</span><span>Ksh ${(shift.total_sales || 0).toLocaleString()}</span></div>
        <div class="row negative"><span>Less Expenses:</span><span>- Ksh ${(shift.total_expenses || 0).toLocaleString()}</span></div>
        <div class="row negative"><span>Less Vouchers:</span><span>- Ksh ${(shift.total_vouchers || 0).toLocaleString()}</span></div>
        <div class="total-row row"><span>NET SALES:</span><span class="positive">Ksh ${(shift.net_sales || 0).toLocaleString()}</span></div>
    </div>

    <div class="section">
        <div class="center bold" style="margin-bottom: 6px;">💵 CASH RECONCILIATION</div>
        <div class="row"><span>Expected Cash:</span><span>Ksh ${expectedCash.toLocaleString()}</span></div>
        <div class="row"><span>Actual Cash Count:</span><span>Ksh ${(shift.closing_cash || 0).toLocaleString()}</span></div>
        <div class="total-row row">
            <span>VARIANCE:</span>
            <span class="${variance >= 0 ? 'positive' : 'negative'}">
                ${variance >= 0 ? '+' : ''}Ksh ${variance.toLocaleString()}
            </span>
        </div>
        ${variance !== 0 ? `<div class="center" style="font-size: 10px; color: ${variance > 0 ? 'green' : 'red'};">${variance > 0 ? '✅ OVERAGE' : '⚠️ SHORTAGE'}</div>` : '<div class="center" style="color: green;">✅ BALANCED</div>'}
    </div>

    <div class="footer center">
        <div class="signature-line"></div>
        <div style="margin-top: 4px;">Cashier Signature</div>
        <div style="margin-top: 15px;" class="signature-line"></div>
        <div style="margin-top: 4px;">Manager Signature</div>
        <div style="margin-top: 15px;">
            ═══════════════════════<br/>
            Printed: ${new Date().toLocaleString()}<br/>
            Thank you for your service!
        </div>
    </div>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=350,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
            setTimeout(() => win.print(), 300);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl">📋</span>
                        Shift Reports
                    </h1>
                    <p className="text-gray-500 mt-1">View and print closed shift reports</p>
                </div>
                <a href="/dashboard/shifts" className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg">
                    ⏰ Shift Management
                </a>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">📅 From:</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">To:</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">🌅 Shift Type:</span>
                        <select
                            value={shiftTypeFilter}
                            onChange={(e) => setShiftTypeFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        >
                            <option value="All">All Shifts</option>
                            <option value="Morning">☀️ Day Shift</option>
                            <option value="Evening">🌙 Night Shift</option>
                        </select>
                    </div>
                    <button
                        onClick={loadShifts}
                        className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg"
                    >
                        🔍 Search
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">📋</span>
                    <p className="text-sm opacity-80 mt-2">Total Shifts</p>
                    <p className="text-3xl font-bold">{stats.totalShifts}</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">💰</span>
                    <p className="text-sm opacity-80 mt-2">Total Sales</p>
                    <p className="text-2xl font-bold">Ksh {stats.totalSales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">💸</span>
                    <p className="text-sm opacity-80 mt-2">Total Expenses</p>
                    <p className="text-2xl font-bold">Ksh {stats.totalExpenses.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">📊</span>
                    <p className="text-sm opacity-80 mt-2">Total Net Sales</p>
                    <p className="text-2xl font-bold">Ksh {stats.totalNet.toLocaleString()}</p>
                </div>
            </div>

            {/* Shifts Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-cyan-50 to-blue-50">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Date</th>
                            <th className="text-left py-4 px-4 font-bold text-xs text-gray-600">Shift Type</th>
                            <th className="text-center py-4 px-4 font-bold text-xs text-gray-600">Time</th>
                            <th className="text-right py-4 px-4 font-bold text-xs text-gray-600">Opening</th>
                            <th className="text-right py-4 px-4 font-bold text-xs text-gray-600">Sales</th>
                            <th className="text-right py-4 px-4 font-bold text-xs text-gray-600">Expenses</th>
                            <th className="text-right py-4 px-4 font-bold text-xs text-gray-600">Net Sales</th>
                            <th className="text-right py-4 px-4 font-bold text-xs text-gray-600">Closing</th>
                            <th className="text-center py-4 px-4 font-bold text-xs text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={9} className="py-16 text-center text-gray-500">Loading...</td></tr>
                        ) : shifts.length === 0 ? (
                            <tr><td colSpan={9} className="py-16 text-center text-gray-500">No closed shifts found</td></tr>
                        ) : (
                            shifts.map((shift) => (
                                <tr key={shift.shift_id} className="border-t hover:bg-cyan-50/30 cursor-pointer" onClick={() => previewShift(shift)}>
                                    <td className="py-3 px-4 font-semibold">
                                        {new Date(shift.shift_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${shift.shift_type === 'Morning' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                            {shift.shift_type === 'Morning' ? '☀️ Day' : '🌙 Night'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center text-sm text-gray-600">
                                        {shift.start_time} - {shift.end_time || 'N/A'}
                                    </td>
                                    <td className="py-3 px-4 text-right">Ksh {(shift.opening_cash || 0).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-bold text-green-600">Ksh {(shift.total_sales || 0).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right text-red-600">Ksh {(shift.total_expenses || 0).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-bold text-blue-600">Ksh {(shift.net_sales || 0).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right">Ksh {(shift.closing_cash || 0).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); previewShift(shift); }}
                                                className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                                                title="Preview"
                                            >
                                                👁️
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); printShiftReport(shift); }}
                                                className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                                                title="Print"
                                            >
                                                🖨️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Preview Modal */}
            {showPreview && selectedShift && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <span>📋</span> Shift Report Preview
                            </h2>
                            <button onClick={() => setShowPreview(false)} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl p-4 mb-4">
                            <div className="flex justify-between items-center">
                                <span className={`px-4 py-2 rounded-full font-bold ${selectedShift.shift_type === 'Morning' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                    {selectedShift.shift_type === 'Morning' ? '☀️ DAY SHIFT' : '🌙 NIGHT SHIFT'}
                                </span>
                                <span className="text-gray-600 font-medium">
                                    {new Date(selectedShift.shift_date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs text-gray-500">Started</p>
                                    <p className="font-semibold">{selectedShift.start_time || '-'}</p>
                                    <p className="text-xs text-gray-400">by {selectedShift.opened_by}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-xs text-gray-500">Ended</p>
                                    <p className="font-semibold">{selectedShift.end_time || '-'}</p>
                                    <p className="text-xs text-gray-400">by {selectedShift.closed_by}</p>
                                </div>
                            </div>

                            <div className="bg-green-50 rounded-xl p-4 space-y-2">
                                <h4 className="font-bold text-green-700">💰 Cash Summary</h4>
                                <div className="flex justify-between"><span>Opening Cash:</span><span className="font-bold">Ksh {(selectedShift.opening_cash || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Total Sales:</span><span className="font-bold text-green-600">Ksh {(selectedShift.total_sales || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Expenses:</span><span className="font-bold text-red-600">- Ksh {(selectedShift.total_expenses || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Vouchers:</span><span className="font-bold text-red-600">- Ksh {(selectedShift.total_vouchers || 0).toLocaleString()}</span></div>
                                <hr />
                                <div className="flex justify-between text-lg"><span className="font-bold">Net Sales:</span><span className="font-bold text-blue-600">Ksh {(selectedShift.net_sales || 0).toLocaleString()}</span></div>
                            </div>

                            <div className="bg-blue-50 rounded-xl p-4">
                                <div className="flex justify-between"><span>Closing Cash:</span><span className="font-bold text-xl">Ksh {(selectedShift.closing_cash || 0).toLocaleString()}</span></div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowPreview(false)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold">Close</button>
                            <button onClick={() => printShiftReport(selectedShift)} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2">
                                <span>🖨️</span> Print Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
