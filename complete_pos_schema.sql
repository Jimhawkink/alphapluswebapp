-- ============================================================
-- ALPHA PLUS HOTEL - COMPLETE POS SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Restaurant Rooms/Areas
CREATE TABLE IF NOT EXISTS restaurant_rooms (
    room_id SERIAL PRIMARY KEY,
    room_name VARCHAR(100) NOT NULL,
    room_code VARCHAR(20) UNIQUE,
    description TEXT,
    max_tables INT DEFAULT 10,
    floor_number INT DEFAULT 1,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Restaurant Tables
CREATE TABLE IF NOT EXISTS restaurant_tables (
    table_id SERIAL PRIMARY KEY,
    table_code VARCHAR(20) UNIQUE,
    table_name VARCHAR(100) NOT NULL,
    room_id INT REFERENCES restaurant_rooms(room_id),
    capacity INT DEFAULT 4,
    status VARCHAR(20) DEFAULT 'Available', -- Available, Occupied, Reserved, Cleaning
    current_order_id INT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Recipe Master (Dish production records)
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL, -- The dish being produced
    dish_name VARCHAR(200) NOT NULL,
    barcode VARCHAR(50),
    qty_produced DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0, -- Total cost / qty produced
    recipe_date DATE DEFAULT CURRENT_DATE,
    batch_number VARCHAR(50) UNIQUE,
    created_by VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active', -- Active, Completed, Cancelled
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Recipe Ingredients (Items used in recipe)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    recipe_id INT REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    ingredient_product_id INT NOT NULL, -- From products_ingredients
    ingredient_name VARCHAR(200),
    unit_measure VARCHAR(20),
    qty_issued DECIMAL(15,4) DEFAULT 0,
    convert_unit VARCHAR(20),
    rate DECIMAL(15,4) DEFAULT 0, -- Unit cost of ingredient
    total_cost DECIMAL(15,4) DEFAULT 0, -- Calculated cost for this ingredient
    remaining_qty DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Production Batches (Stock of produced items)
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) UNIQUE NOT NULL,
    product_id INT NOT NULL, -- The dish
    product_name VARCHAR(200),
    recipe_id INT REFERENCES recipes(recipe_id),
    qty_produced DECIMAL(15,4) DEFAULT 0,
    qty_remaining DECIMAL(15,4) DEFAULT 0,
    qty_sold DECIMAL(15,4) DEFAULT 0,
    cost_per_unit DECIMAL(15,4) DEFAULT 0, -- Production cost per unit
    selling_price DECIMAL(15,4) DEFAULT 0,
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'In Stock', -- In Stock, Low Stock, Out of Stock, Expired
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create Sales Table if not exists (with all required columns)
CREATE TABLE IF NOT EXISTS sales (
    sale_id SERIAL PRIMARY KEY,
    receipt_no VARCHAR(50) UNIQUE,
    sale_date DATE DEFAULT CURRENT_DATE,
    sale_time TIME DEFAULT CURRENT_TIME,
    sale_datetime TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Shift tracking
    shift_id INT,
    shift_name VARCHAR(50), -- Day Shift, Night Shift
    shift_code VARCHAR(20),
    
    -- Waiter/Server tracking
    waiter_id INT,
    waiter_name VARCHAR(100),
    
    -- Table tracking
    table_id INT,
    table_name VARCHAR(100),
    room_name VARCHAR(100),
    
    -- Order info
    order_type VARCHAR(30) DEFAULT 'Quick Sale', -- Quick Sale, Table Order, Takeaway
    kot_number VARCHAR(50),
    customer_name VARCHAR(100),
    customer_phone VARCHAR(50),
    
    -- Financial
    subtotal DECIMAL(15,4) DEFAULT 0,
    discount DECIMAL(15,4) DEFAULT 0,
    discount_percent DECIMAL(10,4) DEFAULT 0,
    
    -- Tax (optional)
    subtotal_before_tax DECIMAL(15,4) DEFAULT 0,
    tax_rate DECIMAL(10,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    tax_type VARCHAR(50), -- VAT, Zero Rated, etc.
    is_tax_inclusive BOOLEAN DEFAULT false,
    
    -- Totals
    total_amount DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0, -- Sum of cost prices
    profit DECIMAL(15,4) DEFAULT 0, -- total_amount - total_cost
    
    -- Payment
    payment_method VARCHAR(50) DEFAULT 'Cash', -- Cash, M-Pesa, Card, Credit
    amount_paid DECIMAL(15,4) DEFAULT 0,
    change_amount DECIMAL(15,4) DEFAULT 0,
    mpesa_code VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'Completed', -- Pending, Completed, Cancelled, Refunded
    notes TEXT,
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if table already exists (for existing databases)
DO $$
BEGIN
    -- Add sale_time if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'sale_time') THEN
        ALTER TABLE sales ADD COLUMN sale_time TIME DEFAULT CURRENT_TIME;
    END IF;
    
    -- Add sale_datetime if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'sale_datetime') THEN
        ALTER TABLE sales ADD COLUMN sale_datetime TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Add shift_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'shift_id') THEN
        ALTER TABLE sales ADD COLUMN shift_id INT;
    END IF;
    
    -- Add shift_name if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'shift_name') THEN
        ALTER TABLE sales ADD COLUMN shift_name VARCHAR(50);
    END IF;
    
    -- Add shift_code if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'shift_code') THEN
        ALTER TABLE sales ADD COLUMN shift_code VARCHAR(20);
    END IF;
    
    -- Add waiter_id column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'waiter_id') THEN
        ALTER TABLE sales ADD COLUMN waiter_id INT;
    END IF;
    
    -- Add waiter_name column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'waiter_name') THEN
        ALTER TABLE sales ADD COLUMN waiter_name VARCHAR(100);
    END IF;
    
    -- Add table_id column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'table_id') THEN
        ALTER TABLE sales ADD COLUMN table_id INT;
    END IF;
    
    -- Add table_name column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'table_name') THEN
        ALTER TABLE sales ADD COLUMN table_name VARCHAR(100);
    END IF;
    
    -- Add room_name column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'room_name') THEN
        ALTER TABLE sales ADD COLUMN room_name VARCHAR(100);
    END IF;
    
    -- Add total_cost column (for profit calculation)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'total_cost') THEN
        ALTER TABLE sales ADD COLUMN total_cost DECIMAL(15,4) DEFAULT 0;
    END IF;
    
    -- Add profit column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'profit') THEN
        ALTER TABLE sales ADD COLUMN profit DECIMAL(15,4) DEFAULT 0;
    END IF;
    
    -- Add order_type column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'order_type') THEN
        ALTER TABLE sales ADD COLUMN order_type VARCHAR(30) DEFAULT 'Quick Sale';
    END IF;
    
    -- Add kot_number column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'kot_number') THEN
        ALTER TABLE sales ADD COLUMN kot_number VARCHAR(50);
    END IF;
    
    -- Add tax_amount column (optional - for tax tracking)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'tax_amount') THEN
        ALTER TABLE sales ADD COLUMN tax_amount DECIMAL(15,4) DEFAULT 0;
    END IF;
    
    -- Add tax_rate column (optional)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'tax_rate') THEN
        ALTER TABLE sales ADD COLUMN tax_rate DECIMAL(10,4) DEFAULT 0;
    END IF;
    
    -- Add tax_type column (optional - VAT, Zero Rated, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'tax_type') THEN
        ALTER TABLE sales ADD COLUMN tax_type VARCHAR(50);
    END IF;
    
    -- Add is_tax_inclusive column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'is_tax_inclusive') THEN
        ALTER TABLE sales ADD COLUMN is_tax_inclusive BOOLEAN DEFAULT false;
    END IF;
    
    -- Add subtotal_before_tax column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'subtotal_before_tax') THEN
        ALTER TABLE sales ADD COLUMN subtotal_before_tax DECIMAL(15,4) DEFAULT 0;
    END IF;
