'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Product {
    pid: number;
    product_code: string;
    product_name: string;
    alias: string;
    vat_commodity: string;
    description: string;
    barcode: string;
    category: string;
    purchase_unit: string;
    sales_unit: string;
    purchase_cost: number;
    sales_cost: number;
    reorder_point: number;
    margin_per: number;
    show_in_pos: boolean;
    button_ui_color: string;
    photo: string;
    batch_no: string;
    supplier_name: string;
    active: boolean;
    vat?: number;
    created_at?: string;
}

interface Category {
    category_id: number;
    category_name: string;
    icon: string;
    color: string;
}

interface Supplier {
    supplier_id: number;
    supplier_code: string;
    supplier_name: string;
    is_kitchen: boolean;
}

interface Unit {
    unit_id: number;
    unit_name: string;
    abbreviation: string;
}

interface RecipeMaster {
    recipe_id: number;
    product_id: number;
    dish_name: string;
    qty_produced: number;
    total_cost: number;
    cost_per_unit: number;
    status: string;
}

// ─── Color Presets for POS Dish Tiles (Kenyan Hospitality Standard) ───────────

const colorPresets = [
    { name: 'Ocean Blue', gradient: 'from-blue-400 to-blue-600', hex: '#3B82F6' },
    { name: 'Royal Crimson', gradient: 'from-red-500 to-rose-700', hex: '#EF4444' },
    { name: 'Golden Amber', gradient: 'from-amber-400 to-orange-600', hex: '#F59E0B' },
    { name: 'Emerald Kitchen', gradient: 'from-emerald-500 to-teal-700', hex: '#10B981' },
    { name: 'Coral Rose', gradient: 'from-pink-500 to-rose-600', hex: '#EC4899' },
    { name: 'Sunset Orange', gradient: 'from-orange-400 to-orange-600', hex: '#F97316' },
    { name: 'Sapphire Indigo', gradient: 'from-indigo-500 to-purple-700', hex: '#6366F1' },
    { name: 'Teal Lagoon', gradient: 'from-teal-400 to-teal-600', hex: '#14B8A6' },
    { name: 'Cyan Sky', gradient: 'from-cyan-400 to-cyan-600', hex: '#06B6D4' },
    { name: 'Deep Violet', gradient: 'from-purple-500 to-fuchsia-700', hex: '#A855F7' },
    { name: 'Roasted Coffee', gradient: 'from-amber-700 to-stone-900', hex: '#92400E' },
    { name: 'Slate Modern', gradient: 'from-slate-600 to-slate-800', hex: '#475569' },
    { name: 'Hot Ruby', gradient: 'from-rose-600 to-red-800', hex: '#E11D48' },
    { name: 'Yellow Sunshine', gradient: 'from-yellow-400 to-yellow-600', hex: '#EAB308' },
];

const vatOptions = [
    { label: 'Standard VAT (16%)', value: 'Standard', rate: 16 },
    { label: 'Zero Rated (0%)', value: 'Zero Rated', rate: 0 },
    { label: 'Exempt from Tax', value: 'Exempt', rate: 0 },
    { label: 'Tax Inclusive', value: 'Inclusive', rate: 16 },
];

const defaultProduct: Omit<Product, 'pid' | 'product_code'> = {
    product_name: '',
    alias: '',
    vat_commodity: 'Standard',
    vat: 16,
    description: '',
    barcode: '',
    category: '',
    purchase_unit: 'Piece',
    sales_unit: 'Piece',
    purchase_cost: 0,
    sales_cost: 0,
    reorder_point: 5,
    margin_per: 0,
    show_in_pos: true,
    button_ui_color: 'from-blue-400 to-blue-600',
    photo: '',
    batch_no: '',
    supplier_name: '',
    active: true,
};

type ViewMode = 'grid' | 'table';
type CostSource = 'recipe' | 'manual';
type SortField = 'sales_cost' | 'margin' | 'product_name' | 'product_code' | 'stock';
type SortOrder = 'asc' | 'desc';

