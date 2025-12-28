-- ============================================================
-- QUICK PATCH: Add missing columns and super admin protection
-- Run this INSTEAD of the fresh setup if you already have tables
-- ============================================================

-- 1. Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_type VARCHAR(20) DEFAULT 'Monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 2. Create user_roles table if not exists
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

-- 3. Insert default roles
INSERT INTO user_roles (role_name, description, can_view, can_create, can_update, can_delete, can_make_sales, can_receive_payments, can_view_reports, can_manage_users, can_manage_products, can_manage_inventory, can_manage_settings, is_super_admin) VALUES
('Super Admin', 'Full system control - Cannot be modified', true, true, true, true, true, true, true, true, true, true, true, true),
('Manager', 'General management functions', true, true, true, false, true, true, true, false, true, true, false, false),
('Supervisor', 'User management & access control', true, true, true, false, true, true, true, true, false, false, false, false),
('Cashier', 'Sales and payment processing only', true, false, false, false, true, true, false, false, false, false, false, false),
('Waiter', 'Order taking only', true, false, false, false, true, false, false, false, false, false, false, false)
ON CONFLICT (role_name) DO NOTHING;

-- 4. Create or update Super Admin account
INSERT INTO users (user_code, user_name, password_hash, name, user_type, email, active, is_super_admin) 
VALUES ('US-001', 'superuser', '@JIm47jhC_7%#', 'Super Administrator', 'Super Admin', 'admin@alphaplus.com', true, true)
ON CONFLICT (user_name) DO UPDATE SET 
    is_super_admin = true,
    user_type = 'Super Admin',
    active = true;

-- 5. Protect Super Admin from deletion
CREATE OR REPLACE FUNCTION prevent_superadmin_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_super_admin = true THEN
        RAISE EXCEPTION 'Super Admin account cannot be deleted!';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 6. Protect Super Admin from modification
CREATE OR REPLACE FUNCTION prevent_superadmin_modify()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_super_admin = true THEN
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

-- 7. Apply protection triggers
DROP TRIGGER IF EXISTS protect_superadmin_delete_trigger ON users;
DROP TRIGGER IF EXISTS protect_superadmin_modify_trigger ON users;

CREATE TRIGGER protect_superadmin_delete_trigger
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION prevent_superadmin_delete();

CREATE TRIGGER protect_superadmin_modify_trigger
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION prevent_superadmin_modify();

-- 8. Disable RLS for easy access
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONE! ✅
-- Super Admin: superuser / @JIm47jhC_7%#
-- ⚠️ Super Admin is now PROTECTED!
-- ============================================================
