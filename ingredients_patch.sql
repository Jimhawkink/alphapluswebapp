-- ============================================================
-- ALPHA PLUS - ADD MISSING COLUMNS TO PRODUCTS_INGREDIENTS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add missing columns to products_ingredients table
DO $$
BEGIN
    -- Add base_unit column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'base_unit') THEN
        ALTER TABLE products_ingredients ADD COLUMN base_unit VARCHAR(20) DEFAULT 'KG';
    END IF;

    -- Add price_per_pack column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'price_per_pack') THEN
        ALTER TABLE products_ingredients ADD COLUMN price_per_pack DECIMAL(15,2) DEFAULT 0;
    END IF;

    -- Add cost_per_base_unit column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'cost_per_base_unit') THEN
        ALTER TABLE products_ingredients ADD COLUMN cost_per_base_unit DECIMAL(15,4) DEFAULT 0;
    END IF;

    -- Add current_stock column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'current_stock') THEN
        ALTER TABLE products_ingredients ADD COLUMN current_stock DECIMAL(15,4) DEFAULT 0;
    END IF;

    -- Add active column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'active') THEN
        ALTER TABLE products_ingredients ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;

    -- Add reorder_point column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'reorder_point') THEN
        ALTER TABLE products_ingredients ADD COLUMN reorder_point DECIMAL(15,4) DEFAULT 10;
    END IF;

    -- Add supplier_name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'supplier_name') THEN
        ALTER TABLE products_ingredients ADD COLUMN supplier_name VARCHAR(200);
    END IF;

    -- Add category column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'category') THEN
        ALTER TABLE products_ingredients ADD COLUMN category VARCHAR(100) DEFAULT 'Raw Materials';
    END IF;

    -- Add updated_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products_ingredients' AND column_name = 'updated_at') THEN
        ALTER TABLE products_ingredients ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Update existing ingredients to set proper defaults
UPDATE products_ingredients 
SET base_unit = COALESCE(sales_unit, 'KG'),
    price_per_pack = COALESCE(sales_cost, 0),
    cost_per_base_unit = CASE 
        WHEN pack_size > 0 THEN COALESCE(sales_cost, 0) / pack_size 
        ELSE COALESCE(sales_cost, 0) 
    END,
    current_stock = COALESCE(current_stock, 0),
    active = true
WHERE base_unit IS NULL OR cost_per_base_unit IS NULL;

-- Disable RLS
ALTER TABLE products_ingredients DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONE! ✅
-- Added columns: base_unit, price_per_pack, cost_per_base_unit,
-- current_stock, active, reorder_point, supplier_name, category
-- ============================================================
