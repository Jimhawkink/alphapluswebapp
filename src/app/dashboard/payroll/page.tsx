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

export default function PayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7));
    const [formData, setFormData] = useState({
        basic_salary: 0,
        overtime: 0,
        allowances: 0,
        bonuses: 0,
        salary_advance: 0,
        other_deductions: 0
    });
    const [calcGross, setCalcGross] = useState(0);

    // Kenya Tax Brackets (2024)
    const calculatePAYE = (gross: number) => {
        if (gross <= 24000) return gross * 0.1;
        if (gross <= 32333) return 2400 + (gross - 24000) * 0.25;
        if (gross <= 500000) return 4483.25 + (gross - 32333) * 0.3;
        if (gross <= 800000) return 144783.25 + (gross - 500000) * 0.325;
        return 242283.25 + (gross - 800000) * 0.35;
    };

    const calculateNHIF = (gross: number) => {
        if (gross <= 5999) return 150;
        if (gross <= 7999) return 300;
        if (gross <= 11999) return 400;
        if (gross <= 14999) return 500;
        if (gross <= 19999) return 600;
        if (gross <= 24999) return 750;
        if (gross <= 29999) return 850;
        if (gross <= 34999) return 900;
        if (gross <= 39999) return 950;
        if (gross <= 44999) return 1000;
        if (gross <= 49999) return 1100;
        if (gross <= 59999) return 1200;
        if (gross <= 69999) return 1300;
        if (gross <= 79999) return 1400;
        if (gross <= 89999) return 1500;
        if (gross <= 99999) return 1600;
        return 1700;
    };

    const calculateNSSF = (gross: number) => Math.min(gross * 0.06, 2160);
    const calculateHousing = () => 0; // Housing Levy

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: empData } = await supabase
                .from('users')
                .select('user_id, user_code, name, user_type, phone, basic_salary, pay_type, salary_amount')
                .eq('active', true);
            setEmployees(empData || []);

            const { data: payData } = await supabase
                .from('payroll')
                .select('*')
                .eq('pay_period', payPeriod)
                .order('payroll_id', { ascending: false });
            setPayroll(payData || []);
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, [payPeriod]);

    const getAdvances = async (empId: number, period: string) => {
        const startDate = `${period}-01`;
        const year = parseInt(period.split('-')[0]);
        const month = parseInt(period.split('-')[1]);
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const { data } = await supabase
            .from('salary_advances')
            .select('amount')
            .eq('employee_id', empId)
            .gte('advance_date', startDate)
            .lte('advance_date', endDate)
            .eq('status', 'Approved');
        return (data || []).reduce((sum, a) => sum + (a.amount || 0), 0);
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
            const advances = await getAdvances(empId, payPeriod);
            setFormData({
                ...formData,
                basic_salary: emp.basic_salary || emp.salary_amount || 0,
                salary_advance: advances
            });
        }
    };

    const calculatePayroll = () => {
        const gross = formData.basic_salary + formData.overtime + formData.allowances + formData.bonuses;
        const paye = calculatePAYE(gross);
        const nhif = calculateNHIF(gross);
        const nssf = calculateNSSF(gross);
        const housing = calculateHousing();
        const totalDeductions = paye + nhif + nssf + housing + formData.salary_advance + formData.other_deductions;
        const netPay = gross - totalDeductions;
        return { gross, paye, nhif, nssf, housing, totalDeductions, netPay };
    };

    const handleSave = async () => {
        if (!selectedEmployeeId) {
            toast.error('Please select an employee');
            return;
        }
        setIsSaving(true);
        const calc = calculatePayroll();
        const emp = employees.find(e => e.user_id === selectedEmployeeId);

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
            toast.success('Payroll generated successfully!');
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
        const html = `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;width:80mm;padding:4mm;font-size:11px;}
            h2{text-align:center;margin-bottom:5px;}
            .company{text-align:center;font-size:10px;color:#666;margin-bottom:15px;}
            .divider{border-top:1px dashed #ccc;margin:10px 0;}
            .row{display:flex;justify-content:space-between;padding:3px 0;}
            .section{font-weight:bold;background:#f5f5f5;padding:5px;margin:10px 0 5px 0;}
            .total{font-size:14px;font-weight:bold;background:#e8f5e9;padding:8px;margin-top:15px;}
        </style></head><body>
            <h2>📋 PAYSLIP</h2>
            <p class="company">Period: ${entry.pay_period}</p>
            <div class="divider"></div>
            <div class="row"><span>Employee:</span><span><b>${entry.employee_name}</b></span></div>
            <div class="divider"></div>
            <div class="section">💰 EARNINGS</div>
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
        return `PAY-${payPeriod.replace('-', '')}-${String(empId).padStart(4, '0')}`;
    };

    const formatMonth = (period: string) => {
        const [year, month] = period.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const calc = calculatePayroll();
    const totalGross = payroll.reduce((sum, p) => sum + (p.basic_salary || 0) + (p.allowances || 0), 0);
    const totalPaye = payroll.reduce((sum, p) => sum + (p.paye || 0), 0);
    const totalNet = payroll.reduce((sum, p) => sum + (p.net_pay || 0), 0);
    const paidCount = payroll.filter(p => p.status === 'Paid').length;
    const pendingCount = payroll.filter(p => p.status === 'Pending').length;

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
                            💰 Payroll Management
                        </h1>
                        <p className="text-sm text-gray-500">Kenya PAYE/NHIF/NSSF compliant payroll system</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
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
                        + Generate Payroll
                    </button>
                </div>
            </div>

            {/* Pay Period Selector */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">📅 Pay Period</span>
                    <input
                        type="month"
                        value={payPeriod}
                        onChange={e => setPayPeriod(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <button
                    onClick={loadData}
                    className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50"
                >
                    🔄
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="text-sm text-gray-500 flex items-center gap-2">👥 Employees</div>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{employees.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100 p-5">
                    <div className="text-sm text-green-600 flex items-center gap-2">💵 Gross Total</div>
                    <p className="text-2xl font-bold text-green-700 mt-1">Ksh {totalGross.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl border border-red-100 p-5">
                    <div className="text-sm text-red-600 flex items-center gap-2">📊 PAYE Total</div>
                    <p className="text-2xl font-bold text-red-700 mt-1">Ksh {totalPaye.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
                    <div className="text-sm text-blue-600 flex items-center gap-2">💰 Net Total</div>
                    <p className="text-2xl font-bold text-blue-700 mt-1">Ksh {totalNet.toLocaleString()}</p>
                </div>
            </div>

            {/* Status Summary */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-100 p-5">
                <div className="text-sm text-purple-600">📊 Status</div>
                <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-2 text-green-600 font-semibold">
                        ✅ {paidCount} Paid
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center gap-2 text-orange-600 font-semibold">
                        ⏳ {pendingCount} Pending
                    </span>
                </div>
            </div>

            {/* Payroll Records Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        📋 Payroll Records - {payPeriod}
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
                                <tr><td colSpan={10} className="py-16 text-center text-gray-500">No payroll entries for {formatMonth(payPeriod)}</td></tr>
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

            {/* Generate Payroll Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                📋 💰 Generate Payroll
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                        </div>

                        <div className="space-y-5">
                            {/* Employee & Pay Period */}
                            <div className="grid grid-cols-2 gap-4">
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
                                                {e.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">📅 Pay Period</label>
                                    <input
                                        type="month"
                                        value={payPeriod}
                                        onChange={e => setPayPeriod(e.target.value)}
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Earnings Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-green-600 flex items-center gap-1 mb-3">💵 Earnings</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500">Basic Salary</label>
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

                            {/* Gross Salary Display */}
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <span className="font-semibold text-gray-700">Gross Salary</span>
                                <span className="text-xl font-bold text-green-600">Ksh {calc.gross.toLocaleString()}</span>
                            </div>

                            {/* Statutory Deductions */}
                            <div>
                                <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1 mb-3">📊 Statutory Deductions (Auto-Calculated)</h3>
                                <div className="grid grid-cols-4 gap-3">
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
                                    <div className="text-center p-3 bg-blue-50 rounded-xl">
                                        <p className="text-xs text-gray-500">Housing</p>
                                        <p className="font-bold text-blue-600">Ksh {calc.housing.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Other Deductions */}
                            <div>
                                <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1 mb-3">💸 Other Deductions</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 flex items-center gap-1">💰 Salary Advance</label>
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
                                    <p className="text-sm text-green-600">Net Salary</p>
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
                                📋 {isSaving ? 'Generating...' : 'Generate Payroll'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tax Calculator Modal */}
            {showCalculator && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                🧮 Tax Calculator
                            </h2>
                            <button onClick={() => setShowCalculator(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600">Gross Salary (Ksh)</label>
                                <input
                                    type="number"
                                    value={calcGross}
                                    onChange={e => setCalcGross(parseFloat(e.target.value) || 0)}
                                    className="w-full p-3 border rounded-xl"
                                    placeholder="Enter gross salary"
                                />
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                                <div className="flex justify-between"><span>PAYE:</span><span className="font-bold text-red-600">Ksh {calculatePAYE(calcGross).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>NHIF:</span><span className="font-bold text-orange-600">Ksh {calculateNHIF(calcGross).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>NSSF:</span><span className="font-bold text-purple-600">Ksh {calculateNSSF(calcGross).toLocaleString()}</span></div>
                                <hr />
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Net Pay:</span>
                                    <span className="text-green-600">
                                        Ksh {(calcGross - calculatePAYE(calcGross) - calculateNHIF(calcGross) - calculateNSSF(calcGross)).toLocaleString()}
                                    </span>
                                </div>
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
