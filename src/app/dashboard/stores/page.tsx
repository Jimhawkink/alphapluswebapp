'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface StoreItem {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    current_stock: number;
    base_unit: string;
    purchase_unit: string;
    reorder_point: number;
    cost_per_base_unit: number;
    supplier_name: string;
    purchase_cost: number;
    pack_size: number;
    stock_value: number;
}

interface IssueRequest {
    id: number;
    request_no: string;
    requested_by: string;
    requested_at: string;
    issued_to: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Issued';
    approved_by: string | null;
    approved_at: string | null;
    notes: string | null;
    items: IssueRequestItem[];
}

interface IssueRequestItem {
    id?: number;
    request_id?: number;
    pid: number;
    product_name: string;
    base_unit: string;
    requested_qty: number;
    approved_qty: number | null;
    issued_qty: number | null;
    current_stock: number;
}

interface PurchaseArrival {
    purchase_id: number;
    purchase_no: string;
    purchase_date: string;
    supplier_name: string;
    grand_total: number;
    status: string;
    items: PurchaseArrivalItem[];
}

interface PurchaseArrivalItem {
    pp_id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit: string;
    rate: number;
    total_amount: number;
}

interface StockMovementRow {
    movement_id: number;
    movement_date: string;
    product_id: number;
    product_name: string;
    movement_type: string;
    quantity: number;
    unit: string;
    reference_no: string;
    reason: string;
    created_by: string;
    created_at: string;
}

// ─── Catalogs & Helpers ───────────────────────────────────────────────────────

const KITCHENS = [
    'Main Kitchen',
    'Bar & Beverage Counter',
    'Butchery Section',
    'Pastry & Bakery',
    'Rooftop Terrace Kitchen',
    'Cold Room Storage',
    'Banquets & Conference Hall',
    'Staff Cafeteria',
    'Room Service Prep',
];

const CATEGORY_ICONS: Record<string, string> = {
    'Meat & Poultry': '🥩',
    'Vegetables': '🥦',
    'Fruits': '🍎',
    'Dairy & Eggs': '🧀',
    'Dairy': '🧀',
    'Grains & Cereals': '🌾',
    'Spices & Herbs': '🌿',
    'Spices & Seasonings': '🌿',
    'Oils & Cooking Fats': '🫒',
    'Oils & Fats': '🫒',
    'Beverages': '🧃',
    'Beverages & Syrups': '🧃',
    'Dry Goods': '📦',
    'Dry Goods & Flour': '📦',
    'Seafood & Fish': '🐟',
    'Seafood': '🐟',
    'Bakery & Pastry': '🍞',
    'Bakery': '🍞',
    'Sauces & Condiments': '🥫',
    'Condiments': '🥫',
    'Packaging & Disposables': '🛍️',
    'Other': '🧂',
};

const TABS = [
    { id: 'stock', label: 'Store Inventory', icon: '🏪' },
    { id: 'requisition', label: 'Issue Requisition', icon: '📋' },
    { id: 'approvals', label: 'Approval Desk', icon: '✅' },
    { id: 'purchases', label: 'Goods Received (GRN)', icon: '📦' },
    { id: 'history', label: 'Audit Movements', icon: '📜' },
] as const;

type TabId = typeof TABS[number]['id'];
type StockFilter = 'all' | 'safe' | 'low' | 'out';
type SortField = 'stock_value' | 'current_stock' | 'product_name' | 'cost_per_base_unit';
type SortOrder = 'asc' | 'desc';

