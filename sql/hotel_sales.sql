-- =====================================================
-- HOTEL SALES TABLE
-- Hotel POS Sales with Kenya Tax Breakdown
-- =====================================================

CREATE TABLE IF NOT EXISTS public.hotel_sales (
    sale_id SERIAL PRIMARY KEY,
    receipt_no VARCHAR(30) UNIQUE NOT NULL,
    sale_date DATE DEFAULT CURRENT_DATE,
    sale_datetime TIMESTAMPTZ DEFAULT NOW(),
    
    -- Establishment Info
    establishment_type VARCHAR(20) DEFAULT 'Hotel', -- 'Hotel' or 'Restaurant'
    establishment_name VARCHAR(200),
    
    -- Tax Mode & Calculation
    tax_mode VARCHAR(20) DEFAULT 'inclusive', -- 'inclusive' or 'exclusive'
    
    -- Amounts (flexible for both modes)
    subtotal NUMERIC DEFAULT 0,  -- Sum of items before discount
    discount NUMERIC DEFAULT 0,
    amount_after_discount NUMERIC DEFAULT 0, -- Subtotal - Discount
    
    -- Tax Breakdown
    net_amount NUMERIC DEFAULT 0,  -- Amount excluding tax
    vat_rate NUMERIC DEFAULT 16.0,
    vat_amount NUMERIC DEFAULT 0,
    levy_rate NUMERIC DEFAULT 2.0,
    levy_amount NUMERIC DEFAULT 0,
    total_tax NUMERIC DEFAULT 0,  -- VAT + Levy
    
    -- Final Amount
    total_amount NUMERIC DEFAULT 0,  -- What customer pays
    
    -- Payment Details
    payment_method VARCHAR(30),
    amount_paid NUMERIC,
    change_amount NUMERIC,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    mpesa_code VARCHAR(50),
    checkout_request_id VARCHAR(100),
    
    -- QR Code Validation
    qr_code_data TEXT UNIQUE,
    verification_hash VARCHAR(64),
    
    -- Items Count
    items_count INTEGER DEFAULT 0,
    
    -- Audit Trail
    cashier VARCHAR(100),
    shift_id INTEGER,
    status VARCHAR(30) DEFAULT 'Completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales Items Table
CREATE TABLE IF NOT EXISTS public.hotel_sales_items (
    item_id SERIAL PRIMARY KEY,
    sale_id INTEGER REFERENCES public.hotel_sales(sale_id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    discount NUMERIC DEFAULT 0,
    subtotal NUMERIC NOT NULL, -- (unit_price * quantity) - discount
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hotel_sales_date ON public.hotel_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_hotel_sales_receipt ON public.hotel_sales(receipt_no);
CREATE INDEX IF NOT EXISTS idx_hotel_sales_datetime ON public.hotel_sales(sale_datetime);
CREATE INDEX IF NOT EXISTS idx_hotel_sales_status ON public.hotel_sales(status);
CREATE INDEX IF NOT EXISTS idx_hotel_sales_payment ON public.hotel_sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_hotel_sales_qr_hash ON public.hotel_sales(verification_hash);
CREATE INDEX IF NOT EXISTS idx_hotel_sales_items_sale ON public.hotel_sales_items(sale_id);

-- Enable RLS
ALTER TABLE public.hotel_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_sales_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for hotel_sales" ON public.hotel_sales;
DROP POLICY IF EXISTS "Allow all for hotel_sales_items" ON public.hotel_sales_items;

-- Create policies
CREATE POLICY "Allow all for hotel_sales" ON public.hotel_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_sales_items" ON public.hotel_sales_items FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.hotel_sales TO authenticated, anon;
GRANT ALL ON public.hotel_sales_items TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- Success message
SELECT 'Hotel Sales Schema Created Successfully!' AS status;
