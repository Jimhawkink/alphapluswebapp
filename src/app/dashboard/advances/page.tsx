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
    user_code: string;
    name: string;
    user_type: string;
    basic_salary: number;
    salary_amount: number;
}

export default function AdvancesPage() {
    const [advances, setAdvances] = useState<Advance[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeFilter, setActiveFilter] = useState('All');
    const [formData, setFormData] = useState({
        employee_id: 0,
        amount: 0,
        repayment_month: new Date().toISOString().slice(0, 7),
        repayment_week: 1,
        reason: '',
        notes: ''
    });

    // Get weeks in selected month
    const getWeeksInMonth = (month: string) => {
        const [year, monthNum] = month.split('-').map(Number);
        const firstDay = new Date(year, monthNum - 1, 1);
        const lastDay = new Date(year, monthNum, 0);
        const totalDays = lastDay.getDate();
        const firstDayOfWeek = firstDay.getDay();
        return Math.ceil((totalDays + firstDayOfWeek) / 7);
    };

    // Format repayment period for display
    const formatRepaymentPeriod = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        // Check if it has week info (e.g., "2025-12-W1")
        if (dateStr.includes('-W')) {
            const parts = dateStr.split('-W');
            const [year, month] = parts[0].split('-');
            const week = parts[1];
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return `${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} Week ${week}`;
        }
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    };

    const filters = ['All', 'Pending', 'Approved', 'Rejected', 'Repaid'];

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: advData } = await supabase
                .from('salary_advances')
                .select('*')
                .order('advance_id', { ascending: false });
            setAdvances(advData || []);

            const { data: empData } = await supabase
                .from('users')
                .select('user_id, user_code, name, user_type, basic_salary, salary_amount')
                .eq('active', true);
            setEmployees(empData || []);
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const generateAdvanceCode = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const random = Math.floor(1000 + Math.random() * 9000);
        return `ADV-${year}${month}-${random}`;
    };

    const handleSave = async () => {
        if (!formData.employee_id) {
            toast.error('Please select an employee');
            return;
        }
        if (formData.amount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        if (!formData.reason.trim()) {
            toast.error('Please enter a reason');
            return;
        }

        setIsSaving(true);
        const emp = employees.find(e => e.user_id === formData.employee_id);
        const userData = localStorage.getItem('user');
        const user = userData ? JSON.parse(userData) : null;

        const { error } = await supabase.from('salary_advances').insert({
            employee_id: formData.employee_id,
            employee_name: emp?.name || '',
            advance_date: new Date().toISOString().split('T')[0],
            amount: formData.amount,
            reason: formData.reason,
            status: 'Approved',
            approved_by: user?.name || 'Admin',
            repayment_date: `${formData.repayment_month}-W${formData.repayment_week}`
        });

        if (error) {
            toast.error('Failed to save advance');
            console.error(error);
        } else {
            toast.success('✅ Advance request submitted!');
            setShowModal(false);
            setFormData({ employee_id: 0, amount: 0, repayment_month: new Date().toISOString().slice(0, 7), repayment_week: 1, reason: '', notes: '' });
            loadData();
        }
        setIsSaving(false);
    };

    const updateStatus = async (advanceId: number, newStatus: string) => {
        const { error } = await supabase
            .from('salary_advances')
            .update({ status: newStatus })
            .eq('advance_id', advanceId);

        if (error) {
            toast.error('Failed to update status');
        } else {
            toast.success(`Status updated to ${newStatus}`);
            loadData();
        }
    };

    const printAdvanceReceipt = (advance: Advance) => {
        const html = `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;width:80mm;padding:4mm;font-size:12px;}
            h2{text-align:center;margin-bottom:5px;}
            .company{text-align:center;font-size:10px;color:#666;margin-bottom:15px;}
            .divider{border-top:1px dashed #ccc;margin:10px 0;}
            .row{display:flex;justify-content:space-between;padding:4px 0;}
        </style></head><body>
            <h2>💵 SALARY ADVANCE</h2>
            <p class="company">${new Date(advance.advance_date).toLocaleDateString()}</p>
            <div class="divider"></div>
            <div class="row"><span>Employee:</span><span><b>${advance.employee_name}</b></span></div>
            <div class="row"><span>Amount:</span><span style="font-weight:bold;font-size:16px;">Ksh ${advance.amount.toLocaleString()}</span></div>
            <div class="row"><span>Reason:</span><span>${advance.reason}</span></div>
            <div class="row"><span>Repayment:</span><span>${advance.repayment_date || 'N/A'}</span></div>
            <div class="row"><span>Status:</span><span>${advance.status}</span></div>
            <div class="divider"></div>
            <p style="text-align:center;font-size:10px;">Signature: _________________</p>
            <p style="text-align:center;font-size:9px;">This will be deducted from salary</p>
        </body></html>`;
        const win = window.open('', '_blank', 'width=350,height=500');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    const formatMonth = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    };

    const generateRowCode = (advance: Advance) => {
        const date = new Date(advance.advance_date);
        return `ADV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${String(advance.advance_id).padStart(4, '0')}`;
    };

    const getSelectedEmployeeSalary = () => {
        const emp = employees.find(e => e.user_id === formData.employee_id);
        return emp?.basic_salary || emp?.salary_amount || 0;
    };

    // Calculate stats
    const totalRequests = advances.length;
    const pendingAmount = advances.filter(a => a.status === 'Pending').reduce((sum, a) => sum + (a.amount || 0), 0);
    const approvedAmount = advances.filter(a => a.status === 'Approved').reduce((sum, a) => sum + (a.amount || 0), 0);
    const pendingCount = advances.filter(a => a.status === 'Pending').length;
    const approvedCount = advances.filter(a => a.status === 'Approved').length;

    // Filter advances
    const filteredAdvances = activeFilter === 'All'
        ? advances
        : advances.filter(a => a.status === activeFilter);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="text-3xl">📋</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            💸 Salary Advances
                        </h1>
                        <p className="text-sm text-gray-500">Manage employee salary advance requests</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={loadData}
                        className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50"
                    >
                        🔄
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 transition-all flex items-center gap-2"
                    >
                        + New Advance
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="text-sm text-gray-500 flex items-center gap-2">📋 Total Requests</div>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{totalRequests}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100 p-5">
                    <div className="text-sm text-orange-600 flex items-center gap-2">⏳ Pending ({pendingCount})</div>
                    <p className="text-2xl font-bold text-orange-700 mt-1">Ksh {pendingAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100 p-5">
                    <div className="text-sm text-green-600 flex items-center gap-2">✅ Approved ({approvedCount})</div>
                    <p className="text-2xl font-bold text-green-700 mt-1">Ksh {approvedAmount.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
                    <div className="text-sm text-blue-600 flex items-center gap-2">👥 Employees</div>
                    <p className="text-3xl font-bold text-blue-700 mt-1">{employees.length}</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2">
                {filters.map(filter => {
                    const Icon = filter === 'All' ? '🔴' : filter === 'Pending' ? '⏳' : filter === 'Approved' ? '✅' : filter === 'Rejected' ? '❌' : '💰';
                    const isActive = activeFilter === filter;
                    return (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            className={`px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${isActive
                                ? filter === 'All' ? 'bg-red-500 text-white'
                                    : filter === 'Pending' ? 'bg-orange-500 text-white'
                                        : filter === 'Approved' ? 'bg-green-500 text-white'
                                            : filter === 'Rejected' ? 'bg-red-500 text-white'
                                                : 'bg-blue-500 text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            {Icon} {filter}
                        </button>
                    );
                })}
            </div>

            {/* Advances Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        💸 Salary Advance Requests
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
                                <th className="text-right py-3 px-4 font-semibold text-xs text-gray-600">💰 Amount</th>
                                <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">📅 Repayment</th>
                                <th className="text-left py-3 px-4 font-semibold text-xs text-gray-600">📝 Reason</th>
                                <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Status</th>
                                <th className="text-center py-3 px-4 font-semibold text-xs text-gray-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={7} className="py-16 text-center text-gray-500">Loading...</td></tr>
                            ) : filteredAdvances.length === 0 ? (
                                <tr><td colSpan={7} className="py-16 text-center text-gray-500">No advance requests found</td></tr>
                            ) : (
                                filteredAdvances.map(a => {
                                    const emp = employees.find(e => e.user_id === a.employee_id);
                                    const salary = emp?.basic_salary || emp?.salary_amount || 0;
                                    return (
                                        <tr key={a.advance_id} className="border-t border-gray-50 hover:bg-orange-50/30">
                                            <td className="py-3 px-4 font-mono text-xs text-blue-600">{generateRowCode(a)}</td>
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-semibold text-gray-800">{a.employee_name}</p>
                                                    <p className="text-xs text-gray-500">Salary: Ksh {salary.toLocaleString()}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <span className="font-bold text-orange-600">Ksh {a.amount?.toLocaleString()}</span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium">
                                                    {formatRepaymentPeriod(a.repayment_date)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600 max-w-xs truncate">{a.reason}</td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 justify-center ${a.status === 'Approved' ? 'bg-green-100 text-green-700'
                                                    : a.status === 'Pending' ? 'bg-orange-100 text-orange-700'
                                                        : a.status === 'Rejected' ? 'bg-red-100 text-red-700'
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {a.status === 'Approved' ? '✅' : a.status === 'Pending' ? '⏳' : a.status === 'Rejected' ? '❌' : '💰'} {a.status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {a.status === 'Pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => updateStatus(a.advance_id, 'Approved')}
                                                                className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                                                                title="Approve"
                                                            >
                                                                ✅
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus(a.advance_id, 'Rejected')}
                                                                className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                                                                title="Reject"
                                                            >
                                                                ❌
                                                            </button>
                                                        </>
                                                    )}
                                                    {a.status === 'Approved' && (
                                                        <button
                                                            onClick={() => updateStatus(a.advance_id, 'Repaid')}
                                                            className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                                                            title="Mark as Repaid"
                                                        >
                                                            💰
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => printAdvanceReceipt(a)}
                                                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                                                        title="Print"
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

            {/* Request Salary Advance Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                📋 💸 Request Salary Advance
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                        </div>

                        <div className="space-y-5">
                            {/* Employee */}
                            <div>
                                <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">👤 Employee</label>
                                <select
                                    value={formData.employee_id}
                                    onChange={e => setFormData({ ...formData, employee_id: parseInt(e.target.value) })}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value={0}>Select Employee</option>
                                    {employees.map(e => (
                                        <option key={e.user_id} value={e.user_id}>
                                            {e.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">💰 Amount (KES)</label>
                                <input
                                    type="number"
                                    value={formData.amount || ''}
                                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                    placeholder="Enter amount"
                                    className="w-full p-4 border-2 border-orange-200 rounded-xl text-center text-xl font-bold focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                />
                            </div>

                            {/* Repayment Period - Month + Week */}
                            <div>
                                <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">📅 Repayment Period (Week)</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="month"
                                        value={formData.repayment_month}
                                        onChange={e => setFormData({ ...formData, repayment_month: e.target.value, repayment_week: 1 })}
                                        className="p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                                    />
                                    <select
                                        value={formData.repayment_week}
                                        onChange={e => setFormData({ ...formData, repayment_week: parseInt(e.target.value) })}
                                        className="p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                                    >
                                        {Array.from({ length: getWeeksInMonth(formData.repayment_month) }, (_, i) => i + 1).map(week => (
                                            <option key={week} value={week}>Week {week}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Select the specific week when this advance will be deducted from salary</p>
                            </div>

                            {/* Reason */}
                            <div>
                                <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">📝 Reason</label>
                                <textarea
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                    placeholder="Why is this advance needed?"
                                    rows={3}
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 resize-none"
                                />
                            </div>

                            {/* Notes (Optional) */}
                            <div>
                                <label className="text-sm text-gray-600 flex items-center gap-1 mb-1">📋 Notes (Optional)</label>
                                <input
                                    type="text"
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Additional notes"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                                />
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
                                disabled={isSaving || !formData.employee_id || formData.amount <= 0}
                                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                📋 {isSaving ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
