'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface IngredientStock {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    base_unit: string;
    purchase_unit: string;
    current_stock: number;
    purchase_cost: number;
    cost_per_base_unit: number;
    price_per_pack: number;
    pack_size: number;
    reorder_point: number;
    supplier_name: string;
    barcode?: string;
    description?: string;
    active: boolean;
    total_purchased: number;
    total_issued: number;
    total_returned: number;
    total_damaged: number;
    stock_value: number;
}

interface IngredientHistoryRow {
    id: number;
    date: string;
    type: string;
    typeIcon: string;
    typeBg: string;
    quantity: number;
    unit: string;
    reference: string;
    note: string;
    createdBy?: string;
}

// ─── Constants & Catalogs ─────────────────────────────────────────────────────

const BASE_UNITS = [
    'KG', 'G', 'L', 'ML', 'PCS', 'Piece', 'Packet', 'Bag', 'Bottle', 'Tin', 
    'Box', 'Litre', 'Tray', 'Dozen', 'Bundle', 'Roll', 'Tub', 'Bucket'
];

const PURCHASE_UNITS = [
    'KG', 'G', 'L', 'ML', 'PCS', 'Piece', 'Packet', 'Bag', 'Bottle', 'Tin', 
    'Box', 'Tray', 'Dozen', 'Crate', 'Sack', 'Bundle', 'Carton', 'Bale', 'Drum'
];

const CATEGORIES = [
    'Meat & Poultry',
    'Vegetables',
    'Fruits',
    'Dairy & Eggs',
    'Grains & Cereals',
    'Spices & Seasonings',
    'Oils & Cooking Fats',
    'Beverages & Syrups',
    'Dry Goods & Flour',
    'Seafood & Fish',
    'Bakery & Pastry',
    'Sauces & Condiments',
    'Packaging & Disposables',
    'Other'
];

const CATEGORY_ICONS: Record<string, string> = {
    'Meat & Poultry': '🥩',
    'Vegetables': '🥦',
    'Fruits': '🍎',
    'Dairy & Eggs': '🧀',
    'Grains & Cereals': '🌾',
    'Spices & Seasonings': '🌿',
    'Oils & Cooking Fats': '🫒',
    'Beverages & Syrups': '🧃',
    'Dry Goods & Flour': '📦',
    'Seafood & Fish': '🐟',
    'Bakery & Pastry': '🍞',
    'Sauces & Condiments': '🥫',
    'Packaging & Disposables': '🛍️',
    'Other': '🧂',
};

const emptyForm = {
    product_code: '',
    product_name: '',
    category: 'Dry Goods & Flour',
    base_unit: 'KG',
    purchase_unit: 'Bag',
    current_stock: 0,
    purchase_cost: 0,
    cost_per_base_unit: 0,
    price_per_pack: 0,
    pack_size: 1,
    reorder_point: 10,
    supplier_name: '',
    description: '',
    barcode: '',
    active: true,
};

type StockStatusFilter = 'all' | 'safe' | 'low' | 'out';
type SortField = 'stock_value' | 'current_stock' | 'product_name' | 'cost_per_base_unit' | 'reorder_point';
type SortOrder = 'asc' | 'desc';

