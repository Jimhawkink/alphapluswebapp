-- ============================================================
-- BILL PAYMENT SCHEMA PATCH
-- Run this in Supabase SQL Editor
-- Adds payment tracking tables and columns for bill payment
-- ============================================================

-- 1. Add missing columns to sales table if not exists
DO $$
BEGIN
    -- Add paid_at timestamp for when bill was fully paid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'paid_at') THEN
        ALTER TABLE sales ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add paid_by to track who collected payment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'paid_by') THEN
        ALTER TABLE sales ADD COLUMN paid_by VARCHAR(100);
    END IF;
    
    -- Add paid_by_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'paid_by_id') THEN
        ALTER TABLE sales ADD COLUMN paid_by_id INT;
    END IF;
    
    -- Add partial_payment_count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'partial_payment_count') THEN
        ALTER TABLE sales ADD COLUMN partial_payment_count INT DEFAULT 0;
    END IF;
    
    -- Add last_payment_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'last_payment_at') THEN
        ALTER TABLE sales ADD COLUMN last_payment_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add last_payment_method
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales' AND column_name = 'last_payment_method') THEN
        ALTER TABLE sales ADD COLUMN last_payment_method VARCHAR(50);
    END IF;

    RAISE NOTICE 'Sales table columns added successfully';
END $$;

-- 2. Create Bill Payments table (tracks individual payments against a bill)
-- Similar to VB.NET's Invoice_Payment table
CREATE TABLE IF NOT EXISTS bill_payments (
    payment_id SERIAL PRIMARY KEY,
    sale_id INT REFERENCES sales(sale_id) ON DELETE CASCADE,
    receipt_no VARCHAR(50), -- Reference to the bill's receipt_no
    
    -- Payment details
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_time TIME DEFAULT CURRENT_TIME,
    payment_datetime TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Amounts
    amount_due DECIMAL(15,4) DEFAULT 0,      -- Total bill amount at time of payment
    amount_paid DECIMAL(15,4) DEFAULT 0,      -- Amount paid in this transaction
    balance_before DECIMAL(15,4) DEFAULT 0,   -- Balance before this payment
    balance_after DECIMAL(15,4) DEFAULT 0,    -- Balance after this payment
    
    -- Payment method
    payment_method VARCHAR(50) DEFAULT 'Cash', -- Cash, M-Pesa, Card, Bank Transfer
    mpesa_code VARCHAR(50),                    -- M-Pesa transaction code
    mpesa_phone VARCHAR(20),                   -- M-Pesa phone number
    mpesa_name VARCHAR(100),                   -- M-Pesa sender name
    
    -- Reference
    reference_no VARCHAR(50),                  -- Additional reference (bank ref, etc.)
    payment_note TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'Completed',    -- Completed, Pending, Failed, Reversed
    is_partial BOOLEAN DEFAULT false,          -- Whether this was a partial payment
    
    -- Audit
    received_by_id INT,
    received_by_name VARCHAR(100),
    shift_id INT,
    shift_name VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create M-Pesa Transactions table (for STK Push tracking)
CREATE TABLE IF NOT EXISTS mpesa_transactions (
    transaction_id SERIAL PRIMARY KEY,
    
    -- Request details
    merchant_request_id VARCHAR(100),
    checkout_request_id VARCHAR(100),
    
    -- Customer
    phone_number VARCHAR(20) NOT NULL,
    
    -- Amount
    amount DECIMAL(15,4) DEFAULT 0,
    
    -- Reference
    reference VARCHAR(100),           -- Bill/Receipt number
    description TEXT,
    
    -- Response from M-Pesa
    response_code VARCHAR(10),
    response_description TEXT,
    result_code VARCHAR(10),
    result_description TEXT,
    
    -- Transaction result
    mpesa_receipt_number VARCHAR(50),  -- The M-Pesa transaction code (e.g., SFR7XXXXX)
    transaction_date TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Processing, Completed, Failed, Cancelled
    
    -- Linkage
    sale_id INT,
    payment_id INT,
    
    -- Audit
    initiated_by_id INT,
    initiated_by_name VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to mpesa_transactions if they don't exist
DO $$
BEGIN
    -- Add reference column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'mpesa_transactions' AND column_name = 'reference') THEN
        ALTER TABLE mpesa_transactions ADD COLUMN reference VARCHAR(100);
    END IF;
    
    -- Add description column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'mpesa_transactions' AND column_name = 'description') THEN
        ALTER TABLE mpesa_transactions ADD COLUMN description TEXT;
    END IF;
    
    -- Add sale_id column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'mpesa_transactions' AND column_name = 'sale_id') THEN
        ALTER TABLE mpesa_transactions ADD COLUMN sale_id INT;
    END IF;
    
    -- Add payment_id column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'mpesa_transactions' AND column_name = 'payment_id') THEN
        ALTER TABLE mpesa_transactions ADD COLUMN payment_id INT;
    END IF;

    RAISE NOTICE 'mpesa_transactions columns verified';
