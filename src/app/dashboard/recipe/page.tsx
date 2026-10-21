'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { executeDirectPrint } from '@/lib/printerSettings';

// Interfaces
interface Dish {
    pid: number;
    product_code: string;
    product_name: string;
    barcode: string;
    purchase_cost: number;
    sales_cost: number;
    current_stock?: number;
}

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    base_unit: string;
    pack_size: number;
    price_per_pack: number;
    cost_per_base_unit: number;
    current_stock: number;
}

interface RecipeIngredientRow {
    ingredient_id: number;
    ingredient_name: string;
    unit_measure: string;
    qty_issued: number;
    rate: number;
    total_cost: number;
    current_stock: number;
    base_unit: string;
}

interface SavedRecipe {
    recipe_id: number;
    product_id: number;
    dish_name: string;
    barcode: string;
    qty_produced: number;
    total_cost: number;
    cost_per_unit: number;
    recipe_date: string;
    batch_number: string;
    status: string;
    selling_price?: number;
}

interface ProductionBatch {
    batch_id: number;
    batch_number: string;
    product_id: number;
    product_name: string;
    recipe_id: number;
    qty_produced: number;
    qty_remaining: number;
    cost_per_unit: number;
    total_production_cost: number;
    selling_price: number;
    production_date: string;
    status: string;
}

