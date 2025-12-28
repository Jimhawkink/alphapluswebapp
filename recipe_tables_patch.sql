-- ============================================================
-- ALPHA PLUS - COMPLETE RECIPE TABLES SETUP
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- ============================================
-- 1. RECIPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    dish_name VARCHAR(200) NOT NULL,
    barcode VARCHAR(50),
    qty_produced DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0,
    recipe_date DATE DEFAULT CURRENT_DATE,
    batch_number VARCHAR(50),
    created_by VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to recipes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'cost_per_unit') THEN
        ALTER TABLE recipes ADD COLUMN cost_per_unit DECIMAL(15,4) DEFAULT 0;
    END IF;
END $$;

-- Drop unique constraint on batch_number if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_batch_number_key') THEN
        ALTER TABLE recipes DROP CONSTRAINT recipes_batch_number_key;
    END IF;
END $$;

-- ============================================
-- 2. RECIPE_INGREDIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    recipe_id INT REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    ingredient_product_id INT NOT NULL,
    ingredient_name VARCHAR(200),
    unit_measure VARCHAR(50),
    qty_issued DECIMAL(15,4) DEFAULT 0,
    convert_unit VARCHAR(50),
    rate DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    remaining_qty DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to recipe_ingredients
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_ingredients' AND column_name = 'convert_unit') THEN
        ALTER TABLE recipe_ingredients ADD COLUMN convert_unit VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_ingredients' AND column_name = 'rate') THEN
        ALTER TABLE recipe_ingredients ADD COLUMN rate DECIMAL(15,4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_ingredients' AND column_name = 'remaining_qty') THEN
        ALTER TABLE recipe_ingredients ADD COLUMN remaining_qty DECIMAL(15,4) DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- 3. PRODUCTION_BATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) NOT NULL,
    product_id INT NOT NULL,
    product_name VARCHAR(200),
    recipe_id INT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
    qty_produced DECIMAL(15,4) DEFAULT 0,
    qty_remaining DECIMAL(15,4) DEFAULT 0,
    qty_sold DECIMAL(15,4) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0,
    selling_price DECIMAL(15,4) DEFAULT 0,
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'In Stock',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to production_batches
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_batches' AND column_name = 'selling_price') THEN
        ALTER TABLE production_batches ADD COLUMN selling_price DECIMAL(15,4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_batches' AND column_name = 'created_by') THEN
        ALTER TABLE production_batches ADD COLUMN created_by VARCHAR(100);
    END IF;
END $$;

-- ============================================
-- 4. PRODUCTS_INGREDIENTS TABLE - Add missing columns
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'base_unit') THEN
        ALTER TABLE products_ingredients ADD COLUMN base_unit VARCHAR(20) DEFAULT 'KG';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'price_per_pack') THEN
        ALTER TABLE products_ingredients ADD COLUMN price_per_pack DECIMAL(15,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'cost_per_base_unit') THEN
        ALTER TABLE products_ingredients ADD COLUMN cost_per_base_unit DECIMAL(15,4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'current_stock') THEN
        ALTER TABLE products_ingredients ADD COLUMN current_stock DECIMAL(15,4) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'active') THEN
        ALTER TABLE products_ingredients ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'reorder_point') THEN
        ALTER TABLE products_ingredients ADD COLUMN reorder_point DECIMAL(15,4) DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'supplier_name') THEN
        ALTER TABLE products_ingredients ADD COLUMN supplier_name VARCHAR(200);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products_ingredients' AND column_name = 'category') THEN
        ALTER TABLE products_ingredients ADD COLUMN category VARCHAR(100) DEFAULT 'Raw Materials';
    END IF;
END $$;

-- Update existing ingredients with calculated costs
UPDATE products_ingredients 
SET 
    base_unit = COALESCE(base_unit, sales_unit, 'KG'),
    price_per_pack = COALESCE(price_per_pack, sales_cost, 0),
    cost_per_base_unit = CASE 
        WHEN COALESCE(pack_size, 1) > 0 THEN COALESCE(sales_cost, 0) / COALESCE(pack_size, 1)
        ELSE COALESCE(sales_cost, 0) 
    END,
    active = COALESCE(active, true)
WHERE cost_per_base_unit IS NULL OR cost_per_base_unit = 0;

-- ============================================
-- 5. DISABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;

-- Also for products_ingredients if exists
DO $$
BEGIN
    EXECUTE 'ALTER TABLE products_ingredients DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================
GRANT ALL ON recipes TO anon, authenticated;
GRANT ALL ON recipe_ingredients TO anon, authenticated;
GRANT ALL ON production_batches TO anon, authenticated;

-- Grant sequence permissions
DO $$
BEGIN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE recipes_recipe_id_seq TO anon, authenticated';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE recipe_ingredients_ingredient_id_seq TO anon, authenticated';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE production_batches_batch_id_seq TO anon, authenticated';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================
-- DONE! ✅
-- ============================================
SELECT 'SUCCESS! All tables created/updated. RLS disabled. Permissions granted.' as result;
