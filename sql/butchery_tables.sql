-- ============================================
-- BUTCHERY POS DATABASE TABLES
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- 1. MEAT TYPES TABLE
-- Stores different types of meat (Beef, Goat, Chicken, etc.)
CREATE TABLE IF NOT EXISTS meat_types (
    meat_type_id SERIAL PRIMARY KEY,
    meat_type_name VARCHAR(100) NOT NULL,
    description TEXT,
    default_price DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample meat types
INSERT INTO meat_types (meat_type_name, description, default_price, is_active) VALUES
('Beef', 'Fresh beef cuts', 550, true),
('Goat', 'Fresh goat meat', 600, true),
('Chicken', 'Fresh whole chicken/parts', 450, true),
('Pork', 'Fresh pork cuts', 500, true),
('Lamb', 'Fresh lamb meat', 700, true),
('Fish', 'Fresh fish', 400, true)
ON CONFLICT DO NOTHING;


-- 2. MEAT STOCK TABLE
-- Tracks available meat inventory
CREATE TABLE IF NOT EXISTS meat_stock (
    stock_id SERIAL PRIMARY KEY,
    stock_code VARCHAR(50) UNIQUE NOT NULL,
    meat_type_id INTEGER REFERENCES meat_types(meat_type_id),
    initial_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    available_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    cost_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    supplier_name VARCHAR(200),
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expiry_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'In Stock',
    notes TEXT,
    created_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_meat_stock_meat_type ON meat_stock(meat_type_id);
CREATE INDEX IF NOT EXISTS idx_meat_stock_status ON meat_stock(status);


-- 3. BUTCHERY SALES TABLE
-- Records all meat sales transactions
CREATE TABLE IF NOT EXISTS butchery_sales (
    sale_id SERIAL PRIMARY KEY,
    sale_code VARCHAR(50) UNIQUE NOT NULL,
    stock_id INTEGER REFERENCES meat_stock(stock_id),
    meat_type_name VARCHAR(100),
    weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    cost_per_kg DECIMAL(10,2) DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    payment_reference VARCHAR(100),
    customer_name VARCHAR(200),
    customer_contact VARCHAR(50),
    notes TEXT,
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    served_by VARCHAR(100) DEFAULT 'System',
    shift_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_butchery_sales_date ON butchery_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_butchery_sales_stock ON butchery_sales(stock_id);
CREATE INDEX IF NOT EXISTS idx_butchery_sales_payment ON butchery_sales(payment_mode);


-- 4. MEAT WEIGHT LOSS TABLE
-- Tracks weight losses (drying, bone, spoilage, etc.)
CREATE TABLE IF NOT EXISTS meat_weight_loss (
    loss_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES meat_stock(stock_id),
    loss_weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    loss_type VARCHAR(50) NOT NULL DEFAULT 'Other',  -- Drying, Bone, Trim, Spoilage, Other
    reason TEXT,
    recorded_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_weight_loss_stock ON meat_weight_loss(stock_id);
CREATE INDEX IF NOT EXISTS idx_weight_loss_type ON meat_weight_loss(loss_type);


-- 5. BUTCHERY DAILY SUMMARY TABLE (Optional - for fast dashboard)
CREATE TABLE IF NOT EXISTS butchery_daily_summary (
    summary_id SERIAL PRIMARY KEY,
    summary_date DATE UNIQUE NOT NULL,
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_weight_sold DECIMAL(10,3) DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    total_profit DECIMAL(12,2) DEFAULT 0,
    total_weight_loss DECIMAL(10,3) DEFAULT 0,
    cash_sales DECIMAL(12,2) DEFAULT 0,
    mpesa_sales DECIMAL(12,2) DEFAULT 0,
    credit_sales DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE meat_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchery_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_weight_loss ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchery_daily_summary ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (full access)
CREATE POLICY "Enable all access for authenticated users" ON meat_types
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for authenticated users" ON meat_stock
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for authenticated users" ON butchery_sales
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for authenticated users" ON meat_weight_loss
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for authenticated users" ON butchery_daily_summary
    FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- USEFUL FUNCTIONS
-- ============================================

-- Function to get next sale code
CREATE OR REPLACE FUNCTION get_next_butchery_sale_code()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_code FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM butchery_sales
    WHERE sale_code LIKE 'SAL%';
    
    RETURN 'SAL' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- VIEWS FOR QUICK QUERIES
-- ============================================

-- View for stock with meat type name
CREATE OR REPLACE VIEW v_meat_stock AS
SELECT 
    ms.*,
    mt.meat_type_name,
    mt.default_price,
    (ms.available_kg * ms.selling_price) as stock_value,
    (ms.available_kg * (ms.selling_price - ms.cost_per_kg)) as potential_profit
FROM meat_stock ms
LEFT JOIN meat_types mt ON ms.meat_type_id = mt.meat_type_id;


-- View for today's butchery dashboard
CREATE OR REPLACE VIEW v_butchery_dashboard AS
SELECT 
    (SELECT COALESCE(SUM(net_amount), 0) FROM butchery_sales WHERE DATE(sale_date) = CURRENT_DATE) as today_sales,
    (SELECT COALESCE(SUM(weight_kg), 0) FROM butchery_sales WHERE DATE(sale_date) = CURRENT_DATE) as today_weight_sold,
    (SELECT COUNT(*) FROM butchery_sales WHERE DATE(sale_date) = CURRENT_DATE) as today_transactions,
    (SELECT COALESCE(SUM(available_kg), 0) FROM meat_stock WHERE available_kg > 0) as available_stock,
    (SELECT COALESCE(SUM(loss_weight_kg), 0) FROM meat_weight_loss WHERE DATE(created_at) = CURRENT_DATE) as today_weight_loss;


-- ============================================
-- DONE! 🎉
-- ============================================
-- Tables created:
-- 1. meat_types - Different meat categories
-- 2. meat_stock - Meat inventory tracking
-- 3. butchery_sales - Sales transactions
-- 4. meat_weight_loss - Weight loss tracking
-- 5. butchery_daily_summary - Daily summaries (optional)
-- ============================================
