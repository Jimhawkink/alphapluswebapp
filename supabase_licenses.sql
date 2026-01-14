-- ============================================================
-- ALPHAPLUS POS - MOBILE APP LICENSING SYSTEM
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Drop table if exists (for fresh install)
-- DROP TABLE IF EXISTS licenses CASCADE;

-- Create Licenses Table
CREATE TABLE IF NOT EXISTS licenses (
    license_id SERIAL PRIMARY KEY,
    license_key VARCHAR(100) UNIQUE NOT NULL,
    device_id VARCHAR(255),
    device_serial_number VARCHAR(255),
    device_model VARCHAR(255),
    device_manufacturer VARCHAR(255),
    android_version VARCHAR(50),
    app_version VARCHAR(50),
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    license_type VARCHAR(50) DEFAULT 'Standard', -- Standard, Premium, Enterprise
    max_devices INTEGER DEFAULT 1,
    devices_used INTEGER DEFAULT 0,
    issue_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_activated BOOLEAN DEFAULT false,
    activated_at TIMESTAMP WITH TIME ZONE,
    last_validated_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_device_id ON licenses(device_id);
CREATE INDEX IF NOT EXISTS idx_licenses_is_active ON licenses(is_active);

-- Enable Row Level Security
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid duplicate errors)
DROP POLICY IF EXISTS "Allow all for authenticated users" ON licenses;
DROP POLICY IF EXISTS "Allow anon to validate licenses" ON licenses;
DROP POLICY IF EXISTS "Allow anon to update licenses" ON licenses;

-- Create RLS policies (allow all operations for authenticated users)
CREATE POLICY "Allow all for authenticated users" ON licenses
    FOR ALL USING (true);

-- Create policy for anon users to validate licenses
CREATE POLICY "Allow anon to validate licenses" ON licenses
    FOR SELECT USING (true);

CREATE POLICY "Allow anon to update licenses" ON licenses
    FOR UPDATE USING (true);

-- Insert a sample license key for testing (expires in 30 days)
INSERT INTO licenses (
    license_key, 
    customer_name, 
    license_type, 
    expiry_date,
    created_by
) VALUES (
    'ALPHAPLUS-TEST-2024-0001',
    'Test Customer',
    'Standard',
    CURRENT_DATE + INTERVAL '30 days',
    'System'
) ON CONFLICT (license_key) DO NOTHING;

-- ============================================================
-- LICENSE SETTINGS TABLE (for sales contact info, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS license_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default license settings
INSERT INTO license_settings (setting_key, setting_value, description) VALUES
    ('SalesPhone', '+254720316175', 'Sales contact phone number'),
    ('SalesEmail', 'sales@alphaplus.com', 'Sales contact email'),
    ('TrialDays', '7', 'Number of trial days for new installations'),
    ('LicensePrefix', 'ALPHAPLUS', 'Prefix for generated license keys')
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS for license_settings
ALTER TABLE license_settings ENABLE ROW LEVEL SECURITY;
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all for license_settings" ON license_settings;

CREATE POLICY "Allow all for license_settings" ON license_settings
    FOR ALL USING (true);

-- ============================================================
-- FUNCTION: Generate new license key
-- ============================================================

CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS VARCHAR(100) AS $$
DECLARE
    new_key VARCHAR(100);
    random_part VARCHAR(16);
BEGIN
    -- Generate random parts
    random_part := upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                   upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                   upper(substring(md5(random()::text) from 1 for 4));
    
    new_key := 'ALPHAPLUS-' || random_part;
    
    RETURN new_key;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Validate and activate license
-- ============================================================

CREATE OR REPLACE FUNCTION validate_license(
    p_license_key VARCHAR,
    p_device_id VARCHAR,
    p_device_serial VARCHAR DEFAULT NULL,
    p_device_model VARCHAR DEFAULT NULL,
    p_device_manufacturer VARCHAR DEFAULT NULL,
    p_android_version VARCHAR DEFAULT NULL,
    p_app_version VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    license_record RECORD;
    result JSON;
    days_remaining INTEGER;
BEGIN
    -- Find the license
    SELECT * INTO license_record 
    FROM licenses 
    WHERE license_key = p_license_key;
    
    -- Check if license exists
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Invalid license key',
            'data', null
        );
    END IF;
    
    -- Check if license is active
    IF NOT license_record.is_active THEN
        RETURN json_build_object(
            'success', false,
            'message', 'License has been deactivated',
            'data', null
        );
    END IF;
    
    -- Check if license is expired
    IF license_record.expiry_date < CURRENT_DATE THEN
        RETURN json_build_object(
            'success', false,
            'message', 'License has expired on ' || license_record.expiry_date::text,
            'data', null
        );
    END IF;
    
    -- Check device binding
    IF license_record.device_id IS NOT NULL AND license_record.device_id != p_device_id THEN
        -- Check if max devices reached
        IF license_record.devices_used >= license_record.max_devices THEN
            RETURN json_build_object(
                'success', false,
                'message', 'License is already activated on another device. Max devices: ' || license_record.max_devices,
                'data', null
            );
        END IF;
    END IF;
    
    -- Calculate days remaining
    days_remaining := license_record.expiry_date - CURRENT_DATE;
    
    -- Activate/update the license
    UPDATE licenses SET
        device_id = p_device_id,
        device_serial_number = COALESCE(p_device_serial, device_serial_number),
        device_model = COALESCE(p_device_model, device_model),
        device_manufacturer = COALESCE(p_device_manufacturer, device_manufacturer),
        android_version = COALESCE(p_android_version, android_version),
        app_version = COALESCE(p_app_version, app_version),
        is_activated = true,
        activated_at = COALESCE(activated_at, NOW()),
        last_validated_at = NOW(),
        devices_used = CASE WHEN device_id IS NULL OR device_id != p_device_id 
                       THEN devices_used + 1 
                       ELSE devices_used END,
        updated_at = NOW()
    WHERE license_key = p_license_key;
    
    -- Success response
    RETURN json_build_object(
        'success', true,
        'message', 'License validated successfully. ' || days_remaining || ' days remaining.',
        'data', json_build_object(
            'isValid', true,
            'expiryDate', license_record.expiry_date::text || ' 23:59:59',
            'daysRemaining', days_remaining,
            'customerName', license_record.customer_name,
            'licenseType', license_record.license_type
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION validate_license TO anon;
GRANT EXECUTE ON FUNCTION validate_license TO authenticated;
GRANT EXECUTE ON FUNCTION generate_license_key TO authenticated;

SELECT 'Licenses tables and functions created successfully!' as status;
