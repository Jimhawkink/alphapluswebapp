'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Employee {
    user_id: number;
    full_name: string;
    role: string;
    phone: string;
    basic_salary: number;
    pay_type: string;
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
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7));
    const [formData, setFormData] = useState({ basic_salary: 0, allowances: 0, deductions: 0, advances: 0 });

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

    const loadData = async () => {
        setIsLoading(true);
        const { data: empData } = await supabase.from('users').select('user_id, full_name, role, phone, basic_salary, pay_type');
        setEmployees(empData || []);
        const { data: payData } = await supabase.from('payroll').select('*').eq('pay_period', payPeriod).order('payroll_id', { ascending: false });
        setPayroll(payData || []);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, [payPeriod]);

    const getAdvances = async (empId: number, period: string) => {
        const startDate = `${period}-01`;
        const endDate = new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]), 0).toISOString().split('T')[0];
        const { data } = await supabase.from('salary_advances').select('amount').eq('employee_id', empId).gte('advance_date', startDate).lte('advance_date', endDate).eq('status', 'Approved');
        return (data || []).reduce((sum, a) => sum + (a.amount || 0), 0);
    };

    const openPayModal = async (emp: Employee) => {
        setSelectedEmployee(emp);
        const advances = await getAdvances(emp.user_id, payPeriod);
        setFormData({ basic_salary: emp.basic_salary || 0, allowances: 0, deductions: 0, advances });
        setShowModal(true);
    };

    const calculatePayroll = () => {
        const gross = formData.basic_salary + formData.allowances;
        const paye = calculatePAYE(gross);
        const nhif = calculateNHIF(gross);
        const nssf = calculateNSSF(gross);
        const totalDeductions = formData.deductions + formData.advances + paye + nhif + nssf;
        const netPay = gross - totalDeductions;
        return { gross, paye, nhif, nssf, netPay };
    };

    const handleSave = async () => {
        if (!selectedEmployee) return;
        setIsSaving(true);
        const calc = calculatePayroll();
        const { error } = await supabase.from('payroll').insert({
            employee_id: selectedEmployee.user_id,
            employee_name: selectedEmployee.full_name,
            pay_period: payPeriod,
            basic_salary: formData.basic_salary,
            allowances: formData.allowances,
            deductions: formData.deductions,
            advances: formData.advances,
            paye: calc.paye,
            nhif: calc.nhif,
            nssf: calc.nssf,
            net_pay: calc.netPay,
            status: 'Pending',
            paid_date: null
        });
        if (error) toast.error('Failed'); else { toast.success('Payroll saved!'); setShowModal(false); loadData(); }
        setIsSaving(false);
    };

    const markAsPaid = async (entry: PayrollEntry) => {
        await supabase.from('payroll').update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0] }).eq('payroll_id', entry.payroll_id);
        toast.success('Marked as paid'); loadData();
        printPayslip(entry);
    };

    const printPayslip = (entry: PayrollEntry) => {
        const html = `<html><head><style>body{font-family:monospace;width:80mm;padding:4mm;font-size:11px;}h2{text-align:center;}.row{display:flex;justify-content:space-between;padding:3px 0;}</style></head><body><h2>PAYSLIP</h2><p style="text-align:center;">${entry.pay_period}</p><hr/><div class="row"><span>Employee:</span><span>${entry.employee_name}</span></div><hr/><div class="row"><span>Basic Salary:</span><span>Ksh ${entry.basic_salary?.toLocaleString()}</span></div><div class="row"><span>Allowances:</span><span>Ksh ${entry.allowances?.toLocaleString()}</span></div><div class="row" style="font-weight:bold;"><span>Gross:</span><span>Ksh ${((entry.basic_salary || 0) + (entry.allowances || 0)).toLocaleString()}</span></div><hr/><p style="font-weight:bold;">Deductions:</p><div class="row"><span>PAYE:</span><span>Ksh ${entry.paye?.toLocaleString()}</span></div><div class="row"><span>NHIF:</span><span>Ksh ${entry.nhif?.toLocaleString()}</span></div><div class="row"><span>NSSF:</span><span>Ksh ${entry.nssf?.toLocaleString()}</span></div><div class="row"><span>Advances:</span><span>Ksh ${entry.advances?.toLocaleString()}</span></div><div class="row"><span>Other:</span><span>Ksh ${entry.deductions?.toLocaleString()}</span></div><hr/><div class="row" style="font-size:14px;font-weight:bold;"><span>NET PAY:</span><span>Ksh ${entry.net_pay?.toLocaleString()}</span></div><hr/><p style="text-align:center;font-size:9px;">Paid: ${entry.paid_date || 'N/A'}</p></body></html>`;
        const win = window.open('', '_blank', 'width=350,height=500');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    const calc = calculatePayroll();
    const totalGross = payroll.reduce((sum, p) => sum + (p.basic_salary || 0) + (p.allowances || 0), 0);
    const totalNet = payroll.reduce((sum, p) => sum + (p.net_pay || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl">💰</span>
                    Payroll Management
                </h1>
                <div className="flex gap-3">
                    <input type="month" value={payPeriod} onChange={e => setPayPeriod(e.target.value)} className="px-4 py-2 border rounded-xl" />
                    <button onClick={loadData} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold">🔄 Refresh</button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white"><span className="text-3xl">👥</span><p className="text-sm opacity-80 mt-2">Employees</p><p className="text-3xl font-bold">{employees.length}</p></div>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white"><span className="text-3xl">📋</span><p className="text-sm opacity-80 mt-2">Payroll Entries</p><p className="text-3xl font-bold">{payroll.length}</p></div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white"><span className="text-3xl">💵</span><p className="text-sm opacity-80 mt-2">Total Gross</p><p className="text-2xl font-bold">Ksh {totalGross.toLocaleString()}</p></div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white"><span className="text-3xl">💰</span><p className="text-sm opacity-80 mt-2">Total Net Pay</p><p className="text-2xl font-bold">Ksh {totalNet.toLocaleString()}</p></div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border p-4">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><span>👥</span> Employees</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {employees.map(emp => (
                            <div key={emp.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-emerald-50">
                                <div><p className="font-semibold">{emp.full_name}</p><p className="text-xs text-gray-500">{emp.role} | {emp.pay_type || 'Monthly'}</p></div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-emerald-600">Ksh {(emp.basic_salary || 0).toLocaleString()}</span>
                                    <button onClick={() => openPayModal(emp)} className="px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs">+ Pay</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-2xl border p-4">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><span>📋</span> Payroll - {payPeriod}</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {payroll.length === 0 ? <p className="text-center text-gray-500 py-8">No payroll entries for this period</p> :
                            payroll.map(p => (
                                <div key={p.payroll_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                    <div><p className="font-semibold">{p.employee_name}</p><p className="text-xs text-gray-500">Net: Ksh {p.net_pay?.toLocaleString()}</p></div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${p.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{p.status}</span>
                                        {p.status !== 'Paid' && <button onClick={() => markAsPaid(p)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs">💵 Pay</button>}
                                        {p.status === 'Paid' && <button onClick={() => printPayslip(p)} className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs">🖨️</button>}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            {showModal && selectedEmployee && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">💰 Process Payroll - {selectedEmployee.full_name}</h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm text-gray-600">Basic Salary</label><input type="number" value={formData.basic_salary} onChange={e => setFormData({ ...formData, basic_salary: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                                <div><label className="text-sm text-gray-600">Allowances</label><input type="number" value={formData.allowances} onChange={e => setFormData({ ...formData, allowances: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm text-gray-600">Other Deductions</label><input type="number" value={formData.deductions} onChange={e => setFormData({ ...formData, deductions: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                                <div><label className="text-sm text-gray-600">Salary Advances</label><input type="number" value={formData.advances} readOnly className="w-full p-3 border rounded-xl bg-gray-100" /></div>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl space-y-2">
                                <div className="flex justify-between"><span>Gross:</span><span className="font-bold">Ksh {calc.gross.toLocaleString()}</span></div>
                                <div className="flex justify-between text-sm text-gray-600"><span>PAYE:</span><span>- Ksh {calc.paye.toLocaleString()}</span></div>
                                <div className="flex justify-between text-sm text-gray-600"><span>NHIF:</span><span>- Ksh {calc.nhif.toLocaleString()}</span></div>
                                <div className="flex justify-between text-sm text-gray-600"><span>NSSF:</span><span>- Ksh {calc.nssf.toLocaleString()}</span></div>
                                <hr />
                                <div className="flex justify-between text-lg font-bold text-emerald-600"><span>Net Pay:</span><span>Ksh {calc.netPay.toLocaleString()}</span></div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold">{isSaving ? 'Saving...' : '✅ Save Payroll'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
