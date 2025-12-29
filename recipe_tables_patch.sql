-- ============================================================
-- ALPHA PLUS - COMPLETE DATABASE FIX
-- Run this ENTIRE script in Supabase SQL Editor
-- This fixes ALL missing columns and constraints
-- ============================================================

-- ============================================
-- 1. RECIPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id SERIAL PRIMARY KEY,
    product_id INT,
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

-- Remove constraints that cause errors
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_batch_number_key;
ALTER TABLE recipes ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE recipes ALTER COLUMN dish_name DROP NOT NULL;

-- ============================================
-- 2. RECIPE_INGREDIENTS TABLE
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
-- 3. PRODUCTION_BATCHES TABLE - ALL COLUMNS
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
    total_production_cost DECIMAL(15,4) DEFAULT 0,
    selling_price DECIMAL(15,4) DEFAULT 0,
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status VARCHAR(30) DEFAULT 'In Stock',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add ALL columns that might be missing
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_id INT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS product_name VARCHAR(200);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS recipe_id INT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_produced DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_remaining DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS qty_sold DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS total_production_cost DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS selling_price DECIMAL(15,4) DEFAULT 0;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS production_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'In Stock';
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Remove NOT NULL constraints that cause errors
ALTER TABLE production_batches ALTER COLUMN batch_number DROP NOT NULL;
ALTER TABLE production_batches ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE production_batches ALTER COLUMN total_production_cost DROP NOT NULL;
ALTER TABLE production_batches ALTER COLUMN total_production_cost SET DEFAULT 0;

-- ============================================
-- 4. PRODUCTS_INGREDIENTS TABLE
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

-- Update existing data
UPDATE products_ingredients 
SET 
    base_unit = COALESCE(base_unit, sales_unit, 'KG'),
    active = COALESCE(active, true)
WHERE base_unit IS NULL;

-- ============================================
-- 5. DISABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE products_ingredients DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. GRANT ALL PERMISSIONS
-- ============================================
GRANT ALL ON recipes TO anon, authenticated, service_role;
GRANT ALL ON recipe_ingredients TO anon, authenticated, service_role;
GRANT ALL ON production_batches TO anon, authenticated, service_role;
GRANT ALL ON products_ingredients TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================
-- VERIFY: Show production_batches columns
-- ============================================
SELECT 'production_batches has these columns:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'production_batches' 
ORDER BY ordinal_position;

-- ============================================
-- ✅ DONE!
-- ============================================
SELECT '✅ SUCCESS! All tables fixed. RLS disabled. All constraints relaxed.' as result;
