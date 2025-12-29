-- ============================================================
-- ADDITIONAL TABLES FOR ALPHAPLUS - EXPENSES, VOUCHERS, RETURNS, SHIFTS, PAYROLL
-- Run this in Supabase SQL Editor
-- Updated to match the exact schema from the application
-- ============================================================

-- ============================================
-- 1. EXPENSES TABLE (matches schema)
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_name VARCHAR(255) NOT NULL,
    expense_type VARCHAR(100),
    amount NUMERIC,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expense_date DATE DEFAULT CURRENT_DATE,
    category VARCHAR(100),
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    created_by VARCHAR(100)
);

-- Add missing columns to expenses if table already exists
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_name VARCHAR(255);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_type VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. VOUCHERS TABLE (matches schema)
-- ============================================
CREATE TABLE IF NOT EXISTS vouchers (
    voucher_id SERIAL PRIMARY KEY,
    voucher_no VARCHAR(50) UNIQUE,
    voucher_date DATE DEFAULT CURRENT_DATE,
    voucher_type VARCHAR(50) DEFAULT 'Payment',
    payee_name VARCHAR(200),
    description TEXT,
    amount NUMERIC DEFAULT 0,
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
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Approved';
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE vouchers DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. SALES RETURNS TABLE (matches schema)
-- ============================================
CREATE TABLE IF NOT EXISTS sales_returns (
    return_id SERIAL PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE,
    return_date DATE DEFAULT CURRENT_DATE,
    original_sale_id VARCHAR(50),
    product_name VARCHAR(255),
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
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
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Completed';
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS processed_by VARCHAR(100);
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE sales_returns DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. PURCHASE RETURNS TABLE (matches schema)
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_returns (
    return_id SERIAL PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE,
    return_date DATE DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(200),
    original_purchase_id VARCHAR(50),
    product_name VARCHAR(255),
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
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
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Completed';
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE purchase_returns DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. SHIFTS TABLE (matches schema)
-- ============================================
CREATE TABLE IF NOT EXISTS shifts (
    shift_id SERIAL PRIMARY KEY,
    shift_date DATE DEFAULT CURRENT_DATE,
    shift_type VARCHAR(50) DEFAULT 'Morning',
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    opening_cash NUMERIC DEFAULT 0,
    closing_cash NUMERIC DEFAULT 0,
    total_sales NUMERIC DEFAULT 0,
    total_expenses NUMERIC DEFAULT 0,
    total_vouchers NUMERIC DEFAULT 0,
    net_sales NUMERIC DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Open',
    opened_by VARCHAR(100),
    closed_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type VARCHAR(50) DEFAULT 'Morning';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS end_time TIME WITHOUT TIME ZONE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_cash NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_cash NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_sales NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_expenses NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_vouchers NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS net_sales NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opened_by VARCHAR(100);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closed_by VARCHAR(100);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. PAYROLL TABLE (WEEKLY PAYROLL SYSTEM)
-- pay_period format: "YYYY-MM-WN" (e.g., "2025-12-W1" for Dec Week 1)
-- ============================================
CREATE TABLE IF NOT EXISTS payroll (
    payroll_id SERIAL PRIMARY KEY,
    employee_id INTEGER,
    employee_name VARCHAR(200),
    pay_period VARCHAR(20),  -- Stores YYYY-MM-WN format for weekly payroll
    basic_salary NUMERIC DEFAULT 0,  -- Weekly salary (monthly / 4)
    allowances NUMERIC DEFAULT 0,
    deductions NUMERIC DEFAULT 0,
    advances NUMERIC DEFAULT 0,  -- Salary advances for this week
    paye NUMERIC DEFAULT 0,  -- Pro-rated weekly PAYE (monthly / 4.33)
    nhif NUMERIC DEFAULT 0,  -- Pro-rated weekly NHIF
    nssf NUMERIC DEFAULT 0,  -- Pro-rated weekly NSSF
    net_pay NUMERIC DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending',
    paid_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns for Payroll page compatibility
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS employee_id INTEGER;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS employee_name VARCHAR(200);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS pay_period VARCHAR(20);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS basic_salary NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS allowances NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS deductions NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advances NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS paye NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS nhif NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS nssf NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS net_pay NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending';
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE payroll DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. SALARY ADVANCES TABLE (updated for WEEKLY payroll)
-- repayment_date stores week period like "2025-12-W1"
-- ============================================
CREATE TABLE IF NOT EXISTS salary_advances (
    advance_id SERIAL PRIMARY KEY,
    employee_id INTEGER,
    employee_name VARCHAR(200),
    advance_date DATE DEFAULT CURRENT_DATE,
    amount NUMERIC DEFAULT 0,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Approved',
    approved_by VARCHAR(100),
    repayment_date VARCHAR(20),  -- Stores YYYY-MM-WN format for weekly payroll
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns for Advances page compatibility
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS employee_id INTEGER;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS employee_name VARCHAR(200);
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS advance_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Approved';
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
-- Change repayment_date to VARCHAR to support week format
ALTER TABLE salary_advances ALTER COLUMN repayment_date TYPE VARCHAR(20) USING repayment_date::VARCHAR;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE salary_advances DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. ADD COLUMNS TO USERS FOR PAYROLL (matches schema)
-- user_id, user_code, user_name, password_hash, name, user_type, 
-- email, phone, national_id, salary_type, salary_amount, pin, 
-- active, is_super_admin, created_at, updated_at, basic_salary, pay_type
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(50) DEFAULT 'Cashier';
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_type VARCHAR(50) DEFAULT 'Monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_amount NUMERIC DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS basic_salary NUMERIC DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_type VARCHAR(50) DEFAULT 'Monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- ============================================
-- 9. PRODUCTION BATCHES TABLE (matches schema)
-- ============================================
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) UNIQUE,
    product_id INTEGER,
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    qty_produced NUMERIC NOT NULL,
    qty_remaining NUMERIC NOT NULL,
    total_production_cost NUMERIC DEFAULT 0,
    cost_per_unit NUMERIC NOT NULL,
    purchase_rate NUMERIC,
    sales_rate NUMERIC,
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status VARCHAR(50) DEFAULT 'Active',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    selling_price NUMERIC DEFAULT 0,
    recipe_id INTEGER,
    qty_sold NUMERIC DEFAULT 0
);

-- Add missing columns
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_id INTEGER;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_produced NUMERIC DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_remaining NUMERIC DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS total_production_cost NUMERIC DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS purchase_rate NUMERIC;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS sales_rate NUMERIC;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS production_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS selling_price NUMERIC DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS recipe_id INTEGER;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_sold NUMERIC DEFAULT 0;

ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. ADD COLUMNS TO SALES FOR TRACKING (matches schema)
-- ============================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS mpesa_receipt VARCHAR(100);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_no VARCHAR(20);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_notes TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS waiter_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS waiter_name VARCHAR(200);

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
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(pay_period);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_advances_employee ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_advances_date ON salary_advances(advance_date);
CREATE INDEX IF NOT EXISTS idx_advances_repayment ON salary_advances(repayment_date);
CREATE INDEX IF NOT EXISTS idx_batches_product ON production_batches(product_id);

-- ============================================================
-- DONE! ✅
-- Tables are now compatible with Payroll and Advances pages
-- ============================================================
