-- =====================================================
-- BUTCHERY MODULE SETUP SCRIPT
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Ensure RLS policies allow reading from meat tables
ALTER TABLE meat_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_weight_losses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (ignore errors)
DROP POLICY IF EXISTS "public_meat_types_select" ON meat_types;
DROP POLICY IF EXISTS "public_meat_types_all" ON meat_types;
DROP POLICY IF EXISTS "public_meat_stock_select" ON meat_stock;
DROP POLICY IF EXISTS "public_meat_stock_all" ON meat_stock;
DROP POLICY IF EXISTS "public_meat_sales_select" ON meat_sales;
DROP POLICY IF EXISTS "public_meat_sales_all" ON meat_sales;
DROP POLICY IF EXISTS "public_meat_weight_losses_select" ON meat_weight_losses;
DROP POLICY IF EXISTS "public_meat_weight_losses_all" ON meat_weight_losses;

-- Create permissive RLS policies for all meat tables
CREATE POLICY "public_meat_types_all" ON meat_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_meat_stock_all" ON meat_stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_meat_sales_all" ON meat_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_meat_weight_losses_all" ON meat_weight_losses FOR ALL USING (true) WITH CHECK (true);

-- 2. Insert default meat types (IF NOT EXISTS)
INSERT INTO meat_types (meat_type_name, description, is_active) VALUES
('Beef', 'Fresh beef cuts', true),
('Goat', 'Goat meat (chevon)', true),
('Mutton', 'Sheep meat', true),
('Pork', 'Pork meat', true),
('Chicken', 'Fresh chicken', true),
('Fish', 'Fresh fish', true),
('Offals', 'Liver, kidney, etc.', true),
('Mince', 'Ground/minced meat', true)
ON CONFLICT (meat_type_name) DO NOTHING;

-- 3. Verify meat types were created
SELECT * FROM meat_types;

-- 4. Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('meat_types', 'meat_stock', 'meat_sales', 'meat_weight_losses');

-- Success message
SELECT 'Butchery module setup complete! You should now see meat types loaded.' AS result;
