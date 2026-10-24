'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// -------------------------------------------------------------
// TYPE DEFINITIONS
// -------------------------------------------------------------
interface UserEmployee {
    user_id: number;
    user_code: string | null;
    user_name: string;
    name: string;
    user_type: string;
    email: string | null;
    phone: string | null;
    national_id: string | null;
    salary_type: 'Monthly' | 'Weekly';
    salary_amount: number;
    active: boolean;
}

interface PendingStaffBillItem {
    item_id?: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface PendingStaffBill {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time?: string;
    waiter_name?: string;
    table_name?: string;
    room_name?: string;
    total_amount: number;
    amount_paid: number;
    unpaid_balance: number;
    status: string;
    items?: PendingStaffBillItem[];
    selected_for_deduction?: boolean;
}

interface PayrollRecord {
    payroll_id: number;
    payroll_code: string;
    employee_id: number;
    employee_name: string;
    employee_code?: string;
    national_id?: string;
    user_type?: string;
    pay_period: string; // e.g. "2026-10-W4" or "2026-10"
    pay_frequency: 'Weekly' | 'Monthly';
    pay_date: string;

    // Earnings
    basic_salary: number;
    allowances: number;
    overtime: number;
    bonuses: number;
    gross_pay: number;

    // Kenya Statutory Taxes
    nssf_tier1: number;
    nssf_tier2: number;
    nssf: number;
    shif: number; // 2.75%
    housing_levy: number; // 1.5%
    taxable_pay: number;
    gross_paye: number;
    personal_relief: number;
    insurance_relief: number;
    housing_relief: number;
    paye: number; // Net PAYE
    total_statutory: number;

    // Other Deductions
    advances: number;
    staff_bills_deductions: number;
    deducted_bills_json?: PendingStaffBill[];
    other_deductions: number;
    total_deductions: number;

    // Final Net Pay
    net_pay: number;
    status: 'Pending' | 'Approved' | 'Paid';
    payment_method?: 'Cash' | 'M-Pesa' | 'Bank';
    payment_ref?: string;
    paid_date?: string;
    paid_by?: string;
    notes?: string;
    created_at?: string;
}

interface SalaryAdvanceRecord {
    advance_id: number;
    advance_code: string;
    employee_id: number;
    employee_name: string;
    advance_date: string;
    amount: number;
    reason: string;
    repayment_period: string; // e.g. "2026-10-W4" or "2026-10"
    status: 'Pending' | 'Approved' | 'Repaid' | 'Rejected';
    approved_by: string;
    deducted_in_payroll_id?: number;
    repaid_date?: string;
    notes?: string;
    created_at?: string;
}

// -------------------------------------------------------------
// KENYA STATUTORY TAX ENGINE (Current 2024 / 2025 / 2026 Laws)
// -------------------------------------------------------------
// NSSF Act 2013 Rates:
// Tier I Limit: KES 7,000 (6% = KES 420)
// Tier II Limit: KES 36,000 (6% of 29,000 = KES 1,740)
// Max standard Employee NSSF = KES 2,160 / month
// SHIF (Social Health Insurance Fund) = 2.75% of Gross (min KES 300)
// Affordable Housing Levy (AHL) = 1.5% of Gross
// Personal Relief = KES 2,400 / month
// Insurance Relief = 15% of SHIF (max KES 5,000 / month)
// Housing Relief = 15% of AHL
function calculateKenyaPayroll({
    grossPay,
    frequency = 'Monthly',
}: {
    grossPay: number;
    frequency?: 'Weekly' | 'Monthly';
}) {
    // Normalise to monthly basis for statutory calculation
    const divisor = frequency === 'Weekly' ? 4.333 : 1;
    const monthlyGross = grossPay * divisor;

    // 1. NSSF Calculation (Monthly)
    let nssfTier1Monthly = 0;
    let nssfTier2Monthly = 0;

    if (monthlyGross > 0) {
        nssfTier1Monthly = Math.round(Math.min(monthlyGross, 7000) * 0.06);
        if (monthlyGross > 7000) {
            const tier2Pensionable = Math.min(monthlyGross, 36000) - 7000;
            nssfTier2Monthly = Math.round(tier2Pensionable * 0.06);
        }
    }
    const totalNssfMonthly = Math.min(nssfTier1Monthly + nssfTier2Monthly, 2160);

    // 2. SHIF Calculation (Monthly - 2.75%, min KES 300)
    let shifMonthly = 0;
    if (monthlyGross > 0) {
        shifMonthly = Math.round(Math.max(300, monthlyGross * 0.0275));
    }

    // 3. Affordable Housing Levy (AHL - 1.5%)
    const housingLevyMonthly = Math.round(monthlyGross * 0.015);

    // 4. Taxable Pay = Gross - Allowable NSSF
    const taxablePayMonthly = Math.max(0, monthlyGross - totalNssfMonthly);

    // 5. PAYE Tax Brackets (Monthly):
    // Up to 24,000: 10%
    // Next 8,333 (24,001 to 32,333): 25%
    // Next 467,667 (32,334 to 500,000): 30%
    // Next 300,000 (500,001 to 800,000): 32.5%
    // Above 800,000: 35%
    let grossPayeMonthly = 0;
    let rem = taxablePayMonthly;

    if (rem > 0) {
        const b1 = Math.min(rem, 24000);
        grossPayeMonthly += b1 * 0.10;
        rem -= b1;
    }
    if (rem > 0) {
        const b2 = Math.min(rem, 8333);
        grossPayeMonthly += b2 * 0.25;
        rem -= b2;
    }
    if (rem > 0) {
        const b3 = Math.min(rem, 467667);
        grossPayeMonthly += b3 * 0.30;
        rem -= b3;
    }
    if (rem > 0) {
        const b4 = Math.min(rem, 300000);
        grossPayeMonthly += b4 * 0.325;
        rem -= b4;
    }
    if (rem > 0) {
        grossPayeMonthly += rem * 0.35;
    }

    // 6. Reliefs
    const personalReliefMonthly = monthlyGross > 0 ? 2400 : 0;
    const insuranceReliefMonthly = Math.min(Math.round(shifMonthly * 0.15), 5000);
    const housingReliefMonthly = Math.round(housingLevyMonthly * 0.15);
    const totalReliefMonthly = personalReliefMonthly + insuranceReliefMonthly + housingReliefMonthly;

    const netPayeMonthly = Math.max(0, Math.round(grossPayeMonthly - totalReliefMonthly));

    // Convert back to chosen frequency
    if (frequency === 'Weekly') {
        const nssfTier1 = Math.round(nssfTier1Monthly / 4.333);
        const nssfTier2 = Math.round(nssfTier2Monthly / 4.333);
        const nssf = Math.round(totalNssfMonthly / 4.333);
        const shif = Math.round(shifMonthly / 4.333);
        const housingLevy = Math.round(housingLevyMonthly / 4.333);
        const taxablePay = Math.round(taxablePayMonthly / 4.333);
        const grossPaye = Math.round(grossPayeMonthly / 4.333);
        const personalRelief = Math.round(personalReliefMonthly / 4.333);
        const insuranceRelief = Math.round(insuranceReliefMonthly / 4.333);
        const housingRelief = Math.round(housingReliefMonthly / 4.333);
        const paye = Math.round(netPayeMonthly / 4.333);
        const totalStatutory = nssf + shif + housingLevy + paye;

        return {
            grossPay,
            nssfTier1,
            nssfTier2,
            nssf,
            shif,
            housingLevy,
            taxablePay,
            grossPaye,
            personalRelief,
            insuranceRelief,
            housingRelief,
            paye,
            totalStatutory,
            monthlyGrossEquivalent: Math.round(monthlyGross),
        };
    }

    return {
        grossPay,
        nssfTier1: nssfTier1Monthly,
        nssfTier2: nssfTier2Monthly,
        nssf: totalNssfMonthly,
        shif: shifMonthly,
        housingLevy: housingLevyMonthly,
        taxablePay: Math.round(taxablePayMonthly),
        grossPaye: Math.round(grossPayeMonthly),
        personalRelief: personalReliefMonthly,
        insuranceRelief: insuranceReliefMonthly,
        housingRelief: housingReliefMonthly,
        paye: netPayeMonthly,
        totalStatutory: totalNssfMonthly + shifMonthly + housingLevyMonthly + netPayeMonthly,
        monthlyGrossEquivalent: Math.round(monthlyGross),
    };
}

export default function PayrollMasterPage() {
    // -------------------------------------------------------------
    // NAVIGATION & WORKSTATION TABS
    // -------------------------------------------------------------
    const [activeTab, setActiveTab] = useState<
        'payroll' | 'employees' | 'advances' | 'staff_bills' | 'tax_reports' | 'p9'
    >('payroll');

    // -------------------------------------------------------------
    // PERIOD & SELECTION
    // -------------------------------------------------------------
    const [payFrequency, setPayFrequency] = useState<'Weekly' | 'Monthly'>('Weekly');
    const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
    const [selectedWeek, setSelectedWeek] = useState<number>(() => getCurrentWeekOfMonth());
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Paid'>('All');

    // -------------------------------------------------------------
    // CORE DATASETS
    // -------------------------------------------------------------
    const [employees, setEmployees] = useState<UserEmployee[]>([]);
    const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
    const [advancesList, setAdvancesList] = useState<SalaryAdvanceRecord[]>([]);
    const [allPendingSales, setAllPendingSales] = useState<PendingStaffBill[]>([]);
    const [hotelInfo, setHotelInfo] = useState<{ name: string; pin: string; phone: string; address: string }>({
        name: 'Alpha Plus Hotel & Resort',
        pin: 'P051234567Z',
        phone: '+254 700 000 000',
        address: 'Nairobi, Kenya',
    });

    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // -------------------------------------------------------------
    // MODAL STATES
    // -------------------------------------------------------------
    const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
    const [showAdvanceModal, setShowAdvanceModal] = useState<boolean>(false);
    const [showCalculatorModal, setShowCalculatorModal] = useState<boolean>(false);
    const [showThermalModal, setShowThermalModal] = useState<boolean>(false);
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [showEditWageModal, setShowEditWageModal] = useState<boolean>(false);

    // Selected record pointers
    const [selectedPayrollEntry, setSelectedPayrollEntry] = useState<PayrollRecord | null>(null);
    const [selectedEmployeeForWage, setSelectedEmployeeForWage] = useState<UserEmployee | null>(null);
    const [targetPaymentEntry, setTargetPaymentEntry] = useState<PayrollRecord | null>(null);

    // Calculator inputs
    const [calcGrossInput, setCalcGrossInput] = useState<number>(30000);
    const [calcFreqInput, setCalcFreqInput] = useState<'Weekly' | 'Monthly'>('Monthly');

    // P9 Generator inputs
    const [p9SelectedUserId, setP9SelectedUserId] = useState<number>(0);
    const [p9SelectedYear, setP9SelectedYear] = useState<number>(new Date().getFullYear());

    // -------------------------------------------------------------
    // PAYROLL GENERATION FORM STATE
    // -------------------------------------------------------------
    const [genForm, setGenForm] = useState({
        employee_id: 0,
        basic_salary: 0,
        allowances: 0,
        overtime: 0,
        bonuses: 0,
        salary_advance: 0,
        other_deductions: 0,
        notes: '',
    });
    const [staffPendingBills, setStaffPendingBills] = useState<PendingStaffBill[]>([]);
    const [isLoadingBills, setIsLoadingBills] = useState<boolean>(false);

    // Advance Form State
    const [advanceForm, setAdvanceForm] = useState({
        employee_id: 0,
        amount: 0,
        reason: '',
        repayment_month: new Date().toISOString().slice(0, 7),
        repayment_week: getCurrentWeekOfMonth(),
    });

    // Wage Edit Form State
    const [wageForm, setWageForm] = useState({
        salary_amount: 0,
        salary_type: 'Weekly' as 'Weekly' | 'Monthly',
    });

    // Payment Form State
    const [paymentForm, setPaymentForm] = useState({
        payment_method: 'Cash' as 'Cash' | 'M-Pesa' | 'Bank',
        payment_ref: '',
        paid_by: 'Management / Finance Desk',
    });

    // -------------------------------------------------------------
    // CALENDAR & WEEK HELPERS
    // -------------------------------------------------------------
    function getCurrentWeekOfMonth() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const dayOfMonth = now.getDate();
        return Math.ceil((dayOfMonth + firstDay.getDay()) / 7);
    }

