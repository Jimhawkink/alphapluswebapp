'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Ingredient {
    pid: number;
    product_code: string;
    product_name: string;
    category: string;
    current_stock: number;
    base_unit: string;
    purchase_cost: number;
}

interface TransferRecord {
    movement_id: number;
    movement_date: string;
    product_name: string;
    product_code: string;
    quantity: number;
    unit: string;
    reason: string;
    created_by: string;
    created_at: string;
}

interface TransferItem {
    pid: number;
    product_name: string;
    base_unit: string;
    available: number;
    qty: string;
}

const LOCATIONS = ['Main Kitchen', 'Bar', 'Butchery', 'Pastry Section', 'Rooftop Kitchen', 'Store Room', 'Cold Room', 'Other'];

export default function StockTransferPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [transfers, setTransfers] = useState<TransferRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [transfersLoading, setTransfersLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'transfer' | 'history'>('transfer');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

    // Transfer form
    const [fromLocation, setFromLocation] = useState('Main Kitchen');
    const [toLocation, setToLocation] = useState('Bar');
    const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
    const [transferNote, setTransferNote] = useState('');
    const [selectedItems, setSelectedItems] = useState<TransferItem[]>([]);
    const [showAddItem, setShowAddItem] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [addSelected, setAddSelected] = useState<Ingredient | null>(null);
    const [addQty, setAddQty] = useState('');

    const loadIngredients = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('products_ingredients')
                .select('pid, product_code, product_name, category, current_stock, base_unit, purchase_cost')
                .eq('active', true)
                .order('product_name');
            if (error) throw error;
            setIngredients((data || []).map((d: any) => ({
                ...d,
                current_stock: d.current_stock || 0,
                purchase_cost: d.purchase_cost || 0,
            })));
        } catch {
            toast.error('Failed to load ingredients');
        }
        setLoading(false);
    }, []);

    const loadTransfers = useCallback(async () => {
        setTransfersLoading(true);
        try {
            const { data, error } = await supabase
                .from('stock_movements')
                .select('movement_id, movement_date, product_name, product_code, quantity, unit, reason, created_by, created_at')
                .eq('movement_type', 'Transfer')
                .gte('movement_date', dateFrom)
                .lte('movement_date', dateTo)
                .order('created_at', { ascending: false })
                .limit(300);
            if (error) throw error;
            setTransfers((data || []) as TransferRecord[]);
        } catch {
            toast.error('Failed to load transfers');
        }
        setTransfersLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { loadIngredients(); }, [loadIngredients]);
    useEffect(() => { if (activeTab === 'history') loadTransfers(); }, [activeTab, loadTransfers]);

    const filteredIngredients = ingredients.filter(i =>
        i.product_name.toLowerCase().includes(addSearch.toLowerCase()) ||
        i.product_code.toLowerCase().includes(addSearch.toLowerCase())
    );

    const addItemToTransfer = () => {
        if (!addSelected) { toast.error('Select an ingredient'); return; }
        const qty = parseFloat(addQty);
        if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity'); return; }
        if (qty > addSelected.current_stock) {
            toast.error(`Only ${addSelected.current_stock.toFixed(2)} ${addSelected.base_unit} available`);
            return;
        }
        // Check if already in list
        if (selectedItems.find(i => i.pid === addSelected.pid)) {
            toast.error('Already added — edit the quantity below');
            return;
        }
        setSelectedItems(prev => [...prev, {
            pid: addSelected.pid,
            product_name: addSelected.product_name,
            base_unit: addSelected.base_unit,
            available: addSelected.current_stock,
            qty: addQty,
        }]);
        setAddQty('');
        setAddSelected(null);
        setAddSearch('');
        setShowAddItem(false);
    };

    const removeItem = (pid: number) => setSelectedItems(prev => prev.filter(i => i.pid !== pid));
    const updateItemQty = (pid: number, qty: string) => setSelectedItems(prev => prev.map(i => i.pid === pid ? { ...i, qty } : i));

    const handleTransfer = async () => {
        if (fromLocation === toLocation) { toast.error('From and To locations must be different'); return; }
        if (selectedItems.length === 0) { toast.error('Add at least one ingredient to transfer'); return; }
        const invalid = selectedItems.find(i => !parseFloat(i.qty) || parseFloat(i.qty) <= 0 || parseFloat(i.qty) > i.available);
        if (invalid) { toast.error(`Invalid quantity for ${invalid.product_name}`); return; }

        setIsSaving(true);
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const user = userData?.name || 'Admin';
        const refNo = `TRF-${Date.now()}`;

        try {
            for (const item of selectedItems) {
                const qty = parseFloat(item.qty);
                const ing = ingredients.find(i => i.pid === item.pid);
                if (!ing) continue;

                // Deduct from source (current stock)
                await supabase.from('products_ingredients')
                    .update({ current_stock: ing.current_stock - qty, updated_at: new Date().toISOString() })
                    .eq('pid', item.pid);

                // Log Transfer Out
                await supabase.from('stock_movements').insert({
                    movement_date: transferDate,
                    product_id: item.pid,
                    product_name: item.product_name,
                    product_code: ing.product_code,
                    movement_type: 'Transfer',
                    quantity: qty,
                    unit: item.base_unit,
                    unit_cost: ing.purchase_cost,
                    total_cost: qty * ing.purchase_cost,
                    reason: `Transfer from ${fromLocation} → ${toLocation}${transferNote ? ': ' + transferNote : ''}`,
                    reference_no: refNo,
                    reference_type: 'Stock Transfer',
                    created_by: user,
                });
            }

            toast.success(`✅ Transfer complete! ${selectedItems.length} item(s) transferred from ${fromLocation} to ${toLocation}`);
            setSelectedItems([]);
            setTransferNote('');
            loadIngredients();
        } catch (err: any) {
            toast.error('Transfer failed: ' + err.message);
        }
        setIsSaving(false);
    };

    const totalTransferValue = selectedItems.reduce((sum, item) => {
        const ing = ingredients.find(i => i.pid === item.pid);
        return sum + (parseFloat(item.qty) || 0) * (ing?.purchase_cost || 0);
    }, 0);

    const fmt = (n: number) => `Ksh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        🔄
                    </span>
                    Stock Transfer
                </h1>
                <button
                    onClick={loadIngredients}
                    className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    🔄 Refresh
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <p className="text-sm text-blue-800">
                    <strong>Stock Transfer</strong> moves raw ingredients between kitchen sections/locations. 
                    Dish stock is automatically managed through the Recipe production system.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('transfer')}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${activeTab === 'transfer' ? 'bg-sky-600 text-white shadow-md' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
                >
                    🔄 New Transfer
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${activeTab === 'history' ? 'bg-sky-600 text-white shadow-md' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
                >
                    📋 Transfer History
                </button>
            </div>

            {activeTab === 'transfer' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Transfer Form */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* From / To / Date */}
                        <div className="bg-white rounded-2xl border p-5 space-y-4">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Transfer Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Location <span className="text-red-500">*</span></label>
                                    <select value={fromLocation} onChange={e => setFromLocation(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none">
                                        {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Location <span className="text-red-500">*</span></label>
                                    <select value={toLocation} onChange={e => setToLocation(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none">
                                        {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Transfer Date</label>
                                    <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none" />
                                </div>
                            </div>
                            {fromLocation === toLocation && (
                                <p className="text-xs text-red-600 font-semibold">⚠️ From and To locations must be different</p>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Note / Reason (Optional)</label>
                                <input type="text" value={transferNote} onChange={e => setTransferNote(e.target.value)}
                                    placeholder="e.g. Evening prep, event setup..."
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none" />
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="bg-white rounded-2xl border overflow-hidden">
                            <div className="px-5 py-4 border-b flex items-center justify-between">
                                <h3 className="font-bold text-gray-800">Transfer Items</h3>
                                <button
                                    onClick={() => setShowAddItem(true)}
                                    className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl text-sm font-bold hover:shadow-md transition-all"
                                >
                                    ➕ Add Ingredient
                                </button>
                            </div>

                            {selectedItems.length === 0 ? (
                                <div className="py-16 text-center text-gray-400">
                                    <div className="text-5xl mb-3">📦</div>
                                    <p className="text-sm font-semibold">No items added yet</p>
                                    <p className="text-xs mt-1">Click ➕ Add Ingredient to start</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-sky-600 to-blue-600">
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase text-white">Ingredient</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold uppercase text-white">Available</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold uppercase text-white">Transfer Qty</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold uppercase text-white">Value</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold uppercase text-white"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedItems.map(item => {
                                            const ing = ingredients.find(i => i.pid === item.pid);
                                            const val = (parseFloat(item.qty) || 0) * (ing?.purchase_cost || 0);
                                            const overLimit = parseFloat(item.qty) > item.available;
                                            return (
                                                <tr key={item.pid} className="border-b border-gray-100 hover:bg-sky-50/30">
                                                    <td className="px-4 py-3 font-semibold text-gray-800">{item.product_name}</td>
                                                    <td className="px-4 py-3 text-center text-sm text-gray-500">
                                                        {item.available.toFixed(2)} {item.base_unit}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <input
                                                                type="number"
                                                                value={item.qty}
                                                                onChange={e => updateItemQty(item.pid, e.target.value)}
                                                                min="0"
                                                                step="0.01"
                                                                className={`w-24 px-3 py-1.5 bg-gray-50 border rounded-lg text-sm text-center outline-none font-bold ${overLimit ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-sky-500'}`}
                                                            />
                                                            <span className="text-xs text-gray-400">{item.base_unit}</span>
                                                        </div>
                                                        {overLimit && <p className="text-xs text-red-600 mt-0.5">Exceeds available!</p>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-sm font-semibold text-gray-700">{fmt(val)}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button onClick={() => removeItem(item.pid)}
                                                            className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">
                                                            🗑️
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Summary Panel */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border p-5 space-y-4 sticky top-4">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Transfer Summary</h3>

                            <div className="bg-sky-50 rounded-2xl p-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">From:</span>
                                    <span className="font-bold text-sky-700">{fromLocation}</span>
                                </div>
                                <div className="flex items-center justify-center text-2xl">↓</div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">To:</span>
                                    <span className="font-bold text-blue-700">{toLocation}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Items:</span>
                                    <span className="font-bold">{selectedItems.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Total Value:</span>
                                    <span className="font-bold text-sky-700">{fmt(totalTransferValue)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Date:</span>
                                    <span className="font-bold">{transferDate}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleTransfer}
                                disabled={isSaving || selectedItems.length === 0 || fromLocation === toLocation}
                                className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 text-sm"
                            >
                                {isSaving ? '⏳ Processing...' : '🔄 Execute Transfer'}
                            </button>

                            <button onClick={() => setSelectedItems([])}
                                className="w-full py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-all">
                                🗑️ Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <>
                    <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none" />
                        </div>
                        <button onClick={loadTransfers}
                            className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-md transition-all">
                            🔍 Search
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border overflow-hidden">
                        {transfersLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading transfers...</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-sky-600 to-blue-700">
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Date</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">Ingredient</th>
                                            <th className="px-4 py-3.5 text-center text-xs font-bold uppercase text-white">Qty</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">From → To</th>
                                            <th className="px-4 py-3.5 text-left text-xs font-bold uppercase text-white">By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transfers.length === 0 ? (
                                            <tr><td colSpan={5} className="py-16 text-center text-gray-400 text-sm">📋 No transfers found</td></tr>
                                        ) : transfers.map((t, i) => (
                                            <tr key={t.movement_id} className={`border-b border-gray-100 hover:bg-sky-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                <td className="px-4 py-3.5 text-sm text-gray-600">
                                                    {new Date(t.movement_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3.5 font-semibold text-gray-800">{t.product_name}
                                                    <span className="block text-xs text-gray-400 font-mono">{t.product_code}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className="px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-bold">
                                                        {t.quantity} {t.unit}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-sm text-gray-600">{t.reason || '-'}</td>
                                                <td className="px-4 py-3.5 text-sm text-gray-500">{t.created_by}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Add Ingredient Modal */}
            {showAddItem && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-5 text-white">
                            <h2 className="text-lg font-bold">➕ Add Ingredient to Transfer</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search Ingredient</label>
                                <input
                                    type="text"
                                    value={addSearch}
                                    onChange={e => { setAddSearch(e.target.value); setAddSelected(null); }}
                                    placeholder="Type name or code..."
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none"
                                    autoFocus
                                />
                            </div>

                            {addSearch && (
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 divide-y">
                                    {filteredIngredients.slice(0, 20).map(ing => (
                                        <button
                                            key={ing.pid}
                                            onClick={() => { setAddSelected(ing); setAddSearch(ing.product_name); }}
                                            className={`w-full text-left px-4 py-2.5 hover:bg-sky-50 transition-colors ${addSelected?.pid === ing.pid ? 'bg-sky-50' : ''}`}
                                        >
                                            <p className="text-sm font-semibold text-gray-800">{ing.product_name}</p>
                                            <p className="text-xs text-gray-500">
                                                {ing.product_code} • Stock: {ing.current_stock.toFixed(2)} {ing.base_unit}
                                            </p>
                                        </button>
                                    ))}
                                    {filteredIngredients.length === 0 && (
                                        <div className="px-4 py-6 text-center text-gray-400 text-sm">No ingredients found</div>
                                    )}
                                </div>
                            )}

                            {addSelected && (
                                <>
                                    <div className="bg-sky-50 rounded-xl p-3 text-sm">
                                        <p className="font-bold text-sky-800">{addSelected.product_name}</p>
                                        <p className="text-sky-600 text-xs mt-0.5">
                                            Available: <strong>{addSelected.current_stock.toFixed(2)} {addSelected.base_unit}</strong>
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                            Quantity to Transfer ({addSelected.base_unit}) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={addQty}
                                            onChange={e => setAddQty(e.target.value)}
                                            placeholder="0.00"
                                            min="0"
                                            max={addSelected.current_stock}
                                            step="0.01"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-sky-500 outline-none font-bold text-lg text-center"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => { setShowAddItem(false); setAddSearch(''); setAddSelected(null); setAddQty(''); }}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button onClick={addItemToTransfer}
                                    disabled={!addSelected || !addQty}
                                    className="flex-1 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    ✅ Add Item
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
