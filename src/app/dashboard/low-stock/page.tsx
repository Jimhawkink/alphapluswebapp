'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { loadCompanyInfo, CompanyInfo } from '@/lib/receiptPrinter';

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export interface LowStockIngredient {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    current_stock: number;
    reorder_point: number;
    base_unit: string;
    purchase_cost: number;
    supplier_name: string;
    supplier_id?: number;
    deficit: number;
    reorder_qty: number;
    reorder_cost: number;
    urgency: 'out_of_stock' | 'critical' | 'low';
    burn_rate_daily: number; // estimated daily usage
    days_left: number;       // days of runway remaining
}

export interface LowStockDish {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    available_stock: number; // remaining in production_batches
    reorder_point: number;
    sales_cost: number;
    purchase_cost: number;
    potential_lost_revenue: number;
    urgency: 'out_of_stock' | 'critical' | 'low';
}

export interface ReorderItem {
    pid: number;
    product_name: string;
    base_unit: string;
    current_stock: number;
    reorder_point: number;
    purchase_cost: number;
    supplier_name: string;
    supplier_id?: number;
    qty_to_order: string;
    line_total: number;
}

export interface SupplierSummary {
    supplier_id: number;
    supplier_name: string;
    contact_person: string;
    phone: string;
    email: string;
    payment_terms: string;
    item_count: number;
    total_reorder_cost: number;
    items: LowStockIngredient[];
}

type LowStockTab = 
    | 'ingredients' 
    | 'dishes' 
    | 'butchery' 
    | 'beverages' 
    | 'suppliers' 
    | 'reorder_cart' 
    | 'burn_rate';

type UrgencyFilter = 'All' | 'out_of_stock' | 'critical' | 'low';

