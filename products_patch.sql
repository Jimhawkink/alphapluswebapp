-- ============================================================
-- ALPHA PLUS - ADD MISSING COLUMNS TO PRODUCTS TABLE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add missing columns to products table
DO $$
BEGIN
    -- Add active column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'active') THEN
        ALTER TABLE products ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;

    -- Add alias column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'alias') THEN
        ALTER TABLE products ADD COLUMN alias VARCHAR(100);
    END IF;

    -- Add vat_commodity column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'vat_commodity') THEN
        ALTER TABLE products ADD COLUMN vat_commodity VARCHAR(50) DEFAULT 'Standard';
    END IF;

    -- Add description column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'description') THEN
        ALTER TABLE products ADD COLUMN description TEXT;
    END IF;

    -- Add purchase_unit column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'purchase_unit') THEN
        ALTER TABLE products ADD COLUMN purchase_unit VARCHAR(50) DEFAULT 'Piece';
    END IF;

    -- Add sales_unit column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'sales_unit') THEN
        ALTER TABLE products ADD COLUMN sales_unit VARCHAR(50) DEFAULT 'Piece';
    END IF;

    -- Add reorder_point column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'reorder_point') THEN
        ALTER TABLE products ADD COLUMN reorder_point INTEGER DEFAULT 10;
    END IF;

    -- Add margin_per column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'margin_per') THEN
        ALTER TABLE products ADD COLUMN margin_per DECIMAL(10,2) DEFAULT 0;
    END IF;

    -- Add show_ps column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'show_ps') THEN
        ALTER TABLE products ADD COLUMN show_ps BOOLEAN DEFAULT true;
    END IF;

    -- Add button_ui_color column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'button_ui_color') THEN
        ALTER TABLE products ADD COLUMN button_ui_color VARCHAR(100) DEFAULT 'from-blue-400 to-blue-600';
    END IF;

    -- Add photo column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'photo') THEN
        ALTER TABLE products ADD COLUMN photo TEXT;
    END IF;

    -- Add hscode column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'hscode') THEN
        ALTER TABLE products ADD COLUMN hscode VARCHAR(50);
    END IF;

    -- Add batch_no column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'batch_no') THEN
        ALTER TABLE products ADD COLUMN batch_no VARCHAR(50);
    END IF;

    -- Add supplier_name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'supplier_name') THEN
        ALTER TABLE products ADD COLUMN supplier_name VARCHAR(200);
    END IF;

    -- Add added_date column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'added_date') THEN
        ALTER TABLE products ADD COLUMN added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    -- Add updated_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'updated_at') THEN
        ALTER TABLE products ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    -- Add created_at column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'created_at') THEN
        ALTER TABLE products ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Set all existing products as active
UPDATE products SET active = true WHERE active IS NULL;

-- Disable RLS
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONE! ✅
-- Added columns: active, alias, vat_commodity, description, 
-- purchase_unit, sales_unit, reorder_point, margin_per, 
-- show_ps, button_ui_color, photo, hscode, batch_no, 
-- supplier_name, added_date, updated_at, created_at
-- ============================================================
