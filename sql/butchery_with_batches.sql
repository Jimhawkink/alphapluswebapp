-- ============================================
-- BUTCHERY POS WITH BATCH MANAGEMENT
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. DROP EXISTING TABLES (clean start)
DROP TABLE IF EXISTS meat_weight_loss CASCADE;
DROP TABLE IF EXISTS butchery_sales CASCADE;
DROP TABLE IF EXISTS meat_batches CASCADE;
DROP TABLE IF EXISTS meat_types CASCADE;

-- 2. MEAT TYPES TABLE
CREATE TABLE meat_types (
    meat_type_id SERIAL PRIMARY KEY,
    meat_type_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. MEAT BATCHES TABLE (Main inventory table)
CREATE TABLE meat_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_code VARCHAR(50) UNIQUE NOT NULL,
    meat_type_id INTEGER REFERENCES meat_types(meat_type_id),
    purchase_date DATE DEFAULT CURRENT_DATE,
    initial_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    available_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    cost_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    supplier_name VARCHAR(200),
    expiry_date DATE,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'Active',  -- Active, Sold Out, Expired
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. BUTCHERY SALES TABLE
CREATE TABLE butchery_sales (
    sale_id SERIAL PRIMARY KEY,
    sale_code VARCHAR(50) NOT NULL,
    batch_id INTEGER REFERENCES meat_batches(batch_id),
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
    served_by VARCHAR(100) DEFAULT 'Web',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. WEIGHT LOSS TABLE
CREATE TABLE meat_weight_loss (
    loss_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES meat_batches(batch_id),
    loss_weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
    loss_type VARCHAR(50) NOT NULL DEFAULT 'Other',  -- Drying, Bone, Trim, Spoilage, Other
    reason TEXT,
    recorded_by VARCHAR(100) DEFAULT 'Web',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ENABLE RLS
ALTER TABLE meat_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchery_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE meat_weight_loss ENABLE ROW LEVEL SECURITY;

-- 7. CREATE OPEN POLICIES
CREATE POLICY "Allow all" ON meat_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON meat_batches FOR ALL USING (true) WITH CHECK (true);
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

-- 9. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX idx_batches_meat_type ON meat_batches(meat_type_id);
CREATE INDEX idx_batches_status ON meat_batches(status);
CREATE INDEX idx_sales_batch ON butchery_sales(batch_id);
CREATE INDEX idx_sales_date ON butchery_sales(sale_date);
CREATE INDEX idx_weight_loss_batch ON meat_weight_loss(batch_id);

-- ============================================
-- DONE! Tables created with batch support! 🎉
-- ============================================
