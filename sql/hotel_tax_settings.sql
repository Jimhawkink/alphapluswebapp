-- =====================================================
-- HOTEL TAX SETTINGS TABLE
-- Kenya Hotel & Restaurant Tax Configuration
-- =====================================================

-- Tax Settings Table
CREATE TABLE IF NOT EXISTS public.hotel_tax_settings (
    tax_id SERIAL PRIMARY KEY,
    tax_name VARCHAR(100) NOT NULL,
    tax_type VARCHAR(50) NOT NULL, -- 'VAT', 'Tourism Levy', 'Catering Levy'
    tax_rate NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    applies_to VARCHAR(50) DEFAULT 'All', -- 'Hotel', 'Restaurant', 'All'
    description TEXT,
    display_order INTEGER DEFAULT 0,
    updated_by VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tax Mode Configuration (Inclusive vs Exclusive)
CREATE TABLE IF NOT EXISTS public.hotel_tax_config (
    config_id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_by VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default Kenya taxes
INSERT INTO public.hotel_tax_settings (tax_name, tax_type, tax_rate, applies_to, description, display_order) VALUES
('VAT', 'VAT', 16.0, 'All', 'Kenya Value Added Tax - 16% on all sales', 1),
('Tourism Levy', 'Levy', 2.0, 'Hotel', 'Tourism Act 2011 - For licensed hotels', 2),
('Catering Levy', 'Levy', 2.0, 'Restaurant', 'For restaurants with sales ≥ KES 3M/year', 3)
ON CONFLICT DO NOTHING;

-- Insert default tax configuration
INSERT INTO public.hotel_tax_config (config_key, config_value, description) VALUES
('tax_mode', 'inclusive', 'Tax calculation mode: inclusive or exclusive'),
('hotel_name', 'Alpha Hotel & Restaurant', 'Hotel/Restaurant name for receipts and QR validation'),
('hotel_pin', 'P051234567X', 'KRA PIN Number'),
('apply_tourism_levy', 'true', 'Whether to apply tourism/catering levy'),
('default_establishment_type', 'Hotel', 'Default type: Hotel or Restaurant')
ON CONFLICT (config_key) DO UPDATE SET 
    config_value = EXCLUDED.config_value,
    updated_at = NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hotel_tax_settings_active ON public.hotel_tax_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_hotel_tax_settings_type ON public.hotel_tax_settings(tax_type);
CREATE INDEX IF NOT EXISTS idx_hotel_tax_config_key ON public.hotel_tax_config(config_key);

-- Enable RLS
ALTER TABLE public.hotel_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_tax_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for hotel_tax_settings" ON public.hotel_tax_settings;
DROP POLICY IF EXISTS "Allow all for hotel_tax_config" ON public.hotel_tax_config;

-- Create policies
CREATE POLICY "Allow all for hotel_tax_settings" ON public.hotel_tax_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_tax_config" ON public.hotel_tax_config FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.hotel_tax_settings TO authenticated, anon;
GRANT ALL ON public.hotel_tax_config TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- Success message
SELECT 'Hotel Tax Settings Schema Created Successfully!' AS status;