export default function RecipePage() {
    // Navigation Tab
    const [activeTab, setActiveTab] = useState<'studio' | 'library' | 'batches'>('studio');

    // Data lists
    const [dishes, setDishes] = useState<Dish[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
    const [batches, setBatches] = useState<ProductionBatch[]>([]);
    const [companyName, setCompanyName] = useState('AlphaPlus Hospitality');

    // Studio Selected Dish & Header Config
    const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
    const [portionsYield, setPortionsYield] = useState<number>(1);
    const [numIngredients, setNumIngredients] = useState<number>(2);
    const [recipeDate, setRecipeDate] = useState(new Date().toISOString().split('T')[0]);
    const [batchNumber, setBatchNumber] = useState('');
    const [recipeNotes, setRecipeNotes] = useState('');

    // Dynamic Ingredients Table Rows
    const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientRow[]>([]);

    // Ingredient picker row state
    const [selectedIngId, setSelectedIngId] = useState<number | ''>('');
    const [inputQty, setInputQty] = useState('');
    const [inputUnit, setInputUnit] = useState('');

    // Loading & saving states
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchLibrary, setSearchLibrary] = useState('');

    // =========================================================================
    // UNIT CONVERSION ENGINE
    // =========================================================================
    const normalizeUnit = (unit: string): string => {
        const u = (unit || '').toUpperCase().trim();
        if (['L', 'LTR', 'LITER', 'LITERS', 'LITRE', 'LITRES'].includes(u)) return 'L';
        if (['ML', 'MLS', 'MILLILITER', 'MILLILITERS'].includes(u)) return 'ML';
        if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS', 'KILO'].includes(u)) return 'KG';
        if (['G', 'GM', 'GMS', 'GRAM', 'GRAMS'].includes(u)) return 'G';
        if (['PCS', 'PC', 'PIECE', 'PIECES', 'EACH', 'EA'].includes(u)) return 'PCS';
        if (['EGG', 'EGGS'].includes(u)) return 'EGGS';
        if (['TRAY', 'TRAYS'].includes(u)) return 'TRAY';
        if (['PKT', 'PACKET', 'PACKETS'].includes(u)) return 'PKT';
        if (['BOX', 'BOXES'].includes(u)) return 'BOX';
        if (['BTL', 'BOTTLE', 'BOTTLES'].includes(u)) return 'BTL';
        return u || 'KG';
    };

    const convertToBase = (qty: number, fromUnit: string, baseUnit: string): number => {
        const from = normalizeUnit(fromUnit);
        const base = normalizeUnit(baseUnit);
        if (from === base || !from) return qty;

        // Mass
        if (from === 'G' && base === 'KG') return qty * 0.001;
        if (from === 'KG' && base === 'G') return qty * 1000;

        // Volume
        if (from === 'ML' && base === 'L') return qty * 0.001;
        if (from === 'L' && base === 'ML') return qty * 1000;

        // Eggs
        if (from === 'TRAY' && base === 'EGGS') return qty * 30;
        if (from === 'EGGS' && base === 'TRAY') return qty / 30;

        return qty;
    };

    const computeLineCost = (qty: number, unit: string, ing: Ingredient): number => {
        const qtyInBase = convertToBase(qty, unit, ing.base_unit);
        const costPerBase = ing.cost_per_base_unit || (ing.price_per_pack / (ing.pack_size || 1)) || 0;
        return qtyInBase * costPerBase;
    };

    // =========================================================================
    // LOAD DATA
    // =========================================================================
    const loadAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Load company info
            const { data: orgData } = await supabase
                .from('organisation_settings')
                .select('setting_value')
                .eq('setting_key', 'company_name')
                .maybeSingle();
            if (orgData?.setting_value) setCompanyName(orgData.setting_value);

            // Load active dishes (products) - note products table does not have 'stock' column
            const { data: dishData, error: dishError } = await supabase
                .from('products')
                .select('pid, product_code, product_name, barcode, purchase_cost, sales_cost')
                .eq('active', true)
                .order('product_name');

            if (dishError) {
                console.error('Error loading products for recipe:', dishError);
            }

            // Load kitchen ready stock from active production batches
            const { data: activeBatches } = await supabase
                .from('production_batches')
                .select('product_id, qty_remaining')
                .gt('qty_remaining', 0);

            const batchStockMap: Record<number, number> = {};
            if (activeBatches) {
                activeBatches.forEach((b: any) => {
                    batchStockMap[b.product_id] = (batchStockMap[b.product_id] || 0) + (Number(b.qty_remaining) || 0);
                });
            }

            setDishes((dishData || []).map((d: any) => ({
                pid: d.pid,
                product_code: d.product_code,
                product_name: d.product_name,
                barcode: d.barcode,
                purchase_cost: Number(d.purchase_cost) || 0,
                sales_cost: Number(d.sales_cost) || 0,
                current_stock: batchStockMap[d.pid] || 0
            })));

            // Load store raw ingredients
            const { data: ingData } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, base_unit, pack_size, price_per_pack, cost_per_base_unit, current_stock')
                .eq('active', true)
                .order('product_name');
            setIngredients((ingData || []).map((i: any) => ({
                pid: i.pid,
                product_code: i.product_code,
                product_name: i.product_name,
                base_unit: i.base_unit || 'KG',
                pack_size: Number(i.pack_size) || 1,
                price_per_pack: Number(i.price_per_pack) || 0,
                cost_per_base_unit: Number(i.cost_per_base_unit) || (Number(i.price_per_pack) / (Number(i.pack_size) || 1)) || 0,
                current_stock: Number(i.current_stock) || 0
            })));

            // Load saved recipes
            const { data: recipeData } = await supabase
                .from('recipes')
                .select('*')
                .order('recipe_id', { ascending: false });
            
            // Map with selling prices
            const mappedRecipes: SavedRecipe[] = (recipeData || []).map((r: any) => {
                const matchedDish = (dishData || []).find((d: any) => d.pid === r.product_id);
                return {
                    recipe_id: r.recipe_id,
                    product_id: r.product_id,
                    dish_name: r.dish_name,
                    barcode: r.barcode,
                    qty_produced: Number(r.qty_produced) || 1,
                    total_cost: Number(r.total_cost) || 0,
                    cost_per_unit: Number(r.cost_per_unit) || 0,
                    recipe_date: r.recipe_date,
                    batch_number: r.batch_number,
                    status: r.status,
                    selling_price: matchedDish ? Number(matchedDish.sales_cost) : undefined
                };
            });
            setSavedRecipes(mappedRecipes);

            // Load kitchen production batches
            const { data: batchData } = await supabase
                .from('production_batches')
                .select('*')
                .order('batch_id', { ascending: false })
                .limit(50);
            setBatches(batchData || []);

        } catch (err) {
            console.error('Error loading recipe studio data:', err);
            toast.error('Failed to load recipe data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // Generate unique batch code
    useEffect(() => {
        if (selectedDish) {
            const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const timeCode = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
            setBatchNumber(`BATCH-${dateCode}-${timeCode}-${selectedDish.pid}`);
        } else {
            setBatchNumber('');
        }
    }, [selectedDish]);

    // =========================================================================
    // INGREDIENT ROW MANAGEMENT
    // =========================================================================
    const handleAddIngredientRow = () => {
        if (!selectedIngId) {
            toast.error('Select an ingredient from store');
            return;
        }
        const qty = parseFloat(inputQty);
        if (!qty || qty <= 0) {
            toast.error('Enter a valid quantity');
            return;
        }

        const ing = ingredients.find(i => i.pid === Number(selectedIngId));
        if (!ing) return;

        const unit = inputUnit || ing.base_unit;
        const lineCost = computeLineCost(qty, unit, ing);

        // Check if already in recipe
        const existingIdx = recipeIngredients.findIndex(r => r.ingredient_id === ing.pid);
        if (existingIdx !== -1) {
            // Update quantity
            setRecipeIngredients(prev => prev.map((row, idx) => {
                if (idx === existingIdx) {
                    const newQty = row.qty_issued + qty;
                    const newCost = computeLineCost(newQty, unit, ing);
                    return {
                        ...row,
                        qty_issued: newQty,
                        total_cost: newCost
                    };
                }
                return row;
            }));
        } else {
            setRecipeIngredients(prev => [
                ...prev,
                {
                    ingredient_id: ing.pid,
                    ingredient_name: ing.product_name,
                    unit_measure: unit,
                    qty_issued: qty,
                    rate: ing.cost_per_base_unit,
                    total_cost: lineCost,
                    current_stock: ing.current_stock,
                    base_unit: ing.base_unit
                }
            ]);
        }

        // Reset picker fields
        setSelectedIngId('');
        setInputQty('');
        setInputUnit('');

        // Progress feedback
        const isNew = existingIdx === -1;
        const currentCount = isNew ? recipeIngredients.length + 1 : recipeIngredients.length;
        if (currentCount === numIngredients) {
            toast.success(`All ${numIngredients} ingredients added! Ready to save or cook 🎉`, { icon: '✅' });
        } else if (currentCount < numIngredients) {
            toast.success(`Ingredient ${currentCount} of ${numIngredients} added (${ing.product_name})`);
        } else {
            toast.success(`Added ${ing.product_name} (${currentCount} total ingredients)`);
        }
    };

    const handleRemoveIngredientRow = (ingId: number) => {
        setRecipeIngredients(prev => prev.filter(r => r.ingredient_id !== ingId));
    };

    // Cost calculations
    const totalRecipeCost = useMemo(() => {
        return recipeIngredients.reduce((sum, r) => sum + r.total_cost, 0);
    }, [recipeIngredients]);

    const portionCost = useMemo(() => {
        return portionsYield > 0 ? (totalRecipeCost / portionsYield) : totalRecipeCost;
    }, [totalRecipeCost, portionsYield]);

    const dishSellingPrice = selectedDish?.sales_cost || 0;
    const grossProfitPortion = dishSellingPrice - portionCost;
    const foodCostPercentage = dishSellingPrice > 0 ? ((portionCost / dishSellingPrice) * 100) : 0;

    // Load saved recipe into studio
    const loadRecipeIntoStudio = async (r: SavedRecipe) => {
        const dish = dishes.find(d => d.pid === r.product_id) || null;
        setSelectedDish(dish);
        setPortionsYield(r.qty_produced || 1);
        setRecipeDate(r.recipe_date || new Date().toISOString().split('T')[0]);

        // Fetch ingredients for this recipe
        try {
            const { data: ings } = await supabase
                .from('recipe_ingredients')
                .select('*')
                .eq('recipe_id', r.recipe_id);

            if (ings && ings.length > 0) {
                const mappedRows: RecipeIngredientRow[] = ings.map((it: any) => {
                    const matchedStoreIng = ingredients.find(i => i.pid === it.ingredient_product_id);
                    return {
                        ingredient_id: it.ingredient_product_id,
                        ingredient_name: it.ingredient_name,
                        unit_measure: it.unit_measure || 'KG',
                        qty_issued: Number(it.qty_issued) || 1,
                        rate: Number(it.rate) || 0,
                        total_cost: Number(it.total_cost) || 0,
                        current_stock: matchedStoreIng ? matchedStoreIng.current_stock : 0,
                        base_unit: matchedStoreIng ? matchedStoreIng.base_unit : 'KG'
                    };
                });
                setRecipeIngredients(mappedRows);
                setNumIngredients(mappedRows.length || 2);
            } else {
                setRecipeIngredients([]);
                setNumIngredients(2);
            }
            setActiveTab('studio');
            toast.success(`Loaded recipe for ${r.dish_name} into Studio 🧪`);
        } catch (e) {
            console.error('Error loading recipe ingredients:', e);
            toast.error('Failed to load ingredients');
        }
    };

    // Handler when selecting a dish in the studio dropdown
    const handleSelectDish = async (dishId: number) => {
        const dish = dishes.find(d => d.pid === dishId) || null;
        setSelectedDish(dish);
        if (!dish) {
            setRecipeIngredients([]);
            return;
        }

        const dateStr = recipeDate.replace(/-/g, '').slice(2);
        setBatchNumber(`B-${dish.product_code || dish.pid}-${dateStr}`);

        // Automatically load existing saved recipe for this dish if one exists
        const existingRecipe = savedRecipes.find(r => r.product_id === dish.pid);
        if (existingRecipe) {
            try {
                const { data: ings } = await supabase
                    .from('recipe_ingredients')
                    .select('*')
                    .eq('recipe_id', existingRecipe.recipe_id);

                if (ings && ings.length > 0) {
                    const mappedRows: RecipeIngredientRow[] = ings.map((it: any) => {
                        const matchedStoreIng = ingredients.find(i => i.pid === it.ingredient_product_id);
                        return {
                            ingredient_id: it.ingredient_product_id,
                            ingredient_name: it.ingredient_name,
                            unit_measure: it.unit_measure || 'KG',
                            qty_issued: Number(it.qty_issued) || 1,
                            rate: Number(it.rate) || 0,
                            total_cost: Number(it.total_cost) || 0,
                            current_stock: matchedStoreIng ? matchedStoreIng.current_stock : 0,
                            base_unit: matchedStoreIng ? matchedStoreIng.base_unit : 'KG'
                        };
                    });
                    setRecipeIngredients(mappedRows);
                    setNumIngredients(mappedRows.length || 2);
                    setPortionsYield(existingRecipe.qty_produced || 1);
                    toast.success(`Loaded saved recipe formula for ${dish.product_name} (${mappedRows.length} ingredients) 📖`);
                    return;
                }
            } catch (err) {
                console.error('Error auto-loading recipe formula:', err);
            }
        }
        setRecipeIngredients([]);
    };

    // =========================================================================
    // SAVE RECIPE SPECIFICATION
    // =========================================================================
    const handleSaveRecipeSpec = async () => {
        if (!selectedDish) {
            toast.error('Please select a target dish first');
            return;
        }
        if (recipeIngredients.length === 0) {
            toast.error('Add at least one ingredient to the recipe');
            return;
        }

        setIsSaving(true);
        try {
            // 1. Insert or update recipe master
            const { data: newRecipe, error: recError } = await supabase
                .from('recipes')
                .insert({
                    product_id: selectedDish.pid,
                    dish_name: selectedDish.product_name,
                    barcode: selectedDish.barcode || null,
                    qty_produced: portionsYield,
                    total_cost: totalRecipeCost,
                    cost_per_unit: portionCost,
                    recipe_date: recipeDate,
                    batch_number: batchNumber,
                    created_by: 'Executive Chef',
                    status: 'Standard Spec'
                })
                .select()
                .single();

            if (recError) throw recError;

            // 2. Insert ingredients into recipe_ingredients
            const itemsPayload = recipeIngredients.map(r => ({
                recipe_id: newRecipe.recipe_id,
                ingredient_product_id: r.ingredient_id,
                ingredient_name: r.ingredient_name,
                unit_measure: r.unit_measure,
                qty_issued: r.qty_issued,
                convert_unit: r.unit_measure,
                rate: r.rate,
                total_cost: r.total_cost,
                remaining_qty: r.current_stock
            }));

            const { error: ingError } = await supabase
                .from('recipe_ingredients')
                .insert(itemsPayload);

            if (ingError) throw ingError;

            toast.success(`Recipe specification saved for ${selectedDish.product_name}! Portion COGS: Ksh ${portionCost.toFixed(2)} ✅`);
            await loadAllData();
        } catch (err: any) {
            console.error('Error saving recipe spec:', err);
            toast.error(`Save failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    // =========================================================================
    // COOK BATCH & DEPLETE STORE INGREDIENTS
    // =========================================================================
    const handleCookAndDepleteBatch = async () => {
        if (!selectedDish || recipeIngredients.length === 0) {
            toast.error('Select a dish and ingredients before cooking a batch');
            return;
        }

        if (!confirm(`Confirm cooking batch of ${portionsYield} portions for ${selectedDish.product_name}? Store stock will be deducted immediately.`)) {
            return;
        }

        setIsSaving(true);
        try {
            // 1. Ensure master recipe exists
            const { data: recipeRecord } = await supabase
                .from('recipes')
                .insert({
                    product_id: selectedDish.pid,
                    dish_name: selectedDish.product_name,
                    barcode: selectedDish.barcode || null,
                    qty_produced: portionsYield,
                    total_cost: totalRecipeCost,
                    cost_per_unit: portionCost,
                    recipe_date: recipeDate,
                    batch_number: batchNumber,
                    created_by: 'Chef Production',
                    status: 'Cooked Batch'
                })
                .select()
                .single();

            const recipeId = recipeRecord?.recipe_id || null;

            // 2. Insert into production_batches
            await supabase
                .from('production_batches')
                .insert({
                    batch_number: batchNumber,
                    product_id: selectedDish.pid,
                    product_name: selectedDish.product_name,
                    recipe_id: recipeId,
                    qty_produced: portionsYield,
                    qty_remaining: portionsYield,
                    cost_per_unit: portionCost,
                    total_production_cost: totalRecipeCost,
                    selling_price: selectedDish.sales_cost,
                    production_date: recipeDate,
                    status: 'In Stock'
                });

            // 3. Save batch recipe ingredients
            if (recipeId) {
                const batchItems = recipeIngredients.map(r => ({
                    recipe_id: recipeId,
                    ingredient_product_id: r.ingredient_id,
                    ingredient_name: r.ingredient_name,
                    unit_measure: r.unit_measure,
                    qty_issued: r.qty_issued,
                    convert_unit: r.unit_measure,
                    rate: r.rate,
                    total_cost: r.total_cost,
                    remaining_qty: r.current_stock
                }));
                await supabase.from('recipe_ingredients').insert(batchItems);
            }

            // 4. Deplete raw ingredients from products_ingredients & log to stock_movements
            for (const r of recipeIngredients) {
                const storeIng = ingredients.find(i => i.pid === r.ingredient_id);
                if (storeIng) {
                    const deductInBase = convertToBase(r.qty_issued, r.unit_measure, storeIng.base_unit);
                    const newStock = Math.max(0, storeIng.current_stock - deductInBase);

                    await supabase
                        .from('products_ingredients')
                        .update({ current_stock: newStock })
                        .eq('pid', r.ingredient_id);

                    // Log audit stock movement
                    await supabase
                        .from('stock_movements')
                        .insert({
                            product_id: r.ingredient_id,
                            movement_type: 'Batch Cooking Depletion',
                            quantity: -deductInBase,
                            reference_no: batchNumber,
                            created_at: new Date().toISOString()
                        });
                }
            }

            toast.success(`Batch ${batchNumber} successfully cooked! Deducted store ingredients and added ${portionsYield} portions to kitchen inventory 🎉`);
            await loadAllData();
            setActiveTab('batches');
        } catch (err: any) {
            console.error('Error cooking production batch:', err);
            toast.error(`Production batch failed: ${err.message || 'Check database connection'}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Print Recipe Specification Sheet
    const handlePrintRecipeCard = async () => {
        if (!selectedDish || recipeIngredients.length === 0) return;
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recipe: ${selectedDish.product_name}</title>
<style>
  body { font-family: monospace; font-size: 13px; max-width: 80mm; padding: 5mm; margin: 0 auto; line-height: 1.4; }
  .title { text-align: center; font-size: 16px; font-weight: bold; border-bottom: 2px dashed #000; padding-bottom: 4px; }
  .meta { margin: 8px 0; font-size: 11px; }
  .grid { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .grid th, .grid td { border-bottom: 1px dashed #666; padding: 4px 1px; font-size: 11px; }
  .total { border-top: 2px dashed #000; font-weight: bold; padding: 6px 0; font-size: 12px; }
</style>
</head>
<body>
  <div class="title">${companyName}<br>CULINARY RECIPE SPEC</div>
  <div class="meta">
    <strong>Dish:</strong> ${selectedDish.product_name}<br>
    <strong>Yield:</strong> ${portionsYield} Portions<br>
    <strong>Date:</strong> ${recipeDate}<br>
    <strong>Batch:</strong> ${batchNumber}
  </div>
  <table class="grid">
    <thead>
      <tr><th align="left">Ingredient</th><th align="right">Qty</th><th align="right">Cost</th></tr>
    </thead>
    <tbody>
      ${recipeIngredients.map(i => `<tr><td>${i.ingredient_name}</td><td align="right">${i.qty_issued} ${i.unit_measure}</td><td align="right">Ksh ${i.total_cost.toFixed(2)}</td></tr>`).join('')}
    </tbody>
  </table>
  <div class="total">
    <div>Total Batch Cost: Ksh ${totalRecipeCost.toLocaleString()}</div>
    <div>Cost / Portion: Ksh ${portionCost.toFixed(2)}</div>
    <div>Selling Price: Ksh ${dishSellingPrice.toLocaleString()}</div>
    <div>Food Cost: ${foodCostPercentage.toFixed(1)}%</div>
  </div>
</body>
</html>`;
        await executeDirectPrint(html, { printerRole: 'customer' });
        toast.success('Recipe card dispatched to thermal printer 🧾');
    };

    // Filtered recipes in library
    const filteredRecipes = useMemo(() => {
        if (!searchLibrary) return savedRecipes;
        const q = searchLibrary.toLowerCase();
        return savedRecipes.filter(r => (r.dish_name || '').toLowerCase().includes(q));
    }, [savedRecipes, searchLibrary]);

    // Average Food Cost % across all recipes
    const avgFoodCost = useMemo(() => {
        const valid = savedRecipes.filter(r => r.selling_price && r.selling_price > 0 && r.cost_per_unit > 0);
        if (valid.length === 0) return 28.5;
        const sum = valid.reduce((acc, r) => acc + ((r.cost_per_unit / (r.selling_price || 1)) * 100), 0);
        return Math.round((sum / valid.length) * 10) / 10;
    }, [savedRecipes]);

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-2 sm:p-4">
            {/* Top Cockpit Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-black uppercase tracking-wider">
                            Executive Kitchen COGS
                        </span>
                        <span className="text-xs text-gray-500 font-medium">{companyName}</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                        <span>🍳</span> Culinary Recipe Studio &amp; Portion Costing
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Standard yield formulas, dynamic multi-ingredient costing, real-time Food Cost % margin analysis, and store auto-depletion.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex items-center bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200">
                    <button
                        onClick={() => setActiveTab('studio')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'studio' ? 'bg-white text-emerald-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>🧪</span>
                        <span>Recipe Studio</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'library' ? 'bg-white text-indigo-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>📚</span>
                        <span>Saved Recipes ({savedRecipes.length})</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('batches')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'batches' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>🏭</span>
                        <span>Cooked Batches ({batches.length})</span>
                    </button>
                </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Active Master Recipes</p>
                    <p className="text-3xl font-black text-gray-900 mt-1">{savedRecipes.length}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">● Standardized Culinary Formulas</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Average Food Cost % (COGS)</p>
                    <p className="text-3xl font-black text-emerald-700 mt-1">{avgFoodCost}%</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">✓ Target benchmark: 28% – 32%</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Raw Store Ingredients</p>
                    <p className="text-3xl font-black text-indigo-700 mt-1">{ingredients.length}</p>
                    <p className="text-[11px] text-indigo-500 font-semibold mt-1">Monitored store inventory items</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Active Kitchen Batches</p>
                    <p className="text-3xl font-black text-purple-700 mt-1">{batches.filter(b => (b.qty_remaining || 0) > 0).length}</p>
                    <p className="text-[11px] text-purple-600 font-semibold mt-1">In kitchen ready for service</p>
                </div>
            </div>

            {/* TAB 1: RECIPE STUDIO */}
            {activeTab === 'studio' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left 4 Cols: Dish Selector & Financial Margin Card */}
                    <div className="lg:col-span-4 space-y-5">
                        {/* Target Dish Selector */}
                        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                                <span>🍽️</span> 1. Select Target Dish
                            </h2>

                            <div>
                                <label className="text-xs font-bold uppercase text-gray-500 block mb-1.5">Menu Dish Item</label>
                                <select
                                    value={selectedDish?.pid || ''}
                                    onChange={(e) => handleSelectDish(Number(e.target.value))}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="">Select menu dish...</option>
                                    {dishes.map(d => (
                                        <option key={d.pid} value={d.pid}>
                                            {d.product_name} (Menu Price: Ksh {d.sales_cost.toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedDish && (
                                <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl space-y-1 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-emerald-800 font-semibold">Selling Price:</span>
                                        <span className="font-mono font-black text-emerald-900">Ksh {selectedDish.sales_cost.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-emerald-800 font-semibold">Barcode:</span>
                                        <span className="font-mono text-gray-600">{selectedDish.barcode || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-emerald-800 font-semibold">Kitchen Stock:</span>
                                        <span className="font-bold text-gray-800">{selectedDish.current_stock || 0} Portions</span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-2.5 pt-2">
                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-600 block mb-1">Yield (Portions)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={portionsYield}
                                        onChange={(e) => setPortionsYield(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-600 block mb-1">No. of Ingredients</label>
                                    <select
                                        value={numIngredients}
                                        onChange={(e) => setNumIngredients(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-900 cursor-pointer focus:border-emerald-500"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map(n => (
                                            <option key={n} value={n}>{n} Items</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-600 block mb-1">Recipe Date</label>
                                    <input
                                        type="date"
                                        value={recipeDate}
                                        onChange={(e) => setRecipeDate(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Portion Cost & Profit Matrix */}
                        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                                <span>📊</span> Live Cost &amp; Profit Matrix
                            </h2>

                            <div className="space-y-3">
                                <div className="p-3 bg-gray-50 rounded-2xl flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-500">Total Batch Cost ({portionsYield} portions)</span>
                                    <span className="text-base font-black font-mono text-gray-900">Ksh {totalRecipeCost.toLocaleString()}</span>
                                </div>

                                <div className="p-3 bg-emerald-50 rounded-2xl flex justify-between items-center border border-emerald-200">
                                    <div>
                                        <span className="text-xs font-bold text-emerald-900 block">Cost Per Portion (COGS)</span>
                                        <span className="text-[10px] text-emerald-700">Raw ingredient cost per plate</span>
                                    </div>
                                    <span className="text-xl font-black font-mono text-emerald-800">Ksh {portionCost.toFixed(2)}</span>
                                </div>

                                <div className="p-3 bg-blue-50 rounded-2xl flex justify-between items-center border border-blue-200">
                                    <div>
                                        <span className="text-xs font-bold text-blue-900 block">Gross Profit Per Portion</span>
                                        <span className="text-[10px] text-blue-700">Margin contribution</span>
                                    </div>
                                    <span className="text-xl font-black font-mono text-blue-800">Ksh {grossProfitPortion.toFixed(2)}</span>
                                </div>

                                {/* Food Cost Benchmark Badge */}
                                <div className={`p-4 rounded-2xl border text-center ${
                                    foodCostPercentage <= 28
                                        ? 'bg-green-50 border-green-200 text-green-900'
                                        : foodCostPercentage <= 35
                                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                                            : 'bg-red-50 border-red-200 text-red-900'
                                }`}>
                                    <p className="text-xs font-bold uppercase tracking-wider">Theoretical Food Cost %</p>
                                    <p className="text-3xl font-black mt-0.5">{foodCostPercentage.toFixed(1)}%</p>
                                    <p className="text-[11px] font-semibold mt-1">
                                        {foodCostPercentage <= 28 && '🟢 High Profit Margin (<28%)'}
                                        {foodCostPercentage > 28 && foodCostPercentage <= 35 && '🟡 Healthy Restaurant Benchmark (28% – 35%)'}
                                        {foodCostPercentage > 35 && '🔴 High Portion Cost — Consider recipe re-portioning!'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right 8 Cols: Dynamic Ingredients Table & Studio Actions */}
                    <div className="lg:col-span-8 bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 flex flex-col h-full space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                        <span>🧂</span> 2. Recipe Formula Ingredients ({recipeIngredients.length} / {numIngredients})
                                    </h2>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                                        recipeIngredients.length === numIngredients
                                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                            : recipeIngredients.length > numIngredients
                                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                                : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                                    }`}>
                                        {recipeIngredients.length === numIngredients && `✓ Complete (${numIngredients}/${numIngredients})`}
                                        {recipeIngredients.length < numIngredients && `⚠️ ${recipeIngredients.length} of ${numIngredients} added`}
                                        {recipeIngredients.length > numIngredients && `✨ ${recipeIngredients.length} ingredients (target: ${numIngredients})`}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Target formula: <strong className="text-gray-800">{numIngredients} ingredients</strong>. Add raw store ingredients with auto conversions.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                <span>Yield: <strong className="text-emerald-900 font-mono text-sm">{portionsYield}</strong> Portions</span>
                            </div>
                        </div>

                        {/* Add Ingredient Line Picker */}
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                            <div className="sm:col-span-5">
                                <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Select Ingredient from Store</label>
                                <select
                                    value={selectedIngId}
                                    onChange={(e) => {
                                        const id = Number(e.target.value);
                                        setSelectedIngId(id || '');
                                        const match = ingredients.find(i => i.pid === id);
                                        if (match) setInputUnit(match.base_unit);
                                    }}
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="">Pick raw ingredient...</option>
                                    {ingredients.map(i => (
                                        <option key={i.pid} value={i.pid}>
                                            {i.product_name} (Store Stock: {i.current_stock} {i.base_unit} · Ksh {i.cost_per_base_unit.toFixed(1)}/{i.base_unit})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="sm:col-span-3">
                                <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Portion Qty</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="e.g. 250"
                                    value={inputQty}
                                    onChange={(e) => setInputQty(e.target.value)}
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Unit</label>
                                <select
                                    value={inputUnit}
                                    onChange={(e) => setInputUnit(e.target.value)}
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold uppercase focus:outline-none"
                                >
                                    {['KG', 'G', 'L', 'ML', 'PCS', 'EGGS', 'TRAY', 'PKT'].map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="sm:col-span-2">
                                <button
                                    onClick={handleAddIngredientRow}
                                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition-all"
                                >
                                    + Add Line
                                </button>
                            </div>
                        </div>

                        {/* Ingredients Table */}
                        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-2xl">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 text-[11px] font-bold uppercase text-gray-500 border-b border-gray-100 sticky top-0">
                                    <tr>
                                        <th className="py-3 px-3">Ingredient Name</th>
                                        <th className="py-3 px-3">Store Stock</th>
                                        <th className="py-3 px-3 text-right">Recipe Quantity</th>
                                        <th className="py-3 px-3 text-right">Unit Rate</th>
                                        <th className="py-3 px-3 text-right">Total Line Cost</th>
                                        <th className="py-3 px-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium">
                                    {recipeIngredients.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                                                No ingredients added yet. Use the picker above to build this dish formula.
                                            </td>
                                        </tr>
                                    ) : (
                                        recipeIngredients.map(r => (
                                            <tr key={r.ingredient_id} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-2.5 px-3 font-bold text-gray-900">{r.ingredient_name}</td>
                                                <td className="py-2.5 px-3 text-gray-500">{r.current_stock} {r.base_unit}</td>
                                                <td className="py-2.5 px-3 text-right font-bold font-mono">
                                                    {r.qty_issued} {r.unit_measure}
                                                </td>
                                                <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                                                    Ksh {r.rate.toFixed(2)}/{r.base_unit}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-black font-mono text-emerald-800">
                                                    Ksh {r.total_cost.toFixed(2)}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    <button
                                                        onClick={() => handleRemoveIngredientRow(r.ingredient_id)}
                                                        className="text-red-500 hover:text-red-700 font-bold p-1"
                                                        title="Remove Ingredient"
                                                    >
                                                        🗑️
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Bottom Action Footer */}
                        <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePrintRecipeCard}
                                    disabled={!selectedDish || recipeIngredients.length === 0}
                                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                                >
                                    <span>🖨️</span>
                                    <span>Print Recipe Card</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setRecipeIngredients([]);
                                        setSelectedDish(null);
                                    }}
                                    className="px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold"
                                >
                                    ↺ Clear Studio
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    disabled={isSaving || !selectedDish || recipeIngredients.length === 0}
                                    onClick={handleSaveRecipeSpec}
                                    className="px-5 py-3 bg-white hover:bg-gray-50 text-emerald-800 border-2 border-emerald-600 disabled:opacity-40 rounded-2xl text-xs font-black transition-all shadow-sm flex items-center gap-2"
                                >
                                    <span>💾</span>
                                    <span>{isSaving ? 'Saving...' : 'Save Recipe Spec'}</span>
                                </button>

                                <button
                                    disabled={isSaving || !selectedDish || recipeIngredients.length === 0}
                                    onClick={handleCookAndDepleteBatch}
                                    className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white disabled:opacity-40 rounded-2xl text-xs font-black shadow-lg shadow-emerald-700/30 transition-all flex items-center gap-2"
                                >
                                    <span>🍳</span>
                                    <span>{isSaving ? 'Processing...' : `Cook Batch (${portionsYield} Pax) & Deplete Stock`}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: SAVED RECIPES LIBRARY */}
            {activeTab === 'library' && (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                        <div>
                            <h2 className="text-xl font-black text-gray-900">Culinary Recipe Master Library</h2>
                            <p className="text-xs text-gray-500">All standard recipes with live portion costing &amp; profit margins</p>
                        </div>
                        <input
                            type="text"
                            placeholder="Search dishes in library..."
                            value={searchLibrary}
                            onChange={(e) => setSearchLibrary(e.target.value)}
                            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium w-64 focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 text-[11px] font-bold uppercase text-gray-500 border-b border-gray-100">
                                <tr>
                                    <th className="py-3 px-3">Recipe ID</th>
                                    <th className="py-3 px-3">Dish Name</th>
                                    <th className="py-3 px-3">Portions Yield</th>
                                    <th className="py-3 px-3 text-right">Cost/Portion (COGS)</th>
                                    <th className="py-3 px-3 text-right">Menu Selling Price</th>
                                    <th className="py-3 px-3 text-right">Gross Profit</th>
                                    <th className="py-3 px-3 text-center">Food Cost %</th>
                                    <th className="py-3 px-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {filteredRecipes.map(r => {
                                    const sellPrice = r.selling_price || 0;
                                    const cogs = r.cost_per_unit || 0;
                                    const profit = sellPrice - cogs;
                                    const fcPct = sellPrice > 0 ? (cogs / sellPrice) * 100 : 0;
                                    return (
                                        <tr key={r.recipe_id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="py-3 px-3 font-mono font-bold text-gray-500">#{r.recipe_id}</td>
                                            <td className="py-3 px-3 font-bold text-gray-900 text-sm">{r.dish_name}</td>
                                            <td className="py-3 px-3 text-gray-600">{r.qty_produced} Portions</td>
                                            <td className="py-3 px-3 text-right font-black font-mono text-emerald-800">
                                                Ksh {cogs.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">
                                                {sellPrice > 0 ? `Ksh ${sellPrice.toLocaleString()}` : 'Not Set'}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-black text-blue-700">
                                                {sellPrice > 0 ? `Ksh ${profit.toFixed(2)}` : '—'}
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                                    fcPct <= 28 ? 'bg-green-100 text-green-800' : fcPct <= 35 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {fcPct > 0 ? `${fcPct.toFixed(1)}%` : '—'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <button
                                                    onClick={() => loadRecipeIntoStudio(r)}
                                                    className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    ✏️ Edit in Studio
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: KITCHEN PRODUCTION BATCHES */}
            {activeTab === 'batches' && (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                    <div className="pb-3 border-b border-gray-100">
                        <h2 className="text-xl font-black text-gray-900">Kitchen Production Batches Ledger</h2>
                        <p className="text-xs text-gray-500">Cooked kitchen batches with remaining portions (decremented by POS sales)</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 text-[11px] font-bold uppercase text-gray-500 border-b border-gray-100">
                                <tr>
                                    <th className="py-3 px-3">Batch Code</th>
                                    <th className="py-3 px-3">Dish Name</th>
                                    <th className="py-3 px-3">Production Date</th>
                                    <th className="py-3 px-3 text-right">Qty Produced</th>
                                    <th className="py-3 px-3 text-right">Qty Remaining</th>
                                    <th className="py-3 px-3 text-right">Cost / Unit</th>
                                    <th className="py-3 px-3 text-right">Total Production Cost</th>
                                    <th className="py-3 px-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {batches.map(b => (
                                    <tr key={b.batch_id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="py-3 px-3 font-mono font-bold text-gray-800">{b.batch_number}</td>
                                        <td className="py-3 px-3 font-bold text-gray-900">{b.product_name}</td>
                                        <td className="py-3 px-3 text-gray-500">{b.production_date}</td>
                                        <td className="py-3 px-3 text-right font-semibold">{b.qty_produced}</td>
                                        <td className="py-3 px-3 text-right font-black font-mono text-emerald-800">
                                            {b.qty_remaining}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono text-gray-600">Ksh {Number(b.cost_per_unit || 0).toFixed(2)}</td>
                                        <td className="py-3 px-3 text-right font-black font-mono text-gray-900">Ksh {Number(b.total_production_cost || 0).toLocaleString()}</td>
                                        <td className="py-3 px-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                b.qty_remaining > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {b.qty_remaining > 0 ? 'In Stock' : 'Depleted'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
