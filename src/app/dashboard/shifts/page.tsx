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
    const [shiftStats, setShiftStats] = useState({ sales: 0, expenses: 0, vouchers: 0, advances: 0 });

    const loadShifts = useCallback(async () => {
        setIsLoading(true);

        // Check for current open shift
        const { data: openShift } = await supabase.from('shifts').select('*').eq('status', 'Open').single();
        setCurrentShift(openShift);

        // Load all shifts
        const { data } = await supabase.from('shifts').select('*').order('shift_id', { ascending: false }).limit(30);
        setShifts(data || []);

        // Load stats for current shift
        if (openShift) {
            // Get sales for this shift - use shift_id and total_amount (correct column name)
            const { data: salesData } = await supabase
                .from('sales')
                .select('total_amount, payment_method')
                .eq('sale_date', openShift.shift_date);

            // Get expenses for today
            const { data: expData } = await supabase
                .from('expenses')
                .select('amount')
                .eq('expense_date', openShift.shift_date);

            // Get vouchers for today
            const { data: vchData } = await supabase
                .from('vouchers')
                .select('amount')
                .eq('voucher_date', openShift.shift_date);

            // Get salary advances for today
            const { data: advData } = await supabase
                .from('salary_advances')
                .select('amount')
                .eq('advance_date', openShift.shift_date)
                .eq('status', 'Approved');

            const totalSales = (salesData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);
            const totalExpenses = (expData || []).reduce((sum, e) => sum + (e.amount || 0), 0);
            const totalVouchers = (vchData || []).reduce((sum, v) => sum + (v.amount || 0), 0);
            const totalAdvances = (advData || []).reduce((sum, a) => sum + (a.amount || 0), 0);

            console.log('Shift Stats:', { totalSales, totalExpenses, totalVouchers, totalAdvances, salesCount: salesData?.length });

            setShiftStats({
                sales: totalSales,
                expenses: totalExpenses,
                vouchers: totalVouchers,
                advances: totalAdvances
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
        const netSales = shiftStats.sales - shiftStats.expenses - shiftStats.vouchers - shiftStats.advances;

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

    const printShiftReport = async (shift: Shift, stats: { sales: number; expenses: number; vouchers: number }, closing: number, net: number) => {
        // Fetch company info
        let companyName = 'Your Business Name';
        let companyPhone = '';
        let companyAddress = '';

        try {
            const { data: company } = await supabase.from('companies').select('*').limit(1).single();
            if (company) {
                companyName = company.company_name || company.name || 'Your Business Name';
                companyPhone = company.phone || company.contact_phone || '';
                companyAddress = company.address || company.location || '';
            }
        } catch (err) {
            console.log('Could not fetch company info');
        }

        // Fetch sales breakdown by payment method
        let cashSales = 0, mpesaSales = 0, cardSales = 0, creditSales = 0;
        let totalTransactions = 0;

        try {
            const { data: salesData } = await supabase
                .from('sales')
                .select('total_amount, payment_method, status')
                .eq('sale_date', shift.shift_date);

            if (salesData) {
                totalTransactions = salesData.length;
                salesData.forEach(sale => {
                    const method = (sale.payment_method || '').toUpperCase();
                    const amount = sale.total_amount || 0;
                    if (method.includes('CASH')) cashSales += amount;
                    else if (method.includes('MPESA') || method.includes('M-PESA')) mpesaSales += amount;
                    else if (method.includes('CARD')) cardSales += amount;
                    else if (method.includes('CREDIT') || sale.status === 'Pending') creditSales += amount;
                    else cashSales += amount;
                });
            }
        } catch (err) {
            console.log('Could not fetch sales breakdown');
        }

        // Fetch expense details
        let expensesList: { description: string; amount: number }[] = [];
        try {
            const { data: expData } = await supabase
                .from('expenses')
                .select('description, amount')
                .eq('expense_date', shift.shift_date);
            if (expData) expensesList = expData;
        } catch (err) {
            console.log('Could not fetch expenses');
        }

        const shiftType = shift.shift_type === 'Morning' ? 'DAY SHIFT' : 'NIGHT SHIFT';
        const expectedCash = (shift.opening_cash || 0) + cashSales - stats.expenses;
        const variance = closing - expectedCash;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Courier New', monospace; 
            width: 80mm; 
            padding: 3mm; 
            font-size: 11px;
            line-height: 1.4;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .header { 
            border-bottom: 2px dashed #000; 
            padding-bottom: 8px; 
            margin-bottom: 8px; 
        }
        .company-name { 
            font-size: 16px; 
            font-weight: bold; 
            letter-spacing: 1px;
        }
        .shift-type { 
            font-size: 14px; 
            font-weight: bold;
            background: #000;
            color: #fff;
            padding: 4px 8px;
            margin: 8px 0;
            display: inline-block;
        }
        .row { 
            display: flex; 
            justify-content: space-between; 
            padding: 2px 0; 
        }
        .section { 
            border-top: 1px dashed #000; 
            padding-top: 6px; 
            margin-top: 6px; 
        }
        .total-row { 
            font-size: 14px; 
            font-weight: bold; 
            background: #f0f0f0; 
            padding: 6px 4px; 
            margin: 4px 0;
        }
        .positive { color: green; }
        .negative { color: red; }
        .footer { 
            border-top: 2px dashed #000; 
            padding-top: 8px; 
            margin-top: 10px; 
            font-size: 10px;
        }
        .signature-line {
            border-bottom: 1px solid #000;
            margin-top: 20px;
            padding-bottom: 2px;
        }
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
        <div class="row"><span>Shift Started:</span><span>${shift.start_time}</span></div>
        <div class="row"><span>Shift Ended:</span><span>${new Date().toLocaleTimeString()}</span></div>
        <div class="row"><span>Opened By:</span><span>${shift.opened_by}</span></div>
        <div class="row"><span>Closed By:</span><span>${shift.closed_by || 'Admin'}</span></div>
    </div>

    <div class="section">
        <div class="center bold" style="margin-bottom: 6px;">💰 CASH SUMMARY</div>
        <div class="row"><span>Opening Cash:</span><span>Ksh ${(shift.opening_cash || 0).toLocaleString()}</span></div>
        <div class="row bold"><span>Total Sales:</span><span>Ksh ${stats.sales.toLocaleString()}</span></div>
        <div class="row negative"><span>Less Expenses:</span><span>- Ksh ${stats.expenses.toLocaleString()}</span></div>
        <div class="row negative"><span>Less Vouchers:</span><span>- Ksh ${stats.vouchers.toLocaleString()}</span></div>
        <div class="total-row row"><span>NET SALES:</span><span class="positive">Ksh ${net.toLocaleString()}</span></div>
    </div>

    <div class="section">
        <div class="center bold" style="margin-bottom: 6px;">📊 SALES BY PAYMENT</div>
        <div class="row"><span>💵 Cash Sales:</span><span>Ksh ${cashSales.toLocaleString()}</span></div>
        <div class="row"><span>📱 M-Pesa Sales:</span><span>Ksh ${mpesaSales.toLocaleString()}</span></div>
        <div class="row"><span>💳 Card Sales:</span><span>Ksh ${cardSales.toLocaleString()}</span></div>
        <div class="row"><span>📝 Credit Sales:</span><span>Ksh ${creditSales.toLocaleString()}</span></div>
        <div class="row bold" style="margin-top: 4px;"><span>Total Transactions:</span><span>${totalTransactions}</span></div>
    </div>

    ${expensesList.length > 0 ? `
    <div class="section">
        <div class="center bold" style="margin-bottom: 6px;">📤 EXPENSES</div>
        ${expensesList.map(e => `<div class="row"><span>${e.description || 'Expense'}:</span><span>- Ksh ${(e.amount || 0).toLocaleString()}</span></div>`).join('')}
    </div>
    ` : ''}

    <div class="section">
        <div class="center bold" style="margin-bottom: 6px;">💵 CASH RECONCILIATION</div>
        <div class="row"><span>Expected Cash:</span><span>Ksh ${expectedCash.toLocaleString()}</span></div>
        <div class="row"><span>Actual Cash Count:</span><span>Ksh ${closing.toLocaleString()}</span></div>
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
                        <div className="grid grid-cols-4 gap-4 text-center">
                            <div><p className="text-sm opacity-80">Sales</p><p className="text-xl font-bold">Ksh {shiftStats.sales.toLocaleString()}</p></div>
                            <div><p className="text-sm opacity-80">Expenses</p><p className="text-xl font-bold">Ksh {shiftStats.expenses.toLocaleString()}</p></div>
                            <div><p className="text-sm opacity-80">Advances</p><p className="text-xl font-bold">Ksh {shiftStats.advances.toLocaleString()}</p></div>
                            <div><p className="text-sm opacity-80">Net</p><p className="text-xl font-bold">Ksh {(shiftStats.sales - shiftStats.expenses - shiftStats.vouchers - shiftStats.advances).toLocaleString()}</p></div>
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
                            {/* Summary Grid */}
                            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl">
                                <div className="p-3 bg-white rounded-lg">
                                    <p className="text-xs text-gray-500">Opening Cash</p>
                                    <p className="font-bold text-lg">Ksh {(currentShift?.opening_cash || 0).toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-green-50 rounded-lg">
                                    <p className="text-xs text-gray-500">Total Sales</p>
                                    <p className="font-bold text-lg text-green-600">Ksh {shiftStats.sales.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded-lg">
                                    <p className="text-xs text-gray-500">Expenses</p>
                                    <p className="font-bold text-red-600">- Ksh {shiftStats.expenses.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded-lg">
                                    <p className="text-xs text-gray-500">Vouchers</p>
                                    <p className="font-bold text-red-600">- Ksh {shiftStats.vouchers.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-orange-50 rounded-lg col-span-2">
                                    <p className="text-xs text-gray-500">Salary Advances</p>
                                    <p className="font-bold text-orange-600">- Ksh {shiftStats.advances.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Net Sales */}
                            <div className="p-4 bg-blue-50 rounded-xl">
                                <p className="text-sm text-blue-700">Net Sales (Sales - Expenses - Vouchers - Advances)</p>
                                <p className="text-2xl font-bold text-blue-700">
                                    Ksh {(shiftStats.sales - shiftStats.expenses - shiftStats.vouchers - shiftStats.advances).toLocaleString()}
                                </p>
                            </div>

                            {/* Expected Cash Calculation */}
                            <div className="p-4 bg-amber-50 rounded-xl">
                                <p className="text-sm text-amber-700">Expected Cash in Till</p>
                                <p className="text-xl font-bold text-amber-700">
                                    Ksh {((currentShift?.opening_cash || 0) + shiftStats.sales - shiftStats.expenses - shiftStats.vouchers - shiftStats.advances).toLocaleString()}
                                </p>
                                <p className="text-xs text-amber-600 mt-1">Opening + Sales - Expenses - Vouchers - Advances</p>
                            </div>

                            {/* Closing Cash Input */}
                            <div>
                                <label className="text-sm text-gray-600 font-medium">Closing Cash Count</label>
                                <input
                                    type="number"
                                    value={closingCash}
                                    onChange={e => setClosingCash(parseFloat(e.target.value) || 0)}
                                    className="w-full p-3 border rounded-xl text-lg font-bold focus:border-blue-500 focus:outline-none"
                                    placeholder="Count and enter closing cash..."
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowEndModal(false)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Cancel</button>
                            <button onClick={endShift} className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold hover:shadow-lg">⏹️ Close & Print Report</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