    const currentPayPeriod = useMemo(() => {
        if (payFrequency === 'Monthly') return selectedMonth;
        return `${selectedMonth}-W${selectedWeek}`;
    }, [payFrequency, selectedMonth, selectedWeek]);

    const getWeeksInMonth = (monthStr: string) => {
        const [year, monthNum] = monthStr.split('-').map(Number);
        const firstDay = new Date(year, monthNum - 1, 1);
        const lastDay = new Date(year, monthNum, 0);
        const totalDays = lastDay.getDate();
        const firstDayOfWeek = firstDay.getDay();
        return Math.ceil((totalDays + firstDayOfWeek) / 7);
    };

    const getWeekDates = (monthStr: string, weekNum: number): { start: Date; end: Date; saturday: Date } => {
        const [year, monthNum] = monthStr.split('-').map(Number);
        const firstDay = new Date(year, monthNum - 1, 1);
        const firstDayOfWeek = firstDay.getDay();

        const startDay = (weekNum - 1) * 7 - firstDayOfWeek + 1;
        const start = new Date(year, monthNum - 1, Math.max(1, startDay));

        const endDay = startDay + 6;
        const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
        const end = new Date(year, monthNum - 1, Math.min(lastDayOfMonth, endDay));

        // Find Saturday in this week window
        const saturday = new Date(start);
        const daysToSat = (6 - saturday.getDay() + 7) % 7;
        saturday.setDate(saturday.getDate() + daysToSat);

        return { start, end, saturday };
    };

    const isTodaySaturday = useMemo(() => {
        return new Date().getDay() === 6;
    }, []);

    // -------------------------------------------------------------
    // DATA PERSISTENCE HELPERS (Dual DB & Cloud Settings)
    // -------------------------------------------------------------
    const loadHotelSettings = useCallback(async () => {
        try {
            const { data } = await supabase.from('organisation_settings').select('*');
            if (data && data.length) {
                const map: Record<string, string> = {};
                data.forEach((r) => {
                    map[r.setting_key] = r.setting_value || '';
                });
                setHotelInfo({
                    name: map.company_name || map.trading_name || 'Alpha Plus Hotel & Resort',
                    pin: map.kra_pin || 'P051234567Z',
                    phone: map.phone || '+254 700 000 000',
                    address: `${map.address || 'PO Box 1024'}, ${map.city || 'Nairobi'}`,
                });
            }
        } catch {
            // fallback gracefully
        }
    }, []);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Load users / employees from 'users' table
            const { data: usersData, error: uErr } = await supabase
                .from('users')
                .select('user_id, user_code, user_name, name, user_type, email, phone, national_id, salary_type, salary_amount, active')
                .eq('active', true)
                .order('name');

            if (uErr) {
                console.error('Error querying users:', uErr);
                toast.error('Could not load employees from users table');
            } else {
                setEmployees(usersData || []);
            }

            // 2. Load payroll entries
            let loadedPayroll: PayrollRecord[] = [];
            const { data: payTableData, error: pErr } = await supabase
                .from('payroll')
                .select('*')
                .order('payroll_id', { ascending: false });

            if (!pErr && payTableData) {
                loadedPayroll = payTableData;
            } else {
                // Fallback to organisation_settings
                const { data: orgPay } = await supabase
                    .from('organisation_settings')
                    .select('setting_value')
                    .eq('setting_key', 'payroll_ledger')
                    .single();

                if (orgPay?.setting_value) {
                    try {
                        loadedPayroll = JSON.parse(orgPay.setting_value);
                    } catch {
                        loadedPayroll = [];
                    }
                } else {
                    const local = localStorage.getItem('alphaplus_payroll_records');
                    if (local) {
                        try {
                            loadedPayroll = JSON.parse(local);
                        } catch {
                            loadedPayroll = [];
                        }
                    }
                }
            }
            setPayrollList(loadedPayroll);

            // 3. Load Salary Advances
            let loadedAdvances: SalaryAdvanceRecord[] = [];
            const { data: advTableData, error: aErr } = await supabase
                .from('salary_advances')
                .select('*')
                .order('advance_id', { ascending: false });

            if (!aErr && advTableData) {
                loadedAdvances = advTableData;
            } else {
                const { data: orgAdv } = await supabase
                    .from('organisation_settings')
                    .select('setting_value')
                    .eq('setting_key', 'salary_advances_ledger')
                    .single();

                if (orgAdv?.setting_value) {
                    try {
                        loadedAdvances = JSON.parse(orgAdv.setting_value);
                    } catch {
                        loadedAdvances = [];
                    }
                } else {
                    const local = localStorage.getItem('alphaplus_advances_records');
                    if (local) {
                        try {
                            loadedAdvances = JSON.parse(local);
                        } catch {
                            loadedAdvances = [];
                        }
                    }
                }
            }
            setAdvancesList(loadedAdvances);

            // 4. Load all pending sales/bills across the property
            const { data: pendingSalesData } = await supabase
                .from('sales')
                .select('sale_id, receipt_no, sale_date, sale_time, total_amount, amount_paid, waiter_name, waiter_id, customer_name, status, table_name, room_name')
                .or('status.eq.Pending,status.eq.Unpaid,amount_paid.lt.total_amount')
                .order('sale_id', { ascending: false })
                .limit(100);

