-- =====================================================
-- HOTEL GUESTS TABLE - ADD NEW COLUMNS
-- Run this script to add new columns to existing hotel_guests table
-- =====================================================

-- Add gender column
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT 'Male';

-- Add date of birth
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add location fields
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS county VARCHAR(100);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS town VARCHAR(100);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS area_of_residence VARCHAR(200);

-- Add sponsorship type
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS sponsor_type VARCHAR(50) DEFAULT 'Self Sponsored';

-- Add vehicle information
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS vehicle_registration VARCHAR(50);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS vehicle_color VARCHAR(50);

-- Add next of kin / emergency contact
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS next_of_kin_name VARCHAR(200);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(50);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS next_of_kin_relationship VARCHAR(50);
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS next_of_kin_address TEXT;

-- Add last stay date
ALTER TABLE public.hotel_guests ADD COLUMN IF NOT EXISTS last_stay_date DATE;

-- Create index on vehicle registration for faster lookups
CREATE INDEX IF NOT EXISTS idx_hotel_guests_vehicle ON public.hotel_guests(vehicle_registration);
CREATE INDEX IF NOT EXISTS idx_hotel_guests_county ON public.hotel_guests(county);
CREATE INDEX IF NOT EXISTS idx_hotel_guests_gender ON public.hotel_guests(gender);

SELECT 'Hotel Guests table updated successfully!' AS status;
