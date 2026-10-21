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

// ── Glassmorphic stat card — uses inline style to avoid Tailwind purge ────
function GlassCard({ icon, label, value, sub, bg, glow }: {
    icon: string; label: string; value: string; sub?: string;
    bg: string; glow: string;
}) {
    return (
        <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-2xl"
            style={{ background: bg, boxShadow: `0 8px 32px ${glow}` }}>
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none" style={{ background: 'rgba(255,255,255,0.10)', filter: 'blur(24px)' }} />
            <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full pointer-events-none" style={{ background: 'rgba(255,255,255,0.10)', filter: 'blur(16px)' }} />
            <div className="relative z-10">
                <div className="text-3xl mb-2">{icon}</div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ opacity: 0.75 }}>{label}</p>
                <p className="text-2xl font-black mt-1 leading-tight">{value}</p>
                {sub && <p className="text-xs mt-1" style={{ opacity: 0.7 }}>{sub}</p>}
            </div>
        </div>
    );
}

// ── Metric mini card ───────────────────────────────────────────────────────
function MetricCard({ label, value, bg, textColor }: { label: string; value: string; bg: string; textColor: string }) {
    return (
        <div className="rounded-2xl p-4 border border-white/10" style={{ background: bg }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
            <p className={`text-xl font-black mt-1 ${textColor}`}>{value}</p>
        </div>
    );
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
    const [liveTime, setLiveTime] = useState(new Date());
    const [shiftDuration, setShiftDuration] = useState('');

    // Live clock
    useEffect(() => {
        const t = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Live shift duration
    useEffect(() => {
        if (!currentShift) { setShiftDuration(''); return; }
        const calc = () => {
            const start = new Date(`${currentShift.shift_date}T${currentShift.start_time || '00:00:00'}`);
            const diff = Math.floor((Date.now() - start.getTime()) / 1000);
            const h = Math.floor(diff / 3600);
            const m = Math.floor((diff % 3600) / 60);
            const s = diff % 60;
            setShiftDuration(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
        };
        calc();
        const t = setInterval(calc, 1000);
        return () => clearInterval(t);
    }, [currentShift]);

    const loadShifts = useCallback(async () => {
        setIsLoading(true);
        const { data: openShift } = await supabase.from('shifts').select('*').eq('status', 'Open').single();
        setCurrentShift(openShift);
        const { data } = await supabase.from('shifts').select('*').order('shift_id', { ascending: false }).limit(50);
        setShifts(data || []);

        if (openShift) {
            const shiftStartDateTime = new Date(`${openShift.shift_date}T${openShift.start_time || '00:00:00'}`).toISOString();
            const { data: salesData } = await supabase.from('sales').select('total_amount').eq('shift_id', openShift.shift_id);
            const { data: expData } = await supabase.from('expenses').select('amount').gte('created_at', shiftStartDateTime);
            const { data: vchData } = await supabase.from('vouchers').select('amount').gte('created_at', shiftStartDateTime);
            const { data: advData } = await supabase.from('salary_advances').select('amount').eq('status', 'Approved').gte('created_at', shiftStartDateTime);
            setShiftStats({
                sales: (salesData || []).reduce((s, r) => s + (r.total_amount || 0), 0),
                expenses: (expData || []).reduce((s, r) => s + (r.amount || 0), 0),
                vouchers: (vchData || []).reduce((s, r) => s + (r.amount || 0), 0),
                advances: (advData || []).reduce((s, r) => s + (r.amount || 0), 0),
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
        else { toast.success('🟢 Shift started!'); setShowStartModal(false); loadShifts(); printDropAmount(openingCash); }
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
        else { toast.success('🔒 Shift closed & report printed!'); setShowEndModal(false); loadShifts(); printShiftReport(currentShift, shiftStats, closingCash, netSales); }
    };

    const printDropAmount = (amount: number) => {
        const html = `<html><head><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Helvetica Neue',Arial,sans-serif;width:76mm;padding:4mm 3mm;font-size:10.5px;}h2{font-size:13px;font-weight:700;text-align:center;letter-spacing:.5px;margin-bottom:4px;}.dsh{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;padding:1.5px 0;}.amt{font-size:20px;font-weight:800;text-align:center;margin:6px 0;}.ft{font-size:9px;text-align:center;color:#555;margin-top:5px;}</style></head><body>
<h2>DROP AMOUNT SLIP</h2>
<div class="dsh"></div>
<div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()}</span></div>
<div class="row"><span>Time:</span><span>${new Date().toLocaleTimeString()}</span></div>
<div class="dsh"></div>
<div class="amt">Ksh ${amount.toLocaleString()}</div>
<div class="dsh"></div>
<div class="ft">Shift Opening Cash — AlphaPlus POS</div>
</body></html>`;
        const win = window.open('', '_blank', 'width=350,height=400');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    };

    const printShiftReport = async (shift: Shift, stats: { sales: number; expenses: number; vouchers: number; advances: number }, closing: number, net: number) => {
        let companyName = 'Your Business Name', companyPhone = '', companyAddress = '';
        try {
            const { data: sd } = await supabase.from('organisation_settings').select('setting_key, setting_value');
            if (sd && sd.length > 0) {
                const m: { [k: string]: string } = {};
                sd.forEach((i: { setting_key: string; setting_value: string }) => { m[i.setting_key] = i.setting_value; });
                companyName = m['company_name'] || 'Your Business Name';
                companyPhone = m['phone'] || '';
                companyAddress = m['address'] ? (m['city'] ? `${m['address']}, ${m['city']}` : m['address']) : '';
            }
        } catch { /* ignore */ }

        interface SaleRecord { sale_id: number; total_amount: number; payment_method: string; status: string; waiter_name: string | null; created_by: string | null; }
        let salesData: SaleRecord[] = [];
        let cashSales = 0, mpesaSales = 0, cardSales = 0, creditSales = 0, totalTransactions = 0;
        const userSalesMap: { [k: string]: number } = {};
        const shiftStartDateTime = new Date(`${shift.shift_date}T${shift.start_time || '00:00:00'}`).toISOString();

        try {
            let { data } = await supabase.from('sales').select('sale_id, total_amount, payment_method, status, waiter_name, created_by').eq('shift_id', shift.shift_id);
            if (!data || data.length === 0) {
                const r = await supabase.from('sales').select('sale_id, total_amount, payment_method, status, waiter_name, created_by').eq('sale_date', shift.shift_date).gte('created_at', shiftStartDateTime);
                data = r.data;
            }
            if (data) {
                salesData = data; totalTransactions = data.length;
                data.forEach(s => {
                    const method = (s.payment_method || '').toUpperCase();
                    const amount = s.total_amount || 0;
                    if (method.includes('CASH')) cashSales += amount;
                    else if (method.includes('MPESA') || method.includes('M-PESA')) mpesaSales += amount;
                    else if (method.includes('CARD')) cardSales += amount;
                    else if (method.includes('CREDIT') || s.status === 'Pending') creditSales += amount;
                    else cashSales += amount;
                    const u = s.waiter_name || s.created_by || 'Walk-in';
                    userSalesMap[u] = (userSalesMap[u] || 0) + amount;
                });
            }
        } catch { /* ignore */ }

        interface CategorySales { category: string; amount: number; qty: number }
        interface ItemSales { name: string; qty: number; amount: number }
        const catMap: { [k: string]: CategorySales } = {};
        const itemMap: { [k: string]: ItemSales } = {};

        try {
            const saleIds = salesData.map(s => s.sale_id);
            if (saleIds.length > 0) {
                const { data: itemsData } = await supabase.from('sales_items').select('product_name, quantity, subtotal, product_id').in('sale_id', saleIds);
                if (itemsData) {
                    const pids = Array.from(new Set(itemsData.map(i => i.product_id).filter(Boolean)));
                    let pCat: { [k: number]: string } = {};
                    if (pids.length > 0) {
                        const { data: prods } = await supabase.from('products').select('pid, category').in('pid', pids);
                        if (prods) prods.forEach(p => { pCat[p.pid] = p.category || 'Other'; });
                    }
                    itemsData.forEach(item => {
                        const cat = pCat[item.product_id] || 'Other';
                        const name = item.product_name || 'Unknown';
                        const qty = item.quantity || 0;
                        const amount = item.subtotal || 0;
                        if (!catMap[cat]) catMap[cat] = { category: cat, amount: 0, qty: 0 };
                        catMap[cat].amount += amount; catMap[cat].qty += qty;
                        if (!itemMap[name]) itemMap[name] = { name, qty: 0, amount: 0 };
                        itemMap[name].qty += qty; itemMap[name].amount += amount;
                    });
                }
            }
        } catch { /* ignore */ }

        interface ExpenseItem { name: string; amount: number }
        interface AdvanceItem { employee: string; amount: number }
        interface VoucherItem { payee: string; amount: number }
        let expensesList: ExpenseItem[] = [], advancesList: AdvanceItem[] = [], vouchersList: VoucherItem[] = [], totalAdvances = 0;

        try {
            const { data: expD } = await supabase.from('expenses').select('expense_name, amount').gte('created_at', shiftStartDateTime);
            if (expD) expensesList = expD.map(e => ({ name: e.expense_name || 'Expense', amount: e.amount || 0 }));
        } catch { /* ignore */ }
        try {
            const { data: advD } = await supabase.from('salary_advances').select('employee_name, amount').eq('status', 'Approved').gte('created_at', shiftStartDateTime);
            if (advD) { advancesList = advD.map(a => ({ employee: a.employee_name || 'Employee', amount: a.amount || 0 })); totalAdvances = advD.reduce((s, a) => s + (a.amount || 0), 0); }
        } catch { /* ignore */ }
        try {
            const { data: vchD } = await supabase.from('vouchers').select('payee_name, amount').gte('created_at', shiftStartDateTime);
            if (vchD) vouchersList = vchD.map(v => ({ payee: v.payee_name || 'Payee', amount: v.amount || 0 }));
        } catch { /* ignore */ }

        const categoryList = Object.values(catMap).sort((a, b) => b.amount - a.amount);
        const itemList = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
        const userSalesList = Object.entries(userSalesMap).sort((a, b) => b[1] - a[1]);
        const shiftType = shift.shift_type === 'Morning' ? 'DAY SHIFT' : 'NIGHT SHIFT';
        const expectedCash = (shift.opening_cash || 0) + cashSales - stats.expenses - stats.vouchers - totalAdvances;
        const variance = closing - expectedCash;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page{margin:0;size:80mm auto;}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;width:76mm;padding:3mm 2.5mm;font-size:10px;line-height:1.4;background:#fff;color:#000;}
.center{text-align:center;}.bold{font-weight:700;}.right{text-align:right;}
.co-name{font-size:14px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;}
.co-info{font-size:9px;color:#333;}
.dsh{border-top:1px dashed #000;margin:5px 0;}
.ddsh{border-top:2px dashed #000;margin:6px 0;}
.row{display:flex;justify-content:space-between;padding:1.5px 0;font-size:10px;}
.sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:center;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:2px 0;margin:5px 0;}
.big{font-size:18px;font-weight:800;text-align:center;padding:4px 0;}
.grn{color:#006600;}.red{color:#990000;}.org{color:#884400;}.gry{color:#444;}
.item{font-size:9px;padding:1px 0;}
.sig{border-top:1px solid #000;margin-top:14px;padding-top:3px;font-size:9px;}
.var-ok{background:#e6ffe6;padding:3px;text-align:center;font-weight:700;font-size:10px;}
.var-bad{background:#ffe6e6;padding:3px;text-align:center;font-weight:700;font-size:10px;}
</style></head><body>
<div class="center">
  <div class="co-name">${companyName.toUpperCase()}</div>
  ${companyAddress ? `<div class="co-info">${companyAddress}</div>` : ''}
  ${companyPhone ? `<div class="co-info">Tel: ${companyPhone}</div>` : ''}
</div>
<div class="ddsh"></div>
<div class="center bold" style="font-size:12px;letter-spacing:1px;">${shiftType} REPORT</div>
<div class="ddsh"></div>

<div class="row"><span>Date:</span><span>${new Date(shift.shift_date).toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</span></div>
<div class="row"><span>Opened:</span><span>${shift.start_time}</span></div>
<div class="row"><span>Closed:</span><span>${new Date().toLocaleTimeString()}</span></div>
<div class="row"><span>Opened by:</span><span>${shift.opened_by}</span></div>
<div class="row"><span>Closed by:</span><span>${shift.closed_by || 'Admin'}</span></div>
<div class="row"><span>Transactions:</span><span class="bold">${totalTransactions}</span></div>

<div class="sec">💰 Cash Summary</div>
<div class="row"><span>Opening Cash:</span><span>Ksh ${(shift.opening_cash||0).toLocaleString()}</span></div>
<div class="row bold"><span>Total Sales:</span><span class="grn">Ksh ${stats.sales.toLocaleString()}</span></div>
<div class="row red"><span>Less Expenses:</span><span>– Ksh ${stats.expenses.toLocaleString()}</span></div>
<div class="row red"><span>Less Vouchers:</span><span>– Ksh ${stats.vouchers.toLocaleString()}</span></div>
<div class="row org"><span>Less Advances:</span><span>– Ksh ${totalAdvances.toLocaleString()}</span></div>
<div class="dsh"></div>
<div class="big grn">Ksh ${net.toLocaleString()}</div>
<div class="center gry" style="font-size:9px;margin-bottom:3px;">NET SALES</div>

<div class="sec">💳 Payment Breakdown</div>
<div class="row"><span>Cash:</span><span class="grn bold">Ksh ${cashSales.toLocaleString()}</span></div>
<div class="row"><span>M-Pesa:</span><span class="grn bold">Ksh ${mpesaSales.toLocaleString()}</span></div>
<div class="row"><span>Card:</span><span>Ksh ${cardSales.toLocaleString()}</span></div>
<div class="row"><span>Credit (Unpaid):</span><span class="org">Ksh ${creditSales.toLocaleString()}</span></div>

${userSalesList.length > 0 ? `
<div class="sec">👤 Sales by Staff</div>
${userSalesList.map(([n, a]) => `<div class="row item"><span>${n}</span><span>Ksh ${a.toLocaleString()}</span></div>`).join('')}
` : ''}

${categoryList.length > 0 ? `
<div class="sec">📊 Sales by Category</div>
${categoryList.map(c => `<div class="row item"><span>${c.category}</span><span>${stats.sales > 0 ? ((c.amount/stats.sales)*100).toFixed(0) : 0}%</span><span>Ksh ${c.amount.toLocaleString()}</span></div>`).join('')}
` : ''}

${itemList.length > 0 ? `
<div class="sec">🍽️ Top Items</div>
${itemList.slice(0,15).map(i => `<div class="row item"><span>${i.name.substring(0,22)}</span><span>×${i.qty}</span><span>Ksh ${i.amount.toLocaleString()}</span></div>`).join('')}
${itemList.length > 15 ? `<div class="item center gry">+${itemList.length-15} more items</div>` : ''}
` : ''}

${expensesList.length > 0 ? `
<div class="sec">📤 Expenses</div>
${expensesList.map(e => `<div class="row item"><span>${e.name.substring(0,24)}</span><span class="red">– Ksh ${e.amount.toLocaleString()}</span></div>`).join('')}
<div class="row bold red"><span>Total Expenses:</span><span>– Ksh ${stats.expenses.toLocaleString()}</span></div>
` : ''}

${advancesList.length > 0 ? `
<div class="sec">💵 Salary Advances</div>
${advancesList.map(a => `<div class="row item"><span>${a.employee}</span><span class="org">– Ksh ${a.amount.toLocaleString()}</span></div>`).join('')}
` : ''}

${vouchersList.length > 0 ? `
<div class="sec">🎫 Vouchers</div>
${vouchersList.map(v => `<div class="row item"><span>${v.payee}</span><span class="red">– Ksh ${v.amount.toLocaleString()}</span></div>`).join('')}
` : ''}

<div class="sec">💵 Cash Reconciliation</div>
<div class="row"><span>Expected in Till:</span><span>Ksh ${expectedCash.toLocaleString()}</span></div>
<div class="row"><span>Actual Count:</span><span>Ksh ${closing.toLocaleString()}</span></div>
<div class="dsh"></div>
<div class="${variance >= 0 ? 'var-ok' : 'var-bad'}">${variance >= 0 ? '✅ OVERAGE' : '⚠️ SHORTAGE'}: ${variance >= 0 ? '+' : ''}Ksh ${variance.toLocaleString()}</div>

<div class="ddsh"></div>
<div class="sig center">Cashier Signature _______________</div>
<div style="margin-top:14px;" class="sig center">Manager Signature _______________</div>
<div class="ddsh"></div>
<div class="center gry" style="font-size:9px;">Printed: ${new Date().toLocaleString()}<br/>AlphaPlus POS · Enterprise Hotel Systems</div>
</body></html>`;

        const win = window.open('', '_blank', 'width=350,height=800');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
    };

    // ── Summary computations ────────────────────────────────────────────────
    const totalRevenue = shifts.reduce((s, r) => s + (r.net_sales || 0), 0);
    const totalSalesAll = shifts.reduce((s, r) => s + (r.total_sales || 0), 0);
    const avgPerShift = shifts.length > 0 ? Math.round(totalSalesAll / shifts.length) : 0;
    const openCount = shifts.filter(s => s.status === 'Open').length;
    const closedCount = shifts.filter(s => s.status === 'Closed').length;
    const netLive = shiftStats.sales - shiftStats.expenses - shiftStats.vouchers - shiftStats.advances;
    const expectedCashLive = (currentShift?.opening_cash || 0) + shiftStats.sales - shiftStats.expenses - shiftStats.vouchers - shiftStats.advances;

    return (
        <div className="space-y-6">
            {/* ── Page Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-3xl flex items-center justify-center text-3xl shadow-lg"
                        style={{ background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>
                        ⏰
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Shift Management</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {liveTime.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                            &nbsp;·&nbsp;
                            <span className="font-mono font-bold text-purple-600">{liveTime.toLocaleTimeString()}</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadShifts}
                        className="px-4 py-2.5 rounded-xl border-2 border-gray-200 font-semibold text-sm hover:bg-gray-50 transition-all flex items-center gap-2">
                        🔄 Refresh
                    </button>
                    {!currentShift ? (
                        <button onClick={() => setShowStartModal(true)}
                            className="px-6 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                            style={{ background: 'linear-gradient(135deg,#11998e,#38ef7d)' }}>
                            ▶ Start Shift
                        </button>
                    ) : (
                        <button onClick={() => setShowEndModal(true)}
                            className="px-6 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                            style={{ background: 'linear-gradient(135deg,#f5576c,#f093fb)' }}>
                            ⏹ End Shift
                        </button>
                    )}
                </div>
            </div>

            {/* ── Active Shift Banner ──────────────────────────────────────── */}
            {currentShift && (
                <div className="relative overflow-hidden rounded-3xl p-6 text-white shadow-2xl"
                    style={{ background: 'linear-gradient(135deg,#11998e 0%,#38ef7d 50%,#0fa3a3 100%)' }}>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-3xl pointer-events-none" />
                    <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                    <div className="relative z-10 flex items-center justify-between flex-wrap gap-6">
                        {/* Left: shift info */}
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl animate-pulse">
                                🟢
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest opacity-75">Active Shift</p>
                                <p className="text-3xl font-black">{currentShift.shift_type} Shift</p>
                                <p className="text-sm opacity-80 mt-0.5">
                                    Opened by <strong>{currentShift.opened_by}</strong> · Started {currentShift.start_time}
                                </p>
                                {shiftDuration && (
                                    <p className="text-xs mt-1 font-mono bg-white/20 inline-block px-2 py-0.5 rounded-lg">
                                        ⏱ Duration: {shiftDuration}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Right: live stats */}
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Sales', val: `Ksh ${shiftStats.sales.toLocaleString()}` },
                                { label: 'Net Sales', val: `Ksh ${netLive.toLocaleString()}` },
                                { label: 'Expenses', val: `Ksh ${shiftStats.expenses.toLocaleString()}` },
                                { label: 'Expected Till', val: `Ksh ${expectedCashLive.toLocaleString()}` },
                            ].map(s => (
                                <div key={s.label} className="bg-white/20 rounded-2xl px-4 py-2.5 backdrop-blur-sm">
                                    <p className="text-xs opacity-75 uppercase tracking-wider">{s.label}</p>
                                    <p className="text-lg font-black">{s.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── KPI Glass Cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <GlassCard icon="⏰" label="Total Shifts" value={`${shifts.length}`} sub="All records"
                    bg="linear-gradient(135deg,#7c3aed,#5b21b6)" glow="rgba(124,58,237,.45)" />
                <GlassCard icon="🟢" label="Open" value={`${openCount}`} sub="Active now"
                    bg="linear-gradient(135deg,#059669,#047857)" glow="rgba(5,150,105,.45)" />
                <GlassCard icon="🔒" label="Closed" value={`${closedCount}`} sub="Completed"
                    bg="linear-gradient(135deg,#475569,#334155)" glow="rgba(71,85,105,.45)" />
                <GlassCard icon="💰" label="Total Revenue" value={`Ksh ${(totalRevenue/1000).toFixed(1)}K`} sub="Net across all shifts"
                    bg="linear-gradient(135deg,#d97706,#b45309)" glow="rgba(217,119,6,.45)" />
                <GlassCard icon="📊" label="Total Sales" value={`Ksh ${(totalSalesAll/1000).toFixed(1)}K`} sub="Gross sales"
                    bg="linear-gradient(135deg,#0284c7,#0369a1)" glow="rgba(2,132,199,.45)" />
                <GlassCard icon="📈" label="Avg / Shift" value={`Ksh ${(avgPerShift/1000).toFixed(1)}K`} sub="Average sales per shift"
                    bg="linear-gradient(135deg,#db2777,#be185d)" glow="rgba(219,39,119,.45)" />
            </div>

            {/* ── Shifts Table ─────────────────────────────────────────────── */}
            <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-100">
                {/* Table header */}
                <div className="px-6 py-4 flex items-center justify-between"
                    style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)' }}>
                    <div className="text-white">
                        <p className="text-sm font-bold uppercase tracking-widest opacity-75">Shift History</p>
                        <p className="text-lg font-black">{shifts.length} Shifts Recorded</p>
                    </div>
                    <div className="text-4xl opacity-80">📋</div>
                </div>
                <div className="overflow-x-auto bg-white">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-slate-50 to-gray-100">
                                {['#', 'Date', 'Type', 'Start', 'End', 'Opened By', 'Opening Cash', 'Sales', 'Expenses', 'Net Sales', 'Status'].map(h => (
                                    <th key={h} className="py-3 px-3 text-left text-xs font-black uppercase tracking-wider text-gray-500">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={11} className="py-20 text-center text-gray-400">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                                        <span className="text-sm">Loading shifts...</span>
                                    </div>
                                </td></tr>
                            ) : shifts.length === 0 ? (
                                <tr><td colSpan={11} className="py-20 text-center text-gray-400">
                                    <div className="text-5xl mb-3">⏰</div>
                                    <p className="font-semibold">No shifts yet — start your first shift!</p>
                                </td></tr>
                            ) : shifts.map((s, idx) => {
                                const isOpen = s.status === 'Open';
                                return (
                                    <tr key={s.shift_id}
                                        className={`border-t border-gray-50 transition-colors ${isOpen
                                            ? 'bg-gradient-to-r from-emerald-50 to-teal-50'
                                            : 'hover:bg-slate-50'}`}>
                                        <td className="py-3 px-3 text-xs text-gray-400 font-mono">#{s.shift_id}</td>
                                        <td className="py-3 px-3 text-sm font-semibold">
                                            {new Date(s.shift_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.shift_type === 'Morning'
                                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                                : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                                                {s.shift_type === 'Morning' ? '☀️' : '🌙'} {s.shift_type}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-sm font-mono text-gray-600">{s.start_time || '–'}</td>
                                        <td className="py-3 px-3 text-sm font-mono text-gray-600">{s.end_time || '–'}</td>
                                        <td className="py-3 px-3 text-sm text-gray-600">{s.opened_by || '–'}</td>
                                        <td className="py-3 px-3 text-sm text-gray-700">
                                            Ksh {(s.opening_cash || 0).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-3 text-sm font-bold text-emerald-600">
                                            Ksh {(s.total_sales || 0).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-3 text-sm text-rose-500">
                                            {s.total_expenses ? `– Ksh ${s.total_expenses.toLocaleString()}` : '–'}
                                        </td>
                                        <td className="py-3 px-3 text-sm font-black text-blue-600">
                                            Ksh {(s.net_sales || 0).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${isOpen
                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 animate-pulse'
                                                : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                {isOpen ? '🟢 Open' : '🔒 Closed'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Start Shift Modal ────────────────────────────────────────── */}
            {showStartModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        {/* Modal header */}
                        <div className="px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg,#11998e,#38ef7d)' }}>
                            <p className="text-xs font-bold uppercase tracking-widest opacity-75">New Shift</p>
                            <p className="text-2xl font-black">▶ Start Shift</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-100">
                                <p className="text-sm text-emerald-700 font-medium">
                                    Starting&nbsp;
                                    <strong>{new Date().getHours() < 14 ? 'Morning ☀️' : 'Evening 🌙'}</strong>
                                    &nbsp;shift for&nbsp;
                                    <strong>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}</strong>
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                                    💰 Opening Cash (Drop Amount)
                                </label>
                                <input type="number" value={openingCash}
                                    onChange={e => setOpeningCash(parseFloat(e.target.value) || 0)}
                                    className="w-full p-4 border-2 border-gray-200 rounded-2xl text-xl font-black focus:border-emerald-400 focus:outline-none transition-colors"
                                    placeholder="0" />
                                <p className="text-xs text-gray-400 mt-1">This amount will print on the drop slip</p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setShowStartModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-2xl font-semibold hover:bg-gray-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={startShift}
                                className="flex-1 py-3 rounded-2xl font-bold text-white shadow-lg hover:shadow-xl transition-all"
                                style={{ background: 'linear-gradient(135deg,#11998e,#38ef7d)' }}>
                                ▶ Start &amp; Print Drop
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── End Shift Modal ──────────────────────────────────────────── */}
            {showEndModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                        {/* Modal header */}
                        <div className="px-6 py-5 text-white" style={{ background: 'linear-gradient(135deg,#f5576c,#f093fb)' }}>
                            <p className="text-xs font-bold uppercase tracking-widest opacity-75">Close Shift</p>
                            <p className="text-2xl font-black">⏹ End Shift</p>
                            <p className="text-sm opacity-80">{currentShift?.shift_type} Shift · Started {currentShift?.start_time}</p>
                        </div>
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            {/* Metrics grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <MetricCard label="Opening Cash" value={`Ksh ${(currentShift?.opening_cash || 0).toLocaleString()}`} bg="rgba(248,250,252,1)" textColor="text-gray-800" />
                                <MetricCard label="Total Sales" value={`Ksh ${shiftStats.sales.toLocaleString()}`} bg="rgba(236,253,245,1)" textColor="text-emerald-700" />
                                <MetricCard label="Expenses" value={`– Ksh ${shiftStats.expenses.toLocaleString()}`} bg="rgba(255,241,242,1)" textColor="text-rose-600" />
                                <MetricCard label="Vouchers" value={`– Ksh ${shiftStats.vouchers.toLocaleString()}`} bg="rgba(255,241,242,1)" textColor="text-rose-600" />
                                <MetricCard label="Advances" value={`– Ksh ${shiftStats.advances.toLocaleString()}`} bg="rgba(255,247,237,1)" textColor="text-orange-600" />
                                <MetricCard label="Net Sales" value={`Ksh ${netLive.toLocaleString()}`} bg="rgba(239,246,255,1)" textColor="text-blue-700" />
                            </div>
                            {/* Expected cash */}
                            <div className="rounded-2xl p-4 bg-amber-50 border border-amber-100">
                                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Expected Cash in Till</p>
                                <p className="text-3xl font-black text-amber-700 mt-1">Ksh {expectedCashLive.toLocaleString()}</p>
                                <p className="text-xs text-amber-500 mt-1">Opening + Cash Sales – Expenses – Vouchers – Advances</p>
                            </div>
                            {/* Closing cash input */}
                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                                    💵 Actual Cash Count
                                </label>
                                <input type="number" value={closingCash}
                                    onChange={e => setClosingCash(parseFloat(e.target.value) || 0)}
                                    className="w-full p-4 border-2 border-gray-200 rounded-2xl text-xl font-black focus:border-rose-400 focus:outline-none transition-colors"
                                    placeholder="Count and enter cash in till..." />
                            </div>
                            {/* Live variance */}
                            {closingCash > 0 && (() => {
                                const v = closingCash - expectedCashLive;
                                return (
                                    <div className={`rounded-2xl p-4 border ${v >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Variance</p>
                                        <p className={`text-2xl font-black ${v >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {v >= 0 ? '+' : ''}Ksh {v.toLocaleString()}
                                        </p>
                                        <p className={`text-sm font-semibold ${v >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {v > 0 ? '✅ Overage' : v < 0 ? '⚠️ Shortage — check cash' : '✅ Perfectly balanced'}
                                        </p>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setShowEndModal(false)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-2xl font-semibold hover:bg-gray-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={endShift}
                                className="flex-1 py-3 rounded-2xl font-bold text-white shadow-lg hover:shadow-xl transition-all"
                                style={{ background: 'linear-gradient(135deg,#f5576c,#f093fb)' }}>
                                ⏹ Close &amp; Print Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
