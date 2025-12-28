'use client';

import { useState } from 'react';

interface Supplier {
    id: number;
    name: string;
    contact: string;
}

interface PurchaseItem {
    id: number;
    productId: number;
    productName: string;
    qty: number;
    price: number;
    total: number;
}

const suppliers: Supplier[] = [
    { id: 1, name: 'ABC Distributors', contact: '0712345678' },
    { id: 2, name: 'Fresh Foods Ltd', contact: '0723456789' },
    { id: 3, name: 'Quick Supplies', contact: '0734567890' },
];

const products = [
    { id: 1, name: 'Chicken Burger', price: 300 },
    { id: 2, name: 'Beef Burger', price: 350 },
    { id: 3, name: 'Pizza Margherita', price: 600 },
    { id: 4, name: 'French Fries', price: 100 },
    { id: 5, name: 'Coca Cola 500ml', price: 60 },
    { id: 6, name: 'Grilled Chicken', price: 450 },
];

export default function PurchaseEntryPage() {
    const [selectedSupplier, setSelectedSupplier] = useState<number>(0);
    const [invoiceNo, setInvoiceNo] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<number>(0);
    const [qty, setQty] = useState<number>(1);
    const [price, setPrice] = useState<number>(0);

    // Add item to purchase list
    const addItem = () => {
        if (selectedProduct === 0 || qty <= 0) return;

        const product = products.find(p => p.id === selectedProduct);
        if (!product) return;

        const newItem: PurchaseItem = {
            id: Date.now(),
            productId: product.id,
            productName: product.name,
            qty,
            price: price || product.price,
            total: qty * (price || product.price),
        };

        setItems(prev => [...prev, newItem]);
        setSelectedProduct(0);
        setQty(1);
        setPrice(0);
    };

    // Remove item
    const removeItem = (id: number) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = 0;
    const total = subtotal - discount;

    // Save purchase
    const savePurchase = () => {
        if (selectedSupplier === 0 || items.length === 0) {
            alert('Please select a supplier and add items');
            return;
        }
        alert(`✅ Purchase saved!\n\nSupplier: ${suppliers.find(s => s.id === selectedSupplier)?.name}\nItems: ${items.length}\nTotal: Ksh ${total.toLocaleString()}`);
        // Reset form
        setItems([]);
        setSelectedSupplier(0);
        setInvoiceNo('');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📥</span> Purchase Entry
                    </h1>
                    <p className="text-gray-500">Record new stock purchases from suppliers</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        <span>📋</span>
                        <span className="font-medium text-gray-600">View Records</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Left Panel - Purchase Details */}
                <div className="col-span-2 space-y-6">
                    {/* Supplier & Invoice Info */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span>🏢</span> Supplier Information
                        </h2>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Supplier *</label>
                                <select
                                    value={selectedSupplier}
                                    onChange={(e) => setSelectedSupplier(Number(e.target.value))}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                                >
                                    <option value={0}>Select Supplier</option>
                                    {suppliers.map(supplier => (
                                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Invoice No</label>
                                <input
                                    type="text"
                                    value={invoiceNo}
                                    onChange={(e) => setInvoiceNo(e.target.value)}
                                    placeholder="Supplier Invoice No"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Date</label>
                                <input
                                    type="date"
                                    value={invoiceDate}
                                    onChange={(e) => setInvoiceDate(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Add Items */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span>📦</span> Add Items
                        </h2>
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="col-span-2">
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Product</label>
                                <select
                                    value={selectedProduct}
                                    onChange={(e) => {
                                        const prodId = Number(e.target.value);
                                        setSelectedProduct(prodId);
                                        const prod = products.find(p => p.id === prodId);
                                        if (prod) setPrice(prod.price);
                                    }}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                                >
                                    <option value={0}>Select Product</option>
                                    {products.map(product => (
                                        <option key={product.id} value={product.id}>{product.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Quantity</label>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => setQty(Number(e.target.value))}
                                    min={1}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Unit Price</label>
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                                />
                            </div>
                        </div>
                        <button
                            onClick={addItem}
                            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                        >
                            <span>➕</span>
                            <span>Add to List</span>
                        </button>
                    </div>

                    {/* Items List */}
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100">
                            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <span>🛍️</span> Purchase Items
                                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-sm rounded-full">
                                    {items.length} items
                                </span>
                            </h2>
                        </div>

                        {items.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <span className="text-5xl block mb-4">📭</span>
                                <p className="font-medium">No items added yet</p>
                                <p className="text-sm">Select products and add them to the list</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">#</th>
                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Product</th>
                                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Qty</th>
                                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Price</th>
                                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Total</th>
                                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-600">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                                            <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                                            <td className="py-3 px-4 font-medium text-gray-800">{item.productName}</td>
                                            <td className="py-3 px-4 text-right text-gray-600">{item.qty}</td>
                                            <td className="py-3 px-4 text-right text-gray-600">Ksh {item.price.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-right font-semibold text-gray-800">Ksh {item.total.toLocaleString()}</td>
                                            <td className="py-3 px-4 text-center">
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right Panel - Summary */}
                <div className="space-y-6">
                    {/* Order Summary */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 sticky top-24">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span>📊</span> Purchase Summary
                        </h2>

                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-gray-600">
                                <span>Subtotal</span>
                                <span className="font-medium">Ksh {subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Discount</span>
                                <span className="font-medium text-green-600">- Ksh {discount.toLocaleString()}</span>
                            </div>
                            <div className="h-px bg-gray-100"></div>
                            <div className="flex justify-between text-xl font-bold text-gray-800">
                                <span>Total</span>
                                <span className="text-blue-600">Ksh {total.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Supplier Info Display */}
                        {selectedSupplier > 0 && (
                            <div className="p-4 bg-blue-50 rounded-xl mb-6">
                                <p className="text-sm font-medium text-blue-700 mb-1">Selected Supplier</p>
                                <p className="font-semibold text-gray-800">{suppliers.find(s => s.id === selectedSupplier)?.name}</p>
                                <p className="text-sm text-gray-600">{suppliers.find(s => s.id === selectedSupplier)?.contact}</p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <button
                                onClick={savePurchase}
                                disabled={items.length === 0}
                                className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span>💾</span>
                                <span>Save Purchase</span>
                            </button>
                            <button
                                onClick={() => setItems([])}
                                className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                            >
                                <span>🗑️</span>
                                <span>Clear All</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <h3 className="font-semibold text-gray-800 mb-4">📈 Quick Stats</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">Items</span>
                                <span className="font-bold text-gray-800">{items.length}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">Total Qty</span>
                                <span className="font-bold text-gray-800">{items.reduce((sum, item) => sum + item.qty, 0)}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">Avg. Price</span>
                                <span className="font-bold text-gray-800">
                                    Ksh {items.length > 0 ? Math.round(total / items.reduce((sum, item) => sum + item.qty, 0)).toLocaleString() : 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
