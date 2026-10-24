-- ============================================================
-- ALPHAPLUS HOTEL & RESORT - COMPREHENSIVE PAYROLL & ADVANCES SCHEMA
-- Run this in Supabase SQL Editor if native tables are preferred.
-- The web application seamlessly supports both native tables and 
-- cloud organisation_settings synchronization!
-- ============================================================

-- 1. PAYROLL LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.payroll (
    payroll_id SERIAL PRIMARY KEY,
    payroll_code VARCHAR(50) UNIQUE,
    employee_id INTEGER NOT NULL,
    employee_name VARCHAR(200) NOT NULL,
    employee_code VARCHAR(50),
    national_id VARCHAR(50),
    department VARCHAR(100) DEFAULT 'Food & Beverage',
    user_type VARCHAR(100) DEFAULT 'Staff',
    pay_period VARCHAR(50) NOT NULL, -- e.g., "2026-10-W4" or "2026-10"
    pay_frequency VARCHAR(20) DEFAULT 'Weekly', -- 'Weekly' or 'Monthly'
    pay_date DATE DEFAULT CURRENT_DATE,
    
    -- Earnings Breakdown
    basic_salary NUMERIC DEFAULT 0,
    allowances NUMERIC DEFAULT 0,
    overtime NUMERIC DEFAULT 0,
    bonuses NUMERIC DEFAULT 0,
    gross_pay NUMERIC DEFAULT 0,
    
    -- Kenya Statutory Deductions
    nssf_tier1 NUMERIC DEFAULT 0,
    nssf_tier2 NUMERIC DEFAULT 0,
    nssf NUMERIC DEFAULT 0,
    shif NUMERIC DEFAULT 0, -- Social Health Insurance Fund (2.75%)
    housing_levy NUMERIC DEFAULT 0, -- Affordable Housing Levy (1.5%)
    taxable_pay NUMERIC DEFAULT 0,
    gross_paye NUMERIC DEFAULT 0,
    personal_relief NUMERIC DEFAULT 0,
    insurance_relief NUMERIC DEFAULT 0,
    housing_relief NUMERIC DEFAULT 0,
    paye NUMERIC DEFAULT 0, -- Net PAYE Tax
    total_statutory NUMERIC DEFAULT 0,
    
    -- Operational Deductions
    advances NUMERIC DEFAULT 0,
    staff_bills_deductions NUMERIC DEFAULT 0, -- Saturday Staff Tabs Deducted
    deducted_bills_json JSONB DEFAULT '[]'::jsonb, -- Itemized receipts & line items
    other_deductions NUMERIC DEFAULT 0,
    total_deductions NUMERIC DEFAULT 0,
    
    -- Net Pay & Settlement
    net_pay NUMERIC DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Paid'
    payment_method VARCHAR(50) DEFAULT 'Cash', -- 'Cash', 'M-Pesa', 'Bank'
    payment_ref VARCHAR(100),
    paid_date DATE,
    paid_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. SALARY ADVANCES TABLE
CREATE TABLE IF NOT EXISTS public.salary_advances (
    advance_id SERIAL PRIMARY KEY,
    advance_code VARCHAR(50) UNIQUE,
    employee_id INTEGER NOT NULL,
    employee_name VARCHAR(200) NOT NULL,
    employee_code VARCHAR(50),
    advance_date DATE DEFAULT CURRENT_DATE,
    amount NUMERIC DEFAULT 0,
    reason TEXT,
    repayment_period VARCHAR(50), -- e.g., "2026-10-W4"
    status VARCHAR(50) DEFAULT 'Approved', -- 'Pending', 'Approved', 'Repaid', 'Rejected'
    approved_by VARCHAR(100),
    deducted_in_payroll_id INTEGER,
    repaid_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and public access
ALTER TABLE public.payroll DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances DISABLE ROW LEVEL SECURITY;
