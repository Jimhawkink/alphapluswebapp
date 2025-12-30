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

        // Load stats for current shift ONLY
        if (openShift) {
            // Create shift start datetime for filtering
            const shiftStartDateTime = new Date(`${openShift.shift_date}T${openShift.start_time || '00:00:00'}`).toISOString();

            console.log('Loading shift stats for shift_id:', openShift.shift_id, 'started at:', shiftStartDateTime);

            // Get sales for THIS SHIFT ONLY - filter by shift_id
            const { data: salesData } = await supabase
                .from('sales')
                .select('total_amount, payment_method')
                .eq('shift_id', openShift.shift_id);

            // Get expenses created DURING this shift (after shift started)
            const { data: expData } = await supabase
                .from('expenses')
                .select('amount')
                .gte('created_at', shiftStartDateTime);

            // Get vouchers created DURING this shift (after shift started)
            const { data: vchData } = await supabase
                .from('vouchers')
                .select('amount')
                .gte('created_at', shiftStartDateTime);

            // Get salary advances created DURING this shift (after shift started)
            const { data: advData } = await supabase
                .from('salary_advances')
                .select('amount')
                .eq('status', 'Approved')
                .gte('created_at', shiftStartDateTime);

            const totalSales = (salesData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);
            const totalExpenses = (expData || []).reduce((sum, e) => sum + (e.amount || 0), 0);
            const totalVouchers = (vchData || []).reduce((sum, v) => sum + (v.amount || 0), 0);
            const totalAdvances = (advData || []).reduce((sum, a) => sum + (a.amount || 0), 0);

            console.log('Current Shift Stats:', {
                shift_id: openShift.shift_id,
                totalSales,
                totalExpenses,
                totalVouchers,
                totalAdvances,
                salesCount: salesData?.length
            });

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

    const printShiftReport = async (shift: Shift, stats: { sales: number; expenses: number; vouchers: number; advances: number }, closing: number, net: number) => {
        // ========== FETCH COMPANY INFO FROM ORGANISATION_SETTINGS ==========
        let companyName = 'Your Business Name';
        let companyPhone = '';
        let companyAddress = '';

        try {
            const { data: settingsData, error: settingsError } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value');

            console.log('Organisation settings data:', settingsData, 'Error:', settingsError);

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
            console.log('Could not fetch organisation settings:', err);
        }

        // ========== FETCH ALL SALES DATA ==========
        interface SaleRecord {
            sale_id: number;
            total_amount: number;
            payment_method: string;
            status: string;
            waiter_name: string | null;
            created_by: string | null;
        }

        let salesData: SaleRecord[] = [];
        let cashSales = 0, mpesaSales = 0, cardSales = 0, creditSales = 0;
        let totalTransactions = 0;
        const userSalesMap: { [key: string]: number } = {};

        // Create shift start datetime for filtering
        const shiftStartDateTime = new Date(`${shift.shift_date}T${shift.start_time || '00:00:00'}`).toISOString();
        console.log('Fetching sales for shift_id:', shift.shift_id, 'or after:', shiftStartDateTime);

        try {
            // Try to get sales by shift_id first, then fallback to date+time
            let { data } = await supabase
                .from('sales')
                .select('sale_id, total_amount, payment_method, status, waiter_name, created_by')
                .eq('shift_id', shift.shift_id);

            // If no sales with shift_id, fallback to sales made during this shift time period
            if (!data || data.length === 0) {
                console.log('No sales with shift_id, trying date/time filter...');
                const result = await supabase
                    .from('sales')
                    .select('sale_id, total_amount, payment_method, status, waiter_name, created_by')
                    .eq('sale_date', shift.shift_date)
                    .gte('created_at', shiftStartDateTime);
                data = result.data;
            }

            console.log('Sales data found:', data?.length || 0, 'records');

            if (data) {
                salesData = data;
                totalTransactions = data.length;

                data.forEach(sale => {
                    const method = (sale.payment_method || '').toUpperCase();
                    const amount = sale.total_amount || 0;

                    // Payment breakdown
                    if (method.includes('CASH')) cashSales += amount;
                    else if (method.includes('MPESA') || method.includes('M-PESA')) mpesaSales += amount;
                    else if (method.includes('CARD')) cardSales += amount;
                    else if (method.includes('CREDIT') || sale.status === 'Pending') creditSales += amount;
                    else cashSales += amount;

                    // User sales breakdown
                    const userName = sale.waiter_name || sale.created_by || 'Walk-in';
                    userSalesMap[userName] = (userSalesMap[userName] || 0) + amount;
                });
            }
        } catch (err) {
            console.log('Could not fetch sales data:', err);
        }

        // ========== FETCH SALES ITEMS FOR CATEGORY & QUANTITY BREAKDOWN ==========
        interface CategorySales { category: string; amount: number; qty: number }
        interface ItemSales { name: string; qty: number; amount: number }

        const categorySalesMap: { [key: string]: CategorySales } = {};
        const itemSalesMap: { [key: string]: ItemSales } = {};

        try {
            // Get sale IDs for today
            const saleIds = salesData.map(s => s.sale_id);

            if (saleIds.length > 0) {
                const { data: itemsData } = await supabase
                    .from('sales_items')
                    .select('product_name, quantity, subtotal, product_id')
                    .in('sale_id', saleIds);

                if (itemsData) {
                    // Get product categories
                    const productIds = Array.from(new Set(itemsData.map(i => i.product_id).filter(Boolean)));

                    let productCategories: { [key: number]: string } = {};
                    if (productIds.length > 0) {
                        const { data: products } = await supabase
                            .from('products')
                            .select('pid, category')
                            .in('pid', productIds);

                        if (products) {
                            products.forEach(p => {
                                productCategories[p.pid] = p.category || 'Other';
                            });
                        }
                    }

                    itemsData.forEach(item => {
                        const category = productCategories[item.product_id] || 'Other';
                        const name = item.product_name || 'Unknown';
                        const qty = item.quantity || 0;
                        const amount = item.subtotal || 0;

                        // Category breakdown
                        if (!categorySalesMap[category]) {
                            categorySalesMap[category] = { category, amount: 0, qty: 0 };
                        }
                        categorySalesMap[category].amount += amount;
                        categorySalesMap[category].qty += qty;

                        // Item breakdown
                        if (!itemSalesMap[name]) {
                            itemSalesMap[name] = { name, qty: 0, amount: 0 };
                        }
                        itemSalesMap[name].qty += qty;
                        itemSalesMap[name].amount += amount;
                    });
                }
            }
        } catch (err) {
            console.log('Could not fetch sales items');
        }


        // ========== FETCH EXPENSE DETAILS ==========
        // Use shiftStartDateTime already defined above for filtering

        interface ExpenseItem { name: string; amount: number; category: string }
        let expensesList: ExpenseItem[] = [];

        try {
            const { data: expData } = await supabase
                .from('expenses')
                .select('expense_name, amount, category')
                .gte('created_at', shiftStartDateTime);

            if (expData) {
                expensesList = expData.map(e => ({
                    name: e.expense_name || 'Expense',
                    amount: e.amount || 0,
                    category: e.category || 'General'
                }));
            }
        } catch (err) {
            console.log('Could not fetch expenses');
        }

        // ========== FETCH SALARY ADVANCES ==========
        interface AdvanceItem { employee: string; amount: number }
        let advancesList: AdvanceItem[] = [];
        let totalAdvances = 0;

        try {
            const { data: advData } = await supabase
                .from('salary_advances')
                .select('employee_name, amount')
                .eq('status', 'Approved')
                .gte('created_at', shiftStartDateTime);

            if (advData) {
                advancesList = advData.map(a => ({
                    employee: a.employee_name || 'Employee',
                    amount: a.amount || 0
                }));
                totalAdvances = advData.reduce((sum, a) => sum + (a.amount || 0), 0);
            }
        } catch (err) {
            console.log('Could not fetch advances');
        }

        // ========== FETCH VOUCHERS ==========
        interface VoucherItem { payee: string; amount: number; description: string }
        let vouchersList: VoucherItem[] = [];

        try {
            const { data: vchData } = await supabase
                .from('vouchers')
                .select('payee_name, amount, description')
                .gte('created_at', shiftStartDateTime);

            if (vchData) {
                vouchersList = vchData.map(v => ({
                    payee: v.payee_name || 'Payee',
                    amount: v.amount || 0,
                    description: v.description || ''
                }));
            }
        } catch (err) {
            console.log('Could not fetch vouchers');
        }

        // ========== CALCULATE TOTALS ==========
        const totalSales = stats.sales;
        const totalExpenses = stats.expenses;
        const totalVouchers = stats.vouchers;
        const shiftType = shift.shift_type === 'Morning' ? 'DAY SHIFT' : 'NIGHT SHIFT';

        // Expected cash = Opening + Cash Sales - Expenses - Vouchers - Advances
        const expectedCash = (shift.opening_cash || 0) + cashSales - totalExpenses - totalVouchers - totalAdvances;
        const variance = closing - expectedCash;

        // Category percentages
        const categoryList = Object.values(categorySalesMap).sort((a, b) => b.amount - a.amount);
        const itemList = Object.values(itemSalesMap).sort((a, b) => b.qty - a.qty);
        const userSalesList = Object.entries(userSalesMap).sort((a, b) => b[1] - a[1]);

        // ========== GENERATE HTML REPORT ==========
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
            font-size: 10px;
            line-height: 1.3;
        }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .company-name { 
            font-size: 14px; 
            font-weight: bold; 
            letter-spacing: 1px;
            margin-bottom: 2px;
        }
        .shift-badge { 
            font-size: 12px; 
            font-weight: bold;
            background: #000;
            color: #fff;
            padding: 3px 10px;
            margin: 6px 0;
            display: inline-block;
        }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .double-line { border-top: 2px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; padding: 1px 0; }
        .section-title { 
            background: #333; 
            color: #fff; 
            padding: 3px 6px; 
            font-weight: bold;
            font-size: 10px;
            margin: 8px 0 4px 0;
        }
        .total-row { 
            font-weight: bold; 
            background: #f0f0f0; 
            padding: 4px;
            margin: 4px 0;
        }
        .green { color: #008000; }
        .red { color: #cc0000; }
        .orange { color: #cc6600; }
        .small { font-size: 9px; }
        .item-row { font-size: 9px; padding: 1px 0; }
        .signature-box { 
            border-top: 1px solid #000; 
            margin-top: 15px; 
            padding-top: 3px;
            font-size: 9px;
        }
    </style>
</head>
<body>
    <!-- HEADER -->
    <div class="center">
        <div class="company-name">${companyName.toUpperCase()}</div>
        ${companyAddress ? `<div class="small">${companyAddress}</div>` : ''}
        ${companyPhone ? `<div class="small">Tel: ${companyPhone}</div>` : ''}
        <div class="double-line"></div>
        <div class="shift-badge">${shiftType} REPORT</div>
    </div>

    <!-- SHIFT INFO -->
    <div class="divider"></div>
    <div class="row"><span>Date:</span><span>${new Date(shift.shift_date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
    <div class="row"><span>Shift Started:</span><span>${shift.start_time}</span></div>
    <div class="row"><span>Shift Ended:</span><span>${new Date().toLocaleTimeString()}</span></div>
    <div class="row"><span>Opened By:</span><span>${shift.opened_by}</span></div>
    <div class="row"><span>Closed By:</span><span>${shift.closed_by || 'Admin'}</span></div>

    <!-- CASH SUMMARY -->
    <div class="section-title center">💰 CASH SUMMARY</div>
    <div class="row"><span>Opening Cash:</span><span>Ksh ${(shift.opening_cash || 0).toLocaleString()}</span></div>
    <div class="row bold"><span>Total Sales:</span><span class="green">Ksh ${totalSales.toLocaleString()}</span></div>
    <div class="row red"><span>Less Expenses:</span><span>- Ksh ${totalExpenses.toLocaleString()}</span></div>
    <div class="row red"><span>Less Vouchers:</span><span>- Ksh ${totalVouchers.toLocaleString()}</span></div>
    <div class="row orange"><span>Less Advances:</span><span>- Ksh ${totalAdvances.toLocaleString()}</span></div>
    <div class="total-row row"><span>NET SALES:</span><span class="green">Ksh ${net.toLocaleString()}</span></div>

    <!-- SALES BY PAYMENT MODE -->
    <div class="section-title center">💳 SALES BY PAYMENT MODE</div>
    <div class="row"><span>Cash:</span><span class="green">Ksh ${cashSales.toLocaleString()}</span></div>
    <div class="row"><span>M-Pesa:</span><span class="green">Ksh ${mpesaSales.toLocaleString()}</span></div>
    <div class="row"><span>Card:</span><span>Ksh ${cardSales.toLocaleString()}</span></div>
    <div class="row"><span>Credit (Not Paid):</span><span class="orange">Ksh ${creditSales.toLocaleString()}</span></div>
    <div class="divider"></div>
    <div class="row bold"><span>Total Transactions:</span><span>${totalTransactions}</span></div>

    ${userSalesList.length > 0 ? `
    <!-- USER SALES -->
    <div class="section-title center">👤 USER SALES</div>
    ${userSalesList.map(([name, amount]) => `<div class="row"><span>${name}:</span><span>Ksh ${amount.toLocaleString()}</span></div>`).join('')}
    <div class="divider"></div>
    <div class="row bold"><span>Total:</span><span>Ksh ${totalSales.toLocaleString()}</span></div>
    ` : ''}

    ${categoryList.length > 0 ? `
    <!-- SALES BY CATEGORY -->
    <div class="section-title center">📊 SALES BY ITEM CATEGORY</div>
    ${categoryList.map(cat => {
            const pct = totalSales > 0 ? ((cat.amount / totalSales) * 100).toFixed(1) : '0.0';
            return `<div class="item-row row"><span>${cat.category}</span><span>${pct}%</span><span>Ksh ${cat.amount.toLocaleString()}</span></div>`;
        }).join('')}
    <div class="divider"></div>
    <div class="row bold"><span>Total:</span><span></span><span>Ksh ${totalSales.toLocaleString()}</span></div>
    ` : ''}

    ${categoryList.length > 0 ? `
    <!-- QUANTITIES BY CATEGORY -->
    <div class="section-title center">📦 QUANTITIES BY CATEGORY</div>
    ${categoryList.map(cat => {
            const totalQty = categoryList.reduce((s, c) => s + c.qty, 0);
            const pct = totalQty > 0 ? ((cat.qty / totalQty) * 100).toFixed(1) : '0.0';
            return `<div class="item-row row"><span>${cat.category}</span><span>${pct}%</span><span>${cat.qty}</span></div>`;
        }).join('')}
    <div class="divider"></div>
    <div class="row bold"><span>Total Items:</span><span></span><span>${categoryList.reduce((s, c) => s + c.qty, 0)}</span></div>
    ` : ''}

    ${itemList.length > 0 ? `
    <!-- QUANTITIES BY ITEM -->
    <div class="section-title center">🍽️ QUANTITIES BY ITEM</div>
    ${itemList.slice(0, 20).map(item => `<div class="item-row row"><span>${item.name.substring(0, 20)}</span><span>${item.qty}</span><span>Ksh ${item.amount.toLocaleString()}</span></div>`).join('')}
    ${itemList.length > 20 ? `<div class="small center">... and ${itemList.length - 20} more items</div>` : ''}
    <div class="divider"></div>
    <div class="row bold"><span>Total:</span><span>${itemList.reduce((s, i) => s + i.qty, 0)}</span><span>Ksh ${itemList.reduce((s, i) => s + i.amount, 0).toLocaleString()}</span></div>
    ` : ''}

    ${expensesList.length > 0 ? `
    <!-- EXPENSES -->
    <div class="section-title center">📤 EXPENSES DETAIL</div>
    ${expensesList.map(e => `<div class="item-row row"><span>${e.name.substring(0, 25)}:</span><span class="red">- Ksh ${e.amount.toLocaleString()}</span></div>`).join('')}
    <div class="divider"></div>
    <div class="row bold red"><span>Total Expenses:</span><span>- Ksh ${totalExpenses.toLocaleString()}</span></div>
    ` : ''}

    ${advancesList.length > 0 ? `
    <!-- SALARY ADVANCES -->
    <div class="section-title center">💵 SALARY ADVANCES</div>
    ${advancesList.map(a => `<div class="item-row row"><span>${a.employee}:</span><span class="orange">- Ksh ${a.amount.toLocaleString()}</span></div>`).join('')}
    <div class="divider"></div>
    <div class="row bold orange"><span>Total Advances:</span><span>- Ksh ${totalAdvances.toLocaleString()}</span></div>
    ` : ''}

    ${vouchersList.length > 0 ? `
    <!-- VOUCHERS -->
    <div class="section-title center">🎫 VOUCHERS</div>
    ${vouchersList.map(v => `<div class="item-row row"><span>${v.payee}:</span><span class="red">- Ksh ${v.amount.toLocaleString()}</span></div>`).join('')}
    <div class="divider"></div>
    <div class="row bold red"><span>Total Vouchers:</span><span>- Ksh ${totalVouchers.toLocaleString()}</span></div>
    ` : ''}

    <!-- CASH RECONCILIATION -->
    <div class="section-title center">💵 CASH RECONCILIATION</div>
    <div class="row"><span>Expected Cash:</span><span>Ksh ${expectedCash.toLocaleString()}</span></div>
    <div class="row"><span>Actual Cash Count:</span><span>Ksh ${closing.toLocaleString()}</span></div>
    <div class="total-row row">
        <span>VARIANCE:</span>
        <span class="${variance >= 0 ? 'green' : 'red'}">${variance >= 0 ? '+' : ''}Ksh ${variance.toLocaleString()}</span>
    </div>
    <div class="center bold ${variance > 0 ? 'green' : variance < 0 ? 'red' : 'green'}">
        ${variance > 0 ? '✅ OVERAGE' : variance < 0 ? '⚠️ SHORTAGE' : '✅ BALANCED'}
    </div>

    <!-- SIGNATURES -->
    <div class="double-line"></div>
    <div class="signature-box center">Cashier Signature</div>
    <div style="margin-top: 15px;" class="signature-box center">Manager Signature</div>
    
    <div class="double-line"></div>
    <div class="center small">
        Printed: ${new Date().toLocaleString()}<br/>
        Thank you for your service!
    </div>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=350,height=800');
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
