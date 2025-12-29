'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Employee {
    user_id: number;
    user_code: string;
    name: string;
    user_type: string;
    phone: string;
    basic_salary: number;
    pay_type: string;
    salary_amount: number;
}

interface PayrollEntry {
    payroll_id: number;
    employee_id: number;
    employee_name: string;
    pay_period: string;
    basic_salary: number;
    allowances: number;
    deductions: number;
    advances: number;
    paye: number;
    nhif: number;
    nssf: number;
    net_pay: number;
    status: string;
    paid_date: string;
}

interface WeeklyReport {
    week: number;
    weekLabel: string;
    startDate: string;
    endDate: string;
    totalEmployees: number;
    totalGross: number;
    totalNet: number;
    paidCount: number;
    pendingCount: number;
    status: 'Paid' | 'Partial' | 'Pending' | 'Not Started';
}

export default function PayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
    const [allMonthPayroll, setAllMonthPayroll] = useState<PayrollEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);
    const [showReports, setShowReports] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);

    // Week-based period selection
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekOfMonth());

    const [formData, setFormData] = useState({
        basic_salary: 0,
        overtime: 0,
        allowances: 0,
        bonuses: 0,
        salary_advance: 0,
        other_deductions: 0
    });
    const [calcGross, setCalcGross] = useState(0);

    // Get current week of the month (1-5)
    function getCurrentWeekOfMonth() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const dayOfMonth = now.getDate();
        return Math.ceil((dayOfMonth + firstDay.getDay()) / 7);
    }

    // Generate pay period string (e.g., "2025-12-W1")
    const getPayPeriod = () => `${selectedMonth}-W${selectedWeek}`;

    // Get week dates for a specific week of the month
    const getWeekDates = (month: string, weekNum: number): { start: Date; end: Date } => {
        const [year, monthNum] = month.split('-').map(Number);
        const firstDay = new Date(year, monthNum - 1, 1);
        const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday

        // Start of week 1 is the first day of the month
        const startDay = (weekNum - 1) * 7 - firstDayOfWeek + 1;
        const start = new Date(year, monthNum - 1, Math.max(1, startDay));

        // End of week
        const endDay = startDay + 6;
        const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
        const end = new Date(year, monthNum - 1, Math.min(lastDayOfMonth, endDay));

        return { start, end };
    };

    // Get weeks in the selected month
    const getWeeksInMonth = () => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const totalDays = lastDay.getDate();
        const firstDayOfWeek = firstDay.getDay();
        return Math.ceil((totalDays + firstDayOfWeek) / 7);
    };

    // Format week label (e.g., "Week 1 (Dec 1-7)")
    const formatWeekLabel = (weekNum: number): string => {
        const { start, end } = getWeekDates(selectedMonth, weekNum);
        const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `Week ${weekNum} (${startStr} - ${endStr})`;
    };

    // Kenya Tax Brackets (2024) - Weekly rates (monthly / 4.33)
    const calculateWeeklyPAYE = (weeklyGross: number) => {
        const monthlyGross = weeklyGross * 4.33;
        let monthlyPaye = 0;
        if (monthlyGross <= 24000) monthlyPaye = monthlyGross * 0.1;
        else if (monthlyGross <= 32333) monthlyPaye = 2400 + (monthlyGross - 24000) * 0.25;
        else if (monthlyGross <= 500000) monthlyPaye = 4483.25 + (monthlyGross - 32333) * 0.3;
        else if (monthlyGross <= 800000) monthlyPaye = 144783.25 + (monthlyGross - 500000) * 0.325;
        else monthlyPaye = 242283.25 + (monthlyGross - 800000) * 0.35;
        return Math.round(monthlyPaye / 4.33);
    };

    const calculateWeeklyNHIF = (weeklyGross: number) => {
        const monthlyGross = weeklyGross * 4.33;
        let monthlyNhif = 0;
        if (monthlyGross <= 5999) monthlyNhif = 150;
        else if (monthlyGross <= 7999) monthlyNhif = 300;
        else if (monthlyGross <= 11999) monthlyNhif = 400;
        else if (monthlyGross <= 14999) monthlyNhif = 500;
        else if (monthlyGross <= 19999) monthlyNhif = 600;
        else if (monthlyGross <= 24999) monthlyNhif = 750;
        else if (monthlyGross <= 29999) monthlyNhif = 850;
        else if (monthlyGross <= 34999) monthlyNhif = 900;
        else if (monthlyGross <= 39999) monthlyNhif = 950;
        else if (monthlyGross <= 44999) monthlyNhif = 1000;
        else if (monthlyGross <= 49999) monthlyNhif = 1100;
        else if (monthlyGross <= 59999) monthlyNhif = 1200;
        else if (monthlyGross <= 69999) monthlyNhif = 1300;
        else if (monthlyGross <= 79999) monthlyNhif = 1400;
        else if (monthlyGross <= 89999) monthlyNhif = 1500;
        else if (monthlyGross <= 99999) monthlyNhif = 1600;
        else monthlyNhif = 1700;
        return Math.round(monthlyNhif / 4.33);
    };

    const calculateWeeklyNSSF = (weeklyGross: number) => {
        const monthlyGross = weeklyGross * 4.33;
        return Math.round(Math.min(monthlyGross * 0.06, 2160) / 4.33);
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: empData } = await supabase
                .from('users')
                .select('user_id, user_code, name, user_type, phone, basic_salary, pay_type, salary_amount')
                .eq('active', true);
            setEmployees(empData || []);

            // Load payroll for selected week
            const payPeriod = getPayPeriod();
            const { data: payData } = await supabase
                .from('payroll')
                .select('*')
                .eq('pay_period', payPeriod)
                .order('payroll_id', { ascending: false });
            setPayroll(payData || []);

            // Load all payroll for the month (for reports)
            const { data: allPayData } = await supabase
                .from('payroll')
                .select('*')
                .like('pay_period', `${selectedMonth}%`)
                .order('payroll_id', { ascending: false });
            setAllMonthPayroll(allPayData || []);
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, [selectedMonth, selectedWeek]);

    const getAdvances = async (empId: number) => {
        // Get advances for the selected month (to be deducted weekly)
        const { data } = await supabase
            .from('salary_advances')
            .select('amount')
            .eq('employee_id', empId)
            .like('repayment_date', `${selectedMonth}%`)
            .eq('status', 'Approved');
        const totalAdvances = (data || []).reduce((sum, a) => sum + (a.amount || 0), 0);
        // Return full advance amount - NO DIVISION (user enters exact weekly advance amount)
        return totalAdvances;
    };

    const openPayModal = async () => {
        setFormData({
            basic_salary: 0,
            overtime: 0,
            allowances: 0,
            bonuses: 0,
            salary_advance: 0,
            other_deductions: 0
        });
        setSelectedEmployeeId(0);
        setShowModal(true);
    };

    const handleEmployeeChange = async (empId: number) => {
        setSelectedEmployeeId(empId);
        const emp = employees.find(e => e.user_id === empId);
        if (emp) {
            const advances = await getAdvances(empId);
            // Calculate weekly salary (monthly / 4)
            const monthlySalary = emp.basic_salary || emp.salary_amount || 0;
            const weeklySalary = Math.round(monthlySalary / 4);
            setFormData({
                ...formData,
                basic_salary: weeklySalary,
                salary_advance: advances
            });
        }
    };

    const calculatePayroll = () => {
        const gross = formData.basic_salary + formData.overtime + formData.allowances + formData.bonuses;
        const paye = calculateWeeklyPAYE(gross);
        const nhif = calculateWeeklyNHIF(gross);
        const nssf = calculateWeeklyNSSF(gross);
        const totalDeductions = paye + nhif + nssf + formData.salary_advance + formData.other_deductions;
        const netPay = gross - totalDeductions;
        return { gross, paye, nhif, nssf, totalDeductions, netPay };
    };

    const handleSave = async () => {
        if (!selectedEmployeeId) {
            toast.error('Please select an employee');
            return;
        }
        setIsSaving(true);
        const calc = calculatePayroll();
        const emp = employees.find(e => e.user_id === selectedEmployeeId);
        const payPeriod = getPayPeriod();

        const { error } = await supabase.from('payroll').insert({
            employee_id: selectedEmployeeId,
            employee_name: emp?.name || '',
            pay_period: payPeriod,
            basic_salary: formData.basic_salary,
            allowances: formData.allowances + formData.bonuses + formData.overtime,
            deductions: formData.other_deductions,
            advances: formData.salary_advance,
            paye: calc.paye,
            nhif: calc.nhif,
            nssf: calc.nssf,
            net_pay: calc.netPay,
            status: 'Pending',
            paid_date: null
        });

        if (error) {
            toast.error('Failed to save payroll');
            console.error(error);
        } else {
            toast.success(`Weekly payroll generated for ${formatWeekLabel(selectedWeek)}!`);
            setShowModal(false);
            loadData();
        }
        setIsSaving(false);
    };

    const markAsPaid = async (entry: PayrollEntry) => {
        await supabase
            .from('payroll')
            .update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] })
            .eq('payroll_id', entry.payroll_id);
        toast.success('Marked as paid');
        loadData();
    };

    const printPayslip = (entry: PayrollEntry) => {
        const gross = (entry.basic_salary || 0) + (entry.allowances || 0);
        const weekNum = entry.pay_period.split('-W')[1] || '1';
        const html = `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;width:80mm;padding:4mm;font-size:11px;}
            h2{text-align:center;margin-bottom:5px;}
            .company{text-align:center;font-size:10px;color:#666;margin-bottom:15px;}
            .divider{border-top:1px dashed #ccc;margin:10px 0;}
            .row{display:flex;justify-content:space-between;padding:3px 0;}
            .section{font-weight:bold;background:#f5f5f5;padding:5px;margin:10px 0 5px 0;}
            .total{font-size:14px;font-weight:bold;background:#e8f5e9;padding:8px;margin-top:15px;}
            .weekly{background:#fff3cd;padding:8px;text-align:center;margin-bottom:10px;border-radius:5px;}
        </style></head><body>
            <h2>📋 WEEKLY PAYSLIP</h2>
            <div class="weekly">📅 Week ${weekNum} | ${entry.pay_period}</div>
            <div class="divider"></div>
            <div class="row"><span>Employee:</span><span><b>${entry.employee_name}</b></span></div>
            <div class="divider"></div>
            <div class="section">💰 EARNINGS (Weekly)</div>
            <div class="row"><span>Basic Salary:</span><span>Ksh ${entry.basic_salary?.toLocaleString()}</span></div>
            <div class="row"><span>Allowances:</span><span>Ksh ${entry.allowances?.toLocaleString()}</span></div>
            <div class="row" style="font-weight:bold;"><span>Gross Pay:</span><span>Ksh ${gross.toLocaleString()}</span></div>
            <div class="section">📉 DEDUCTIONS</div>
            <div class="row"><span>PAYE:</span><span>Ksh ${entry.paye?.toLocaleString()}</span></div>
            <div class="row"><span>NHIF:</span><span>Ksh ${entry.nhif?.toLocaleString()}</span></div>
            <div class="row"><span>NSSF:</span><span>Ksh ${entry.nssf?.toLocaleString()}</span></div>
            <div class="row"><span>Salary Advance:</span><span>Ksh ${entry.advances?.toLocaleString()}</span></div>
            <div class="row"><span>Other Deductions:</span><span>Ksh ${entry.deductions?.toLocaleString()}</span></div>
            <div class="total"><div class="row"><span>NET PAY:</span><span>Ksh ${entry.net_pay?.toLocaleString()}</span></div></div>
            <div class="divider"></div>
            <p style="text-align:center;font-size:9px;">Paid: ${entry.paid_date || 'Pending'}</p>
            <p style="text-align:center;font-size:8px;color:#999;">Generated on ${new Date().toLocaleString()}</p>
        </body></html>`;
        const win = window.open('', '_blank', 'width=350,height=600');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    const generatePayrollCode = (empId: number) => {
        return `PAY-${selectedMonth.replace('-', '')}-W${selectedWeek}-${String(empId).padStart(4, '0')}`;
    };

    const formatMonth = (month: string) => {
        const [year, monthNum] = month.split('-');
        const date = new Date(parseInt(year), parseInt(monthNum) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    // Generate weekly reports for the month
    const generateWeeklyReports = (): WeeklyReport[] => {
        const weeksCount = getWeeksInMonth();
        const reports: WeeklyReport[] = [];

        for (let week = 1; week <= weeksCount; week++) {
            const { start, end } = getWeekDates(selectedMonth, week);
            const weekPayPeriod = `${selectedMonth}-W${week}`;
            const weekPayroll = allMonthPayroll.filter(p => p.pay_period === weekPayPeriod);

            const paidCount = weekPayroll.filter(p => p.status === 'Paid').length;
            const pendingCount = weekPayroll.filter(p => p.status === 'Pending').length;
            const totalGross = weekPayroll.reduce((sum, p) => sum + (p.basic_salary || 0) + (p.allowances || 0), 0);
            const totalNet = weekPayroll.reduce((sum, p) => sum + (p.net_pay || 0), 0);

            let status: 'Paid' | 'Partial' | 'Pending' | 'Not Started' = 'Not Started';
            if (weekPayroll.length > 0) {
                if (paidCount === weekPayroll.length) status = 'Paid';
                else if (paidCount > 0) status = 'Partial';
                else status = 'Pending';
            }

            reports.push({
                week,
                weekLabel: `Week ${week}`,
                startDate: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                endDate: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                totalEmployees: weekPayroll.length,
                totalGross,
                totalNet,
                paidCount,
                pendingCount,
                status
            });
        }

        return reports;
    };

    const calc = calculatePayroll();
    const totalGross = payroll.reduce((sum, p) => sum + (p.basic_salary || 0) + (p.allowances || 0), 0);
    const totalPaye = payroll.reduce((sum, p) => sum + (p.paye || 0), 0);
    const totalNet = payroll.reduce((sum, p) => sum + (p.net_pay || 0), 0);
    const paidCount = payroll.filter(p => p.status === 'Paid').length;
    const pendingCount = payroll.filter(p => p.status === 'Pending').length;
    const weeklyReports = generateWeeklyReports();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="text-3xl">📋</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            💰 Weekly Payroll Management
                        </h1>
                        <p className="text-sm text-gray-500">Kenya PAYE/NHIF/NSSF compliant weekly payroll system</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReports(true)}
                        className="px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        📊 Weekly Reports
                    </button>
                    <button
                        onClick={() => setShowCalculator(true)}
                        className="px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        🧮 Tax Calculator
                    </button>
                    <button
                        onClick={openPayModal}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all flex items-center gap-2"
                    >
                        + Generate Weekly Payroll
                    </button>
                </div>
            </div>

            {/* Pay Period Selector - Month + Week */}
            <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200">
                <span className="text-2xl">📅</span>
                <div className="flex items-center gap-4">
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Month</label>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => { setSelectedMonth(e.target.value); setSelectedWeek(1); }}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Week</label>
                        <select
                            value={selectedWeek}
                            onChange={e => setSelectedWeek(parseInt(e.target.value))}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                        >
                            {Array.from({ length: getWeeksInMonth() }, (_, i) => i + 1).map(week => (
                                <option key={week} value={week}>
                                    {formatWeekLabel(week)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={loadData}
                        className="p-2.5 border border-gray-200 rounded-xl hover:bg-white mt-5"
                    >
                        🔄
                    </button>
                </div>
                <div className="ml-auto text-right">
                    <p className="text-sm text-amber-700 font-medium">Selected Period</p>
                    <p className="text-lg font-bold text-amber-800">{formatMonth(selectedMonth)} - Week {selectedWeek}</p>
                </div>
            </div>

            {/* Weekly Summary Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="text-sm text-gray-500 flex items-center gap-2">👥 Employees</div>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{employees.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100 p-5">
                    <div className="text-sm text-green-600 flex items-center gap-2">💵 Weekly Gross</div>
                    <p className="text-2xl font-bold text-green-700 mt-1">Ksh {totalGross.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl border border-red-100 p-5">
                    <div className="text-sm text-red-600 flex items-center gap-2">📊 Weekly PAYE</div>
                    <p className="text-2xl font-bold text-red-700 mt-1">Ksh {totalPaye.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
                    <div className="text-sm text-blue-600 flex items-center gap-2">💰 Weekly Net</div>
                    <p className="text-2xl font-bold text-blue-700 mt-1">Ksh {totalNet.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-100 p-5">
                    <div className="text-sm text-purple-600">📊 Status</div>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-green-600 font-bold">✅ {paidCount}</span>
                        <span className="text-gray-300">|</span>
                        <span className="text-orange-600 font-bold">⏳ {pendingCount}</span>
                    </div>
                </div>
            </div>

            {/* Month Overview - Weekly Status Cards */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                    📅 {formatMonth(selectedMonth)} - Weekly Overview
                </h3>
                <div className="grid grid-cols-5 gap-3">
                    {weeklyReports.map(report => (
                        <button
                            key={report.week}
                            onClick={() => setSelectedWeek(report.week)}
                            className={`p-4 rounded-xl border-2 transition-all text-left ${selectedWeek === report.week
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-100 hover:border-gray-300'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-gray-800">{report.weekLabel}</span>
                                <span className={`w-3 h-3 rounded-full ${report.status === 'Paid' ? 'bg-green-500'
                                    : report.status === 'Partial' ? 'bg-orange-500'
                                        : report.status === 'Pending' ? 'bg-yellow-500'
                                            : 'bg-gray-300'
                                    }`} />
                            </div>
                            <p className="text-xs text-gray-500">{report.startDate} - {report.endDate}</p>
                            <p className="text-sm font-semibold text-gray-700 mt-1">
                                {report.totalEmployees > 0 ? `${report.paidCount}/${report.totalEmployees} Paid` : 'No entries'}
                            </p>
                            {report.totalNet > 0 && (
                                <p className="text-xs text-green-600 mt-1">Ksh {report.totalNet.toLocaleString()}</p>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Payroll Records Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        📋 Payroll Records - {formatWeekLabel(selectedWeek)}
                    </h3>
                    <button className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
                        ⬇️ Export
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="text-left py-3 px-4 font-semibold text-xs text-gray-600">📋 Code</th>
                                <th className="text-left py-3 px-4 font-semibold text-xs text-gray-600">👤 Employee</th>
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">💵 Gross</th>
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">📊 PAYE</th>
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">🏥 NHIF</th>
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">🏦 NSSF</th>
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">💸 Advances</th>
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">💰 Net</th>
                                <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Status</th>
                                <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={10} className="py-16 text-center text-gray-500">Loading...</td></tr>
                            ) : payroll.length === 0 ? (
                                <tr><td colSpan={10} className="py-16 text-center text-gray-500">No payroll entries for {formatWeekLabel(selectedWeek)}</td></tr>
                            ) : (
                                payroll.map(p => {
                                    const gross = (p.basic_salary || 0) + (p.allowances || 0);
                                    return (
                                        <tr key={p.payroll_id} className="border-t border-gray-50 hover:bg-blue-50/30">
                                            <td className="py-3 px-4 font-mono text-xs text-blue-600">{generatePayrollCode(p.employee_id)}</td>
                                            <td className="py-3 px-4 font-semibold text-gray-800">{p.employee_name}</td>
                                            <td className="py-3 px-4 text-right font-semibold">Ksh {gross.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right text-red-600">Ksh {p.paye?.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right text-orange-600">Ksh {p.nhif?.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right text-purple-600">Ksh {p.nssf?.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right text-amber-600">Ksh {p.advances?.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right font-bold text-green-600">Ksh {p.net_pay?.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 justify-center ${p.status === 'Paid'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                    {p.status === 'Paid' ? '✅' : '⏳'} {p.status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {p.status !== 'Paid' && (
                                                        <button
                                                            onClick={() => markAsPaid(p)}
                                                            className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                                                            title="Mark as Paid"
                                                        >
                                                            💵
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => printPayslip(p)}
                                                        className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                                                        title="Print Payslip"
                                                    >
                                                        🖨️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Generate Weekly Payroll Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                📋 💰 Generate Weekly Payroll
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                        </div>

                        {/* Selected Week Display */}
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mb-4">
                            <p className="text-sm text-amber-700">📅 Generating payroll for:</p>
                            <p className="font-bold text-amber-800">{formatMonth(selectedMonth)} - {formatWeekLabel(selectedWeek)}</p>
                        </div>

                        <div className="space-y-5">
                            {/* Employee */}
                            <div>
                                <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">👤 Employee</label>
                                <select
                                    value={selectedEmployeeId}
                                    onChange={e => handleEmployeeChange(parseInt(e.target.value))}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value={0}>Select Employee</option>
                                    {employees.map(e => (
                                        <option key={e.user_id} value={e.user_id}>
                                            {e.name} (Monthly: Ksh {((e.basic_salary || e.salary_amount || 0)).toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Weekly Earnings Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-green-600 flex items-center gap-1 mb-3">💵 Weekly Earnings</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500">Weekly Basic (Monthly ÷ 4)</label>
                                        <input
                                            type="number"
                                            value={formData.basic_salary}
                                            onChange={e => setFormData({ ...formData, basic_salary: parseFloat(e.target.value) || 0 })}
                                            className="w-full p-3 border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Overtime</label>
                                        <input
                                            type="number"
                                            value={formData.overtime}
                                            onChange={e => setFormData({ ...formData, overtime: parseFloat(e.target.value) || 0 })}
                                            className="w-full p-3 border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Allowances</label>
                                        <input
                                            type="number"
                                            value={formData.allowances}
                                            onChange={e => setFormData({ ...formData, allowances: parseFloat(e.target.value) || 0 })}
                                            className="w-full p-3 border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Bonuses</label>
                                        <input
                                            type="number"
                                            value={formData.bonuses}
                                            onChange={e => setFormData({ ...formData, bonuses: parseFloat(e.target.value) || 0 })}
                                            className="w-full p-3 border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Weekly Gross Display */}
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <span className="font-semibold text-gray-700">Weekly Gross Salary</span>
                                <span className="text-xl font-bold text-green-600">Ksh {calc.gross.toLocaleString()}</span>
                            </div>

                            {/* Statutory Deductions (Weekly) */}
                            <div>
                                <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1 mb-3">📊 Weekly Statutory Deductions</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-3 bg-red-50 rounded-xl">
                                        <p className="text-xs text-gray-500">PAYE</p>
                                        <p className="font-bold text-red-600">Ksh {calc.paye.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center p-3 bg-orange-50 rounded-xl">
                                        <p className="text-xs text-gray-500">NHIF</p>
                                        <p className="font-bold text-orange-600">Ksh {calc.nhif.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center p-3 bg-purple-50 rounded-xl">
                                        <p className="text-xs text-gray-500">NSSF</p>
                                        <p className="font-bold text-purple-600">Ksh {calc.nssf.toLocaleString()}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 text-center">* Calculated as monthly rate ÷ 4.33 weeks</p>
                            </div>

                            {/* Other Deductions */}
                            <div>
                                <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1 mb-3">💸 Other Deductions</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 flex items-center gap-1">💰 Salary Advance (Weekly)</label>
                                        <input
                                            type="number"
                                            value={formData.salary_advance}
                                            readOnly
                                            className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Other Deductions</label>
                                        <input
                                            type="number"
                                            value={formData.other_deductions}
                                            onChange={e => setFormData({ ...formData, other_deductions: parseFloat(e.target.value) || 0 })}
                                            className="w-full p-3 border border-gray-200 rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-red-50 rounded-xl">
                                    <p className="text-sm text-red-600">Total Deductions</p>
                                    <p className="text-xl font-bold text-red-700">Ksh {calc.totalDeductions.toLocaleString()}</p>
                                </div>
                                <div className="p-4 bg-green-50 rounded-xl">
                                    <p className="text-sm text-green-600">Weekly Net Pay</p>
                                    <p className={`text-xl font-bold ${calc.netPay >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {calc.netPay < 0 ? '-' : ''}Ksh {Math.abs(calc.netPay).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !selectedEmployeeId}
                                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                📋 {isSaving ? 'Generating...' : 'Generate Weekly Payroll'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Weekly Reports Modal */}
            {showReports && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                📊 Weekly Payroll Report - {formatMonth(selectedMonth)}
                            </h2>
                            <button onClick={() => setShowReports(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left py-3 px-4 font-semibold text-xs text-gray-600">Week</th>
                                        <th className="text-left py-3 px-4 font-semibold text-xs text-gray-600">Period</th>
                                        <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Employees</th>
                                        <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">Total Gross</th>
                                        <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">Total Net</th>
                                        <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Paid</th>
                                        <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Pending</th>
                                        <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weeklyReports.map(report => (
                                        <tr key={report.week} className="border-t border-gray-100 hover:bg-gray-50">
                                            <td className="py-3 px-4 font-semibold">{report.weekLabel}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600">{report.startDate} - {report.endDate}</td>
                                            <td className="py-3 px-4 text-center">{report.totalEmployees}</td>
                                            <td className="py-3 px-4 text-right font-semibold">Ksh {report.totalGross.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right font-semibold text-green-600">Ksh {report.totalNet.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-center text-green-600 font-semibold">{report.paidCount}</td>
                                            <td className="py-3 px-4 text-center text-orange-600 font-semibold">{report.pendingCount}</td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${report.status === 'Paid' ? 'bg-green-100 text-green-700'
                                                    : report.status === 'Partial' ? 'bg-orange-100 text-orange-700'
                                                        : report.status === 'Pending' ? 'bg-yellow-100 text-yellow-700'
                                                            : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {report.status === 'Paid' ? '✅' : report.status === 'Partial' ? '🔶' : report.status === 'Pending' ? '⏳' : '—'} {report.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-100 font-bold">
                                    <tr>
                                        <td className="py-3 px-4" colSpan={2}>MONTHLY TOTAL</td>
                                        <td className="py-3 px-4 text-center">{weeklyReports.reduce((sum, r) => sum + r.totalEmployees, 0)}</td>
                                        <td className="py-3 px-4 text-right">Ksh {weeklyReports.reduce((sum, r) => sum + r.totalGross, 0).toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-green-600">Ksh {weeklyReports.reduce((sum, r) => sum + r.totalNet, 0).toLocaleString()}</td>
                                        <td className="py-3 px-4 text-center text-green-600">{weeklyReports.reduce((sum, r) => sum + r.paidCount, 0)}</td>
                                        <td className="py-3 px-4 text-center text-orange-600">{weeklyReports.reduce((sum, r) => sum + r.pendingCount, 0)}</td>
                                        <td className="py-3 px-4"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <button
                            onClick={() => setShowReports(false)}
                            className="w-full py-3 mt-6 border border-gray-200 rounded-xl font-medium hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Tax Calculator Modal */}
            {showCalculator && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                🧮 Weekly Tax Calculator
                            </h2>
                            <button onClick={() => setShowCalculator(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600">Weekly Gross Salary (Ksh)</label>
                                <input
                                    type="number"
                                    value={calcGross}
                                    onChange={e => setCalcGross(parseFloat(e.target.value) || 0)}
                                    className="w-full p-3 border rounded-xl"
                                    placeholder="Enter weekly gross salary"
                                />
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                                <div className="flex justify-between"><span>Weekly PAYE:</span><span className="font-bold text-red-600">Ksh {calculateWeeklyPAYE(calcGross).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Weekly NHIF:</span><span className="font-bold text-orange-600">Ksh {calculateWeeklyNHIF(calcGross).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Weekly NSSF:</span><span className="font-bold text-purple-600">Ksh {calculateWeeklyNSSF(calcGross).toLocaleString()}</span></div>
                                <hr />
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Weekly Net Pay:</span>
                                    <span className="text-green-600">
                                        Ksh {(calcGross - calculateWeeklyPAYE(calcGross) - calculateWeeklyNHIF(calcGross) - calculateWeeklyNSSF(calcGross)).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                                💡 Monthly equivalent: Ksh {(calcGross * 4.33).toLocaleString()}
                            </div>
                        </div>
                        <button
                            onClick={() => setShowCalculator(false)}
                            className="w-full py-3 mt-6 border rounded-xl font-medium hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