export default function LowStockPage() {
    // ─── STATE MANAGEMENT ───────────────────────────────────────────────────
    const [ingredients, setIngredients] = useState<LowStockIngredient[]>([]);
    const [dishes, setDishes] = useState<LowStockDish[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [reorderList, setReorderList] = useState<ReorderItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    // Filter controls
    const [activeTab, setActiveTab] = useState<LowStockTab>('ingredients');
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('All');
    const [supplierFilter, setSupplierFilter] = useState('All');

    // Purchase Order Processing State
    const [isSendingPO, setIsSendingPO] = useState(false);
    const [poSupplierNotes, setPoSupplierNotes] = useState('');

    // ─── LOAD COMPANY INFO ──────────────────────────────────────────────────
    useEffect(() => {
        loadCompanyInfo().then(info => {
            if (info) setCompanyInfo(info);
        }).catch(err => console.warn('Company info load error:', err));
    }, []);

    // ─── LOAD DATA ──────────────────────────────────────────────────────────
    const loadStockData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Registered Suppliers
            const { data: supplierData } = await supabase
                .from('suppliers')
                .select('*')
                .eq('active', true)
                .order('supplier_name');

            setSuppliers(supplierData || []);

            // 2. Fetch Ingredients (from products_ingredients)
            const { data: ingData, error: ingError } = await supabase
                .from('products_ingredients')
                .select('*')
                .eq('active', true)
                .order('current_stock', { ascending: true });

            if (ingError) console.warn('Ingredients load error:', ingError);

            // 3. Fetch Sales velocity for daily burn rate estimation
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
            let usageVelocityMap: Record<string, number> = {};
            try {
                const { data: recentItems } = await supabase
                    .from('sales_items')
                    .select('product_name, quantity, created_at')
                    .gte('created_at', sevenDaysAgo);

                (recentItems || []).forEach((it: any) => {
                    const norm = (it.product_name || '').toLowerCase().trim();
                    usageVelocityMap[norm] = (usageVelocityMap[norm] || 0) + (Number(it.quantity) || 0) / 7;
                });
            } catch (vErr) {
                console.warn('Velocity map warning:', vErr);
            }

            const rawIngredients = ingData || [];
            const lowIngs: LowStockIngredient[] = rawIngredients
                .filter((i: any) => (Number(i.current_stock) || 0) <= (Number(i.reorder_point) || 10))
                .map((i: any) => {
                    const cur = Number(i.current_stock) || 0;
                    const reorder = Number(i.reorder_point) || 10;
                    const deficit = Math.max(0, reorder - cur);
                    const suggestedOrder = deficit > 0 ? Math.ceil(deficit * 1.5) : reorder;
                    const cost = Number(i.purchase_cost) || Number(i.cost_per_base_unit) || 0;

                    let urgency: 'out_of_stock' | 'critical' | 'low' = 'low';
                    if (cur <= 0) urgency = 'out_of_stock';
                    else if (cur <= reorder * 0.4) urgency = 'critical';

                    const burnRate = Math.max(0.5, (usageVelocityMap[i.product_name.toLowerCase()] || 1.2));
                    const daysLeft = cur <= 0 ? 0 : Math.round((cur / burnRate) * 10) / 10;

                    return {
                        pid: i.pid,
                        product_code: i.product_code || `ING-${i.pid}`,
                        product_name: i.product_name,
                        category: i.category || 'Kitchen Raw Materials',
                        current_stock: cur,
                        reorder_point: reorder,
                        base_unit: i.base_unit || 'KG',
                        purchase_cost: cost,
                        supplier_name: i.supplier_name || 'Preferred Vendor',
                        deficit,
                        reorder_qty: suggestedOrder,
                        reorder_cost: suggestedOrder * cost,
                        urgency,
                        burn_rate_daily: burnRate,
                        days_left: daysLeft,
                    };
                });

            setIngredients(lowIngs);

            // 4. Fetch Dishes & Production Batches
            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .order('product_name');

            const { data: batchesData } = await supabase
                .from('production_batches')
                .select('product_id, qty_remaining, status')
                .in('status', ['In Stock', 'Active']);

            const dishStockMap = new Map<number, number>();
            (batchesData || []).forEach((b: any) => {
                dishStockMap.set(b.product_id, (dishStockMap.get(b.product_id) || 0) + (Number(b.qty_remaining) || 0));
            });

            const lowDishes: LowStockDish[] = (productsData || [])
                .map((p: any) => {
                    const avail = dishStockMap.get(p.pid) || 0;
                    const reorder = Number(p.reorder_point) || 5;
                    const sPrice = Number(p.sales_cost) || 0;
                    const pCost = Number(p.purchase_cost) || 0;

                    let urgency: 'out_of_stock' | 'critical' | 'low' = 'low';
                    if (avail <= 0) urgency = 'out_of_stock';
                    else if (avail <= reorder * 0.4) urgency = 'critical';

                    return {
                        pid: p.pid,
                        product_code: p.product_code || `PRD-${p.pid}`,
                        product_name: p.product_name,
                        category: p.category || 'Main Dishes',
                        available_stock: avail,
                        reorder_point: reorder,
                        sales_cost: sPrice,
                        purchase_cost: pCost,
                        potential_lost_revenue: Math.max(0, reorder - avail) * sPrice,
                        urgency,
                    };
                })
                .filter(d => d.available_stock <= d.reorder_point);

            setDishes(lowDishes);
        } catch (err: any) {
            console.error('Fatal stock load error:', err);
            toast.error('Could not load inventory stock levels');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStockData();
    }, [loadStockData]);

    // ─── REORDER CART ACTIONS ───────────────────────────────────────────────
    const addToReorder = (ing: LowStockIngredient) => {
        if (reorderList.some(r => r.pid === ing.pid)) {
            toast('Item already in purchase reorder queue', { icon: 'ℹ️' });
            return;
        }

        const qty = String(ing.reorder_qty);
        const cost = ing.purchase_cost;
        setReorderList(prev => [...prev, {
            pid: ing.pid,
            product_name: ing.product_name,
            base_unit: ing.base_unit,
            current_stock: ing.current_stock,
            reorder_point: ing.reorder_point,
            purchase_cost: cost,
            supplier_name: ing.supplier_name,
            qty_to_order: qty,
            line_total: parseFloat(qty || '0') * cost,
        }]);
        toast.success(`Queued ${ing.product_name} for Purchase Order! 🛒`);
    };

    const addAllDeficitsToReorder = () => {
        const toAdd = ingredients.filter(i => !reorderList.some(r => r.pid === i.pid));
        if (toAdd.length === 0) {
            toast('All low stock items are already in your reorder list');
            return;
        }

        const newItems: ReorderItem[] = toAdd.map(i => ({
            pid: i.pid,
            product_name: i.product_name,
            base_unit: i.base_unit,
            current_stock: i.current_stock,
            reorder_point: i.reorder_point,
            purchase_cost: i.purchase_cost,
            supplier_name: i.supplier_name,
            qty_to_order: String(i.reorder_qty),
            line_total: i.reorder_qty * i.purchase_cost,
        }));

        setReorderList(prev => [...prev, ...newItems]);
        toast.success(`Added ${newItems.length} low stock items to Purchase Order! 🛒`);
    };

    const removeFromReorder = (pid: number) => {
        setReorderList(prev => prev.filter(r => r.pid !== pid));
    };

    const updateReorderQty = (pid: number, qty: string) => {
        setReorderList(prev => prev.map(r => {
            if (r.pid !== pid) return r;
            const num = parseFloat(qty) || 0;
            return {
                ...r,
                qty_to_order: qty,
                line_total: num * r.purchase_cost,
            };
        }));
    };

    // ─── GENERATE AND DISPATCH OFFICIAL PURCHASE ORDER ──────────────────────
    const handleGeneratePO = async () => {
        if (reorderList.length === 0) {
            toast.error('Reorder queue is empty');
            return;
        }

        const invalid = reorderList.find(r => !parseFloat(r.qty_to_order) || parseFloat(r.qty_to_order) <= 0);
        if (invalid) {
            toast.error(`Please enter a valid order quantity for ${invalid.product_name}`);
            return;
        }

        setIsSendingPO(true);
        try {
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            const currentUser = userData?.name || 'Stores Manager';
            const poNumber = `PO-${Date.now().toString().slice(-6)}`;
            const today = new Date().toISOString().split('T')[0];
            const grandTotal = reorderList.reduce((sum, r) => sum + r.line_total, 0);

            // 1. Insert into Purchases Master Table
            const { error: poError } = await supabase
                .from('purchases')
                .insert({
                    purchase_no: poNumber,
                    purchase_date: today,
                    supplier_name: reorderList[0]?.supplier_name || 'Multiple Suppliers',
                    sub_total: grandTotal,
                    discount: 0,
                    vat: grandTotal * 0.16,
                    grand_total: grandTotal,
                    status: 'Pending',
                    payment_status: 'Unpaid',
                    notes: `Auto-generated Low Stock Reorder. ${poSupplierNotes}`.trim(),
                    created_by: currentUser,
                });

            if (poError) {
                console.warn('Purchases master insert warning:', poError);
            }

            // 2. Log Stock Movements for audit tracking
            for (const item of reorderList) {
                await supabase.from('stock_movements').insert({
                    movement_date: today,
                    product_id: item.pid,
                    product_name: item.product_name,
                    movement_type: 'Purchase Order',
                    quantity: parseFloat(item.qty_to_order),
                    unit: item.base_unit,
                    unit_cost: item.purchase_cost,
                    total_cost: item.line_total,
                    reason: `Low Stock Depletion Reorder [${poNumber}]`,
                    reference_no: poNumber,
                    reference_type: 'Reorder',
                    created_by: currentUser,
                });
            }

            toast.success(`✅ Purchase Order ${poNumber} dispatched! Grand Total: ${fmt(grandTotal)}`, {
                duration: 5000,
            });
            setReorderList([]);
            setPoSupplierNotes('');
            setActiveTab('reorder_cart');
        } catch (err: any) {
            console.error('PO Generation failed:', err);
            toast.error(`Failed to dispatch PO: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSendingPO(false);
        }
    };

    // ─── FILTERING LOGIC ────────────────────────────────────────────────────
    const availableCategories = useMemo(() => {
        const set = new Set([
            ...ingredients.map(i => i.category),
            ...dishes.map(d => d.category),
        ]);
        return ['All', ...Array.from(set).filter(Boolean)];
    }, [ingredients, dishes]);

    const availableSuppliers = useMemo(() => {
        const set = new Set(ingredients.map(i => i.supplier_name));
        return ['All', ...Array.from(set).filter(Boolean)];
    }, [ingredients]);

    const filteredIngredients = useMemo(() => {
        return ingredients.filter(i => {
            if (search) {
                const q = search.toLowerCase();
                const matchName = i.product_name.toLowerCase().includes(q);
                const matchCode = i.product_code.toLowerCase().includes(q);
                const matchSupp = i.supplier_name.toLowerCase().includes(q);
                if (!matchName && !matchCode && !matchSupp) return false;
            }
            if (categoryFilter !== 'All' && i.category !== categoryFilter) return false;
            if (urgencyFilter !== 'All' && i.urgency !== urgencyFilter) return false;
            if (supplierFilter !== 'All' && i.supplier_name !== supplierFilter) return false;
            return true;
        });
    }, [ingredients, search, categoryFilter, urgencyFilter, supplierFilter]);

    const filteredDishes = useMemo(() => {
        return dishes.filter(d => {
            if (search) {
                const q = search.toLowerCase();
                const matchName = d.product_name.toLowerCase().includes(q);
                const matchCode = d.product_code.toLowerCase().includes(q);
                if (!matchName && !matchCode) return false;
            }
            if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
            if (urgencyFilter !== 'All' && d.urgency !== urgencyFilter) return false;
            return true;
        });
    }, [dishes, search, categoryFilter, urgencyFilter]);

    // Butchery & Beverages sub-filters
    const butcheryIngredients = useMemo(() => {
        return filteredIngredients.filter(i => {
            const n = i.product_name.toLowerCase();
            const c = i.category.toLowerCase();
            return n.includes('meat') || n.includes('beef') || n.includes('goat') || n.includes('mbuzi') || n.includes('chicken') || n.includes('kuku') || n.includes('fish') || n.includes('tilapia') || c.includes('butchery') || c.includes('meat');
        });
    }, [filteredIngredients]);

    const beverageIngredients = useMemo(() => {
        return filteredIngredients.filter(i => {
            const n = i.product_name.toLowerCase();
            const c = i.category.toLowerCase();
            return n.includes('beer') || n.includes('wine') || n.includes('juice') || n.includes('soda') || n.includes('milk') || n.includes('tea') || n.includes('coffee') || n.includes('water') || c.includes('beverage') || c.includes('bar');
        });
    }, [filteredIngredients]);

    // Supplier Summaries
    const supplierSummaries = useMemo((): SupplierSummary[] => {
        const map = new Map<string, LowStockIngredient[]>();
        ingredients.forEach(i => {
            const sName = i.supplier_name || 'Standard Vendor';
            if (!map.has(sName)) map.set(sName, []);
            map.get(sName)!.push(i);
        });

        const list: SupplierSummary[] = [];
        map.forEach((items, sName) => {
            const matchedSup = suppliers.find(s => s.supplier_name.toLowerCase() === sName.toLowerCase());
            const totalCost = items.reduce((sum, item) => sum + item.reorder_cost, 0);
            list.push({
                supplier_id: matchedSup?.supplier_id || 0,
                supplier_name: sName,
                contact_person: matchedSup?.contact_person || 'Sales Rep',
                phone: matchedSup?.phone || '0700-000-000',
                email: matchedSup?.email || 'vendor@supply.com',
                payment_terms: matchedSup?.payment_terms || 'Net 30',
                item_count: items.length,
                total_reorder_cost: totalCost,
                items,
            });
        });

        return list.sort((a, b) => b.total_reorder_cost - a.total_reorder_cost);
    }, [ingredients, suppliers]);

    // ─── EXECUTIVE KPIS ─────────────────────────────────────────────────────
    const kpiMetrics = useMemo(() => {
        const totalDepletedCount = ingredients.length + dishes.length;
        const outOfStockCount = ingredients.filter(i => i.current_stock <= 0).length + dishes.filter(d => d.available_stock <= 0).length;
        const criticalCount = ingredients.filter(i => i.urgency === 'critical').length + dishes.filter(d => d.urgency === 'critical').length;
        const totalCapitalRequired = ingredients.reduce((sum, i) => sum + i.reorder_cost, 0);
        const totalStagedReorderValue = reorderList.reduce((sum, r) => sum + r.line_total, 0);
        const avgRunwayDays = ingredients.length > 0 ? (ingredients.reduce((sum, i) => sum + i.days_left, 0) / ingredients.length) : 0;

        return {
            totalDepletedCount,
            outOfStockCount,
            criticalCount,
            totalCapitalRequired,
            totalStagedReorderValue,
            avgRunwayDays,
        };
    }, [ingredients, dishes, reorderList]);

    // ─── FORMATTERS ─────────────────────────────────────────────────────────
    const fmt = (n: number) => `Ksh ${Math.round(n).toLocaleString('en-KE')}`;
    const fmtDec = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── PRINTABLE DOCUMENT ─────────────────────────────────────────────────
    const handlePrintRequisition = () => {
        const hotelName = companyInfo?.name || 'Alpha Plus Hotel & Restaurant';
        const printContent = document.getElementById('printable-requisition-report');
        if (!printContent) return;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OFFICIAL INVENTORY REORDER REQUISITION - ${hotelName}</title>
<style>
  @page { size: A4; margin: 12mm 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #fff; line-height: 1.35; font-size: 11px; }
  .header { border-bottom: 2px solid #e11d48; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .hotel-name { font-size: 18px; font-weight: 900; text-transform: uppercase; color: #e11d48; letter-spacing: 0.5px; }
  .hotel-sub { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px; }
  .badge { display: inline-block; background: #e11d48; color: #fff; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc; }
  .kpi-title { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .kpi-value { font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f1f5f9; color: #334155; font-weight: 800; text-transform: uppercase; padding: 6px 6px; border: 1px solid #cbd5e1; text-align: left; }
  td { padding: 5px 6px; border: 1px solid #e2e8f0; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .total-row { background: #f8fafc; font-weight: 900; border-top: 2px solid #e11d48; }
  .signatures { margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; font-size: 10px; border-top: 1px dashed #cbd5e1; pt-4; }
  .sig-line { border-top: 1px solid #475569; margin-top: 35px; padding-top: 4px; font-weight: 700; text-align: center; color: #334155; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="hotel-name">${hotelName}</div>
      <div class="hotel-sub">Stores &amp; Kitchen Procurement Requisition • Urgent Low Stock Depletion Audit</div>
    </div>
    <div style="text-align: right;">
      <span class="badge">Emergency Procurement</span>
      <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Date: ${new Date().toLocaleDateString('en-GB')}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-title">Total Deficit Items</div><div class="kpi-value">${ingredients.length} Ingredients</div></div>
    <div class="kpi-card"><div class="kpi-title">Out of Stock Lines</div><div class="kpi-value" style="color: #dc2626;">${kpiMetrics.outOfStockCount} Items</div></div>
    <div class="kpi-card"><div class="kpi-title">Capital Required</div><div class="kpi-value" style="color: #059669;">${fmt(kpiMetrics.totalCapitalRequired)}</div></div>
    <div class="kpi-card"><div class="kpi-title">Queued in PO Cart</div><div class="kpi-value">${reorderList.length} Items (${fmt(kpiMetrics.totalStagedReorderValue)})</div></div>
  </div>

  <h3 style="font-size: 12px; margin-top: 14px; margin-bottom: 4px; font-weight: 900; color: #0f172a;">Critical Items Requiring Immediate Reorder</h3>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Item Description</th>
        <th>Category</th>
        <th class="text-right">Current Stock</th>
        <th class="text-right">Reorder Point</th>
        <th class="text-right">Deficit</th>
        <th class="text-right">Unit Rate</th>
        <th class="text-right">Suggested Qty</th>
        <th class="text-right">Estimated Cost</th>
        <th>Designated Supplier</th>
      </tr>
    </thead>
    <tbody>
      ${ingredients.map(i => `
        <tr>
          <td style="font-family: monospace;">${i.product_code}</td>
          <td style="font-weight: 700;">${i.product_name}</td>
          <td>${i.category}</td>
          <td class="text-right" style="color: ${i.current_stock <= 0 ? '#dc2626' : '#d97706'}; font-weight: 700;">
            ${i.current_stock.toFixed(2)} ${i.base_unit}
          </td>
          <td class="text-right">${i.reorder_point} ${i.base_unit}</td>
          <td class="text-right" style="color: #dc2626; font-weight: 700;">${i.deficit.toFixed(2)} ${i.base_unit}</td>
          <td class="text-right">${fmtDec(i.purchase_cost)}</td>
          <td class="text-right" style="font-weight: 700;">${i.reorder_qty} ${i.base_unit}</td>
          <td class="text-right" style="font-weight: 700; color: #059669;">${fmt(i.reorder_cost)}</td>
          <td>${i.supplier_name}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="7">TOTAL ESTIMATED REQUISITION VALUE (${ingredients.length} ITEMS)</td>
        <td colspan="2" class="text-right" style="color: #059669; font-size: 11px;">${fmt(kpiMetrics.totalCapitalRequired)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="signatures">
    <div><div class="sig-line">Stores Keeper / Requisitioner</div></div>
    <div><div class="sig-line">Executive Chef / Kitchen Lead</div></div>
    <div><div class="sig-line">Procurement Manager / Director</div></div>
  </div>
</body>
</html>`;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;
        doc.open();
        doc.write(html);
        doc.close();

        iframe.contentWindow?.focus();
        setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1500);
        }, 350);
        toast.success('Generated official Procurement Requisition! 🖨️');
    };

    // ─── EXPORT TO CSV ──────────────────────────────────────────────────────
    const handleExportCSV = () => {
        let csv = 'Product Code,Product Name,Category,Type,Current Stock,Reorder Point,Deficit,Base Unit,Purchase Unit Cost (Ksh),Suggested Reorder Qty,Estimated Reorder Cost (Ksh),Preferred Supplier,Urgency Level,Runway Days Left\n';

        ingredients.forEach(i => {
            csv += `"${i.product_code}","${i.product_name.replace(/"/g, '""')}","${i.category}","Raw Ingredient",${i.current_stock},${i.reorder_point},${i.deficit},"${i.base_unit}",${i.purchase_cost},${i.reorder_qty},${i.reorder_cost},"${i.supplier_name}","${i.urgency.toUpperCase()}",${i.days_left}\n`;
        });

        dishes.forEach(d => {
            csv += `"${d.product_code}","${d.product_name.replace(/"/g, '""')}","${d.category}","Prepared Dish",${d.available_stock},${d.reorder_point},${Math.max(0, d.reorder_point - d.available_stock)},"PCS",${d.purchase_cost},${Math.max(0, d.reorder_point - d.available_stock)},${d.potential_lost_revenue},"Kitchen Production","${d.urgency.toUpperCase()}",0\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Inventory_Low_Stock_Audit_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Exported low stock inventory to CSV! 📥');
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1700px] mx-auto min-h-screen bg-slate-50 text-slate-800">
            <Toaster position="top-right" />

            {/* Hidden Printable Container */}
            <div id="printable-requisition-report" className="hidden" />

            {/* ==================================================================== */}
            {/* 1. TOP HEADER & EXECUTIVE TOOLBAR (GLASSMORPHIC LIGHT THEME)         */}
            {/* ==================================================================== */}
            <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 flex items-center justify-center text-2xl shadow-md text-white border-2 border-white/50 shrink-0">
                        ⚠️
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                                Inventory Depletion &amp; <span className="text-rose-600">Low Stock Intelligence</span>
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 shadow-sm">
                                CRITICAL PAR ALERT
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-medium flex items-center gap-2 flex-wrap">
                            <span>{companyInfo?.name || 'Alpha Plus Hotel & Restaurant'}</span>
                            <span>•</span>
                            <span>Automatic Buffer Alerts, Reorder Deficit Valuation &amp; Supplier PO Dispatch</span>
                        </p>
                    </div>
                </div>

                {/* Right Action Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={loadStockData}
                        className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="Reload latest live inventory quantities"
                    >
                        <span>🔄</span>
                        <span>Refresh</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-xs font-bold text-slate-700 hover:text-emerald-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="Download CSV Spreadsheet for Stores Procurement"
                    >
                        <span className="text-emerald-600">📥</span>
                        <span>Export CSV</span>
                    </button>

                    <button
                        type="button"
                        onClick={handlePrintRequisition}
                        className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-xs font-bold text-slate-700 hover:text-rose-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="Print Official Stores Requisition"
                    >
                        <span className="text-rose-600">🖨️</span>
                        <span>Print Requisition</span>
                    </button>

                    <button
                        type="button"
                        onClick={addAllDeficitsToReorder}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                    >
                        <span>🛒</span>
                        <span>Queue All to Reorder ({ingredients.length})</span>
                    </button>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 2. SEARCH & ADVANCED MULTI-FILTERS BAR                               */}
            {/* ==================================================================== */}
            <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                {/* Search */}
                <div className="relative flex-1 min-w-[260px]">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search product code, ingredient name, or supplier..."
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-rose-500 outline-none shadow-sm"
                    />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {/* Category Filter */}
                    <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">Category:</span>
                        <select
                            value={categoryFilter}
                            onChange={e => setCategoryFilter(e.target.value)}
                            className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
                        >
                            {availableCategories.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    {/* Urgency Filter */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {[
                            { id: 'All', label: 'All Urgencies' },
                            { id: 'out_of_stock', label: '🚫 Out of Stock' },
                            { id: 'critical', label: '🔴 Critical (<40%)' },
                            { id: 'low', label: '🟠 Low Par' },
                        ].map(u => (
                            <button
                                key={u.id}
                                type="button"
                                onClick={() => setUrgencyFilter(u.id as UrgencyFilter)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    urgencyFilter === u.id
                                        ? 'bg-rose-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {u.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 3. 6 GLASSMORPHIC EXECUTIVE KPI CARDS                                */}
            {/* ==================================================================== */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                {/* 1. Total Low Items */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock Items</span>
                        <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-bold">⚠️</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-rose-600">{kpiMetrics.totalDepletedCount}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {ingredients.length} raw • {dishes.length} dishes
                        </p>
                    </div>
                </div>

                {/* 2. Out of Stock Emergencies */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Out of Stock</span>
                        <span className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center text-sm font-bold">🚫</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-red-700">{kpiMetrics.outOfStockCount}</div>
                        <p className="text-[11px] text-red-600 font-bold mt-0.5">
                            Immediate operational risk
                        </p>
                    </div>
                </div>

                {/* 3. Critical Par (<40%) */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Critical Par</span>
                        <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-bold">🔴</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-amber-600">{kpiMetrics.criticalCount}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Depleting in &lt; 24-48 hours
                        </p>
                    </div>
                </div>

                {/* 4. Capital Required to Restock */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Capital Required</span>
                        <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">💰</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-emerald-600 font-mono">{fmt(kpiMetrics.totalCapitalRequired)}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            To replenish par levels
                        </p>
                    </div>
                </div>

                {/* 5. Average Runway Remaining */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Runway</span>
                        <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">⏳</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-blue-600 font-mono">{kpiMetrics.avgRunwayDays.toFixed(1)} Days</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Based on 7-day sales burn
                        </p>
                    </div>
                </div>

                {/* 6. Active Staged PO Reorder Cart */}
                <div className="bg-white/80 backdrop-blur-md border border-white/80 p-4 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reorder Queue</span>
                        <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-bold">🛒</span>
                    </div>
                    <div className="mt-2.5">
                        <div className="text-xl font-black text-purple-700">{reorderList.length} Items</div>
                        <p className="text-[11px] text-purple-600 font-bold mt-0.5 font-mono">
                            {fmt(kpiMetrics.totalStagedReorderValue)} Staged
                        </p>
                    </div>
                </div>
            </div>

            {/* ==================================================================== */}
            {/* 4. MULTI-TAB NAVIGATION STRIP (GLASSMORPHIC)                         */}
            {/* ==================================================================== */}
            <div className="bg-white/80 backdrop-blur-md border border-white/80 p-1.5 rounded-2xl shadow-sm flex items-center gap-1 overflow-x-auto scrollbar-none">
                {[
                    { id: 'ingredients', label: '🥬 Raw Kitchen Ingredients', count: filteredIngredients.length },
                    { id: 'dishes', label: '🍽️ Prepared Dishes & Pass Buffer', count: filteredDishes.length },
                    { id: 'butchery', label: '🥩 Butchery & Meat Cuts', count: butcheryIngredients.length },
                    { id: 'beverages', label: '🍾 Cellar & Bar Stock', count: beverageIngredients.length },
                    { id: 'suppliers', label: '🏢 Supplier Replenishment Bundles', count: supplierSummaries.length },
                    { id: 'reorder_cart', label: '🛒 Staged Purchase Order Cart', count: reorderList.length },
                    { id: 'burn_rate', label: '📈 Depletion Velocity & Runway', count: 'Burn' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as LowStockTab)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                            activeTab === tab.id
                                ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                            activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* ==================================================================== */}
            {/* 5. TAB CONTENTS                                                      */}
            {/* ==================================================================== */}

            {/* ── TAB 1: RAW KITCHEN INGREDIENTS ─────────────────────────────────── */}
            {activeTab === 'ingredients' && (
                <div className="space-y-4">
                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
                                <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm font-bold">Auditing Raw Material Stock Levels...</p>
                            </div>
                        ) : filteredIngredients.length === 0 ? (
                            <div className="p-16 text-center space-y-3">
                                <span className="text-5xl">✅</span>
                                <h3 className="text-lg font-black text-slate-800">All Ingredient Buffers Are Healthy!</h3>
                                <p className="text-xs text-slate-500 max-w-md mx-auto">
                                    No kitchen ingredients are currently below safety par levels. All raw stock is well-provisioned.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                            <th className="py-3.5 px-4">Item Code &amp; Name</th>
                                            <th className="py-3.5 px-3">Category</th>
                                            <th className="py-3.5 px-3 text-center">Current Stock</th>
                                            <th className="py-3.5 px-3 text-center">Safety Par</th>
                                            <th className="py-3.5 px-3 text-center">Deficit</th>
                                            <th className="py-3.5 px-3 text-center">Runway</th>
                                            <th className="py-3.5 px-3 text-center">Urgency</th>
                                            <th className="py-3.5 px-3">Supplier</th>
                                            <th className="py-3.5 px-3 text-right">Suggested Order</th>
                                            <th className="py-3.5 px-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {filteredIngredients.map((ing, i) => {
                                            const inCart = reorderList.some(r => r.pid === ing.pid);
                                            return (
                                                <tr key={ing.pid} className={`hover:bg-rose-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                    <td className="py-3 px-4">
                                                        <span className="font-bold text-slate-900 block">{ing.product_name}</span>
                                                        <span className="text-[10px] font-mono text-slate-400">{ing.product_code}</span>
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                                                            {ing.category}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center font-mono font-bold">
                                                        <span className={`px-2 py-0.5 rounded-full ${
                                                            ing.current_stock <= 0
                                                                ? 'bg-red-100 text-red-800 font-black'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {ing.current_stock.toFixed(2)} {ing.base_unit}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center text-slate-500 font-mono">
                                                        {ing.reorder_point} {ing.base_unit}
                                                    </td>
                                                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-600">
                                                        {ing.deficit > 0 ? `-${ing.deficit.toFixed(2)} ${ing.base_unit}` : '0'}
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`font-bold ${ing.days_left <= 1 ? 'text-red-600 font-black' : 'text-slate-600'}`}>
                                                            {ing.days_left <= 0 ? 'Exhausted' : `${ing.days_left}d`}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                            ing.urgency === 'out_of_stock'
                                                                ? 'bg-red-600 text-white shadow-sm'
                                                                : ing.urgency === 'critical'
                                                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {ing.urgency.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-700 font-medium">
                                                        {ing.supplier_name}
                                                    </td>
                                                    <td className="py-3 px-3 text-right">
                                                        <span className="font-bold text-slate-900 block font-mono">
                                                            {ing.reorder_qty} {ing.base_unit}
                                                        </span>
                                                        <span className="text-[10px] text-emerald-700 font-mono font-bold">
                                                            {fmt(ing.reorder_cost)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => addToReorder(ing)}
                                                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 mx-auto shadow-sm cursor-pointer ${
                                                                inCart
                                                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                                                            }`}
                                                        >
                                                            <span>{inCart ? '✓ Queued' : '🛒 Order'}</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-800">
                                            <td className="py-4 px-4" colSpan={7}>
                                                TOTAL INGREDIENTS DEFICIT CAPITAL ({filteredIngredients.length} ITEMS)
                                            </td>
                                            <td className="py-4 px-3 text-right" colSpan={2}>
                                                <span className="text-emerald-700 font-mono text-sm">
                                                    {fmt(filteredIngredients.reduce((s, i) => s + i.reorder_cost, 0))}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <button
                                                    type="button"
                                                    onClick={addAllDeficitsToReorder}
                                                    className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold text-[11px] shadow-sm hover:bg-emerald-700 cursor-pointer"
                                                >
                                                    Queue All
                                                </button>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 2: PREPARED DISHES & PASS BUFFER ────────────────────────────── */}
            {activeTab === 'dishes' && (
                <div className="space-y-4">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                                <span>🍽️</span>
                                <span>Cooked Dish &amp; Kitchen Pass Buffer</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                                Tracks portions remaining on the kitchen pass. When portions fall below par, trigger a production batch in Recipe Studio to replenish cook line stock.
                            </p>
                        </div>

                        <Link
                            href="/dashboard/recipe"
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 shrink-0"
                        >
                            <span>🍳</span>
                            <span>Open Recipe Production Studio</span>
                        </Link>
                    </div>

                    <div className="bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                        {filteredDishes.length === 0 ? (
                            <div className="p-16 text-center space-y-3">
                                <span className="text-5xl">✅</span>
                                <h3 className="text-lg font-black text-slate-800">All Cooked Dishes are Sufficiently Stocked!</h3>
                                <p className="text-xs text-slate-500">The cook line buffer is currently fully provisioned.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                            <th className="py-3.5 px-4">Dish Description</th>
                                            <th className="py-3.5 px-3">Category</th>
                                            <th className="py-3.5 px-3 text-center">Remaining on Pass</th>
                                            <th className="py-3.5 px-3 text-center">Safety Buffer Par</th>
                                            <th className="py-3.5 px-3 text-center">Urgency</th>
                                            <th className="py-3.5 px-3 text-right">Selling Price</th>
                                            <th className="py-3.5 px-4 text-right">Potential Lost Revenue</th>
                                            <th className="py-3.5 px-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {filteredDishes.map((dish, i) => (
                                            <tr key={dish.pid} className={`hover:bg-amber-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                <td className="py-3 px-4 font-bold text-slate-900">
                                                    🍽️ {dish.product_name}
                                                    <span className="text-[10px] font-mono text-slate-400 block">{dish.product_code}</span>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                                                        {dish.category}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-center font-mono font-bold">
                                                    <span className={`px-2.5 py-0.5 rounded-full ${
                                                        dish.available_stock <= 0
                                                            ? 'bg-red-100 text-red-800 font-black'
                                                            : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {dish.available_stock} PCS
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-center font-mono text-slate-500">
                                                    {dish.reorder_point} PCS
                                                </td>
                                                <td className="py-3 px-3 text-center">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                        dish.urgency === 'out_of_stock'
                                                            ? 'bg-red-600 text-white shadow-sm'
                                                            : dish.urgency === 'critical'
                                                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                                            : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {dish.urgency.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                                                    {fmt(dish.sales_cost)}
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono font-black text-rose-600">
                                                    {fmt(dish.potential_lost_revenue)}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <Link
                                                        href="/dashboard/recipe"
                                                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs shadow-sm transition-all inline-flex items-center gap-1 active:scale-95"
                                                    >
                                                        <span>🍳</span>
                                                        <span>Cook Batch</span>
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 3: BUTCHERY & MEAT CUTS ────────────────────────────────────── */}
            {activeTab === 'butchery' && (
                <div className="space-y-4">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>🥩</span>
                            <span>Butchery &amp; Meat Cold Room Par Levels</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            High-value perishable meat carcasses and cuts (Beef, Goat/Mbuzi, Chicken, Pork, and Fish).
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {butcheryIngredients.map(meat => (
                            <div key={meat.pid} className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                                            {meat.urgency.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs font-mono text-slate-400">{meat.product_code}</span>
                                    </div>
                                    <h4 className="font-black text-sm text-slate-900 mt-2">🥩 {meat.product_name}</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">Supplier: {meat.supplier_name}</p>
                                </div>

                                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">Cold Room Stock:</span>
                                        <span className="font-black text-rose-600 font-mono text-sm">{meat.current_stock.toFixed(2)} {meat.base_unit}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">Safety Buffer:</span>
                                        <span className="font-bold text-slate-700 font-mono">{meat.reorder_point} {meat.base_unit}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500">Reorder Investment:</span>
                                        <span className="font-bold text-emerald-700 font-mono">{fmt(meat.reorder_cost)}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => addToReorder(meat)}
                                        className="w-full mt-2 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                    >
                                        <span>🛒</span>
                                        <span>Queue {meat.reorder_qty} {meat.base_unit} Reorder</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TAB 4: CELLAR & BAR BEVERAGES ─────────────────────────────────── */}
            {activeTab === 'beverages' && (
                <div className="space-y-4">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>🍾</span>
                            <span>Bar, Beverage &amp; Cellar Par Depletions</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Soft drinks, beers, spirits, wines, juices, and dairy mixers below minimum bar threshold.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {beverageIngredients.map(bev => (
                            <div key={bev.pid} className="bg-white/90 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-lg">🍾</span>
                                        <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                            {bev.urgency}
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-xs text-slate-900 mt-2">{bev.product_name}</h4>
                                    <p className="text-[11px] text-slate-500">{bev.supplier_name}</p>
                                </div>

                                <div className="mt-3 pt-2 border-t border-slate-100 text-xs space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400">Available:</span>
                                        <span className="font-black text-rose-600 font-mono">{bev.current_stock.toFixed(1)} {bev.base_unit}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400">Restock Cost:</span>
                                        <span className="font-bold text-emerald-700 font-mono">{fmt(bev.reorder_cost)}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => addToReorder(bev)}
                                        className="w-full mt-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                    >
                                        <span>🛒</span>
                                        <span>Order</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TAB 5: SUPPLIER REPLENISHMENT BUNDLES ──────────────────────────── */}
            {activeTab === 'suppliers' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>🏢</span>
                            <span>Vendor Replenishment Packages (Grouped by Supplier)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Consolidates all depleted items by their contracted vendor. One-click batch PO generation per supplier.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {supplierSummaries.map(sup => (
                            <div key={sup.supplier_name} className="bg-white/90 backdrop-blur-md border border-white/80 p-6 rounded-3xl shadow-sm space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                    <div>
                                        <h4 className="font-black text-base text-slate-900 flex items-center gap-2">
                                            <span>🏢</span>
                                            <span>{sup.supplier_name}</span>
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Contact: {sup.contact_person} • {sup.phone} • Terms: {sup.payment_terms}
                                        </p>
                                    </div>

                                    <span className="text-xs font-black text-rose-700 bg-rose-100 px-3 py-1 rounded-full">
                                        {sup.item_count} items low
                                    </span>
                                </div>

                                {/* Items mini table */}
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                                    {sup.items.map(item => (
                                        <div key={item.pid} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                                            <div>
                                                <span className="font-bold text-slate-800">{item.product_name}</span>
                                                <span className="text-[10px] text-slate-400 block">
                                                    Stock: {item.current_stock} / Par: {item.reorder_point} {item.base_unit}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-bold text-slate-900 font-mono block">
                                                    {item.reorder_qty} {item.base_unit}
                                                </span>
                                                <span className="text-[11px] font-bold text-emerald-700 font-mono">
                                                    {fmt(item.reorder_cost)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Consolidated Order Cost</span>
                                        <span className="text-lg font-black text-emerald-700 font-mono">{fmt(sup.total_reorder_cost)}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            sup.items.forEach(it => addToReorder(it));
                                            setActiveTab('reorder_cart');
                                        }}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                                    >
                                        <span>📋</span>
                                        <span>Stage Vendor PO</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TAB 6: STAGED PURCHASE ORDER CART ───────────────────────────────── */}
            {activeTab === 'reorder_cart' && (
                <div className="space-y-6">
                    {reorderList.length === 0 ? (
                        <div className="bg-white/90 backdrop-blur-md border border-white/80 p-16 rounded-3xl shadow-sm text-center space-y-4">
                            <span className="text-5xl">🛒</span>
                            <h3 className="text-lg font-black text-slate-800">Your Reorder Cart is Empty</h3>
                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                                Click &quot;🛒 Order&quot; on any low stock ingredient or use &quot;Queue All&quot; to stage your procurement order here.
                            </p>
                            <button
                                type="button"
                                onClick={() => setActiveTab('ingredients')}
                                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                            >
                                ⚠️ Browse Low Stock Ingredients
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Staged Items Table */}
                            <div className="lg:col-span-2 bg-white/90 backdrop-blur-md border border-white/80 rounded-3xl shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                                        <span>🛒</span>
                                        <span>Staged Purchase Order Items ({reorderList.length})</span>
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => setReorderList([])}
                                        className="text-xs text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                                    >
                                        Clear Cart
                                    </button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                                <th className="py-3 px-4">Ingredient</th>
                                                <th className="py-3 px-3 text-center">In Stock</th>
                                                <th className="py-3 px-3 text-center">Order Qty</th>
                                                <th className="py-3 px-3">Supplier</th>
                                                <th className="py-3 px-4 text-right">Line Total</th>
                                                <th className="py-3 px-3 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {reorderList.map(item => (
                                                <tr key={item.pid} className="hover:bg-slate-50">
                                                    <td className="py-3 px-4 font-bold text-slate-800">
                                                        {item.product_name}
                                                    </td>
                                                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-600">
                                                        {item.current_stock.toFixed(2)} {item.base_unit}
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <input
                                                                type="number"
                                                                value={item.qty_to_order}
                                                                onChange={e => updateReorderQty(item.pid, e.target.value)}
                                                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs outline-none focus:border-emerald-500"
                                                                min="1"
                                                                step="0.5"
                                                            />
                                                            <span className="text-[11px] text-slate-400 font-bold">{item.base_unit}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-600">
                                                        {item.supplier_name}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono font-black text-emerald-700">
                                                        {fmt(item.line_total)}
                                                    </td>
                                                    <td className="py-3 px-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeFromReorder(item.pid)}
                                                            className="text-slate-400 hover:text-rose-600 font-bold p-1 cursor-pointer"
                                                            title="Remove item"
                                                        >
                                                            ✕
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* PO Dispatch Summary Card */}
                            <div className="bg-white/90 backdrop-blur-md border border-white/80 p-6 rounded-3xl shadow-sm space-y-5 h-fit">
                                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
                                    <span>📋</span>
                                    <span>Purchase Order Dispatch</span>
                                </h3>

                                <div className="space-y-3 text-xs">
                                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                                        <span className="text-slate-500">Total Items:</span>
                                        <span className="font-bold text-slate-900">{reorderList.length} line items</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                                        <span className="text-slate-500">Subtotal (Excl. VAT):</span>
                                        <span className="font-mono font-bold text-slate-800">{fmt(kpiMetrics.totalStagedReorderValue)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                                        <span className="text-slate-500">Est. 16% Input VAT:</span>
                                        <span className="font-mono font-bold text-slate-800">{fmt(kpiMetrics.totalStagedReorderValue * 0.16)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 bg-emerald-50 px-3 rounded-xl border border-emerald-200">
                                        <span className="font-black text-emerald-900">PO Grand Total:</span>
                                        <span className="font-mono font-black text-emerald-700 text-base">
                                            {fmt(kpiMetrics.totalStagedReorderValue)}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-slate-600 uppercase">Vendor Instructions &amp; Delivery Notes</label>
                                    <textarea
                                        value={poSupplierNotes}
                                        onChange={e => setPoSupplierNotes(e.target.value)}
                                        placeholder="e.g. Deliver before 10:00 AM to Kitchen Receiving Bay..."
                                        rows={3}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-emerald-500 outline-none resize-none"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleGeneratePO}
                                    disabled={isSendingPO}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    <span>{isSendingPO ? '⏳ Generating PO...' : '🚀 Dispatch Purchase Order'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 7: DEPLETION VELOCITY & RUNWAY ──────────────────────────────── */}
            {activeTab === 'burn_rate' && (
                <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/80 p-5 rounded-3xl shadow-sm">
                        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                            <span>📈</span>
                            <span>Inventory Burn-Rate &amp; Stockout Forecast Timeline</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Projects when each depleted raw material will reach complete zero based on historical sales velocity.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. Depleting in <= 1 Day */}
                        <div className="bg-white/90 backdrop-blur-md border-2 border-red-300 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-red-100">
                                <span className="font-black text-sm text-red-700">🚨 Exhausting Today / &lt;24h</span>
                                <span className="text-xs font-black bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full">
                                    {ingredients.filter(i => i.days_left <= 1).length} Items
                                </span>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
                                {ingredients.filter(i => i.days_left <= 1).map(i => (
                                    <div key={i.pid} className="p-2 bg-red-50 rounded-xl border border-red-100 flex justify-between items-center">
                                        <span className="font-bold text-slate-800">{i.product_name}</span>
                                        <span className="font-mono font-bold text-red-700">{i.current_stock.toFixed(1)} {i.base_unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Depleting in 2-3 Days */}
                        <div className="bg-white/90 backdrop-blur-md border-2 border-amber-300 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-amber-100">
                                <span className="font-black text-sm text-amber-700">⚠️ Exhausting in 2–3 Days</span>
                                <span className="text-xs font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
                                    {ingredients.filter(i => i.days_left > 1 && i.days_left <= 3).length} Items
                                </span>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
                                {ingredients.filter(i => i.days_left > 1 && i.days_left <= 3).map(i => (
                                    <div key={i.pid} className="p-2 bg-amber-50 rounded-xl border border-amber-100 flex justify-between items-center">
                                        <span className="font-bold text-slate-800">{i.product_name}</span>
                                        <span className="font-mono font-bold text-amber-700">{i.current_stock.toFixed(1)} {i.base_unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 3. Depleting in 4-7 Days */}
                        <div className="bg-white/90 backdrop-blur-md border-2 border-blue-300 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                                <span className="font-black text-sm text-blue-700">📦 Exhausting This Week</span>
                                <span className="text-xs font-black bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
                                    {ingredients.filter(i => i.days_left > 3 && i.days_left <= 7).length} Items
                                </span>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
                                {ingredients.filter(i => i.days_left > 3 && i.days_left <= 7).map(i => (
                                    <div key={i.pid} className="p-2 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                                        <span className="font-bold text-slate-800">{i.product_name}</span>
                                        <span className="font-mono font-bold text-blue-700">{i.current_stock.toFixed(1)} {i.base_unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. Healthy Runway > 7 Days */}
                        <div className="bg-white/90 backdrop-blur-md border-2 border-emerald-300 p-5 rounded-3xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                                <span className="font-black text-sm text-emerald-700">✅ Stable Par Runway (&gt;7d)</span>
                                <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                                    {ingredients.filter(i => i.days_left > 7).length} Items
                                </span>
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
                                {ingredients.filter(i => i.days_left > 7).map(i => (
                                    <div key={i.pid} className="p-2 bg-emerald-50 rounded-xl border border-emerald-100 flex justify-between items-center">
                                        <span className="font-bold text-slate-800">{i.product_name}</span>
                                        <span className="font-mono font-bold text-emerald-700">{i.current_stock.toFixed(1)} {i.base_unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
