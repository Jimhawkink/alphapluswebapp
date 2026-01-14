-- ============================================================
-- ALPHAPLUS POS - FIX RLS POLICIES FOR MOBILE APP ACCESS
-- Run this in your Supabase SQL Editor to fix mobile app issues
-- ============================================================

-- The mobile app uses the 'anon' key and needs SELECT/INSERT/UPDATE
-- permissions on these tables:
-- 1. sales - for receipt numbers and saving sales
-- 2. production_batches - for stock deduction
-- 3. products - for loading products
-- 4. shifts - for shift management
-- 5. bill_payments - for payment records

-- ============================================================
-- FIX SALES TABLE RLS
-- ============================================================

-- First check if RLS is enabled and create permissive policies
ALTER TABLE IF EXISTS sales ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow anon to read sales" ON sales;
DROP POLICY IF EXISTS "Allow anon to insert sales" ON sales;
DROP POLICY IF EXISTS "Allow anon to update sales" ON sales;
DROP POLICY IF EXISTS "Allow all for sales" ON sales;

-- Create permissive policies for the mobile app (using anon key)
CREATE POLICY "Allow all for sales" ON sales
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX PRODUCTION_BATCHES TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS production_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon to read production_batches" ON production_batches;
DROP POLICY IF EXISTS "Allow anon to update production_batches" ON production_batches;
DROP POLICY IF EXISTS "Allow all for production_batches" ON production_batches;

CREATE POLICY "Allow all for production_batches" ON production_batches
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX PRODUCTS TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon to read products" ON products;
DROP POLICY IF EXISTS "Allow all for products" ON products;

CREATE POLICY "Allow all for products" ON products
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX SHIFTS TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon to read shifts" ON shifts;
DROP POLICY IF EXISTS "Allow anon to update shifts" ON shifts;
DROP POLICY IF EXISTS "Allow all for shifts" ON shifts;

CREATE POLICY "Allow all for shifts" ON shifts
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX SHIFT_DEFINITIONS TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS shift_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for shift_definitions" ON shift_definitions;

CREATE POLICY "Allow all for shift_definitions" ON shift_definitions
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX BILL_PAYMENTS TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS bill_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon to read bill_payments" ON bill_payments;
DROP POLICY IF EXISTS "Allow anon to insert bill_payments" ON bill_payments;
DROP POLICY IF EXISTS "Allow all for bill_payments" ON bill_payments;

CREATE POLICY "Allow all for bill_payments" ON bill_payments
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX SALES_ITEMS TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS sales_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for sales_items" ON sales_items;

CREATE POLICY "Allow all for sales_items" ON sales_items
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- FIX USERS TABLE RLS
-- ============================================================

ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for users" ON users;

CREATE POLICY "Allow all for users" ON users
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- VERIFICATION - Check that policies were created
-- ============================================================

SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename IN ('sales', 'production_batches', 'products', 'shifts', 'bill_payments', 'sales_items', 'users')
ORDER BY tablename, policyname;

SELECT '✅ RLS policies updated successfully! Mobile app should now work correctly.' as status;
