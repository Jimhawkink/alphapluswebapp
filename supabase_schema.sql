-- ============================================================
-- ALPHAPLUS POS - COMPLETE SUPABASE DATABASE SCHEMA
-- Matches exactly how the mobile app saves data
-- Created: 2024-12-28
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS & AUTHENTICATION
-- ============================================================

-- Users table (matches mobile app User model with extended fields)
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_code VARCHAR(20) UNIQUE,
    user_name VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(150) NOT NULL,
    user_type VARCHAR(50) NOT NULL DEFAULT 'Cashier', -- Super Admin, Manager, Supervisor, Cashier, Waiter
    email VARCHAR(150),
    phone VARCHAR(20),
    national_id VARCHAR(50),
    salary_type VARCHAR(20) DEFAULT 'Monthly', -- Monthly, Weekly
    salary_amount DECIMAL(15,2) DEFAULT 0,
    pin VARCHAR(6), -- 4 or 6 digit PIN for cashiers
    active BOOLEAN DEFAULT true,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Roles Definition Table
CREATE TABLE IF NOT EXISTS user_roles (
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
('Waiter', 'Order taking only', true, false, false, false, true, false, false, false, false, false, false, false)
ON CONFLICT (role_name) DO NOTHING;

-- Create Super Admin account (cannot be deleted)
-- Username: superuser, Password: @JIm47jhC_7%#
INSERT INTO users (user_code, user_name, password_hash, name, user_type, email, active, is_super_admin) VALUES
('US-001', 'superuser', '@JIm47jhC_7%#', 'Super Administrator', 'Super Admin', 'admin@alphaplus.com', true, true)
ON CONFLICT (user_name) DO NOTHING;

-- User Rights (modules permissions)
CREATE TABLE IF NOT EXISTS user_rights (
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

-- Companies/Suppliers
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Warehouses/Stores
CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    warehouse_name VARCHAR(200) NOT NULL,
    warehouse_type VARCHAR(50) DEFAULT 'Store', -- Store or Warehouse
    address TEXT,
    city VARCHAR(100),
    manager VARCHAR(150),
    active BOOLEAN DEFAULT true
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT true
);

-- Unit Master
CREATE TABLE IF NOT EXISTS unit_master (
    id SERIAL PRIMARY KEY,
    unit VARCHAR(50) NOT NULL UNIQUE
);

-- Tax Types
CREATE TABLE IF NOT EXISTS tax_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    rate DECIMAL(5,2) DEFAULT 0
);

-- ============================================================
-- 3. PRODUCTS & STOCK
-- ============================================================

