-- ============================================================
-- STOCK & DISH MOVEMENT SCHEMA
-- Run this in Supabase SQL Editor
-- Adds tables for tracking stock movements and dish history
-- ============================================================

-- 1. Dish Movement / Dish History Table
-- Tracks production, sales, spoilage for dishes (finished products)
CREATE TABLE IF NOT EXISTS dish_movements (
    movement_id SERIAL PRIMARY KEY,
    
    -- Date/Time
    movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_id INT,
    shift_name VARCHAR(100),
    
    -- Product Info
    product_id INT REFERENCES products(pid),
    product_name VARCHAR(255),
    batch_id INT,
    batch_number VARCHAR(100),
    
    -- Movement Type
    movement_type VARCHAR(50) NOT NULL, -- 'Opening', 'Produced', 'Sold', 'Spoiled', 'Adjustment', 'Closing'
    
    -- Quantities
    quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'PCS',
    
    -- Values
    unit_cost DECIMAL(15,4) DEFAULT 0,
    unit_price DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    total_value DECIMAL(15,4) DEFAULT 0,
    
    -- Reference (for sales, spoilage, etc.)
    reference_no VARCHAR(100),
    reference_type VARCHAR(50), -- 'Sale', 'Production', 'Spoilage', 'Adjustment'
    reason TEXT,
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Dish Spoilage / Damage Table
CREATE TABLE IF NOT EXISTS dish_spoilage (
    spoilage_id SERIAL PRIMARY KEY,
    
    -- Date/Time
    spoilage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    spoilage_time TIME DEFAULT CURRENT_TIME,
    shift_id INT,
    shift_name VARCHAR(100),
    
    -- Product Info
    product_id INT REFERENCES products(pid),
    product_name VARCHAR(255),
    batch_id INT,
    batch_number VARCHAR(100),
    
    -- Spoilage Details
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50) DEFAULT 'PCS',
    unit_cost DECIMAL(15,4) DEFAULT 0,
    total_loss DECIMAL(15,4) DEFAULT 0,
    
    -- Reason
    spoilage_type VARCHAR(50) DEFAULT 'Damaged', -- 'Expired', 'Damaged', 'Burnt', 'Returned', 'Other'
    reason TEXT,
    
    -- Audit
    recorded_by VARCHAR(100),
    approved_by VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Ingredient/Stock Movement Table
-- Tracks purchases, issues (for recipes), returns, adjustments
CREATE TABLE IF NOT EXISTS stock_movements (
    movement_id SERIAL PRIMARY KEY,
    
    -- Date/Time
    movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_id INT,
    shift_name VARCHAR(100),
    
    -- Product Info (ingredient/raw material)
    product_id INT REFERENCES products(pid),
    product_name VARCHAR(255),
    product_code VARCHAR(50),
    
    -- Movement Type
    movement_type VARCHAR(50) NOT NULL, -- 'Opening', 'Purchase', 'Return', 'Issue', 'Adjustment', 'Closing'
    
    -- Quantities
    quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'PCS',
    
    -- Values
    unit_cost DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    
    -- Reference
    reference_no VARCHAR(100), -- Purchase No, Production Batch No, etc.
    reference_type VARCHAR(50), -- 'Purchase', 'Production', 'Adjustment', 'Return'
    reason TEXT,
    
    -- For Recipe Issues
    batch_id INT, -- Production batch that consumed this ingredient
    batch_number VARCHAR(100),
    recipe_id INT,
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Daily Stock Summary View (for dishes)
CREATE OR REPLACE VIEW dish_daily_summary AS
SELECT 
    dm.movement_date,
    dm.product_id,
    dm.product_name,
    dm.shift_id,
    dm.shift_name,
    
    -- Opening (first movement of day)
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Opening' THEN dm.quantity ELSE 0 END), 0) as opening_qty,
    
    -- Produced
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Produced' THEN dm.quantity ELSE 0 END), 0) as produced_qty,
    
    -- Sold
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Sold' THEN dm.quantity ELSE 0 END), 0) as sold_qty,
    
    -- Spoiled
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Spoiled' THEN dm.quantity ELSE 0 END), 0) as spoiled_qty,
    
    -- Adjustments
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Adjustment' THEN dm.quantity ELSE 0 END), 0) as adjusted_qty,
    
    -- Closing (calculated)
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Opening' THEN dm.quantity ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Produced' THEN dm.quantity ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Sold' THEN dm.quantity ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Spoiled' THEN dm.quantity ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Adjustment' THEN dm.quantity ELSE 0 END), 0) as closing_qty,
    
    -- Values
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Sold' THEN dm.total_value ELSE 0 END), 0) as total_sales,
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Sold' THEN dm.total_cost ELSE 0 END), 0) as total_cost,
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Sold' THEN dm.total_value - dm.total_cost ELSE 0 END), 0) as total_profit,
    COALESCE(SUM(CASE WHEN dm.movement_type = 'Spoiled' THEN dm.total_cost ELSE 0 END), 0) as total_spoilage_loss
    
FROM dish_movements dm
GROUP BY dm.movement_date, dm.product_id, dm.product_name, dm.shift_id, dm.shift_name
ORDER BY dm.movement_date DESC, dm.product_name;

-- 5. Daily Stock Summary View (for ingredients)
CREATE OR REPLACE VIEW stock_daily_summary AS
SELECT 
    sm.movement_date,
    sm.product_id,
    sm.product_name,
    sm.shift_id,
    sm.shift_name,
    sm.unit,
    
    -- Opening
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Opening' THEN sm.quantity ELSE 0 END), 0) as opening_qty,
    
    -- Purchased
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Purchase' THEN sm.quantity ELSE 0 END), 0) as purchased_qty,
    
    -- Returned (returned to supplier)
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Return' THEN sm.quantity ELSE 0 END), 0) as returned_qty,
    
    -- Issued (for production/recipes)
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Issue' THEN sm.quantity ELSE 0 END), 0) as issued_qty,
    
    -- Adjustments
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Adjustment' THEN sm.quantity ELSE 0 END), 0) as adjusted_qty,
    
    -- Closing (calculated)
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Opening' THEN sm.quantity ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Purchase' THEN sm.quantity ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Return' THEN sm.quantity ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Issue' THEN sm.quantity ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN sm.movement_type = 'Adjustment' THEN sm.quantity ELSE 0 END), 0) as closing_qty,
    
    -- Values
    COALESCE(SUM(sm.total_cost), 0) as total_value
    