export default function ProductsPage() {
    // ─── Data State ────────────────────────────────────────────────────────────
    const [products, setProducts] = useState<Product[]>([]);
    const [recipes, setRecipes] = useState<RecipeMaster[]>([]);
    const [batchStockMap, setBatchStockMap] = useState<Record<number, number>>({});
    const [categories, setCategories] = useState<Category[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [companyName, setCompanyName] = useState<string>('');

    // Loading & Operation Flags
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncingRecipeCosts, setIsSyncingRecipeCosts] = useState(false);

    // ─── Cost Engine Mode: Dynamic Recipe COGS vs. Manual Defined Cost ─────────
    const [costSource, setCostSource] = useState<CostSource>('recipe');

    // ─── UI & Filter State ─────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterPosOnly, setFilterPosOnly] = useState(false);
    const [filterRecipeOnly, setFilterRecipeOnly] = useState<'all' | 'has_recipe' | 'no_recipe'>('all');
    const [sortField, setSortField] = useState<SortField>('product_name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    // ─── Modals State ──────────────────────────────────────────────────────────
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState(defaultProduct);
    const [modalTab, setModalTab] = useState<'basic' | 'pricing' | 'pos' | 'inventory'>('basic');

    // Format Currency Helpers
    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── Load Cost Source Preference ───────────────────────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem('product_cost_source') || localStorage.getItem('read_cost_from_recipe');
            if (saved === 'false' || saved === 'manual') {
                setCostSource('manual');
            } else {
                setCostSource('recipe');
            }
        } catch {}
    }, []);

    const toggleCostSource = async (newSource: CostSource) => {
        setCostSource(newSource);
        try {
            localStorage.setItem('product_cost_source', newSource);
            localStorage.setItem('read_cost_from_recipe', newSource === 'recipe' ? 'true' : 'false');
            await supabase.from('organisation_settings').upsert({
                setting_key: 'read_cost_from_recipe',
                setting_value: newSource === 'recipe' ? 'true' : 'false',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });
            toast.success(
                newSource === 'recipe'
                    ? '🧪 Reading live costs from Culinary Recipes (COGS)!'
                    : '🏷️ Reading costs from Defined Product Rates!'
            );
        } catch (err) {
            console.error('Error saving cost source preference:', err);
        }
    };

    // ─── Load Everything from Supabase ─────────────────────────────────────────
    const loadAllData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setIsLoading(true);

        try {
            // 1. Load products
            const { data: prodData, error: pErr } = await supabase
                .from('products')
                .select('*')
                .order('pid', { ascending: false });

            if (pErr) throw pErr;
            setProducts(prodData || []);

            // 2. Load culinary recipes to obtain live portion COGS
            const { data: recData, error: rErr } = await supabase
                .from('recipes')
                .select('recipe_id, product_id, dish_name, qty_produced, total_cost, cost_per_unit, status')
                .order('recipe_id', { ascending: false });

            if (rErr) console.warn('Recipes load warning:', rErr);
            setRecipes(recData || []);

            // 3. Load active kitchen batch stock
            try {
                const { data: batchData } = await supabase
                    .from('production_batches')
                    .select('product_id, qty_remaining')
                    .eq('status', 'In Stock')
                    .gt('qty_remaining', 0);

                const stockMap: Record<number, number> = {};
                (batchData || []).forEach(b => {
                    const pid = Number(b.product_id);
                    if (pid) stockMap[pid] = (stockMap[pid] || 0) + (Number(b.qty_remaining) || 0);
                });
                setBatchStockMap(stockMap);
            } catch (bErr) {
                console.warn('Batch stock load warning:', bErr);
            }

            // 4. Load categories
            const { data: catData } = await supabase
                .from('product_categories')
                .select('*')
                .eq('active', true)
                .order('category_name');
            setCategories(catData || []);

            // 5. Load suppliers
            const { data: supData } = await supabase
                .from('suppliers')
                .select('supplier_id, supplier_code, supplier_name, is_kitchen')
                .eq('active', true)
                .order('supplier_name');
            setSuppliers(supData || []);

            // 6. Load units
            const { data: unitData } = await supabase
                .from('product_units')
                .select('unit_id, unit_name, abbreviation')
                .eq('active', true)
                .order('unit_name');
            if (unitData && unitData.length > 0) {
                setUnits(unitData);
            } else {
                setUnits([
                    { unit_id: 1, unit_name: 'Piece', abbreviation: 'Pc' },
                    { unit_id: 2, unit_name: 'Plate', abbreviation: 'Plt' },
                    { unit_id: 3, unit_name: 'Portion', abbreviation: 'Portion' },
                    { unit_id: 4, unit_name: 'Cup', abbreviation: 'Cup' },
                    { unit_id: 5, unit_name: 'Glass', abbreviation: 'Gls' },
                    { unit_id: 6, unit_name: 'Bottle', abbreviation: 'Btl' },
                    { unit_id: 7, unit_name: 'Kilogram', abbreviation: 'Kg' },
                    { unit_id: 8, unit_name: 'Liter', abbreviation: 'L' },
                    { unit_id: 9, unit_name: 'Pack', abbreviation: 'Pk' },
                ]);
            }

            // 7. Load company / hotel name
            try {
                const { data: orgData } = await supabase
                    .from('organisation_settings')
                    .select('setting_value')
                    .eq('setting_key', 'company_name')
                    .maybeSingle();

                if (orgData?.setting_value) {
                    const cleanName = orgData.setting_value.replace(/\s*Hotel\s*/gi, ' ').trim();
                    setCompanyName(`${cleanName} Kitchen`);
                } else {
                    setCompanyName('Main Kitchen');
                }
            } catch {
                setCompanyName('Main Kitchen');
            }
        } catch (err: any) {
            console.error('Error loading products master:', err);
            toast.error('Failed to load products: ' + (err.message || 'Database error'));
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // ─── Recipe Matching Map ──────────────────────────────────────────────────
    // Maps product_id -> RecipeMaster, with name fallback
    const recipeMap = useMemo(() => {
        const idMap = new Map<number, RecipeMaster>();
        const nameMap = new Map<string, RecipeMaster>();

        recipes.forEach(r => {
            if (r.product_id && !idMap.has(r.product_id)) {
                idMap.set(r.product_id, r);
            }
            if (r.dish_name) {
                const norm = r.dish_name.toLowerCase().trim();
                if (!nameMap.has(norm)) {
                    nameMap.set(norm, r);
                }
            }
        });

        return { idMap, nameMap };
    }, [recipes]);

    // Helper: Compute effective cost, profit, and margin for any product
    const getProductValuation = useCallback((p: Product) => {
        const matched = recipeMap.idMap.get(p.pid) || recipeMap.nameMap.get(p.product_name.toLowerCase().trim()) || null;
        const recipeCost = matched ? (Number(matched.cost_per_unit) || (Number(matched.total_cost) / (Number(matched.qty_produced) || 1)) || 0) : 0;
        
        const manualCost = Number(p.purchase_cost) || 0;
        const salesPrice = Number(p.sales_cost) || 0;

        const effectiveCost = (costSource === 'recipe' && recipeCost > 0) ? recipeCost : manualCost;
        const profit = Math.max(0, salesPrice - effectiveCost);
        const marginPercent = salesPrice > 0 ? ((profit / salesPrice) * 100) : 0;
        const markupPercent = effectiveCost > 0 ? ((profit / effectiveCost) * 100) : 0;

        return {
            hasRecipe: Boolean(matched && recipeCost > 0),
            matchedRecipe: matched,
            recipeCost,
            manualCost,
            effectiveCost,
            salesPrice,
            profit,
            marginPercent,
            markupPercent,
            isUsingRecipeCost: costSource === 'recipe' && recipeCost > 0,
        };
    }, [recipeMap, costSource]);

    // ─── ⚡ Bulk Push / Sync Recipe Costs to Products Database ─────────────────
    const handleSyncRecipeCostsToDatabase = async () => {
        if (recipes.length === 0) {
            toast.error('No recipe specifications found in database to sync.');
            return;
        }

        setIsSyncingRecipeCosts(true);
        let updatedCount = 0;

        try {
            for (const prod of products) {
                const matched = recipeMap.idMap.get(prod.pid) || recipeMap.nameMap.get(prod.product_name.toLowerCase().trim());
                if (matched) {
                    const rCost = Number(matched.cost_per_unit) || (Number(matched.total_cost) / (Number(matched.qty_produced) || 1)) || 0;
                    if (rCost > 0) {
                        const sCost = Number(prod.sales_cost) || 0;
                        const margin = sCost > 0 ? Math.round(((sCost - rCost) / sCost) * 10000) / 100 : 0;

                        const { error } = await supabase
                            .from('products')
                            .update({
                                purchase_cost: rCost,
                                margin_per: margin,
                                updated_at: new Date().toISOString()
                            })
                            .eq('pid', prod.pid);

                        if (!error) updatedCount++;
                    }
                }
            }

            if (updatedCount > 0) {
                toast.success(`Synced ${updatedCount} products with live culinary recipe portion costs! ⚡`);
                await loadAllData(true);
            } else {
                toast('All dishes already have matching recipe rates.', { icon: 'ℹ️' });
            }
        } catch (err: any) {
            console.error('Error syncing recipe costs:', err);
            toast.error('Failed to sync costs: ' + (err.message || 'Error'));
        } finally {
            setIsSyncingRecipeCosts(false);
        }
    };

    // ─── Fast Code & Barcode Generators ───────────────────────────────────────
    const generateBarcode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('products')
                .select('barcode')
                .not('barcode', 'is', null)
                .order('pid', { ascending: false })
                .limit(10);

            if (data && data.length > 0) {
                for (const item of data) {
                    const num = parseInt(item.barcode || '0', 10);
                    if (!isNaN(num) && num >= 100 && num < 999999) {
                        return String(num + 1);
                    }
                }
            }
            return '101';
        } catch {
            return '101';
        }
    };

    const generateProductCode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('products')
                .select('product_code')
                .like('product_code', 'PRD-%')
                .order('pid', { ascending: false })
                .limit(1);

            if (data && data.length > 0 && data[0].product_code) {
                const lastNum = parseInt(data[0].product_code.replace('PRD-', ''), 10) || 0;
                return `PRD-${String(lastNum + 1).padStart(2, '0')}`;
            }
            return 'PRD-01';
        } catch {
            return `PRD-${String(products.length + 1).padStart(2, '0')}`;
        }
    };

    // ─── Add, Edit & Duplicate Handlers ───────────────────────────────────────
    const openAddModal = async () => {
        setEditingProduct(null);
        setModalTab('basic');
        const [newBarcode, newCode] = await Promise.all([generateBarcode(), generateProductCode()]);
        setFormData({
            ...defaultProduct,
            barcode: newBarcode,
            supplier_name: companyName || 'Kitchen',
            category: categories[0]?.category_name || 'Main Courses',
        });
        setShowModal(true);
    };

    const openEditModal = (product: Product) => {
        setEditingProduct(product);
        setModalTab('basic');
        setFormData({
            product_name: product.product_name,
            alias: product.alias || '',
            vat_commodity: product.vat_commodity || 'Standard',
            vat: product.vat !== undefined ? product.vat : 16,
            description: product.description || '',
            barcode: product.barcode || '',
            category: product.category || '',
            purchase_unit: product.purchase_unit || 'Piece',
            sales_unit: product.sales_unit || 'Piece',
            purchase_cost: Number(product.purchase_cost) || 0,
            sales_cost: Number(product.sales_cost) || 0,
            reorder_point: Number(product.reorder_point) || 5,
            margin_per: Number(product.margin_per) || 0,
            show_in_pos: product.show_in_pos !== false,
            button_ui_color: product.button_ui_color || 'from-blue-400 to-blue-600',
            photo: product.photo || '',
            batch_no: product.batch_no || '',
            supplier_name: product.supplier_name || companyName || 'Kitchen',
            active: product.active !== false,
        });
        setShowModal(true);
    };

    const handleDuplicateProduct = async (product: Product) => {
        setEditingProduct(null);
        setModalTab('basic');
        const [newBarcode] = await Promise.all([generateBarcode()]);
        setFormData({
            product_name: `${product.product_name} (Copy)`,
            alias: product.alias ? `${product.alias} Copy` : '',
            vat_commodity: product.vat_commodity || 'Standard',
            vat: product.vat || 16,
            description: product.description || '',
            barcode: newBarcode,
            category: product.category || '',
            purchase_unit: product.purchase_unit || 'Piece',
            sales_unit: product.sales_unit || 'Piece',
            purchase_cost: product.purchase_cost || 0,
            sales_cost: product.sales_cost || 0,
            reorder_point: product.reorder_point || 5,
            margin_per: product.margin_per || 0,
            show_in_pos: product.show_in_pos !== false,
            button_ui_color: product.button_ui_color || 'from-blue-400 to-blue-600',
            photo: product.photo || '',
            batch_no: product.batch_no || '',
            supplier_name: product.supplier_name || companyName || 'Kitchen',
            active: true,
        });
        setShowModal(true);
        toast('Duplicating product draft — customize & save! 📋', { icon: '✨' });
    };

    // 1-Click Fast POS Visibility Toggle
    const handleTogglePos = async (product: Product, e: React.MouseEvent) => {
        e.stopPropagation();
        const nextState = !product.show_in_pos;
        try {
            const { error } = await supabase
                .from('products')
                .update({ show_in_pos: nextState, updated_at: new Date().toISOString() })
                .eq('pid', product.pid);

            if (error) throw error;
            setProducts(prev => prev.map(p => p.pid === product.pid ? { ...p, show_in_pos: nextState } : p));
            toast.success(`${product.product_name} is now ${nextState ? 'VISIBLE in POS 🟢' : 'HIDDEN from POS ⏸️'}`);
        } catch (err: any) {
            toast.error('Failed to update POS visibility: ' + err.message);
        }
    };

    // ─── Save / Submit Product ────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.product_name.trim()) {
            toast.error('Product name is required!');
            return;
        }

        setIsSaving(true);
        try {
            const pCost = Number(formData.purchase_cost) || 0;
            const sCost = Number(formData.sales_cost) || 0;
            const margin = sCost > 0 ? Math.round(((sCost - pCost) / sCost) * 10000) / 100 : 0;
            const vatOpt = vatOptions.find(v => v.value === formData.vat_commodity);
            const vatRate = vatOpt ? vatOpt.rate : 16;

            const payload: any = {
                product_name: formData.product_name.trim(),
                alias: formData.alias?.trim() || null,
                vat_commodity: formData.vat_commodity || 'Standard',
                vat: vatRate,
                description: formData.description?.trim() || null,
                barcode: formData.barcode?.trim() || null,
                category: formData.category || 'General',
                purchase_unit: formData.purchase_unit || 'Piece',
                sales_unit: formData.sales_unit || 'Piece',
                purchase_cost: pCost,
                sales_cost: sCost,
                reorder_point: Number(formData.reorder_point) || 5,
                margin_per: margin,
                show_in_pos: formData.show_in_pos !== false,
                button_ui_color: formData.button_ui_color || 'from-blue-400 to-blue-600',
                photo: formData.photo || null,
                batch_no: formData.batch_no?.trim() || null,
                supplier_name: formData.supplier_name?.trim() || companyName || 'Kitchen',
                active: formData.active !== false,
                updated_at: new Date().toISOString(),
            };

            if (editingProduct) {
                const { error } = await supabase
                    .from('products')
                    .update(payload)
                    .eq('pid', editingProduct.pid);

                if (error) throw error;
                toast.success(`Updated "${formData.product_name}" successfully! ✨`);
            } else {
                const newCode = await generateProductCode();
                payload.product_code = newCode;
                payload.created_at = new Date().toISOString();
                payload.added_date = new Date().toISOString();

                const { error } = await supabase
                    .from('products')
                    .insert(payload);

                if (error) throw error;
                toast.success(`Created product ${newCode} ("${formData.product_name}")! 🍕`);
            }

            setShowModal(false);
            await loadAllData();
        } catch (err: any) {
            console.error('Error saving product:', err);
            toast.error(`Save failed: ${err.message || 'Database error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Delete Product ───────────────────────────────────────────────────────
    const deleteProduct = async (product: Product) => {
        if (!confirm(`Are you sure you want to permanently delete "${product.product_name}" (${product.product_code})?`)) {
            return;
        }
        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('pid', product.pid);

            if (error) throw error;
            toast.success(`"${product.product_name}" removed from menu`);
            loadAllData();
        } catch (err: any) {
            console.error('Error deleting product:', err);
            toast.error('Failed to delete: ' + err.message);
        }
    };

    // ─── Export CSV ───────────────────────────────────────────────────────────
    const exportCSV = () => {
        if (products.length === 0) {
            toast.error('No products to export');
            return;
        }

        const headers = [
            'Product Code',
            'Dish Name',
            'Alias',
            'Category',
            'Barcode',
            'Manual Cost (KES)',
            'Recipe Cost (KES)',
            'Effective Cost (KES)',
            'Sales Price (KES)',
            'Margin %',
            'Profit (KES)',
            'VAT Type',
            'Show in POS',
            'Kitchen Batches Available',
            'Supplier'
        ];

        const rows = sortedProducts.map(p => {
            const val = getProductValuation(p);
            const stock = batchStockMap[p.pid] || 0;
            return [
                `"${p.product_code}"`,
                `"${p.product_name.replace(/"/g, '""')}"`,
                `"${(p.alias || '').replace(/"/g, '""')}"`,
                `"${p.category || ''}"`,
                `"${p.barcode || ''}"`,
                val.manualCost.toFixed(2),
                val.hasRecipe ? val.recipeCost.toFixed(2) : 'N/A',
                val.effectiveCost.toFixed(2),
                val.salesPrice.toFixed(2),
                val.marginPercent.toFixed(1),
                val.profit.toFixed(2),
                `"${p.vat_commodity || 'Standard'}"`,
                p.show_in_pos ? '"YES"' : '"NO"',
                stock,
                `"${(p.supplier_name || '').replace(/"/g, '""')}"`
            ];
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `menu_products_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Menu catalog CSV exported! 📄');
    };

    // ─── Filter & Sort Logic ───────────────────────────────────────────────────
    const categoriesList = useMemo(() => {
        const set = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(set).sort();
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            // Text Search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = p.product_name.toLowerCase().includes(q);
                const matchAlias = (p.alias || '').toLowerCase().includes(q);
                const matchCode = (p.product_code || '').toLowerCase().includes(q);
                const matchBarcode = (p.barcode || '').includes(q);
                const matchCategory = (p.category || '').toLowerCase().includes(q);
                if (!matchName && !matchAlias && !matchCode && !matchBarcode && !matchCategory) return false;
            }

            // Category Filter
            if (filterCategory !== 'All' && p.category !== filterCategory) return false;

            // POS Only Filter
            if (filterPosOnly && !p.show_in_pos) return false;

            // Recipe Filter
            if (filterRecipeOnly !== 'all') {
                const val = getProductValuation(p);
                if (filterRecipeOnly === 'has_recipe' && !val.hasRecipe) return false;
                if (filterRecipeOnly === 'no_recipe' && val.hasRecipe) return false;
            }

            return true;
        });
    }, [products, searchQuery, filterCategory, filterPosOnly, filterRecipeOnly, getProductValuation]);

    const sortedProducts = useMemo(() => {
        return [...filteredProducts].sort((a, b) => {
            let valA: any = 0;
            let valB: any = 0;

            if (sortField === 'sales_cost') {
                valA = Number(a.sales_cost) || 0;
                valB = Number(b.sales_cost) || 0;
            } else if (sortField === 'margin') {
                valA = getProductValuation(a).marginPercent;
                valB = getProductValuation(b).marginPercent;
            } else if (sortField === 'product_name') {
                valA = a.product_name.toLowerCase();
                valB = b.product_name.toLowerCase();
            } else if (sortField === 'product_code') {
                valA = a.product_code.toLowerCase();
                valB = b.product_code.toLowerCase();
            } else if (sortField === 'stock') {
                valA = batchStockMap[a.pid] || 0;
                valB = batchStockMap[b.pid] || 0;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredProducts, sortField, sortOrder, getProductValuation, batchStockMap]);

    // ─── Executive KPI Totals ─────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const totalItems = products.length;
        const activeInPos = products.filter(p => p.show_in_pos && p.active).length;
        const withRecipes = products.filter(p => getProductValuation(p).hasRecipe).length;

        let totalMenuValuation = 0;
        let totalMarginSum = 0;
        let highMarginCount = 0;

        products.forEach(p => {
            const val = getProductValuation(p);
            const stock = batchStockMap[p.pid] || (Number(p.reorder_point) || 5);
            totalMenuValuation += stock * val.salesPrice;
            totalMarginSum += val.marginPercent;
            if (val.marginPercent >= 50) highMarginCount++;
        });

        const avgMargin = totalItems > 0 ? (totalMarginSum / totalItems) : 0;

        return {
            totalItems,
            activeInPos,
            withRecipes,
            totalMenuValuation,
            avgMargin,
            highMarginCount,
        };
    }, [products, getProductValuation, batchStockMap]);

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
            {/* ── 1. ULTRA EXECUTIVE HEADER ─────────────────────────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl flex items-center justify-center text-white text-3xl shadow-md shadow-indigo-100 flex-shrink-0">
                        🍕
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                                Products &amp; Restaurant Menu Master
                            </h1>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                Kenyan Hospitality POS Master
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Full culinary dish catalog, POS terminal routing, 16% VAT classifications, recipe COGS &amp; profitability analytics.
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Refresh */}
                    <button
                        onClick={() => loadAllData(true)}
                        disabled={refreshing || isLoading}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        title="Reload menu data from database"
                    >
                        <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                        <span>{refreshing ? 'Syncing...' : 'Sync'}</span>
                    </button>

                    {/* Export CSV */}
                    <button
                        onClick={exportCSV}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5"
                        title="Download CSV spreadsheet"
                    >
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>

                    {/* Link to Culinary Recipe Studio */}
                    <Link
                        href="/dashboard/recipe"
                        className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-xl text-xs font-black border border-purple-200 transition-all flex items-center gap-1.5"
                    >
                        <span>🧪</span>
                        <span>Recipe Studio →</span>
                    </Link>

                    {/* Add Product Button */}
                    <button
                        onClick={openAddModal}
                        className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 hover:from-blue-700 hover:to-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-blue-200 hover:-translate-y-0.5"
                    >
                        <span>➕</span>
                        <span>New Product / Dish</span>
                    </button>
                </div>
            </div>

            {/* ── 2. DYNAMIC CULINARY COST ENGINE TOGGLE BANNER ─────────────────── */}
            <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 rounded-3xl p-5 border border-indigo-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-start sm:items-center gap-3.5">
                    <span className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-indigo-200 flex items-center justify-center text-2xl flex-shrink-0">
                        {costSource === 'recipe' ? '🧪' : '🏷️'}
                    </span>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-indigo-900">
                                Active COGS Pricing Engine:
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                                costSource === 'recipe'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-indigo-600 text-white'
                            }`}>
                                {costSource === 'recipe' ? '🧪 Dynamic Recipe Formula COGS' : '🏷️ Defined Product Rates'}
                            </span>
                        </div>
                        <p className="text-xs text-indigo-950/80 mt-1">
                            {costSource === 'recipe'
                                ? `Reading real-time raw ingredient portion costs from kitchen formulas in Recipe Studio (${kpis.withRecipes} dishes linked). Unlinked dishes fall back to defined rates.`
                                : `Reading fixed manual purchase costs entered on each product's specification card.`}
                        </p>
                    </div>
                </div>

                {/* Right controls: Switch Toggle & Bulk Sync Button */}
                <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
                    {/* Toggle Pills */}
                    <div className="flex p-1 bg-white rounded-2xl border border-indigo-200 shadow-2xs">
                        <button
                            type="button"
                            onClick={() => toggleCostSource('recipe')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                costSource === 'recipe'
                                    ? 'bg-purple-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <span>🧪</span>
                            <span>Recipe COGS</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleCostSource('manual')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                costSource === 'manual'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <span>🏷️</span>
                            <span>Defined Rate</span>
                        </button>
                    </div>

                    {/* Bulk Push / Sync Button */}
                    <button
                        type="button"
                        onClick={handleSyncRecipeCostsToDatabase}
                        disabled={isSyncingRecipeCosts}
                        className="px-4 py-2.5 bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                        title="Update all products' database purchase costs with latest recipe portions"
                    >
                        <span>{isSyncingRecipeCosts ? '⏳' : '⚡'}</span>
                        <span>{isSyncingRecipeCosts ? 'Syncing...' : 'Push Recipe Rates to DB'}</span>
                    </button>
                </div>
            </div>

            {/* ── 3. EXECUTIVE KPI CARDS ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* 1. Total Menu Items */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-gray-500 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-blue-700">📦 Total Menu</span>
                        <span className="text-base">🍕</span>
                    </div>
                    <p className="text-xl font-black text-gray-900 tracking-tight">
                        {kpis.totalItems} <span className="text-xs text-gray-400 font-semibold">dishes</span>
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">Across {categoriesList.length} categories</p>
                </div>

                {/* 2. Active in POS */}
                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-emerald-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🟢 Live in POS</span>
                        <span className="text-base">📱</span>
                    </div>
                    <p className="text-xl font-black text-emerald-700 tracking-tight">
                        {kpis.activeInPos} <span className="text-xs text-emerald-600 font-semibold">active</span>
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium mt-1">Visible on waiter floor</p>
                </div>

                {/* 3. Recipes Linked */}
                <div className="bg-white rounded-2xl p-4 border border-purple-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-purple-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🧪 Recipe Linked</span>
                        <span className="text-base">📖</span>
                    </div>
                    <p className="text-xl font-black text-purple-700 tracking-tight">
                        {kpis.withRecipes} <span className="text-xs text-purple-500 font-semibold">dishes</span>
                    </p>
                    <p className="text-[10px] text-purple-600 font-medium mt-1">Dynamic culinary COGS</p>
                </div>

                {/* 4. Average Margin % */}
                <div className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-indigo-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">📈 Average Margin</span>
                        <span className="text-base">💹</span>
                    </div>
                    <p className="text-xl font-black text-indigo-900 tracking-tight">
                        {kpis.avgMargin.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-indigo-600 font-medium mt-1">Calculated via {costSource === 'recipe' ? 'recipe' : 'manual'} cost</p>
                </div>

                {/* 5. High-Margin Stars */}
                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-amber-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">⭐ High Margin</span>
                        <span className="text-base">✨</span>
                    </div>
                    <p className="text-xl font-black text-amber-700 tracking-tight">
                        {kpis.highMarginCount} <span className="text-xs text-amber-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-amber-600 font-medium mt-1">Gross margin &ge; 50%</p>
                </div>

                {/* 6. Total Menu Asset Value */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-gray-500 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">💎 Catalog Value</span>
                        <span className="text-base">💰</span>
                    </div>
                    <p className="text-xl font-black text-gray-900 tracking-tight">
                        {fmt(kpis.totalMenuValuation)}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">At menu selling price</p>
                </div>
            </div>

            {/* ── 4. MULTI-FILTER, SEARCH & VIEW MODE TOOLBAR ──────────────────── */}
            <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3">
                    {/* Search Field (5 cols) */}
                    <div className="md:col-span-5 relative">
                        <span className="absolute left-3.5 top-3 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search dish name, alias, code (PRD-01), barcode (101)..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-3 text-xs text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Category Filter (3 cols) */}
                    <div className="md:col-span-3">
                        <select
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                        >
                            <option value="All">All Categories ({products.length} dishes)</option>
                            {categoriesList.map(c => {
                                const count = products.filter(p => p.category === c).length;
                                return (
                                    <option key={c} value={c}>
                                        {c} ({count})
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/* Sort Selector (2 cols) */}
                    <div className="md:col-span-2">
                        <select
                            value={`${sortField}_${sortOrder}`}
                            onChange={e => {
                                const [f, o] = e.target.value.split('_') as [SortField, SortOrder];
                                setSortField(f);
                                setSortOrder(o);
                            }}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                        >
                            <option value="product_name_asc">Name (A → Z)</option>
                            <option value="sales_cost_desc">Price (High → Low)</option>
                            <option value="sales_cost_asc">Price (Low → High)</option>
                            <option value="margin_desc">Margin % (Highest First)</option>
                            <option value="stock_desc">Kitchen Stock (Highest First)</option>
                            <option value="product_code_asc">Code (PRD-01 First)</option>
                        </select>
                    </div>

                    {/* View Mode Toggle: Grid Cards vs Table (2 cols) */}
                    <div className="md:col-span-2 flex items-center justify-end">
                        <div className="flex p-1 bg-gray-100 rounded-xl border border-gray-200">
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                                    viewMode === 'table'
                                        ? 'bg-white text-gray-900 shadow-xs'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                                title="Tabular View"
                            >
                                <span>📋</span>
                                <span>Table</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                                    viewMode === 'grid'
                                        ? 'bg-white text-gray-900 shadow-xs'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                                title="Restaurant Tile Cards View"
                            >
                                <span>🗂️</span>
                                <span>Tiles</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filter Pills Row */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* All */}
                        <button
                            onClick={() => {
                                setFilterCategory('All');
                                setFilterPosOnly(false);
                                setFilterRecipeOnly('all');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                filterCategory === 'All' && !filterPosOnly && filterRecipeOnly === 'all'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }`}
                        >
                            All ({products.length})
                        </button>

                        {/* POS Only */}
                        <button
                            onClick={() => setFilterPosOnly(!filterPosOnly)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                filterPosOnly
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                        >
                            <span>📱</span>
                            <span>POS Floor Only ({kpis.activeInPos})</span>
                        </button>

                        {/* Has Recipe */}
                        <button
                            onClick={() => setFilterRecipeOnly(filterRecipeOnly === 'has_recipe' ? 'all' : 'has_recipe')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                filterRecipeOnly === 'has_recipe'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200'
                            }`}
                        >
                            <span>🧪</span>
                            <span>With Recipe ({kpis.withRecipes})</span>
                        </button>

                        {/* Missing Recipe */}
                        <button
                            onClick={() => setFilterRecipeOnly(filterRecipeOnly === 'no_recipe' ? 'all' : 'no_recipe')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                filterRecipeOnly === 'no_recipe'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                        >
                            <span>🏷️</span>
                            <span>Defined Only ({products.length - kpis.withRecipes})</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-500">
                            Showing <strong className="text-gray-900 font-black">{sortedProducts.length}</strong> of {products.length} products
                        </span>
                        {(searchQuery || filterCategory !== 'All' || filterPosOnly || filterRecipeOnly !== 'all') && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterCategory('All');
                                    setFilterPosOnly(false);
                                    setFilterRecipeOnly('all');
                                }}
                                className="text-xs font-black text-blue-600 hover:text-blue-800 underline"
                            >
                                Reset All Filters
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 5. MAIN CONTENT: TABLE VIEW OR VISUAL TILES VIEW ─────────────── */}
            {isLoading ? (
                <div className="bg-white rounded-3xl p-24 text-center border border-gray-200/80 shadow-sm">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-700">Loading restaurant menu master...</p>
                    <p className="text-xs text-gray-400 mt-1">Synchronizing prices, recipe formulas and POS screen routing</p>
                </div>
            ) : sortedProducts.length === 0 ? (
                <div className="bg-white rounded-3xl p-24 text-center border border-gray-200/80 shadow-sm px-4">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-sm">
                        🍕
                    </div>
                    <h3 className="text-lg font-black text-gray-800">No Products Matched</h3>
                    <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                        Try adjusting your search criteria, category filters, or add a new dish item to your restaurant catalog.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setFilterCategory('All');
                                setFilterPosOnly(false);
                                setFilterRecipeOnly('all');
                            }}
                            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-black transition-all"
                        >
                            Clear Filters
                        </button>
                        <button
                            onClick={openAddModal}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-100"
                        >
                            ➕ Add New Product
                        </button>
                    </div>
                </div>
            ) : viewMode === 'table' ? (
                /* ── TABLE VIEW ── */
                <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/90 border-b border-gray-200 text-[11px] font-black uppercase tracking-wider text-slate-600 select-none">
                                    <th className="py-4 px-4 text-left">Code &amp; Dish Item</th>
                                    <th className="py-4 px-3 text-left">Category</th>
                                    <th className="py-4 px-3 text-right">Selling Price</th>
                                    <th className="py-4 px-3 text-right">Cost (COGS)</th>
                                    <th className="py-4 px-3 text-center">Profit Margin</th>
                                    <th className="py-4 px-3 text-center">Kitchen Stock</th>
                                    <th className="py-4 px-3 text-center">POS Floor</th>
                                    <th className="py-4 px-3 text-center">Tax / VAT</th>
                                    <th className="py-4 px-4 text-center">Fast Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs">
                                {sortedProducts.map((p, idx) => {
                                    const val = getProductValuation(p);
                                    const kitchenStock = batchStockMap[p.pid] || 0;

                                    return (
                                        <tr
                                            key={p.pid}
                                            className={`transition-colors hover:bg-blue-50/20 ${
                                                idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                            }`}
                                        >
                                            {/* Column 1: Code, Tile & Name */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-3">
                                                    {/* Real POS Tile Preview Box */}
                                                    <div
                                                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.button_ui_color || 'from-blue-400 to-blue-600'} flex items-center justify-center text-white font-black text-sm shadow-xs flex-shrink-0 cursor-pointer`}
                                                        onClick={() => openEditModal(p)}
                                                        title="Click to edit"
                                                    >
                                                        {p.product_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                onClick={() => openEditModal(p)}
                                                                className="font-black text-gray-900 text-sm hover:text-blue-600 transition-colors cursor-pointer"
                                                            >
                                                                {p.product_name}
                                                            </span>
                                                            {!p.active && (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-gray-100 text-gray-500 uppercase">
                                                                    Inactive
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                {p.product_code}
                                                            </span>
                                                            {p.barcode && (
                                                                <span className="font-mono text-[10px] text-gray-400">
                                                                    #{p.barcode}
                                                                </span>
                                                            )}
                                                            {p.alias && (
                                                                <span className="text-[11px] text-gray-500 truncate max-w-[140px]">
                                                                    ({p.alias})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 2: Category */}
                                            <td className="py-3.5 px-3">
                                                <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
                                                    {p.category || 'General'}
                                                </span>
                                            </td>

                                            {/* Column 3: Selling Price */}
                                            <td className="py-3.5 px-3 text-right whitespace-nowrap font-mono">
                                                <p className="font-black text-gray-900 text-sm">
                                                    {fmt(val.salesPrice)}
                                                </p>
                                                <p className="text-[10px] text-gray-400 font-medium">
                                                    per {p.sales_unit || 'Piece'}
                                                </p>
                                            </td>

                                            {/* Column 4: Cost (COGS) with Recipe Source Badge */}
                                            <td className="py-3.5 px-3 text-right whitespace-nowrap font-mono">
                                                <p className="font-bold text-gray-800 text-xs">
                                                    {fmtDec(val.effectiveCost)}
                                                </p>
                                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                                    {val.isUsingRecipeCost ? (
                                                        <Link
                                                            href="/dashboard/recipe"
                                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                                                            title="Live portion cost from culinary recipe formula"
                                                        >
                                                            <span>🧪</span>
                                                            <span>Recipe COGS</span>
                                                        </Link>
                                                    ) : (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-gray-100 text-gray-600 border border-gray-200"
                                                            title="Manually defined cost"
                                                        >
                                                            <span>🏷️</span>
                                                            <span>Defined</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Column 5: Profit Margin % */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                <span className={`inline-block px-2.5 py-1 rounded-xl text-xs font-black shadow-2xs ${
                                                    val.marginPercent >= 50
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : val.marginPercent >= 25
                                                        ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                                        : 'bg-red-50 text-red-800 border border-red-200'
                                                }`}>
                                                    {val.marginPercent.toFixed(1)}%
                                                </span>
                                                <p className="text-[10px] text-emerald-700 font-bold font-mono mt-0.5">
                                                    +{fmt(val.profit)} profit
                                                </p>
                                            </td>

                                            {/* Column 6: Live Kitchen Batch Stock */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                {kitchenStock > 0 ? (
                                                    <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        {kitchenStock} {p.sales_unit || 'Portions'}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-gray-400 font-medium">
                                                        On-Demand
                                                    </span>
                                                )}
                                            </td>

                                            {/* Column 7: POS Floor Visibility Switch */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                <button
                                                    onClick={(e) => handleTogglePos(p, e)}
                                                    className={`px-3 py-1 rounded-full text-[11px] font-black transition-all flex items-center gap-1.5 mx-auto ${
                                                        p.show_in_pos
                                                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                                                    }`}
                                                    title="Click to toggle POS terminal floor visibility"
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${p.show_in_pos ? 'bg-emerald-600 animate-pulse' : 'bg-gray-400'}`} />
                                                    <span>{p.show_in_pos ? 'Floor Active' : 'Hidden'}</span>
                                                </button>
                                            </td>

                                            {/* Column 8: Tax / VAT */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                                    {p.vat_commodity || '16% VAT'}
                                                </span>
                                            </td>

                                            {/* Column 9: Fast Actions */}
                                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* Edit */}
                                                    <button
                                                        onClick={() => openEditModal(p)}
                                                        className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs transition-colors"
                                                        title="Edit Product"
                                                    >
                                                        ✏️
                                                    </button>

                                                    {/* Open Recipe */}
                                                    <Link
                                                        href={`/dashboard/recipe`}
                                                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                                                            val.hasRecipe
                                                                ? 'bg-purple-50 hover:bg-purple-100 text-purple-700'
                                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-400'
                                                        }`}
                                                        title={val.hasRecipe ? 'Open Recipe Studio' : 'Create Recipe for this dish'}
                                                    >
                                                        🧪
                                                    </Link>

                                                    {/* Clone / Duplicate */}
                                                    <button
                                                        onClick={() => handleDuplicateProduct(p)}
                                                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs transition-colors"
                                                        title="Duplicate / Clone Dish"
                                                    >
                                                        📋
                                                    </button>

                                                    {/* Delete */}
                                                    <button
                                                        onClick={() => deleteProduct(p)}
                                                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs transition-colors"
                                                        title="Delete Dish"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* ── VISUAL TILE CARDS VIEW (RESTAURANT MENU FLOOR PREVIEW) ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {sortedProducts.map((p) => {
                        const val = getProductValuation(p);
                        const kitchenStock = batchStockMap[p.pid] || 0;

                        return (
                            <div
                                key={p.pid}
                                className="bg-white rounded-3xl border border-gray-200/80 shadow-xs hover:shadow-md transition-all p-4 flex flex-col justify-between group hover:-translate-y-1"
                            >
                                <div>
                                    {/* Card Header Tile Bar */}
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <span className="font-mono text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                            {p.product_code}
                                        </span>
                                        <button
                                            onClick={(e) => handleTogglePos(p, e)}
                                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                                                p.show_in_pos
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : 'bg-gray-100 text-gray-400'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${p.show_in_pos ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                            <span>{p.show_in_pos ? 'POS On' : 'Hidden'}</span>
                                        </button>
                                    </div>

                                    {/* POS Button Tile Preview Card */}
                                    <div
                                        className={`w-full h-24 rounded-2xl bg-gradient-to-br ${p.button_ui_color || 'from-blue-400 to-blue-600'} p-3 text-white flex flex-col justify-between shadow-xs mb-3 cursor-pointer`}
                                        onClick={() => openEditModal(p)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                                                {p.category || 'Kitchen'}
                                            </span>
                                            {p.barcode && (
                                                <span className="text-[10px] font-mono opacity-80">
                                                    #{p.barcode}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-black text-sm tracking-tight line-clamp-1">
                                                {p.product_name}
                                            </p>
                                            <p className="text-xs font-mono font-bold mt-0.5">
                                                {fmt(val.salesPrice)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Valuation Breakdown */}
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between text-gray-500">
                                            <span>Cost (COGS):</span>
                                            <span className="font-bold text-gray-800 font-mono">
                                                {fmtDec(val.effectiveCost)}
                                                {val.isUsingRecipeCost && <span className="ml-1 text-[10px] text-purple-600">🧪</span>}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-gray-500">
                                            <span>Gross Profit:</span>
                                            <span className="font-black text-emerald-700 font-mono">
                                                +{fmt(val.profit)} ({val.marginPercent.toFixed(0)}%)
                                            </span>
                                        </div>
                                        {kitchenStock > 0 && (
                                            <div className="flex items-center justify-between text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-lg">
                                                <span>Kitchen Stock:</span>
                                                <span>{kitchenStock} portions</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Footer Action Buttons */}
                                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                    <Link
                                        href="/dashboard/recipe"
                                        className={`text-[11px] font-bold flex items-center gap-1 ${
                                            val.hasRecipe ? 'text-purple-700 hover:text-purple-900' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        <span>🧪</span>
                                        <span>{val.hasRecipe ? 'Recipe Spec' : 'Add Recipe'}</span>
                                    </Link>

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleDuplicateProduct(p)}
                                            className="p-1.5 hover:bg-gray-100 rounded-lg text-xs"
                                            title="Duplicate"
                                        >
                                            📋
                                        </button>
                                        <button
                                            onClick={() => openEditModal(p)}
                                            className="p-1.5 hover:bg-blue-50 text-blue-700 rounded-lg text-xs"
                                            title="Edit"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => deleteProduct(p)}
                                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg text-xs"
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── 6. ULTRA ADD / EDIT PRODUCT MODAL ────────────────────────────── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 px-6 py-5 text-white flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-black flex items-center gap-2">
                                    <span>{editingProduct ? '✏️' : '🍕'}</span>
                                    <span>{editingProduct ? `Edit Dish: ${editingProduct.product_name}` : 'Register New Dish / Product'}</span>
                                </h2>
                                <p className="text-xs text-blue-100 mt-0.5">
                                    Configure restaurant menu pricing, culinary recipe cost routing &amp; POS tile presentation.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex border-b border-gray-200 bg-gray-50/70 px-6 pt-3 gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setModalTab('basic')}
                                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all border-b-2 ${
                                    modalTab === 'basic'
                                        ? 'bg-white text-blue-700 border-blue-600 shadow-xs'
                                        : 'text-gray-500 border-transparent hover:text-gray-800'
                                }`}
                            >
                                📋 1. Identification &amp; POS Tile
                            </button>
                            <button
                                type="button"
                                onClick={() => setModalTab('pricing')}
                                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all border-b-2 ${
                                    modalTab === 'pricing'
                                        ? 'bg-white text-blue-700 border-blue-600 shadow-xs'
                                        : 'text-gray-500 border-transparent hover:text-gray-800'
                                }`}
                            >
                                💰 2. Pricing, Recipe COGS &amp; Tax
                            </button>
                            <button
                                type="button"
                                onClick={() => setModalTab('inventory')}
                                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all border-b-2 ${
                                    modalTab === 'inventory'
                                        ? 'bg-white text-blue-700 border-blue-600 shadow-xs'
                                        : 'text-gray-500 border-transparent hover:text-gray-800'
                                }`}
                            >
                                📏 3. Units &amp; Kitchen Routing
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-6 overflow-y-auto space-y-5 flex-1">
                                {/* TAB 1: Basic & POS Tile */}
                                {modalTab === 'basic' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Dish Name */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Dish / Product Name <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.product_name}
                                                    onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                                                    placeholder="e.g. Swahili Beef Biryani, Grilled Whole Tilapia, Passion Juice..."
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-blue-500 outline-none"
                                                    required
                                                />
                                            </div>

                                            {/* Alias / POS Short Name */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Alias / Kitchen Ticket Short Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.alias}
                                                    onChange={e => setFormData({ ...formData, alias: e.target.value })}
                                                    placeholder="e.g. Beef Biryani, Tilapia Fry"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            {/* Category */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Menu Category <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={formData.category}
                                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="">Select Category</option>
                                                    {categories.map(c => (
                                                        <option key={c.category_id} value={c.category_name}>
                                                            {c.icon} {c.category_name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Barcode */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Barcode / Quick POS Number
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.barcode}
                                                    onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                                    placeholder="e.g. 101"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            {/* Batch / Kitchen Lot */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Batch / Lot Reference
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.batch_no}
                                                    onChange={e => setFormData({ ...formData, batch_no: e.target.value })}
                                                    placeholder="e.g. BATCH-01"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            {/* POS Button Color Palette */}
                                            <div className="md:col-span-2 pt-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                                    🎨 POS Dish Button Tile Color
                                                </label>
                                                <div className="grid grid-cols-7 gap-2">
                                                    {colorPresets.map((preset) => (
                                                        <button
                                                            key={preset.name}
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, button_ui_color: preset.gradient })}
                                                            className={`h-9 rounded-xl bg-gradient-to-br ${preset.gradient} transition-all hover:scale-105 ${
                                                                formData.button_ui_color === preset.gradient
                                                                    ? 'ring-2 ring-offset-2 ring-blue-600 scale-105 shadow-md'
                                                                    : 'opacity-85'
                                                            }`}
                                                            title={preset.name}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Live Tile Preview */}
                                                <div className="mt-3 p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                                                    <span className="text-xs font-bold text-gray-600">POS Floor Button Preview:</span>
                                                    <div className={`px-4 py-2.5 rounded-xl bg-gradient-to-br ${formData.button_ui_color} text-white font-bold text-xs shadow-xs flex items-center gap-2`}>
                                                        <span>{formData.product_name || 'Dish Name'}</span>
                                                        <span className="font-mono opacity-80">{fmt(formData.sales_cost)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* POS Visibility Switch */}
                                            <div className="md:col-span-2 pt-1 flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                                                <div>
                                                    <p className="text-xs font-bold text-blue-900">Show on POS Floor Screen</p>
                                                    <p className="text-[11px] text-blue-700">Allow waiters &amp; cashiers to ring up this dish</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.show_in_pos}
                                                    onChange={e => setFormData({ ...formData, show_in_pos: e.target.checked })}
                                                    className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: Pricing, Recipe COGS & Tax */}
                                {modalTab === 'pricing' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Sales Price (Menu Price) */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Menu Sales Price (KES) <span className="text-red-500">*</span>
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3.5 top-2.5 text-xs text-gray-400 font-bold">KES</span>
                                                    <input
                                                        type="number"
                                                        value={formData.sales_cost}
                                                        onChange={e => setFormData({ ...formData, sales_cost: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="w-full pl-12 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black font-mono text-gray-900 focus:bg-white focus:border-blue-500 outline-none"
                                                        required
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-1">Guest billing price per portion</p>
                                            </div>

                                            {/* Purchase Cost (Manual Defined) */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Defined Manual Cost (KES)
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3.5 top-2.5 text-xs text-gray-400 font-bold">KES</span>
                                                    <input
                                                        type="number"
                                                        value={formData.purchase_cost}
                                                        onChange={e => setFormData({ ...formData, purchase_cost: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="w-full pl-12 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold font-mono text-gray-900 focus:bg-white focus:border-blue-500 outline-none"
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-1">Baseline manual prep rate</p>
                                            </div>

                                            {/* VAT Commodity */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Kenyan Tax / VAT Classification
                                                </label>
                                                <select
                                                    value={formData.vat_commodity}
                                                    onChange={e => setFormData({ ...formData, vat_commodity: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    {vatOptions.map(v => (
                                                        <option key={v.value} value={v.value}>
                                                            {v.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Recipe COGS Status Banner */}
                                            {(() => {
                                                const matched = editingProduct
                                                    ? (recipeMap.idMap.get(editingProduct.pid) || recipeMap.nameMap.get(formData.product_name.toLowerCase().trim()))
                                                    : recipeMap.nameMap.get(formData.product_name.toLowerCase().trim());

                                                const rCost = matched ? (Number(matched.cost_per_unit) || (Number(matched.total_cost) / (Number(matched.qty_produced) || 1)) || 0) : 0;

                                                return (
                                                    <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 flex flex-col justify-between">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                                                                <span>🧪</span>
                                                                <span>Culinary Recipe Formula</span>
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                                rCost > 0 ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-600'
                                                            }`}>
                                                                {rCost > 0 ? 'Formula Active' : 'No Recipe'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 flex items-center justify-between text-xs">
                                                            <span className="text-gray-600">Portion COGS:</span>
                                                            <span className="font-black text-purple-900 font-mono">
                                                                {rCost > 0 ? fmtDec(rCost) : 'None defined'}
                                                            </span>
                                                        </div>
                                                        {rCost > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(p => ({ ...p, purchase_cost: rCost }))}
                                                                className="mt-2 text-[10px] text-purple-700 font-bold underline text-left hover:text-purple-900"
                                                            >
                                                                Apply this Recipe COGS ({fmtDec(rCost)}) as Defined Cost
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Margin & Profit Calculation Preview Card */}
                                        {formData.sales_cost > 0 && (
                                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-200 flex items-center justify-between text-xs">
                                                <div>
                                                    <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                                                        Estimated Profit per Portion
                                                    </p>
                                                    <p className="text-lg font-black text-emerald-800 font-mono mt-0.5">
                                                        +{fmt(formData.sales_cost - formData.purchase_cost)}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                                                        Gross Margin
                                                    </p>
                                                    <p className="text-lg font-black text-emerald-800 font-mono mt-0.5">
                                                        {formData.sales_cost > 0
                                                            ? `${(((formData.sales_cost - formData.purchase_cost) / formData.sales_cost) * 100).toFixed(1)}%`
                                                            : '0%'}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TAB 3: Units & Kitchen Routing */}
                                {modalTab === 'inventory' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Sales Unit */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Sales Serving Unit
                                                </label>
                                                <select
                                                    value={formData.sales_unit}
                                                    onChange={e => setFormData({ ...formData, sales_unit: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    {units.map(u => (
                                                        <option key={u.unit_id} value={u.unit_name}>
                                                            {u.unit_name} ({u.abbreviation})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Purchase Unit */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Purchase / Prep Unit
                                                </label>
                                                <select
                                                    value={formData.purchase_unit}
                                                    onChange={e => setFormData({ ...formData, purchase_unit: e.target.value })}
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    {units.map(u => (
                                                        <option key={u.unit_id} value={u.unit_name}>
                                                            {u.unit_name} ({u.abbreviation})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Reorder Threshold */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Minimum Safety Prep Threshold
                                                </label>
                                                <input
                                                    type="number"
                                                    value={formData.reorder_point}
                                                    onChange={e => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 5 })}
                                                    min="0"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            {/* Supplier / Kitchen Station */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Kitchen Section / Vendor Source
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.supplier_name}
                                                    onChange={e => setFormData({ ...formData, supplier_name: e.target.value })}
                                                    placeholder="e.g. Main Kitchen, Bakery, Butchery Prep"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            {/* Description */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                    Menu Item Description / Allergen Notes
                                                </label>
                                                <textarea
                                                    value={formData.description}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                    placeholder="Chef description, key ingredients, preparation style..."
                                                    rows={2}
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-blue-500 outline-none resize-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="bg-gray-50/80 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    {modalTab !== 'basic' && (
                                        <button
                                            type="button"
                                            onClick={() => setModalTab(modalTab === 'inventory' ? 'pricing' : 'basic')}
                                            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all"
                                        >
                                            ← Previous Step
                                        </button>
                                    )}
                                    {modalTab !== 'inventory' && (
                                        <button
                                            type="button"
                                            onClick={() => setModalTab(modalTab === 'basic' ? 'pricing' : 'inventory')}
                                            className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all"
                                        >
                                            Next Step →
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-100 transition-all disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving Record...' : editingProduct ? 'Update Dish' : 'Create Product'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
