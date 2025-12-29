-- ============================================================
-- ADDITIONAL TABLES FOR ALPHAPLUS - EXPENSES, VOUCHERS, RETURNS, SHIFTS, PAYROLL
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================
-- 1. EXPENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_date DATE DEFAULT CURRENT_DATE,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(15,2) DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to expenses if table already exists
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. VOUCHERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vouchers (
    voucher_id SERIAL PRIMARY KEY,
    voucher_no VARCHAR(50) UNIQUE,
    voucher_date DATE DEFAULT CURRENT_DATE,
    voucher_type VARCHAR(50) DEFAULT 'Payment',
    payee_name VARCHAR(200),
    description TEXT,
    amount DECIMAL(15,2) DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    approved_by VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Approved',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to vouchers if table already exists
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS voucher_no VARCHAR(50);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS voucher_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(50) DEFAULT 'Payment';
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS payee_name VARCHAR(200);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Approved';
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE vouchers DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. SALES RETURNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sales_returns (
    return_id SERIAL PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE,
    return_date DATE DEFAULT CURRENT_DATE,
    original_sale_id VARCHAR(50),
    product_name VARCHAR(255),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit_price DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Completed',
    processed_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS return_no VARCHAR(50);
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS return_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS original_sale_id VARCHAR(50);
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS quantity DECIMAL(15,3) DEFAULT 0;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Completed';
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS processed_by VARCHAR(100);
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE sales_returns DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. PURCHASE RETURNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_returns (
    return_id SERIAL PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE,
    return_date DATE DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(200),
    original_purchase_id VARCHAR(50),
    product_name VARCHAR(255),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit_price DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS return_no VARCHAR(50);
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS return_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS original_purchase_id VARCHAR(50);
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS quantity DECIMAL(15,3) DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Completed';
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE purchase_returns DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. SHIFTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shifts (
    shift_id SERIAL PRIMARY KEY,
    shift_date DATE DEFAULT CURRENT_DATE,
    shift_type VARCHAR(50) DEFAULT 'Morning',
    start_time TIME,
    end_time TIME,
    opening_cash DECIMAL(15,2) DEFAULT 0,
    closing_cash DECIMAL(15,2) DEFAULT 0,
    total_sales DECIMAL(15,2) DEFAULT 0,
    total_expenses DECIMAL(15,2) DEFAULT 0,
    total_vouchers DECIMAL(15,2) DEFAULT 0,
    net_sales DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Open',
    opened_by VARCHAR(100),
    closed_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type VARCHAR(50) DEFAULT 'Morning';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_cash DECIMAL(15,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_cash DECIMAL(15,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_sales DECIMAL(15,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_expenses DECIMAL(15,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_vouchers DECIMAL(15,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS net_sales DECIMAL(15,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opened_by VARCHAR(100);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closed_by VARCHAR(100);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. PAYROLL TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payroll (
    payroll_id SERIAL PRIMARY KEY,
    employee_id INT,
    employee_name VARCHAR(200),
    pay_period VARCHAR(20),
    basic_salary DECIMAL(15,2) DEFAULT 0,
    allowances DECIMAL(15,2) DEFAULT 0,
    deductions DECIMAL(15,2) DEFAULT 0,
    advances DECIMAL(15,2) DEFAULT 0,
    paye DECIMAL(15,2) DEFAULT 0,
    nhif DECIMAL(15,2) DEFAULT 0,
    nssf DECIMAL(15,2) DEFAULT 0,
    net_pay DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending',
    paid_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS employee_id INT;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS employee_name VARCHAR(200);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS pay_period VARCHAR(20);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS basic_salary DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS allowances DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS deductions DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advances DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS paye DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS nhif DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS nssf DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS net_pay DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending';
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE payroll DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. SALARY ADVANCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS salary_advances (
    advance_id SERIAL PRIMARY KEY,
    employee_id INT,
    employee_name VARCHAR(200),
    advance_date DATE DEFAULT CURRENT_DATE,
    amount DECIMAL(15,2) DEFAULT 0,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Approved',
    approved_by VARCHAR(100),
    repayment_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS employee_id INT;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS employee_name VARCHAR(200);
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS advance_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Approved';
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS repayment_date DATE;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE salary_advances DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. ADD COLUMNS TO USERS FOR PAYROLL
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS basic_salary DECIMAL(15,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_type VARCHAR(50) DEFAULT 'Monthly';

-- ============================================
-- 9. PRODUCTION BATCHES TABLE (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) UNIQUE,
    product_id INT,
    product_name VARCHAR(255),
    production_date DATE DEFAULT CURRENT_DATE,
    qty_produced DECIMAL(15,3) DEFAULT 0,
    qty_remaining DECIMAL(15,3) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0,
    sales_rate DECIMAL(15,4) DEFAULT 0,
    expiry_date DATE,
    status VARCHAR(50) DEFAULT 'Active',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_id INT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS production_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_produced DECIMAL(15,3) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_remaining DECIMAL(15,3) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS sales_rate DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. ADD COLUMNS TO SALES FOR TRACKING
-- ============================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS mpesa_receipt VARCHAR(100);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_no VARCHAR(20);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_notes TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS waiter_id INT;

-- ============================================
-- CREATE OPEN POLICIES (using DROP IF EXISTS + CREATE)
-- ============================================
DROP POLICY IF EXISTS "Allow all expenses" ON expenses;
CREATE POLICY "Allow all expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all vouchers" ON vouchers;
CREATE POLICY "Allow all vouchers" ON vouchers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all sales_returns" ON sales_returns;
CREATE POLICY "Allow all sales_returns" ON sales_returns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all purchase_returns" ON purchase_returns;
CREATE POLICY "Allow all purchase_returns" ON purchase_returns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all shifts" ON shifts;
CREATE POLICY "Allow all shifts" ON shifts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all payroll" ON payroll;
CREATE POLICY "Allow all payroll" ON payroll FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all salary_advances" ON salary_advances;
CREATE POLICY "Allow all salary_advances" ON salary_advances FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all production_batches" ON production_batches;
CREATE POLICY "Allow all production_batches" ON production_batches FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- CREATE INDEXES (only if table and column exist)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(pay_period);
CREATE INDEX IF NOT EXISTS idx_advances_employee ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_batches_product ON production_batches(product_id);

-- ============================================================
-- DONE! ✅
-- ============================================================
