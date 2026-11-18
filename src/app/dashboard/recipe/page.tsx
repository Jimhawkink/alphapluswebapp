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
    const [customSellingPrice, setCustomSellingPrice] = useState<number | ''>('');
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

    // Batches tab pagination & filtering state
    const [batchSearch, setBatchSearch] = useState('');
    const [batchStatusFilter, setBatchStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'depleted'>('all');
    const [batchCurrentPage, setBatchCurrentPage] = useState(1);
    const [batchPageSize, setBatchPageSize] = useState(8);

    // Saved recipes library pagination
    const [libraryCurrentPage, setLibraryCurrentPage] = useState(1);
    const [libraryPageSize, setLibraryPageSize] = useState(8);

    // =========================================================================
    // UNIT CONVERSION ENGINE & UNITS CATALOG
    // Matches Ingredient Stock (ingredient-stock) base tracking units
    // =========================================================================
    const ALL_RECIPE_UNITS = [
        'KG', 'G', 'L', 'ML', 'PCS', 'Piece', 'Packet', 'PKT', 'Bag', 'Bottle',
        'Tin', 'Box', 'Litre', 'Tray', 'EGGS', 'Dozen', 'Bundle', 'Roll', 'Tub',
        'Bucket', 'Crate', 'Sack', 'Carton'
    ];

    const normalizeUnit = (unit: string): string => {
        const u = (unit || '').toUpperCase().trim();
        if (['L', 'LTR', 'LITER', 'LITERS', 'LITRE', 'LITRES'].includes(u)) return 'L';
        if (['ML', 'MLS', 'MILLILITER', 'MILLILITERS'].includes(u)) return 'ML';
        if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS', 'KILO'].includes(u)) return 'KG';
        if (['G', 'GM', 'GMS', 'GRAM', 'GRAMS'].includes(u)) return 'G';
        if (['PCS', 'PC', 'PIECE', 'PIECES', 'EACH', 'EA'].includes(u)) return 'PCS';
        if (['EGG', 'EGGS'].includes(u)) return 'EGGS';
        if (['TRAY', 'TRAYS'].includes(u)) return 'TRAY';
        if (['DOZ', 'DOZEN', 'DOZENS'].includes(u)) return 'DOZEN';
        if (['PKT', 'PACKET', 'PACKETS', 'PACK'].includes(u)) return 'PKT';
        if (['BOX', 'BOXES'].includes(u)) return 'BOX';
        if (['BTL', 'BOTTLE', 'BOTTLES'].includes(u)) return 'BTL';
        if (['TIN', 'TINS'].includes(u)) return 'TIN';
        if (['BAG', 'BAGS'].includes(u)) return 'BAG';
        if (['BUNDLE', 'BUNDLES'].includes(u)) return 'BUNDLE';
        if (['ROLL', 'ROLLS'].includes(u)) return 'ROLL';
        if (['TUB', 'TUBS'].includes(u)) return 'TUB';
        if (['BUCKET', 'BUCKETS'].includes(u)) return 'BUCKET';
        if (['CARTON', 'CARTONS', 'CTN'].includes(u)) return 'CARTON';
        if (['CRATE', 'CRATES'].includes(u)) return 'CRATE';
        if (['SACK', 'SACKS'].includes(u)) return 'SACK';
        return u;
    };

    const convertToBase = (qty: number, fromUnit: string, baseUnit: string): number => {
        const from = normalizeUnit(fromUnit);
        const base = normalizeUnit(baseUnit);
        if (from === base || !from) return qty;

        // Mass: G <-> KG
        if (from === 'G' && base === 'KG') return qty * 0.001;
        if (from === 'KG' && base === 'G') return qty * 1000;

        // Volume: ML <-> L
        if (from === 'ML' && base === 'L') return qty * 0.001;
        if (from === 'L' && base === 'ML') return qty * 1000;

        // Eggs & Tray (1 Tray = 30 Eggs)
        if (from === 'TRAY' && (base === 'EGGS' || base === 'PCS')) return qty * 30;
        if ((from === 'EGGS' || from === 'PCS') && base === 'TRAY') return qty / 30;

        // Count: Dozen <-> PCS / Piece (1 Dozen = 12 Pieces)
        if (from === 'DOZEN' && (base === 'PCS' || base === 'EGGS')) return qty * 12;
        if ((from === 'PCS' || from === 'EGGS') && base === 'DOZEN') return qty / 12;

        return qty;
    };

    const computeLineCost = (qty: number, unit: string, ing: Ingredient): number => {
        const qtyInBase = convertToBase(qty, unit, ing.base_unit);
        const costPerBase = ing.cost_per_base_unit || (ing.price_per_pack / (ing.pack_size || 1)) || 0;
        return qtyInBase * costPerBase;
    };

    // Find currently selected ingredient object
    const selectedIngredient = useMemo(() => {
        return ingredients.find(i => i.pid === Number(selectedIngId));
    }, [ingredients, selectedIngId]);

    // Available units list: puts ingredient's base unit first, then compatible units, then full catalog
    const availableUnits = useMemo(() => {
        if (!selectedIngredient) return ALL_RECIPE_UNITS;
        const base = selectedIngredient.base_unit || 'KG';
        const norm = normalizeUnit(base);

        let related: string[] = [];
        if (norm === 'KG' || norm === 'G') {
            related = ['KG', 'G'];
        } else if (norm === 'L' || norm === 'ML') {
            related = ['L', 'ML', 'Litre'];
        } else if (norm === 'EGGS' || norm === 'TRAY') {
            related = ['EGGS', 'Tray', 'PCS'];
        } else if (norm === 'PCS') {
            related = ['Piece', 'PCS', 'Dozen'];
        } else if (norm === 'DOZEN') {
            related = ['Dozen', 'Piece', 'PCS'];
        } else if (norm === 'PKT') {
            related = ['Packet', 'PKT'];
        } else if (norm === 'BTL') {
            related = ['Bottle', 'BTL'];
        } else if (norm === 'BOX') {
            related = ['Box', 'Carton'];
        }

        const set = new Set<string>();
        // 1. Put exact ingredient base_unit first
        set.add(base);
        // 2. Put related units next
        related.forEach(u => set.add(u));
        // 3. Put all other standard units from ingredients page
        ALL_RECIPE_UNITS.forEach(u => set.add(u));
        return Array.from(set);
    }, [selectedIngredient]);

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

    // =========================================================================
    // FINANCIAL COST & PROFIT ENGINE (Per Dish & Batch Total vs Production Cost)
    // =========================================================================
    // Total raw ingredient production cost to cook this batch
    const totalRecipeCost = useMemo(() => {
        return recipeIngredients.reduce((sum, r) => sum + r.total_cost, 0);
    }, [recipeIngredients]);

    // Raw ingredient cost per individual plate/portion (COGS)
    const portionCost = useMemo(() => {
        return portionsYield > 0 ? (totalRecipeCost / portionsYield) : totalRecipeCost;
    }, [totalRecipeCost, portionsYield]);

    // Effective selling price per dish (allows interactive simulation in Studio)
    const effectiveSellingPrice = useMemo(() => {
        if (customSellingPrice !== '' && !isNaN(Number(customSellingPrice))) {
            return Number(customSellingPrice);
        }
        return selectedDish?.sales_cost || 0;
    }, [customSellingPrice, selectedDish]);
    const dishSellingPrice = effectiveSellingPrice;

    // Profit per individual plate/portion
    const profitPerDish = useMemo(() => {
        return effectiveSellingPrice - portionCost;
    }, [effectiveSellingPrice, portionCost]);
    const grossProfitPortion = profitPerDish;

    // Profit margin percentage per dish
    const profitMarginPercent = useMemo(() => {
        return effectiveSellingPrice > 0 ? ((profitPerDish / effectiveSellingPrice) * 100) : 0;
    }, [profitPerDish, effectiveSellingPrice]);

    // Total Financials if all portions in this batch are sold
    const totalProductionCost = totalRecipeCost; // raw ingredients cost
    const totalSalesRevenue = useMemo(() => {
        return effectiveSellingPrice * portionsYield;
    }, [effectiveSellingPrice, portionsYield]);

    // Total profit if all portions are sold
    const totalProfitIfAllSold = useMemo(() => {
        return totalSalesRevenue - totalProductionCost;
    }, [totalSalesRevenue, totalProductionCost]);

    // Markup / ROI percentage on ingredient spend
    const markupPercent = useMemo(() => {
        return totalProductionCost > 0 ? ((totalProfitIfAllSold / totalProductionCost) * 100) : 0;
    }, [totalProfitIfAllSold, totalProductionCost]);

    // Theoretical Food Cost % (COGS %)
    const foodCostPercentage = useMemo(() => {
        return effectiveSellingPrice > 0 ? ((portionCost / effectiveSellingPrice) * 100) : 0;
    }, [portionCost, effectiveSellingPrice]);

    // Load saved recipe into studio
    const loadRecipeIntoStudio = async (r: SavedRecipe) => {
        const dish = dishes.find(d => d.pid === r.product_id) || null;
        setSelectedDish(dish);
        setCustomSellingPrice(r.selling_price || dish?.sales_cost || 0);
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
            setCustomSellingPrice('');
            setRecipeIngredients([]);
            return;
        }
        setCustomSellingPrice(dish.sales_cost || 0);

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

            // Auto-synchronize live portion COGS to products master table
            try {
                const sPrice = Number(selectedDish.sales_cost) || 0;
                const margin = sPrice > 0 ? Math.round(((sPrice - portionCost) / sPrice) * 10000) / 100 : 0;
                await supabase
                    .from('products')
                    .update({
                        purchase_cost: portionCost,
                        margin_per: margin,
                        updated_at: new Date().toISOString()
                    })
                    .eq('pid', selectedDish.pid);
            } catch (syncErr) {
                console.warn('Sync to products table warning:', syncErr);
            }

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
                    selling_price: effectiveSellingPrice || selectedDish.sales_cost,
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

            // Auto-synchronize live portion COGS to products master table
            try {
                const sPrice = Number(selectedDish.sales_cost) || 0;
                const margin = sPrice > 0 ? Math.round(((sPrice - portionCost) / sPrice) * 10000) / 100 : 0;
                await supabase
                    .from('products')
                    .update({
                        purchase_cost: portionCost,
                        margin_per: margin,
                        updated_at: new Date().toISOString()
                    })
                    .eq('pid', selectedDish.pid);
            } catch (syncErr) {
                console.warn('Sync to products table warning:', syncErr);
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
    <div>Total Production Cost: Ksh ${totalRecipeCost.toLocaleString()}</div>
    <div>Cost / Portion (COGS): Ksh ${portionCost.toFixed(2)}</div>
    <div>Sale Price Per Dish: Ksh ${effectiveSellingPrice.toLocaleString()}</div>
    <div>Profit Per Dish: Ksh ${profitPerDish.toFixed(2)} (${profitMarginPercent.toFixed(1)}%)</div>
    <div>Total Revenue (If All Sold): Ksh ${totalSalesRevenue.toLocaleString()}</div>
    <div>Total Profit (If All Sold): Ksh ${totalProfitIfAllSold.toLocaleString()}</div>
    <div>Theoretical Food Cost: ${foodCostPercentage.toFixed(1)}%</div>
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

    // Library pagination
    const totalLibraryPages = Math.max(1, Math.ceil(filteredRecipes.length / libraryPageSize));
    const paginatedRecipes = useMemo(() => {
        const start = (libraryCurrentPage - 1) * libraryPageSize;
        return filteredRecipes.slice(start, start + libraryPageSize);
    }, [filteredRecipes, libraryCurrentPage, libraryPageSize]);

    // Batches tab filtering & pagination
    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            if (batchSearch) {
                const q = batchSearch.toLowerCase();
                const matchName = (b.product_name || '').toLowerCase().includes(q);
                const matchCode = (b.batch_number || '').toLowerCase().includes(q);
                if (!matchName && !matchCode) return false;
            }

            const rem = Number(b.qty_remaining) || 0;
            if (batchStatusFilter === 'in_stock' && rem <= 0) return false;
            if (batchStatusFilter === 'low_stock' && (rem <= 0 || rem > 10)) return false;
            if (batchStatusFilter === 'depleted' && rem > 0) return false;

            return true;
        });
    }, [batches, batchSearch, batchStatusFilter]);

    const totalBatchPages = Math.max(1, Math.ceil(filteredBatches.length / batchPageSize));
    const paginatedBatches = useMemo(() => {
        const start = (batchCurrentPage - 1) * batchPageSize;
        return filteredBatches.slice(start, start + batchPageSize);
    }, [filteredBatches, batchCurrentPage, batchPageSize]);

    // Reset pagination to page 1 on filter/search changes
    useEffect(() => {
        setBatchCurrentPage(1);
    }, [batchSearch, batchStatusFilter, batchPageSize]);

    useEffect(() => {
        setLibraryCurrentPage(1);
    }, [searchLibrary, libraryPageSize]);

    // Side-by-side Batch Analytics: Depletion, Top Profit Dishes, Freshness
    const batchAnalytics = useMemo(() => {
        let totalProduced = 0;
        let totalRemaining = 0;
        let totalSold = 0;
        let totalCost = 0;
        let totalRevenue = 0;
        let totalProfit = 0;

        // Group by product to find top profit dishes currently in kitchen
        const dishAggMap: Record<number, { name: string; readyPax: number; potentialProfit: number; potentialRevenue: number; cost: number; batchesCount: number; sPrice: number; costUnit: number }> = {};

        batches.forEach(b => {
            const prod = Number(b.qty_produced) || 0;
            const rem = Number(b.qty_remaining) || 0;
            const sold = Math.max(0, prod - rem);
            const costUnit = Number(b.cost_per_unit) || 0;
            const matchedDish = dishes.find(d => d.pid === b.product_id);
            const sPrice = Number(b.selling_price) || Number(matchedDish?.sales_cost) || 0;

            const bCost = prod * costUnit;
            const bRev = prod * sPrice;
            const bProf = bRev - bCost;

            totalProduced += prod;
            totalRemaining += rem;
            totalSold += sold;
            totalCost += bCost;
            totalRevenue += bRev;
            totalProfit += bProf;

            if (rem > 0) {
                const pid = b.product_id;
                if (!dishAggMap[pid]) {
                    dishAggMap[pid] = {
                        name: b.product_name,
                        readyPax: 0,
                        potentialProfit: 0,
                        potentialRevenue: 0,
                        cost: 0,
                        batchesCount: 0,
                        sPrice,
                        costUnit
                    };
                }
                dishAggMap[pid].readyPax += rem;
                dishAggMap[pid].cost += (rem * costUnit);
                dishAggMap[pid].potentialRevenue += (rem * sPrice);
                dishAggMap[pid].potentialProfit += ((rem * sPrice) - (rem * costUnit));
                dishAggMap[pid].batchesCount += 1;
            }
        });

        const topProfitDishes = Object.values(dishAggMap)
            .sort((a, b) => b.potentialProfit - a.potentialProfit)
            .slice(0, 5);

        const depletionRate = totalProduced > 0 ? ((totalSold / totalProduced) * 100) : 0;
        const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

        // Aging: cooked today vs older
        const todayStr = new Date().toISOString().split('T')[0];
        const todayBatchesCount = batches.filter(b => b.production_date === todayStr).length;
        const agingBatchesCount = batches.filter(b => {
            if (!b.production_date) return false;
            const diffDays = Math.floor((new Date().getTime() - new Date(b.production_date).getTime()) / (1000 * 3600 * 24));
            return diffDays >= 3 && (b.qty_remaining || 0) > 0;
        }).length;

        const inStockCount = batches.filter(b => (b.qty_remaining || 0) > 0).length;
        const lowStockCount = batches.filter(b => (b.qty_remaining || 0) > 0 && (b.qty_remaining || 0) <= 10).length;
        const depletedCount = batches.filter(b => (b.qty_remaining || 0) <= 0).length;

        return {
            totalProduced,
            totalRemaining,
            totalSold,
            totalCost,
            totalRevenue,
            totalProfit,
            topProfitDishes,
            depletionRate,
            avgMargin,
            todayBatchesCount,
            agingBatchesCount,
            inStockCount,
            lowStockCount,
            depletedCount
        };
    }, [batches, dishes]);

    // Quick Action: Jump to Studio with a specific dish ready to cook
    const quickCookDishInStudio = (dishName: string) => {
        const matchDish = dishes.find(d => d.product_name.toLowerCase() === dishName.toLowerCase()) || dishes.find(d => dishName.toLowerCase().includes(d.product_name.toLowerCase()));
        if (matchDish) {
            handleSelectDish(matchDish.pid);
            setActiveTab('studio');
            toast.success(`Loaded ${matchDish.product_name} into Studio 🍳`);
        } else {
            setActiveTab('studio');
            toast('Switched to Studio. Select target dish to cook.');
        }
    };

    // Thermal Print of Kitchen Batches Inventory
    const handlePrintBatchesThermalSummary = async () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const activeList = batches.filter(b => (b.qty_remaining || 0) > 0);
        const html = `<!DOCTYPE html><html><head><style>
          body{font-family:Arial,sans-serif;width:80mm;padding:4mm;font-size:11px;margin:0;}
          .center{text-align:center;}
          .bold{font-weight:bold;}
          .table{width:100%;border-collapse:collapse;margin-top:6px;}
          .table th,.table td{padding:3px 1px;border-bottom:1px dashed #666;font-size:10px;}
          .total{border-top:2px dashed #000;padding-top:4px;margin-top:6px;font-weight:bold;}
        </style></head><body>
          <div class="center bold" style="font-size:13px;">${companyName}</div>
          <div class="center bold">KITCHEN BATCHES INVENTORY</div>
          <div class="center" style="font-size:9px;">Date: ${todayStr} • ${new Date().toLocaleTimeString()}</div>
          <div class="center bold" style="margin-top:4px;">ACTIVE PORTIONS: ${batchAnalytics.totalRemaining}</div>
          <table class="table">
            <thead>
              <tr><th align="left">Dish</th><th align="right">Batch</th><th align="right">Rem</th><th align="right">Profit</th></tr>
            </thead>
            <tbody>
              ${activeList.slice(0, 30).map(b => {
                const matchedDish = dishes.find(d => d.pid === b.product_id);
                const sPrice = Number(b.selling_price) || Number(matchedDish?.sales_cost) || 0;
                const costUnit = Number(b.cost_per_unit) || 0;
                const bProfit = (sPrice - costUnit) * b.qty_remaining;
                return `<tr>
                  <td>${b.product_name.slice(0, 15)}</td>
                  <td align="right" style="font-size:8px;">${b.batch_number.slice(-7)}</td>
                  <td align="right"><b>${b.qty_remaining}</b></td>
                  <td align="right">Ksh ${Math.round(bProfit)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div class="total">
            <div>Total Active Batches: ${activeList.length}</div>
            <div>Potential Net Profit: Ksh ${Math.round(batchAnalytics.totalProfit).toLocaleString()}</div>
            <div>Production Cost: Ksh ${Math.round(batchAnalytics.totalCost).toLocaleString()}</div>
          </div>
        </body></html>`;
        await executeDirectPrint(html, { printerRole: 'kitchen' });
        toast.success('Kitchen Batches Inventory slip dispatched! 🧾');
    };

    // Average Food Cost % across all recipes
    const avgFoodCost = useMemo(() => {
        const valid = savedRecipes.filter(r => r.selling_price && r.selling_price > 0 && r.cost_per_unit > 0);
        if (valid.length === 0) return 28.5;
        const sum = valid.reduce((acc, r) => acc + ((r.cost_per_unit / (r.selling_price || 1)) * 100), 0);
        return Math.round((sum / valid.length) * 10) / 10;
    }, [savedRecipes]);

    // Financial aggregates across all active kitchen production batches
    const batchesFinancials = useMemo(() => {
        let totalActiveCost = 0;
        let totalActivePotentialRevenue = 0;
        let totalActivePotentialProfit = 0;
        let activeBatchesCount = 0;

        batches.forEach(b => {
            const rem = Number(b.qty_remaining) || 0;
            if (rem > 0) {
                activeBatchesCount++;
                const costUnit = Number(b.cost_per_unit) || 0;
                const matchedDish = dishes.find(d => d.pid === b.product_id);
                const sPrice = Number(b.selling_price) || Number(matchedDish?.sales_cost) || 0;

                const batchCost = rem * costUnit;
                const batchRev = rem * sPrice;
                const batchProf = batchRev - batchCost;

                totalActiveCost += batchCost;
                totalActivePotentialRevenue += batchRev;
                totalActivePotentialProfit += batchProf;
            }
        });

        return {
            totalActiveCost,
            totalActivePotentialRevenue,
            totalActivePotentialProfit,
            activeBatchesCount
        };
    }, [batches, dishes]);

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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Active Master Recipes</p>
                    <p className="text-3xl font-black text-gray-900 mt-1">{savedRecipes.length}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">Avg Food Cost: {avgFoodCost}%</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Raw Store Ingredients</p>
                    <p className="text-3xl font-black text-indigo-700 mt-1">{ingredients.length}</p>
                    <p className="text-[11px] text-indigo-500 font-semibold mt-1">Monitored store inventory items</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Active Kitchen Batches</p>
                    <p className="text-3xl font-black text-purple-700 mt-1">{batchesFinancials.activeBatchesCount}</p>
                    <p className="text-[11px] text-purple-600 font-semibold mt-1">Ready for POS service</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-900 via-teal-950 to-[#062c1e] text-white p-5 rounded-3xl border border-emerald-500/40 shadow-lg shadow-emerald-950/20">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">Batches Potential Profit</p>
                        <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-300 font-bold border border-emerald-400/30">vs Cost</span>
                    </div>
                    <p className="text-2xl font-black text-[#00e676] font-mono mt-1">
                        +Ksh {batchesFinancials.totalActivePotentialProfit.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-emerald-200/80 font-medium mt-1 flex items-center justify-between">
                        <span>Cost: Ksh {batchesFinancials.totalActiveCost.toLocaleString()}</span>
                        <span className="font-bold text-white">Rev: Ksh {batchesFinancials.totalActivePotentialRevenue.toLocaleString()}</span>
                    </p>
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
                                <div className="p-3.5 bg-gradient-to-br from-emerald-50/90 to-teal-50/70 border border-emerald-200/80 rounded-2xl space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-emerald-950 font-bold flex items-center gap-1">
                                            <span>🏷️</span> Sale Price / Dish:
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-gray-500">Ksh</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={customSellingPrice}
                                                onChange={(e) => setCustomSellingPrice(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                                                className="w-24 px-2.5 py-1 bg-white border border-emerald-300 focus:border-emerald-500 rounded-xl text-xs font-black font-mono text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right shadow-sm"
                                                title="Edit selling price to simulate recipe profit"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-emerald-200/60 text-[11px]">
                                        <div>
                                            <span className="text-gray-500 block">Cost Per Plate:</span>
                                            <span className="font-mono font-bold text-gray-800">Ksh {portionCost.toFixed(2)}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">Profit Per Plate:</span>
                                            <span className={`font-mono font-black ${profitPerDish >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                                {profitPerDish >= 0 ? `+Ksh ${profitPerDish.toFixed(2)}` : `-Ksh ${Math.abs(profitPerDish).toFixed(2)}`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] text-gray-500 pt-1 border-t border-emerald-200/40">
                                        <span>Barcode: <strong className="font-mono text-gray-700">{selectedDish.barcode || 'N/A'}</strong></span>
                                        <span>Ready Stock: <strong className="font-bold text-emerald-800">{selectedDish.current_stock || 0} Pax</strong></span>
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

                        {/* Portion Cost & Profit Performance Matrix */}
                        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                                    <span>📊</span> Cost &amp; Profit Performance
                                </h2>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                                    Live Financials
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                {/* 1. PER DISH BREAKDOWN */}
                                <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50/60 rounded-2xl border border-amber-200/80 flex justify-between items-center">
                                    <div>
                                        <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                                            <span>🏷️</span> Sale Price Per Dish
                                        </span>
                                        <span className="text-[10px] text-amber-800 font-medium">Menu price at POS</span>
                                    </div>
                                    <span className="text-lg font-black font-mono text-amber-950">
                                        Ksh {effectiveSellingPrice.toLocaleString()}
                                    </span>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-2xl border border-gray-200 flex justify-between items-center">
                                    <div>
                                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                            <span>🥣</span> Production Cost / Dish (COGS)
                                        </span>
                                        <span className="text-[10px] text-gray-500">Raw ingredient cost per portion</span>
                                    </div>
                                    <span className="text-base font-black font-mono text-gray-900">
                                        Ksh {portionCost.toFixed(2)}
                                    </span>
                                </div>

                                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50/60 rounded-2xl border border-blue-200/80 flex justify-between items-center">
                                    <div>
                                        <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                                            <span>💰</span> Profit Per Dish
                                        </span>
                                        <span className="text-[10px] text-blue-800 font-semibold">
                                            Margin: {profitMarginPercent.toFixed(1)}% per plate
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-xl font-black font-mono ${profitPerDish >= 0 ? 'text-blue-900' : 'text-red-700'}`}>
                                            {profitPerDish >= 0 ? `+Ksh ${profitPerDish.toFixed(2)}` : `-Ksh ${Math.abs(profitPerDish).toFixed(2)}`}
                                        </span>
                                    </div>
                                </div>

                                {/* 2. TOTAL PROFIT IF ALL SOLD VERSUS PRODUCTION COST SHOWCASE */}
                                <div className="mt-3 p-4 rounded-2xl bg-gradient-to-br from-[#0c161e] via-[#062c1e] to-[#041d14] text-white border-2 border-[#00e676]/60 shadow-xl shadow-emerald-950/20 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
                                        <div>
                                            <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                                                <span>🚀</span> Total Profit If All Sold
                                            </span>
                                            <p className="text-[10px] text-gray-300">Batch Yield: {portionsYield} Portions</p>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40 uppercase tracking-wide">
                                            vs Production Cost
                                        </span>
                                    </div>

                                    {/* Big Total Profit Number */}
                                    <div className="text-center py-1">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Net Batch Profit</p>
                                        <p className="text-3xl sm:text-4xl font-black font-mono text-[#00e676] tracking-tight drop-shadow-[0_0_12px_rgba(0,230,118,0.4)]">
                                            {totalProfitIfAllSold >= 0 ? `+Ksh ${totalProfitIfAllSold.toLocaleString()}` : `-Ksh ${Math.abs(totalProfitIfAllSold).toLocaleString()}`}
                                        </p>
                                        <p className="text-[11px] text-emerald-300 font-semibold mt-0.5">
                                            {markupPercent >= 0 ? `+${markupPercent.toFixed(0)}% ROI on raw ingredients` : 'Loss-making formula'}
                                        </p>
                                    </div>

                                    {/* Side-by-side comparison: Cost vs Revenue vs Profit */}
                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-500/20 text-xs">
                                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                                            <span className="text-[10px] text-gray-400 uppercase font-bold block">Production Cost</span>
                                            <span className="text-sm font-black font-mono text-rose-300">
                                                Ksh {totalProductionCost.toLocaleString()}
                                            </span>
                                            <span className="text-[9px] text-gray-400 block mt-0.5">{portionsYield} portions COGS</span>
                                        </div>

                                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                                            <span className="text-[10px] text-gray-400 uppercase font-bold block">Total Sales Revenue</span>
                                            <span className="text-sm font-black font-mono text-emerald-200">
                                                Ksh {totalSalesRevenue.toLocaleString()}
                                            </span>
                                            <span className="text-[9px] text-gray-400 block mt-0.5">If all {portionsYield} sold</span>
                                        </div>
                                    </div>

                                    {/* Summary Callout Banner */}
                                    <div className="p-2 bg-emerald-950/60 rounded-xl border border-emerald-500/30 text-[10px] text-emerald-200 leading-relaxed">
                                        💡 Spend <strong className="text-white">Ksh {totalProductionCost.toLocaleString()}</strong> on raw ingredients ➔ Generate <strong className="text-white">Ksh {totalSalesRevenue.toLocaleString()}</strong> in POS revenue ➔ Keep <strong className="text-[#00e676] font-bold">+Ksh {totalProfitIfAllSold.toLocaleString()}</strong> in clear profit!
                                    </div>
                                </div>

                                {/* Food Cost Benchmark Badge */}
                                <div className={`p-3.5 rounded-2xl border text-center ${
                                    foodCostPercentage <= 28
                                        ? 'bg-green-50 border-green-200 text-green-900'
                                        : foodCostPercentage <= 35
                                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                                            : 'bg-red-50 border-red-200 text-red-900'
                                }`}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Theoretical Food Cost (COGS %)</p>
                                    <p className="text-2xl font-black mt-0.5">{foodCostPercentage.toFixed(1)}%</p>
                                    <p className="text-[10px] font-semibold mt-0.5">
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
                            <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                                <span className="px-2.5 py-1 rounded-xl bg-gray-100 text-gray-700">
                                    Yield: <strong className="text-emerald-900 font-mono">{portionsYield}</strong> Pax
                                </span>
                                <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-mono">
                                    🏷️ Sale Price: <strong>Ksh {effectiveSellingPrice.toLocaleString()}</strong>
                                </span>
                                <span className="px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-mono">
                                    💰 Profit/Dish: <strong>{profitPerDish >= 0 ? `+Ksh ${profitPerDish.toFixed(2)}` : `-Ksh ${Math.abs(profitPerDish).toFixed(2)}`}</strong>
                                </span>
                                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-mono">
                                    🚀 Batch Profit: <strong>+Ksh {totalProfitIfAllSold.toLocaleString()}</strong> <span className="text-[10px] text-gray-500 font-normal">(vs Ksh {totalProductionCost.toLocaleString()} cost)</span>
                                </span>
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
                                        if (match) {
                                            setInputUnit(match.base_unit || 'KG');
                                        } else {
                                            setInputUnit('');
                                        }
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
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                                >
                                    {!inputUnit && <option value="">Select unit...</option>}
                                    {availableUnits.map(u => (
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
                                    <th className="py-3 px-3 text-right">Sale Price / Dish</th>
                                    <th className="py-3 px-3 text-right">Profit / Dish</th>
                                    <th className="py-3 px-3 text-right">Total Production Cost</th>
                                    <th className="py-3 px-3 text-right">Total Revenue (If Sold)</th>
                                    <th className="py-3 px-3 text-right">Total Profit If Sold</th>
                                    <th className="py-3 px-3 text-center">Food Cost %</th>
                                    <th className="py-3 px-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {paginatedRecipes.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="py-8 text-center text-gray-400 italic">
                                            No recipe specifications match your search.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedRecipes.map((r: SavedRecipe) => {
                                        const sellPrice = r.selling_price || 0;
                                        const cogs = r.cost_per_unit || 0;
                                        const profitPerDish = sellPrice - cogs;
                                        const yieldCount = r.qty_produced || 1;
                                        const totalCost = Number(r.total_cost) || (cogs * yieldCount);
                                        const totalRevenue = sellPrice * yieldCount;
                                        const totalProfit = totalRevenue - totalCost;
                                        const fcPct = sellPrice > 0 ? (cogs / sellPrice) * 100 : 0;
                                        return (
                                            <tr key={r.recipe_id} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-3 px-3 font-mono font-bold text-gray-500">#{r.recipe_id}</td>
                                                <td className="py-3 px-3 font-bold text-gray-900 text-sm">{r.dish_name}</td>
                                                <td className="py-3 px-3 text-gray-600">{r.qty_produced} Portions</td>
                                                <td className="py-3 px-3 text-right font-black font-mono text-emerald-800">
                                                    Ksh {cogs.toFixed(2)}
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono font-bold text-amber-950">
                                                    {sellPrice > 0 ? `Ksh ${sellPrice.toLocaleString()}` : 'Not Set'}
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono font-black text-blue-700">
                                                    {sellPrice > 0 ? (profitPerDish >= 0 ? `+Ksh ${profitPerDish.toFixed(2)}` : `-Ksh ${Math.abs(profitPerDish).toFixed(2)}`) : '—'}
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono text-gray-700 font-bold">
                                                    Ksh {totalCost.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono text-gray-900 font-bold">
                                                    {sellPrice > 0 ? `Ksh ${totalRevenue.toLocaleString()}` : '—'}
                                                </td>
                                                <td className="py-3 px-3 text-right">
                                                    {sellPrice > 0 ? (
                                                        <div>
                                                            <span className={`font-mono font-black text-xs block ${totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                                {totalProfit >= 0 ? `+Ksh ${totalProfit.toLocaleString()}` : `-Ksh ${Math.abs(totalProfit).toLocaleString()}`}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400 font-semibold block">
                                                                vs Ksh {totalCost.toLocaleString()} cost
                                                            </span>
                                                        </div>
                                                    ) : '—'}
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
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer for Recipes Library */}
                    {filteredRecipes.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                            <div>
                                Showing <strong className="text-gray-900">{((libraryCurrentPage - 1) * libraryPageSize) + 1}</strong> to <strong className="text-gray-900">{Math.min(filteredRecipes.length, libraryCurrentPage * libraryPageSize)}</strong> of <strong className="text-gray-900">{filteredRecipes.length}</strong> recipes
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    disabled={libraryCurrentPage <= 1}
                                    onClick={() => setLibraryCurrentPage(prev => Math.max(1, prev - 1))}
                                    className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-40 font-bold transition-all"
                                >
                                    ‹ Prev
                                </button>
                                {Array.from({ length: totalLibraryPages }).map((_, i) => (
                                    <button
                                        key={i + 1}
                                        onClick={() => setLibraryCurrentPage(i + 1)}
                                        className={`w-8 h-8 rounded-xl font-bold transition-all ${
                                            libraryCurrentPage === i + 1
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'border border-gray-200 hover:bg-gray-100 text-gray-700'
                                        }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                                <button
                                    disabled={libraryCurrentPage >= totalLibraryPages}
                                    onClick={() => setLibraryCurrentPage(prev => Math.min(totalLibraryPages, prev + 1))}
                                    className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-40 font-bold transition-all"
                                >
                                    Next ›
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: KITCHEN PRODUCTION BATCHES & SIDE-BY-SIDE ANALYTICS COCKPIT */}
            {activeTab === 'batches' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                    {/* Left 8 Cols: Paginated Batches DataGrid */}
                    <div className="xl:col-span-8 bg-white/80 backdrop-blur-xl p-5 sm:p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                        {/* Header & Controls */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                    <span>🏭</span> Kitchen Batches Ledger
                                </h2>
                                <p className="text-xs text-gray-500">
                                    Cooked dish portions decremented in real-time as POS orders are placed
                                </p>
                            </div>

                            {/* Search and Page Size */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search dish or batch #..."
                                        value={batchSearch}
                                        onChange={(e) => setBatchSearch(e.target.value)}
                                        className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium w-48 sm:w-56 focus:outline-none focus:border-emerald-500"
                                    />
                                    <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
                                    {batchSearch && (
                                        <button
                                            onClick={() => setBatchSearch('')}
                                            className="absolute right-2.5 top-1.5 text-gray-400 hover:text-gray-700 text-xs font-bold"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <select
                                    value={batchPageSize}
                                    onChange={(e) => setBatchPageSize(Number(e.target.value))}
                                    className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 cursor-pointer focus:outline-none focus:border-emerald-500"
                                    title="Rows per page"
                                >
                                    <option value={6}>6 / page</option>
                                    <option value={8}>8 / page</option>
                                    <option value={12}>12 / page</option>
                                    <option value={20}>20 / page</option>
                                    <option value={50}>50 / page</option>
                                </select>
                            </div>
                        </div>

                        {/* Filter Status Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                onClick={() => setBatchStatusFilter('all')}
                                className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                                    batchStatusFilter === 'all'
                                        ? 'bg-gray-900 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                All ({batches.length})
                            </button>
                            <button
                                onClick={() => setBatchStatusFilter('in_stock')}
                                className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                                    batchStatusFilter === 'in_stock'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                                }`}
                            >
                                🟢 In Stock ({batchAnalytics.inStockCount})
                            </button>
                            <button
                                onClick={() => setBatchStatusFilter('low_stock')}
                                className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                                    batchStatusFilter === 'low_stock'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                                }`}
                            >
                                ⚠️ Low Stock &le;10 ({batchAnalytics.lowStockCount})
                            </button>
                            <button
                                onClick={() => setBatchStatusFilter('depleted')}
                                className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                                    batchStatusFilter === 'depleted'
                                        ? 'bg-gray-700 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                ⚪ Depleted ({batchAnalytics.depletedCount})
                            </button>
                        </div>

                        {/* The DataGrid Table */}
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 text-[11px] font-bold uppercase text-gray-500 border-b border-gray-100 sticky top-0">
                                    <tr>
                                        <th className="py-3 px-3">Batch Code</th>
                                        <th className="py-3 px-3">Dish Name</th>
                                        <th className="py-3 px-3">Date</th>
                                        <th className="py-3 px-3 text-right">Produced / Left</th>
                                        <th className="py-3 px-3 text-right">Cost / Dish</th>
                                        <th className="py-3 px-3 text-right">Sale Price</th>
                                        <th className="py-3 px-3 text-right">Profit / Dish</th>
                                        <th className="py-3 px-3 text-right">Total Profit If Sold</th>
                                        <th className="py-3 px-3 text-center">Status</th>
                                        <th className="py-3 px-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium">
                                    {paginatedBatches.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-12 text-center text-gray-400 italic">
                                                No kitchen batches match the selected filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedBatches.map(b => {
                                            const matchedDish = dishes.find(d => d.pid === b.product_id);
                                            const sPrice = Number(b.selling_price) || Number(matchedDish?.sales_cost) || 0;
                                            const costUnit = Number(b.cost_per_unit) || 0;
                                            const profitUnit = sPrice - costUnit;
                                            const batchProdCost = Number(b.total_production_cost) || (costUnit * b.qty_produced);
                                            const totalBatchRev = sPrice * b.qty_produced;
                                            const totalBatchProfit = totalBatchRev - batchProdCost;
                                            const rem = Number(b.qty_remaining) || 0;
                                            const prod = Number(b.qty_produced) || 1;
                                            const pctRem = Math.round((rem / prod) * 100);

                                            return (
                                                <tr key={b.batch_id} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="py-3 px-3 font-mono font-bold text-gray-700">
                                                        <span className="text-[11px] text-gray-400">#</span>
                                                        {b.batch_number}
                                                    </td>
                                                    <td className="py-3 px-3 font-bold text-gray-900">
                                                        {b.product_name}
                                                    </td>
                                                    <td className="py-3 px-3 text-gray-500 whitespace-nowrap">
                                                        {b.production_date}
                                                    </td>
                                                    <td className="py-3 px-3 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-mono text-xs">
                                                                <strong className="text-emerald-800">{rem}</strong>
                                                                <span className="text-gray-400"> / {prod} rem</span>
                                                            </span>
                                                            {/* Mini Progress Bar */}
                                                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                                                                <div
                                                                    className={`h-full ${pctRem > 30 ? 'bg-emerald-500' : pctRem > 0 ? 'bg-amber-500' : 'bg-gray-400'}`}
                                                                    style={{ width: `${Math.min(100, Math.max(0, pctRem))}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono text-gray-600">
                                                        Ksh {costUnit.toFixed(2)}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-950">
                                                        {sPrice > 0 ? `Ksh ${sPrice.toLocaleString()}` : 'Not Set'}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono font-black text-blue-700">
                                                        {sPrice > 0 ? (profitUnit >= 0 ? `+Ksh ${profitUnit.toFixed(2)}` : `-Ksh ${Math.abs(profitUnit).toFixed(2)}`) : '—'}
                                                    </td>
                                                    <td className="py-3 px-3 text-right">
                                                        {sPrice > 0 ? (
                                                            <div>
                                                                <span className={`font-mono font-black text-xs block ${totalBatchProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                                    {totalBatchProfit >= 0 ? `+Ksh ${totalBatchProfit.toLocaleString()}` : `-Ksh ${Math.abs(totalBatchProfit).toLocaleString()}`}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 font-semibold block">
                                                                    vs Ksh {batchProdCost.toLocaleString()} cost
                                                                </span>
                                                            </div>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            rem > 10 ? 'bg-emerald-100 text-emerald-800' : rem > 0 ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-gray-100 text-gray-500'
                                                        }`}>
                                                            {rem > 10 ? 'In Stock' : rem > 0 ? 'Low Stock' : 'Depleted'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <button
                                                            onClick={() => quickCookDishInStudio(b.product_name)}
                                                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-black transition-colors"
                                                            title="Cook another batch of this dish in Studio"
                                                        >
                                                            🍳 Cook
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {filteredBatches.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                                <div>
                                    Showing <strong className="text-gray-900">{((batchCurrentPage - 1) * batchPageSize) + 1}</strong> to <strong className="text-gray-900">{Math.min(filteredBatches.length, batchCurrentPage * batchPageSize)}</strong> of <strong className="text-gray-900">{filteredBatches.length}</strong> batches
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        disabled={batchCurrentPage <= 1}
                                        onClick={() => setBatchCurrentPage(1)}
                                        className="px-2 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-40 font-bold transition-all"
                                        title="First Page"
                                    >
                                        «
                                    </button>
                                    <button
                                        disabled={batchCurrentPage <= 1}
                                        onClick={() => setBatchCurrentPage(prev => Math.max(1, prev - 1))}
                                        className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-40 font-bold transition-all"
                                    >
                                        ‹ Prev
                                    </button>

                                    {/* Numbered Page Buttons */}
                                    {Array.from({ length: totalBatchPages }).map((_, i) => {
                                        const pageNum = i + 1;
                                        if (
                                            pageNum === 1 ||
                                            pageNum === totalBatchPages ||
                                            (pageNum >= batchCurrentPage - 1 && pageNum <= batchCurrentPage + 1)
                                        ) {
                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setBatchCurrentPage(pageNum)}
                                                    className={`w-8 h-8 rounded-xl font-bold transition-all ${
                                                        batchCurrentPage === pageNum
                                                            ? 'bg-emerald-600 text-white shadow-sm'
                                                            : 'border border-gray-200 hover:bg-gray-100 text-gray-700'
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        } else if (
                                            pageNum === batchCurrentPage - 2 ||
                                            pageNum === batchCurrentPage + 2
                                        ) {
                                            return <span key={pageNum} className="px-1 text-gray-400">...</span>;
                                        }
                                        return null;
                                    })}

                                    <button
                                        disabled={batchCurrentPage >= totalBatchPages}
                                        onClick={() => setBatchCurrentPage(prev => Math.min(totalBatchPages, prev + 1))}
                                        className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-40 font-bold transition-all"
                                    >
                                        Next ›
                                    </button>
                                    <button
                                        disabled={batchCurrentPage >= totalBatchPages}
                                        onClick={() => setBatchCurrentPage(totalBatchPages)}
                                        className="px-2 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 disabled:opacity-40 font-bold transition-all"
                                        title="Last Page"
                                    >
                                        »
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right 4 Cols: Side-by-Side Analysis & Operations Cockpit */}
                    <div className="xl:col-span-4 space-y-5">
                        {/* 1. Financial Health & Depletion Velocity Card */}
                        <div className="bg-gradient-to-br from-[#0c161e] via-[#062c1e] to-[#041d14] text-white p-5 rounded-3xl border-2 border-emerald-500/50 shadow-xl shadow-emerald-950/20 space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                        Kitchen Batches Ledger
                                    </span>
                                    <h3 className="text-base font-black text-white flex items-center gap-1.5 mt-0.5">
                                        <span>📊</span> Yield &amp; Profit Matrix
                                    </h3>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40">
                                    Live Kitchen
                                </span>
                            </div>

                            {/* Net Unrealized Profit */}
                            <div className="p-3.5 rounded-2xl bg-black/40 border border-emerald-500/30 text-center">
                                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Unrealized Potential Profit</span>
                                <p className="text-3xl font-black font-mono text-[#00e676] mt-0.5 drop-shadow-[0_0_10px_rgba(0,230,118,0.3)]">
                                    +Ksh {batchAnalytics.totalProfit.toLocaleString()}
                                </p>
                                <span className="text-[11px] text-emerald-300 font-semibold mt-0.5 block">
                                    vs Ksh {batchAnalytics.totalCost.toLocaleString()} ingredient cost
                                </span>
                            </div>

                            {/* Key Stats Row */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">POS Revenue</span>
                                    <span className="text-sm font-black font-mono text-emerald-200">
                                        Ksh {batchAnalytics.totalRevenue.toLocaleString()}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-black/30 border border-white/10">
                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Average Margin</span>
                                    <span className="text-sm font-black font-mono text-[#00e676]">
                                        {batchAnalytics.avgMargin.toFixed(1)}%
                                    </span>
                                </div>
                            </div>

                            {/* Depletion Velocity Progress */}
                            <div className="space-y-1.5 pt-1">
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-gray-300 font-bold">Kitchen Depletion Velocity:</span>
                                    <span className="font-mono font-black text-[#00e676]">{batchAnalytics.depletionRate.toFixed(1)}% Sold</span>
                                </div>
                                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex">
                                    <div
                                        className="h-full bg-[#00e676] transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, batchAnalytics.depletionRate))}%` }}
                                        title="Sold Portions"
                                    />
                                    <div
                                        className="h-full bg-purple-500 transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, 100 - batchAnalytics.depletionRate))}%` }}
                                        title="Remaining Portions"
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>{batchAnalytics.totalSold} sold at POS</span>
                                    <span className="text-white font-bold">{batchAnalytics.totalRemaining} Portions in kitchen</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Top Profit Generators in Stock Card */}
                        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                                        <span>🏆</span> Top Profit Dishes in Stock
                                    </h3>
                                    <p className="text-[11px] text-gray-500">Highest margin contributors currently ready</p>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                                    Top 5
                                </span>
                            </div>

                            <div className="space-y-2">
                                {batchAnalytics.topProfitDishes.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic py-3 text-center">No active batches in stock.</p>
                                ) : (
                                    batchAnalytics.topProfitDishes.map((d, idx) => (
                                        <div
                                            key={d.name}
                                            className="p-2.5 rounded-2xl bg-gray-50 hover:bg-gray-100/80 border border-gray-200/70 transition-all flex items-center justify-between gap-2"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`w-6 h-6 rounded-xl flex items-center justify-center text-xs font-black ${
                                                    idx === 0 ? 'bg-amber-400 text-amber-950 shadow-sm' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-gray-200 text-gray-700'
                                                }`}>
                                                    #{idx + 1}
                                                </span>
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900 leading-tight">{d.name}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                                        <strong className="text-emerald-800">{d.readyPax}</strong> portions in stock
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-2">
                                                <div>
                                                    <span className="font-mono font-black text-xs text-emerald-700 block">
                                                        +Ksh {Math.round(d.potentialProfit).toLocaleString()}
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 font-medium block">
                                                        profit
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => quickCookDishInStudio(d.name)}
                                                    className="p-1 px-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black transition-all"
                                                    title={`Cook more ${d.name}`}
                                                >
                                                    🍳+
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 3. Freshness & Aging Radar Card */}
                        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                                    <span>🕒</span> Freshness &amp; Aging Radar
                                </h3>
                                <span className="text-[10px] font-bold text-gray-500">Kitchen Rotation</span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                                    <span className="text-[10px] font-bold text-emerald-900 uppercase block">Cooked Today</span>
                                    <span className="text-lg font-black font-mono text-emerald-800 block mt-0.5">
                                        {batchAnalytics.todayBatchesCount}
                                    </span>
                                    <span className="text-[9px] text-emerald-600 block">Fresh</span>
                                </div>

                                <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200">
                                    <span className="text-[10px] font-bold text-blue-900 uppercase block">Active Rotation</span>
                                    <span className="text-lg font-black font-mono text-blue-800 block mt-0.5">
                                        {Math.max(0, batchAnalytics.inStockCount - batchAnalytics.agingBatchesCount)}
                                    </span>
                                    <span className="text-[9px] text-blue-600 block">Ready</span>
                                </div>

                                <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200">
                                    <span className="text-[10px] font-bold text-amber-900 uppercase block">Aging &ge;3 Days</span>
                                    <span className="text-lg font-black font-mono text-amber-800 block mt-0.5">
                                        {batchAnalytics.agingBatchesCount}
                                    </span>
                                    <span className="text-[9px] text-amber-600 block">Check</span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Quick Kitchen Actions Card */}
                        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-3">
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                                <span>⚡</span> Quick Kitchen Operations
                            </h3>

                            <div className="space-y-2">
                                <button
                                    onClick={() => setActiveTab('studio')}
                                    className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <span>🍳</span>
                                    <span>Cook New Batch in Studio</span>
                                </button>

                                <button
                                    onClick={handlePrintBatchesThermalSummary}
                                    className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <span>🖨️</span>
                                    <span>Print Batches Inventory Slip</span>
                                </button>

                                <button
                                    onClick={() => loadAllData()}
                                    className="w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-2xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <span>🔄</span>
                                    <span>Refresh Batches Data</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
