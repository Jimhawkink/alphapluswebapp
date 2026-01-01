-- =====================================================
-- HOTEL & HOUSEKEEPING MANAGEMENT SYSTEM SCHEMA
-- Version: 1.0
-- Created: 2026-01-01
-- =====================================================

-- 1. ROOM TYPES TABLE
CREATE TABLE IF NOT EXISTS public.room_types (
    room_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(20) UNIQUE,
    type_name VARCHAR(100) NOT NULL,
    description TEXT,
    base_rate NUMERIC DEFAULT 0,
    max_occupancy INTEGER DEFAULT 2,
    amenities TEXT[], -- Array of amenities like TV, WiFi, etc
    icon VARCHAR(10) DEFAULT '🏨',
    color VARCHAR(20) DEFAULT '#3B82F6',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ROOM PLANS TABLE (Rate Plans)
CREATE TABLE IF NOT EXISTS public.room_plans (
    plan_id SERIAL PRIMARY KEY,
    plan_code VARCHAR(20) UNIQUE,
    plan_name VARCHAR(100) NOT NULL,
    description TEXT,
    rate_modifier NUMERIC DEFAULT 1.0, -- Multiplier for base rate
    includes_breakfast BOOLEAN DEFAULT FALSE,
    includes_lunch BOOLEAN DEFAULT FALSE,
    includes_dinner BOOLEAN DEFAULT FALSE,
    color VARCHAR(20) DEFAULT '#10B981',
    icon VARCHAR(10) DEFAULT '📋',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ROOMS TABLE
CREATE TABLE IF NOT EXISTS public.hotel_rooms (
    room_id SERIAL PRIMARY KEY,
    room_number VARCHAR(20) UNIQUE NOT NULL,
    room_name VARCHAR(100),
    floor_number INTEGER DEFAULT 1,
    room_type_id INTEGER REFERENCES public.room_types(room_type_id),
    room_type_name VARCHAR(100),
    -- Room Features
    bed_type VARCHAR(50) DEFAULT 'Double', -- Single, Double, King, Twin
    bed_count INTEGER DEFAULT 1,
    is_vip BOOLEAN DEFAULT FALSE,
    is_suite BOOLEAN DEFAULT FALSE,
    has_tv BOOLEAN DEFAULT TRUE,
    has_wifi BOOLEAN DEFAULT TRUE,
    has_ac BOOLEAN DEFAULT TRUE,
    has_balcony BOOLEAN DEFAULT FALSE,
    has_kitchen BOOLEAN DEFAULT FALSE,
    has_minibar BOOLEAN DEFAULT FALSE,
    has_safe BOOLEAN DEFAULT FALSE,
    has_bathtub BOOLEAN DEFAULT FALSE,
    -- Rates
    room_rate NUMERIC DEFAULT 0,
    extra_bed_rate NUMERIC DEFAULT 0,
    -- Status
    status VARCHAR(30) DEFAULT 'Vacant', -- Vacant, Occupied, Reserved, Under Repair, Dirty, Blocked
    housekeeping_status VARCHAR(30) DEFAULT 'Clean', -- Clean, Dirty, In Progress, Inspected
    -- Current Guest Info (if occupied)
    current_booking_id INTEGER,
    current_guest_id INTEGER,
    current_guest_name VARCHAR(200),
    check_in_date DATE,
    expected_checkout DATE,
    -- Meta
    notes TEXT,
    room_image TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GUESTS TABLE (Comprehensive Guest Registration)
CREATE TABLE IF NOT EXISTS public.hotel_guests (
    guest_id SERIAL PRIMARY KEY,
    guest_code VARCHAR(20) UNIQUE,
    -- Personal Info
    title VARCHAR(10) DEFAULT 'Mr.', -- Mr., Mrs., Ms., Dr., Prof., Hon.
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    full_name VARCHAR(200),
    gender VARCHAR(10) DEFAULT 'Male', -- Male, Female
    date_of_birth DATE,
    email VARCHAR(200),
    phone VARCHAR(50),
    phone2 VARCHAR(50),
    -- Identification
    id_type VARCHAR(50) DEFAULT 'National ID', -- National ID, Passport, Driving License, Military ID, Student ID, Work Permit, Alien ID
    id_number VARCHAR(100),
    nationality VARCHAR(100) DEFAULT 'Kenya',
    -- Address & Location
    country VARCHAR(100) DEFAULT 'Kenya',
    county VARCHAR(100), -- County for Kenya, State/Province for other countries
    town VARCHAR(100), -- Town/City
    area_of_residence VARCHAR(200), -- e.g. Westlands, Kilimani
    address TEXT,
    postal_code VARCHAR(20),
    -- Guest Category & Sponsorship
    guest_type VARCHAR(50) DEFAULT 'Regular', -- Walk-in, Corporate, VIP, Regular
    sponsor_type VARCHAR(50) DEFAULT 'Self Sponsored', -- Self Sponsored, Organisation
    company_id INTEGER,
    company_name VARCHAR(200),
    -- Vehicle Information
    vehicle_type VARCHAR(50), -- Sedan, SUV, Pickup, Van, Bus, Motorcycle, Truck
    vehicle_registration VARCHAR(50), -- Registration/Plate number
    vehicle_color VARCHAR(50),
    -- Next of Kin / Emergency Contact
    next_of_kin_name VARCHAR(200),
    next_of_kin_phone VARCHAR(50),
    next_of_kin_relationship VARCHAR(50), -- Spouse, Parent, Sibling, Child, Friend, Colleague
    next_of_kin_address TEXT,
    -- Preferences & Notes
    preferences TEXT,
    special_requests TEXT,
    notes TEXT,
    -- Loyalty & Statistics
    loyalty_points INTEGER DEFAULT 0,
    total_stays INTEGER DEFAULT 0,
    total_spent NUMERIC DEFAULT 0,
    last_stay_date DATE,
    -- Status
    is_blacklisted BOOLEAN DEFAULT FALSE,
    blacklist_reason TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RESERVATIONS TABLE
CREATE TABLE IF NOT EXISTS public.hotel_reservations (
    reservation_id SERIAL PRIMARY KEY,
    reservation_no VARCHAR(30) UNIQUE NOT NULL,
    -- Guest Info
    guest_id INTEGER REFERENCES public.hotel_guests(guest_id),
    guest_name VARCHAR(200),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(200),
    -- Room Info
    room_id INTEGER REFERENCES public.hotel_rooms(room_id),
    room_number VARCHAR(20),
    room_type_id INTEGER,
    room_type_name VARCHAR(100),
    -- Dates
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    nights INTEGER DEFAULT 1,
    -- Time
    expected_arrival_time TIME,
    actual_arrival_time TIME,
    -- Guests Count
    adults INTEGER DEFAULT 1,
    children INTEGER DEFAULT 0,
    extra_beds INTEGER DEFAULT 0,
    -- Plan & Rates
    plan_id INTEGER REFERENCES public.room_plans(plan_id),
    plan_name VARCHAR(100),
    room_rate NUMERIC DEFAULT 0,
    extra_bed_rate NUMERIC DEFAULT 0,
    total_room_charge NUMERIC DEFAULT 0,
    -- Charges
    discount_percent NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    tax_percent NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    service_charge NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    -- Payment
    advance_paid NUMERIC DEFAULT 0,
    balance_amount NUMERIC DEFAULT 0,
    payment_status VARCHAR(30) DEFAULT 'Pending', -- Pending, Partial, Paid
    payment_method VARCHAR(30) DEFAULT 'Cash',
    -- Status
    status VARCHAR(30) DEFAULT 'Confirmed', -- Pending, Confirmed, Checked-In, Checked-Out, Cancelled, No-Show
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by VARCHAR(100),
    -- Source
    booking_source VARCHAR(50) DEFAULT 'Direct', -- Direct, Website, Phone, Walk-in, OTA
    booking_reference VARCHAR(100),
    -- Special Requests
    special_requests TEXT,
    notes TEXT,
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ROOM BOOKINGS / CHECK-INS TABLE
CREATE TABLE IF NOT EXISTS public.hotel_bookings (
    booking_id SERIAL PRIMARY KEY,
    booking_no VARCHAR(30) UNIQUE NOT NULL,
    reservation_id INTEGER REFERENCES public.hotel_reservations(reservation_id),
    reservation_no VARCHAR(30),
    -- Guest Info
    guest_id INTEGER REFERENCES public.hotel_guests(guest_id),
    guest_name VARCHAR(200),
    guest_phone VARCHAR(50),
    guest_id_type VARCHAR(50),
    guest_id_number VARCHAR(100),
    -- Room Info
    room_id INTEGER REFERENCES public.hotel_rooms(room_id),
    room_number VARCHAR(20),
    room_type_name VARCHAR(100),
    floor_number INTEGER,
    -- Check-in/out
    check_in_date DATE NOT NULL,
    check_in_time TIME,
    check_in_datetime TIMESTAMPTZ DEFAULT NOW(),
    check_out_date DATE,
    check_out_time TIME,
    check_out_datetime TIMESTAMPTZ,
    expected_checkout DATE,
    nights INTEGER DEFAULT 1,
    -- Guests
    adults INTEGER DEFAULT 1,
    children INTEGER DEFAULT 0,
    extra_beds INTEGER DEFAULT 0,
    -- Rates
    plan_id INTEGER,
    plan_name VARCHAR(100),
    room_rate NUMERIC DEFAULT 0,
    extra_bed_rate NUMERIC DEFAULT 0,
    -- Charges Summary
    room_charges NUMERIC DEFAULT 0,
    extra_charges NUMERIC DEFAULT 0,
    restaurant_charges NUMERIC DEFAULT 0,
    laundry_charges NUMERIC DEFAULT 0,
    minibar_charges NUMERIC DEFAULT 0,
    other_charges NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    service_charge NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    -- Payments
    total_paid NUMERIC DEFAULT 0,
    balance NUMERIC DEFAULT 0,
    payment_status VARCHAR(30) DEFAULT 'Pending',
    -- Status
    status VARCHAR(30) DEFAULT 'Checked-In', -- Checked-In, Checked-Out, Extended
    -- Audit
    checked_in_by VARCHAR(100),
    checked_out_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BOOKING PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.hotel_payments (
    payment_id SERIAL PRIMARY KEY,
    payment_no VARCHAR(30) UNIQUE,
    booking_id INTEGER REFERENCES public.hotel_bookings(booking_id),
    booking_no VARCHAR(30),
    reservation_id INTEGER,
    reservation_no VARCHAR(30),
    guest_id INTEGER,
    guest_name VARCHAR(200),
    room_number VARCHAR(20),
    -- Payment Details
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_time TIME DEFAULT CURRENT_TIME,
    payment_datetime TIMESTAMPTZ DEFAULT NOW(),
    amount NUMERIC NOT NULL,
    payment_method VARCHAR(30) DEFAULT 'Cash', -- Cash, M-Pesa, Card, Bank Transfer
    -- M-Pesa Details
    mpesa_code VARCHAR(50),
    mpesa_phone VARCHAR(20),
    mpesa_name VARCHAR(200),
    -- Card Details
    card_type VARCHAR(30),
    card_last_four VARCHAR(4),
    authorization_code VARCHAR(50),
    -- Bank Details
    bank_name VARCHAR(100),
    bank_reference VARCHAR(100),
    -- Status
    status VARCHAR(30) DEFAULT 'Completed', -- Pending, Completed, Failed, Refunded
    payment_type VARCHAR(30) DEFAULT 'Room Charge', -- Advance, Room Charge, Extra Charges, Deposit
    -- Receipt
    receipt_printed BOOLEAN DEFAULT FALSE,
    receipt_printed_at TIMESTAMPTZ,
    -- Notes
    notes TEXT,
    -- Audit
    received_by VARCHAR(100),
    shift_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. HOUSEKEEPING TASKS TABLE
CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
    task_id SERIAL PRIMARY KEY,
    task_no VARCHAR(30) UNIQUE,
    room_id INTEGER REFERENCES public.hotel_rooms(room_id),
    room_number VARCHAR(20),
    floor_number INTEGER,
    -- Task Type
    task_type VARCHAR(50) DEFAULT 'Daily Cleaning', -- Daily Cleaning, Deep Cleaning, Turndown, Checkout Clean
    priority VARCHAR(20) DEFAULT 'Normal', -- Low, Normal, High, Urgent
    -- Assignment
    assigned_to INTEGER,
    assigned_to_name VARCHAR(100),
    assigned_at TIMESTAMPTZ,
    -- Status
    status VARCHAR(30) DEFAULT 'Pending', -- Pending, In Progress, Completed, Inspected, Rejected
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    -- Inspection
    inspected_by VARCHAR(100),
    inspected_at TIMESTAMPTZ,
    inspection_notes TEXT,
    -- Notes
    notes TEXT,
    special_instructions TEXT,
    -- Supplies Used
    supplies_used TEXT,
    -- Created
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ROOM STATUS LOG TABLE (For audit trail)
CREATE TABLE IF NOT EXISTS public.room_status_log (
    log_id SERIAL PRIMARY KEY,
    room_id INTEGER,
    room_number VARCHAR(20),
    previous_status VARCHAR(30),
    new_status VARCHAR(30),
    previous_housekeeping_status VARCHAR(30),
    new_housekeeping_status VARCHAR(30),
    changed_by VARCHAR(100),
    change_reason TEXT,
    booking_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INSERT DEFAULT DATA
-- =====================================================

-- Default Room Types
INSERT INTO public.room_types (type_code, type_name, description, base_rate, max_occupancy, amenities, icon, color) VALUES
('STD', 'Standard Room', 'Comfortable standard room with essential amenities', 3500, 2, ARRAY['TV', 'WiFi', 'AC'], '🛏️', '#6B7280'),
('DLX', 'Deluxe Room', 'Spacious deluxe room with premium amenities', 5000, 2, ARRAY['TV', 'WiFi', 'AC', 'Minibar'], '✨', '#3B82F6'),
('SUP', 'Superior Room', 'Superior room with city view', 6500, 3, ARRAY['TV', 'WiFi', 'AC', 'Minibar', 'Safe'], '🌟', '#8B5CF6'),
('EXE', 'Executive Room', 'Executive room for business travelers', 8000, 2, ARRAY['TV', 'WiFi', 'AC', 'Minibar', 'Safe', 'Work Desk'], '💼', '#059669'),
('STE', 'Suite', 'Luxurious suite with living area', 12000, 4, ARRAY['TV', 'WiFi', 'AC', 'Minibar', 'Safe', 'Kitchen', 'Balcony'], '👑', '#DC2626'),
('VIP', 'VIP Suite', 'Premium VIP suite with all amenities', 20000, 4, ARRAY['TV', 'WiFi', 'AC', 'Minibar', 'Safe', 'Kitchen', 'Balcony', 'Jacuzzi'], '🏆', '#F59E0B')
ON CONFLICT (type_code) DO NOTHING;

-- Default Room Plans
INSERT INTO public.room_plans (plan_code, plan_name, description, rate_modifier, includes_breakfast, includes_lunch, includes_dinner, color, icon) VALUES
('RO', 'Room Only', 'Room only without meals', 1.0, FALSE, FALSE, FALSE, '#6B7280', '🛏️'),
('BB', 'Bed & Breakfast', 'Room with breakfast included', 1.15, TRUE, FALSE, FALSE, '#10B981', '🍳'),
('HB', 'Half Board', 'Room with breakfast and dinner', 1.30, TRUE, FALSE, TRUE, '#3B82F6', '🍽️'),
('FB', 'Full Board', 'Room with all meals included', 1.50, TRUE, TRUE, TRUE, '#8B5CF6', '🍴'),
('AI', 'All Inclusive', 'All inclusive package', 1.75, TRUE, TRUE, TRUE, '#DC2626', '⭐')
ON CONFLICT (plan_code) DO NOTHING;

-- Sample Rooms
INSERT INTO public.hotel_rooms (room_number, room_name, floor_number, room_type_id, room_type_name, bed_type, bed_count, is_vip, has_tv, has_wifi, has_ac, has_balcony, room_rate, status, housekeeping_status) VALUES
('101', 'Standard 101', 1, 1, 'Standard Room', 'Double', 1, FALSE, TRUE, TRUE, TRUE, FALSE, 3500, 'Vacant', 'Clean'),
('102', 'Standard 102', 1, 1, 'Standard Room', 'Twin', 2, FALSE, TRUE, TRUE, TRUE, FALSE, 3500, 'Vacant', 'Clean'),
('103', 'Deluxe 103', 1, 2, 'Deluxe Room', 'King', 1, FALSE, TRUE, TRUE, TRUE, FALSE, 5000, 'Vacant', 'Clean'),
('201', 'Superior 201', 2, 3, 'Superior Room', 'King', 1, FALSE, TRUE, TRUE, TRUE, TRUE, 6500, 'Vacant', 'Clean'),
('202', 'Executive 202', 2, 4, 'Executive Room', 'King', 1, FALSE, TRUE, TRUE, TRUE, TRUE, 8000, 'Vacant', 'Clean'),
('301', 'Suite 301', 3, 5, 'Suite', 'King', 1, TRUE, TRUE, TRUE, TRUE, TRUE, 12000, 'Vacant', 'Clean'),
('302', 'VIP Suite 302', 3, 6, 'VIP Suite', 'King', 2, TRUE, TRUE, TRUE, TRUE, TRUE, 20000, 'Vacant', 'Clean')
ON CONFLICT (room_number) DO NOTHING;

-- =====================================================
-- CREATE INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_status ON public.hotel_rooms(status);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_floor ON public.hotel_rooms(floor_number);
CREATE INDEX IF NOT EXISTS idx_hotel_guests_phone ON public.hotel_guests(phone);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_dates ON public.hotel_reservations(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_status ON public.hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_status ON public.hotel_bookings(status);
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_room ON public.hotel_bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room ON public.housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_status ON public.housekeeping_tasks(status);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_status_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "Allow all for room_types" ON public.room_types;
DROP POLICY IF EXISTS "Allow all for room_plans" ON public.room_plans;
DROP POLICY IF EXISTS "Allow all for hotel_rooms" ON public.hotel_rooms;
DROP POLICY IF EXISTS "Allow all for hotel_guests" ON public.hotel_guests;
DROP POLICY IF EXISTS "Allow all for hotel_reservations" ON public.hotel_reservations;
DROP POLICY IF EXISTS "Allow all for hotel_bookings" ON public.hotel_bookings;
DROP POLICY IF EXISTS "Allow all for hotel_payments" ON public.hotel_payments;
DROP POLICY IF EXISTS "Allow all for housekeeping_tasks" ON public.housekeeping_tasks;
DROP POLICY IF EXISTS "Allow all for room_status_log" ON public.room_status_log;

-- Create permissive policies
CREATE POLICY "Allow all for room_types" ON public.room_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for room_plans" ON public.room_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_rooms" ON public.hotel_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_guests" ON public.hotel_guests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_reservations" ON public.hotel_reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_bookings" ON public.hotel_bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hotel_payments" ON public.hotel_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for housekeeping_tasks" ON public.housekeeping_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for room_status_log" ON public.room_status_log FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT ALL ON public.room_types TO authenticated, anon;
GRANT ALL ON public.room_plans TO authenticated, anon;
GRANT ALL ON public.hotel_rooms TO authenticated, anon;
GRANT ALL ON public.hotel_guests TO authenticated, anon;
GRANT ALL ON public.hotel_reservations TO authenticated, anon;
GRANT ALL ON public.hotel_bookings TO authenticated, anon;
GRANT ALL ON public.hotel_payments TO authenticated, anon;
GRANT ALL ON public.housekeeping_tasks TO authenticated, anon;
GRANT ALL ON public.room_status_log TO authenticated, anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- Done!
SELECT 'Hotel Management Schema Created Successfully!' AS status;
