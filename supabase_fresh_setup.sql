-- ============================================================
-- ALPHAPLUS HOTEL SYSTEM - FRESH DATABASE SETUP
-- This script DROPS existing tables and recreates them
-- Run this in Supabase SQL Editor
-- ============================================================

-- ⚠️ WARNING: This will delete all existing data!
-- Uncomment the DROP statements below if you want a fresh start

-- Drop existing tables in correct order (due to foreign key constraints)
DROP TABLE IF EXISTS meat_weight_losses CASCADE;
DROP TABLE IF EXISTS meat_sales CASCADE;
DROP TABLE IF EXISTS meat_stock CASCADE;
DROP TABLE IF EXISTS meat_types CASCADE;
DROP TABLE IF EXISTS shift_expenses CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS expense_types CASCADE;
DROP TABLE IF EXISTS purchase_products CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS production_batches CASCADE;
DROP TABLE IF EXISTS mpesa_transactions CASCADE;
DROP TABLE IF EXISTS invoice_payments CASCADE;
DROP TABLE IF EXISTS invoice_products CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS shift_cash_drops CASCADE;
DROP TABLE IF EXISTS shift_instances CASCADE;
DROP TABLE IF EXISTS shift_definitions CASCADE;
DROP TABLE IF EXISTS stock CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS tax_types CASCADE;
DROP TABLE IF EXISTS unit_master CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS user_rights CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organisation_settings CASCADE;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS & AUTHENTICATION
-- ============================================================

-- Users table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    user_code VARCHAR(20) UNIQUE,
    user_name VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(150) NOT NULL,
    user_type VARCHAR(50) NOT NULL DEFAULT 'Cashier',
    email VARCHAR(150),
    phone VARCHAR(20),
    national_id VARCHAR(50),
    salary_type VARCHAR(20) DEFAULT 'Monthly',
    salary_amount DECIMAL(15,2) DEFAULT 0,
    pin VARCHAR(6),
    active BOOLEAN DEFAULT true,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Roles Definition Table
CREATE TABLE user_roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    can_view BOOLEAN DEFAULT true,
    can_create BOOLEAN DEFAULT false,
    can_update BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_make_sales BOOLEAN DEFAULT false,
    can_receive_payments BOOLEAN DEFAULT false,
    can_view_reports BOOLEAN DEFAULT false,
    can_manage_users BOOLEAN DEFAULT false,
    can_manage_products BOOLEAN DEFAULT false,
    can_manage_inventory BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default roles
INSERT INTO user_roles (role_name, description, can_view, can_create, can_update, can_delete, can_make_sales, can_receive_payments, can_view_reports, can_manage_users, can_manage_products, can_manage_inventory, can_manage_settings, is_super_admin) VALUES
('Super Admin', 'Full system control - Cannot be modified', true, true, true, true, true, true, true, true, true, true, true, true),
('Manager', 'General management functions', true, true, true, false, true, true, true, false, true, true, false, false),
('Supervisor', 'User management & access control', true, true, true, false, true, true, true, true, false, false, false, false),
('Cashier', 'Sales and payment processing only', true, false, false, false, true, true, false, false, false, false, false, false),
('Waiter', 'Order taking only', true, false, false, false, true, false, false, false, false, false, false, false);

-- ⭐ CREATE SUPER ADMIN ACCOUNT
-- Username: superuser
-- Password: @JIm47jhC_7%#
INSERT INTO users (user_code, user_name, password_hash, name, user_type, email, active, is_super_admin) VALUES
('US-001', 'superuser', '@JIm47jhC_7%#', 'Super Administrator', 'Super Admin', 'admin@alphaplus.com', true, true);

-- User Rights (modules permissions)
CREATE TABLE user_rights (
    right_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    module_name VARCHAR(100) NOT NULL,
    can_save BOOLEAN DEFAULT false,
    can_update BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_view BOOLEAN DEFAULT true,
    UNIQUE(user_id, module_name)
);

-- ============================================================
-- 2. LOOKUP TABLES
-- ============================================================

CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    warehouse_name VARCHAR(200) NOT NULL,
    warehouse_type VARCHAR(50) DEFAULT 'Store',
    address TEXT,
    city VARCHAR(100),
    manager VARCHAR(150),
    active BOOLEAN DEFAULT true
);

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT true
);

CREATE TABLE unit_master (
    id SERIAL PRIMARY KEY,
    unit VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE tax_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    rate DECIMAL(5,2) DEFAULT 0
);