END $$;

-- 5. Disable RLS on new tables
ALTER TABLE bill_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE mpesa_transactions DISABLE ROW LEVEL SECURITY;

-- 4. Create indexes for faster querying (safely)
DO $$
BEGIN
    -- bill_payments indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bill_payments_sale_id') THEN
        CREATE INDEX idx_bill_payments_sale_id ON bill_payments(sale_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bill_payments_receipt_no') THEN
        CREATE INDEX idx_bill_payments_receipt_no ON bill_payments(receipt_no);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bill_payments_payment_date') THEN
        CREATE INDEX idx_bill_payments_payment_date ON bill_payments(payment_date);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bill_payments_mpesa_code') THEN
        CREATE INDEX idx_bill_payments_mpesa_code ON bill_payments(mpesa_code);
    END IF;

    -- mpesa_transactions indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mpesa_transactions_phone') THEN
        CREATE INDEX idx_mpesa_transactions_phone ON mpesa_transactions(phone_number);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mpesa_transactions_reference') THEN
        CREATE INDEX idx_mpesa_transactions_reference ON mpesa_transactions(reference);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mpesa_transactions_status') THEN
        CREATE INDEX idx_mpesa_transactions_status ON mpesa_transactions(status);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mpesa_transactions_checkout_request') THEN
        CREATE INDEX idx_mpesa_transactions_checkout_request ON mpesa_transactions(checkout_request_id);
    END IF;

    -- sales indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_status') THEN
        CREATE INDEX idx_sales_status ON sales(status);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_sale_date') THEN
        CREATE INDEX idx_sales_sale_date ON sales(sale_date);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_receipt_no') THEN
        CREATE INDEX idx_sales_receipt_no ON sales(receipt_no);
    END IF;

    RAISE NOTICE 'Indexes created successfully';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Some indexes may already exist or had issues: %', SQLERRM;
END $$;

-- 6. Function to generate payment reference number
CREATE OR REPLACE FUNCTION generate_payment_reference()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INT;
    ref VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(
        CASE 
            WHEN reference_no ~ '^PAY-[0-9]+$' 
            THEN CAST(SUBSTRING(reference_no FROM 5) AS INT)
            ELSE 0 
        END
    ), 0) + 1 INTO next_num
    FROM bill_payments;
    
    ref := 'PAY-' || LPAD(next_num::TEXT, 6, '0');
    RETURN ref;
END;
$$ LANGUAGE plpgsql;

-- 7. Function to process a payment and update sales table
CREATE OR REPLACE FUNCTION process_bill_payment(
    p_sale_id INT,
    p_amount DECIMAL,
    p_payment_method VARCHAR,
    p_mpesa_code VARCHAR DEFAULT NULL,
    p_mpesa_phone VARCHAR DEFAULT NULL,
    p_received_by_name VARCHAR DEFAULT NULL,
    p_received_by_id INT DEFAULT NULL,
    p_shift_id INT DEFAULT NULL,
    p_shift_name VARCHAR DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    payment_id INT,
    new_balance DECIMAL
) AS $$
DECLARE
    v_current_sale RECORD;
    v_balance_before DECIMAL;
    v_balance_after DECIMAL;
    v_is_partial BOOLEAN;
    v_new_payment_id INT;
    v_reference VARCHAR;
