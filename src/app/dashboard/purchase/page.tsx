'use client';

import { useState, useEffect, useCallback } from 'react';
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
            toast.error('Select ingredient, enter quantity and price');
            return;
        }
        const ingredient = ingredients.find(i => i.pid === selectedProduct);
        if (!ingredient) return;

        const existingIdx = items.findIndex(i => i.productId === selectedProduct);
        if (existingIdx >= 0) {
            setItems(prev => prev.map((item, idx) =>
                idx === existingIdx ? { ...item, qty: item.qty + qty, total: (item.qty + qty) * item.price } : item
            ));
            toast.success('Quantity updated ↑');
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
                product_name: item.productName,
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
        } catch (err) {
            console.error('Error saving purchase:', err);
            toast.error('Failed to save purchase. Check console for details.');
        }
        setIsSaving(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">Loading purchase data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            {/* ── HEADER ── */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 p-6 shadow-2xl">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, white 1px, transparent 1px)', backgroundSize: '35px 35px' }} />
                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <span className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/30 shadow-lg">📥</span>
                            New Purchase Entry
                        </h1>
                        <p className="text-emerald-100 mt-1 font-medium">Record purchases • Update stock automatically</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
                            <span className="text-emerald-100 text-xs font-semibold">Invoice #</span>
                            <span className="ml-2 text-white font-black text-lg">{invoiceNo}</span>
                        </div>
                        <a href="/dashboard/purchases" className="flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-700 rounded-xl font-bold hover:shadow-xl transition-all hover:scale-105 active:scale-95 shadow-lg">
                            📋 View Records
                        </a>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ── LEFT: Main Entry ── */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Purchase Header */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
                        <h2 className="text-base font-black text-gray-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                            <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-sm shadow">🏢</span>
                            Purchase Details
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">📅 Purchase Date</label>
                                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">📄 Supplier Invoice No</label>
                                <input type="text" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                    placeholder="Supplier's ref number..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">💳 Payment Status</label>
                                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all cursor-pointer">
                                    <option value="Paid">✅ Paid</option>
                                    <option value="Unpaid">❌ Unpaid / Credit</option>
                                </select>
                            </div>
                        </div>

                        {/* Supplier Select */}
                        <div className="mt-4">
                            <label className="text-xs font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">🏢 Supplier <span className="text-red-500">*</span></label>
                            <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                                className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-800 font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all cursor-pointer ${!selectedSupplierId ? 'border-orange-200' : 'border-gray-200'}`}>
                                <option value={0}>— Select Supplier —</option>
                                {suppliers.map(s => (
                                    <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_code} — {s.supplier_name} {s.phone ? `(${s.phone})` : ''}</option>
                                ))}
                            </select>
                            {suppliers.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">⚠️ No suppliers found. <a href="/dashboard/suppliers" className="underline">Add suppliers first →</a></p>
                            )}
                            {selectedSupplier && (
                                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white font-black shadow-sm">
                                        {selectedSupplier.supplier_name[0]}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">{selectedSupplier.supplier_name}</p>
                                        <div className="flex gap-3 text-xs text-gray-500">
                                            {selectedSupplier.phone && <span>📞 {selectedSupplier.phone}</span>}
                                            {selectedSupplier.contact_person && <span>👤 {selectedSupplier.contact_person}</span>}
                                            {selectedSupplier.payment_terms && <span>📅 {selectedSupplier.payment_terms}</span>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Add Ingredient Panel */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
                        <h2 className="text-base font-black text-gray-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                            <span className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-white text-sm shadow">🥬</span>
                            Add Ingredients
                        </h2>

                        {/* Search + Category filter */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <input type="text" placeholder="🔍 Search ingredient..." value={ingredientSearch}
                                onChange={(e) => setIngredientSearch(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all" />
                            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all cursor-pointer">
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-5 gap-3 items-end">
                            <div className="col-span-2">
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Ingredient *</label>
                                <select value={selectedProduct} onChange={(e) => selectIngredientForAdd(Number(e.target.value))}
                                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all cursor-pointer">
                                    <option value={0}>— Select —</option>
                                    {filteredIngredients.map(i => (
                                        <option key={i.pid} value={i.pid}>
                                            {i.product_code ? `${i.product_code} - ` : ''}{i.product_name} ({i.base_unit || 'PCS'})
                                        </option>
                                    ))}
                                </select>
                                {selectedProduct > 0 && (() => {
                                    const ing = ingredients.find(i => i.pid === selectedProduct);
                                    return ing ? (
                                        <p className="text-xs text-emerald-600 mt-1 font-medium">
                                            Current stock: <b>{ing.current_stock} {ing.base_unit}</b> • Usual price: Ksh {ing.cost_per_base_unit}
                                        </p>
                                    ) : null;
                                })()}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Quantity</label>
                                <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))}
                                    min={0.001} step={0.001}
                                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Unit Price (Ksh)</label>
                                <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
                                    min={0} step={0.01}
                                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all" />
                            </div>
                            <div>
                                <button onClick={addItem}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5">
                                    ➕ Add
                                </button>
                                {selectedProduct > 0 && price > 0 && qty > 0 && (
                                    <p className="text-xs text-gray-400 text-center mt-1">= Ksh {(qty * price).toLocaleString()}</p>
                                )}
                            </div>
                        </div>
                        {ingredients.length === 0 && (
                            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">⚠️ No ingredients found. <a href="/dashboard/ingredients" className="underline">Add ingredients first →</a></p>
                        )}
                    </div>

                    {/* Items List */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
                        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
                                🛒 Purchase Items
                                <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full shadow-sm">{items.length}</span>
                            </h2>
                            {items.length > 0 && (
                                <button onClick={() => { if (confirm('Clear all items?')) setItems([]); }}
                                    className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold transition-all">
                                    🗑️ Clear All
                                </button>
                            )}
                        </div>

                        {items.length === 0 ? (
                            <div className="p-16 text-center text-gray-400">
                                <span className="text-5xl block mb-3">📭</span>
                                <p className="font-semibold">No items added yet</p>
                                <p className="text-sm mt-1 text-gray-300">Select an ingredient above and click ➕ Add</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">#</th>
                                            <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Ingredient</th>
                                            <th className="text-center py-3 px-4 text-xs font-bold text-gray-500 uppercase">Unit</th>
                                            <th className="text-center py-3 px-4 text-xs font-bold text-gray-500 uppercase">Qty</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Price</th>
                                            <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Total</th>
                                            <th className="text-center py-3 px-4 text-xs font-bold text-gray-500 uppercase">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => (
                                            <tr key={item.id} className={`border-t border-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-emerald-50/30`}>
                                                <td className="py-3 px-4 text-gray-400 text-sm">{idx + 1}</td>
                                                <td className="py-3 px-4">
                                                    <p className="font-bold text-gray-800 text-sm">{item.productName}</p>
                                                    <p className="text-xs text-gray-400">{item.productCode}{item.category ? ` • ${item.category}` : ''}</p>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">{item.unit}</span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <input type="number" value={item.qty} onChange={(e) => updateItemQty(item.id, parseFloat(e.target.value) || 0)}
                                                        min={0.001} step={0.001}
                                                        className="w-20 text-center px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:border-emerald-400 transition-all" />
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-xs text-gray-400">Ksh</span>
                                                        <input type="number" value={item.price} onChange={(e) => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                                            min={0} step={0.01}
                                                            className="w-24 text-right px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-emerald-400 transition-all" />
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className="font-black text-emerald-600">Ksh {item.total.toLocaleString()}</span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <button onClick={() => removeItem(item.id)} className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-all hover:scale-110">🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-gradient-to-r from-emerald-50 to-teal-50 border-t-2 border-emerald-200">
                                            <td colSpan={5} className="py-4 px-4 font-black text-gray-700 text-right uppercase text-sm">
                                                {items.length} items • {items.reduce((s, i) => s + i.qty, 0).toFixed(2)} total qty
                                            </td>
                                            <td className="py-4 px-4 text-right font-black text-xl text-emerald-700">
                                                Ksh {subtotal.toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Summary Panel ── */}
                <div className="space-y-5">
                    {/* Summary */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg sticky top-4">
                        <h2 className="text-base font-black text-gray-800 mb-5 flex items-center gap-2 uppercase tracking-wide">
                            <span className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm shadow">📊</span>
                            Purchase Summary
                        </h2>

                        {/* Adjustments */}
                        <div className="space-y-4 mb-5">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">🔖 Discount (Ksh)</label>
                                <input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                                    min={0} max={subtotal} step={0.01}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 transition-all" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">📈 VAT (%)</label>
                                <div className="flex gap-2">
                                    {[0, 8, 16].map(r => (
                                        <button key={r} onClick={() => setVatRate(r)}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${vatRate === r ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-orange-50'}`}>
                                            {r}%
                                        </button>
                                    ))}
                                    <input type="number" value={vatRate} onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                                        min={0} max={100} step={0.5}
                                        placeholder="Custom"
                                        className="w-20 px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center focus:outline-none focus:border-orange-400 transition-all" />
                                </div>
                            </div>
                        </div>

                        {/* Totals breakdown */}
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100 space-y-3 mb-5">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Sub Total</span>
                                <span className="font-bold text-gray-800">Ksh {subtotal.toLocaleString()}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Discount</span>
                                    <span className="font-bold text-orange-600">— Ksh {discountAmount.toLocaleString()}</span>
                                </div>
                            )}
                            {vatRate > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">VAT ({vatRate}%)</span>
                                    <span className="font-bold text-blue-600">+ Ksh {vatAmount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center border-t border-emerald-200 pt-3">
                                <span className="font-black text-emerald-800 uppercase tracking-wide text-sm">GRAND TOTAL</span>
                                <span className="font-black text-2xl text-emerald-700">Ksh {grandTotal.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Payment badge */}
                        <div className={`px-4 py-3 rounded-xl border mb-5 flex items-center gap-2 ${paymentStatus === 'Paid' ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-200'}`}>
                            <span className="text-lg">{paymentStatus === 'Paid' ? '💳' : '❌'}</span>
                            <div>
                                <p className="text-xs text-gray-500">Payment Status</p>
                                <p className={`font-bold text-sm ${paymentStatus === 'Paid' ? 'text-cyan-700' : 'text-red-700'}`}>{paymentStatus}</p>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="mb-5">
                            <label className="text-xs font-bold text-gray-500 mb-1.5 block">📝 Notes (optional)</label>
                            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                                placeholder="Purchase notes..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all resize-none" />
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <button onClick={savePurchase} disabled={items.length === 0 || isSaving || grandTotal <= 0 || !selectedSupplierId}
                                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl font-black text-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-emerald-300/40">
                                {isSaving ? (
                                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                                ) : (
                                    <>💾 Save Purchase</>
                                )}
                            </button>
                            {!selectedSupplierId && <p className="text-xs text-red-500 text-center">⚠️ Select a supplier to save</p>}
                            {items.length === 0 && <p className="text-xs text-orange-500 text-center">⚠️ Add at least one item</p>}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
                        <h3 className="font-black text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">📈 Quick Stats</h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Line Items', value: items.length, icon: '📦' },
                                { label: 'Total Quantity', value: items.reduce((s, i) => s + i.qty, 0).toFixed(2), icon: '⚖️' },
                                { label: 'Avg Unit Cost', value: items.length > 0 ? `Ksh ${Math.round(subtotal / items.reduce((s, i) => s + i.qty, 0)).toLocaleString()}` : 'Ksh 0', icon: '💹' },
                                { label: 'Most Expensive', value: items.length > 0 ? `Ksh ${Math.max(...items.map(i => i.price)).toLocaleString()}` : '—', icon: '🏆' },
                            ].map(stat => (
                                <div key={stat.label} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <span>{stat.icon}</span>
                                        <span className="text-gray-600 text-sm">{stat.label}</span>
                                    </div>
                                    <span className="font-black text-gray-800">{stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Low Stock Alert */}
                    {ingredients.filter(i => i.current_stock <= (i as any).reorder_point && i.current_stock > 0).length > 0 && (
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-4 border border-red-200">
                            <h4 className="font-bold text-red-700 mb-3 flex items-center gap-2 text-sm">⚠️ Low Stock Items</h4>
                            <div className="space-y-2">
                                {ingredients.filter(i => i.current_stock <= 5).slice(0, 5).map(i => (
                                    <div key={i.pid} className="flex justify-between text-xs">
                                        <span className="text-gray-700 font-medium">{i.product_name}</span>
                                        <span className="text-red-600 font-bold">{i.current_stock} {i.base_unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