export default function StoresPage() {
    // ─── Active Tab & Core Data ────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<TabId>('stock');
    const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
    const [issueRequests, setIssueRequests] = useState<IssueRequest[]>([]);
    const [purchases, setPurchases] = useState<PurchaseArrival[]>([]);
    const [movements, setMovements] = useState<StockMovementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // ─── Filter & Search ───────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [stockFilter, setStockFilter] = useState<StockFilter>('all');
    const [sortField, setSortField] = useState<SortField>('stock_value');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // ─── Issue Requisition Form State ──────────────────────────────────────────
    const [issueKitchen, setIssueKitchen] = useState(KITCHENS[0]);
    const [issueNote, setIssueNote] = useState('');
    const [issueItems, setIssueItems] = useState<IssueRequestItem[]>([]);
    const [addSearch, setAddSearch] = useState('');
    const [addQty, setAddQty] = useState('');
    const [addSelected, setAddSelected] = useState<StoreItem | null>(null);

    // ─── Approvals Desk State ──────────────────────────────────────────────────
    const [selectedRequest, setSelectedRequest] = useState<IssueRequest | null>(null);
    const [approvalFilter, setApprovalFilter] = useState<'Pending' | 'All'>('Pending');

    // ─── Movement History State ────────────────────────────────────────────────
    const [historyFilter, setHistoryFilter] = useState('All');
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    // ─── Quick Actions Modals ──────────────────────────────────────────────────
    // 1. Quick Stock In
    const [showQuickInModal, setShowQuickInModal] = useState(false);
    const [quickInItem, setQuickInItem] = useState<StoreItem | null>(null);
    const [quickInQty, setQuickInQty] = useState('');
    const [quickInRef, setQuickInRef] = useState('');
    const [quickInNotes, setQuickInNotes] = useState('');

    // 2. Physical Stock Take Audit
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditTarget, setAuditTarget] = useState<StoreItem | null>(null);
    const [auditPhysicalQty, setAuditPhysicalQty] = useState('');
    const [auditReason, setAuditReason] = useState('Store Monthly Stock Take');
    const [auditNotes, setAuditNotes] = useState('');

    // Logged in user
    const [currentUser, setCurrentUser] = useState('Storekeeper / Manager');

    useEffect(() => {
        try {
            const u = localStorage.getItem('user');
            if (u) {
                const p = JSON.parse(u);
                setCurrentUser(p.name || p.user_name || 'Storekeeper / Manager');
            }
        } catch {}
    }, []);

    // Format Currency Helpers
    const fmt = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const fmtDec = (n: number | null | undefined) =>
        `Ksh ${(Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── Load Store Stock ──────────────────────────────────────────────────────
    const loadStock = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('products_ingredients')
                .select('*')
                .eq('active', true)
                .order('product_name');

            if (error) throw error;

            const items: StoreItem[] = (data || []).map((d: any) => {
                const stock = Number(d.current_stock) || 0;
                let costPerBase = Number(d.cost_per_base_unit) || Number(d.purchase_cost) || 0;
                if (costPerBase <= 0 && Number(d.price_per_pack) > 0 && Number(d.pack_size) > 0) {
                    costPerBase = Number(d.price_per_pack) / Number(d.pack_size);
                }
                const stockVal = stock * costPerBase;

                return {
                    pid: d.pid,
                    product_code: d.product_code || `ING-${String(d.pid).padStart(4, '0')}`,
                    product_name: d.product_name,
                    category: d.category || 'Dry Goods & Flour',
                    current_stock: stock,
                    base_unit: d.base_unit || 'KG',
                    purchase_unit: d.purchase_unit || 'Bag',
                    reorder_point: Number(d.reorder_point) || 10,
                    cost_per_base_unit: costPerBase,
                    supplier_name: d.supplier_name || 'Store Supplier',
                    purchase_cost: Number(d.purchase_cost) || costPerBase,
                    pack_size: Number(d.pack_size) || 1,
                    stock_value: stockVal,
                };
            });

            setStoreItems(items);
        } catch (err: any) {
            console.error('Error loading store stock:', err);
            toast.error('Failed to load store stock: ' + err.message);
        }
    }, []);

    // ─── Load Issue Requests ───────────────────────────────────────────────────
    const loadRequests = useCallback(async () => {
        try {
            let q = supabase
                .from('store_issue_requests')
                .select('*')
                .order('requested_at', { ascending: false })
                .limit(100);

            if (approvalFilter === 'Pending') {
                q = q.eq('status', 'Pending');
            }

            const { data: reqs, error } = await q;
            if (error) throw error;

            const reqIds = (reqs || []).map(r => r.id);
            const itemsMap: Record<number, IssueRequestItem[]> = {};

            if (reqIds.length > 0) {
                const { data: items } = await supabase
                    .from('store_issue_request_items')
                    .select('*')
                    .in('request_id', reqIds);

                (items || []).forEach((item: any) => {
                    if (!itemsMap[item.request_id]) itemsMap[item.request_id] = [];
                    itemsMap[item.request_id].push(item);
                });
            }

            setIssueRequests((reqs || []).map(r => ({ ...r, items: itemsMap[r.id] || [] })));
        } catch (err: any) {
            console.warn('Issue requests load warning:', err.message);
        }
    }, [approvalFilter]);

    // ─── Load Purchases Received (GRN) ─────────────────────────────────────────
    const loadPurchases = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('purchases')
                .select('purchase_id, purchase_no, purchase_date, supplier_name, grand_total, status')
                .order('purchase_id', { ascending: false })
                .limit(50);

            if (error) throw error;

            const pIds = (data || []).map(p => p.purchase_id);
            const itemsMap: Record<number, PurchaseArrivalItem[]> = {};

            if (pIds.length > 0) {
                const { data: pitems } = await supabase
                    .from('purchase_products')
                    .select('pp_id, product_id, product_name, quantity, unit, rate, total_amount, purchase_id')
                    .in('purchase_id', pIds);

                (pitems || []).forEach((item: any) => {
                    if (!itemsMap[item.purchase_id]) itemsMap[item.purchase_id] = [];
                    itemsMap[item.purchase_id].push(item);
                });
            }

            setPurchases((data || []).map(p => ({ ...p, items: itemsMap[p.purchase_id] || [] })));
        } catch (err: any) {
            console.warn('Purchases load warning:', err.message);
        }
    }, []);

    // ─── Load Movements Ledger ─────────────────────────────────────────────────
    const loadMovements = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('stock_movements')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setMovements(data || []);
        } catch (err: any) {
            console.warn('Movements load warning:', err.message);
        }
    }, []);

    // Load all
    const loadAllData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        await Promise.all([loadStock(), loadRequests(), loadPurchases(), loadMovements()]);

        setLoading(false);
        setRefreshing(false);
    }, [loadStock, loadRequests, loadPurchases, loadMovements]);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // ─── Generate Request Number ───────────────────────────────────────────────
    const genRequestNo = () => `SIR-${Date.now().toString().slice(-6)}`;

    // ─── Submit Requisition ───────────────────────────────────────────────────
    const submitIssueRequest = async () => {
        if (issueItems.length === 0) {
            toast.error('Add at least one ingredient to the requisition list');
            return;
        }

        setIsSaving(true);
        try {
            const reqNo = genRequestNo();
            const { data: req, error: reqErr } = await supabase
                .from('store_issue_requests')
                .insert({
                    request_no: reqNo,
                    requested_by: currentUser,
                    issued_to: issueKitchen,
                    status: 'Pending',
                    notes: issueNote.trim() || null,
                })
                .select()
                .single();

            if (reqErr) throw reqErr;

            const itemRows = issueItems.map(i => ({
                request_id: req.id,
                pid: i.pid,
                product_name: i.product_name,
                base_unit: i.base_unit,
                requested_qty: i.requested_qty,
                approved_qty: null,
                issued_qty: null,
                current_stock: i.current_stock,
            }));

            const { error: itemErr } = await supabase
                .from('store_issue_request_items')
                .insert(itemRows);

            if (itemErr) throw itemErr;

            toast.success(`Requisition ${reqNo} submitted for manager verification! 📋`);
            setIssueItems([]);
            setIssueNote('');
            setIssueKitchen(KITCHENS[0]);
            await loadRequests();
            setActiveTab('approvals');
        } catch (e: any) {
            toast.error(`Requisition failed: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Approve or Reject Request ─────────────────────────────────────────────
    const approveRequest = async (req: IssueRequest, approved: boolean) => {
        setIsSaving(true);
        try {
            const status = approved ? 'Approved' : 'Rejected';
            const { error } = await supabase
                .from('store_issue_requests')
                .update({
                    status,
                    approved_by: currentUser,
                    approved_at: new Date().toISOString(),
                })
                .eq('id', req.id);

            if (error) throw error;
            toast.success(approved ? `✅ Requisition ${req.request_no} Approved` : `❌ Requisition ${req.request_no} Rejected`);
            setSelectedRequest(null);
            await loadRequests();
        } catch (e: any) {
            toast.error(`Operation failed: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Issue Stock (Deduct Inventory & Write Audit) ──────────────────────────
    const issueStock = async (req: IssueRequest) => {
        setIsSaving(true);
        try {
            for (const item of req.items) {
                const qty = item.approved_qty ?? item.requested_qty;
                const { data: ing } = await supabase
                    .from('products_ingredients')
                    .select('current_stock, cost_per_base_unit')
                    .eq('pid', item.pid)
                    .single();

                const currentBal = Number(ing?.current_stock) || 0;
                const unitCost = Number(ing?.cost_per_base_unit) || 0;
                const newStock = Math.max(0, currentBal - qty);

                // 1. Deduct stock from products_ingredients
                await supabase
                    .from('products_ingredients')
                    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                    .eq('pid', item.pid);

                // 2. Write to stock_movements
                try {
                    await supabase.from('stock_movements').insert({
                        movement_date: new Date().toISOString().split('T')[0],
                        product_id: item.pid,
                        product_name: item.product_name,
                        movement_type: 'Kitchen Issue',
                        quantity: -qty,
                        unit: item.base_unit,
                        unit_cost: unitCost,
                        total_cost: qty * unitCost,
                        reference_no: req.request_no,
                        reference_type: 'Kitchen Issue',
                        reason: `Requisition to ${req.issued_to}`,
                        created_by: currentUser,
                        created_at: new Date().toISOString(),
                    });
                } catch (mvErr) {
                    console.warn('Audit movement warning:', mvErr);
                }

                // 3. Mark issued_qty on item row
                await supabase
                    .from('store_issue_request_items')
                    .update({ issued_qty: qty })
                    .eq('request_id', req.id)
                    .eq('pid', item.pid);
            }

            // 4. Update request status to 'Issued'
            await supabase
                .from('store_issue_requests')
                .update({ status: 'Issued' })
                .eq('id', req.id);

            toast.success(`📦 Stock successfully issued to ${req.issued_to}!`);
            setSelectedRequest(null);
            await Promise.all([loadStock(), loadRequests(), loadMovements()]);
        } catch (e: any) {
            toast.error(`Failed to issue stock: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Quick Stock In Handler ───────────────────────────────────────────────
    const handleQuickStockIn = async () => {
        if (!quickInItem) return;
        const qty = parseFloat(quickInQty);
        if (!qty || qty <= 0) {
            toast.error('Enter a valid received quantity (> 0)');
            return;
        }

        setIsSaving(true);
        try {
            const newStock = quickInItem.current_stock + qty;
            await supabase
                .from('products_ingredients')
                .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                .eq('pid', quickInItem.pid);

            try {
                await supabase.from('stock_movements').insert({
                    movement_date: new Date().toISOString().split('T')[0],
                    product_id: quickInItem.pid,
                    product_name: quickInItem.product_name,
                    product_code: quickInItem.product_code,
                    movement_type: 'Purchase Received',
                    quantity: qty,
                    unit: quickInItem.base_unit,
                    unit_cost: quickInItem.cost_per_base_unit,
                    total_cost: qty * quickInItem.cost_per_base_unit,
                    reference_no: quickInRef.trim() || 'GOODS-IN',
                    reason: quickInNotes.trim() || `Delivery of ${qty} ${quickInItem.base_unit}`,
                    created_by: currentUser,
                    created_at: new Date().toISOString(),
                });
            } catch {}

            toast.success(`Received +${qty} ${quickInItem.base_unit} of ${quickInItem.product_name}! 📥`);
            setShowQuickInModal(false);
            setQuickInItem(null);
            setQuickInQty('');
            setQuickInRef('');
            setQuickInNotes('');
            await Promise.all([loadStock(), loadMovements()]);
        } catch (err: any) {
            toast.error('Stock in failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Stock Take Reconciliation Handler ────────────────────────────────────
    const handleStockAudit = async () => {
        if (!auditTarget) return;
        const counted = parseFloat(auditPhysicalQty);
        if (isNaN(counted) || counted < 0) {
            toast.error('Enter a valid physical count (>= 0)');
            return;
        }

        const variance = counted - auditTarget.current_stock;
        setIsSaving(true);
        try {
            await supabase
                .from('products_ingredients')
                .update({ current_stock: counted, updated_at: new Date().toISOString() })
                .eq('pid', auditTarget.pid);

            try {
                await supabase.from('stock_movements').insert({
                    movement_date: new Date().toISOString().split('T')[0],
                    product_id: auditTarget.pid,
                    product_name: auditTarget.product_name,
                    product_code: auditTarget.product_code,
                    movement_type: variance >= 0 ? 'Stock Adjustment (Surplus)' : 'Stock Adjustment (Shrinkage)',
                    quantity: variance,
                    unit: auditTarget.base_unit,
                    unit_cost: auditTarget.cost_per_base_unit,
                    total_cost: Math.abs(variance) * auditTarget.cost_per_base_unit,
                    reference_no: `AUDIT-${Date.now().toString().slice(-6)}`,
                    reason: `${auditReason} • System: ${auditTarget.current_stock} -> Physical: ${counted} (Variance: ${variance > 0 ? '+' : ''}${variance} ${auditTarget.base_unit})`,
                    created_by: currentUser,
                    created_at: new Date().toISOString(),
                });
            } catch {}

            toast.success(`Store inventory reconciled! Count set to ${counted} ${auditTarget.base_unit} ⚖️`);
            setShowAuditModal(false);
            setAuditTarget(null);
            await Promise.all([loadStock(), loadMovements()]);
        } catch (err: any) {
            toast.error('Audit failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Export CSV ───────────────────────────────────────────────────────────
    const exportCSV = () => {
        if (storeItems.length === 0) {
            toast.error('No items to export');
            return;
        }

        const headers = [
            'Item Code',
            'Ingredient Name',
            'Category',
            'Current Stock',
            'Base Unit',
            'Unit Cost (KES)',
            'Stock Valuation (KES)',
            'Reorder Threshold',
            'Supplier',
            'Status'
        ];

        const rows = filteredStock.map(i => [
            `"${i.product_code}"`,
            `"${i.product_name.replace(/"/g, '""')}"`,
            `"${i.category}"`,
            i.current_stock.toFixed(2),
            `"${i.base_unit}"`,
            i.cost_per_base_unit.toFixed(2),
            i.stock_value.toFixed(2),
            i.reorder_point,
            `"${(i.supplier_name || '').replace(/"/g, '""')}"`,
            i.current_stock <= 0 ? '"OUT OF STOCK"' : i.current_stock <= i.reorder_point ? '"LOW STOCK"' : '"SAFE"'
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `store_inventory_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Store stock CSV exported! 📄');
    };

    // ─── Computed Filters & KPIs ──────────────────────────────────────────────
    const categoriesList = useMemo(() => {
        const set = new Set(storeItems.map(i => i.category).filter(Boolean));
        return Array.from(set).sort();
    }, [storeItems]);

    const filteredStock = useMemo(() => {
        return storeItems.filter(i => {
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                const matchName = i.product_name.toLowerCase().includes(q);
                const matchCode = i.product_code.toLowerCase().includes(q);
                const matchSup = (i.supplier_name || '').toLowerCase().includes(q);
                if (!matchName && !matchCode && !matchSup) return false;
            }

            if (categoryFilter !== 'All' && i.category !== categoryFilter) return false;

            if (stockFilter === 'safe' && i.current_stock <= i.reorder_point) return false;
            if (stockFilter === 'low' && (i.current_stock <= 0 || i.current_stock > i.reorder_point)) return false;
            if (stockFilter === 'out' && i.current_stock > 0) return false;

            return true;
        });
    }, [storeItems, search, categoryFilter, stockFilter]);

    const sortedStock = useMemo(() => {
        return [...filteredStock].sort((a, b) => {
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
    }, [filteredStock, sortField, sortOrder]);

    const pendingCount = issueRequests.filter(r => r.status === 'Pending').length;
    const lowStockCount = storeItems.filter(i => i.current_stock <= i.reorder_point && i.current_stock > 0).length;
    const outCount = storeItems.filter(i => i.current_stock <= 0).length;
    const safeCount = storeItems.filter(i => i.current_stock > i.reorder_point).length;
    const totalStoreValue = storeItems.reduce((sum, i) => sum + i.stock_value, 0);

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans">
            {/* ── 1. ULTRA EXECUTIVE HEADER ─────────────────────────────────────── */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-2xl flex items-center justify-center text-white text-3xl shadow-md shadow-indigo-100 flex-shrink-0">
                        🏪
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                                Central Stores &amp; Kitchen Requisitions
                            </h1>
                            <span className="px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                                Central Warehouse Active
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Live inventory control, kitchen department requisitions, manager verification, goods receipt &amp; movement ledgers.
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Refresh */}
                    <button
                        onClick={() => loadAllData(true)}
                        disabled={refreshing || loading}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        title="Reload inventory database"
                    >
                        <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                        <span>{refreshing ? 'Syncing...' : 'Sync'}</span>
                    </button>

                    {/* Export CSV */}
                    <button
                        onClick={exportCSV}
                        className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1.5"
                        title="Download CSV report"
                    >
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>

                    {/* New Purchase Order Link */}
                    <Link
                        href="/dashboard/purchase"
                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl text-xs font-black border border-emerald-200 transition-all flex items-center gap-1.5"
                    >
                        <span>📦</span>
                        <span>New PO / Delivery →</span>
                    </Link>

                    {/* Quick Requisition Trigger */}
                    <button
                        onClick={() => setActiveTab('requisition')}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md shadow-indigo-200 hover:-translate-y-0.5"
                    >
                        <span>📋</span>
                        <span>Create Kitchen Requisition</span>
                    </button>
                </div>
            </div>

            {/* ── 2. EXECUTIVE METRIC KPI CARDS ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* 1. Store Asset Value */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-gray-500 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700">💎 Total Store Asset</span>
                        <span className="text-base">💰</span>
                    </div>
                    <p className="text-xl font-black text-gray-900 tracking-tight">
                        {fmt(totalStoreValue)}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">Based on unit purchase cost</p>
                </div>

                {/* 2. Total SKUs */}
                <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-gray-500 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">📦 Total SKUs</span>
                        <span className="text-base">🧂</span>
                    </div>
                    <p className="text-xl font-black text-gray-900 tracking-tight">
                        {storeItems.length} <span className="text-xs text-gray-400 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">Across {categoriesList.length} categories</p>
                </div>

                {/* 3. Pending Approvals */}
                <div className={`rounded-2xl p-4 border shadow-xs relative overflow-hidden ${
                    pendingCount > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-gray-200/80'
                }`}>
                    <div className="flex items-center justify-between text-amber-800 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">⏳ Pending Approvals</span>
                        <span className="text-base">📋</span>
                    </div>
                    <p className={`text-xl font-black tracking-tight ${pendingCount > 0 ? 'text-amber-800' : 'text-gray-900'}`}>
                        {pendingCount} <span className="text-xs font-semibold">requests</span>
                    </p>
                    <p className="text-[10px] text-amber-700 font-medium mt-1">Awaiting manager sign-off</p>
                </div>

                {/* 4. Safe Level */}
                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-emerald-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🟢 Optimal Stock</span>
                        <span className="text-base">✅</span>
                    </div>
                    <p className="text-xl font-black text-emerald-700 tracking-tight">
                        {safeCount} <span className="text-xs text-emerald-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium mt-1">Above safety reorder level</p>
                </div>

                {/* 5. Low Stock */}
                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-amber-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🟡 Reorder Warning</span>
                        <span className="text-base">⚠️</span>
                    </div>
                    <p className="text-xl font-black text-amber-700 tracking-tight">
                        {lowStockCount} <span className="text-xs text-amber-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-amber-600 font-medium mt-1">At or near safety threshold</p>
                </div>

                {/* 6. Stockout Alert */}
                <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-xs relative overflow-hidden">
                    <div className="flex items-center justify-between text-red-700 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider">🔴 Stockout Alert</span>
                        <span className="text-base">🚫</span>
                    </div>
                    <p className="text-xl font-black text-red-700 tracking-tight">
                        {outCount} <span className="text-xs text-red-600 font-semibold">items</span>
                    </p>
                    <p className="text-[10px] text-red-600 font-medium mt-1">Requires purchase delivery</p>
                </div>
            </div>

            {/* ── 3. LUXURY TAB NAVIGATION BAR ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-1.5 border border-gray-200/80 shadow-xs flex items-center gap-1.5 overflow-x-auto">
                {TABS.map(tab => {
                    const isActive = activeTab === tab.id;
                    const showBadge = tab.id === 'approvals' && pendingCount > 0;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 min-w-[170px] py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 relative ${
                                isActive
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                            {showBadge && (
                                <span className="ml-1 bg-amber-400 text-gray-950 text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse shadow-xs">
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── 4. TAB 1: CENTRAL STORE INVENTORY ────────────────────────────── */}
            {activeTab === 'stock' && (
                <div className="space-y-4">
                    {/* Toolbar */}
                    <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-sm space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3">
                            {/* Search Field (5 cols) */}
                            <div className="md:col-span-5 relative">
                                <span className="absolute left-3.5 top-3 text-gray-400 text-sm">🔍</span>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search item name, code (ING-001), supplier..."
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

                            {/* Category Filter (4 cols) */}
                            <div className="md:col-span-4">
                                <select
                                    value={categoryFilter}
                                    onChange={e => setCategoryFilter(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                                >
                                    <option value="All">All Categories ({storeItems.length} SKUs)</option>
                                    {categoriesList.map(c => {
                                        const count = storeItems.filter(i => i.category === c).length;
                                        return (
                                            <option key={c} value={c}>
                                                {CATEGORY_ICONS[c] || '🧂'} {c} ({count})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {/* Sort Selector (3 cols) */}
                            <div className="md:col-span-3">
                                <select
                                    value={`${sortField}_${sortOrder}`}
                                    onChange={e => {
                                        const [f, o] = e.target.value.split('_') as [SortField, SortOrder];
                                        setSortField(f);
                                        setSortOrder(o);
                                    }}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                                >
                                    <option value="stock_value_desc">Total Valuation (High → Low)</option>
                                    <option value="stock_value_asc">Total Valuation (Low → High)</option>
                                    <option value="current_stock_asc">Available Stock (Lowest First)</option>
                                    <option value="current_stock_desc">Available Stock (Highest First)</option>
                                    <option value="product_name_asc">Name (A → Z)</option>
                                    <option value="cost_per_base_unit_desc">Unit Cost (High → Low)</option>
                                </select>
                            </div>
                        </div>

                        {/* Status Filter Pills */}
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
                                    All Items ({storeItems.length})
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
                                    <span>Optimal Stock ({safeCount})</span>
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
                                    <span>Low Stock Alert ({lowStockCount})</span>
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
                                    <span>Stockouts ({outCount})</span>
                                </button>
                            </div>

                            <span className="text-xs font-semibold text-gray-500">
                                Showing <strong className="text-gray-900 font-black">{sortedStock.length}</strong> of {storeItems.length} items
                            </span>
                        </div>
                    </div>

                    {/* Stock Table */}
                    <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                        {loading ? (
                            <div className="py-24 text-center">
                                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                <p className="text-sm font-bold text-gray-700">Loading store inventory...</p>
                            </div>
                        ) : sortedStock.length === 0 ? (
                            <div className="py-24 text-center px-4">
                                <span className="text-5xl block mb-3">📭</span>
                                <h3 className="text-lg font-black text-gray-800">No Store Items Found</h3>
                                <p className="text-xs text-gray-500 mt-1">Try resetting your search or filter options.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/90 border-b border-gray-200 text-[11px] font-black uppercase tracking-wider text-slate-600 select-none">
                                            <th className="py-4 px-4 text-left">Code &amp; Raw Material</th>
                                            <th className="py-4 px-3 text-left">Category</th>
                                            <th className="py-4 px-3 text-center">Available Stock</th>
                                            <th className="py-4 px-3 text-left">Safety Level</th>
                                            <th className="py-4 px-3 text-right">Cost / Unit</th>
                                            <th className="py-4 px-3 text-right">Stock Valuation</th>
                                            <th className="py-4 px-3 text-left">Supplier</th>
                                            <th className="py-4 px-4 text-center">Store Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-xs">
                                        {sortedStock.map((item, idx) => {
                                            const icon = CATEGORY_ICONS[item.category] || '🧂';
                                            const isOut = item.current_stock <= 0;
                                            const isLow = item.current_stock <= item.reorder_point;

                                            return (
                                                <tr
                                                    key={item.pid}
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
                                                                <p className="font-black text-gray-900 text-sm">
                                                                    {item.product_name}
                                                                </p>
                                                                <p className="font-mono text-[11px] font-bold text-indigo-700 mt-0.5">
                                                                    {item.product_code}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Column 2: Category */}
                                                    <td className="py-3.5 px-3">
                                                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
                                                            {item.category}
                                                        </span>
                                                    </td>

                                                    {/* Column 3: In Store Available */}
                                                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                                        <span className={`text-sm font-black font-mono ${
                                                            isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'
                                                        }`}>
                                                            {item.current_stock.toLocaleString('en-KE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-bold ml-1 uppercase">
                                                            {item.base_unit}
                                                        </span>
                                                    </td>

                                                    {/* Column 4: Safety Level Health Bar */}
                                                    <td className="py-3.5 px-3 min-w-[130px]">
                                                        <div>
                                                            <div className="flex items-center justify-between text-[10px] mb-1">
                                                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                                                    isOut ? 'bg-red-50 text-red-700' : isLow ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                                                                }`}>
                                                                    {isOut ? 'Out' : isLow ? 'Low' : 'Safe'}
                                                                </span>
                                                                <span className="text-gray-400 font-mono">
                                                                    Min: {item.reorder_point} {item.base_unit}
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${
                                                                        isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                                                                    }`}
                                                                    style={{ width: `${Math.min(100, (item.current_stock / (item.reorder_point * 2 || 20)) * 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Column 5: Unit Cost */}
                                                    <td className="py-3.5 px-3 text-right whitespace-nowrap font-mono">
                                                        <p className="font-bold text-gray-800 text-xs">
                                                            {fmtDec(item.cost_per_base_unit)}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 font-medium">
                                                            per {item.base_unit}
                                                        </p>
                                                    </td>

                                                    {/* Column 6: Stock Valuation */}
                                                    <td className="py-3.5 px-3 text-right whitespace-nowrap font-mono">
                                                        <p className="font-black text-indigo-700 text-xs">
                                                            {fmt(item.stock_value)}
                                                        </p>
                                                    </td>

                                                    {/* Column 7: Supplier */}
                                                    <td className="py-3.5 px-3 text-gray-600 text-xs truncate max-w-[150px]">
                                                        {item.supplier_name || 'Standard Store'}
                                                    </td>

                                                    {/* Column 8: Store Actions */}
                                                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {/* Quick Receive */}
                                                            <button
                                                                onClick={() => {
                                                                    setQuickInItem(item);
                                                                    setQuickInQty('');
                                                                    setQuickInRef(`IN-${Date.now().toString().slice(-4)}`);
                                                                    setQuickInNotes('');
                                                                    setShowQuickInModal(true);
                                                                }}
                                                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-black border border-emerald-200 transition-colors"
                                                                title="Receive Stock"
                                                            >
                                                                📥 +In
                                                            </button>

                                                            {/* Reconcile Audit */}
                                                            <button
                                                                onClick={() => {
                                                                    setAuditTarget(item);
                                                                    setAuditPhysicalQty(String(item.current_stock));
                                                                    setAuditReason('Physical Store Count Reconciliation');
                                                                    setAuditNotes('');
                                                                    setShowAuditModal(true);
                                                                }}
                                                                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs transition-colors"
                                                                title="Stock Take Audit"
                                                            >
                                                                ⚖️
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
                </div>
            )}

            {/* ── 5. TAB 2: KITCHEN REQUISITION CREATOR ────────────────────────── */}
            {activeTab === 'requisition' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Requisition Form (7 cols) */}
                    <div className="lg:col-span-7 bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col justify-between">
                        <div>
                            <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-xl">📋</span>
                                    <div>
                                        <h3 className="font-black text-gray-900 text-sm">New Kitchen Requisition Voucher</h3>
                                        <p className="text-[11px] text-gray-500">Requires manager review &amp; verification before store release</p>
                                    </div>
                                </div>
                                <span className="text-xs font-mono font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                                    Auto: SIR-XXXX
                                </span>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Requisition For (Kitchen Station) <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={issueKitchen}
                                            onChange={e => setIssueKitchen(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none cursor-pointer"
                                        >
                                            {KITCHENS.map(k => (
                                                <option key={k} value={k}>🍳 {k}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Requisition By (Staff Name)
                                        </label>
                                        <input
                                            type="text"
                                            value={currentUser}
                                            readOnly
                                            className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 outline-none"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Culinary Purpose / Event Reason
                                        </label>
                                        <input
                                            type="text"
                                            value={issueNote}
                                            onChange={e => setIssueNote(e.target.value)}
                                            placeholder="e.g. Daily lunch prep, banquet dinner, weekend buffet replenishment..."
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Requisition Basket Table */}
                                <div className="pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">
                                            Requested Raw Materials ({issueItems.length})
                                        </h4>
                                        <span className="text-[11px] text-gray-400">
                                            Pick ingredients from the selector on the right →
                                        </span>
                                    </div>

                                    {issueItems.length === 0 ? (
                                        <div className="border-2 border-dashed border-gray-200 rounded-2xl py-12 text-center text-gray-400">
                                            <span className="text-4xl block mb-2">📦</span>
                                            <p className="text-xs font-bold text-gray-600">No ingredients in requisition basket</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">Search and click items from the right panel to add them</p>
                                        </div>
                                    ) : (
                                        <div className="border border-gray-200 rounded-2xl overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500">
                                                    <tr>
                                                        <th className="px-3.5 py-2.5">Item</th>
                                                        <th className="px-3 py-2.5 text-center">In Store</th>
                                                        <th className="px-3 py-2.5 text-center">Request Qty</th>
                                                        <th className="px-3 py-2.5 text-center">Unit</th>
                                                        <th className="px-3 py-2.5 text-center"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 text-xs">
                                                    {issueItems.map((item, idx) => {
                                                        const isOver = item.requested_qty > item.current_stock;
                                                        return (
                                                            <tr key={idx} className={isOver ? 'bg-red-50/50' : ''}>
                                                                <td className="px-3.5 py-2.5 font-bold text-gray-800">
                                                                    {item.product_name}
                                                                    {isOver && (
                                                                        <span className="ml-1 text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.2 rounded">
                                                                            Exceeds Stock
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center font-mono text-gray-600">
                                                                    {item.current_stock}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center">
                                                                    <input
                                                                        type="number"
                                                                        value={item.requested_qty}
                                                                        min="0.1"
                                                                        step="0.01"
                                                                        onChange={e => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            setIssueItems(prev => prev.map((x, i) => i === idx ? { ...x, requested_qty: val } : x));
                                                                        }}
                                                                        className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-center font-mono font-bold text-gray-900 focus:border-indigo-500 outline-none"
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center font-semibold text-gray-500">
                                                                    {item.base_unit}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center">
                                                                    <button
                                                                        onClick={() => setIssueItems(prev => prev.filter((_, i) => i !== idx))}
                                                                        className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold inline-flex items-center justify-center transition-colors"
                                                                        title="Remove item"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="p-6 bg-gray-50/80 border-t border-gray-200">
                            <button
                                onClick={submitIssueRequest}
                                disabled={isSaving || issueItems.length === 0}
                                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-2xl font-black text-xs shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <span>{isSaving ? '⏳' : '📤'}</span>
                                <span>{isSaving ? 'Submitting Voucher...' : 'Submit Requisition for Manager Sign-Off'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Right Item Selector Panel (5 cols) */}
                    <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h3 className="font-black text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2">
                                <span>🔍</span> Store Inventory Browser
                            </h3>
                            <span className="text-[11px] text-gray-400 font-bold">{storeItems.length} items</span>
                        </div>

                        <div className="p-4 space-y-3 flex-1 flex flex-col">
                            <input
                                type="text"
                                value={addSearch}
                                onChange={e => setAddSearch(e.target.value)}
                                placeholder="Search ingredients to add..."
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                            />

                            <div className="overflow-y-auto max-h-[380px] space-y-1.5 flex-1 pr-1">
                                {storeItems
                                    .filter(i => !addSearch || i.product_name.toLowerCase().includes(addSearch.toLowerCase()) || i.product_code.toLowerCase().includes(addSearch.toLowerCase()))
                                    .map(item => {
                                        const alreadyAdded = issueItems.some(x => x.pid === item.pid);
                                        const isSelected = addSelected?.pid === item.pid;
                                        const icon = CATEGORY_ICONS[item.category] || '🧂';

                                        return (
                                            <div
                                                key={item.pid}
                                                onClick={() => !alreadyAdded && setAddSelected(item)}
                                                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                                                    alreadyAdded
                                                        ? 'opacity-40 bg-gray-50 border-gray-200 cursor-not-allowed'
                                                        : isSelected
                                                        ? 'bg-indigo-50 border-indigo-300 shadow-2xs'
                                                        : 'hover:bg-gray-50 border-gray-200/80'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-base">{icon}</span>
                                                        <div>
                                                            <p className="font-bold text-gray-900 text-xs">{item.product_name}</p>
                                                            <p className="text-[10px] text-gray-400 font-mono">{item.product_code} • {item.category}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-xs font-black font-mono ${
                                                            item.current_stock <= 0 ? 'text-red-600' : item.current_stock <= item.reorder_point ? 'text-amber-600' : 'text-emerald-700'
                                                        }`}>
                                                            {item.current_stock} {item.base_unit}
                                                        </p>
                                                        {alreadyAdded && <span className="text-[9px] font-black text-indigo-600 uppercase">Added</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* Add Item Action Bar */}
                            {addSelected && (
                                <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200 space-y-2 pt-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-black text-indigo-950">{addSelected.product_name}</span>
                                        <span className="text-indigo-700 font-bold font-mono">Available: {addSelected.current_stock} {addSelected.base_unit}</span>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="number"
                                            value={addQty}
                                            onChange={e => setAddQty(e.target.value)}
                                            placeholder="Quantity"
                                            min="0.1"
                                            step="0.01"
                                            className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-black font-mono text-gray-900 focus:outline-none focus:border-indigo-500"
                                        />
                                        <span className="text-xs font-bold text-indigo-900">{addSelected.base_unit}</span>
                                        <button
                                            onClick={() => {
                                                const q = parseFloat(addQty);
                                                if (!q || q <= 0) {
                                                    toast.error('Enter a valid quantity');
                                                    return;
                                                }
                                                setIssueItems(prev => [
                                                    ...prev,
                                                    {
                                                        pid: addSelected.pid,
                                                        product_name: addSelected.product_name,
                                                        base_unit: addSelected.base_unit,
                                                        requested_qty: q,
                                                        approved_qty: null,
                                                        issued_qty: null,
                                                        current_stock: addSelected.current_stock,
                                                    }
                                                ]);
                                                setAddSelected(null);
                                                setAddQty('');
                                                toast.success(`Added ${addSelected.product_name} to basket`);
                                            }}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all"
                                        >
                                            Add to List
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── 6. TAB 3: MANAGER APPROVAL DESK ──────────────────────────────── */}
            {activeTab === 'approvals' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Requisitions List (5 cols) */}
                    <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h3 className="font-black text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2">
                                <span>📋</span> Requisition Vouchers
                            </h3>
                            <div className="flex p-0.5 bg-gray-200/70 rounded-xl">
                                {(['Pending', 'All'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => {
                                            setApprovalFilter(f);
                                            loadRequests();
                                        }}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                            approvalFilter === f ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                                        }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="divide-y divide-gray-100 max-h-[550px] overflow-y-auto">
                            {issueRequests.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <span className="text-4xl block mb-2">📭</span>
                                    <p className="text-xs font-bold text-gray-600">No requisitions found</p>
                                </div>
                            ) : (
                                issueRequests.map(req => {
                                    const isSelected = selectedRequest?.id === req.id;
                                    return (
                                        <div
                                            key={req.id}
                                            onClick={() => setSelectedRequest(req)}
                                            className={`p-4 cursor-pointer transition-all ${
                                                isSelected ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-mono font-black text-indigo-700">{req.request_no}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                    req.status === 'Pending'
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : req.status === 'Approved'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : req.status === 'Issued'
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {req.status}
                                                </span>
                                            </div>
                                            <p className="text-xs font-black text-gray-900">→ {req.issued_to}</p>
                                            <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
                                                <span>By {req.requested_by}</span>
                                                <span>{req.items.length} items</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Detailed Review & Issue Action Panel (7 cols) */}
                    <div className="lg:col-span-7 bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col justify-between">
                        {selectedRequest ? (
                            <div>
                                <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-gray-400">Requisition Review</p>
                                        <h3 className="text-base font-black text-gray-900 font-mono">{selectedRequest.request_no}</h3>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Target Station</p>
                                        <p className="text-xs font-black text-gray-800">🍳 {selectedRequest.issued_to}</p>
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    {selectedRequest.notes && (
                                        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900">
                                            <strong>Note:</strong> {selectedRequest.notes}
                                        </div>
                                    )}

                                    <div className="border border-gray-200 rounded-2xl overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500">
                                                <tr>
                                                    <th className="px-3.5 py-2.5">Item</th>
                                                    <th className="px-3 py-2.5 text-center">In Store</th>
                                                    <th className="px-3 py-2.5 text-center">Requested</th>
                                                    <th className="px-3 py-2.5 text-center">Approved Qty</th>
                                                    <th className="px-3 py-2.5 text-center">Issued Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 text-xs">
                                                {selectedRequest.items.map((item, idx) => {
                                                    const overStock = item.requested_qty > item.current_stock;
                                                    return (
                                                        <tr key={idx} className={overStock ? 'bg-red-50/40' : ''}>
                                                            <td className="px-3.5 py-2.5 font-bold text-gray-900">
                                                                {item.product_name}
                                                                {overStock && <span className="ml-1 text-[9px] text-red-600 font-black">Low</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center font-mono text-gray-600">
                                                                {item.current_stock} {item.base_unit}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center font-bold text-gray-900 font-mono">
                                                                {item.requested_qty} {item.base_unit}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                {selectedRequest.status === 'Pending' ? (
                                                                    <input
                                                                        type="number"
                                                                        defaultValue={Math.min(item.requested_qty, item.current_stock)}
                                                                        min="0"
                                                                        step="0.01"
                                                                        onChange={e => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            setSelectedRequest(prev => prev ? {
                                                                                ...prev,
                                                                                items: prev.items.map((x, i) => i === idx ? { ...x, approved_qty: val } : x)
                                                                            } : prev);
                                                                        }}
                                                                        className="w-20 px-2 py-1 bg-white border border-gray-300 rounded-lg text-center font-mono font-bold text-blue-700 focus:outline-none"
                                                                    />
                                                                ) : (
                                                                    <span className="font-bold text-blue-700 font-mono">
                                                                        {item.approved_qty ?? '—'} {item.base_unit}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center font-bold text-emerald-700 font-mono">
                                                                {item.issued_qty != null ? `${item.issued_qty} ${item.base_unit}` : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Review Actions */}
                                <div className="p-6 bg-gray-50 border-t border-gray-200">
                                    {selectedRequest.status === 'Pending' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => approveRequest(selectedRequest, false)}
                                                disabled={isSaving}
                                                className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs transition-all disabled:opacity-50"
                                            >
                                                ❌ Reject Requisition
                                            </button>
                                            <button
                                                onClick={() => approveRequest(selectedRequest, true)}
                                                disabled={isSaving}
                                                className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs transition-all disabled:opacity-50 shadow-md shadow-blue-100"
                                            >
                                                ✅ Approve Requisition
                                            </button>
                                        </div>
                                    )}

                                    {selectedRequest.status === 'Approved' && (
                                        <button
                                            onClick={() => issueStock(selectedRequest)}
                                            disabled={isSaving}
                                            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl font-black text-xs shadow-md shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            <span>{isSaving ? '⏳' : '📦'}</span>
                                            <span>{isSaving ? 'Deducting Inventory...' : `Release & Deduct Stock to ${selectedRequest.issued_to}`}</span>
                                        </button>
                                    )}

                                    {selectedRequest.status === 'Issued' && (
                                        <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs font-bold text-emerald-800 text-center">
                                            ✓ Stock successfully deducted and issued to {selectedRequest.issued_to}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                                <span className="text-5xl mb-3">👈</span>
                                <p className="text-xs font-bold text-gray-600">Select a requisition voucher on the left to review</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── 7. TAB 4: PURCHASES & GOODS RECEIVED (GRN) ───────────────────── */}
            {activeTab === 'purchases' && (
                <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <div>
                            <h3 className="font-black text-gray-800 text-sm">Goods Received Notes (GRN) &amp; Deliveries</h3>
                            <p className="text-xs text-gray-500">Inward inventory shipments from approved vendors</p>
                        </div>
                        <Link
                            href="/dashboard/purchase"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                        >
                            + Record New Delivery
                        </Link>
                    </div>

                    <div className="divide-y divide-gray-100 max-h-[550px] overflow-y-auto">
                        {purchases.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <span className="text-4xl block mb-2">📭</span>
                                <p className="text-xs font-bold text-gray-600">No goods receipts found</p>
                            </div>
                        ) : (
                            purchases.map(p => (
                                <details key={p.purchase_id} className="group">
                                    <summary className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-all list-none">
                                        <span className="text-gray-400 group-open:rotate-90 transition-transform">▶</span>
                                        <div className="flex-1 flex items-center justify-between flex-wrap gap-2">
                                            <div>
                                                <p className="font-mono text-xs font-black text-indigo-700">{p.purchase_no}</p>
                                                <p className="text-[11px] text-gray-400 font-medium">{p.purchase_date}</p>
                                            </div>
                                            <p className="font-bold text-gray-900 text-xs">🏢 {p.supplier_name}</p>
                                            <div className="flex items-center gap-3">
                                                <span className="font-black text-gray-900 font-mono text-xs">{fmt(p.grand_total)}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    p.status === 'Received' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {p.status}
                                                </span>
                                            </div>
                                        </div>
                                    </summary>

                                    <div className="px-6 pb-4">
                                        <table className="w-full border border-gray-200 rounded-xl overflow-hidden text-xs">
                                            <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500">
                                                <tr>
                                                    <th className="px-3.5 py-2">Item</th>
                                                    <th className="px-3 py-2 text-right">Delivered Qty</th>
                                                    <th className="px-3 py-2 text-right">Unit Rate</th>
                                                    <th className="px-3.5 py-2 text-right">Total (KES)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {p.items.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        <td className="px-3.5 py-2 font-bold text-gray-800">{item.product_name}</td>
                                                        <td className="px-3 py-2 text-right font-mono">{item.quantity} {item.unit}</td>
                                                        <td className="px-3 py-2 text-right font-mono">{fmtDec(item.rate)}</td>
                                                        <td className="px-3.5 py-2 text-right font-mono font-bold text-indigo-700">{fmt(item.total_amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ── 8. TAB 5: AUDIT MOVEMENTS LEDGER ─────────────────────────────── */}
            {activeTab === 'history' && (
                <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h3 className="font-black text-gray-800 text-sm">Store Stock Movements Audit Ledger</h3>
                            <p className="text-xs text-gray-500">Chronological transaction record of all issues, receipts &amp; count adjustments</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white font-medium"
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white font-medium"
                            />
                        </div>
                    </div>

                    <div className="divide-y divide-gray-100 max-h-[550px] overflow-y-auto">
                        {movements.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <span className="text-4xl block mb-2">📋</span>
                                <p className="text-xs font-bold text-gray-600">No stock movements logged</p>
                            </div>
                        ) : (
                            movements.map(m => (
                                <div key={m.movement_id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                                            {m.movement_type.includes('Issue') ? '🍳' : m.movement_type.includes('Purchase') ? '🛒' : '⚖️'}
                                        </span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-gray-900 text-xs">{m.product_name}</span>
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-gray-100 text-gray-600">
                                                    {m.movement_type}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5">{m.reason || m.reference_no}</p>
                                        </div>
                                    </div>

                                    <div className="text-right flex-shrink-0">
                                        <p className={`font-mono text-xs font-black ${m.quantity > 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {m.unit}
                                        </p>
                                        <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
                                            {m.movement_date || (m.created_at ? m.created_at.split('T')[0] : '')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ── 9. QUICK STOCK IN MODAL ──────────────────────────────────────── */}
            {showQuickInModal && quickInItem && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-emerald-600 px-6 py-4 text-white flex items-center justify-between">
                            <h3 className="text-sm font-black flex items-center gap-2">
                                <span>📥</span> Receive Goods Delivery
                            </h3>
                            <button
                                onClick={() => setShowQuickInModal(false)}
                                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
                                <p className="font-bold text-gray-900 text-xs">{quickInItem.product_name}</p>
                                <p className="text-[11px] text-gray-500 font-mono">Current Balance: {quickInItem.current_stock} {quickInItem.base_unit}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Quantity Received ({quickInItem.base_unit})
                                </label>
                                <input
                                    type="number"
                                    value={quickInQty}
                                    onChange={e => setQuickInQty(e.target.value)}
                                    min="0.1"
                                    step="0.01"
                                    placeholder="e.g. 20"
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black font-mono text-gray-900 focus:bg-white focus:border-emerald-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Delivery Note / Reference #
                                </label>
                                <input
                                    type="text"
                                    value={quickInRef}
                                    onChange={e => setQuickInRef(e.target.value)}
                                    placeholder="e.g. DN-801"
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:bg-white focus:border-emerald-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setShowQuickInModal(false)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleQuickStockIn}
                                disabled={isSaving}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                            >
                                Confirm Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 10. STOCK TAKE AUDIT MODAL ───────────────────────────────────── */}
            {showAuditModal && auditTarget && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
                            <h3 className="text-sm font-black flex items-center gap-2">
                                <span>⚖️</span> Physical Count Audit
                            </h3>
                            <button
                                onClick={() => setShowAuditModal(false)}
                                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
                                <p className="font-bold text-gray-900 text-xs">{auditTarget.product_name}</p>
                                <p className="text-[11px] text-gray-500 font-mono">System Book Stock: {auditTarget.current_stock} {auditTarget.base_unit}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Actual Physical Count ({auditTarget.base_unit})
                                </label>
                                <input
                                    type="number"
                                    value={auditPhysicalQty}
                                    onChange={e => setAuditPhysicalQty(e.target.value)}
                                    min="0"
                                    step="0.01"
                                    className="w-full px-4 py-2.5 bg-indigo-50/50 border border-indigo-200 rounded-xl text-base font-black font-mono text-gray-900 focus:bg-white focus:border-indigo-500 outline-none"
                                />
                            </div>

                            {(() => {
                                const counted = parseFloat(auditPhysicalQty);
                                const variance = isNaN(counted) ? 0 : counted - auditTarget.current_stock;
                                return (
                                    <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                                        variance === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : variance > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-red-50 border-red-200 text-red-800'
                                    }`}>
                                        <span>Count Variance:</span>
                                        <span className="font-mono">{variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)} {auditTarget.base_unit}</span>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setShowAuditModal(false)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStockAudit}
                                disabled={isSaving}
                                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                            >
                                Commit Reconciliation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