-- ============================================================
-- 3. PRODUCTS & STOCK
-- ============================================================

CREATE TABLE products (
    pid SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE,
    product_name VARCHAR(255) NOT NULL,
    alias VARCHAR(200),
    barcode VARCHAR(100),
    category VARCHAR(100),
    description TEXT,
    purchase_cost DECIMAL(15,2) DEFAULT 0,
    sales_cost DECIMAL(15,2) DEFAULT 0,
    margin_per DECIMAL(10,2) DEFAULT 0,
    purchase_unit VARCHAR(50) DEFAULT 'PCS',
    sales_unit VARCHAR(50) DEFAULT 'PCS',
    vat_commodity VARCHAR(100),
    vat DECIMAL(5,2) DEFAULT 0,
    reorder_point INT DEFAULT 5,
    supplier_name VARCHAR(200),
    hs_code VARCHAR(50),
    batch_no VARCHAR(100),
    show_in_pos BOOLEAN DEFAULT true,
    button_ui_color INT,
    photo TEXT,
    added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE stock (
    st_id SERIAL PRIMARY KEY,
    pid INT REFERENCES products(pid) ON DELETE CASCADE,
    invoice_no VARCHAR(100),
    qty DECIMAL(15,3) DEFAULT 0,
    mfg_date DATE,
    expiry_date DATE,
    godown_id VARCHAR(100),
    batch_no VARCHAR(100),
    storage_type VARCHAR(50) DEFAULT 'Store',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 4. SHIFT MANAGEMENT
-- ============================================================

CREATE TABLE shift_definitions (
    shift_def_id SERIAL PRIMARY KEY,
    shift_name VARCHAR(100) NOT NULL,
    shift_code VARCHAR(10) NOT NULL UNIQUE,
    start_time TIME,
    end_time TIME,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

INSERT INTO shift_definitions (shift_name, shift_code, start_time, end_time, description) VALUES
('Day Shift', 'D', '06:00', '18:00', 'Day shift 6AM to 6PM'),
('Night Shift', 'N', '18:00', '07:00', 'Night shift 6PM to 7AM');

CREATE TABLE shift_instances (
    shift_instance_id SERIAL PRIMARY KEY,
    shift_def_id INT REFERENCES shift_definitions(shift_def_id),
    shift_date DATE NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    opening_cash DECIMAL(15,2) DEFAULT 0,
    closing_cash DECIMAL(15,2),
    expected_cash DECIMAL(15,2),
    cash_variance DECIMAL(15,2),
    till_id VARCHAR(50),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    shift_status VARCHAR(20) DEFAULT 'Open',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE shift_cash_drops (
    cash_drop_id SERIAL PRIMARY KEY,
    shift_instance_id INT REFERENCES shift_instances(shift_instance_id) ON DELETE CASCADE,
    drop_amount DECIMAL(15,2) NOT NULL,
    drop_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    dropped_by VARCHAR(100),
    reason TEXT
);

-- ============================================================
-- 5. INVOICES/SALES
-- ============================================================

CREATE TABLE invoices (
    inv_id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(100) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name VARCHAR(200) DEFAULT 'Walk-in Customer',
    cust_id VARCHAR(50),
    member_id VARCHAR(50),
    loyalty_member_id VARCHAR(50),
    salesman_name VARCHAR(200),
    salesman_id VARCHAR(50),
    user_id VARCHAR(50),
    disc_per DECIMAL(5,2) DEFAULT 0,
    disc_amt DECIMAL(15,2) DEFAULT 0,
    grand_total DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_margin DECIMAL(15,2) DEFAULT 0,
    cash DECIMAL(15,2) DEFAULT 0,
    change_amount DECIMAL(15,2) DEFAULT 0,
    total_cash DECIMAL(15,2) DEFAULT 0,
    total_mpesa DECIMAL(15,2) DEFAULT 0,
    total_credit DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    outstanding DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending',
    payment_status VARCHAR(50) DEFAULT 'Not Paid',
    currency_code VARCHAR(10) DEFAULT 'KES',
    exchange_rate DECIMAL(10,4) DEFAULT 1,
    shift_instance_id INT REFERENCES shift_instances(shift_instance_id),
    shift_code VARCHAR(10),
    bill_note TEXT,
    lp VARCHAR(50),
    is_merged BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE invoice_products (
    ip_id SERIAL PRIMARY KEY,
    inv_id INT REFERENCES invoices(inv_id) ON DELETE CASCADE,
    product_id INT REFERENCES products(pid),
    product_code VARCHAR(50),
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    quantity INT NOT NULL DEFAULT 1,
    sales_rate DECIMAL(15,2) NOT NULL,
    purchase_rate DECIMAL(15,2) DEFAULT 0,
    discount_per DECIMAL(5,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    vat_per DECIMAL(5,2) DEFAULT 0,
    vat DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    margin DECIMAL(15,2) DEFAULT 0,
    batch_number VARCHAR(100),
    cost_per_unit DECIMAL(15,2),
    mfg_date DATE,
    expiry_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE invoice_payments (
    payment_id SERIAL PRIMARY KEY,
    inv_id INT REFERENCES invoices(inv_id) ON DELETE CASCADE,
    invoice_no VARCHAR(100),
    payment_mode VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    mpesa_receipt_number VARCHAR(100),
    mpesa_checkout_request_id VARCHAR(100),
    phone_number VARCHAR(20),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_by VARCHAR(100),
    notes TEXT
);

-- ============================================================
-- 6. M-PESA TRANSACTIONS
-- ============================================================

CREATE TABLE mpesa_transactions (
    id SERIAL PRIMARY KEY,
    checkout_request_id VARCHAR(100) UNIQUE,
    merchant_request_id VARCHAR(100),
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    account_reference VARCHAR(100),
    transaction_desc TEXT,
    result_code INT,
    result_desc TEXT,
    mpesa_receipt_number VARCHAR(100),
    transaction_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'Pending',
    inv_id INT REFERENCES invoices(inv_id),
    invoice_no VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 7. PRODUCTION / RECIPE MANAGEMENT
-- ============================================================

CREATE TABLE production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(100) UNIQUE NOT NULL,
    product_id INT REFERENCES products(pid),
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    qty_produced DECIMAL(15,3) NOT NULL,
    qty_remaining DECIMAL(15,3) NOT NULL,
    total_production_cost DECIMAL(15,2) NOT NULL,
    cost_per_unit DECIMAL(15,4) NOT NULL,
    purchase_rate DECIMAL(15,2),
    sales_rate DECIMAL(15,2),
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'Active',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE recipe_ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    batch_id INT REFERENCES production_batches(batch_id) ON DELETE CASCADE,
    recipe_id INT,
    ingredient_product_id INT REFERENCES products(pid),
    ingredient_name VARCHAR(255),
    unit_measure VARCHAR(50),
    qty_issued DECIMAL(15,3) NOT NULL,
    rate DECIMAL(15,2) NOT NULL,
    total_cost DECIMAL(15,2) NOT NULL,
    remaining_qty DECIMAL(15,3),
    recipe_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 8. PURCHASES
-- ============================================================

CREATE TABLE purchases (
    purchase_id SERIAL PRIMARY KEY,
    purchase_no VARCHAR(100) UNIQUE NOT NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    supplier_id INT REFERENCES companies(id),
    supplier_name VARCHAR(200),
    sub_total DECIMAL(15,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    vat DECIMAL(15,2) DEFAULT 0,
    grand_total DECIMAL(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    payment_status VARCHAR(50) DEFAULT 'Not Paid',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE purchase_products (
    pp_id SERIAL PRIMARY KEY,
    purchase_id INT REFERENCES purchases(purchase_id) ON DELETE CASCADE,
    product_id INT REFERENCES products(pid),
    product_code VARCHAR(50),
    product_name VARCHAR(255),
    quantity INT NOT NULL,
    rate DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    mfg_date DATE,
    expiry_date DATE,
    batch_no VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 9. EXPENSES
-- ============================================================

CREATE TABLE expense_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_name VARCHAR(200) NOT NULL,
    expense_type VARCHAR(100),
    amount DECIMAL(15,2),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE shift_expenses (
    expense_id SERIAL PRIMARY KEY,
    shift_id INT REFERENCES shift_instances(shift_instance_id),
    expense_category VARCHAR(100),
    expense_description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    recorded_by VARCHAR(100),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 10. BUTCHERY (MEAT SALES)
-- ============================================================

CREATE TABLE meat_types (
    meat_type_id SERIAL PRIMARY KEY,
    meat_type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE meat_stock (
    stock_id SERIAL PRIMARY KEY,
    stock_code VARCHAR(100) UNIQUE,
    meat_type_id INT REFERENCES meat_types(meat_type_id),
    initial_weight_kg DECIMAL(10,3) NOT NULL,
    available_kg DECIMAL(10,3) NOT NULL,
    sold_kg DECIMAL(10,3) DEFAULT 0,
    loss_kg DECIMAL(10,3) DEFAULT 0,
    cost_per_kg DECIMAL(15,2) NOT NULL,
    selling_price DECIMAL(15,2) NOT NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(200),
    batch_no VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE meat_sales (
    sale_id SERIAL PRIMARY KEY,
    sale_code VARCHAR(100) UNIQUE NOT NULL,
    stock_id INT REFERENCES meat_stock(stock_id),
    weight_kg DECIMAL(10,3) NOT NULL,
    price_per_kg DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    discount DECIMAL(15,2) DEFAULT 0,
    net_amount DECIMAL(15,2) NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    payment_reference VARCHAR(100),
    customer_name VARCHAR(200),
    customer_contact VARCHAR(50),
    notes TEXT,
    served_by VARCHAR(100),
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE meat_weight_losses (
    loss_id SERIAL PRIMARY KEY,
    stock_id INT REFERENCES meat_stock(stock_id),
    loss_weight_kg DECIMAL(10,3) NOT NULL,
    loss_type VARCHAR(50) DEFAULT 'Other',
    reason TEXT,
    recorded_by VARCHAR(100),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 11. ORGANISATION SETTINGS
-- ============================================================

CREATE TABLE organisation_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'text',
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO organisation_settings (setting_key, setting_value, description) VALUES
('company_name', 'Alpha Plus Hotel', 'Company/Business name'),
('address', '', 'Business address'),
('phone', '0720316175', 'Business phone'),
('email', '', 'Business email'),
('tax_pin', '', 'Tax PIN/VAT number'),
('receipt_header', 'Alpha Plus Hotel System', 'Receipt header text'),
('receipt_footer', 'Thank you for your business!', 'Receipt footer text'),
('currency', 'KES', 'Default currency'),
('enable_shifts', 'true', 'Enable shift management');

-- ============================================================
-- 12. SAMPLE DATA
-- ============================================================

INSERT INTO categories (category_name) VALUES
('Food'), ('Beverages'), ('Snacks'), ('Dairy'), ('Meat'), ('Vegetables'), ('Fruits'), ('Others');

INSERT INTO unit_master (unit) VALUES
('PCS'), ('KG'), ('LTR'), ('PKT'), ('BTL'), ('BOX'), ('CARTON'), ('GMS'), ('MLS');

INSERT INTO expense_types (type_name) VALUES
('Transport'), ('Utilities'), ('Supplies'), ('Maintenance'), ('Wages'), ('Miscellaneous');

-- ============================================================
-- 13. ENABLE PUBLIC ACCESS FOR ANON KEY
-- ============================================================

-- Disable RLS for simpler access (you can enable later with proper policies)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_definitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_settings DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. PROTECT SUPER ADMIN ACCOUNT
-- Cannot be deleted, edited, or changed
-- ============================================================

-- Function to prevent deletion of super admin
CREATE OR REPLACE FUNCTION prevent_superadmin_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_super_admin = true THEN
        RAISE EXCEPTION 'Super Admin account cannot be deleted!';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Function to prevent modification of super admin critical fields
CREATE OR REPLACE FUNCTION prevent_superadmin_modify()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_super_admin = true THEN
        -- Prevent changing username, password, or super admin status
        IF NEW.user_name != OLD.user_name THEN
            RAISE EXCEPTION 'Super Admin username cannot be changed!';
        END IF;
        IF NEW.is_super_admin != OLD.is_super_admin THEN
            RAISE EXCEPTION 'Super Admin status cannot be changed!';
        END IF;
        IF NEW.active = false THEN
            RAISE EXCEPTION 'Super Admin cannot be deactivated!';
        END IF;
        IF NEW.user_type != OLD.user_type THEN
            RAISE EXCEPTION 'Super Admin role cannot be changed!';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to users table
CREATE TRIGGER protect_superadmin_delete_trigger
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION prevent_superadmin_delete();

CREATE TRIGGER protect_superadmin_modify_trigger
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION prevent_superadmin_modify();

-- ============================================================
-- DONE! ✅
-- Super Admin: superuser / @JIm47jhC_7%#
-- ⚠️ Super Admin CANNOT be deleted or modified!
-- ============================================================
