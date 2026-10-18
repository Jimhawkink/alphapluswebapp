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
                    <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500">Loading purchase entry form...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* ── HERO BANNER (MATCHING DASHBOARD STYLE) ── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white shadow-xl">
                <div className="absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />
                <div className="absolute right-32 -top-10 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />

                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white text-2xl shadow-md">
                            📥
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">New Purchase Entry</h1>
                            <p className="text-emerald-100 text-sm font-medium mt-0.5">Record incoming goods, track supplier rates & sync inventory stock</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="px-4 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl flex items-center gap-2">
                            <span className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Invoice No</span>
                            <span className="font-mono text-base font-black text-white">{invoiceNo}</span>
                        </div>
                        <a
                            href="/dashboard/purchases"
                            className="px-5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 font-extrabold rounded-xl text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <span>📋</span> All Records
                        </a>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ── LEFT: Purchase Details & Item Entry (2 cols) ── */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Purchase Header Details */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="text-lg">🏢</span>
                            <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide">Purchase Header Information</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">📅 Purchase Date</label>
                                <input
                                    type="date"
                                    value={purchaseDate}
                                    onChange={(e) => setPurchaseDate(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">📄 Supplier Invoice #</label>
                                <input
                                    type="text"
                                    value={supplierInvoiceNo}
                                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                    placeholder="e.g. INV-9042"
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">💳 Payment Status</label>
                                <select
                                    value={paymentStatus}
                                    onChange={(e) => setPaymentStatus(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                                >
                                    <option value="Paid">✅ Paid</option>
                                    <option value="Unpaid">❌ Unpaid / On Credit</option>
                                </select>
                            </div>
                        </div>

                        {/* Supplier Selector */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">🏢 Supplier / Vendor *</label>
                            <select
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                                className={`w-full px-3.5 py-2.5 bg-gray-50 border rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer ${
                                    !selectedSupplierId ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'
                                }`}
                            >
                                <option value={0}>— Select Supplier —</option>
                                {suppliers.map(s => (
                                    <option key={s.supplier_id} value={s.supplier_id}>
                                        {s.supplier_code} — {s.supplier_name} {s.phone ? `(${s.phone})` : ''}
                                    </option>
                                ))}
                            </select>
                            {selectedSupplier && (
                                <div className="mt-2.5 p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2.5">
                                        <span className="font-bold text-gray-900">{selectedSupplier.supplier_name}</span>
                                        {selectedSupplier.contact_person && (
                                            <span className="text-xs text-gray-500 font-medium">({selectedSupplier.contact_person})</span>
                                        )}
                                    </div>
                                    <span className="text-xs text-emerald-800 font-bold bg-emerald-100 px-2.5 py-1 rounded-lg">
                                        {selectedSupplier.payment_terms || 'Standard Terms'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Add Ingredients Card */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🥬</span>
                                <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide">Add Items To Purchase</h2>
                            </div>
                            <span className="text-xs font-bold text-gray-500">{filteredIngredients.length} ingredients found</span>
                        </div>

                        {/* Search & Filter */}
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="text"
                                placeholder="🔍 Search ingredients..."
                                value={ingredientSearch}
                                onChange={(e) => setIngredientSearch(e.target.value)}
                                className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-emerald-500 transition-all text-gray-800"
                            />
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-emerald-500 transition-all text-gray-800 cursor-pointer"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Row Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Ingredient *</label>
                                <select
                                    value={selectedProduct}
                                    onChange={(e) => selectIngredientForAdd(Number(e.target.value))}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                                >
                                    <option value={0}>— Choose Ingredient —</option>
                                    {filteredIngredients.map(i => (
                                        <option key={i.pid} value={i.pid}>
                                            {i.product_code ? `${i.product_code} - ` : ''}{i.product_name} ({i.base_unit || 'PCS'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => setQty(Number(e.target.value))}
                                    min={0.001}
                                    step={0.001}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Cost / Unit (Ksh)</label>
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                    min={0}
                                    step={0.01}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                            <div>
                                <button
                                    onClick={addItem}
                                    className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 text-white rounded-xl text-sm font-extrabold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span>➕</span> Add Item
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Order Items List */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 to-emerald-50/50 border-b border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                                Line Items ({items.length})
                            </span>
                            {items.length > 0 && (
                                <button
                                    onClick={() => { if (confirm('Clear all items?')) setItems([]); }}
                                    className="text-xs font-bold text-red-600 hover:underline"
                                >
                                    Clear all items
                                </button>
                            )}
                        </div>

                        {items.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <span className="text-4xl block mb-2 opacity-50">🛒</span>
                                <p className="text-sm font-bold text-gray-700">No items added yet</p>
                                <p className="text-xs text-gray-400 mt-0.5">Select an ingredient above and click Add Item</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 font-extrabold uppercase">
                                            <th className="py-3 px-4">#</th>
                                            <th className="py-3 px-4">Ingredient</th>
                                            <th className="py-3 px-4 text-center">Unit</th>
                                            <th className="py-3 px-4 text-center">Qty</th>
                                            <th className="py-3 px-4 text-right">Unit Cost</th>
                                            <th className="py-3 px-4 text-right">Total</th>
                                            <th className="py-3 px-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((item, idx) => (
                                            <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="py-3 px-4 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                <td className="py-3 px-4">
                                                    <p className="font-bold text-gray-900 text-sm">{item.productName}</p>
                                                    {item.productCode && <p className="text-xs text-gray-400 font-mono">{item.productCode}</p>}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-semibold text-xs font-mono">
                                                        {item.unit}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <input
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) => updateItemQty(item.id, parseFloat(e.target.value) || 0)}
                                                        min={0.001}
                                                        step={0.001}
                                                        className="w-20 px-2 py-1 text-center bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold font-mono focus:outline-none focus:border-emerald-500"
                                                    />
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <input
                                                        type="number"
                                                        value={item.price}
                                                        onChange={(e) => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                                        min={0}
                                                        step={0.01}
                                                        className="w-24 px-2 py-1 text-right bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold font-mono focus:outline-none focus:border-emerald-500"
                                                    />
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono font-black text-gray-900 text-sm">
                                                    Ksh {item.total.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <button
                                                        onClick={() => removeItem(item.id)}
                                                        className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors text-sm font-bold"
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
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4 sticky top-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="text-lg">📊</span>
                            <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide">Purchase Summary</h2>
                        </div>

                        {/* Adjustments */}
                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">🔖 Discount (Ksh)</label>
                                <input
                                    type="number"
                                    value={discountAmount}
                                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                                    min={0}
                                    max={subtotal}
                                    step={0.01}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 font-mono font-bold text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">📈 VAT (%)</label>
                                <div className="flex gap-2">
                                    {[0, 8, 16].map(r => (
                                        <button
                                            key={r}
                                            onClick={() => setVatRate(r)}
                                            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                vatRate === r
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            {r}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Totals Breakdown */}
                        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-sm">
                            <div className="flex justify-between text-gray-700 font-medium">
                                <span>Sub Total:</span>
                                <span className="font-mono font-bold">Ksh {subtotal.toLocaleString()}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-orange-700 font-medium">
                                    <span>Discount:</span>
                                    <span className="font-mono font-bold">- Ksh {discountAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {vatRate > 0 && (
                                <div className="flex justify-between text-blue-700 font-medium">
                                    <span>VAT ({vatRate}%):</span>
                                    <span className="font-mono font-bold">+ Ksh {vatAmount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2.5 border-t border-emerald-200 font-black text-gray-900 text-base">
                                <span>Grand Total:</span>
                                <span className="font-mono text-emerald-800 text-2xl font-black">
                                    Ksh {grandTotal.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Optional Notes */}
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">📝 Notes (Optional)</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Delivery remarks, batch memo..."
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-gray-800 resize-none font-medium"
                            />
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={savePurchase}
                            disabled={items.length === 0 || isSaving || grandTotal <= 0 || !selectedSupplierId}
                            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 text-white rounded-xl text-base font-black shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Saving Purchase...' : '💾 Save & Update Inventory'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
