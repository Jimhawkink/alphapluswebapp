-- ============================================================
-- FIX RECIPE INGREDIENTS FOREIGN KEY CONSTRAINT
-- The constraint currently references products(pid) but should 
-- reference products_ingredients(pid) for ingredients
-- ============================================================

-- Step 1: Drop the incorrect foreign key constraint
ALTER TABLE recipe_ingredients 
DROP CONSTRAINT IF EXISTS recipe_ingredients_ingredient_product_id_fkey;

-- Step 2: Add the correct foreign key constraint referencing products_ingredients
ALTER TABLE recipe_ingredients 
ADD CONSTRAINT recipe_ingredients_ingredient_product_id_fkey 
FOREIGN KEY (ingredient_product_id) REFERENCES products_ingredients(pid);

-- ============================================================
-- DONE! ✅
-- Now recipe ingredients will correctly reference the 
-- products_ingredients table instead of products table
-- ============================================================