FROM stock_movements sm
GROUP BY sm.movement_date, sm.product_id, sm.product_name, sm.shift_id, sm.shift_name, sm.unit
ORDER BY sm.movement_date DESC, sm.product_name;

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_dish_movements_date ON dish_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_dish_movements_product ON dish_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_dish_movements_type ON dish_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_dish_movements_shift ON dish_movements(shift_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_shift ON stock_movements(shift_id);

CREATE INDEX IF NOT EXISTS idx_dish_spoilage_date ON dish_spoilage(spoilage_date);
CREATE INDEX IF NOT EXISTS idx_dish_spoilage_product ON dish_spoilage(product_id);

-- 7. Disable RLS on new tables
ALTER TABLE dish_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE dish_spoilage DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;

-- 8. Function to create opening balance from previous day's closing
CREATE OR REPLACE FUNCTION create_daily_opening_balance()
RETURNS void AS $$
DECLARE
    today DATE := CURRENT_DATE;
    yesterday DATE := CURRENT_DATE - 1;
BEGIN
    -- Create dish opening balances from yesterday's closing
    INSERT INTO dish_movements (movement_date, product_id, product_name, movement_type, quantity, unit_cost, total_cost, created_by)
    SELECT 
        today,
        ds.product_id,
        ds.product_name,
        'Opening',
        ds.closing_qty,
        0,
        0,
        'System'
    FROM dish_daily_summary ds
    WHERE ds.movement_date = yesterday
    AND ds.closing_qty > 0
    AND NOT EXISTS (
        SELECT 1 FROM dish_movements dm 
        WHERE dm.movement_date = today 
        AND dm.product_id = ds.product_id 
        AND dm.movement_type = 'Opening'
    );
    
    -- Create stock opening balances from yesterday's closing
    INSERT INTO stock_movements (movement_date, product_id, product_name, movement_type, quantity, unit, unit_cost, total_cost, created_by)
    SELECT 
        today,
        ss.product_id,
        ss.product_name,
        'Opening',
        ss.closing_qty,
        ss.unit,
        0,
        0,
        'System'
    FROM stock_daily_summary ss
    WHERE ss.movement_date = yesterday
    AND ss.closing_qty > 0
    AND NOT EXISTS (
        SELECT 1 FROM stock_movements sm 
        WHERE sm.movement_date = today 
        AND sm.product_id = ss.product_id 
        AND sm.movement_type = 'Opening'
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DONE! ✅
-- Tables created:
-- - dish_movements: Tracks dish production, sales, spoilage
-- - dish_spoilage: Records spoiled/damaged dishes
-- - stock_movements: Tracks ingredient purchases, issues, returns
-- 
-- Views created:
-- - dish_daily_summary: Daily dish movement summary
-- - stock_daily_summary: Daily stock/ingredient summary
-- 
-- Function created:
-- - create_daily_opening_balance(): Creates opening balances
-- ============================================================

SELECT 'Stock movement schema created successfully!' as result;
