-- ============================================
-- BUTCHERY POS - SIMPLE TABLES FOR SUPABASE
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================

-- 1. DROP EXISTING TABLES (if they exist with wrong structure)
DROP TABLE IF EXISTS meat_weight_loss CASCADE;
DROP TABLE IF EXISTS butchery_sales CASCADE;
DROP TABLE IF EXISTS meat_stock CASCADE;
DROP TABLE IF EXISTS meat_types CASCADE;

-- 2. CREATE MEAT TYPES TABLE
CREATE TABLE meat_types (
    meat_type_id SERIAL PRIMARY KEY,
    meat_type_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CREATE MEAT STOCK TABLE  
CREATE TABLE meat_stock (
    stock_id SERIAL PRIMARY KEY,
    stock_code VARCHAR(50),
    meat_type_id INTEGER REFERENCES meat_types(meat_type_id),
    initial_kg DECIMAL(10,3) DEFAULT 0,
    available_kg DECIMAL(10,3) DEFAULT 0,
    cost_per_kg DECIMAL(10,2) DEFAULT 0,
    selling_price DECIMAL(10,2) DEFAULT 0,
    supplier_name VARCHAR(200),
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. CREATE BUTCHERY SALES TABLE
CREATE TABLE butchery_sales (
    sale_id SERIAL PRIMARY KEY,
    sale_code VARCHAR(50),
    stock_id INTEGER REFERENCES meat_stock(stock_id),
    meat_type_name VARCHAR(100),
    weight_kg DECIMAL(10,3) DEFAULT 0,
    price_per_kg DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    cost_per_kg DECIMAL(10,2) DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    payment_reference VARCHAR(100),
    customer_name VARCHAR(200),
    customer_contact VARCHAR(50),
    notes TEXT,
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    served_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. CREATE WEIGHT LOSS TABLE
CREATE TABLE meat_weight_loss (
    loss_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES meat_stock(stock_id),
    loss_weight_kg DECIMAL(10,3) DEFAULT 0,
    loss_type VARCHAR(50) DEFAULT 'Other',
    reason TEXT,
    recorded_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ENABLE ROW LEVEL SECURITY
ALTER TABLE meat_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchery_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_weight_loss ENABLE ROW LEVEL SECURITY;

-- 7. CREATE OPEN POLICIES (Allow all access)
CREATE POLICY "Allow all" ON meat_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON meat_stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON butchery_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON meat_weight_loss FOR ALL USING (true) WITH CHECK (true);

-- 8. INSERT SAMPLE MEAT TYPES
INSERT INTO meat_types (meat_type_name, description, is_active) VALUES
('Beef', 'Fresh beef cuts', true),
('Goat', 'Fresh goat meat', true),
('Chicken', 'Fresh chicken', true),
('Pork', 'Fresh pork', true),
('Lamb', 'Fresh lamb', true),
('Fish', 'Fresh fish', true);

-- ============================================
-- DONE! Tables created successfully! 🎉
-- ============================================
