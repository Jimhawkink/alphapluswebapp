'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Shift {
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

export default function ShiftsPage() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [currentShift, setCurrentShift] = useState<Shift | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showStartModal, setShowStartModal] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [openingCash, setOpeningCash] = useState(0);
    const [closingCash, setClosingCash] = useState(0);
    const [shiftStats, setShiftStats] = useState({ sales: 0, expenses: 0, vouchers: 0 });

    const loadShifts = useCallback(async () => {
        setIsLoading(true);
        const today = new Date().toISOString().split('T')[0];

        // Check for current open shift
        const { data: openShift } = await supabase.from('shifts').select('*').eq('status', 'Open').single();
        setCurrentShift(openShift);

        // Load all shifts
        const { data } = await supabase.from('shifts').select('*').order('shift_id', { ascending: false }).limit(30);
        setShifts(data || []);

        // Load stats for current shift
        if (openShift) {
            const { data: salesData } = await supabase.from('sales').select('grand_total').eq('sale_date', openShift.shift_date);
            const { data: expData } = await supabase.from('expenses').select('amount').eq('expense_date', openShift.shift_date);
            const { data: vchData } = await supabase.from('vouchers').select('amount').eq('voucher_date', openShift.shift_date);
            setShiftStats({
                sales: (salesData || []).reduce((sum, s) => sum + (s.grand_total || 0), 0),
                expenses: (expData || []).reduce((sum, e) => sum + (e.amount || 0), 0),
                vouchers: (vchData || []).reduce((sum, v) => sum + (v.amount || 0), 0)
            });
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadShifts(); }, [loadShifts]);

    const startShift = async () => {
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;
        const now = new Date();

        const { error } = await supabase.from('shifts').insert({
            shift_date: now.toISOString().split('T')[0],
            shift_type: now.getHours() < 14 ? 'Morning' : 'Evening',
            start_time: now.toTimeString().split(' ')[0],
            opening_cash: openingCash,
            status: 'Open',
            opened_by: user?.name || 'Admin'
        });

        if (error) toast.error('Failed to start shift');
        else { toast.success('Shift started!'); setShowStartModal(false); loadShifts(); printDropAmount(openingCash); }
    };

    const endShift = async () => {
        if (!currentShift) return;
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;
        const netSales = shiftStats.sales - shiftStats.expenses - shiftStats.vouchers;

        const { error } = await supabase.from('shifts').update({
            end_time: new Date().toTimeString().split(' ')[0],
            closing_cash: closingCash,
            total_sales: shiftStats.sales,
            total_expenses: shiftStats.expenses,
            total_vouchers: shiftStats.vouchers,
            net_sales: netSales,
            status: 'Closed',
            closed_by: user?.name || 'Admin'
        }).eq('shift_id', currentShift.shift_id);

        if (error) toast.error('Failed to close shift');
        else { toast.success('Shift closed!'); setShowEndModal(false); loadShifts(); printShiftReport(currentShift, shiftStats, closingCash, netSales); }
    };

    const printDropAmount = (amount: number) => {
        const html = `<html><head><style>body{font-family:monospace;width:80mm;padding:4mm;}</style></head><body><h2 style="text-align:center;">DROP AMOUNT SLIP</h2><p>Date: ${new Date().toLocaleDateString()}</p><p>Time: ${new Date().toLocaleTimeString()}</p><hr/><p style="font-size:24px;font-weight:bold;text-align:center;">Ksh ${amount.toLocaleString()}</p><hr/><p style="text-align:center;font-size:12px;">Shift Opening Cash</p></body></html>`;
        const win = window.open('', '_blank', 'width=350,height=400');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    const printShiftReport = (shift: Shift, stats: { sales: number; expenses: number; vouchers: number }, closing: number, net: number) => {
        const html = `<html><head><style>body{font-family:monospace;width:80mm;padding:4mm;font-size:12px;}h2{text-align:center;margin:0;}hr{border:1px dashed #000;}.row{display:flex;justify-content:space-between;padding:4px 0;}.bold{font-weight:bold;}</style></head><body><h2>END OF SHIFT REPORT</h2><p style="text-align:center;">${new Date().toLocaleDateString()} | ${shift.shift_type}</p><hr/><div class="row"><span>Opening Cash:</span><span>Ksh ${shift.opening_cash?.toLocaleString()}</span></div><div class="row"><span>Total Sales:</span><span class="bold">Ksh ${stats.sales.toLocaleString()}</span></div><div class="row"><span>Less Expenses:</span><span style="color:red;">- Ksh ${stats.expenses.toLocaleString()}</span></div><div class="row"><span>Less Vouchers:</span><span style="color:red;">- Ksh ${stats.vouchers.toLocaleString()}</span></div><hr/><div class="row bold"><span>Net Sales:</span><span style="color:green;">Ksh ${net.toLocaleString()}</span></div><div class="row"><span>Closing Cash:</span><span>Ksh ${closing.toLocaleString()}</span></div><hr/><p style="text-align:center;font-size:10px;">Opened: ${shift.opened_by} | Closed: ${shift.closed_by || 'Admin'}</p></body></html>`;
        const win = window.open('', '_blank', 'width=350,height=500');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl">⏰</span>
                    Shift Management
                </h1>
                {!currentShift ? (
                    <button onClick={() => setShowStartModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold">▶️ Start Shift</button>
                ) : (
                    <button onClick={() => setShowEndModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold">⏹️ End Shift</button>
                )}
            </div>

            {currentShift && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white shadow-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="text-4xl animate-pulse">🟢</span>
                            <div>
                                <p className="text-sm opacity-80">Current Shift Active</p>
                                <p className="text-2xl font-bold">{currentShift.shift_type} Shift</p>
                                <p className="text-sm">Started: {currentShift.start_time} | Opening: Ksh {currentShift.opening_cash?.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-6 text-center">
                            <div><p className="text-sm opacity-80">Sales</p><p className="text-2xl font-bold">Ksh {shiftStats.sales.toLocaleString()}</p></div>
                            <div><p className="text-sm opacity-80">Expenses</p><p className="text-2xl font-bold">Ksh {shiftStats.expenses.toLocaleString()}</p></div>
                            <div><p className="text-sm opacity-80">Net</p><p className="text-2xl font-bold">Ksh {(shiftStats.sales - shiftStats.expenses - shiftStats.vouchers).toLocaleString()}</p></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-5 text-white"><span className="text-3xl">⏰</span><p className="text-sm opacity-80 mt-2">Total Shifts</p><p className="text-3xl font-bold">{shifts.length}</p></div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white"><span className="text-3xl">✅</span><p className="text-sm opacity-80 mt-2">Open</p><p className="text-3xl font-bold">{shifts.filter(s => s.status === 'Open').length}</p></div>
                <div className="bg-gradient-to-br from-gray-500 to-slate-600 rounded-2xl p-5 text-white"><span className="text-3xl">🔒</span><p className="text-sm opacity-80 mt-2">Closed</p><p className="text-3xl font-bold">{shifts.filter(s => s.status === 'Closed').length}</p></div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white"><span className="text-3xl">💰</span><p className="text-sm opacity-80 mt-2">Total Net Sales</p><p className="text-2xl font-bold">Ksh {shifts.reduce((sum, s) => sum + (s.net_sales || 0), 0).toLocaleString()}</p></div>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-cyan-50 to-blue-50">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-xs">Date</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Shift</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Start</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">End</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Opening</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Sales</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Expenses</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Net Sales</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? <tr><td colSpan={9} className="py-16 text-center">Loading...</td></tr> :
                            shifts.map(s => (
                                <tr key={s.shift_id} className={`border-t ${s.status === 'Open' ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                                    <td className="py-3 px-4">{new Date(s.shift_date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.shift_type === 'Morning' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{s.shift_type}</span></td>
                                    <td className="py-3 px-4 text-center">{s.start_time}</td>
                                    <td className="py-3 px-4 text-center">{s.end_time || '-'}</td>
                                    <td className="py-3 px-4 text-right">Ksh {s.opening_cash?.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-bold text-green-600">Ksh {s.total_sales?.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right text-red-600">Ksh {s.total_expenses?.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-bold text-blue-600">Ksh {s.net_sales?.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.status === 'Open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{s.status}</span></td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {showStartModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">▶️ Start New Shift</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-green-50 rounded-xl"><p className="text-sm text-green-700">Starting {new Date().getHours() < 14 ? 'Morning' : 'Evening'} shift for {new Date().toLocaleDateString()}</p></div>
                            <div><label className="text-sm text-gray-600">Opening Cash (Drop Amount)</label><input type="number" value={openingCash} onChange={e => setOpeningCash(parseFloat(e.target.value) || 0)} className="w-full p-3 border rounded-xl text-lg font-bold" placeholder="Enter opening cash..." /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowStartModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={startShift} className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold">▶️ Start & Print Drop</button>
                        </div>
                    </div>
                </div>
            )}

            {showEndModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">⏹️ End Shift</h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                                <div><p className="text-sm text-gray-500">Opening Cash</p><p className="font-bold">Ksh {currentShift?.opening_cash?.toLocaleString()}</p></div>
                                <div><p className="text-sm text-gray-500">Total Sales</p><p className="font-bold text-green-600">Ksh {shiftStats.sales.toLocaleString()}</p></div>
                                <div><p className="text-sm text-gray-500">Expenses</p><p className="font-bold text-red-600">- Ksh {shiftStats.expenses.toLocaleString()}</p></div>
                                <div><p className="text-sm text-gray-500">Vouchers</p><p className="font-bold text-red-600">- Ksh {shiftStats.vouchers.toLocaleString()}</p></div>
                            </div>
                            <div className="p-4 bg-blue-50 rounded-xl"><p className="text-sm text-blue-700">Net Sales</p><p className="text-2xl font-bold text-blue-700">Ksh {(shiftStats.sales - shiftStats.expenses - shiftStats.vouchers).toLocaleString()}</p></div>
                            <div><label className="text-sm text-gray-600">Closing Cash Count</label><input type="number" value={closingCash} onChange={e => setClosingCash(parseFloat(e.target.value) || 0)} className="w-full p-3 border rounded-xl text-lg font-bold" /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowEndModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={endShift} className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold">⏹️ Close & Print Report</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
