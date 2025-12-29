'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Advance {
    advance_id: number;
    employee_id: number;
    employee_name: string;
    advance_date: string;
    amount: number;
    reason: string;
    status: string;
    approved_by: string;
    repayment_date: string;
}

interface Employee {
    user_id: number;
    full_name: string;
    role: string;
}

export default function AdvancesPage() {
    const [advances, setAdvances] = useState<Advance[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({ employee_id: 0, amount: 0, reason: '' });

    const loadData = async () => {
        setIsLoading(true);
        const { data: advData } = await supabase.from('salary_advances').select('*').order('advance_id', { ascending: false });
        setAdvances(advData || []);
        const { data: empData } = await supabase.from('users').select('user_id, full_name, role');
        setEmployees(empData || []);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async () => {
        if (!formData.employee_id || formData.amount <= 0) { toast.error('Select employee and enter amount'); return; }
        setIsSaving(true);
        const emp = employees.find(e => e.user_id === formData.employee_id);
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;

        const { error } = await supabase.from('salary_advances').insert({
            employee_id: formData.employee_id,
            employee_name: emp?.full_name || '',
            advance_date: new Date().toISOString().split('T')[0],
            amount: formData.amount,
            reason: formData.reason,
            status: 'Approved',
            approved_by: user?.name || 'Admin'
        });

        if (error) toast.error('Failed'); else {
            toast.success('Advance recorded!');
            setShowModal(false);
            loadData();
            printAdvanceReceipt(emp?.full_name || '', formData.amount, formData.reason);
        }
        setIsSaving(false);
    };

    const printAdvanceReceipt = (name: string, amount: number, reason: string) => {
        const html = `<html><head><style>body{font-family:monospace;width:80mm;padding:4mm;font-size:12px;}h2{text-align:center;}.row{display:flex;justify-content:space-between;padding:4px 0;}</style></head><body><h2>SALARY ADVANCE</h2><p style="text-align:center;">${new Date().toLocaleDateString()}</p><hr/><div class="row"><span>Employee:</span><span>${name}</span></div><div class="row"><span>Amount:</span><span style="font-weight:bold;font-size:16px;">Ksh ${amount.toLocaleString()}</span></div><div class="row"><span>Reason:</span><span>${reason}</span></div><hr/><p style="text-align:center;font-size:10px;">Signature: _________________</p><p style="text-align:center;font-size:9px;">This will be deducted from salary</p></body></html>`;
        const win = window.open('', '_blank', 'width=350,height=400');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    const totalAdvances = advances.reduce((sum, a) => sum + (a.amount || 0), 0);
    const pendingCount = advances.filter(a => a.status === 'Pending').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center text-white text-2xl">💵</span>
                    Salary Advances
                </h1>
                <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold">➕ New Advance</button>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white"><span className="text-3xl">💵</span><p className="text-sm opacity-80 mt-2">Total Advances</p><p className="text-3xl font-bold">{advances.length}</p></div>
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white"><span className="text-3xl">💰</span><p className="text-sm opacity-80 mt-2">Total Amount</p><p className="text-2xl font-bold">Ksh {totalAdvances.toLocaleString()}</p></div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white"><span className="text-3xl">✅</span><p className="text-sm opacity-80 mt-2">Approved</p><p className="text-3xl font-bold">{advances.filter(a => a.status === 'Approved').length}</p></div>
                <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-5 text-white"><span className="text-3xl">⏳</span><p className="text-sm opacity-80 mt-2">Pending</p><p className="text-3xl font-bold">{pendingCount}</p></div>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-amber-50 to-orange-50">
                        <tr>
                            <th className="text-left py-4 px-4 font-bold text-xs">Date</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Employee</th>
                            <th className="text-right py-4 px-4 font-bold text-xs">Amount</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Reason</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Status</th>
                            <th className="text-left py-4 px-4 font-bold text-xs">Approved By</th>
                            <th className="text-center py-4 px-4 font-bold text-xs">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? <tr><td colSpan={7} className="py-16 text-center">Loading...</td></tr> :
                            advances.length === 0 ? <tr><td colSpan={7} className="py-16 text-center text-gray-500">No advances recorded</td></tr> :
                                advances.map(a => (
                                    <tr key={a.advance_id} className="border-t hover:bg-amber-50/30">
                                        <td className="py-3 px-4">{new Date(a.advance_date).toLocaleDateString()}</td>
                                        <td className="py-3 px-4 font-semibold">{a.employee_name}</td>
                                        <td className="py-3 px-4 text-right font-bold text-amber-600">Ksh {a.amount?.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-sm text-gray-600">{a.reason}</td>
                                        <td className="py-3 px-4 text-center"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${a.status === 'Approved' ? 'bg-green-100 text-green-700' : a.status === 'Pending' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{a.status}</span></td>
                                        <td className="py-3 px-4 text-sm">{a.approved_by}</td>
                                        <td className="py-3 px-4 text-center">
                                            <button onClick={() => printAdvanceReceipt(a.employee_name, a.amount, a.reason)} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200">🖨️</button>
                                        </td>
                                    </tr>
                                ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">💵 New Salary Advance</h2>
                        <div className="space-y-4">
                            <div><label className="text-sm text-gray-600">Employee *</label>
                                <select value={formData.employee_id} onChange={e => setFormData({ ...formData, employee_id: parseInt(e.target.value) })} className="w-full p-3 border rounded-xl">
                                    <option value={0}>Select Employee</option>
                                    {employees.map(e => <option key={e.user_id} value={e.user_id}>{e.full_name} ({e.role})</option>)}
                                </select>
                            </div>
                            <div><label className="text-sm text-gray-600">Amount (Ksh) *</label><input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} className="w-full p-3 border rounded-xl" /></div>
                            <div><label className="text-sm text-gray-600">Reason</label>
                                <select value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} className="w-full p-3 border rounded-xl">
                                    <option>Personal Emergency</option>
                                    <option>Medical</option>
                                    <option>Education</option>
                                    <option>Transport</option>
                                    <option>Unpaid Bill Deduction</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div className="p-4 bg-amber-50 rounded-xl text-amber-700 text-sm">
                                ⚠️ This advance will be automatically deducted from the employee's next salary.
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 border rounded-xl">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold">{isSaving ? 'Saving...' : '✅ Record & Print'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