END $$;

-- Disable RLS on sales if not done
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;

-- 7. Food Order Notes Table (Preset notes for KOT)
CREATE TABLE IF NOT EXISTS food_order_notes (
    note_id SERIAL PRIMARY KEY,
    note_code VARCHAR(20) UNIQUE,
    note_text VARCHAR(100) NOT NULL, -- "No Salt", "Extra Spicy", "Well Done"
    note_category VARCHAR(50) DEFAULT 'General', -- General, Spice Level, Cooking, Allergy
    icon VARCHAR(10), -- Emoji for quick selection
    display_order INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default food order notes
INSERT INTO food_order_notes (note_code, note_text, note_category, icon, display_order) VALUES
('NO-SALT', 'No Salt', 'Seasoning', '🧂', 1),
('LESS-SALT', 'Less Salt', 'Seasoning', '🧂', 2),
('NO-SUGAR', 'No Sugar', 'Seasoning', '🍬', 3),
('EXTRA-SPICY', 'Extra Spicy', 'Spice Level', '🌶️', 4),
('MILD', 'Mild/Not Spicy', 'Spice Level', '🥬', 5),
('MEDIUM-SPICY', 'Medium Spicy', 'Spice Level', '🌶️', 6),
('WELL-DONE', 'Well Done', 'Cooking', '🔥', 7),
('MEDIUM', 'Medium', 'Cooking', '🍳', 8),
('RARE', 'Rare', 'Cooking', '🥩', 9),
('NO-ONION', 'No Onion', 'Allergy', '🧅', 10),
('NO-GARLIC', 'No Garlic', 'Allergy', '🧄', 11),
('GLUTEN-FREE', 'Gluten Free', 'Allergy', '🌾', 12),
('DAIRY-FREE', 'No Dairy', 'Allergy', '🥛', 13),
('VEGETARIAN', 'Vegetarian', 'Diet', '🥗', 14),
('NO-OIL', 'Less/No Oil', 'Diet', '🫒', 15),
('EXTRA-SAUCE', 'Extra Sauce', 'Extras', '🫗', 16),
('NO-SAUCE', 'No Sauce', 'Extras', '🚫', 17),
('TAKEAWAY', 'Pack for Takeaway', 'Service', '📦', 18),
('URGENT', 'Urgent/Rush', 'Service', '⚡', 19),
('HOLD', 'Hold/Delay', 'Service', '⏸️', 20)
ON CONFLICT (note_code) DO NOTHING;

ALTER TABLE food_order_notes DISABLE ROW LEVEL SECURITY;

-- 7. Sales Items Table (Individual items in a sale)
CREATE TABLE IF NOT EXISTS sales_items (
    item_id SERIAL PRIMARY KEY,
    sale_id INT REFERENCES sales(sale_id) ON DELETE CASCADE,
    product_id INT NOT NULL,
    product_name VARCHAR(200),
    batch_id INT, -- From production_batches
    batch_number VARCHAR(50),
    quantity INT DEFAULT 1,
    unit_price DECIMAL(15,4) DEFAULT 0, -- Selling price
    cost_price DECIMAL(15,4) DEFAULT 0, -- From batch cost_per_unit
    discount DECIMAL(15,4) DEFAULT 0,
    subtotal DECIMAL(15,4) DEFAULT 0,
    profit DECIMAL(15,4) DEFAULT 0, -- (unit_price - cost_price) * quantity
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. KOT (Kitchen Order Tickets)
CREATE TABLE IF NOT EXISTS kitchen_orders (
    kot_id SERIAL PRIMARY KEY,
    kot_number VARCHAR(50) UNIQUE NOT NULL,
    sale_id INT REFERENCES sales(sale_id),
    table_id INT REFERENCES restaurant_tables(table_id),
    table_name VARCHAR(100),
    waiter_id INT,
    waiter_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Preparing, Ready, Served, Cancelled
    notes TEXT,
    printed_at TIMESTAMP WITH TIME ZONE,
    prepared_at TIMESTAMP WITH TIME ZONE,
    served_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. KOT Items
CREATE TABLE IF NOT EXISTS kot_items (
    kot_item_id SERIAL PRIMARY KEY,
    kot_id INT REFERENCES kitchen_orders(kot_id) ON DELETE CASCADE,
    product_id INT NOT NULL,
    product_name VARCHAR(200),
    quantity INT DEFAULT 1,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Preparing, Ready
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- SHIFT MANAGEMENT TABLES
-- ============================================================

-- 12. Shift Definitions (Day Shift, Night Shift templates)
CREATE TABLE IF NOT EXISTS shift_definitions (
    definition_id SERIAL PRIMARY KEY,
    shift_name VARCHAR(50) NOT NULL, -- 'Day Shift', 'Night Shift'
    shift_code VARCHAR(20) UNIQUE,
    start_time TIME, -- e.g., 06:00
    end_time TIME, -- e.g., 18:00
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Shift Instances (Actual shifts worked)
CREATE TABLE IF NOT EXISTS shift_instances (
    shift_id SERIAL PRIMARY KEY,
    shift_code VARCHAR(50) UNIQUE, -- e.g., DS-20231228-001
    definition_id INT REFERENCES shift_definitions(definition_id),
    shift_name VARCHAR(50), -- Copied from definition
    
    -- Timing
    shift_date DATE DEFAULT CURRENT_DATE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Staff
    started_by_id INT,
    started_by_name VARCHAR(100),
    ended_by_id INT,
    ended_by_name VARCHAR(100),
    
    -- Opening
    opening_cash DECIMAL(15,4) DEFAULT 0,
    opening_notes TEXT,
    
    -- Closing Summary (calculated when shift ends)
    total_sales DECIMAL(15,4) DEFAULT 0,
    total_cash_sales DECIMAL(15,4) DEFAULT 0,
    total_mpesa_sales DECIMAL(15,4) DEFAULT 0,
    total_card_sales DECIMAL(15,4) DEFAULT 0,
    total_credit_sales DECIMAL(15,4) DEFAULT 0,
    
    -- Deductions
    total_expenses DECIMAL(15,4) DEFAULT 0,
    total_vouchers DECIMAL(15,4) DEFAULT 0,
    total_petty_cash DECIMAL(15,4) DEFAULT 0,
    total_refunds DECIMAL(15,4) DEFAULT 0,
    
    -- Net
    expected_cash DECIMAL(15,4) DEFAULT 0, -- opening_cash + cash_sales - expenses - petty_cash
    actual_cash DECIMAL(15,4) DEFAULT 0, -- Counted cash
    cash_variance DECIMAL(15,4) DEFAULT 0, -- actual - expected
    net_sales DECIMAL(15,4) DEFAULT 0, -- total_sales - expenses - vouchers - petty_cash
    
    -- Status
    status VARCHAR(20) DEFAULT 'Active', -- Active, Closed, Cancelled
    closing_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Shift Cash Drops (Multiple drops during shift)
CREATE TABLE IF NOT EXISTS shift_cash_drops (
    drop_id SERIAL PRIMARY KEY,
    shift_id INT REFERENCES shift_instances(shift_id) ON DELETE CASCADE,
    drop_type VARCHAR(20) DEFAULT 'Opening', -- Opening, During, Closing
    amount DECIMAL(15,4) DEFAULT 0,
    dropped_by_id INT,
    dropped_by_name VARCHAR(100),
    notes TEXT,
    dropped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Shift Expenses (Expenses during shift)
CREATE TABLE IF NOT EXISTS shift_expenses (
    expense_id SERIAL PRIMARY KEY,
    shift_id INT REFERENCES shift_instances(shift_id) ON DELETE CASCADE,
    expense_type VARCHAR(50), -- Petty Cash, Voucher, Supplier Payment, etc.
    description TEXT,
    amount DECIMAL(15,4) DEFAULT 0,
    paid_to VARCHAR(100),
    approved_by_id INT,
    approved_by_name VARCHAR(100),
    receipt_no VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default shift definitions
INSERT INTO shift_definitions (shift_name, shift_code, start_time, end_time, description) VALUES
('Day Shift', 'DAY', '06:00', '18:00', 'Morning to evening shift'),
('Night Shift', 'NIGHT', '18:00', '06:00', 'Evening to morning shift'),
('Full Day', 'FULL', '00:00', '23:59', '24-hour operations')
ON CONFLICT (shift_code) DO NOTHING;

-- Function to generate shift code
CREATE OR REPLACE FUNCTION generate_shift_code(shift_type VARCHAR)
RETURNS VARCHAR(50) AS $$
DECLARE
    date_code VARCHAR(8);
    seq INT;
    code VARCHAR(50);
BEGIN
    date_code := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    SELECT COALESCE(COUNT(*), 0) + 1 INTO seq
    FROM shift_instances
    WHERE DATE(started_at) = CURRENT_DATE;
    
    code := shift_type || '-' || date_code || '-' || LPAD(seq::TEXT, 3, '0');
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Disable RLS on shift tables
ALTER TABLE shift_definitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_cash_drops DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_expenses DISABLE ROW LEVEL SECURITY;


-- Insert default rooms
INSERT INTO restaurant_rooms (room_name, room_code, description) VALUES
('Main Restaurant', 'MR', 'Main dining area'),
('Outdoor Area', 'OA', 'Outdoor seating'),
('VIP Lounge', 'VIP', 'Private VIP section'),
('Bar Area', 'BAR', 'Bar and lounge'),
('Rooftop', 'RT', 'Rooftop dining'),
('Private Room', 'PR', 'Private events room')
ON CONFLICT (room_code) DO NOTHING;

-- Insert default tables for Main Restaurant
INSERT INTO restaurant_tables (table_code, table_name, room_id, capacity) 
SELECT 
    'MR-T' || t.n,
    'Table ' || t.n,
    r.room_id,
    CASE WHEN t.n <= 4 THEN 2 WHEN t.n <= 8 THEN 4 ELSE 6 END
FROM (SELECT generate_series(1, 12) as n) t
CROSS JOIN restaurant_rooms r
WHERE r.room_code = 'MR'
ON CONFLICT (table_code) DO NOTHING;

-- Insert default tables for VIP
INSERT INTO restaurant_tables (table_code, table_name, room_id, capacity) 
SELECT 
    'VIP-T' || t.n,
    'VIP Table ' || t.n,
    r.room_id,
    6
FROM (SELECT generate_series(1, 4) as n) t
CROSS JOIN restaurant_rooms r
WHERE r.room_code = 'VIP'
ON CONFLICT (table_code) DO NOTHING;

-- Insert default tables for Bar
INSERT INTO restaurant_tables (table_code, table_name, room_id, capacity) 
SELECT 
    'BAR-T' || t.n,
    'Bar Stool ' || t.n,
    r.room_id,
    2
FROM (SELECT generate_series(1, 8) as n) t
CROSS JOIN restaurant_rooms r
WHERE r.room_code = 'BAR'
ON CONFLICT (table_code) DO NOTHING;

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INT;
    receipt VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(
        CASE 
            WHEN receipt_no ~ '^RCP-[0-9]+$' 
            THEN CAST(SUBSTRING(receipt_no FROM 5) AS INT)
            ELSE 0 
        END
    ), 0) + 1 INTO next_num
    FROM sales;
    
    receipt := 'RCP-' || LPAD(next_num::TEXT, 5, '0');
    RETURN receipt;
END;
$$ LANGUAGE plpgsql;

-- Function to generate KOT number
CREATE OR REPLACE FUNCTION generate_kot_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INT;
    kot VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(
        CASE 
            WHEN kot_number ~ '^KOT-[0-9]+$' 
            THEN CAST(SUBSTRING(kot_number FROM 5) AS INT)
            ELSE 0 
        END
    ), 0) + 1 INTO next_num
    FROM kitchen_orders;
    
    kot := 'KOT-' || LPAD(next_num::TEXT, 5, '0');
    RETURN kot;
END;
$$ LANGUAGE plpgsql;

-- Function to generate batch number
CREATE OR REPLACE FUNCTION generate_batch_number(product_id INT)
RETURNS VARCHAR(50) AS $$
DECLARE
    batch VARCHAR(50);
    date_code VARCHAR(8);
    seq INT;
BEGIN
    date_code := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    SELECT COALESCE(COUNT(*), 0) + 1 INTO seq
    FROM production_batches
    WHERE DATE(created_at) = CURRENT_DATE AND production_batches.product_id = generate_batch_number.product_id;
    
    batch := 'BATCH-' || date_code || '-' || product_id || '-' || LPAD(seq::TEXT, 3, '0');
    RETURN batch;
END;
$$ LANGUAGE plpgsql;

-- Disable RLS
ALTER TABLE restaurant_rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE kot_items DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONE! ✅
-- Tables created:
-- - restaurant_rooms: Room/Area management
-- - restaurant_tables: Table management with room linkage
-- - recipes: Recipe production records
-- - recipe_ingredients: Ingredients used in recipes
-- - production_batches: Stock of produced items
-- - sales_items: Individual items in sales with profit
-- - kitchen_orders: KOT management
-- - kot_items: KOT item details
-- 
-- Sales table updated with:
-- - waiter_id, waiter_name
-- - table_id, table_name
-- - total_cost, profit
-- - order_type, kot_number
-- ============================================================
