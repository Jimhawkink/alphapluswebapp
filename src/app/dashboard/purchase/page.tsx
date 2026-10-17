'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Supplier {
    supplier_id: number;
    supplier_code: string;
    supplier_name: string;
    phone: string;
    contact_person: string;
    payment_terms: string;
}

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    base_unit: string;
    cost_per_base_unit: number;
    current_stock: number;
    category: string;
}

interface PurchaseItem {
    id: number;
    productId: number;
    productCode: string;
    productName: string;
    unit: string;
    qty: number;
    price: number;
    total: number;
    category: string;
}

export default function PurchaseEntryPage() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [invoiceNo, setInvoiceNo] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
    const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentStatus, setPaymentStatus] = useState('Paid');
    const [vatRate, setVatRate] = useState(0);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<PurchaseItem[]>([]);

    // Add item form
    const [selectedProduct, setSelectedProduct] = useState<number>(0);
    const [qty, setQty] = useState<number>(1);
    const [price, setPrice] = useState<number>(0);
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [ingredientSearch, setIngredientSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');

    const selectedSupplier = suppliers.find(s => s.supplier_id === selectedSupplierId);
    const categories = ['All', ...Array.from(new Set(ingredients.map(i => i.category).filter(Boolean)))];

    const filteredIngredients = ingredients.filter(i => {
        const matchSearch = !ingredientSearch || i.product_name.toLowerCase().includes(ingredientSearch.toLowerCase()) || i.product_code?.toLowerCase().includes(ingredientSearch.toLowerCase());
        const matchCat = categoryFilter === 'All' || i.category === categoryFilter;
        return matchSearch && matchCat;
    });

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [{ data: suppliersData }, { data: ingredientsData }] = await Promise.all([
                    supabase.from('suppliers').select('supplier_id, supplier_code, supplier_name, phone, contact_person, payment_terms').eq('active', true).order('supplier_name'),
                    supabase.from('products_ingredients').select('pid, product_code, product_name, base_unit, cost_per_base_unit, current_stock, category').eq('active', true).order('product_name'),
                ]);
                setSuppliers(suppliersData || []);
                setIngredients(ingredientsData || []);
                await generateInvoiceNo();
            } catch (err) {
                console.error('Error loading data:', err);
                toast.error('Failed to load data');
            }
            setIsLoading(false);
        };
        loadData();
    }, []);

    const generateInvoiceNo = async () => {
        try {
            const { data } = await supabase.from('purchases').select('purchase_no').order('purchase_id', { ascending: false }).limit(1);
            let nextNum = 1;
            if (data && data.length > 0) {
                const match = data[0].purchase_no.match(/INV-(\d+)/);
                if (match) nextNum = parseInt(match[1]) + 1;
            }
            setInvoiceNo(`INV-${String(nextNum).padStart(3, '0')}`);
        } catch {
            setInvoiceNo(`INV-${Date.now().toString().slice(-4)}`);
        }
    };

    const selectIngredientForAdd = (pid: number) => {
        const ingredient = ingredients.find(i => i.pid === pid);
        if (!ingredient) return;
        setSelectedProduct(pid);
        setPrice(ingredient.cost_per_base_unit || 0);
        setSelectedUnit(ingredient.base_unit || 'PCS');
    };

    const addItem = () => {
        if (selectedProduct === 0 || qty <= 0 || price <= 0) {
            toast.error('Select ingredient, quantity and unit price');
            return;
        }
        const ingredient = ingredients.find(i => i.pid === selectedProduct);
        if (!ingredient) return;

        const existingIdx = items.findIndex(i => i.productId === selectedProduct);
        if (existingIdx >= 0) {
            setItems(prev => prev.map((item, idx) =>
                idx === existingIdx ? { ...item, qty: item.qty + qty, total: (item.qty + qty) * item.price } : item
            ));
            toast.success('Quantity updated');
        } else {
            const newItem: PurchaseItem = {
                id: Date.now(),
                productId: ingredient.pid,
                productCode: ingredient.product_code || '',
                productName: ingredient.product_name,
                unit: selectedUnit || ingredient.base_unit || 'PCS',
                qty,
                price,
                total: qty * price,
                category: ingredient.category || '',
            };
            setItems(prev => [...prev, newItem]);
            toast.success(`${ingredient.product_name} added ✓`);
        }
        setSelectedProduct(0);
        setQty(1);
        setPrice(0);
        setSelectedUnit('');
        setIngredientSearch('');
    };

    const updateItemQty = (id: number, newQty: number) => {
        if (newQty <= 0) return;
        setItems(prev => prev.map(item => item.id === id ? { ...item, qty: newQty, total: newQty * item.price } : item));
    };

    const updateItemPrice = (id: number, newPrice: number) => {
        if (newPrice < 0) return;
        setItems(prev => prev.map(item => item.id === id ? { ...item, price: newPrice, total: item.qty * newPrice } : item));
    };

    const removeItem = (id: number) => setItems(prev => prev.filter(item => item.id !== id));

    // Calculations
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const vatAmount = Math.round(subtotal * (vatRate / 100));
    const grandTotal = subtotal + vatAmount - discountAmount;

    const savePurchase = async () => {
        if (!selectedSupplierId) { toast.error('Please select a supplier'); return; }
        if (items.length === 0) { toast.error('Please add at least one item'); return; }
        if (grandTotal <= 0) { toast.error('Total amount cannot be zero'); return; }

        setIsSaving(true);
        try {
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            // 1. Create purchase header
            const { data: purchaseData, error: purchaseError } = await supabase
                .from('purchases')
                .insert({
                    purchase_no: invoiceNo,
                    purchase_date: purchaseDate,
                    supplier_id: selectedSupplierId,
                    supplier_name: selectedSupplier?.supplier_name || '',
                    supplier_invoice: supplierInvoiceNo,
                    sub_total: subtotal,
                    discount: discountAmount,
                    vat: vatAmount,
                    grand_total: grandTotal,
                    status: 'Completed',
                    payment_status: paymentStatus,
                    created_by: currentUser?.name || currentUser?.username || 'System',
                })
                .select()
                .single();

            if (purchaseError) throw purchaseError;
            const purchaseId = purchaseData.purchase_id;

            // 2. Insert purchase items
            const purchaseItemsData = items.map(item => ({
                purchase_id: purchaseId,
                product_id: item.productId,
                product_code: item.productCode || '',
                product_name: item.productName,
                unit: item.unit || 'PCS',
                quantity: item.qty,
                rate: item.price,
                total_amount: item.total,
            }));

            const { error: itemsError } = await supabase.from('purchase_products').insert(purchaseItemsData);
            if (itemsError) throw itemsError;

            // 3. Update stock for each ingredient
            const stockUpdates = items.map(async (item) => {
                const { data: ing } = await supabase
                    .from('products_ingredients')
                    .select('pid, current_stock')
                    .eq('pid', item.productId)
                    .single();
                if (ing) {
                    await supabase
                        .from('products_ingredients')
                        .update({ current_stock: (ing.current_stock || 0) + item.qty, updated_at: new Date().toISOString() })
                        .eq('pid', ing.pid);
                }
            });
            await Promise.all(stockUpdates);

            toast.success(`✅ Purchase ${invoiceNo} saved! Stock updated.`);

            // Reset
            setItems([]);
            setSelectedSupplierId(0);
            setSupplierInvoiceNo('');
            setDiscountAmount(0);
            setVatRate(0);
            setNotes('');
            await generateInvoiceNo();
        } catch (err: any) {
            console.error('Error saving purchase:', err);
            toast.error(err?.message || 'Failed to save purchase');
        }
        setIsSaving(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Loading purchase entry form...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* ── COMPACT GLASSMORPHIIC HEADER ── */}
            <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-200/50 flex items-center justify-center text-emerald-600 text-lg shadow-xs">
                            📥
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 tracking-tight">New Purchase Entry</h1>
                            <p className="text-xs text-slate-500">Record incoming stock & automatically update inventory balances</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                            <span className="text-[11px] text-slate-500">Invoice:</span>
                            <span className="ml-1.5 font-mono text-xs font-bold text-slate-800">{invoiceNo}</span>
                        </div>
                        <a
                            href="/dashboard/purchases"
                            className="px-3.5 py-1.5 bg-white/80 hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-xs hover:border-slate-300 transition-all flex items-center gap-1.5"
                        >
                            <span>📋</span> All Records
                        </a>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* ── LEFT: Form & Item Entry (2 cols) ── */}
                <div className="lg:col-span-2 space-y-4">

                    {/* Purchase Header Details */}
                    <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">🏢</span>
                            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Purchase Header</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Purchase Date</label>
                                <input
                                    type="date"
                                    value={purchaseDate}
                                    onChange={(e) => setPurchaseDate(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Supplier Ref / Invoice #</label>
                                <input
                                    type="text"
                                    value={supplierInvoiceNo}
                                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                    placeholder="e.g. INV-9042"
                                    className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Payment Status</label>
                                <select
                                    value={paymentStatus}
                                    onChange={(e) => setPaymentStatus(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all cursor-pointer"
                                >
                                    <option value="Paid">Paid</option>
                                    <option value="Unpaid">Unpaid / On Credit</option>
                                </select>
                            </div>
                        </div>

                        {/* Supplier Selector */}
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Supplier *</label>
                            <select
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                                className={`w-full px-3 py-1.5 bg-slate-50/70 border rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all cursor-pointer ${
                                    !selectedSupplierId ? 'border-amber-300/80 bg-amber-500/5' : 'border-slate-200'
                                }`}
                            >
                                <option value={0}>— Select Vendor / Supplier —</option>
                                {suppliers.map(s => (
                                    <option key={s.supplier_id} value={s.supplier_id}>
                                        {s.supplier_code} — {s.supplier_name} {s.phone ? `(${s.phone})` : ''}
                                    </option>
                                ))}
                            </select>
                            {selectedSupplier && (
                                <div className="mt-2 p-2.5 bg-emerald-500/5 rounded-xl border border-emerald-200/40 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-800">{selectedSupplier.supplier_name}</span>
                                        {selectedSupplier.contact_person && (
                                            <span className="text-[11px] text-slate-400">({selectedSupplier.contact_person})</span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-emerald-700 font-medium">{selectedSupplier.payment_terms || 'Standard Terms'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Ingredient Selector Card */}
                    <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">🥬</span>
                                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add Ingredient</h2>
                            </div>
                            <span className="text-[11px] text-slate-400">{filteredIngredients.length} ingredients available</span>
                        </div>

                        {/* Search & Filter */}
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                placeholder="🔍 Filter ingredient..."
                                value={ingredientSearch}
                                onChange={(e) => setIngredientSearch(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800"
                            />
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-700 cursor-pointer"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Add Row Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                            <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Item *</label>
                                <select
                                    value={selectedProduct}
                                    onChange={(e) => selectIngredientForAdd(Number(e.target.value))}
                                    className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all cursor-pointer"
                                >
                                    <option value={0}>— Select item —</option>
                                    {filteredIngredients.map(i => (
                                        <option key={i.pid} value={i.pid}>
                                            {i.product_code ? `${i.product_code} - ` : ''}{i.product_name} ({i.base_unit || 'PCS'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => setQty(Number(e.target.value))}
                                    min={0.001}
                                    step={0.001}
                                    className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Cost / Unit</label>
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                    min={0}
                                    step={0.01}
                                    className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-mono"
                                />
                            </div>
                            <div>
                                <button
                                    onClick={addItem}
                                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1"
                                >
                                    <span>➕</span> Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Items Grid */}
                    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/70 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Order Items ({items.length})
                            </span>
                            {items.length > 0 && (
                                <button
                                    onClick={() => { if (confirm('Clear all items?')) setItems([]); }}
                                    className="text-[11px] text-rose-600 hover:underline"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        {items.length === 0 ? (
                            <div className="p-10 text-center text-slate-400">
                                <span className="text-3xl block mb-2 opacity-50">🛒</span>
                                <p className="text-xs font-semibold text-slate-600">No items added to this purchase yet</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Select an ingredient above and specify quantity & unit cost</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] text-slate-500 font-semibold uppercase">
                                            <th className="py-2 px-3">#</th>
                                            <th className="py-2 px-3">Item</th>
                                            <th className="py-2 px-3 text-center">Unit</th>
                                            <th className="py-2 px-3 text-center">Qty</th>
                                            <th className="py-2 px-3 text-right">Rate</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                            <th className="py-2 px-3 text-center"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {items.map((item, idx) => (
                                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                                <td className="py-2 px-3">
                                                    <p className="font-semibold text-slate-800 text-xs">{item.productName}</p>
                                                    {item.productCode && <p className="text-[10px] text-slate-400 font-mono">{item.productCode}</p>}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                                                        {item.unit}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <input
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) => updateItemQty(item.id, parseFloat(e.target.value) || 0)}
                                                        min={0.001}
                                                        step={0.001}
                                                        className="w-16 px-1.5 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    <input
                                                        type="number"
                                                        value={item.price}
                                                        onChange={(e) => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                                        min={0}
                                                        step={0.01}
                                                        className="w-20 px-1.5 py-1 text-right bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                                    Ksh {item.total.toLocaleString()}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <button
                                                        onClick={() => removeItem(item.id)}
                                                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Summary & Confirm Panel (1 col) ── */}
                <div className="space-y-4">
                    <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3.5 sticky top-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">📊</span>
                            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Purchase Summary</h2>
                        </div>

                        {/* Adjustments */}
                        <div className="space-y-2.5 text-xs">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Discount (Ksh)</label>
                                <input
                                    type="number"
                                    value={discountAmount}
                                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                                    min={0}
                                    max={subtotal}
                                    step={0.01}
                                    className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 font-mono text-slate-800"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 mb-1">VAT</label>
                                <div className="flex gap-1.5">
                                    {[0, 8, 16].map(r => (
                                        <button
                                            key={r}
                                            onClick={() => setVatRate(r)}
                                            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all ${
                                                vatRate === r
                                                    ? 'bg-slate-800 text-white shadow-xs'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            {r}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Totals Breakdown */}
                        <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/50 space-y-1.5 text-xs">
                            <div className="flex justify-between text-slate-600">
                                <span>Sub Total:</span>
                                <span className="font-mono">Ksh {subtotal.toLocaleString()}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <span>Discount:</span>
                                    <span className="font-mono">- Ksh {discountAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {vatRate > 0 && (
                                <div className="flex justify-between text-indigo-700">
                                    <span>VAT ({vatRate}%):</span>
                                    <span className="font-mono">+ Ksh {vatAmount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-slate-900 text-sm">
                                <span>Grand Total:</span>
                                <span className="font-mono text-emerald-700 text-base">Ksh {grandTotal.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Optional Notes */}
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Notes (Optional)</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Delivery remarks, batch memo..."
                                className="w-full px-2.5 py-1.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-slate-800 resize-none"
                            />
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={savePurchase}
                            disabled={items.length === 0 || isSaving || grandTotal <= 0 || !selectedSupplierId}
                            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Saving Purchase...' : '💾 Save & Update Inventory'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