-- Products table (matches mobile app Product model)
CREATE TABLE IF NOT EXISTS products (
    pid SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE,
    product_name VARCHAR(255) NOT NULL,
    alias VARCHAR(200), -- Manufacturer/Brand
    barcode VARCHAR(100),
    category VARCHAR(100),
    description TEXT,
    
    -- Pricing
    purchase_cost DECIMAL(15,2) DEFAULT 0,
    sales_cost DECIMAL(15,2) DEFAULT 0,
    margin_per DECIMAL(10,2) DEFAULT 0,
    
    -- Units
    purchase_unit VARCHAR(50) DEFAULT 'PCS',
    sales_unit VARCHAR(50) DEFAULT 'PCS',
    
    -- Tax & Inventory
    vat_commodity VARCHAR(100),
    vat DECIMAL(5,2) DEFAULT 0,
    reorder_point INT DEFAULT 5,
    
    -- Additional Info
    supplier_name VARCHAR(200),
    hs_code VARCHAR(50),
    batch_no VARCHAR(100),
    
    -- Display
    show_in_pos BOOLEAN DEFAULT true,
    button_ui_color INT,
    photo TEXT, -- Base64 or URL
    
    -- Timestamps
    added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock table (current stock per product per location)
CREATE TABLE IF NOT EXISTS stock (
    st_id SERIAL PRIMARY KEY,
    pid INT REFERENCES products(pid) ON DELETE CASCADE,
    invoice_no VARCHAR(100), -- Purchase invoice
    qty DECIMAL(15,3) DEFAULT 0,
    mfg_date DATE,
    expiry_date DATE,
    godown_id VARCHAR(100), -- Warehouse/Store ID
    batch_no VARCHAR(100),
    storage_type VARCHAR(50) DEFAULT 'Store', -- Store or Warehouse
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 4. SHIFT MANAGEMENT
-- ============================================================

-- Shift Definitions (Day, Night)
CREATE TABLE IF NOT EXISTS shift_definitions (
    shift_def_id SERIAL PRIMARY KEY,
    shift_name VARCHAR(100) NOT NULL,
    shift_code VARCHAR(10) NOT NULL UNIQUE, -- D, N
    start_time TIME,
    end_time TIME,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Insert default shifts
INSERT INTO shift_definitions (shift_name, shift_code, start_time, end_time, description) VALUES
('Day Shift', 'D', '06:00', '18:00', 'Day shift 6AM to 6PM'),
('Night Shift', 'N', '18:00', '07:00', 'Night shift 6PM to 7AM')
ON CONFLICT (shift_code) DO NOTHING;

-- Shift Instances (actual shifts worked)
CREATE TABLE IF NOT EXISTS shift_instances (
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
    shift_status VARCHAR(20) DEFAULT 'Open', -- Open, Closed
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cash Drops during shift
CREATE TABLE IF NOT EXISTS shift_cash_drops (
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

-- Main Invoice table (matches mobile app InvoiceInfo model)
CREATE TABLE IF NOT EXISTS invoices (
    inv_id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(100) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Customer & Salesman
    customer_name VARCHAR(200) DEFAULT 'Walk-in Customer',
    cust_id VARCHAR(50),
    member_id VARCHAR(50),
    loyalty_member_id VARCHAR(50),
    salesman_name VARCHAR(200),
    salesman_id VARCHAR(50),
    user_id VARCHAR(50),
    
    -- Amounts
    disc_per DECIMAL(5,2) DEFAULT 0,
    disc_amt DECIMAL(15,2) DEFAULT 0,
    grand_total DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_margin DECIMAL(15,2) DEFAULT 0, -- Total profit
    
    -- Payment Tracking
    cash DECIMAL(15,2) DEFAULT 0,
    change_amount DECIMAL(15,2) DEFAULT 0,
    total_cash DECIMAL(15,2) DEFAULT 0,
    total_mpesa DECIMAL(15,2) DEFAULT 0,
    total_credit DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    outstanding DECIMAL(15,2) DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Paid, Partially Paid, Not Paid
    payment_status VARCHAR(50) DEFAULT 'Not Paid',
    
    -- Currency
    currency_code VARCHAR(10) DEFAULT 'KES',
    exchange_rate DECIMAL(10,4) DEFAULT 1,
    
    -- Shift info
    shift_instance_id INT REFERENCES shift_instances(shift_instance_id),
    shift_code VARCHAR(10),
    
    -- Notes
    bill_note TEXT,
    lp VARCHAR(50),
    is_merged BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoice Products (items sold)
CREATE TABLE IF NOT EXISTS invoice_products (
    ip_id SERIAL PRIMARY KEY,
    inv_id INT REFERENCES invoices(inv_id) ON DELETE CASCADE,
    
    -- Product Info
    product_id INT REFERENCES products(pid),
    product_code VARCHAR(50),
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    
    -- Quantities & Pricing
    quantity INT NOT NULL DEFAULT 1,
    sales_rate DECIMAL(15,2) NOT NULL,
    purchase_rate DECIMAL(15,2) DEFAULT 0,
    
    -- Discounts
    discount_per DECIMAL(5,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    
    -- Tax
    vat_per DECIMAL(5,2) DEFAULT 0,
    vat DECIMAL(15,2) DEFAULT 0,
    
    -- Totals
    total_amount DECIMAL(15,2) NOT NULL,
    margin DECIMAL(15,2) DEFAULT 0, -- Profit per item
    
    -- Batch tracking
    batch_number VARCHAR(100),
    cost_per_unit DECIMAL(15,2),
    
    -- Dates
    mfg_date DATE,
    expiry_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoice Payments (multiple payment modes per invoice)
CREATE TABLE IF NOT EXISTS invoice_payments (
    payment_id SERIAL PRIMARY KEY,
    inv_id INT REFERENCES invoices(inv_id) ON DELETE CASCADE,
    invoice_no VARCHAR(100),
    
    payment_mode VARCHAR(50) NOT NULL, -- Cash, Mpesa, Credit, Mobile Payment
    amount DECIMAL(15,2) NOT NULL,
    
    -- M-Pesa specific
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

CREATE TABLE IF NOT EXISTS mpesa_transactions (
    id SERIAL PRIMARY KEY,
    checkout_request_id VARCHAR(100) UNIQUE,
    merchant_request_id VARCHAR(100),
    
    -- Transaction Details
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    account_reference VARCHAR(100), -- Invoice number
    transaction_desc TEXT,
    
    -- Result
    result_code INT,
    result_desc TEXT,
    mpesa_receipt_number VARCHAR(100),
    transaction_date TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Success, Failed, Cancelled
    
    -- Linking
    inv_id INT REFERENCES invoices(inv_id),
    invoice_no VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 7. PRODUCTION / RECIPE MANAGEMENT
-- ============================================================

-- Production Batches (finished goods from recipes)
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_number VARCHAR(100) UNIQUE NOT NULL,
    
    -- Product being produced
    product_id INT REFERENCES products(pid),
    product_name VARCHAR(255),
    barcode VARCHAR(100),
    
    -- Quantities
    qty_produced DECIMAL(15,3) NOT NULL,
    qty_remaining DECIMAL(15,3) NOT NULL,
    
    -- Costs
    total_production_cost DECIMAL(15,2) NOT NULL,
    cost_per_unit DECIMAL(15,4) NOT NULL,
    purchase_rate DECIMAL(15,2), -- Original purchase rate
    sales_rate DECIMAL(15,2), -- Selling price
    
    -- Dates
    production_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'Active', -- Active, Depleted, Expired
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipe Ingredients (ingredients used in production)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    batch_id INT REFERENCES production_batches(batch_id) ON DELETE CASCADE,
    recipe_id INT,
    
    -- Ingredient Info
    ingredient_product_id INT REFERENCES products(pid),
    ingredient_name VARCHAR(255),
    unit_measure VARCHAR(50),
    
    -- Quantities & Costs
    qty_issued DECIMAL(15,3) NOT NULL,
    rate DECIMAL(15,2) NOT NULL, -- Cost per unit
    total_cost DECIMAL(15,2) NOT NULL,
    remaining_qty DECIMAL(15,3), -- Stock remaining after deduction
    
    recipe_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 8. PURCHASES
-- ============================================================

CREATE TABLE IF NOT EXISTS purchases (
    purchase_id SERIAL PRIMARY KEY,
    purchase_no VARCHAR(100) UNIQUE NOT NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    
    -- Supplier
    supplier_id INT REFERENCES companies(id),
    supplier_name VARCHAR(200),
    
    -- Amounts
    sub_total DECIMAL(15,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    vat DECIMAL(15,2) DEFAULT 0,
    grand_total DECIMAL(15,2) NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Received, Cancelled
    payment_status VARCHAR(50) DEFAULT 'Not Paid',
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase Products
CREATE TABLE IF NOT EXISTS purchase_products (
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

-- Expense Types
CREATE TABLE IF NOT EXISTS expense_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL UNIQUE
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_name VARCHAR(200) NOT NULL,
    expense_type VARCHAR(100),
    amount DECIMAL(15,2),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shift Expenses (expenses recorded during a shift)
CREATE TABLE IF NOT EXISTS shift_expenses (
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

-- Meat Types
CREATE TABLE IF NOT EXISTS meat_types (
    meat_type_id SERIAL PRIMARY KEY,
    meat_type_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Meat Stock
CREATE TABLE IF NOT EXISTS meat_stock (
    stock_id SERIAL PRIMARY KEY,
    stock_code VARCHAR(100) UNIQUE,
    meat_type_id INT REFERENCES meat_types(meat_type_id),
    
    -- Weights
    initial_weight_kg DECIMAL(10,3) NOT NULL,
    available_kg DECIMAL(10,3) NOT NULL,
    sold_kg DECIMAL(10,3) DEFAULT 0,
    loss_kg DECIMAL(10,3) DEFAULT 0, -- Weight loss (drying, trimming, etc.)
    
    -- Pricing
    cost_per_kg DECIMAL(15,2) NOT NULL,
    selling_price DECIMAL(15,2) NOT NULL,
    
    -- Receipt/Batch
    purchase_date DATE DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(200),
    batch_no VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'Available', -- Available, Low, Depleted
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meat Sales
CREATE TABLE IF NOT EXISTS meat_sales (
    sale_id SERIAL PRIMARY KEY,
    sale_code VARCHAR(100) UNIQUE NOT NULL,
    stock_id INT REFERENCES meat_stock(stock_id),
    
    -- Sale Details
    weight_kg DECIMAL(10,3) NOT NULL,
    price_per_kg DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    discount DECIMAL(15,2) DEFAULT 0,
    net_amount DECIMAL(15,2) NOT NULL,
    
    -- Payment
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    payment_reference VARCHAR(100),
    
    -- Customer
    customer_name VARCHAR(200),
    customer_contact VARCHAR(50),
    
    -- Meta
    notes TEXT,
    served_by VARCHAR(100),
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weight Loss Records
CREATE TABLE IF NOT EXISTS meat_weight_losses (
    loss_id SERIAL PRIMARY KEY,
    stock_id INT REFERENCES meat_stock(stock_id),
    loss_weight_kg DECIMAL(10,3) NOT NULL,
    loss_type VARCHAR(50) DEFAULT 'Other', -- Drying, Trimming, Spoilage, Other
    reason TEXT,
    recorded_by VARCHAR(100),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 11. ORGANISATION SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS organisation_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'text', -- text, number, boolean, json
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO organisation_settings (setting_key, setting_value, description) VALUES
('company_name', 'AlphaPlus POS', 'Company/Business name'),
('address', '', 'Business address'),
('phone', '', 'Business phone'),
('email', '', 'Business email'),
('tax_pin', '', 'Tax PIN/VAT number'),
('receipt_header', '', 'Receipt header text'),
('receipt_footer', 'Thank you for your business!', 'Receipt footer text'),
('currency', 'KES', 'Default currency'),
('enable_shifts', 'true', 'Enable shift management')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- 12. INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_show_pos ON products(show_in_pos);

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_shift ON invoices(shift_instance_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);

CREATE INDEX IF NOT EXISTS idx_invoice_products_inv ON invoice_products(inv_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_inv ON invoice_payments(inv_id);

CREATE INDEX IF NOT EXISTS idx_shift_instances_date ON shift_instances(shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_instances_user ON shift_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_instances_status ON shift_instances(shift_status);

CREATE INDEX IF NOT EXISTS idx_production_batches_product ON production_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches(status);

CREATE INDEX IF NOT EXISTS idx_mpesa_checkout ON mpesa_transactions(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_invoice ON mpesa_transactions(invoice_no);

CREATE INDEX IF NOT EXISTS idx_stock_pid ON stock(pid);
CREATE INDEX IF NOT EXISTS idx_stock_godown ON stock(godown_id);

-- ============================================================
-- 13. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on main tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE mpesa_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies to allow authenticated users to access data
-- (You can customize these based on user roles later)

CREATE POLICY "Allow authenticated read" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON invoices FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON invoice_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON invoice_products FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated read" ON invoice_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON invoice_payments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated read" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON products FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON stock FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON stock FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON shift_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON shift_instances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON shift_instances FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read" ON mpesa_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON mpesa_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON mpesa_transactions FOR UPDATE TO authenticated USING (true);

-- Also allow public access for certain operations (anon key)
CREATE POLICY "Allow public read" ON products FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON categories FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON shift_definitions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public read" ON organisation_settings FOR SELECT TO anon USING (true);

-- ============================================================
-- 14. FUNCTIONS & TRIGGERS
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mpesa_updated_at BEFORE UPDATE ON mpesa_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate next invoice number for a shift
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_shift_code VARCHAR)
RETURNS TABLE(invoice_no VARCHAR, next_number INT) AS $$
DECLARE
    v_count INT;
    v_inv_no VARCHAR;
BEGIN
    SELECT COUNT(*) + 1 INTO v_count
    FROM invoices
    WHERE shift_code = p_shift_code
    AND invoice_date = CURRENT_DATE;
    
    v_inv_no := 'RCP-' || LPAD(v_count::TEXT, 5, '0') || p_shift_code;
    
    RETURN QUERY SELECT v_inv_no, v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update invoice payment totals
CREATE OR REPLACE FUNCTION update_invoice_payment_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE invoices
    SET 
        paid_amount = (
            SELECT COALESCE(SUM(amount), 0) 
            FROM invoice_payments 
            WHERE inv_id = NEW.inv_id
        ),
        total_cash = (
            SELECT COALESCE(SUM(amount), 0) 
            FROM invoice_payments 
            WHERE inv_id = NEW.inv_id AND payment_mode = 'Cash'
        ),
        total_mpesa = (
            SELECT COALESCE(SUM(amount), 0) 
            FROM invoice_payments 
            WHERE inv_id = NEW.inv_id AND payment_mode ILIKE '%pesa%'
        ),
        outstanding = grand_total - (
            SELECT COALESCE(SUM(amount), 0) 
            FROM invoice_payments 
            WHERE inv_id = NEW.inv_id
        ),
        payment_status = CASE
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE inv_id = NEW.inv_id) >= grand_total THEN 'Paid'
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE inv_id = NEW.inv_id) > 0 THEN 'Partially Paid'
            ELSE 'Not Paid'
        END,
        status = CASE
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE inv_id = NEW.inv_id) >= grand_total THEN 'Paid'
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE inv_id = NEW.inv_id) > 0 THEN 'Partially Paid'
            ELSE 'Pending'
        END,
        updated_at = NOW()
    WHERE inv_id = NEW.inv_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_totals_trigger
AFTER INSERT ON invoice_payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_payment_totals();

-- ============================================================
-- 15. SAMPLE DATA (Optional - for testing)
-- ============================================================

-- Insert a sample admin user (password: admin123)
INSERT INTO users (user_name, password_hash, name, user_type, email, active) VALUES
('admin', '$2b$10$', 'Administrator', 'Admin', 'admin@alphaplus.com', true)
ON CONFLICT (user_name) DO NOTHING;

-- Insert sample categories
INSERT INTO categories (category_name) VALUES
('Food'),
('Beverages'),
('Snacks'),
('Dairy'),
('Meat'),
('Vegetables'),
('Fruits'),
('Others')
ON CONFLICT (category_name) DO NOTHING;

-- Insert sample units
INSERT INTO unit_master (unit) VALUES
('PCS'),
('KG'),
('LTR'),
('PKT'),
('BTL'),
('BOX'),
('CARTON'),
('GMS'),
('MLS')
ON CONFLICT (unit) DO NOTHING;

-- Insert sample expense types
INSERT INTO expense_types (type_name) VALUES
('Transport'),
('Utilities'),
('Supplies'),
('Maintenance'),
('Wages'),
('Miscellaneous')
ON CONFLICT (type_name) DO NOTHING;

COMMIT;

-- ============================================================
-- SCHEMA COMPLETE!
-- Run this SQL in your Supabase SQL Editor
-- ============================================================
