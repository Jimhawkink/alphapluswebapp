-- ==========================================
-- C2B Transactions Table for M-Pesa Callback Payments
-- Run this in Supabase SQL Editor
-- ==========================================

-- Create C2B Transactions Table
CREATE TABLE IF NOT EXISTS c2b_transactions (
    id SERIAL PRIMARY KEY,
    trans_id VARCHAR(50) UNIQUE NOT NULL,        -- M-Pesa Transaction ID (e.g., RLJ5XXXXXX)
    trans_amount NUMERIC NOT NULL,               -- Transaction Amount
    msisdn VARCHAR(20) NOT NULL,                 -- Customer Phone Number
    first_name VARCHAR(100),                     -- Customer First Name from M-Pesa
    middle_name VARCHAR(100),                    -- Customer Middle Name
    last_name VARCHAR(100),                      -- Customer Last Name
    bill_ref_number VARCHAR(100),                -- Bill Reference Number (if paybill)
    business_shortcode VARCHAR(20),              -- Till/Paybill Number
    org_account_balance NUMERIC,                 -- Organization Account Balance after transaction
    trans_time TIMESTAMP WITH TIME ZONE,         -- M-Pesa Transaction Time
    is_linked BOOLEAN DEFAULT false,             -- Whether linked to a sale/bill
    linked_sale_id INTEGER,                      -- Foreign key to sales table (if linked)
    linked_receipt_no VARCHAR(100),              -- Receipt number it was linked to
    linked_by VARCHAR(100),                      -- User who linked it
    linked_at TIMESTAMP WITH TIME ZONE,          -- When it was linked
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_c2b_trans_id ON c2b_transactions(trans_id);
CREATE INDEX IF NOT EXISTS idx_c2b_is_linked ON c2b_transactions(is_linked);
CREATE INDEX IF NOT EXISTS idx_c2b_msisdn ON c2b_transactions(msisdn);
CREATE INDEX IF NOT EXISTS idx_c2b_created_at ON c2b_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE c2b_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations
DROP POLICY IF EXISTS "Allow all read on c2b_transactions" ON c2b_transactions;
CREATE POLICY "Allow all read on c2b_transactions" ON c2b_transactions 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on c2b_transactions" ON c2b_transactions;
CREATE POLICY "Allow all insert on c2b_transactions" ON c2b_transactions 
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on c2b_transactions" ON c2b_transactions;
CREATE POLICY "Allow all update on c2b_transactions" ON c2b_transactions 
    FOR UPDATE USING (true);

COMMENT ON TABLE c2b_transactions IS 'Stores incoming M-Pesa C2B (Customer to Business) payments for linking to sales/bills';

-- ==========================================
-- TEST DATA (Optional - Remove in production)
-- ==========================================
-- INSERT INTO c2b_transactions (trans_id, trans_amount, msisdn, first_name, business_shortcode, trans_time)
-- VALUES 
--     ('RLJ5TEST001', 500, '254712345678', 'John', '9830453', now()),
--     ('RLJ5TEST002', 1200, '254798765432', 'Jane', '9830453', now() - interval '1 hour'),
--     ('RLJ5TEST003', 90, '254711222333', 'Peter', '9830453', now() - interval '30 minutes');