BEGIN
    -- Get current sale details
    SELECT * INTO v_current_sale 
    FROM sales 
    WHERE sale_id = p_sale_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Sale not found'::TEXT, NULL::INT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    -- Calculate balances
    v_balance_before := COALESCE(v_current_sale.total_amount, 0) - COALESCE(v_current_sale.amount_paid, 0);
    
    -- Validate payment amount
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT false, 'Invalid payment amount'::TEXT, NULL::INT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    IF p_amount > v_balance_before THEN
        p_amount := v_balance_before; -- Cap at balance
    END IF;
    
    v_balance_after := v_balance_before - p_amount;
    v_is_partial := v_balance_after > 0;
    
    -- Generate payment reference
    v_reference := generate_payment_reference();
    
    -- Insert payment record
    INSERT INTO bill_payments (
        sale_id, receipt_no, amount_due, amount_paid,
        balance_before, balance_after, payment_method,
        mpesa_code, mpesa_phone, reference_no, payment_note,
        is_partial, received_by_id, received_by_name,
        shift_id, shift_name
    ) VALUES (
        p_sale_id, v_current_sale.receipt_no, v_current_sale.total_amount, p_amount,
        v_balance_before, v_balance_after, p_payment_method,
        p_mpesa_code, p_mpesa_phone, v_reference, p_note,
        v_is_partial, p_received_by_id, p_received_by_name,
        p_shift_id, p_shift_name
    )
    RETURNING bill_payments.payment_id INTO v_new_payment_id;
    
    -- Update sales table
    UPDATE sales SET
        amount_paid = COALESCE(amount_paid, 0) + p_amount,
        payment_method = p_payment_method,
        mpesa_code = COALESCE(p_mpesa_code, mpesa_code),
        status = CASE WHEN v_balance_after <= 0 THEN 'Completed' ELSE 'Pending' END,
        paid_at = CASE WHEN v_balance_after <= 0 THEN NOW() ELSE paid_at END,
        paid_by = CASE WHEN v_balance_after <= 0 THEN p_received_by_name ELSE paid_by END,
        paid_by_id = CASE WHEN v_balance_after <= 0 THEN p_received_by_id ELSE paid_by_id END,
        partial_payment_count = COALESCE(partial_payment_count, 0) + 1,
        last_payment_at = NOW(),
        last_payment_method = p_payment_method,
        updated_at = NOW()
    WHERE sale_id = p_sale_id;
    
    -- Return success
    RETURN QUERY SELECT 
        true, 
        CASE WHEN v_balance_after <= 0 
            THEN 'Payment completed successfully'
            ELSE 'Partial payment recorded'
        END::TEXT,
        v_new_payment_id,
        v_balance_after;
END;
$$ LANGUAGE plpgsql;

-- 8. View for pending bills (for quick display)
CREATE OR REPLACE VIEW pending_bills AS
SELECT 
    s.*,
    (s.total_amount - COALESCE(s.amount_paid, 0)) as outstanding_amount,
    COALESCE(
        (SELECT COUNT(*) FROM bill_payments bp WHERE bp.sale_id = s.sale_id),
        0
    ) as payment_count
FROM sales s
WHERE s.status = 'Pending'
ORDER BY s.sale_datetime DESC;

-- 9. View for payment history
CREATE OR REPLACE VIEW payment_history AS
SELECT 
    bp.*,
    s.waiter_name,
    s.table_name,
    s.customer_name,
    s.customer_phone,
    s.total_amount as bill_total
FROM bill_payments bp
JOIN sales s ON bp.sale_id = s.sale_id
ORDER BY bp.payment_datetime DESC;

-- ============================================================
-- DONE! ✅
-- Tables/Views created:
-- - bill_payments: Individual payment records
-- - mpesa_transactions: M-Pesa STK Push tracking
-- - pending_bills: View of unpaid/partial bills
-- - payment_history: View of all payments
-- 
-- Functions added:
-- - generate_payment_reference(): Generates PAY-XXXXXX
-- - process_bill_payment(): Handles payment processing
-- 
-- Sales table updated with:
-- - paid_at, paid_by, paid_by_id
-- - partial_payment_count
-- - last_payment_at, last_payment_method
-- ============================================================

SELECT 'Bill payment schema patch completed successfully!' as result;
