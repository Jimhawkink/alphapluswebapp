-- ============================================================
-- ALPHA PLUS HOTEL - SUPPLIERS, TAX, CATEGORIES, UNITS TABLES
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Suppliers Table - SUP-01 format
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
    balance_type VARCHAR(10) DEFAULT 'Credit', -- Credit or Debit
    current_balance DECIMAL(15,2) DEFAULT 0,
    payment_terms VARCHAR(100),
    notes TEXT,
    is_kitchen BOOLEAN DEFAULT false, -- True for internal kitchen supplier
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tax Settings Table
CREATE TABLE IF NOT EXISTS tax_settings (
    tax_id SERIAL PRIMARY KEY,
    tax_code VARCHAR(20) UNIQUE,
    tax_name VARCHAR(100) NOT NULL,
    tax_rate DECIMAL(10,4) DEFAULT 0, -- Percentage (e.g., 16 for 16%)
    tax_type VARCHAR(50) DEFAULT 'VAT', -- VAT, Zero Rated, Exempt, Tourism Levy, Service Charge
    is_inclusive BOOLEAN DEFAULT false, -- True = inclusive, False = exclusive
    applies_to VARCHAR(50) DEFAULT 'All', -- All, Food, Beverages, Services, Accommodation
    is_default BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Product Units Table (dynamic instead of hardcoded)
CREATE TABLE IF NOT EXISTS product_units (
    unit_id SERIAL PRIMARY KEY,
    unit_code VARCHAR(20) UNIQUE,
    unit_name VARCHAR(50) NOT NULL,
    abbreviation VARCHAR(10),
    description TEXT,
    is_base_unit BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default units
INSERT INTO product_units (unit_code, unit_name, abbreviation, is_base_unit) VALUES
('UNT-01', 'Piece', 'Pc', true),
('UNT-02', 'Kilogram', 'Kg', true),
('UNT-03', 'Gram', 'g', false),
('UNT-04', 'Liter', 'L', true),
('UNT-05', 'Milliliter', 'ml', false),
('UNT-06', 'Box', 'Box', false),
('UNT-07', 'Pack', 'Pk', false),
('UNT-08', 'Dozen', 'Dz', false),
('UNT-09', 'Bottle', 'Btl', false),
('UNT-10', 'Plate', 'Plt', false),
('UNT-11', 'Serving', 'Srv', false),
('UNT-12', 'Cup', 'Cup', false),
('UNT-13', 'Bag', 'Bag', false),
('UNT-14', 'Carton', 'Ctn', false),
('UNT-15', 'Tin', 'Tin', false),
('UNT-16', 'Sachet', 'Sct', false)
ON CONFLICT (unit_code) DO NOTHING;

-- Insert default tax settings
INSERT INTO tax_settings (tax_code, tax_name, tax_rate, tax_type, is_inclusive, applies_to, is_default) VALUES
('TAX-01', 'VAT 16%', 16.00, 'VAT', false, 'All', true),
('TAX-02', 'Zero Rated', 0.00, 'Zero Rated', false, 'All', false),
('TAX-03', 'VAT Exempt', 0.00, 'Exempt', false, 'All', false),
('TAX-04', 'Tourism Levy', 2.00, 'Tourism Levy', false, 'Accommodation', false),
('TAX-05', 'Service Charge', 10.00, 'Service Charge', true, 'Services', false),
('TAX-06', 'Catering Levy', 2.00, 'Catering Levy', false, 'Food', false)
ON CONFLICT (tax_code) DO NOTHING;

-- Insert default categories if not exists
INSERT INTO product_categories (category_name, description, icon, color) VALUES
('Breakfast', 'Morning meals', '🍳', '#F59E0B'),
('Main Course', 'Main dishes', '🍽️', '#EF4444'),
('Appetizers', 'Starters and appetizers', '🥗', '#10B981'),
('Soups', 'Hot soups', '🍲', '#6366F1'),
('Grills', 'Grilled items', '🔥', '#DC2626'),
('Seafood', 'Fish and seafood', '🐟', '#06B6D4'),
('Pasta', 'Pasta dishes', '🍝', '#F97316'),
('Rice Dishes', 'Rice-based meals', '🍚', '#FBBF24'),
('Juices', 'Fresh juices', '🧃', '#84CC16'),
('Hot Drinks', 'Coffee and tea', '☕', '#7C3AED'),
('Alcoholic', 'Beer, wine, spirits', '🍺', '#B91C1C'),
('Combo Meals', 'Meal deals', '🍱', '#2563EB')
ON CONFLICT (category_name) DO NOTHING;

-- Disable RLS
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE tax_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_units DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONE! ✅
-- Suppliers: SUP-01, SUP-02, ...
-- Tax settings with rates and inclusive/exclusive
-- Dynamic units and categories
-- ============================================================
