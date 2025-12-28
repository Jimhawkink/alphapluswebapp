-- ============================================================
-- ALPHA PLUS - RECIPE TABLES PATCH
-- Run this in Supabase SQL Editor to ensure recipe tables work
-- ============================================================

-- Create recipes table if not exists
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

-- Create recipe_ingredients table if not exists
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    recipe_id INT REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    ingredient_product_id INT NOT NULL,
    ingredient_name VARCHAR(200),
    unit_measure VARCHAR(20),
    qty_issued DECIMAL(15,4) DEFAULT 0,
    convert_unit VARCHAR(20),
    rate DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    remaining_qty DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create production_batches table if not exists
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) NOT NULL,
    product_id INT NOT NULL,
    product_name VARCHAR(200),
    recipe_id INT REFERENCES recipes(recipe_id),
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

-- Remove UNIQUE constraint from batch_number if it exists (causes issues with duplicates)
DO $$
BEGIN
    -- Drop the unique constraint on recipes.batch_number if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'recipes_batch_number_key' 
        AND conrelid = 'recipes'::regclass
    ) THEN
        ALTER TABLE recipes DROP CONSTRAINT recipes_batch_number_key;
    END IF;
END $$;

-- DISABLE ROW LEVEL SECURITY on all recipe-related tables
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable all for recipes" ON recipes;
DROP POLICY IF EXISTS "Enable all for recipe_ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Enable all for production_batches" ON production_batches;

-- Grant all permissions
GRANT ALL ON recipes TO anon, authenticated;
GRANT ALL ON recipe_ingredients TO anon, authenticated;
GRANT ALL ON production_batches TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE recipes_recipe_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE recipe_ingredients_ingredient_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE production_batches_batch_id_seq TO anon, authenticated;

-- ============================================================
-- DONE! ✅
-- Tables: recipes, recipe_ingredients, production_batches
-- RLS: DISABLED
-- Permissions: GRANTED
-- ============================================================
