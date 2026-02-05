-- ADD Tax Fields to Existing sales Table
-- Run this to add Kenya tax support (VAT 16% + Levy 2%) to your working POS

-- Add tax columns to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS tax_mode VARCHAR DEFAULT 'inclusive',
ADD COLUMN IF NOT EXISTS net_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 16.0,
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS levy_rate NUMERIC DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS levy_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tax NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS qr_code_data TEXT,
ADD COLUMN IF NOT EXISTS verification_hash VARCHAR;

-- Update existing records to have default tax values
UPDATE public.sales
SET 
  tax_mode = 'inclusive',
  net_amount = COALESCE(subtotal_before_tax, subtotal),
  vat_rate = 16.0,
  levy_rate = 2.0,
  vat_amount = 0,
  levy_amount = 0,
  total_tax = 0
WHERE tax_mode IS NULL;

COMMENT ON COLUMN public.sales.tax_mode IS 'Tax calculation mode: inclusive or exclusive';
COMMENT ON COLUMN public.sales.net_amount IS 'Amount before tax (for inclusive) or subtotal (for exclusive)';
COMMENT ON COLUMN public.sales.vat_rate IS 'VAT rate percentage (default 16%)';
COMMENT ON COLUMN public.sales.vat_amount IS 'Calculated VAT amount';
COMMENT ON COLUMN public.sales.levy_rate IS 'Tourism/Catering Levy rate (default 2%)';
COMMENT ON COLUMN public.sales.levy_amount IS 'Calculated levy amount';
COMMENT ON COLUMN public.sales.total_tax IS 'Total tax (VAT + Levy)';
COMMENT ON COLUMN public.sales.qr_code_data IS 'QR code data for receipt validation';
COMMENT ON COLUMN public.sales.verification_hash IS 'Hash for QR code validation';
