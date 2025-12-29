-- ============================================================
-- ALPHA PLUS - COMPLETE SETUP FOR PURCHASES & MOVEMENT TRACKING
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================
-- 1. SUPPLIERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(20) UNIQUE,
    supplier_name VARCHAR(200) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    phone VARCHAR(50),
    phone2 VARCHAR(50),
    email VARCHAR(100),
    contact_person VARCHAR(100),
    kra_pin VARCHAR(50),
    opening_balance DECIMAL(15,2) DEFAULT 0,
    balance_type VARCHAR(10) DEFAULT 'Credit',
    current_balance DECIMAL(15,2) DEFAULT 0,
    payment_terms VARCHAR(100),
    notes TEXT,
    is_kitchen BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. PRODUCTS INGREDIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products_ingredients (
    pid SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'Raw Materials',
    base_unit VARCHAR(50) DEFAULT 'KG',
    sales_unit VARCHAR(50) DEFAULT 'KG',
    pack_size DECIMAL(15,3) DEFAULT 1,
    price_per_pack DECIMAL(15,4) DEFAULT 0,
    cost_per_base_unit DECIMAL(15,4) DEFAULT 0,
    sales_cost DECIMAL(15,4) DEFAULT 0,
    current_stock DECIMAL(15,3) DEFAULT 0,
    reorder_point DECIMAL(15,3) DEFAULT 10,
    supplier_name VARCHAR(200),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. PRODUCT CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS product_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(10),
    color VARCHAR(20),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. PURCHASES TABLE (Main)
-- ============================================
DROP TABLE IF EXISTS purchase_products CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;

CREATE TABLE purchases (
    purchase_id SERIAL PRIMARY KEY,
    purchase_no VARCHAR(50) UNIQUE,
    purchase_date DATE DEFAULT CURRENT_DATE,
    supplier_id INT,
    supplier_name VARCHAR(200),
    supplier_invoice VARCHAR(100),
    sub_total DECIMAL(15,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    vat DECIMAL(15,2) DEFAULT 0,
    grand_total DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending',
    payment_status VARCHAR(50) DEFAULT 'Unpaid',
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. PURCHASE PRODUCTS TABLE (Items)
-- ============================================
CREATE TABLE purchase_products (
    pp_id SERIAL PRIMARY KEY,
    purchase_id INT REFERENCES purchases(purchase_id) ON DELETE CASCADE,
    product_id INT,
    product_code VARCHAR(50),
    product_name VARCHAR(255),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'PCS',
    rate DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 6. DISH SPOILAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS dish_spoilage (
    spoilage_id SERIAL PRIMARY KEY,
    spoilage_date DATE DEFAULT CURRENT_DATE,
    product_id INT,
    product_name VARCHAR(255),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit_cost DECIMAL(15,4) DEFAULT 0,
    total_loss DECIMAL(15,4) DEFAULT 0,
    reason TEXT,
    reported_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 7. RECIPE INGREDIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ri_id SERIAL PRIMARY KEY,
    recipe_id INT,
    recipe_date DATE DEFAULT CURRENT_DATE,
    ingredient_product_id INT,
    ingredient_name VARCHAR(255),
    qty_issued DECIMAL(15,4) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'KG',
    rate DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DISABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE products_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE dish_spoilage DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;

-- ============================================
-- DROP RLS POLICIES IF EXIST
-- ============================================
DROP POLICY IF EXISTS "Enable all for authenticated" ON purchases;
DROP POLICY IF EXISTS "Enable all for authenticated" ON purchase_products;
DROP POLICY IF EXISTS "Enable all for anon" ON purchases;
DROP POLICY IF EXISTS "Enable all for anon" ON purchase_products;

-- CREATE OPEN POLICIES
CREATE POLICY "Allow all purchases" ON purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all purchase_products" ON purchase_products FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Insert default categories
INSERT INTO product_categories (category_name, description, icon, color) VALUES
('Raw Materials', 'Basic cooking ingredients', '🥬', '#10B981'),
('Spices', 'Spices and seasonings', '🌶️', '#EF4444'),
('Dairy', 'Milk, cheese, butter', '🥛', '#3B82F6'),
('Meat', 'Chicken, beef, fish', '🍖', '#DC2626'),
('Vegetables', 'Fresh vegetables', '🥕', '#22C55E'),
('Fruits', 'Fresh fruits', '🍎', '#F59E0B'),
('Grains', 'Rice, flour, pasta', '🌾', '#D97706'),
('Oils & Fats', 'Cooking oils and fats', '🫒', '#84CC16'),
('Beverages', 'Drinks and juices', '🧃', '#06B6D4')
ON CONFLICT (category_name) DO NOTHING;

-- Insert sample suppliers
INSERT INTO suppliers (supplier_code, supplier_name, phone, contact_person, active) VALUES
('SUP-01', 'ABC Distributors', '0712345678', 'John Doe', true),
('SUP-02', 'Fresh Foods Ltd', '0723456789', 'Jane Smith', true),
('SUP-03', 'Quick Supplies', '0734567890', 'Mike Johnson', true),
('SUP-04', 'Farm Direct', '0745678901', 'Sarah Williams', true)
ON CONFLICT (supplier_code) DO NOTHING;

-- Insert sample ingredients
INSERT INTO products_ingredients (product_code, product_name, category, base_unit, pack_size, price_per_pack, cost_per_base_unit, current_stock, reorder_point, active) VALUES
('PIG-001', 'Sugar 50KG', 'Raw Materials', 'KG', 50, 3500, 70, 100, 20, true),
('PIG-002', 'Cooking Oil 20L', 'Oils & Fats', 'L', 20, 3000, 150, 40, 10, true),
('PIG-003', 'Wheat Flour 50KG', 'Grains', 'KG', 50, 3200, 64, 150, 25, true),
('PIG-004', 'Rice 25KG', 'Grains', 'KG', 25, 2500, 100, 75, 15, true),
('PIG-005', 'Salt 50KG', 'Raw Materials', 'KG', 50, 1200, 24, 100, 20, true),
('PIG-006', 'Onions', 'Vegetables', 'KG', 1, 80, 80, 30, 10, true),
('PIG-007', 'Tomatoes', 'Vegetables', 'KG', 1, 100, 100, 25, 10, true),
('PIG-008', 'Potatoes', 'Vegetables', 'KG', 1, 60, 60, 50, 15, true),
('PIG-009', 'Eggs Tray', 'Dairy', 'TRAY', 1, 480, 16, 10, 5, true),
('PIG-010', 'Fresh Milk 1L', 'Dairy', 'L', 1, 65, 65, 20, 10, true)
ON CONFLICT (product_code) DO NOTHING;

-- ============================================
-- Create indexes for better performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_products_purchase ON purchase_products(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_products_product ON purchase_products(product_id);

-- ============================================================
-- DONE! ✅
-- All tables created with RLS disabled and sample data inserted
-- ============================================================