export default function IngredientStockPage() {
    // ─── Core Data State ───────────────────────────────────────────────────────
    const [ingredients, setIngredients] = useState<IngredientStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentUser, setCurrentUser] = useState('Store Keeper / Chef');

    // ─── Filter & Search State ─────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [stockFilter, setStockFilter] = useState<StockStatusFilter>('all');
    const [supplierFilter, setSupplierFilter] = useState('All');
    const [sortField, setSortField] = useState<SortField>('stock_value');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // ─── Modals State ──────────────────────────────────────────────────────────
    // 1. Full Add/Edit Ingredient
    const [showModal, setShowModal] = useState(false);
    const [editIngredient, setEditIngredient] = useState<IngredientStock | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [autoCode, setAutoCode] = useState('');
    const [formTab, setFormTab] = useState<'info' | 'packaging' | 'costing'>('info');

    // 2. Quick Stock In (Receiving Delivery)
    const [showStockInModal, setShowStockInModal] = useState(false);
    const [stockInTarget, setStockInTarget] = useState<IngredientStock | null>(null);
    const [stockInMode, setStockInMode] = useState<'packs' | 'base'>('packs');
    const [stockInQty, setStockInQty] = useState('');
    const [stockInPackCost, setStockInPackCost] = useState('');
    const [stockInRef, setStockInRef] = useState('');
    const [stockInSupplier, setStockInSupplier] = useState('');
    const [stockInNotes, setStockInNotes] = useState('');

    // 3. Quick Kitchen Issue (Issue store raw goods to kitchen station)
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [issueTarget, setIssueTarget] = useState<IngredientStock | null>(null);
    const [issueQty, setIssueQty] = useState('');
    const [issueStation, setIssueStation] = useState('Main Kitchen');
    const [issueChef, setIssueChef] = useState('');
    const [issueNotes, setIssueNotes] = useState('');

    // 4. Stock Take / Physical Audit Reconciliation
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditTarget, setAuditTarget] = useState<IngredientStock | null>(null);
    const [auditPhysicalQty, setAuditPhysicalQty] = useState('');
    const [auditReason, setAuditReason] = useState('Monthly Store Stock Take');
    const [auditNotes, setAuditNotes] = useState('');

    // 5. Movement History & Audit Ledger
    const [historyIngredient, setHistoryIngredient] = useState<IngredientStock | null>(null);
    const [history, setHistory] = useState<IngredientHistoryRow[]>([]);
    const [historyFilter, setHistoryFilter] = useState('all');
    const [historyLoading, setHistoryLoading] = useState(false);

    // ─── Read Logged-In User ───────────────────────────────────────────────────
    useEffect(() => {
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const parsed = JSON.parse(u);
                setCurrentUser(parsed.name || parsed.user_name || 'Store Keeper / Chef');
            }
        } catch {}
    }, []);

    // ─── Format Currency Helpers ───────────────────────────────────────────────
    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── Load Ingredients from Supabase ───────────────────────────────────────
    const loadIngredients = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            // 1. Fetch all active raw ingredients
            const { data: ingList, error: ingErr } = await supabase
                .from('products_ingredients')
                .select('*')
                .eq('active', true)
                .order('product_name');

            if (ingErr) throw ingErr;

            // 2. Fetch stock movements for accurate flow totals
            const { data: movements } = await supabase
                .from('stock_movements')
                .select('product_id, movement_type, quantity');

            // 3. Fetch recipe issues
            const { data: recipeIssues } = await supabase
                .from('recipe_ingredients')
                .select('ingredient_product_id, qty_issued');

            const moveMap = new Map<number, { purchased: number; returned: number; damaged: number; manualIssued: number }>();
            (movements || []).forEach((m: any) => {
                const pid = Number(m.product_id);
                if (!pid) return;
                const cur = moveMap.get(pid) || { purchased: 0, returned: 0, damaged: 0, manualIssued: 0 };
                const mt = (m.movement_type || '').toLowerCase();
                const q = Math.abs(Number(m.quantity) || 0);

                if (mt.includes('purchase') || mt.includes('received') || mt === 'in' || mt.includes('delivery')) {
                    cur.purchased += q;
                } else if (mt.includes('return')) {
                    cur.returned += q;
                } else if (mt.includes('damage') || mt.includes('spoil') || mt.includes('waste') || mt.includes('loss')) {
                    cur.damaged += q;
                } else if (mt.includes('kitchen') || mt.includes('issue') || mt.includes('depletion')) {
                    cur.manualIssued += q;
                }
                moveMap.set(pid, cur);
            });

            const issueMap = new Map<number, number>();
            (recipeIssues || []).forEach((r: any) => {
                const pid = Number(r.ingredient_product_id);
                if (!pid) return;
                issueMap.set(pid, (issueMap.get(pid) || 0) + (Number(r.qty_issued) || 0));
            });

            // Build ingredient objects with complete valuations
            const list: IngredientStock[] = (ingList || []).map((p: any) => {
                const pid = p.pid;
                const mv = moveMap.get(pid) || { purchased: 0, returned: 0, damaged: 0, manualIssued: 0 };
                const recipeIssued = issueMap.get(pid) || 0;
                const totalIssued = mv.manualIssued > 0 ? mv.manualIssued : recipeIssued;

                const curStock = Number(p.current_stock) || 0;
                const packSz = Number(p.pack_size) || 1;
                const pricePack = Number(p.price_per_pack) || 0;
                let costPerBase = Number(p.cost_per_base_unit) || Number(p.purchase_cost) || 0;

                if (costPerBase <= 0 && pricePack > 0 && packSz > 0) {
                    costPerBase = pricePack / packSz;
                }

                const stockValue = curStock * costPerBase;

                return {
                    pid,
                    product_code: p.product_code || `ING-${String(pid).padStart(4, '0')}`,
                    product_name: p.product_name,
                    category: p.category || 'Dry Goods & Flour',
                    base_unit: p.base_unit || 'KG',
                    purchase_unit: p.purchase_unit || 'Bag',
                    current_stock: curStock,
                    purchase_cost: Number(p.purchase_cost) || costPerBase,
                    cost_per_base_unit: costPerBase,
                    price_per_pack: pricePack,
                    pack_size: packSz,
                    reorder_point: Number(p.reorder_point) || 10,
                    supplier_name: p.supplier_name || 'Standard Store Supplier',
                    barcode: p.barcode || '',
                    description: p.description || '',
                    active: p.active !== false,
                    total_purchased: mv.purchased,
                    total_issued: totalIssued,
                    total_returned: mv.returned,
                    total_damaged: mv.damaged,
                    stock_value: stockValue,
                };
            });

            setIngredients(list);
        } catch (err: any) {
            console.error('Error loading ingredient stock:', err);
            toast.error('Failed to load ingredient stock: ' + (err.message || 'Unknown error'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadIngredients();
    }, [loadIngredients]);

    // ─── Generate Ingredient Code ─────────────────────────────────────────────
    const genCode = useCallback(async () => {
        try {
            const { count } = await supabase
                .from('products_ingredients')
                .select('*', { count: 'exact', head: true });
            const next = String((count || 0) + 1).padStart(4, '0');
            return `ING-${next}`;
        } catch {
            return `ING-${Date.now().toString().slice(-4)}`;
        }
    }, []);

    // ─── Add & Edit Handlers ──────────────────────────────────────────────────
    const openAdd = async () => {
        setEditIngredient(null);
        setFormTab('info');
        const code = await genCode();
        setFormData({ ...emptyForm, product_code: code });
        setAutoCode(code);
        setShowModal(true);
    };

    const openEdit = (ing: IngredientStock) => {
        setEditIngredient(ing);
        setFormTab('info');
        setFormData({
            product_code: ing.product_code || '',
            product_name: ing.product_name,
            category: ing.category,
            base_unit: ing.base_unit,
            purchase_unit: ing.purchase_unit,
            current_stock: ing.current_stock,
            purchase_cost: ing.purchase_cost,
            cost_per_base_unit: ing.cost_per_base_unit,
            price_per_pack: ing.price_per_pack,
            pack_size: ing.pack_size,
            reorder_point: ing.reorder_point,
            supplier_name: ing.supplier_name,
            description: ing.description || '',
            barcode: ing.barcode || '',
            active: ing.active,
        });
        setShowModal(true);
    };

    // Auto-calculate cost per base unit when pack size or pack price changes
    const handlePriceChange = (field: 'price_per_pack' | 'pack_size', val: string) => {
        const numVal = parseFloat(val) || 0;
        setFormData(prev => {
            const updated = { ...prev, [field]: numVal };
            const packCost = field === 'price_per_pack' ? numVal : prev.price_per_pack;
            const packSz = field === 'pack_size' ? numVal : prev.pack_size;
            if (packSz > 0) {
                const perBase = packCost / packSz;
                updated.cost_per_base_unit = perBase;
                updated.purchase_cost = perBase;
            }
            return updated;
        });
    };

    const handleSaveIngredient = async () => {
        if (!formData.product_name.trim()) {
            toast.error('Please enter the ingredient name');
            return;
        }

        setIsSaving(true);
        try {
            const finalCode = formData.product_code.trim() || autoCode || `ING-${Date.now().toString().slice(-4)}`;
            const payload: any = {
                product_code: finalCode,
                product_name: formData.product_name.trim(),
                category: formData.category,
                base_unit: formData.base_unit,
                purchase_unit: formData.purchase_unit,
                current_stock: Number(formData.current_stock) || 0,
                purchase_cost: Number(formData.purchase_cost) || Number(formData.cost_per_base_unit) || 0,
                cost_per_base_unit: Number(formData.cost_per_base_unit) || 0,
                price_per_pack: Number(formData.price_per_pack) || 0,
                pack_size: Number(formData.pack_size) || 1,
                reorder_point: Number(formData.reorder_point) || 10,
                supplier_name: formData.supplier_name.trim() || 'Store Supplier',
                description: formData.description.trim() || null,
                barcode: formData.barcode.trim() || null,
                active: formData.active,
                updated_at: new Date().toISOString(),
            };

            if (editIngredient) {
                const { error } = await supabase
                    .from('products_ingredients')
                    .update(payload)
                    .eq('pid', editIngredient.pid);
                if (error) throw error;
                toast.success(`Updated ${formData.product_name} successfully! ✨`);
            } else {
                payload.created_at = new Date().toISOString();
                const { error } = await supabase
                    .from('products_ingredients')
                    .insert(payload);
                if (error) throw error;
                toast.success(`Added ${formData.product_name} to store inventory! 🧂`);
            }

            setShowModal(false);
            await loadIngredients();
        } catch (err: any) {
            console.error('Error saving ingredient:', err);
            toast.error('Failed to save ingredient: ' + (err.message || 'Database error'));
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Archive Ingredient ───────────────────────────────────────────────────
    const handleArchive = async (ing: IngredientStock) => {
        if (!confirm(`Archive "${ing.product_name}"? It will be hidden from the active pantry but historic records remain safe.`)) {
            return;
        }
        try {
            const { error } = await supabase
                .from('products_ingredients')
                .update({ active: false, updated_at: new Date().toISOString() })
                .eq('pid', ing.pid);
            if (error) throw error;
            toast.success(`Archived ${ing.product_name}`);
            loadIngredients();
        } catch (err: any) {
            toast.error('Failed to archive: ' + err.message);
        }
    };

    // ─── Quick Stock In Handler ───────────────────────────────────────────────
    const openStockIn = (ing?: IngredientStock) => {
        const target = ing || ingredients[0] || null;
        setStockInTarget(target);
        if (target) {
            setStockInMode('packs');
            setStockInQty('');
            setStockInPackCost(target.price_per_pack > 0 ? String(target.price_per_pack) : '');
            setStockInSupplier(target.supplier_name || '');
            setStockInRef(`PO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 899 + 100)}`);
            setStockInNotes('');
        }
        setShowStockInModal(true);
    };

    const handleSaveStockIn = async () => {
        if (!stockInTarget) {
            toast.error('Please select an ingredient');
            return;
        }
        const qty = parseFloat(stockInQty);
        if (!qty || qty <= 0) {
            toast.error('Enter a valid received quantity (> 0)');
            return;
        }

        setIsSaving(true);
        try {
            const packSize = stockInTarget.pack_size || 1;
            const additionalBaseQty = stockInMode === 'packs' ? (qty * packSize) : qty;
            const newStock = stockInTarget.current_stock + additionalBaseQty;

            const packCost = parseFloat(stockInPackCost) || stockInTarget.price_per_pack || 0;
            const newCostPerBase = packSize > 0 && packCost > 0 ? (packCost / packSize) : stockInTarget.cost_per_base_unit;

            // 1. Update products_ingredients
            const { error: upErr } = await supabase
                .from('products_ingredients')
                .update({
                    current_stock: newStock,
                    price_per_pack: packCost > 0 ? packCost : stockInTarget.price_per_pack,
                    cost_per_base_unit: newCostPerBase,
                    purchase_cost: newCostPerBase,
                    supplier_name: stockInSupplier.trim() || stockInTarget.supplier_name,
                    updated_at: new Date().toISOString(),
                })
                .eq('pid', stockInTarget.pid);

            if (upErr) throw upErr;

            // 2. Audit to stock_movements
            try {
                await supabase.from('stock_movements').insert({
                    product_id: stockInTarget.pid,
                    product_code: stockInTarget.product_code,
                    product_name: stockInTarget.product_name,
                    movement_type: 'Purchase Received',
                    quantity: additionalBaseQty,
                    unit: stockInTarget.base_unit,
                    unit_cost: newCostPerBase,
                    total_cost: additionalBaseQty * newCostPerBase,
                    reference_no: stockInRef.trim() || 'GOODS-RECEIVED',
                    reason: stockInNotes.trim() || `Delivery of ${qty} ${stockInMode === 'packs' ? stockInTarget.purchase_unit : stockInTarget.base_unit} from ${stockInSupplier || 'Supplier'}`,
                    created_by: currentUser,
                    movement_date: new Date().toISOString().split('T')[0],
                    created_at: new Date().toISOString(),
                });
            } catch (auditErr) {
                console.warn('Audit movement logged with warning:', auditErr);
            }

            toast.success(`Received +${additionalBaseQty} ${stockInTarget.base_unit} of ${stockInTarget.product_name}! 📥`);
            setShowStockInModal(false);
            setStockInTarget(null);
            await loadIngredients();
        } catch (err: any) {
            console.error('Stock in error:', err);
            toast.error('Failed to receive stock: ' + (err.message || 'Error'));
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Quick Kitchen Issue Handler ──────────────────────────────────────────
    const openKitchenIssue = (ing?: IngredientStock) => {
        const target = ing || ingredients[0] || null;
        setIssueTarget(target);
        setIssueQty('');
        setIssueStation('Main Kitchen');
        setIssueChef(currentUser);
        setIssueNotes('');
        setShowIssueModal(true);
    };

    const handleSaveKitchenIssue = async () => {
        if (!issueTarget) {
            toast.error('Select an ingredient to issue');
            return;
        }
        const qty = parseFloat(issueQty);
        if (!qty || qty <= 0) {
            toast.error('Enter a valid issue quantity (> 0)');
            return;
        }
        if (qty > issueTarget.current_stock) {
            toast.error(`Cannot issue ${qty} ${issueTarget.base_unit}. Only ${issueTarget.current_stock} ${issueTarget.base_unit} available in store.`);
            return;
        }

        setIsSaving(true);
        try {
            const newStock = Math.max(0, issueTarget.current_stock - qty);

            // 1. Update current_stock in products_ingredients
            const { error: upErr } = await supabase
                .from('products_ingredients')
                .update({
                    current_stock: newStock,
                    updated_at: new Date().toISOString(),
                })
                .eq('pid', issueTarget.pid);

            if (upErr) throw upErr;

            // 2. Audit movement in stock_movements
            try {
                await supabase.from('stock_movements').insert({
                    product_id: issueTarget.pid,
                    product_code: issueTarget.product_code,
                    product_name: issueTarget.product_name,
                    movement_type: 'Kitchen Issue',
                    quantity: -qty,
                    unit: issueTarget.base_unit,
                    unit_cost: issueTarget.cost_per_base_unit,
                    total_cost: qty * issueTarget.cost_per_base_unit,
                    reference_no: `ISSUE-${issueStation.replace(/\s+/g, '').toUpperCase()}`,
                    reason: `${issueStation} Prep • Issued to: ${issueChef || 'Kitchen Staff'} • ${issueNotes || 'Daily culinary prep'}`,
                    created_by: currentUser,
                    movement_date: new Date().toISOString().split('T')[0],
                    created_at: new Date().toISOString(),
                });
            } catch (auditErr) {
                console.warn('Audit movement warning:', auditErr);
            }

            toast.success(`Issued ${qty} ${issueTarget.base_unit} to ${issueStation}! 🍳`);
            setShowIssueModal(false);
            setIssueTarget(null);
            await loadIngredients();
        } catch (err: any) {
            console.error('Kitchen issue error:', err);
            toast.error('Failed to issue stock: ' + (err.message || 'Error'));
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Stock Take / Physical Audit Handler ──────────────────────────────────
    const openStockAudit = (ing: IngredientStock) => {
        setAuditTarget(ing);
        setAuditPhysicalQty(String(ing.current_stock));
        setAuditReason('Physical Store Count Reconciliation');
        setAuditNotes('');
        setShowAuditModal(true);
    };

    const handleSaveStockAudit = async () => {
        if (!auditTarget) return;
        const counted = parseFloat(auditPhysicalQty);
        if (isNaN(counted) || counted < 0) {
            toast.error('Enter a valid physical count (>= 0)');
            return;
        }

        const variance = counted - auditTarget.current_stock;
        setIsSaving(true);
        try {
            // 1. Update stock
            const { error: upErr } = await supabase
                .from('products_ingredients')
                .update({
                    current_stock: counted,
                    updated_at: new Date().toISOString(),
                })
                .eq('pid', auditTarget.pid);

            if (upErr) throw upErr;

            // 2. Audit entry
            try {
                await supabase.from('stock_movements').insert({
                    product_id: auditTarget.pid,
                    product_code: auditTarget.product_code,
                    product_name: auditTarget.product_name,
                    movement_type: variance >= 0 ? 'Stock Adjustment (Surplus)' : 'Stock Adjustment (Shrinkage)',
                    quantity: variance,
                    unit: auditTarget.base_unit,
                    unit_cost: auditTarget.cost_per_base_unit,
                    total_cost: Math.abs(variance) * auditTarget.cost_per_base_unit,
                    reference_no: `AUDIT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
                    reason: `${auditReason} • System: ${auditTarget.current_stock} -> Physical: ${counted} (Variance: ${variance > 0 ? '+' : ''}${variance} ${auditTarget.base_unit}) • ${auditNotes || 'Reconciled'}`,
                    created_by: currentUser,
                    movement_date: new Date().toISOString().split('T')[0],
                    created_at: new Date().toISOString(),
                });
            } catch (err) {
                console.warn('Audit movement logged with warning:', err);
            }

            toast.success(`Inventory reconciled! System updated to ${counted} ${auditTarget.base_unit} ⚖️`);
            setShowAuditModal(false);
            setAuditTarget(null);
            await loadIngredients();
        } catch (err: any) {
            console.error('Audit save error:', err);
            toast.error('Reconciliation failed: ' + (err.message || 'Error'));
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Movement History Ledger Modal ────────────────────────────────────────
    const openHistoryModal = async (ing: IngredientStock) => {
        setHistoryIngredient(ing);
        setHistoryLoading(true);
        setHistory([]);
        setHistoryFilter('all');
        try {
            const rows: IngredientHistoryRow[] = [];

            // 1. Direct stock movements
            const { data: moves } = await supabase
                .from('stock_movements')
                .select('*')
                .eq('product_id', ing.pid)
                .order('movement_date', { ascending: false });

            (moves || []).forEach((m: any) => {
                let icon = '📦';
                let bg = 'bg-blue-100 text-blue-800';
                const mt = (m.movement_type || '').toLowerCase();

                if (mt.includes('purchase') || mt.includes('received') || mt === 'in' || mt.includes('delivery')) {
                    icon = '🛒';
                    bg = 'bg-emerald-100 text-emerald-800';
                } else if (mt.includes('return')) {
                    icon = '↩️';
                    bg = 'bg-purple-100 text-purple-800';
                } else if (mt.includes('damage') || mt.includes('spoil') || mt.includes('waste') || mt.includes('loss')) {
                    icon = '❌';
                    bg = 'bg-red-100 text-red-800';
                } else if (mt.includes('kitchen') || mt.includes('issue') || mt.includes('recipe') || mt.includes('depletion')) {
                    icon = '🍳';
                    bg = 'bg-amber-100 text-amber-800';
                } else if (mt.includes('adjustment') || mt.includes('audit')) {
                    icon = '⚖️';
                    bg = 'bg-indigo-100 text-indigo-800';
                }

                rows.push({
                    id: m.movement_id,
                    date: m.movement_date || m.created_at,
                    type: m.movement_type || 'Movement',
                    typeIcon: icon,
                    typeBg: bg,
                    quantity: Number(m.quantity) || 0,
                    unit: m.unit || ing.base_unit,
                    reference: m.reference_no || `MOV-${m.movement_id}`,
                    note: m.reason || `Audited by ${m.created_by || 'Staff'}`,
                    createdBy: m.created_by || 'Store Keeper',
                });
            });

            rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            setHistory(rows);
        } catch (err) {
            console.error('History load error:', err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // ─── Export CSV Report ────────────────────────────────────────────────────
    const exportCSV = () => {
        if (ingredients.length === 0) {
            toast.error('No ingredients to export');
            return;
        }

        const headers = [
            'Code',
            'Ingredient Name',
            'Category',
            'Current Stock',
            'Base Unit',
            'Cost Per Unit (KES)',
            'Total Stock Value (KES)',
            'Purchase Unit',
            'Pack Size',
            'Price Per Pack (KES)',
            'Reorder Point',
            'Supplier',
            'Status'
        ];

        const rows = filteredIngredients.map(i => [
            `"${i.product_code}"`,
            `"${i.product_name.replace(/"/g, '""')}"`,
            `"${i.category}"`,
            i.current_stock.toFixed(2),
            `"${i.base_unit}"`,
            i.cost_per_base_unit.toFixed(2),
            i.stock_value.toFixed(2),
            `"${i.purchase_unit}"`,
            i.pack_size,
            i.price_per_pack.toFixed(2),
            i.reorder_point,
            `"${(i.supplier_name || '').replace(/"/g, '""')}"`,
            i.current_stock <= 0 ? '"OUT OF STOCK"' : i.current_stock <= i.reorder_point ? '"LOW STOCK"' : '"SAFE"'
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `ingredient_stock_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Pantry stock CSV exported! 📄');
    };

    // ─── Filtering & Sorting ──────────────────────────────────────────────────
    const categoriesList = useMemo(() => {
        const set = new Set(ingredients.map(i => i.category).filter(Boolean));
        return Array.from(set).sort();
    }, [ingredients]);

    const suppliersList = useMemo(() => {
        const set = new Set(ingredients.map(i => i.supplier_name).filter(Boolean));
        return Array.from(set).sort();
    }, [ingredients]);

    const filteredIngredients = useMemo(() => {
        return ingredients.filter(ing => {
            // Text Search
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                const matchName = ing.product_name.toLowerCase().includes(q);
                const matchCode = ing.product_code.toLowerCase().includes(q);
                const matchCat = ing.category.toLowerCase().includes(q);
                const matchSup = ing.supplier_name.toLowerCase().includes(q);
                if (!matchName && !matchCode && !matchCat && !matchSup) return false;
            }

            // Category Filter
            if (categoryFilter !== 'All' && ing.category !== categoryFilter) return false;

            // Supplier Filter
            if (supplierFilter !== 'All' && ing.supplier_name !== supplierFilter) return false;

            // Stock Health Filter
            if (stockFilter === 'safe' && ing.current_stock <= ing.reorder_point) return false;
            if (stockFilter === 'low' && (ing.current_stock <= 0 || ing.current_stock > ing.reorder_point)) return false;
            if (stockFilter === 'out' && ing.current_stock > 0) return false;

            return true;
        });
    }, [ingredients, search, categoryFilter, supplierFilter, stockFilter]);

    const sortedIngredients = useMemo(() => {
        return [...filteredIngredients].sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredIngredients, sortField, sortOrder]);

    // ─── Executive KPI Totals ─────────────────────────────────────────────────
    const kpiTotals = useMemo(() => {
        const totalItems = ingredients.length;
        const totalStockValue = ingredients.reduce((sum, i) => sum + (i.stock_value || 0), 0);
        const safeCount = ingredients.filter(i => i.current_stock > i.reorder_point).length;
        const lowCount = ingredients.filter(i => i.current_stock > 0 && i.current_stock <= i.reorder_point).length;
        const outCount = ingredients.filter(i => i.current_stock <= 0).length;
        const totalPurchasedUnits = ingredients.reduce((sum, i) => sum + (i.total_purchased || 0), 0);
        const totalIssuedUnits = ingredients.reduce((sum, i) => sum + (i.total_issued || 0), 0);

        return {
            totalItems,
            totalStockValue,
            safeCount,
            lowCount,
            outCount,
            totalPurchasedUnits,
            totalIssuedUnits,
        };
    }, [ingredients]);

    // ─── Stock Health Badge Helper ────────────────────────────────────────────
    const getStockHealth = (ing: IngredientStock) => {
        if (ing.current_stock <= 0) {
            return {
                label: 'Out of Stock',
                badgeCls: 'bg-red-50 text-red-700 border border-red-200',
                dotCls: 'bg-red-500',
                barCls: 'bg-red-500',
                percent: 0,
            };
        }
        if (ing.current_stock <= ing.reorder_point) {
            const pct = Math.min(100, Math.round((ing.current_stock / (ing.reorder_point || 1)) * 100));
            return {
                label: 'Low Stock Alert',
                badgeCls: 'bg-amber-50 text-amber-800 border border-amber-200',
                dotCls: 'bg-amber-500',
                barCls: 'bg-amber-500',
                percent: pct,
            };
        }
        return {
            label: 'Optimal Level',
            badgeCls: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
            dotCls: 'bg-emerald-500',
            barCls: 'bg-emerald-500',
            percent: 100,
        };
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
            {/* ── 1. ULTRA EXECUTIVE HEADER ─────────────────────────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 rounded-2xl flex items-center justify-center text-white text-3xl shadow-md shadow-indigo-100 flex-shrink-0">
                        🧂
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                                Raw Ingredients &amp; Pantry Inventory
                            </h1>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Active Store Ledger
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Live culinary warehouse tracking, automated recipe depletion, goods receipt, kitchen issues &amp; valuation.
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Refresh */}
                    <button
                        onClick={() => loadIngredients(true)}
                        disabled={refreshing || loading}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        title="Reload latest database records"
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

                    {/* Quick Kitchen Issue */}
                    <button
                        onClick={() => openKitchenIssue()}
                        className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-black border border-amber-200 transition-all flex items-center gap-1.5 shadow-xs"
                    >
                        <span>🍳</span>
                        <span>Issue to Kitchen</span>
                    </button>

                    {/* Quick Stock In */}
                    <button
                        onClick={() => openStockIn()}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-200"
                    >
                        <span>📦</span>
                        <span>Receive Goods</span>
                    </button>

                    {/* Add Ingredient */}
                    <button
                        onClick={openAdd}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-indigo-200 hover:-translate-y-0.5"
                    >
                        <span>➕</span>
                        <span>New Raw Ingredient</span>
                    </button>
                </div>
            </div>

            {/* ── 2. EXECUTIVE METRIC KPI CARDS ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* 1. Total Store Value */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-gray-500 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700">💎 Total Asset Value</span>
                        <span className="text-base">💰</span>
                    </div>
                    <p className="text-xl font-black text-gray-900 tracking-tight">
                        {fmt(kpiTotals.totalStockValue)}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">Based on cost per base unit</p>
                </div>

                {/* 2. Total Catalog Items */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-gray-500 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">🧂 Catalog Items</span>
                        <span className="text-base">📋</span>
                    </div>
                    <p className="text-xl font-black text-gray-900 tracking-tight">
                        {kpiTotals.totalItems} <span className="text-xs text-gray-400 font-semibold">SKUs</span>
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">Across {categoriesList.length} categories</p>
                </div>

                {/* 3. Optimal Stock Level */}
                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-emerald-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🟢 Safe Levels</span>
                        <span className="text-base">✅</span>
                    </div>
                    <p className="text-xl font-black text-emerald-700 tracking-tight">
                        {kpiTotals.safeCount} <span className="text-xs text-emerald-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium mt-1">Above reorder threshold</p>
                </div>

                {/* 4. Low Stock Alert */}
                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-amber-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🟡 Reorder Warning</span>
                        <span className="text-base">⚠️</span>
                    </div>
                    <p className="text-xl font-black text-amber-700 tracking-tight">
                        {kpiTotals.lowCount} <span className="text-xs text-amber-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-amber-600 font-medium mt-1">At or near minimum safety stock</p>
                </div>

                {/* 5. Out of Stock */}
                <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-red-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🔴 Stockout Alert</span>
                        <span className="text-base">🚫</span>
                    </div>
                    <p className="text-xl font-black text-red-700 tracking-tight">
                        {kpiTotals.outCount} <span className="text-xs text-red-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-red-600 font-medium mt-1">Requires urgent purchase order</p>
                </div>

                {/* 6. Total Kitchen Issues */}
                <div className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-indigo-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🍳 Kitchen Depletion</span>
                        <span className="text-base">🔥</span>
                    </div>
                    <p className="text-xl font-black text-indigo-900 tracking-tight">
                        {kpiTotals.totalIssuedUnits.toLocaleString('en-KE', { maximumFractionDigits: 1 })}
                    </p>
                    <p className="text-[10px] text-indigo-600 font-medium mt-1">Issued to chefs &amp; recipes</p>
                </div>
            </div>

            {/* ── 3. SEARCH, FILTERS & CONTROLS TOOLBAR ────────────────────────── */}
            <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3">
                    {/* Search Field (4 cols) */}
                    <div className="md:col-span-4 relative">
                        <span className="absolute left-3.5 top-3 text-gray-400 text-sm">🔍</span>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search ingredient name, code (ING-001), supplier..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-3 text-xs text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Category Filter (3 cols) */}
                    <div className="md:col-span-3">
                        <select
                            value={categoryFilter}
                            onChange={e => setCategoryFilter(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                        >
                            <option value="All">All Categories ({ingredients.length} items)</option>
                            {categoriesList.map(c => {
                                const count = ingredients.filter(i => i.category === c).length;
                                return (
                                    <option key={c} value={c}>
                                        {CATEGORY_ICONS[c] || '🧂'} {c} ({count})
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/* Supplier Filter (3 cols) */}
                    <div className="md:col-span-3">
                        <select
                            value={supplierFilter}
                            onChange={e => setSupplierFilter(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                        >
                            <option value="All">All Suppliers ({suppliersList.length})</option>
                            {suppliersList.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sort Selector (2 cols) */}
                    <div className="md:col-span-2">
                        <select
                            value={`${sortField}_${sortOrder}`}
                            onChange={e => {
                                const [field, ord] = e.target.value.split('_') as [SortField, SortOrder];
                                setSortField(field);
                                setSortOrder(ord);
                            }}
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                        >
                            <option value="stock_value_desc">Valuation (High → Low)</option>
                            <option value="stock_value_asc">Valuation (Low → High)</option>
                            <option value="current_stock_asc">Stock Level (Lowest First)</option>
                            <option value="current_stock_desc">Stock Level (Highest First)</option>
                            <option value="product_name_asc">Name (A → Z)</option>
                            <option value="cost_per_base_unit_desc">Unit Cost (High → Low)</option>
                        </select>
                    </div>
                </div>

                {/* Stock Health Pills & Quick Reset Row */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            onClick={() => setStockFilter('all')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                stockFilter === 'all'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }`}
                        >
                            All SKUs ({ingredients.length})
                        </button>

                        <button
                            onClick={() => setStockFilter('safe')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                stockFilter === 'safe'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                        >
                            <span>🟢</span>
                            <span>Optimal Stock ({kpiTotals.safeCount})</span>
                        </button>

                        <button
                            onClick={() => setStockFilter('low')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                stockFilter === 'low'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                            }`}
                        >
                            <span>🟡</span>
                            <span>Low Stock Alert ({kpiTotals.lowCount})</span>
                        </button>

                        <button
                            onClick={() => setStockFilter('out')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                stockFilter === 'out'
                                    ? 'bg-red-600 text-white shadow-xs'
                                    : 'bg-red-50 hover:bg-red-100 text-red-800 border border-red-200'
                            }`}
                        >
                            <span>🔴</span>
                            <span>Stockouts ({kpiTotals.outCount})</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-500">
                            Showing <strong className="text-gray-900 font-black">{sortedIngredients.length}</strong> of {ingredients.length} items
                        </span>
                        {(search || categoryFilter !== 'All' || supplierFilter !== 'All' || stockFilter !== 'all') && (
                            <button
                                onClick={() => {
                                    setSearch('');
                                    setCategoryFilter('All');
                                    setSupplierFilter('All');
                                    setStockFilter('all');
                                }}
                                className="text-xs font-black text-indigo-600 hover:text-indigo-800 underline"
                            >
                                Reset All Filters
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 4. ULTRA GRADE DATAGRID TABLE ─────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="py-24 text-center">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-sm font-bold text-gray-700">Loading ingredient warehouse catalog...</p>
                        <p className="text-xs text-gray-400 mt-1">Synchronizing inventory balances and store valuations</p>
                    </div>
                ) : sortedIngredients.length === 0 ? (
                    <div className="py-24 text-center px-4">
                        <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-sm">
                            🧂
                        </div>
                        <h3 className="text-lg font-black text-gray-800">No Raw Ingredients Found</h3>
                        <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                            {search || categoryFilter !== 'All' || stockFilter !== 'all'
                                ? 'No ingredients matched your current filter criteria. Try resetting your search or filter tags.'
                                : 'Your pantry is currently empty. Add your raw recipe materials (e.g. Rice, Flour, Meat, Oil, Milk) to begin tracking kitchen stock.'}
                        </p>
                        <div className="mt-5 flex items-center justify-center gap-3">
                            {(search || categoryFilter !== 'All' || stockFilter !== 'all') ? (
                                <button
                                    onClick={() => {
                                        setSearch('');
                                        setCategoryFilter('All');
                                        setStockFilter('all');
                                    }}
                                    className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-black transition-all"
                                >
                                    Clear Filters
                                </button>
                            ) : null}
                            <button
                                onClick={openAdd}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-100"
                            >
                                ➕ Add First Raw Ingredient
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/90 border-b border-gray-200 text-[11px] font-black uppercase tracking-wider text-slate-600 select-none">
                                    <th className="py-4 px-4 text-left">Code &amp; Raw Material</th>
                                    <th className="py-4 px-3 text-left">Category</th>
                                    <th className="py-4 px-3 text-center">Current Stock</th>
                                    <th className="py-4 px-3 text-left">Pantry Health</th>
                                    <th className="py-4 px-3 text-right">Cost / Unit</th>
                                    <th className="py-4 px-3 text-right">Total Valuation</th>
                                    <th className="py-4 px-3 text-center">Packaging Spec</th>
                                    <th className="py-4 px-3 text-center">Movements</th>
                                    <th className="py-4 px-4 text-center">Fast Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs">
                                {sortedIngredients.map((ing, idx) => {
                                    const health = getStockHealth(ing);
                                    const icon = CATEGORY_ICONS[ing.category] || '🧂';

                                    return (
                                        <tr
                                            key={ing.pid}
                                            className={`transition-colors hover:bg-indigo-50/20 ${
                                                idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                            }`}
                                        >
                                            {/* Column 1: Code & Name */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg flex-shrink-0 border border-gray-200/60 shadow-xs">
                                                        {icon}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-gray-900 text-sm hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => openEdit(ing)}>
                                                                {ing.product_name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                                {ing.product_code}
                                                            </span>
                                                            {ing.supplier_name && (
                                                                <span className="text-[11px] text-gray-500 font-medium truncate max-w-[150px]">
                                                                    🏢 {ing.supplier_name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 2: Category */}
                                            <td className="py-3.5 px-3">
                                                <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
                                                    {ing.category}
                                                </span>
                                            </td>

                                            {/* Column 3: Current Stock */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                <div className="inline-block text-center">
                                                    <span className="text-sm font-black text-gray-900 font-mono">
                                                        {ing.current_stock.toLocaleString('en-KE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 font-bold ml-1 uppercase">
                                                        {ing.base_unit}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Column 4: Pantry Health & Bar */}
                                            <td className="py-3.5 px-3 min-w-[140px]">
                                                <div>
                                                    <div className="flex items-center justify-between gap-1 mb-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${health.badgeCls}`}>
                                                            {health.label}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-mono">
                                                            Min: {ing.reorder_point} {ing.base_unit}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${health.barCls}`}
                                                            style={{ width: `${Math.min(100, (ing.current_stock / (ing.reorder_point * 2 || 20)) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 5: Cost / Unit */}
                                            <td className="py-3.5 px-3 text-right whitespace-nowrap font-mono">
                                                <p className="font-bold text-gray-900 text-xs">
                                                    {fmtDec(ing.cost_per_base_unit)}
                                                </p>
                                                <p className="text-[10px] text-gray-400 font-medium">
                                                    per {ing.base_unit}
                                                </p>
                                            </td>

                                            {/* Column 6: Total Valuation */}
                                            <td className="py-3.5 px-3 text-right whitespace-nowrap font-mono">
                                                <p className="font-black text-indigo-700 text-xs">
                                                    {fmt(ing.stock_value)}
                                                </p>
                                                <p className="text-[10px] text-gray-400">
                                                    Store asset
                                                </p>
                                            </td>

                                            {/* Column 7: Packaging Spec */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                <span className="text-[11px] font-medium text-gray-600 bg-gray-100/80 px-2 py-1 rounded-lg">
                                                    {ing.pack_size} {ing.base_unit} / {ing.purchase_unit}
                                                </span>
                                                {ing.price_per_pack > 0 && (
                                                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                        @{fmt(ing.price_per_pack)}/pack
                                                    </p>
                                                )}
                                            </td>

                                            {/* Column 8: Movements Summary */}
                                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {ing.total_purchased > 0 ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100" title={`Total Received: ${ing.total_purchased} ${ing.base_unit}`}>
                                                            🛒 {ing.total_purchased.toFixed(0)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300 text-[10px]">—</span>
                                                    )}
                                                    {ing.total_issued > 0 ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-100" title={`Total Kitchen Issued: ${ing.total_issued} ${ing.base_unit}`}>
                                                            🍳 {ing.total_issued.toFixed(0)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>

                                            {/* Column 9: Fast Actions */}
                                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* Quick Receive */}
                                                    <button
                                                        onClick={() => openStockIn(ing)}
                                                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-black border border-emerald-200 transition-colors"
                                                        title="Receive Delivery (Stock In)"
                                                    >
                                                        📥 +In
                                                    </button>

                                                    {/* Quick Issue */}
                                                    <button
                                                        onClick={() => openKitchenIssue(ing)}
                                                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-black border border-amber-200 transition-colors"
                                                        title="Issue Store Raw Goods to Chef"
                                                    >
                                                        🍳 Issue
                                                    </button>

                                                    {/* Stock Audit */}
                                                    <button
                                                        onClick={() => openStockAudit(ing)}
                                                        className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs transition-colors"
                                                        title="Physical Stock Take Audit"
                                                    >
                                                        ⚖️
                                                    </button>

                                                    {/* History Ledger */}
                                                    <button
                                                        onClick={() => openHistoryModal(ing)}
                                                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs transition-colors"
                                                        title="View Movement Audit Log"
                                                    >
                                                        📜
                                                    </button>

                                                    {/* Edit */}
                                                    <button
                                                        onClick={() => openEdit(ing)}
                                                        className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs transition-colors"
                                                        title="Edit Specifications"
                                                    >
                                                        ✏️
                                                    </button>

                                                    {/* Archive */}
                                                    <button
                                                        onClick={() => handleArchive(ing)}
                                                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs transition-colors"
                                                        title="Archive Ingredient"
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
                )}
            </div>

            {/* ── 5. FULL ADD / EDIT INGREDIENT MODAL ───────────────────────────── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-800 px-6 py-5 text-white flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-black flex items-center gap-2">
                                    <span>{editIngredient ? '✏️' : '🧂'}</span>
                                    <span>{editIngredient ? `Edit Specification: ${editIngredient.product_name}` : 'Register New Raw Ingredient'}</span>
                                </h2>
                                <p className="text-xs text-indigo-200 mt-0.5">
                                    Pantry inventory item for recipes, banquets, butcheries &amp; culinary kitchen stations.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Navigation Tabs Inside Modal */}
                        <div className="flex border-b border-gray-200 bg-gray-50/70 px-6 pt-3 gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setFormTab('info')}
                                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all border-b-2 ${
                                    formTab === 'info'
                                        ? 'bg-white text-indigo-700 border-indigo-600 shadow-xs'
                                        : 'text-gray-500 border-transparent hover:text-gray-800'
                                }`}
                            >
                                📋 1. Identification
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormTab('packaging')}
                                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all border-b-2 ${
                                    formTab === 'packaging'
                                        ? 'bg-white text-indigo-700 border-indigo-600 shadow-xs'
                                        : 'text-gray-500 border-transparent hover:text-gray-800'
                                }`}
                            >
                                📏 2. Units &amp; Packaging
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormTab('costing')}
                                className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all border-b-2 ${
                                    formTab === 'costing'
                                        ? 'bg-white text-indigo-700 border-indigo-600 shadow-xs'
                                        : 'text-gray-500 border-transparent hover:text-gray-800'
                                }`}
                            >
                                💰 3. Costing &amp; Opening Stock
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-5 flex-1">
                            {/* TAB 1: Core Identification */}
                            {formTab === 'info' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Code */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                SKU / Item Code <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.product_code}
                                                onChange={e => setFormData(p => ({ ...p, product_code: e.target.value.toUpperCase() }))}
                                                placeholder="e.g. ING-0001"
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                            />
                                        </div>

                                        {/* Category */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Food Category <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={formData.category}
                                                onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                                            >
                                                {CATEGORIES.map(c => (
                                                    <option key={c} value={c}>
                                                        {CATEGORY_ICONS[c] || '🧂'} {c}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Ingredient Name */}
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Raw Ingredient Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.product_name}
                                                onChange={e => setFormData(p => ({ ...p, product_name: e.target.value }))}
                                                placeholder="e.g. Basmati Rice, Boneless Beef, Cooking Oil, Fresh Whole Milk..."
                                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-indigo-500 outline-none"
                                            />
                                        </div>

                                        {/* Supplier Name */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Primary Vendor / Supplier
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.supplier_name}
                                                onChange={e => setFormData(p => ({ ...p, supplier_name: e.target.value }))}
                                                placeholder="e.g. Brookside Dairy, Unga Group, Fresh Greens Ltd..."
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                            />
                                        </div>

                                        {/* Reorder Threshold */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Minimum Reorder Alert Level
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={formData.reorder_point}
                                                    onChange={e => setFormData(p => ({ ...p, reorder_point: parseFloat(e.target.value) || 0 }))}
                                                    min="0"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                                />
                                                <span className="absolute right-3.5 top-2.5 text-xs text-gray-400 font-bold uppercase">
                                                    {formData.base_unit}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Culinary Notes / Quality Standard
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.description}
                                                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                                placeholder="e.g. Grade A Extra Lean, Long Grain 2% broken..."
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: Units & Packaging */}
                            {formTab === 'packaging' && (
                                <div className="space-y-4">
                                    <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 mb-2">
                                        <p className="text-xs font-black text-indigo-900 flex items-center gap-2">
                                            <span>💡</span> How Units Work in the Kitchen
                                        </p>
                                        <p className="text-[11px] text-indigo-700 mt-1 leading-relaxed">
                                            <strong>Base Unit:</strong> The exact unit your chef measures out in recipes (e.g. KG, Grams, Litres).<br />
                                            <strong>Purchase Unit:</strong> The commercial container bought from suppliers (e.g. 50 KG Bag, 20 L Jerrycan, Carton).
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Base Unit */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Base Tracking Unit (Recipe Measure) <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={formData.base_unit}
                                                onChange={e => setFormData(p => ({ ...p, base_unit: e.target.value }))}
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                                            >
                                                {BASE_UNITS.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Purchase Unit */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Purchase Unit (Supplier Packaging)
                                            </label>
                                            <select
                                                value={formData.purchase_unit}
                                                onChange={e => setFormData(p => ({ ...p, purchase_unit: e.target.value }))}
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                                            >
                                                {PURCHASE_UNITS.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Pack Size */}
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Pack Conversion Size ({formData.base_unit} per 1 {formData.purchase_unit})
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={formData.pack_size}
                                                    onChange={e => handlePriceChange('pack_size', e.target.value)}
                                                    min="0.001"
                                                    step="0.001"
                                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                                />
                                                <span className="absolute right-3.5 top-2.5 text-xs text-gray-500 font-bold">
                                                    {formData.base_unit} per {formData.purchase_unit}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Example: If 1 Bag of Rice holds 25 KG, enter <strong>25</strong>.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: Costing & Stock Level */}
                            {formTab === 'costing' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Price per pack */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Price Per Pack ({formData.purchase_unit})
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">KES</span>
                                                <input
                                                    type="number"
                                                    value={formData.price_per_pack}
                                                    onChange={e => handlePriceChange('price_per_pack', e.target.value)}
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    className="w-full pl-12 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">Cost to buy 1 full {formData.purchase_unit}</p>
                                        </div>

                                        {/* Cost Per Base Unit (Calculated) */}
                                        <div>
                                            <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1.5">
                                                Cost Per {formData.base_unit} (Auto-Calculated)
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs text-indigo-500 font-bold">KES</span>
                                                <input
                                                    type="number"
                                                    value={formData.cost_per_base_unit.toFixed(4)}
                                                    onChange={e => {
                                                        const v = parseFloat(e.target.value) || 0;
                                                        setFormData(p => ({ ...p, cost_per_base_unit: v, purchase_cost: v }));
                                                    }}
                                                    min="0"
                                                    step="0.0001"
                                                    className="w-full pl-12 pr-4 py-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs font-black font-mono text-indigo-900 focus:bg-white focus:border-indigo-500 outline-none"
                                                />
                                            </div>
                                            <p className="text-[10px] text-indigo-600 mt-1">Pack Price ÷ Pack Size</p>
                                        </div>

                                        {/* Opening Stock */}
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Current Physical Opening Stock in Store
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={formData.current_stock}
                                                    onChange={e => setFormData(p => ({ ...p, current_stock: parseFloat(e.target.value) || 0 }))}
                                                    min="0"
                                                    step="0.01"
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:bg-white focus:border-indigo-500 outline-none"
                                                />
                                                <span className="absolute right-4 top-2.5 text-xs text-gray-500 font-bold uppercase">
                                                    {formData.base_unit}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Valuation Card */}
                                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                                                Store Opening Asset Valuation
                                            </p>
                                            <p className="text-xl font-black text-indigo-900 font-mono mt-0.5">
                                                {fmt(formData.current_stock * formData.cost_per_base_unit)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-semibold text-gray-500">Unit Consumption COGS</p>
                                            <p className="text-xs font-bold text-gray-800 font-mono">
                                                {fmtDec(formData.cost_per_base_unit)} / {formData.base_unit}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Active Toggle */}
                            <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={e => setFormData(p => ({ ...p, active: e.target.checked }))}
                                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-bold text-gray-700">
                                        Active in warehouse &amp; culinary recipe builders
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Footer Controls */}
                        <div className="bg-gray-50/80 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2">
                                {formTab !== 'info' && (
                                    <button
                                        type="button"
                                        onClick={() => setFormTab(formTab === 'costing' ? 'packaging' : 'info')}
                                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all"
                                    >
                                        ← Previous Step
                                    </button>
                                )}
                                {formTab !== 'costing' && (
                                    <button
                                        type="button"
                                        onClick={() => setFormTab(formTab === 'info' ? 'packaging' : 'costing')}
                                        className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all"
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
                                    type="button"
                                    onClick={handleSaveIngredient}
                                    disabled={isSaving}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 transition-all disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving Record...' : editIngredient ? 'Update Specification' : 'Save New Ingredient'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 6. QUICK RECEIVE STOCK IN MODAL ──────────────────────────────── */}
            {showStockInModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-emerald-600 px-6 py-4 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">📥</span>
                                <div>
                                    <h3 className="text-base font-black">Receive Store Delivery (Stock In)</h3>
                                    <p className="text-[11px] text-emerald-100">Add received goods to pantry inventory &amp; update COGS</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowStockInModal(false)}
                                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Target Item Selector */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Raw Material / Ingredient
                                </label>
                                <select
                                    value={stockInTarget?.pid || ''}
                                    onChange={e => {
                                        const found = ingredients.find(i => i.pid === Number(e.target.value));
                                        if (found) {
                                            setStockInTarget(found);
                                            setStockInPackCost(found.price_per_pack > 0 ? String(found.price_per_pack) : '');
                                            setStockInSupplier(found.supplier_name || '');
                                        }
                                    }}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:bg-white focus:border-emerald-500 cursor-pointer"
                                >
                                    {ingredients.map(i => (
                                        <option key={i.pid} value={i.pid}>
                                            {CATEGORY_ICONS[i.category] || '🧂'} {i.product_name} ({i.current_stock.toFixed(1)} {i.base_unit} in stock)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {stockInTarget && (
                                <>
                                    {/* Receive Mode Selector */}
                                    <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setStockInMode('packs')}
                                            className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                                                stockInMode === 'packs'
                                                    ? 'bg-white text-emerald-800 shadow-xs'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            In {stockInTarget.purchase_unit}s ({stockInTarget.pack_size} {stockInTarget.base_unit} / pack)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStockInMode('base')}
                                            className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                                                stockInMode === 'base'
                                                    ? 'bg-white text-emerald-800 shadow-xs'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            In {stockInTarget.base_unit}s directly
                                        </button>
                                    </div>

                                    {/* Quantity Received */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Qty Received ({stockInMode === 'packs' ? stockInTarget.purchase_unit : stockInTarget.base_unit})
                                            </label>
                                            <input
                                                type="number"
                                                value={stockInQty}
                                                onChange={e => setStockInQty(e.target.value)}
                                                min="0.1"
                                                step="0.01"
                                                placeholder="e.g. 5"
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black font-mono text-gray-900 focus:bg-white focus:border-emerald-500 outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Price per {stockInTarget.purchase_unit}
                                            </label>
                                            <input
                                                type="number"
                                                value={stockInPackCost}
                                                onChange={e => setStockInPackCost(e.target.value)}
                                                placeholder="KES 0.00"
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:bg-white focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Reference & Supplier */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Invoice / Delivery Note #
                                            </label>
                                            <input
                                                type="text"
                                                value={stockInRef}
                                                onChange={e => setStockInRef(e.target.value)}
                                                placeholder="e.g. INV-9041"
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:bg-white focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Delivered By / Vendor
                                            </label>
                                            <input
                                                type="text"
                                                value={stockInSupplier}
                                                onChange={e => setStockInSupplier(e.target.value)}
                                                placeholder="Supplier Name"
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Calculated Result Card */}
                                    {parseFloat(stockInQty) > 0 && (
                                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-emerald-900">Total Added to Stock:</span>
                                                <span className="font-black text-emerald-900 font-mono">
                                                    +{stockInMode === 'packs' ? (parseFloat(stockInQty) * (stockInTarget.pack_size || 1)) : parseFloat(stockInQty)} {stockInTarget.base_unit}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-1 text-[11px] text-emerald-700">
                                                <span>New Stock Balance:</span>
                                                <span className="font-bold">
                                                    {(stockInTarget.current_stock + (stockInMode === 'packs' ? (parseFloat(stockInQty) * (stockInTarget.pack_size || 1)) : parseFloat(stockInQty))).toFixed(2)} {stockInTarget.base_unit}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setShowStockInModal(false)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveStockIn}
                                disabled={isSaving}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                            >
                                {isSaving ? 'Receiving Goods...' : 'Confirm Stock Receipt'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 7. QUICK KITCHEN ISSUE MODAL ─────────────────────────────────── */}
            {showIssueModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-amber-600 px-6 py-4 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">🍳</span>
                                <div>
                                    <h3 className="text-base font-black">Issue Store Materials to Kitchen</h3>
                                    <p className="text-[11px] text-amber-100">Release ingredients for chef preparation or station replenishment</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowIssueModal(false)}
                                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Ingredient Picker */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Raw Material to Issue
                                </label>
                                <select
                                    value={issueTarget?.pid || ''}
                                    onChange={e => {
                                        const found = ingredients.find(i => i.pid === Number(e.target.value));
                                        if (found) setIssueTarget(found);
                                    }}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:bg-white focus:border-amber-500 cursor-pointer"
                                >
                                    {ingredients.map(i => (
                                        <option key={i.pid} value={i.pid}>
                                            {CATEGORY_ICONS[i.category] || '🧂'} {i.product_name} ({i.current_stock.toFixed(1)} {i.base_unit} available)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {issueTarget && (
                                <>
                                    {/* Quantity to Issue */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Issue Quantity ({issueTarget.base_unit})
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={issueQty}
                                                onChange={e => setIssueQty(e.target.value)}
                                                min="0.1"
                                                max={issueTarget.current_stock}
                                                step="0.01"
                                                placeholder={`Max ${issueTarget.current_stock} ${issueTarget.base_unit}`}
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black font-mono text-gray-900 focus:bg-white focus:border-amber-500 outline-none"
                                            />
                                            <span className="absolute right-3.5 top-2.5 text-xs text-gray-500 font-bold uppercase">
                                                {issueTarget.base_unit}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Kitchen Station & Chef */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Kitchen Station
                                            </label>
                                            <select
                                                value={issueStation}
                                                onChange={e => setIssueStation(e.target.value)}
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:bg-white cursor-pointer"
                                            >
                                                <option value="Main Kitchen">🍳 Main Kitchen</option>
                                                <option value="Pastry &amp; Bakery">🍞 Pastry &amp; Bakery</option>
                                                <option value="Butchery Prep">🥩 Butchery Prep</option>
                                                <option value="Bar &amp; Beverage Counter">🍹 Bar Counter</option>
                                                <option value="Room Service Prep">🛎️ Room Service</option>
                                                <option value="Banquet &amp; Events">🎉 Banquet Events</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Issued To / Chef
                                            </label>
                                            <input
                                                type="text"
                                                value={issueChef}
                                                onChange={e => setIssueChef(e.target.value)}
                                                placeholder="Chef Name"
                                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-amber-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Culinary Purpose / Recipe Note
                                        </label>
                                        <input
                                            type="text"
                                            value={issueNotes}
                                            onChange={e => setIssueNotes(e.target.value)}
                                            placeholder="e.g. Lunch rush curry batch, dinner buffet pilau..."
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-amber-500 outline-none"
                                        />
                                    </div>

                                    {/* Cost Impact Preview */}
                                    {parseFloat(issueQty) > 0 && (
                                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-amber-900">Total COGS Issued:</span>
                                                <span className="font-black text-amber-900 font-mono">
                                                    {fmt((parseFloat(issueQty) || 0) * issueTarget.cost_per_base_unit)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-1 text-[11px] text-amber-700">
                                                <span>Remaining Store Stock:</span>
                                                <span className="font-bold">
                                                    {(issueTarget.current_stock - (parseFloat(issueQty) || 0)).toFixed(2)} {issueTarget.base_unit}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setShowIssueModal(false)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveKitchenIssue}
                                disabled={isSaving}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                            >
                                {isSaving ? 'Issuing Items...' : 'Confirm Kitchen Issue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 8. PHYSICAL STOCK TAKE RECONCILIATION MODAL ───────────────────── */}
            {showAuditModal && auditTarget && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-slate-800 px-6 py-4 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">⚖️</span>
                                <div>
                                    <h3 className="text-base font-black">Stock Take &amp; Audit Reconciliation</h3>
                                    <p className="text-[11px] text-slate-300">Reconcile physical warehouse count with system inventory</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAuditModal(false)}
                                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Target Item Info */}
                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center gap-3">
                                <span className="text-2xl">{CATEGORY_ICONS[auditTarget.category] || '🧂'}</span>
                                <div className="flex-1">
                                    <p className="font-black text-gray-900 text-sm">{auditTarget.product_name}</p>
                                    <p className="text-xs text-gray-500 font-mono">{auditTarget.product_code} • {auditTarget.category}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">System Balance</p>
                                    <p className="text-sm font-black text-indigo-700 font-mono">
                                        {auditTarget.current_stock.toFixed(2)} {auditTarget.base_unit}
                                    </p>
                                </div>
                            </div>

                            {/* Physical Count Input */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Actual Physical Count in Warehouse ({auditTarget.base_unit})
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={auditPhysicalQty}
                                        onChange={e => setAuditPhysicalQty(e.target.value)}
                                        min="0"
                                        step="0.01"
                                        className="w-full px-4 py-3 bg-indigo-50/50 border border-indigo-200 rounded-xl text-base font-black font-mono text-gray-900 focus:bg-white focus:border-indigo-500 outline-none"
                                    />
                                    <span className="absolute right-4 top-3 text-xs text-indigo-600 font-bold uppercase">
                                        {auditTarget.base_unit}
                                    </span>
                                </div>
                            </div>

                            {/* Variance Calculation Card */}
                            {(() => {
                                const counted = parseFloat(auditPhysicalQty);
                                const variance = isNaN(counted) ? 0 : counted - auditTarget.current_stock;
                                const varianceVal = Math.abs(variance) * auditTarget.cost_per_base_unit;

                                return (
                                    <div className={`p-4 rounded-2xl border text-xs ${
                                        variance === 0
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                            : variance > 0
                                            ? 'bg-blue-50 border-blue-200 text-blue-900'
                                            : 'bg-red-50 border-red-200 text-red-900'
                                    }`}>
                                        <div className="flex items-center justify-between font-bold">
                                            <span>Inventory Variance:</span>
                                            <span className="font-mono text-sm font-black">
                                                {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)} {auditTarget.base_unit}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1 text-[11px] opacity-80">
                                            <span>Financial Value Impact:</span>
                                            <span className="font-mono font-bold">
                                                {variance >= 0 ? '+' : '-'}{fmt(varianceVal)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Reason for discrepancy */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Audit Reason / Discrepancy Note
                                </label>
                                <select
                                    value={auditReason}
                                    onChange={e => setAuditReason(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:bg-white cursor-pointer"
                                >
                                    <option value="Monthly Store Stock Take">Monthly Store Stock Take</option>
                                    <option value="Evaporation / Moisture Loss">Evaporation / Moisture Loss</option>
                                    <option value="Unrecorded Spoilage / Damage">Unrecorded Spoilage / Damage</option>
                                    <option value="Kitchen Portioning Error">Kitchen Portioning Error</option>
                                    <option value="Supplier Delivery Shortage">Supplier Delivery Shortage</option>
                                    <option value="Manager Manual Correction">Manager Manual Correction</option>
                                </select>
                            </div>

                            {/* Additional Notes */}
                            <div>
                                <input
                                    type="text"
                                    value={auditNotes}
                                    onChange={e => setAuditNotes(e.target.value)}
                                    placeholder="Optional notes or investigation remarks..."
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white outline-none"
                                />
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setShowAuditModal(false)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveStockAudit}
                                disabled={isSaving}
                                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                            >
                                {isSaving ? 'Reconciling...' : 'Commit Stock Reconciliation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 9. MOVEMENT HISTORY & AUDIT LEDGER MODAL ─────────────────────── */}
            {historyIngredient && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                    onClick={() => setHistoryIngredient(null)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-indigo-700 px-6 py-4 text-white flex items-center justify-between flex-shrink-0">
                            <div>
                                <h3 className="text-base font-black flex items-center gap-2">
                                    <span>📜</span>
                                    <span>Stock Audit Ledger</span>
                                </h3>
                                <p className="text-xs text-indigo-200 mt-0.5">
                                    {CATEGORY_ICONS[historyIngredient.category] || '🧂'} {historyIngredient.product_name} ({historyIngredient.product_code})
                                </p>
                            </div>
                            <button
                                onClick={() => setHistoryIngredient(null)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Summary Badges Bar */}
                        <div className="grid grid-cols-4 gap-2 p-4 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                            <div className="p-2.5 bg-white rounded-xl text-center border border-gray-200 shadow-2xs">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Available</p>
                                <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">
                                    {historyIngredient.current_stock.toFixed(1)} {historyIngredient.base_unit}
                                </p>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl text-center border border-gray-200 shadow-2xs">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Purchased</p>
                                <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">
                                    +{historyIngredient.total_purchased.toFixed(1)}
                                </p>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl text-center border border-gray-200 shadow-2xs">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Issued</p>
                                <p className="text-sm font-black text-amber-700 font-mono mt-0.5">
                                    -{historyIngredient.total_issued.toFixed(1)}
                                </p>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl text-center border border-gray-200 shadow-2xs">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Asset Value</p>
                                <p className="text-sm font-black text-gray-900 font-mono mt-0.5">
                                    {fmt(historyIngredient.stock_value)}
                                </p>
                            </div>
                        </div>

                        {/* Timeline List */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
                            {historyLoading ? (
                                <div className="py-12 text-center">
                                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                    <p className="text-xs text-gray-500 font-medium">Fetching transaction trail...</p>
                                </div>
                            ) : history.length === 0 ? (
                                <div className="py-12 text-center text-gray-400">
                                    <p className="text-2xl mb-1">📋</p>
                                    <p className="text-xs font-bold text-gray-500">No stock movements recorded yet</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Incoming deliveries or kitchen issues will log here automatically.</p>
                                </div>
                            ) : (
                                history.map(h => (
                                    <div
                                        key={h.id}
                                        className="p-3 bg-white rounded-2xl border border-gray-200/80 shadow-2xs flex items-center justify-between gap-3 hover:border-gray-300 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                                                {h.typeIcon}
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${h.typeBg}`}>
                                                        {h.type}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-gray-400 font-bold">
                                                        {h.reference}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-700 font-medium mt-0.5 line-clamp-1">
                                                    {h.note}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-right flex-shrink-0">
                                            <p className={`text-xs font-black font-mono ${
                                                h.quantity > 0 ? 'text-emerald-700' : 'text-amber-800'
                                            }`}>
                                                {h.quantity > 0 ? `+${h.quantity}` : h.quantity} {h.unit}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                                {h.date ? new Date(h.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between flex-shrink-0 text-xs">
                            <span className="text-gray-500 font-medium">
                                Showing {history.length} transactions
                            </span>
                            <button
                                onClick={() => setHistoryIngredient(null)}
                                className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-100"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