            if (pendingSalesData) {
                const billsFormatted: PendingStaffBill[] = pendingSalesData.map((s) => ({
                    sale_id: s.sale_id,
                    receipt_no: s.receipt_no || `RCP-${String(s.sale_id).padStart(5, '0')}`,
                    sale_date: s.sale_date || new Date().toISOString().split('T')[0],
                    sale_time: s.sale_time || '',
                    waiter_name: s.waiter_name || s.customer_name || 'Staff',
                    table_name: s.table_name || s.room_name || 'Dining Area',
                    total_amount: Number(s.total_amount || 0),
                    amount_paid: Number(s.amount_paid || 0),
                    unpaid_balance: Math.max(0, Number(s.total_amount || 0) - Number(s.amount_paid || 0)),
                    status: s.status || 'Pending',
                    selected_for_deduction: true,
                }));
                setAllPendingSales(billsFormatted);
            }
        } catch (err) {
            console.error('Data load exception:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
        loadHotelSettings();
    }, [fetchAllData, loadHotelSettings]);

    // Save payroll entries to Cloud (Database / Org Settings / LocalStorage)
    const persistPayrollList = async (updated: PayrollRecord[]) => {
        setPayrollList(updated);
        try {
            localStorage.setItem('alphaplus_payroll_records', JSON.stringify(updated));

            // Sync with organisation_settings
            await supabase
                .from('organisation_settings')
                .upsert(
                    {
                        setting_key: 'payroll_ledger',
                        setting_value: JSON.stringify(updated),
                        setting_type: 'json',
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'setting_key' }
                );
        } catch (e) {
            console.error('Failed to sync payroll ledger:', e);
        }
    };

    // Save advances to Cloud
    const persistAdvancesList = async (updated: SalaryAdvanceRecord[]) => {
        setAdvancesList(updated);
        try {
            localStorage.setItem('alphaplus_advances_records', JSON.stringify(updated));

            await supabase
                .from('organisation_settings')
                .upsert(
                    {
                        setting_key: 'salary_advances_ledger',
                        setting_value: JSON.stringify(updated),
                        setting_type: 'json',
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'setting_key' }
                );
        } catch (e) {
            console.error('Failed to sync advances ledger:', e);
        }
    };

    // -------------------------------------------------------------
    // LIVE FETCH PENDING BILLS FOR SELECTED EMPLOYEE
    // -------------------------------------------------------------
    const fetchEmployeePendingBills = async (emp: UserEmployee) => {
        setIsLoadingBills(true);
        try {
            // Find pending sales matching waiter_name or customer_name or waiter_id
            const empNameLower = emp.name.toLowerCase().trim();
            const { data: salesRows, error } = await supabase
                .from('sales')
                .select('sale_id, receipt_no, sale_date, sale_time, total_amount, amount_paid, waiter_name, waiter_id, customer_name, status, table_name, room_name')
                .or('status.eq.Pending,status.eq.Unpaid,amount_paid.lt.total_amount');

            if (error || !salesRows) {
                setStaffPendingBills([]);
                setIsLoadingBills(false);
                return;
            }

            const matched = salesRows.filter((s) => {
                const wName = (s.waiter_name || '').toLowerCase();
                const cName = (s.customer_name || '').toLowerCase();
                const matchesId = s.waiter_id && Number(s.waiter_id) === emp.user_id;
                const matchesName = wName.includes(empNameLower) || empNameLower.includes(wName) || cName.includes(empNameLower);
                return matchesId || matchesName;
            });

            // Fetch line items for each matched sale
            const enriched: PendingStaffBill[] = await Promise.all(
                matched.map(async (sale) => {
                    const { data: items } = await supabase
                        .from('sales_items')
                        .select('item_id, product_name, quantity, unit_price, subtotal')
                        .eq('sale_id', sale.sale_id);

                    const balance = Math.max(0, Number(sale.total_amount || 0) - Number(sale.amount_paid || 0));

                    return {
                        sale_id: sale.sale_id,
                        receipt_no: sale.receipt_no || `RCP-${String(sale.sale_id).padStart(5, '0')}`,
                        sale_date: sale.sale_date || new Date().toISOString().split('T')[0],
                        sale_time: sale.sale_time || '',
                        waiter_name: sale.waiter_name || sale.customer_name || emp.name,
                        table_name: sale.table_name || sale.room_name || 'POS Station',
                        total_amount: Number(sale.total_amount || 0),
                        amount_paid: Number(sale.amount_paid || 0),
                        unpaid_balance: balance,
                        status: sale.status || 'Pending',
                        items: items || [],
                        selected_for_deduction: true, // auto-checked by default for Saturday payroll
                    };
                })
            );

            setStaffPendingBills(enriched);
        } catch (err) {
            console.error('Error fetching employee pending bills:', err);
            setStaffPendingBills([]);
        } finally {
            setIsLoadingBills(false);
        }
    };

    // -------------------------------------------------------------
    // HANDLE SELECT EMPLOYEE IN PAYROLL GENERATOR
    // -------------------------------------------------------------
    const handleSelectEmployeeForPayroll = async (empId: number) => {
        const emp = employees.find((e) => e.user_id === empId);
        if (!emp) {
            setGenForm((prev) => ({ ...prev, employee_id: 0, basic_salary: 0, salary_advance: 0 }));
            setStaffPendingBills([]);
            return;
        }

        // Basic salary derivation (if user is Monthly but weekly payroll selected, divide by 4)
        let basic = Number(emp.salary_amount || 0);
        if (payFrequency === 'Weekly' && emp.salary_type === 'Monthly') {
            basic = Math.round(basic / 4);
        } else if (payFrequency === 'Monthly' && emp.salary_type === 'Weekly') {
            basic = Math.round(basic * 4.333);
        }

        // Find active advances for this employee in the selected repayment period
        const matchedAdvances = advancesList.filter(
            (a) =>
                a.employee_id === empId &&
                a.status === 'Approved' &&
                (a.repayment_period === currentPayPeriod || a.repayment_period.startsWith(selectedMonth))
        );
        const totalAdvanceDue = matchedAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0);

        setGenForm((prev) => ({
            ...prev,
            employee_id: empId,
            basic_salary: basic,
            salary_advance: totalAdvanceDue,
        }));

        // Load pending house bills for this employee
        await fetchEmployeePendingBills(emp);
    };

    // -------------------------------------------------------------
    // LIVE CALCULATIONS IN MODAL
    // -------------------------------------------------------------
    const livePayrollCalc = useMemo(() => {
        const gross =
            Number(genForm.basic_salary || 0) +
            Number(genForm.allowances || 0) +
            Number(genForm.overtime || 0) +
            Number(genForm.bonuses || 0);

        const statutory = calculateKenyaPayroll({
            grossPay: gross,
            frequency: payFrequency,
        });

        // Sum selected pending bills
        const selectedBillsTotal = staffPendingBills
            .filter((b) => b.selected_for_deduction)
            .reduce((sum, b) => sum + b.unpaid_balance, 0);

        const totalDeductions =
            statutory.totalStatutory +
            Number(genForm.salary_advance || 0) +
            selectedBillsTotal +
            Number(genForm.other_deductions || 0);

        const netPay = Math.round(gross - totalDeductions);

        return {
            gross,
            ...statutory,
            selectedBillsTotal,
            totalDeductions,
            netPay,
        };
    }, [genForm, payFrequency, staffPendingBills]);

    // -------------------------------------------------------------
    // SAVE GENERATED PAYROLL ENTRY
    // -------------------------------------------------------------
    const handleSavePayrollEntry = async () => {
        if (!genForm.employee_id) {
            toast.error('Please select an employee first');
            return;
        }
        const emp = employees.find((e) => e.user_id === genForm.employee_id);
        if (!emp) return;

        setIsSaving(true);
        try {
            const payrollCode = `PAY-${selectedMonth.replace('-', '')}-${payFrequency === 'Weekly' ? `W${selectedWeek}` : 'M'}-${String(emp.user_id).padStart(4, '0')}`;
            const deductedBills = staffPendingBills.filter((b) => b.selected_for_deduction);

            const newEntry: PayrollRecord = {
                payroll_id: Date.now(),
                payroll_code: payrollCode,
                employee_id: emp.user_id,
                employee_name: emp.name,
                employee_code: emp.user_code || `EMP-${emp.user_id}`,
                national_id: emp.national_id || 'N/A',
                user_type: emp.user_type,
                pay_period: currentPayPeriod,
                pay_frequency: payFrequency,
                pay_date: new Date().toISOString().split('T')[0],

                basic_salary: Number(genForm.basic_salary || 0),
                allowances: Number(genForm.allowances || 0),
                overtime: Number(genForm.overtime || 0),
                bonuses: Number(genForm.bonuses || 0),
                gross_pay: livePayrollCalc.gross,

                nssf_tier1: livePayrollCalc.nssfTier1,
                nssf_tier2: livePayrollCalc.nssfTier2,
                nssf: livePayrollCalc.nssf,
                shif: livePayrollCalc.shif,
                housing_levy: livePayrollCalc.housingLevy,
                taxable_pay: livePayrollCalc.taxablePay,
                gross_paye: livePayrollCalc.grossPaye,
                personal_relief: livePayrollCalc.personalRelief,
                insurance_relief: livePayrollCalc.insuranceRelief,
                housing_relief: livePayrollCalc.housingRelief,
                paye: livePayrollCalc.paye,
                total_statutory: livePayrollCalc.totalStatutory,

                advances: Number(genForm.salary_advance || 0),
                staff_bills_deductions: livePayrollCalc.selectedBillsTotal,
                deducted_bills_json: deductedBills,
                other_deductions: Number(genForm.other_deductions || 0),
                total_deductions: livePayrollCalc.totalDeductions,

                net_pay: livePayrollCalc.netPay,
                status: 'Pending',
                notes: genForm.notes,
                created_at: new Date().toISOString(),
            };

            // Attempt native table insert
            try {
                await supabase.from('payroll').insert({
                    payroll_code: newEntry.payroll_code,
                    employee_id: newEntry.employee_id,
                    employee_name: newEntry.employee_name,
                    pay_period: newEntry.pay_period,
                    basic_salary: newEntry.basic_salary,
                    allowances: newEntry.allowances + newEntry.overtime + newEntry.bonuses,
                    deductions: newEntry.total_deductions,
                    advances: newEntry.advances,
                    paye: newEntry.paye,
                    nhif: newEntry.shif,
                    nssf: newEntry.nssf,
                    net_pay: newEntry.net_pay,
                    status: 'Pending',
                });
            } catch {
                // native table not present; fallback handled below
            }

            // Sync with memory and organisation_settings
            const filtered = payrollList.filter(
                (p) => !(p.employee_id === emp.user_id && p.pay_period === currentPayPeriod)
            );
            const updated = [newEntry, ...filtered];
            await persistPayrollList(updated);

            // Reconcile deducted bills in sales table (mark as Paid via Payroll)
            if (deductedBills.length > 0) {
                for (const bill of deductedBills) {
                    try {
                        await supabase
                            .from('sales')
                            .update({
                                status: 'Paid',
                                amount_paid: bill.total_amount,
                                payment_method: 'Payroll Deduction',
                                notes: `Deducted via ${currentPayPeriod} Saturday Payroll for ${emp.name}`,
                                paid_at: new Date().toISOString(),
                            })
                            .eq('sale_id', bill.sale_id);
                    } catch (err) {
                        console.error('Failed to update sale status:', err);
                    }
                }
            }

            // Update salary advances status if deducted
            if (newEntry.advances > 0) {
                const advUpdated = advancesList.map((a) => {
                    if (
                        a.employee_id === emp.user_id &&
                        a.status === 'Approved' &&
                        (a.repayment_period === currentPayPeriod || a.repayment_period.startsWith(selectedMonth))
                    ) {
                        return { ...a, status: 'Repaid' as const, repaid_date: new Date().toISOString().split('T')[0] };
                    }
                    return a;
                });
                await persistAdvancesList(advUpdated);
            }

            toast.success(
                `✅ Payroll generated for ${emp.name}! Net Pay: Ksh ${newEntry.net_pay.toLocaleString()}${deductedBills.length > 0 ? ` (${deductedBills.length} house bills deducted)` : ''}`
            );
            setShowGenerateModal(false);
            setGenForm({
                employee_id: 0,
                basic_salary: 0,
                allowances: 0,
                overtime: 0,
                bonuses: 0,
                salary_advance: 0,
                other_deductions: 0,
                notes: '',
            });
            setStaffPendingBills([]);
        } catch (error) {
            console.error('Error saving payroll:', error);
            toast.error('Failed to generate payroll entry');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // PROCESS / DISBURSE PAYMENT (Cash, M-Pesa, Bank)
    // -------------------------------------------------------------
    const handleDisbursePayment = async () => {
        if (!targetPaymentEntry) return;

        setIsSaving(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const updated = payrollList.map((p) => {
                if (p.payroll_id === targetPaymentEntry.payroll_id) {
                    return {
                        ...p,
                        status: 'Paid' as const,
                        payment_method: paymentForm.payment_method,
                        payment_ref: paymentForm.payment_ref || `TXN-${Date.now().toString().slice(-6)}`,
                        paid_date: today,
                        paid_by: paymentForm.paid_by,
                    };
                }
                return p;
            });

            await persistPayrollList(updated);

            // Try updating native payroll table
            try {
                await supabase
                    .from('payroll')
                    .update({ status: 'Paid', paid_date: today })
                    .eq('payroll_id', targetPaymentEntry.payroll_id);
            } catch {
                // handled by fallback
            }

            toast.success(
                `💵 Payment of Ksh ${targetPaymentEntry.net_pay.toLocaleString()} disbursed to ${targetPaymentEntry.employee_name} via ${paymentForm.payment_method}!`
            );
            setShowPaymentModal(false);
            setTargetPaymentEntry(null);
            setPaymentForm({ payment_method: 'Cash', payment_ref: '', paid_by: 'Management / Finance Desk' });
        } catch (e) {
            console.error('Disburse payment error:', e);
            toast.error('Could not complete payment disbursement');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // SALARY ADVANCE SUBMISSION
    // -------------------------------------------------------------
    const handleSaveAdvanceRequest = async () => {
        if (!advanceForm.employee_id) {
            toast.error('Select an employee for the advance');
            return;
        }
        if (Number(advanceForm.amount) <= 0) {
            toast.error('Enter a valid advance amount');
            return;
        }
        if (!advanceForm.reason.trim()) {
            toast.error('Enter a reason for the salary advance');
            return;
        }

        const emp = employees.find((e) => e.user_id === advanceForm.employee_id);
        if (!emp) return;

        setIsSaving(true);
        try {
            const newAdv: SalaryAdvanceRecord = {
                advance_id: Date.now(),
                advance_code: `ADV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
                employee_id: emp.user_id,
                employee_name: emp.name,
                advance_date: new Date().toISOString().split('T')[0],
                amount: Number(advanceForm.amount),
                reason: advanceForm.reason,
                repayment_period: `${advanceForm.repayment_month}-W${advanceForm.repayment_week}`,
                status: 'Approved',
                approved_by: 'General Manager / Hotel Director',
                created_at: new Date().toISOString(),
            };

            // Attempt native table insert
            try {
                await supabase.from('salary_advances').insert({
                    employee_id: newAdv.employee_id,
                    employee_name: newAdv.employee_name,
                    advance_date: newAdv.advance_date,
                    amount: newAdv.amount,
                    reason: newAdv.reason,
                    status: newAdv.status,
                    approved_by: newAdv.approved_by,
                    repayment_date: newAdv.repayment_period,
                });
            } catch {
                // handled by fallback
            }

            const updated = [newAdv, ...advancesList];
            await persistAdvancesList(updated);

            toast.success(`✅ Salary Advance of Ksh ${newAdv.amount.toLocaleString()} approved for ${emp.name}!`);
            setShowAdvanceModal(false);
            setAdvanceForm({
                employee_id: 0,
                amount: 0,
                reason: '',
                repayment_month: new Date().toISOString().slice(0, 7),
                repayment_week: getCurrentWeekOfMonth(),
            });
        } catch (e) {
            console.error('Advance save error:', e);
            toast.error('Failed to save salary advance');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // UPDATE EMPLOYEE WAGE RATE DIRECTLY TO SUPABASE USERS TABLE
    // -------------------------------------------------------------
    const handleUpdateEmployeeWage = async () => {
        if (!selectedEmployeeForWage) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('users')
                .update({
                    salary_amount: Number(wageForm.salary_amount),
                    salary_type: wageForm.salary_type,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', selectedEmployeeForWage.user_id);

            if (error) throw error;

            setEmployees((prev) =>
                prev.map((u) =>
                    u.user_id === selectedEmployeeForWage.user_id
                        ? { ...u, salary_amount: Number(wageForm.salary_amount), salary_type: wageForm.salary_type }
                        : u
                )
            );

            toast.success(`✅ Wage rate updated for ${selectedEmployeeForWage.name}!`);
            setShowEditWageModal(false);
            setSelectedEmployeeForWage(null);
        } catch (e) {
            console.error('Failed to update employee wage:', e);
            toast.error('Could not update employee rate in users table');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // THERMAL ESC/POS PAYSLIP RECEIPT PRINTER (58mm / 80mm)
    // -------------------------------------------------------------
    const handlePrintThermalPayslip = (entry: PayrollRecord) => {
        const deductedBills = entry.deducted_bills_json || [];

        const printContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>Payroll Slip - ${entry.employee_name}</title>
    <style>
        @page { size: 80mm auto; margin: 0; }
        body {
            font-family: monospace;
            width: 76mm;
            margin: 0 auto;
            padding: 8px 6px;
            color: #000;
            background: #fff;
            font-size: 11px;
            line-height: 1.35;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .double-divider { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .title { font-size: 13px; font-weight: bold; margin-bottom: 2px; }
        .badge { background: #eee; padding: 2px 4px; font-size: 10px; display: inline-block; }
        .bill-box { background: #fafafa; border: 1px dotted #888; padding: 4px; margin: 4px 0; font-size: 10px; }
        .net-box { border: 2px solid #000; padding: 6px 4px; margin: 8px 0; font-size: 13px; }
        .sig-space { height: 28px; border-bottom: 1px dotted #000; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="text-center">
        <div class="title">${hotelInfo.name.toUpperCase()}</div>
        <div>HOSPITALITY PAYROLL & REMITTANCE SLIP</div>
        <div>KRA PIN: ${hotelInfo.pin} | TEL: ${hotelInfo.phone}</div>
        <div class="divider"></div>
        <div class="bold">📋 ${entry.pay_frequency.toUpperCase()} SALARY PAYSLIP</div>
        <div class="badge">PERIOD: ${entry.pay_period} | DATE: ${entry.pay_date}</div>
    </div>

    <div class="divider"></div>
    <div class="row"><span>VOUCHER CODE:</span><span class="bold">${entry.payroll_code}</span></div>
    <div class="row"><span>STAFF NAME:</span><span class="bold">${entry.employee_name.toUpperCase()}</span></div>
    <div class="row"><span>EMP CODE / ID:</span><span>${entry.employee_code || 'N/A'} (NAT: ${entry.national_id || 'N/A'})</span></div>
    <div class="row"><span>DESIGNATION:</span><span>${entry.user_type || 'Hotel Staff'}</span></div>
    <div class="row"><span>PAY FREQUENCY:</span><span class="bold">${entry.pay_frequency}</span></div>

    <div class="divider"></div>
    <div class="bold text-center">💵 EARNINGS & REMUNERATION</div>
    <div class="row"><span>Basic Salary:</span><span>Ksh ${entry.basic_salary.toLocaleString()}</span></div>
    ${entry.allowances > 0 ? `<div class="row"><span>Allowances:</span><span>Ksh ${entry.allowances.toLocaleString()}</span></div>` : ''}
    ${entry.overtime > 0 ? `<div class="row"><span>Overtime Pay:</span><span>Ksh ${entry.overtime.toLocaleString()}</span></div>` : ''}
    ${entry.bonuses > 0 ? `<div class="row"><span>Service Charge / Bonus:</span><span>Ksh ${entry.bonuses.toLocaleString()}</span></div>` : ''}
    <div class="divider"></div>
    <div class="row bold"><span>GROSS EMOLUMENTS:</span><span>Ksh ${entry.gross_pay.toLocaleString()}</span></div>

    <div class="divider"></div>
    <div class="bold text-center">🏛️ STATUTORY DEDUCTIONS (KENYA)</div>
    <div class="row"><span>NSSF (Tier I & II):</span><span>Ksh ${entry.nssf.toLocaleString()}</span></div>
    <div class="row"><span>SHIF (Health 2.75%):</span><span>Ksh ${entry.shif.toLocaleString()}</span></div>
    <div class="row"><span>Housing Levy (AHL 1.5%):</span><span>Ksh ${entry.housing_levy.toLocaleString()}</span></div>
    <div class="row"><span>PAYE (Net Income Tax):</span><span>Ksh ${entry.paye.toLocaleString()}</span></div>
    <div class="row bold"><span>Total Statutory:</span><span>Ksh ${entry.total_statutory.toLocaleString()}</span></div>

    ${
        entry.advances > 0 || entry.staff_bills_deductions > 0 || entry.other_deductions > 0
            ? `
    <div class="divider"></div>
    <div class="bold text-center">🧾 OPERATIONAL DEDUCTIONS</div>
    ${entry.advances > 0 ? `<div class="row"><span>Salary Advance Loan:</span><span>Ksh ${entry.advances.toLocaleString()}</span></div>` : ''}
    ${
        entry.staff_bills_deductions > 0
            ? `
    <div class="row bold"><span>Saturday Pending Tabs:</span><span>Ksh ${entry.staff_bills_deductions.toLocaleString()}</span></div>
    <div class="bill-box">
        <div class="bold">DEDUCTED PENDING RECEIPT(S):</div>
        ${deductedBills
            .map(
                (b) => `
            <div>• ${b.receipt_no} (${b.sale_date}): Ksh ${b.unpaid_balance.toLocaleString()}
            ${
                b.items && b.items.length
                    ? `<div style="font-size:9px;color:#444;margin-left:6px;">Items: ${b.items.map((it) => `${it.quantity}x ${it.product_name}`).join(', ')}</div>`
                    : ''
            }
            </div>
        `
            )
            .join('')}
    </div>
    `
            : ''
    }
    ${entry.other_deductions > 0 ? `<div class="row"><span>Other Deductions:</span><span>Ksh ${entry.other_deductions.toLocaleString()}</span></div>` : ''}
    <div class="row bold"><span>Total Deductions:</span><span>Ksh ${entry.total_deductions.toLocaleString()}</span></div>
    `
            : ''
    }

    <div class="net-box text-center">
        <div style="font-size:10px;">TAKE HOME DISBURSEMENT</div>
        <div class="bold" style="font-size:16px;">NET PAY: Ksh ${entry.net_pay.toLocaleString()}</div>
        <div style="font-size:10px;margin-top:2px;">STATUS: ${entry.status.toUpperCase()} ${entry.payment_method ? `(${entry.payment_method.toUpperCase()})` : ''}</div>
    </div>

    <div style="font-size:10px;margin-top:12px;">
        <div class="row"><span>Employee Acknowledgment:</span><span>Manager Verification:</span></div>
        <div class="row">
            <div style="width:48%;" class="sig-space"></div>
            <div style="width:48%;" class="sig-space"></div>
        </div>
        <div class="row" style="margin-top:4px;color:#555;">
            <span>Signature & Date</span>
            <span>Alpha Plus Finance Stamp</span>
        </div>
    </div>

    <div class="divider"></div>
    <div class="text-center" style="font-size:9px;color:#666;">
        Generated on ${new Date().toLocaleString()} • Electronic Payroll Record
    </div>
</body>
</html>
        `;

        const printWindow = window.open('', '_blank', 'width=420,height=680');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.print();
            }, 300);
        }
    };

    // -------------------------------------------------------------
    // PRINT FORMAL KRA P9A CERTIFICATE (Annual Tax Card)
    // -------------------------------------------------------------
    const handlePrintP9Card = (emp: UserEmployee, year: number) => {
        const monthlyBase = Number(emp.salary_amount || 0);

        // Generate 12 months data
        const monthNames = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ];

        const rows = monthNames.map((m, idx) => {
            const tax = calculateKenyaPayroll({ grossPay: monthlyBase, frequency: 'Monthly' });
            return {
                month: m,
                monthNum: idx + 1,
                basic: monthlyBase,
                benefits: 0,
                quarters: 0,
                gross: monthlyBase,
                nssfActual: tax.nssf,
                stdLimit: 20000,
                allowableNssf: tax.nssf,
                taxablePay: tax.taxablePay,
                taxCharged: tax.grossPaye,
                personalRelief: tax.personalRelief,
                insuranceRelief: tax.insuranceRelief,
                totalRelief: tax.personalRelief + tax.insuranceRelief,
                paye: tax.paye,
            };
        });

        const totals = rows.reduce(
            (acc, r) => ({
                basic: acc.basic + r.basic,
                gross: acc.gross + r.gross,
                nssfActual: acc.nssfActual + r.nssfActual,
                taxablePay: acc.taxablePay + r.taxablePay,
                taxCharged: acc.taxCharged + r.taxCharged,
                personalRelief: acc.personalRelief + r.personalRelief,
                insuranceRelief: acc.insuranceRelief + r.insuranceRelief,
                paye: acc.paye + r.paye,
            }),
            { basic: 0, gross: 0, nssfActual: 0, taxablePay: 0, taxCharged: 0, personalRelief: 0, insuranceRelief: 0, paye: 0 }
        );

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>KRA P9A - ${emp.name} (${year})</title>
    <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: sans-serif; font-size: 10px; color: #111; margin: 0; padding: 10px; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9px; }
        th, td { border: 1px solid #444; padding: 4px 5px; }
        th { background: #f3f4f6; font-weight: bold; }
        .header-box { border: 1px solid #000; padding: 8px; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; }
        .kra-title { font-size: 13px; font-weight: bold; margin-bottom: 3px; }
    </style>
</head>
<body>
    <div class="header-box">
        <div class="row">
            <div>
                <div class="kra-title">KENYA REVENUE AUTHORITY — DOMESTIC TAXES DEPARTMENT</div>
                <div class="bold">TAX DEDUCTION CARD P.9A (YEAR ${year})</div>
            </div>
            <div class="text-right">
                <div>Employer PIN: <b>${hotelInfo.pin}</b></div>
                <div>Employer Name: <b>${hotelInfo.name}</b></div>
            </div>
        </div>
        <hr style="margin: 6px 0; border: 0; border-top: 1px solid #ccc;"/>
        <div class="row">
            <div>Employee Name: <b>${emp.name}</b></div>
            <div>Employee KRA PIN / ID: <b>${emp.national_id || 'A00' + emp.user_id + '987K'}</b></div>
            <div>Employee Code: <b>${emp.user_code || 'EMP-' + emp.user_id}</b></div>
            <div>Payroll Frequency: <b>${emp.salary_type}</b></div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Month</th>
                <th>Basic Salary<br/>(A)</th>
                <th>Benefits<br/>(B)</th>
                <th>Quarters<br/>(C)</th>
                <th>Total Gross<br/>(D=A+B+C)</th>
                <th>Defined Contrib.<br/>(E1) NSSF</th>
                <th>Standard Limit<br/>(E2) 20,000</th>
                <th>Allowable Contrib.<br/>(E3) Min(E1,E2)</th>
                <th>Taxable Pay<br/>(H = D - E3)</th>
                <th>Tax Charged<br/>(J)</th>
                <th>Monthly Personal Relief<br/>(K1)</th>
                <th>Insurance Relief<br/>(K2)</th>
                <th>PAYE Tax Deducted<br/>(L = J - K1 - K2)</th>
            </tr>
        </thead>
        <tbody>
            ${rows
                .map(
                    (r) => `
                <tr>
                    <td class="bold">${r.month}</td>
                    <td class="text-right">${r.basic.toLocaleString()}</td>
                    <td class="text-right">${r.benefits.toLocaleString()}</td>
                    <td class="text-right">${r.quarters.toLocaleString()}</td>
                    <td class="text-right bold">${r.gross.toLocaleString()}</td>
                    <td class="text-right">${r.nssfActual.toLocaleString()}</td>
                    <td class="text-right">20,000</td>
                    <td class="text-right">${r.allowableNssf.toLocaleString()}</td>
                    <td class="text-right bold">${r.taxablePay.toLocaleString()}</td>
                    <td class="text-right">${r.taxCharged.toLocaleString()}</td>
                    <td class="text-right">${r.personalRelief.toLocaleString()}</td>
                    <td class="text-right">${r.insuranceRelief.toLocaleString()}</td>
                    <td class="text-right bold">${r.paye.toLocaleString()}</td>
                </tr>
            `
                )
                .join('')}
        </tbody>
        <tfoot>
            <tr style="background:#e5e7eb;font-weight:bold;">
                <td>TOTALS</td>
                <td class="text-right">${totals.basic.toLocaleString()}</td>
                <td class="text-right">0</td>
                <td class="text-right">0</td>
                <td class="text-right">${totals.gross.toLocaleString()}</td>
                <td class="text-right">${totals.nssfActual.toLocaleString()}</td>
                <td class="text-right">240,000</td>
                <td class="text-right">${totals.nssfActual.toLocaleString()}</td>
                <td class="text-right">${totals.taxablePay.toLocaleString()}</td>
                <td class="text-right">${totals.taxCharged.toLocaleString()}</td>
                <td class="text-right">${totals.personalRelief.toLocaleString()}</td>
                <td class="text-right">${totals.insuranceRelief.toLocaleString()}</td>
                <td class="text-right" style="font-size:11px;">Ksh ${totals.paye.toLocaleString()}</td>
            </tr>
        </tfoot>
    </table>

    <div style="margin-top:14px;display:flex;justify-content:space-between;font-size:9px;">
        <div style="width:60%;">
            <p>I / We certify that the particulars entered above are correct and that the total tax charged has been fully deducted and remitted under the Pay As You Earn (PAYE) rules of Kenya.</p>
            <p><b>Name of Employer:</b> ${hotelInfo.name} &nbsp;&nbsp;&nbsp;&nbsp; <b>Authorized Signature:</b> ___________________________</p>
        </div>
        <div style="width:30%;border:1px dashed #666;height:65px;display:flex;align-items:center;justify-content:center;color:#666;">
            Official Company / Hotel Stamp
        </div>
    </div>
</body>
</html>
        `;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
            setTimeout(() => win.print(), 300);
        }
    };

    // -------------------------------------------------------------
    // EXPORT PAYROLL REGISTRATION AS CSV
    // -------------------------------------------------------------
    const handleExportPayrollCSV = () => {
        if (filteredPayroll.length === 0) {
            toast.error('No payroll entries to export for this period');
            return;
        }

        const headers = [
            'Payroll Code',
            'Employee Name',
            'Designation',
            'Period',
            'Frequency',
            'Basic Salary',
            'Allowances',
            'Gross Pay',
            'NSSF',
            'SHIF',
            'Housing Levy',
            'PAYE',
            'Total Statutory',
            'Advances',
            'Staff Bills Deducted',
            'Total Deductions',
            'Net Pay',
            'Status',
            'Payment Method',
            'Paid Date',
        ];

        const rows = filteredPayroll.map((p) => [
            p.payroll_code,
            `"${p.employee_name}"`,
            `"${p.user_type || 'Staff'}"`,
            p.pay_period,
            p.pay_frequency,
            p.basic_salary,
            p.allowances,
            p.gross_pay,
            p.nssf,
            p.shif,
            p.housing_levy,
            p.paye,
            p.total_statutory,
            p.advances,
            p.staff_bills_deductions,
            p.total_deductions,
            p.net_pay,
            p.status,
            p.payment_method || 'Pending',
            p.paid_date || '',
        ]);

        const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `AlphaPlus_Payroll_${currentPayPeriod}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filteredPayroll.length} payroll entries to CSV!`);
    };

    // -------------------------------------------------------------
    // FILTERED VIEWS
    // -------------------------------------------------------------
    const filteredPayroll = useMemo(() => {
        return payrollList.filter((p) => {
            const matchesPeriod = p.pay_period === currentPayPeriod || (payFrequency === 'Monthly' && p.pay_period.startsWith(selectedMonth));
            const matchesSearch =
                p.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.payroll_code.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'All' ? true : p.status === statusFilter;
            return matchesPeriod && matchesSearch && matchesStatus;
        });
    }, [payrollList, currentPayPeriod, payFrequency, selectedMonth, searchQuery, statusFilter]);

    // KPI Aggregations for current period
    const kpis = useMemo(() => {
        const totalGross = filteredPayroll.reduce((sum, p) => sum + Number(p.gross_pay || 0), 0);
        const totalNet = filteredPayroll.reduce((sum, p) => sum + Number(p.net_pay || 0), 0);
        const totalStatutory = filteredPayroll.reduce((sum, p) => sum + Number(p.total_statutory || 0), 0);
        const totalBillsDeducted = filteredPayroll.reduce((sum, p) => sum + Number(p.staff_bills_deductions || 0), 0);
        const paidCount = filteredPayroll.filter((p) => p.status === 'Paid').length;
        const pendingCount = filteredPayroll.filter((p) => p.status === 'Pending').length;

        return {
            totalGross,
            totalNet,
            totalStatutory,
            totalBillsDeducted,
            paidCount,
            pendingCount,
            totalCount: filteredPayroll.length,
        };
    }, [filteredPayroll]);

    // -------------------------------------------------------------
    // RENDER MAIN COMPONENT
    // -------------------------------------------------------------
    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
            {/* Header Banner */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 flex-shrink-0">
                            <span className="text-2xl">💰</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                                    Kenya Hotel Payroll & Statutory Tax System
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    KRA 2024/2026 Compliant
                                </span>
                                {isTodaySaturday && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                        ⚡ Saturday Weekly Pay Run Active
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Automated PAYE, SHIF (2.75%), NSSF Tier I/II, Affordable Housing Levy (1.5%), Saturday Staff House Bills Auto-Deduction & KRA P9 Tax Cards.
                            </p>
                        </div>
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setShowCalculatorModal(true)}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <span>🧮</span>
                            <span>Kenya Tax Calc</span>
                        </button>
                        <button
                            onClick={() => setShowAdvanceModal(true)}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <span>💸</span>
                            <span>New Advance</span>
                        </button>
                        <button
                            onClick={() => setShowGenerateModal(true)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 transition-all shadow-md shadow-indigo-200 flex items-center gap-1.5"
                        >
                            <span>+</span>
                            <span>Generate {payFrequency} Payroll</span>
                        </button>
                        <button
                            onClick={fetchAllData}
                            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                            title="Refresh Data"
                        >
                            🔄
                        </button>
                    </div>
                </div>

                {/* Period Selector Strip */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Frequency Switcher */}
                        <div className="flex p-0.5 bg-slate-100 rounded-xl border border-slate-200">
                            <button
                                onClick={() => setPayFrequency('Weekly')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    payFrequency === 'Weekly'
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                📅 Weekly (Saturday Cycle)
                            </button>
                            <button
                                onClick={() => setPayFrequency('Monthly')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    payFrequency === 'Monthly'
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                🗓️ Monthly Salary
                            </button>
                        </div>

                        {/* Month Picker */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-500">Month:</span>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => {
                                    setSelectedMonth(e.target.value);
                                    setSelectedWeek(1);
                                }}
                                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>

                        {/* Week Selector (if Weekly) */}
                        {payFrequency === 'Weekly' && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-slate-500">Week:</span>
                                <select
                                    value={selectedWeek}
                                    onChange={(e) => setSelectedWeek(Number(e.target.value))}
                                    className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {Array.from({ length: getWeeksInMonth(selectedMonth) }, (_, i) => i + 1).map((w) => {
                                        const { start, end, saturday } = getWeekDates(selectedMonth, w);
                                        const sStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                        const eStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                        const satStr = saturday.toLocaleDateString('en-US', { day: 'numeric' });
                                        return (
                                            <option key={w} value={w}>
                                                Week {w} ({sStr} - {eStr}) • Pay: Sat {satStr}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Active Pay Period Pill */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Selected Ledger Period:</span>
                        <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {currentPayPeriod}
                        </span>
                    </div>
                </div>
            </div>

            {/* Executive KPI Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Active Staff</span>
                        <span className="text-base">👥</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 mt-1 font-mono">{employees.length}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Hotel Users Table</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Gross Payroll</span>
                        <span className="text-base">💵</span>
                    </div>
                    <p className="text-xl font-bold text-slate-800 mt-1 font-mono">
                        Ksh {kpis.totalGross.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Emoluments Total</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Kenya Taxes</span>
                        <span className="text-base">🏛️</span>
                    </div>
                    <p className="text-xl font-bold text-indigo-600 mt-1 font-mono">
                        Ksh {kpis.totalStatutory.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">PAYE, SHIF, NSSF, AHL</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">House Tabs Deducted</span>
                        <span className="text-base">🧾</span>
                    </div>
                    <p className="text-xl font-bold text-rose-600 mt-1 font-mono">
                        Ksh {kpis.totalBillsDeducted.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-rose-500 mt-0.5">Saturday Pending Bills</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Net Disbursed</span>
                        <span className="text-base">💰</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-600 mt-1 font-mono">
                        Ksh {kpis.totalNet.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Total Take-Home Pay</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Disbursement</span>
                        <span className="text-base">📊</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-bold text-emerald-600">✅ {kpis.paidCount}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-xs font-bold text-amber-600">⏳ {kpis.pendingCount}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                        {kpis.totalCount > 0
                            ? `${Math.round((kpis.paidCount / kpis.totalCount) * 100)}% Settled`
                            : 'No entries'}
                    </p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-1">
                {[
                    { id: 'payroll', label: '📋 Payroll Register & Payslips', count: filteredPayroll.length },
                    { id: 'employees', label: '👥 Staff & Wage Rates', count: employees.length },
                    { id: 'advances', label: '💸 Salary Advances Desk', count: advancesList.length },
                    { id: 'staff_bills', label: '🧾 Staff Pending House Bills', count: allPendingSales.length },
                    { id: 'tax_reports', label: '🏛️ Statutory Tax Returns' },
                    { id: 'p9', label: '📜 KRA P9 Deduction Cards' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2.5 rounded-t-xl text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                            activeTab === tab.id
                                ? 'border-indigo-600 text-indigo-700 bg-white shadow-sm'
                                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700">
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: PAYROLL REGISTER TABLE & ACTIONS */}
            {/* ========================================================================= */}
            {activeTab === 'payroll' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    {/* Filter bar */}
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                        <div className="flex items-center gap-2 flex-1 max-w-md">
                            <span className="text-slate-400">🔍</span>
                            <input
                                type="text"
                                placeholder="Search by staff name or payroll code..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl bg-white outline-none"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Pending">Pending Disbursement</option>
                                <option value="Paid">Disbursed / Paid</option>
                            </select>

                            <button
                                onClick={handleExportPayrollCSV}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-sm"
                            >
                                <span>📥</span>
                                <span>Export CSV</span>
                            </button>
                        </div>
                    </div>

                    {/* Datagrid Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                    <th className="py-3 px-4">Code / Period</th>
                                    <th className="py-3 px-4">Staff Member</th>
                                    <th className="py-3 px-4 text-right">Basic Pay</th>
                                    <th className="py-3 px-4 text-right">Allowances</th>
                                    <th className="py-3 px-4 text-right">Gross Pay</th>
                                    <th className="py-3 px-4 text-right">Statutory Taxes</th>
                                    <th className="py-3 px-4 text-right">Advances</th>
                                    <th className="py-3 px-4 text-right">Staff Tabs</th>
                                    <th className="py-3 px-4 text-right font-bold text-slate-800">Net Take-Home</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                    <th className="py-3 px-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={11} className="py-12 text-center text-slate-400">
                                            Loading payroll records from database...
                                        </td>
                                    </tr>
                                ) : filteredPayroll.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="py-16 text-center">
                                            <p className="text-3xl mb-2">📋</p>
                                            <p className="text-sm font-semibold text-slate-700">
                                                No payroll entries found for period: {currentPayPeriod}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">
                                                Click "+ Generate {payFrequency} Payroll" to run the Kenya statutory calculator for staff.
                                            </p>
                                            <button
                                                onClick={() => setShowGenerateModal(true)}
                                                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                                            >
                                                + Generate Payroll Now
                                            </button>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredPayroll.map((entry) => {
                                        return (
                                            <tr key={entry.payroll_id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="py-3 px-4">
                                                    <div className="font-mono font-bold text-indigo-700">{entry.payroll_code}</div>
                                                    <div className="text-[10px] text-slate-400">{entry.pay_period} ({entry.pay_frequency})</div>
                                                </td>

                                                <td className="py-3 px-4">
                                                    <div className="font-bold text-slate-800">{entry.employee_name}</div>
                                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px]">
                                                            {entry.user_type || 'Staff'}
                                                        </span>
                                                        <span>• ID: {entry.national_id || 'N/A'}</span>
                                                    </div>
                                                </td>

                                                <td className="py-3 px-4 text-right font-mono">
                                                    Ksh {entry.basic_salary.toLocaleString()}
                                                </td>

                                                <td className="py-3 px-4 text-right font-mono text-slate-600">
                                                    {entry.allowances + entry.overtime + entry.bonuses > 0
                                                        ? `Ksh ${(entry.allowances + entry.overtime + entry.bonuses).toLocaleString()}`
                                                        : '—'}
                                                </td>

                                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                                                    Ksh {entry.gross_pay.toLocaleString()}
                                                </td>

                                                <td className="py-3 px-4 text-right">
                                                    <div className="font-mono text-indigo-700 font-semibold">
                                                        Ksh {entry.total_statutory.toLocaleString()}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        P:{entry.paye} S:{entry.shif} N:{entry.nssf}
                                                    </div>
                                                </td>

                                                <td className="py-3 px-4 text-right font-mono text-amber-700">
                                                    {entry.advances > 0 ? `Ksh ${entry.advances.toLocaleString()}` : '—'}
                                                </td>

                                                <td className="py-3 px-4 text-right">
                                                    {entry.staff_bills_deductions > 0 ? (
                                                        <div>
                                                            <span className="font-mono text-rose-700 font-bold">
                                                                Ksh {entry.staff_bills_deductions.toLocaleString()}
                                                            </span>
                                                            <div className="text-[10px] text-rose-500">
                                                                {entry.deducted_bills_json?.length || 1} bill(s) deducted
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>

                                                <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                                                    Ksh {entry.net_pay.toLocaleString()}
                                                </td>

                                                <td className="py-3 px-4 text-center">
                                                    <span
                                                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                                                            entry.status === 'Paid'
                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                        }`}
                                                    >
                                                        {entry.status === 'Paid' ? '✅ Paid' : '⏳ Pending'}
                                                    </span>
                                                    {entry.payment_method && entry.status === 'Paid' && (
                                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                                            {entry.payment_method}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="py-3 px-4 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {entry.status !== 'Paid' && (
                                                            <button
                                                                onClick={() => {
                                                                    setTargetPaymentEntry(entry);
                                                                    setShowPaymentModal(true);
                                                                }}
                                                                className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                                                                title="Disburse / Settle Payment"
                                                            >
                                                                💵 Pay
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => handlePrintThermalPayslip(entry)}
                                                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                                                            title="Print ESC/POS 80mm Thermal Payslip"
                                                        >
                                                            🖨️
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                const emp = employees.find((e) => e.user_id === entry.employee_id);
                                                                if (emp) handlePrintP9Card(emp, new Date().getFullYear());
                                                            }}
                                                            className="p-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                                            title="View KRA P9 Deduction Card"
                                                        >
                                                            📜
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
            )}

            {/* ========================================================================= */}
            {/* TAB 2: EMPLOYEES & WAGE RATES FROM USERS TABLE */}
            {/* ========================================================================= */}
            {activeTab === 'employees' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">
                                👥 Hotel Staff Master & Salary Configurations (Users Table)
                            </h3>
                            <p className="text-xs text-slate-500">
                                Direct integration with PostgreSQL users database. Adjust basic wages and salary basis per staff member.
                            </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {employees.length} Active Employees
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                    <th className="py-3 px-4">Staff Member</th>
                                    <th className="py-3 px-4">Designation</th>
                                    <th className="py-3 px-4">National ID / Phone</th>
                                    <th className="py-3 px-4">Salary Basis</th>
                                    <th className="py-3 px-4 text-right">Defined Wage Rate</th>
                                    <th className="py-3 px-4 text-right">Weekly Pro-Rated</th>
                                    <th className="py-3 px-4 text-center">Pending Tabs</th>
                                    <th className="py-3 px-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {employees.map((emp) => {
                                    const amount = Number(emp.salary_amount || 0);
                                    const weeklyVal = emp.salary_type === 'Monthly' ? Math.round(amount / 4) : amount;

                                    // Check if this employee has pending house bills
                                    const empBills = allPendingSales.filter((s) => {
                                        const wName = (s.waiter_name || '').toLowerCase();
                                        const eName = emp.name.toLowerCase();
                                        return wName.includes(eName) || eName.includes(wName);
                                    });
                                    const pendingBillsTotal = empBills.reduce((sum, b) => sum + b.unpaid_balance, 0);

                                    return (
                                        <tr key={emp.user_id} className="hover:bg-slate-50/60">
                                            <td className="py-3 px-4">
                                                <div className="font-bold text-slate-800">{emp.name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">
                                                    {emp.user_code || `EMP-${emp.user_id}`} • username: @{emp.user_name}
                                                </div>
                                            </td>

                                            <td className="py-3 px-4">
                                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                                                    {emp.user_type || 'Staff'}
                                                </span>
                                            </td>

                                            <td className="py-3 px-4 text-slate-600">
                                                <div>ID: {emp.national_id || 'Not Set'}</div>
                                                <div className="text-[10px] text-slate-400">{emp.phone || 'No phone'}</div>
                                            </td>

                                            <td className="py-3 px-4">
                                                <span
                                                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                                                        emp.salary_type === 'Weekly'
                                                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                                                    }`}
                                                >
                                                    {emp.salary_type || 'Monthly'}
                                                </span>
                                            </td>

                                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                                                Ksh {amount.toLocaleString()}
                                            </td>

                                            <td className="py-3 px-4 text-right font-mono text-emerald-700">
                                                Ksh {weeklyVal.toLocaleString()} / wk
                                            </td>

                                            <td className="py-3 px-4 text-center">
                                                {pendingBillsTotal > 0 ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                        ⚠️ {empBills.length} tabs (Ksh {pendingBillsTotal.toLocaleString()})
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 text-xs">Clear</span>
                                                )}
                                            </td>

                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedEmployeeForWage(emp);
                                                            setWageForm({
                                                                salary_amount: Number(emp.salary_amount || 0),
                                                                salary_type: emp.salary_type || 'Weekly',
                                                            });
                                                            setShowEditWageModal(true);
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-100 text-slate-700"
                                                    >
                                                        ✏️ Edit Wage
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowGenerateModal(true);
                                                            handleSelectEmployeeForPayroll(emp.user_id);
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                                    >
                                                        ⚡ Run Pay
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: SALARY ADVANCES WORKSTATION */}
            {/* ========================================================================= */}
            {activeTab === 'advances' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">
                                💸 Staff Salary Advances & Micro-Loans Desk
                            </h3>
                            <p className="text-xs text-slate-500">
                                Advances approved here are automatically detected and deducted during weekly/monthly payroll generation.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowAdvanceModal(true)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-sm flex items-center gap-1"
                        >
                            <span>+</span>
                            <span>Issue New Advance</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                    <th className="py-3 px-4">Advance Code</th>
                                    <th className="py-3 px-4">Staff Member</th>
                                    <th className="py-3 px-4">Date Issued</th>
                                    <th className="py-3 px-4 text-right">Amount</th>
                                    <th className="py-3 px-4">Reason / Notes</th>
                                    <th className="py-3 px-4">Target Repayment Period</th>
                                    <th className="py-3 px-4">Authorized By</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {advancesList.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            No salary advances recorded.
                                        </td>
                                    </tr>
                                ) : (
                                    advancesList.map((adv) => (
                                        <tr key={adv.advance_id} className="hover:bg-slate-50/60">
                                            <td className="py-3 px-4 font-mono font-bold text-amber-700">
                                                {adv.advance_code}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-800">
                                                {adv.employee_name}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 font-mono">
                                                {adv.advance_date}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 text-sm">
                                                Ksh {adv.amount.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                                                {adv.reason}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-indigo-700">
                                                {adv.repayment_period}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500">
                                                {adv.approved_by}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        adv.status === 'Repaid'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : adv.status === 'Approved'
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                >
                                                    {adv.status === 'Repaid' ? '✅ Deducted / Repaid' : '⏳ Pending Deduction'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: SATURDAY PENDING HOUSE BILLS & STAFF TABS */}
            {/* ========================================================================= */}
            {activeTab === 'staff_bills' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-amber-50/40">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xl">🧾</span>
                                <h3 className="font-bold text-slate-800 text-sm">
                                    Hotel Staff Pending Bills & Unpaid Tabs Ledger (Live Sales DB)
                                </h3>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                    Saturday Auto-Deduction Engine
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Waiters and hotel staff with open bills or uncollected receipts on Saturday have their unpaid balance listed here for salary deduction.
                            </p>
                        </div>
                        <button
                            onClick={fetchAllData}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
                        >
                            🔄 Re-scan Sales Ledger
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                    <th className="py-3 px-4">Receipt No</th>
                                    <th className="py-3 px-4">Date / Time</th>
                                    <th className="py-3 px-4">Waiter / Staff Name</th>
                                    <th className="py-3 px-4">Station / Table</th>
                                    <th className="py-3 px-4 text-right">Bill Total</th>
                                    <th className="py-3 px-4 text-right">Paid</th>
                                    <th className="py-3 px-4 text-right font-bold text-rose-700">Unpaid Balance</th>
                                    <th className="py-3 px-4 text-center">Payroll Settlement</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {allPendingSales.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            🎉 Excellent! No pending or unpaid staff bills detected across the sales ledger.
                                        </td>
                                    </tr>
                                ) : (
                                    allPendingSales.map((b) => (
                                        <tr key={b.sale_id} className="hover:bg-slate-50/60">
                                            <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                                                {b.receipt_no}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 font-mono">
                                                {b.sale_date} {b.sale_time}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-800">
                                                {b.waiter_name}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500">
                                                {b.table_name}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-slate-700">
                                                Ksh {b.total_amount.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-slate-500">
                                                Ksh {b.amount_paid.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-bold text-rose-700 text-sm">
                                                Ksh {b.unpaid_balance.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <button
                                                    onClick={() => {
                                                        const matchedUser = employees.find(
                                                            (u) =>
                                                                u.name.toLowerCase().includes((b.waiter_name || '').toLowerCase()) ||
                                                                (b.waiter_name || '').toLowerCase().includes(u.name.toLowerCase())
                                                        );
                                                        setShowGenerateModal(true);
                                                        if (matchedUser) {
                                                            handleSelectEmployeeForPayroll(matchedUser.user_id);
                                                        }
                                                    }}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                                                >
                                                    ⚡ Deduct in Payroll
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: STATUTORY KENYA TAX RETURNS & REMITTANCE SCHEDULES */}
            {/* ========================================================================= */}
            {activeTab === 'tax_reports' && (
                <div className="space-y-6">
                    {/* Tax Cards Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                            <div className="text-xs font-semibold text-slate-500">KRA PAYE Remittance</div>
                            <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">
                                Ksh {filteredPayroll.reduce((s, p) => s + p.paye, 0).toLocaleString()}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">Due by 9th of following month</p>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                            <div className="text-xs font-semibold text-slate-500">SHIF Health Fund (2.75%)</div>
                            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                                Ksh {filteredPayroll.reduce((s, p) => s + p.shif, 0).toLocaleString()}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">Social Health Insurance Fund</p>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                            <div className="text-xs font-semibold text-slate-500">NSSF Pensions (Tier I & II)</div>
                            <div className="text-2xl font-bold font-mono text-purple-700 mt-1">
                                Ksh {filteredPayroll.reduce((s, p) => s + p.nssf, 0).toLocaleString()}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">Max Ksh 2,160 / employee</p>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                            <div className="text-xs font-semibold text-slate-500">Housing Levy (AHL 1.5%)</div>
                            <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
                                Ksh {filteredPayroll.reduce((s, p) => s + p.housing_levy, 0).toLocaleString()}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">Affordable Housing Act 2024</p>
                        </div>
                    </div>

                    {/* Detailed Tax Remittance Table */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">
                                    🏛️ Kenya Statutory Taxes Deduction Schedule — {currentPayPeriod}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Itemized tax deductions per staff member compliant with KRA iTax and statutory portals.
                                </p>
                            </div>
                            <button
                                onClick={handleExportPayrollCSV}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
                            >
                                📥 Download Return (CSV)
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                    <tr>
                                        <th className="py-3 px-4">Employee</th>
                                        <th className="py-3 px-4">KRA PIN / ID</th>
                                        <th className="py-3 px-4 text-right">Gross Pay</th>
                                        <th className="py-3 px-4 text-right">NSSF (Allowable)</th>
                                        <th className="py-3 px-4 text-right">Taxable Pay</th>
                                        <th className="py-3 px-4 text-right">PAYE Tax</th>
                                        <th className="py-3 px-4 text-right">SHIF (2.75%)</th>
                                        <th className="py-3 px-4 text-right">Housing (1.5%)</th>
                                        <th className="py-3 px-4 text-right font-bold text-indigo-700">Total Statutory</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredPayroll.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="py-10 text-center text-slate-400">
                                                No payroll records generated for {currentPayPeriod} yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredPayroll.map((p) => (
                                            <tr key={p.payroll_id} className="hover:bg-slate-50/60 font-mono">
                                                <td className="py-3 px-4 font-sans font-bold text-slate-800">
                                                    {p.employee_name}
                                                </td>
                                                <td className="py-3 px-4 text-slate-600">
                                                    {p.national_id || 'N/A'}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    Ksh {p.gross_pay.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-purple-700">
                                                    Ksh {p.nssf.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-slate-800 font-semibold">
                                                    Ksh {p.taxable_pay.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-indigo-700 font-bold">
                                                    Ksh {p.paye.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-emerald-700 font-semibold">
                                                    Ksh {p.shif.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-amber-700 font-semibold">
                                                    Ksh {p.housing_levy.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right font-bold text-slate-900 bg-slate-50/50">
                                                    Ksh {p.total_statutory.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 6: KRA P9 TAX DEDUCTION CARD GENERATOR */}
            {/* ========================================================================= */}
            {activeTab === 'p9' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                        <div>
                            <h3 className="font-bold text-slate-800 text-base">
                                📜 KRA P9A Tax Deduction Card Generator (Kenya Revenue Authority)
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Generate the official annual P9 tax deduction certificate for any employee showing monthly basic salary, NSSF allowable deduction, reliefs, and PAYE tax remitted.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                        <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Select Employee</label>
                            <select
                                value={p9SelectedUserId}
                                onChange={(e) => setP9SelectedUserId(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value={0}>Choose an employee...</option>
                                {employees.map((e) => (
                                    <option key={e.user_id} value={e.user_id}>
                                        {e.name} ({e.user_type}) — Ksh {Number(e.salary_amount || 0).toLocaleString()}/
                                        {e.salary_type}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Tax Year</label>
                            <select
                                value={p9SelectedYear}
                                onChange={(e) => setP9SelectedYear(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                {[2026, 2025, 2024, 2023].map((y) => (
                                    <option key={y} value={y}>
                                        Tax Year {y}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={() => {
                                    const emp = employees.find((e) => e.user_id === p9SelectedUserId);
                                    if (!emp) {
                                        toast.error('Please select an employee first');
                                        return;
                                    }
                                    handlePrintP9Card(emp, p9SelectedYear);
                                }}
                                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-2"
                            >
                                <span>🖨️</span>
                                <span>Generate & Print KRA P9A Form</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                        <h4 className="text-xs font-bold text-slate-700 mb-2">📌 What is included in Form P9A:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                            <div>
                                <b>Columns A to D:</b> Basic salary, non-cash benefits, quarters value, and total gross emoluments.
                            </div>
                            <div>
                                <b>Columns E to H:</b> Actual NSSF pension contribution, statutory limit, and net taxable income.
                            </div>
                            <div>
                                <b>Columns J to L:</b> Tax charged according to graduated PAYE brackets, personal & insurance reliefs, and net PAYE deducted.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 1: GENERATE WEEKLY / MONTHLY PAYROLL */}
            {/* ========================================================================= */}
            {showGenerateModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <span>📋</span>
                                    <span>Generate {payFrequency} Payroll</span>
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Period: <span className="font-mono font-bold text-indigo-700">{currentPayPeriod}</span> • Kenya Statutory Tax Compliant
                                </p>
                            </div>
                            <button
                                onClick={() => setShowGenerateModal(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-5 mt-5">
                            {/* Staff Selection */}
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    👤 Select Staff Member (from Users Table)
                                </label>
                                <select
                                    value={genForm.employee_id}
                                    onChange={(e) => handleSelectEmployeeForPayroll(Number(e.target.value))}
                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value={0}>Choose an employee...</option>
                                    {employees.map((e) => (
                                        <option key={e.user_id} value={e.user_id}>
                                            {e.name} ({e.user_type}) — Base Wage: Ksh {Number(e.salary_amount || 0).toLocaleString()} / {e.salary_type}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Earnings Section */}
                            <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/60">
                                <div className="text-xs font-bold text-slate-700 flex items-center justify-between mb-3">
                                    <span>💵 {payFrequency} Earnings & Additions</span>
                                    <span className="font-mono text-emerald-700">
                                        Gross: Ksh {livePayrollCalc.gross.toLocaleString()}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[11px] text-slate-500 block mb-1">Basic Pay (Ksh)</label>
                                        <input
                                            type="number"
                                            value={genForm.basic_salary}
                                            onChange={(e) =>
                                                setGenForm((prev) => ({
                                                    ...prev,
                                                    basic_salary: parseFloat(e.target.value) || 0,
                                                }))
                                            }
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-500 block mb-1">Allowances</label>
                                        <input
                                            type="number"
                                            value={genForm.allowances}
                                            onChange={(e) =>
                                                setGenForm((prev) => ({
                                                    ...prev,
                                                    allowances: parseFloat(e.target.value) || 0,
                                                }))
                                            }
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-500 block mb-1">Overtime Pay</label>
                                        <input
                                            type="number"
                                            value={genForm.overtime}
                                            onChange={(e) =>
                                                setGenForm((prev) => ({
                                                    ...prev,
                                                    overtime: parseFloat(e.target.value) || 0,
                                                }))
                                            }
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-slate-500 block mb-1">Tips / Bonus</label>
                                        <input
                                            type="number"
                                            value={genForm.bonuses}
                                            onChange={(e) =>
                                                setGenForm((prev) => ({
                                                    ...prev,
                                                    bonuses: parseFloat(e.target.value) || 0,
                                                }))
                                            }
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Kenya Statutory Taxes Breakdown */}
                            <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100">
                                <div className="text-xs font-bold text-indigo-900 mb-2 flex items-center justify-between">
                                    <span>🏛️ Kenya Statutory Taxes ({payFrequency} Pro-Rated)</span>
                                    <span className="font-mono text-indigo-700">
                                        Total Taxes: Ksh {livePayrollCalc.totalStatutory.toLocaleString()}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100">
                                        <span className="text-[10px] text-slate-500 block">NSSF (Tier I+II)</span>
                                        <span className="font-mono font-bold text-slate-800">
                                            Ksh {livePayrollCalc.nssf.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100">
                                        <span className="text-[10px] text-slate-500 block">SHIF (2.75%)</span>
                                        <span className="font-mono font-bold text-emerald-700">
                                            Ksh {livePayrollCalc.shif.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100">
                                        <span className="text-[10px] text-slate-500 block">Housing Levy (1.5%)</span>
                                        <span className="font-mono font-bold text-amber-700">
                                            Ksh {livePayrollCalc.housingLevy.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100">
                                        <span className="text-[10px] text-slate-500 block">Net PAYE Tax</span>
                                        <span className="font-mono font-bold text-indigo-700">
                                            Ksh {livePayrollCalc.paye.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* ========================================================= */}
                            {/* SATURDAY STAFF PENDING HOUSE BILLS DEDUCTIONS SECTION */}
                            {/* ========================================================= */}
                            <div className="p-4 bg-rose-50/40 rounded-2xl border border-rose-200">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-base">⚠️</span>
                                        <h4 className="text-xs font-bold text-rose-900">
                                            Saturday Staff Pending Bills & Tabs Auto-Deduction
                                        </h4>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-rose-700">
                                        Deducting: Ksh {livePayrollCalc.selectedBillsTotal.toLocaleString()}
                                    </span>
                                </div>

                                {isLoadingBills ? (
                                    <p className="text-xs text-slate-500 py-3 text-center">
                                        Scanning sales ledger for staff receipts...
                                    </p>
                                ) : staffPendingBills.length === 0 ? (
                                    <p className="text-xs text-slate-500 py-2">
                                        ✅ No pending bills or unpaid customer tabs on record for this staff member.
                                    </p>
                                ) : (
                                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-1">
                                        {staffPendingBills.map((bill) => (
                                            <div
                                                key={bill.sale_id}
                                                className={`p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
                                                    bill.selected_for_deduction
                                                        ? 'bg-white border-rose-300 shadow-sm'
                                                        : 'bg-slate-50 border-slate-200 opacity-60'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={bill.selected_for_deduction}
                                                        onChange={(e) => {
                                                            const checked = e.target.checked;
                                                            setStaffPendingBills((prev) =>
                                                                prev.map((b) =>
                                                                    b.sale_id === bill.sale_id
                                                                        ? { ...b, selected_for_deduction: checked }
                                                                        : b
                                                                )
                                                            );
                                                        }}
                                                        className="w-4 h-4 text-rose-600 rounded"
                                                    />
                                                    <div>
                                                        <div className="font-mono font-bold text-slate-800">
                                                            {bill.receipt_no} • {bill.sale_date}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">
                                                            {bill.items && bill.items.length
                                                                ? bill.items.map((it) => `${it.quantity}x ${it.product_name}`).join(', ')
                                                                : 'Restaurant Order'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <div className="font-mono font-bold text-rose-700">
                                                        Ksh {bill.unpaid_balance.toLocaleString()}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        Total: {bill.total_amount}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Salary Advance Loan Deduction */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                                        💸 Salary Advance Deduction (Ksh)
                                    </label>
                                    <input
                                        type="number"
                                        value={genForm.salary_advance}
                                        onChange={(e) =>
                                            setGenForm((prev) => ({
                                                ...prev,
                                                salary_advance: parseFloat(e.target.value) || 0,
                                            }))
                                        }
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                                        Other Deductions (Ksh)
                                    </label>
                                    <input
                                        type="number"
                                        value={genForm.other_deductions}
                                        onChange={(e) =>
                                            setGenForm((prev) => ({
                                                ...prev,
                                                other_deductions: parseFloat(e.target.value) || 0,
                                            }))
                                        }
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                                    />
                                </div>
                            </div>

                            {/* Final Take-Home Summary Card */}
                            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                                <div>
                                    <span className="text-xs text-slate-600 block">Calculated Net Pay:</span>
                                    <span className="text-xs text-slate-400">
                                        Gross (Ksh {livePayrollCalc.gross.toLocaleString()}) - Deductions (Ksh {livePayrollCalc.totalDeductions.toLocaleString()})
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-bold font-mono text-emerald-700">
                                        Ksh {livePayrollCalc.netPay.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => setShowGenerateModal(false)}
                                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePayrollEntry}
                                disabled={isSaving || !genForm.employee_id}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                <span>📋</span>
                                <span>{isSaving ? 'Processing...' : `Save & Issue ${payFrequency} Payroll`}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: DISBURSE PAYMENT MODAL (Cash, M-Pesa, Bank) */}
            {/* ========================================================================= */}
            {showPaymentModal && targetPaymentEntry && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <span>💵</span>
                                <span>Disburse Salary Payment</span>
                            </h2>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Employee:</span>
                                <span className="font-bold text-slate-800">{targetPaymentEntry.employee_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Period:</span>
                                <span className="font-mono text-indigo-700 font-semibold">{targetPaymentEntry.pay_period}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200">
                                <span>Amount Due:</span>
                                <span className="text-emerald-700 font-mono">
                                    Ksh {targetPaymentEntry.net_pay.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4 mt-5">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Payment Method</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['Cash', 'M-Pesa', 'Bank'] as const).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setPaymentForm((prev) => ({ ...prev, payment_method: m }))}
                                            className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                                                paymentForm.payment_method === m
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            {m === 'M-Pesa' ? '📱 M-Pesa' : m === 'Cash' ? '💵 Cash' : '🏦 Bank'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Reference / Transaction No. (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder={paymentForm.payment_method === 'M-Pesa' ? 'e.g. QK876TR9' : 'e.g. CHQ-00123'}
                                    value={paymentForm.payment_ref}
                                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_ref: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Authorized By</label>
                                <input
                                    type="text"
                                    value={paymentForm.paid_by}
                                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_by: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6">
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisbursePayment}
                                disabled={isSaving}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-1.5"
                            >
                                <span>✅</span>
                                <span>{isSaving ? 'Recording...' : 'Confirm Disbursed'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 3: REQUEST SALARY ADVANCE */}
            {/* ========================================================================= */}
            {showAdvanceModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <span>💸</span>
                                <span>Issue Staff Salary Advance</span>
                            </h2>
                            <button
                                onClick={() => setShowAdvanceModal(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4 mt-5">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Staff Member</label>
                                <select
                                    value={advanceForm.employee_id}
                                    onChange={(e) => setAdvanceForm((prev) => ({ ...prev, employee_id: Number(e.target.value) }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none"
                                >
                                    <option value={0}>Select employee...</option>
                                    {employees.map((e) => (
                                        <option key={e.user_id} value={e.user_id}>
                                            {e.name} ({e.user_type})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Advance Amount (Ksh)
                                </label>
                                <input
                                    type="number"
                                    value={advanceForm.amount}
                                    onChange={(e) => setAdvanceForm((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                    placeholder="Enter advance amount"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-white outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[11px] text-slate-500 block mb-1">Repayment Month</label>
                                    <input
                                        type="month"
                                        value={advanceForm.repayment_month}
                                        onChange={(e) => setAdvanceForm((prev) => ({ ...prev, repayment_month: e.target.value }))}
                                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] text-slate-500 block mb-1">Repayment Week</label>
                                    <select
                                        value={advanceForm.repayment_week}
                                        onChange={(e) => setAdvanceForm((prev) => ({ ...prev, repayment_week: Number(e.target.value) }))}
                                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50"
                                    >
                                        {[1, 2, 3, 4, 5].map((w) => (
                                            <option key={w} value={w}>
                                                Week {w}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Reason for Advance</label>
                                <textarea
                                    rows={2}
                                    value={advanceForm.reason}
                                    onChange={(e) => setAdvanceForm((prev) => ({ ...prev, reason: e.target.value }))}
                                    placeholder="e.g. Medical emergency, School fees support..."
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6">
                            <button
                                onClick={() => setShowAdvanceModal(false)}
                                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAdvanceRequest}
                                disabled={isSaving}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm flex items-center justify-center gap-1.5"
                            >
                                <span>💸</span>
                                <span>{isSaving ? 'Saving...' : 'Approve & Issue'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 4: STANDALONE KENYA TAX CALCULATOR */}
            {/* ========================================================================= */}
            {showCalculatorModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <span>🧮</span>
                                <span>Kenya Statutory Tax Calculator</span>
                            </h2>
                            <button
                                onClick={() => setShowCalculatorModal(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4 mt-5">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex-1">
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                                        Gross Salary (Ksh)
                                    </label>
                                    <input
                                        type="number"
                                        value={calcGrossInput}
                                        onChange={(e) => setCalcGrossInput(parseFloat(e.target.value) || 0)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold bg-white outline-none"
                                    />
                                </div>
                                <div className="w-32">
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">Frequency</label>
                                    <select
                                        value={calcFreqInput}
                                        onChange={(e) => setCalcFreqInput(e.target.value as any)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-medium"
                                    >
                                        <option value="Monthly">Monthly</option>
                                        <option value="Weekly">Weekly</option>
                                    </select>
                                </div>
                            </div>

                            {/* Result Breakdown */}
                            {(() => {
                                const res = calculateKenyaPayroll({
                                    grossPay: calcGrossInput,
                                    frequency: calcFreqInput,
                                });
                                const takeHome = res.grossPay - res.totalStatutory;

                                return (
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">NSSF Contribution (Tier I & II):</span>
                                            <span className="font-mono font-bold text-purple-700">
                                                Ksh {res.nssf.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">SHIF Health Fund (2.75%):</span>
                                            <span className="font-mono font-bold text-emerald-700">
                                                Ksh {res.shif.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Housing Levy (AHL 1.5%):</span>
                                            <span className="font-mono font-bold text-amber-700">
                                                Ksh {res.housingLevy.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Taxable Pay (Gross - NSSF):</span>
                                            <span className="font-mono text-slate-800">
                                                Ksh {res.taxablePay.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">PAYE Tax Charged (After Reliefs):</span>
                                            <span className="font-mono font-bold text-indigo-700">
                                                Ksh {res.paye.toLocaleString()}
                                            </span>
                                        </div>
                                        <hr className="border-slate-200 my-2" />
                                        <div className="flex justify-between font-bold text-slate-800">
                                            <span>Total Statutory Taxes:</span>
                                            <span className="font-mono text-rose-700">
                                                - Ksh {res.totalStatutory.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between font-bold text-sm text-emerald-800 pt-1">
                                            <span>Estimated Take-Home Net:</span>
                                            <span className="font-mono">Ksh {takeHome.toLocaleString()}</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <button
                            onClick={() => setShowCalculatorModal(false)}
                            className="w-full mt-6 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700"
                        >
                            Close Calculator
                        </button>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 5: EDIT EMPLOYEE WAGE RATE (DIRECT DB UPDATE) */}
            {/* ========================================================================= */}
            {showEditWageModal && selectedEmployeeForWage && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-base font-bold text-slate-800">
                                    ✏️ Edit Staff Wage Rate
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {selectedEmployeeForWage.name} ({selectedEmployeeForWage.user_type})
                                </p>
                            </div>
                            <button
                                onClick={() => setShowEditWageModal(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4 mt-5">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Wage Amount (Ksh)
                                </label>
                                <input
                                    type="number"
                                    value={wageForm.salary_amount}
                                    onChange={(e) => setWageForm((prev) => ({ ...prev, salary_amount: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold bg-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Salary Frequency</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['Weekly', 'Monthly'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setWageForm((prev) => ({ ...prev, salary_type: mode }))}
                                            className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                                                wageForm.salary_type === mode
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            {mode === 'Weekly' ? '📅 Weekly' : '🗓️ Monthly'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6">
                            <button
                                onClick={() => setShowEditWageModal(false)}
                                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateEmployeeWage}
                                disabled={isSaving}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-1.5"
                            >
                                <span>💾</span>
                                <span>{isSaving ? 'Updating...' : 'Save to Users DB'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
