-- ==========================================
-- M-Pesa Schema Updates for AlphaPlus POS
-- This updates the existing mpesa_transactions table and adds columns to meat_sales
-- ==========================================

-- Add columns to meat_sales table for M-Pesa tracking (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meat_sales' AND column_name = 'checkout_request_id'
    ) THEN
        ALTER TABLE meat_sales ADD COLUMN checkout_request_id VARCHAR(100);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meat_sales' AND column_name = 'mpesa_receipt_number'
    ) THEN
        ALTER TABLE meat_sales ADD COLUMN mpesa_receipt_number VARCHAR(50);
    END IF;
END $$;

-- Add columns to sales table for M-Pesa tracking (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'checkout_request_id'
    ) THEN
        ALTER TABLE sales ADD COLUMN checkout_request_id VARCHAR(100);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'mpesa_receipt_number'
    ) THEN
        ALTER TABLE sales ADD COLUMN mpesa_receipt_number VARCHAR(50);
    END IF;
END $$;

-- Create index on existing mpesa_transactions for faster lookups
CREATE INDEX IF NOT EXISTS idx_mpesa_checkout_request ON mpesa_transactions(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_status ON mpesa_transactions(status);
CREATE INDEX IF NOT EXISTS idx_mpesa_phone ON mpesa_transactions(phone_number);

-- Enable RLS on mpesa_transactions if not already enabled
ALTER TABLE mpesa_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mpesa_transactions
DROP POLICY IF EXISTS "Allow all read on mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "Allow all read on mpesa_transactions" ON mpesa_transactions 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "Allow all insert on mpesa_transactions" ON mpesa_transactions 
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on mpesa_transactions" ON mpesa_transactions;
CREATE POLICY "Allow all update on mpesa_transactions" ON mpesa_transactions 
    FOR UPDATE USING (true);

COMMENT ON TABLE mpesa_transactions IS 'Stores all M-Pesa STK Push transactions for POS payments';
