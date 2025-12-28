-- ============================================================
-- ALPHA PLUS - COMPLETE DATABASE SETUP
-- Run this ENTIRE script in Supabase SQL Editor
-- This adds ALL missing columns to existing tables
-- ============================================================

-- ============================================
-- 1. RECIPES TABLE - Add all columns
-- ============================================
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    dish_name VARCHAR(200),
    barcode VARCHAR(50),
    qty_produced DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0,
    recipe_date DATE DEFAULT CURRENT_DATE,
    batch_number VARCHAR(100),
    created_by VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS product_id INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dish_name VARCHAR(200);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS qty_produced DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recipe_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Drop unique constraint on batch_number
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_batch_number_key;

-- ============================================
-- 2. RECIPE_INGREDIENTS TABLE - Add all columns
-- ============================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    recipe_id INT,
    ingredient_product_id INT,
    ingredient_name VARCHAR(200),
    unit_measure VARCHAR(50),
    qty_issued DECIMAL(15,4) DEFAULT 0,
    convert_unit VARCHAR(50),
    rate DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    remaining_qty DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS recipe_id INT;
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS ingredient_product_id INT;
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS ingredient_name VARCHAR(200);
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS unit_measure VARCHAR(50);
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS qty_issued DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS convert_unit VARCHAR(50);
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS rate DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS remaining_qty DECIMAL(15,4) DEFAULT 0;
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================
-- 3. PRODUCTION_BATCHES TABLE - Add all columns
-- ============================================
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(100),
    product_id INT,
    product_name VARCHAR(200),
    recipe_id INT,
    qty_produced DECIMAL(15,4) DEFAULT 0,
    qty_remaining DECIMAL(15,4) DEFAULT 0,
    qty_sold DECIMAL(15,4) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0,
    selling_price DECIMAL(15,4) DEFAULT 0,
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status VARCHAR(30) DEFAULT 'In Stock',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add ALL missing columns to production_batches
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_id INT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_name VARCHAR(200);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS recipe_id INT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_produced DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_remaining DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_sold DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS selling_price DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS production_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'In Stock';
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================
-- 4. PRODUCTS_INGREDIENTS TABLE - Add all columns
-- ============================================
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS base_unit VARCHAR(20) DEFAULT 'KG';
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS price_per_pack DECIMAL(15,2) DEFAULT 0;
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS cost_per_base_unit DECIMAL(15,4) DEFAULT 0;
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS current_stock DECIMAL(15,4) DEFAULT 0;
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS reorder_point DECIMAL(15,4) DEFAULT 10;
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Raw Materials';
ALTER TABLE products_ingredients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update existing ingredients with calculated costs
UPDATE products_ingredients 
SET 
    base_unit = COALESCE(base_unit, sales_unit, 'KG'),
    price_per_pack = COALESCE(price_per_pack, sales_cost, 0),
    cost_per_base_unit = CASE 
        WHEN COALESCE(pack_size, 1) > 0 THEN COALESCE(sales_cost, 0) / GREATEST(COALESCE(pack_size, 1), 1)
        ELSE COALESCE(sales_cost, 0) 
    END,
    active = COALESCE(active, true)
WHERE cost_per_base_unit IS NULL OR cost_per_base_unit = 0;

-- ============================================
-- 5. DISABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE products_ingredients DISABLE ROW LEVEL SECURITY;

-- Drop all policies
DROP POLICY IF EXISTS "Enable all for recipes" ON recipes;
DROP POLICY IF EXISTS "Enable all for recipe_ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Enable all for production_batches" ON production_batches;
DROP POLICY IF EXISTS "Enable all for products_ingredients" ON products_ingredients;

-- ============================================
-- 6. GRANT PERMISSIONS TO ALL ROLES
-- ============================================
GRANT ALL ON recipes TO anon, authenticated, service_role;
GRANT ALL ON recipe_ingredients TO anon, authenticated, service_role;
GRANT ALL ON production_batches TO anon, authenticated, service_role;
GRANT ALL ON products_ingredients TO anon, authenticated, service_role;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================
-- VERIFICATION - Show table structure
-- ============================================
SELECT 
    'production_batches columns:' as info,
    string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns 
WHERE table_name = 'production_batches' AND table_schema = 'public';

-- ============================================
-- DONE! ✅
-- ============================================
SELECT '✅ SUCCESS! All tables updated with all required columns. RLS disabled.' as result;
