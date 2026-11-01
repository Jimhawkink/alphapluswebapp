-- ============================================================
-- ALPHAPLUS EXPENSES TABLE SETUP FOR SUPABASE
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_name VARCHAR(255) NOT NULL,
    expense_type VARCHAR(100),
    category VARCHAR(100),
    description TEXT,
    amount NUMERIC DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    created_by VARCHAR(100),
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable Row Level Security so application users and cashiers can save expenses smoothly
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;

-- Grant standard permissions
GRANT ALL ON TABLE public.expenses TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure shift_expenses also has necessary columns
CREATE TABLE IF NOT EXISTS public.shift_expenses (
    expense_id SERIAL PRIMARY KEY,
    shift_id INT,
    expense_category VARCHAR(100),
    expense_description TEXT,
    amount NUMERIC NOT NULL DEFAULT 0,
    recorded_by VARCHAR(100),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.shift_expenses DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.shift_expenses TO anon, authenticated, service_role;
