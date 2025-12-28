-- ============================================================
-- ALPHA PLUS - FIX BUTTON_UI_COLOR COLUMN TYPE
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop and recreate button_ui_color as VARCHAR if it's the wrong type
DO $$
BEGIN
    -- Check if column exists and is wrong type
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'products' AND column_name = 'button_ui_color' 
               AND data_type != 'character varying') THEN
        ALTER TABLE products DROP COLUMN button_ui_color;
        ALTER TABLE products ADD COLUMN button_ui_color VARCHAR(100) DEFAULT 'from-blue-400 to-blue-600';
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'products' AND column_name = 'button_ui_color') THEN
        ALTER TABLE products ADD COLUMN button_ui_color VARCHAR(100) DEFAULT 'from-blue-400 to-blue-600';
    END IF;
END $$;

-- Set default color for any null values
UPDATE products SET button_ui_color = 'from-blue-400 to-blue-600' WHERE button_ui_color IS NULL;

SELECT 'button_ui_color column fixed!' as status;
