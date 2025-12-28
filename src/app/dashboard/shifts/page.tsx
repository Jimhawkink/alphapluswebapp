'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ShiftDefinition {
    definition_id: number;
    shift_name: string;
    shift_code: string;
    start_time: string;
    end_time: string;
}

interface ShiftInstance {
    shift_id: number;
    shift_code: string;
    shift_name: string;
    shift_date: string;
    started_at: string;
    ended_at: string | null;
    started_by_name: string;
    ended_by_name: string | null;
    opening_cash: number;
    total_sales: number;
    total_cash_sales: number;
    total_mpesa_sales: number;
    total_expenses: number;
    total_vouchers: number;
    total_petty_cash: number;
    expected_cash: number;
    actual_cash: number;
    cash_variance: number;
    net_sales: number;
    status: string;
}

interface ShiftExpense {
    expense_id: number;
    expense_type: string;
    description: string;
    amount: number;
    paid_to: string;
    created_at: string;
}

export default function ShiftsPage() {
    const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
    const [shifts, setShifts] = useState<ShiftInstance[]>([]);
    const [activeShift, setActiveShift] = useState<ShiftInstance | null>(null);
    const [expenses, setExpenses] = useState<ShiftExpense[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal states
    const [showStartModal, setShowStartModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedShift, setSelectedShift] = useState<ShiftInstance | null>(null);

    // Form states
    const [selectedDefinition, setSelectedDefinition] = useState<number>(0);
    const [openingCash, setOpeningCash] = useState<number>(0);
    const [openingNotes, setOpeningNotes] = useState('');
    const [actualCash, setActualCash] = useState<number>(0);
    const [closingNotes, setClosingNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Expense form
    const [expenseType, setExpenseType] = useState('Petty Cash');
    const [expenseDesc, setExpenseDesc] = useState('');
    const [expenseAmount, setExpenseAmount] = useState<number>(0);
    const [expensePaidTo, setExpensePaidTo] = useState('');

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Load definitions
            const { data: defs } = await supabase
                .from('shift_definitions')
                .select('*')
                .eq('active', true)
                .order('shift_name');

            setDefinitions(defs || []);
            if (defs && defs.length > 0) {
                setSelectedDefinition(defs[0].definition_id);
            }

            // Load recent shifts
            const { data: shiftsData } = await supabase
                .from('shift_instances')
                .select('*')
                .order('started_at', { ascending: false })
                .limit(20);

            setShifts(shiftsData || []);

            // Find active shift
            const active = shiftsData?.find(s => s.status === 'Active');
            setActiveShift(active || null);

            // Load expenses for active shift
            if (active) {
                const { data: expData } = await supabase
                    .from('shift_expenses')
                    .select('*')
                    .eq('shift_id', active.shift_id)
                    .order('created_at', { ascending: false });
                setExpenses(expData || []);
            }
        } catch (err) {
            console.error('Error loading data:', err);
            toast.error('Failed to load shifts');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const generateShiftCode = (defCode: string) => {
        const date = new Date();
        const dateCode = date.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = String(shifts.filter(s => s.shift_date === date.toISOString().slice(0, 10)).length + 1).padStart(3, '0');
        return `${defCode}-${dateCode}-${seq}`;
    };

    const startShift = async () => {
        if (!selectedDefinition) {
            toast.error('Select shift type');
            return;
        }

        setIsSaving(true);
        try {
            const def = definitions.find(d => d.definition_id === selectedDefinition);
            const shiftCode = generateShiftCode(def?.shift_code || 'SHF');

            const { data: newShift, error } = await supabase
                .from('shift_instances')
                .insert({
                    shift_code: shiftCode,
                    definition_id: selectedDefinition,
                    shift_name: def?.shift_name || 'Shift',
                    shift_date: new Date().toISOString().slice(0, 10),
                    started_by_name: 'Current User', // TODO: Get from auth
                    opening_cash: openingCash,
                    opening_notes: openingNotes,
                    status: 'Active',
                })
                .select()
                .single();

            if (error) throw error;

            // Add opening cash drop
            if (openingCash > 0) {
                await supabase.from('shift_cash_drops').insert({
                    shift_id: newShift.shift_id,
                    drop_type: 'Opening',
                    amount: openingCash,
                    dropped_by_name: 'Current User',
                    notes: 'Opening cash',
                });
            }

            toast.success(`✅ ${def?.shift_name} started!`);
            setShowStartModal(false);
            setOpeningCash(0);
            setOpeningNotes('');
            loadData();
        } catch (err) {
            console.error('Error starting shift:', err);
            toast.error('Failed to start shift');
        }
        setIsSaving(false);
    };

    const calculateShiftTotals = async (shiftId: number) => {
        // Get all sales for this shift
        const { data: sales } = await supabase
            .from('sales')
            .select('*')
            .eq('shift_id', shiftId)
            .eq('status', 'Completed');

        const totalSales = sales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0;
        const cashSales = sales?.filter(s => s.payment_method === 'Cash').reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0;
        const mpesaSales = sales?.filter(s => s.payment_method === 'M-Pesa').reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0;
        const cardSales = sales?.filter(s => s.payment_method === 'Card').reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0;

        // Get expenses
        const { data: expensesData } = await supabase
            .from('shift_expenses')
            .select('*')
            .eq('shift_id', shiftId);

        const totalExpenses = expensesData?.filter(e => e.expense_type === 'Expense').reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
        const totalVouchers = expensesData?.filter(e => e.expense_type === 'Voucher').reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
        const totalPettyCash = expensesData?.filter(e => e.expense_type === 'Petty Cash').reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

        return {
            totalSales,
            cashSales,
            mpesaSales,
            cardSales,
            totalExpenses,
            totalVouchers,
            totalPettyCash,
        };
    };

    const closeShift = async () => {
        if (!activeShift) return;

        setIsSaving(true);
        try {
            const totals = await calculateShiftTotals(activeShift.shift_id);
            const expectedCash = activeShift.opening_cash + totals.cashSales - totals.totalExpenses - totals.totalPettyCash;
            const variance = actualCash - expectedCash;
            const netSales = totals.totalSales - totals.totalExpenses - totals.totalVouchers - totals.totalPettyCash;

            const { error } = await supabase
                .from('shift_instances')
                .update({
                    ended_at: new Date().toISOString(),
                    ended_by_name: 'Current User',
                    total_sales: totals.totalSales,
                    total_cash_sales: totals.cashSales,
                    total_mpesa_sales: totals.mpesaSales,
                    total_card_sales: totals.cardSales,
                    total_expenses: totals.totalExpenses,
                    total_vouchers: totals.totalVouchers,
                    total_petty_cash: totals.totalPettyCash,
                    expected_cash: expectedCash,
                    actual_cash: actualCash,
                    cash_variance: variance,
                    net_sales: netSales,
                    status: 'Closed',
                    closing_notes: closingNotes,
                })
                .eq('shift_id', activeShift.shift_id);

            if (error) throw error;

            toast.success('✅ Shift closed successfully!');
            setShowCloseModal(false);
            setActualCash(0);
            setClosingNotes('');
            loadData();
        } catch (err) {
            console.error('Error closing shift:', err);
            toast.error('Failed to close shift');
        }
        setIsSaving(false);
    };

    const addExpense = async () => {
        if (!activeShift || !expenseDesc || expenseAmount <= 0) {
            toast.error('Fill all expense details');
            return;
        }

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('shift_expenses')
                .insert({
                    shift_id: activeShift.shift_id,
                    expense_type: expenseType,
                    description: expenseDesc,
                    amount: expenseAmount,
                    paid_to: expensePaidTo,
                    approved_by_name: 'Current User',
                });

            if (error) throw error;

            toast.success('Expense added');
            setShowExpenseModal(false);
            setExpenseDesc('');
            setExpenseAmount(0);
            setExpensePaidTo('');
            loadData();
        } catch (err) {
            console.error('Error adding expense:', err);
            toast.error('Failed to add expense');
        }
        setIsSaving(false);
    };

    const viewShiftReport = (shift: ShiftInstance) => {
        setSelectedShift(shift);
        setShowReportModal(true);
    };

    const printShiftReport = () => {
        if (!selectedShift) return;

        const reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Courier New', monospace; width: 80mm; margin: 0; padding: 10px; }
        .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
        .title { font-size: 16px; font-weight: bold; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        .label { }
        .value { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 10px 0; }
        .total { font-size: 14px; font-weight: bold; }
        .footer { text-align: center; margin-top: 15px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">SHIFT REPORT</div>
        <div>${selectedShift.shift_name}</div>
        <div>${selectedShift.shift_code}</div>
    </div>
    
    <div class="row"><span>Date:</span><span>${new Date(selectedShift.started_at).toLocaleDateString()}</span></div>
    <div class="row"><span>Started:</span><span>${new Date(selectedShift.started_at).toLocaleTimeString()}</span></div>
    <div class="row"><span>Ended:</span><span>${selectedShift.ended_at ? new Date(selectedShift.ended_at).toLocaleTimeString() : 'Active'}</span></div>
    <div class="row"><span>Started By:</span><span>${selectedShift.started_by_name}</span></div>
    
    <div class="divider"></div>
    
    <div class="row"><span>Opening Cash:</span><span class="value">${selectedShift.opening_cash.toLocaleString()}</span></div>
    
    <div class="divider"></div>
    <div style="font-weight: bold;">SALES</div>
    
    <div class="row"><span>Total Sales:</span><span class="value">${selectedShift.total_sales.toLocaleString()}</span></div>
    <div class="row"><span>  - Cash:</span><span>${selectedShift.total_cash_sales.toLocaleString()}</span></div>
    <div class="row"><span>  - M-Pesa:</span><span>${selectedShift.total_mpesa_sales.toLocaleString()}</span></div>
    
    <div class="divider"></div>
    <div style="font-weight: bold;">DEDUCTIONS</div>
    
    <div class="row"><span>Expenses:</span><span>-${selectedShift.total_expenses.toLocaleString()}</span></div>
    <div class="row"><span>Vouchers:</span><span>-${selectedShift.total_vouchers.toLocaleString()}</span></div>
    <div class="row"><span>Petty Cash:</span><span>-${selectedShift.total_petty_cash.toLocaleString()}</span></div>
    
    <div class="divider"></div>
    
    <div class="row total"><span>EXPECTED CASH:</span><span>${selectedShift.expected_cash.toLocaleString()}</span></div>
    <div class="row total"><span>ACTUAL CASH:</span><span>${selectedShift.actual_cash.toLocaleString()}</span></div>
    <div class="row total" style="color: ${selectedShift.cash_variance >= 0 ? 'green' : 'red'}">
        <span>VARIANCE:</span><span>${selectedShift.cash_variance >= 0 ? '+' : ''}${selectedShift.cash_variance.toLocaleString()}</span>
    </div>
    
    <div class="divider"></div>
    
    <div class="row total" style="font-size: 16px;"><span>NET SALES:</span><span>KSh ${selectedShift.net_sales.toLocaleString()}</span></div>
    
    <div class="footer">
        <div>--- End of Shift Report ---</div>
        <div>Printed: ${new Date().toLocaleString()}</div>
    </div>
</body>
</html>`;

        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
            printWindow.document.write(reportHTML);
            printWindow.document.close();
            printWindow.print();
        }
    };

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">⏰</span>
                        Shift Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Start shifts, track cash, close and print reports
                    </p>
                </div>

                <div className="flex gap-3">
                    {!activeShift ? (
                        <button
                            onClick={() => setShowStartModal(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-2xl shadow-lg shadow-green-300/40 hover:scale-105 transition-all"
                        >
                            <span className="text-xl">▶️</span>
                            Start New Shift
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => setShowExpenseModal(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition-all"
                            >
                                <span>💸</span>
                                Add Expense
                            </button>
                            <button
                                onClick={() => setShowCloseModal(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition-all"
                            >
                                <span>⏹️</span>
                                Close Shift
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Active Shift Card */}
            {activeShift && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 text-white shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                            <span className="text-xl font-bold">Active Shift</span>
                        </div>
                        <span className="px-3 py-1 bg-white/20 rounded-lg font-mono">{activeShift.shift_code}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/20 rounded-xl p-3">
                            <p className="text-green-100 text-sm">Shift Type</p>
                            <p className="text-xl font-bold">{activeShift.shift_name}</p>
                        </div>
                        <div className="bg-white/20 rounded-xl p-3">
                            <p className="text-green-100 text-sm">Started At</p>
                            <p className="text-xl font-bold">{formatTime(activeShift.started_at)}</p>
                        </div>
                        <div className="bg-white/20 rounded-xl p-3">
                            <p className="text-green-100 text-sm">Opening Cash</p>
                            <p className="text-xl font-bold">KSh {activeShift.opening_cash.toLocaleString()}</p>
                        </div>
                        <div className="bg-white/20 rounded-xl p-3">
                            <p className="text-green-100 text-sm">Started By</p>
                            <p className="text-xl font-bold">{activeShift.started_by_name}</p>
                        </div>
                    </div>

                    {/* Expenses during shift */}
                    {expenses.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/20">
                            <p className="text-sm text-green-100 mb-2">Expenses this shift:</p>
                            <div className="flex flex-wrap gap-2">
                                {expenses.slice(0, 5).map(exp => (
                                    <span key={exp.expense_id} className="px-3 py-1 bg-white/20 rounded-lg text-sm">
                                        {exp.expense_type}: KSh {exp.amount.toLocaleString()}
                                    </span>
                                ))}
                                {expenses.length > 5 && <span className="text-sm">+{expenses.length - 5} more</span>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No Active Shift */}
            {!activeShift && !isLoading && (
                <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-2xl p-8 text-center">
                    <span className="text-5xl">⏸️</span>
                    <h3 className="text-xl font-bold text-gray-700 mt-4">No Active Shift</h3>
                    <p className="text-gray-500 mt-2">Start a new shift to begin recording sales</p>
                </div>
            )}

            {/* Recent Shifts Table */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 text-white">
                    <h2 className="text-lg font-bold">📋 Recent Shifts</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Code</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Type</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Time</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Sales</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Net</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Status</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-gray-400">Loading...</td>
                                </tr>
                            ) : shifts.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-gray-400">No shifts yet</td>
                                </tr>
                            ) : (
                                shifts.map((shift) => (
                                    <tr key={shift.shift_id} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3 font-mono text-sm">{shift.shift_code}</td>
                                        <td className="px-4 py-3">{shift.shift_name}</td>
                                        <td className="px-4 py-3 text-sm">{formatDate(shift.started_at)}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {formatTime(shift.started_at)}
                                            {shift.ended_at && ` - ${formatTime(shift.ended_at)}`}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold">{shift.total_sales.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-green-600">{shift.net_sales.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${shift.status === 'Active'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                {shift.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => viewShiftReport(shift)}
                                                className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-lg text-sm hover:bg-indigo-200 transition-colors"
                                            >
                                                📊 View
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Start Shift Modal */}
            {showStartModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-5 rounded-t-3xl text-white">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                ▶️ Start New Shift
                            </h2>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Shift Type *</label>
                                <select
                                    value={selectedDefinition}
                                    onChange={(e) => setSelectedDefinition(parseInt(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500"
                                >
                                    {definitions.map(d => (
                                        <option key={d.definition_id} value={d.definition_id}>
                                            {d.shift_name} ({d.start_time} - {d.end_time})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">💵 Opening Cash (Drop Amount)</label>
                                <input
                                    type="number"
                                    value={openingCash}
                                    onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 text-2xl font-bold text-center"
                                    min="0"
                                    placeholder="0"
                                />
                                <p className="text-xs text-gray-500 mt-1">Cash in drawer at start of shift</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">📝 Notes (Optional)</label>
                                <textarea
                                    value={openingNotes}
                                    onChange={(e) => setOpeningNotes(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500"
                                    rows={2}
                                    placeholder="Any notes..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4 border-t">
                                <button onClick={() => setShowStartModal(false)} className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                                <button onClick={startShift} disabled={isSaving} className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl shadow-lg disabled:opacity-60">
                                    {isSaving ? 'Starting...' : 'Start Shift ▶️'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Shift Modal */}
            {showCloseModal && activeShift && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 rounded-t-3xl text-white">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                ⏹️ Close Shift
                            </h2>
                            <p className="text-red-100 text-sm mt-1">{activeShift.shift_name} - {activeShift.shift_code}</p>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-sm text-gray-500">Opening Cash</p>
                                <p className="text-2xl font-bold text-gray-800">KSh {activeShift.opening_cash.toLocaleString()}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">💵 Actual Cash Count</label>
                                <input
                                    type="number"
                                    value={actualCash}
                                    onChange={(e) => setActualCash(parseFloat(e.target.value) || 0)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-red-500 text-2xl font-bold text-center"
                                    min="0"
                                    placeholder="Count the cash..."
                                />
                                <p className="text-xs text-gray-500 mt-1">Physical cash counted in drawer</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">📝 Closing Notes</label>
                                <textarea
                                    value={closingNotes}
                                    onChange={(e) => setClosingNotes(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-red-500"
                                    rows={2}
                                    placeholder="Any notes about the shift..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4 border-t">
                                <button onClick={() => setShowCloseModal(false)} className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                                <button onClick={closeShift} disabled={isSaving} className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl shadow-lg disabled:opacity-60">
                                    {isSaving ? 'Closing...' : 'Close & Print ⏹️'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Expense Modal */}
            {showExpenseModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 rounded-t-3xl text-white">
                            <h2 className="text-xl font-bold">💸 Add Expense</h2>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Expense Type</label>
                                <select
                                    value={expenseType}
                                    onChange={(e) => setExpenseType(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
                                >
                                    <option value="Petty Cash">Petty Cash</option>
                                    <option value="Expense">Expense</option>
                                    <option value="Voucher">Voucher</option>
                                    <option value="Supplier Payment">Supplier Payment</option>
                                    <option value="Refund">Refund</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Description *</label>
                                <input
                                    type="text"
                                    value={expenseDesc}
                                    onChange={(e) => setExpenseDesc(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
                                    placeholder="What is this for?"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Amount *</label>
                                <input
                                    type="number"
                                    value={expenseAmount}
                                    onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xl font-bold"
                                    min="0"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Paid To</label>
                                <input
                                    type="text"
                                    value={expensePaidTo}
                                    onChange={(e) => setExpensePaidTo(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
                                    placeholder="Name of recipient"
                                />
                            </div>

                            <div className="flex gap-4 pt-4 border-t">
                                <button onClick={() => setShowExpenseModal(false)} className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
                                <button onClick={addExpense} disabled={isSaving} className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl shadow-lg disabled:opacity-60">
                                    {isSaving ? 'Adding...' : 'Add Expense'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* View Shift Report Modal */}
            {showReportModal && selectedShift && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-5 rounded-t-3xl text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">📊 Shift Report</h2>
                                    <p className="text-indigo-100 text-sm">{selectedShift.shift_code}</p>
                                </div>
                                <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-white/20 rounded-full">✕</button>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Header Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-sm text-gray-500">Shift Type</p>
                                    <p className="font-bold text-gray-800">{selectedShift.shift_name}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-sm text-gray-500">Date</p>
                                    <p className="font-bold text-gray-800">{formatDate(selectedShift.started_at)}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-sm text-gray-500">Duration</p>
                                    <p className="font-bold text-gray-800">
                                        {formatTime(selectedShift.started_at)} - {selectedShift.ended_at ? formatTime(selectedShift.ended_at) : 'Active'}
                                    </p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-sm text-gray-500">Started By</p>
                                    <p className="font-bold text-gray-800">{selectedShift.started_by_name}</p>
                                </div>
                            </div>

                            {/* Opening Cash */}
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                                <div className="flex justify-between items-center">
                                    <span className="text-blue-700">Opening Cash</span>
                                    <span className="text-xl font-bold text-blue-700">KSh {selectedShift.opening_cash.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Sales */}
                            <div className="bg-green-50 rounded-xl p-4 border border-green-200 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-green-700 font-semibold">Total Sales</span>
                                    <span className="text-xl font-bold text-green-700">KSh {selectedShift.total_sales.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-green-600">Cash Sales</span>
                                    <span className="text-green-600">{selectedShift.total_cash_sales.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-green-600">M-Pesa Sales</span>
                                    <span className="text-green-600">{selectedShift.total_mpesa_sales.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Deductions */}
                            <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-2">
                                <p className="text-red-700 font-semibold">Deductions</p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-red-600">Expenses</span>
                                    <span className="text-red-600">-{selectedShift.total_expenses.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-red-600">Vouchers</span>
                                    <span className="text-red-600">-{selectedShift.total_vouchers.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-red-600">Petty Cash</span>
                                    <span className="text-red-600">-{selectedShift.total_petty_cash.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Cash Summary */}
                            <div className="bg-gray-100 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-700">Expected Cash</span>
                                    <span className="font-semibold">{selectedShift.expected_cash.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-700">Actual Cash</span>
                                    <span className="font-semibold">{selectedShift.actual_cash.toLocaleString()}</span>
                                </div>
                                <div className={`flex justify-between pt-2 border-t border-gray-200 ${selectedShift.cash_variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    <span className="font-semibold">Variance</span>
                                    <span className="font-bold">{selectedShift.cash_variance >= 0 ? '+' : ''}{selectedShift.cash_variance.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Net Sales */}
                            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl p-4 text-white">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-semibold">NET SALES</span>
                                    <span className="text-2xl font-bold">KSh {selectedShift.net_sales.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Print Button */}
                            <button
                                onClick={printShiftReport}
                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all flex items-center justify-center gap-2"
                            >
                                <span>🖨️</span>
                                Print Thermal Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
