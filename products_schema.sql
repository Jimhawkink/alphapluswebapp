-- ============================================================
-- ALPHA PLUS HOTEL - PRODUCTS & INGREDIENTS TABLES
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Products Table (Dish Items) - PRD-01 format
CREATE TABLE IF NOT EXISTS products (
    pid SERIAL PRIMARY KEY,
    product_code VARCHAR(20) UNIQUE,
    product_name VARCHAR(200) NOT NULL,
    alias VARCHAR(100),
    vat_commodity VARCHAR(50) DEFAULT 'Standard',
    description TEXT,
    barcode VARCHAR(100),
    category VARCHAR(100),
    purchase_unit VARCHAR(50) DEFAULT 'Piece',
    sales_unit VARCHAR(50) DEFAULT 'Piece',
    purchase_cost DECIMAL(15,2) DEFAULT 0,
    sales_cost DECIMAL(15,2) DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    margin_per DECIMAL(10,2) DEFAULT 0,
    show_ps BOOLEAN DEFAULT true,
    button_ui_color VARCHAR(20) DEFAULT '#3B82F6',
    photo TEXT,
    hscode VARCHAR(50),
    batch_no VARCHAR(50),
    supplier_name VARCHAR(200),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Products Ingredients Table - PIG-01 format (Raw Materials)
CREATE TABLE IF NOT EXISTS products_ingredients (
    pid SERIAL PRIMARY KEY,
    product_code VARCHAR(20) UNIQUE,
    product_name VARCHAR(200) NOT NULL,
    alias VARCHAR(100),
    vat_commodity VARCHAR(50) DEFAULT 'Standard',
    description TEXT,
    barcode VARCHAR(100),
    category VARCHAR(100),
    purchase_unit VARCHAR(50) DEFAULT 'Piece',
    sales_unit VARCHAR(50) DEFAULT 'Piece',
    purchase_cost DECIMAL(15,2) DEFAULT 0,
    sales_cost DECIMAL(15,2) DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    margin_per DECIMAL(10,2) DEFAULT 0,
    show_ps BOOLEAN DEFAULT true,
    button_ui_color VARCHAR(20) DEFAULT '#10B981',
    photo TEXT,
    hscode VARCHAR(50),
    batch_no VARCHAR(50),
    supplier_name VARCHAR(200),
    -- Ingredient-specific fields
    pack_size DECIMAL(15,4) DEFAULT 1,  -- e.g., 50 for 50KG bag
    base_unit VARCHAR(50) DEFAULT 'KG', -- e.g., KG
    price_per_pack DECIMAL(15,2) DEFAULT 0, -- Price for the entire pack (50KG bag)
    cost_per_base_unit DECIMAL(15,4) DEFAULT 0, -- Auto-calculated: price_per_pack / pack_size
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Product Categories Table
CREATE TABLE IF NOT EXISTS product_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📦',
    color VARCHAR(20) DEFAULT '#3B82F6',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Insert default categories
INSERT INTO product_categories (category_name, description, icon, color) VALUES
('Food', 'Food items and meals', '🍕', '#EF4444'),
('Beverages', 'Drinks and beverages', '🥤', '#3B82F6'),
('Snacks', 'Snacks and light bites', '🍿', '#F59E0B'),
('Desserts', 'Desserts and sweets', '🍰', '#EC4899'),
('Raw Materials', 'Cooking ingredients', '🥬', '#10B981'),
('Packaging', 'Packaging materials', '📦', '#6366F1'),
('Cleaning', 'Cleaning supplies', '🧹', '#8B5CF6')
ON CONFLICT (category_name) DO NOTHING;

-- 5. Function to generate next product code
CREATE OR REPLACE FUNCTION generate_product_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INTEGER;
    new_code VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(product_code FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM products
    WHERE product_code LIKE 'PRD-%';
    
    new_code := 'PRD-' || LPAD(next_num::TEXT, 2, '0');
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to generate next ingredient code
CREATE OR REPLACE FUNCTION generate_ingredient_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INTEGER;
    new_code VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(product_code FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM products_ingredients
    WHERE product_code LIKE 'PIG-%';
    
    new_code := 'PIG-' || LPAD(next_num::TEXT, 2, '0');
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger to auto-calculate cost per base unit
CREATE OR REPLACE FUNCTION calculate_cost_per_base_unit()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pack_size > 0 THEN
        NEW.cost_per_base_unit := NEW.price_per_pack / NEW.pack_size;
    ELSE
        NEW.cost_per_base_unit := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_cost ON products_ingredients;
CREATE TRIGGER trigger_calculate_cost
    BEFORE INSERT OR UPDATE ON products_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION calculate_cost_per_base_unit();

-- 8. Disable RLS for easier access
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE products_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONE! ✅
-- Products: PRD-01, PRD-02, ...
-- Ingredients: PIG-01, PIG-02, ...
-- Cost per base unit auto-calculated from pack price/size
-- ============================================================
