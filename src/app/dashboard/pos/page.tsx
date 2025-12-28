'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    createReceiptData,
    createKOTData,
    generateReceiptHTML,
    generateKOTHTML,
    generateCustomerBillHTML
} from '@/lib/receiptPrinter';

// Types
interface Product {
    id: number;
    name: string;
    price: number;
    purchasePrice: number;
    category: string;
    stock: number;
    color: string;
    barcode?: string;
    hasBatches?: boolean;
}

interface ProductionBatch {
    batchId: number;
    batchNumber: string;
    qtyProduced: number;
    qtyRemaining: number;
    costPerUnit: number;
    productionDate: string;
    expiryDate?: string;
    daysOld: number;
}

interface CartItem extends Product {
    qty: number;
    discount: number;
    notes: string;
    batchId?: number;
    batchNumber?: string;
    costPerUnit?: number;
}

interface RunningOrder {
    id: string;
    name: string;
    items: CartItem[];
    total: number;
    createdAt: Date;
    tableNo?: string;
    customerName?: string;
}

interface ShiftInfo {
    id: number;
    name: string;
    code: string;
    startTime: string;
    openingCash: number;
}

interface Category {
    category_id: number;
    category_name: string;
    icon: string;
}

interface Waiter {
    user_id: number;
    full_name: string;
    role: string;
}

interface RestaurantTable {
    table_id: number;
    table_code: string;
    table_name: string;
    room_id: number;
    room_name?: string;
    status: string;
}

interface FoodOrderNote {
    note_id: number;
    note_text: string;
    icon: string;
    note_category: string;
}

// Sample Production Batches (like VB.NET frmBatchSelection) - TODO: Load from database
const sampleBatches: Record<number, ProductionBatch[]> = {
    1: [ // Chicken Burger batches
        { batchId: 101, batchNumber: 'BATCH-20231225-1-001', qtyProduced: 50, qtyRemaining: 15, costPerUnit: 285, productionDate: '2023-12-25', daysOld: 2 },
        { batchId: 102, batchNumber: 'BATCH-20231226-1-001', qtyProduced: 30, qtyRemaining: 10, costPerUnit: 290, productionDate: '2023-12-26', daysOld: 1 },
    ],
    2: [ // Beef Burger batches
        { batchId: 201, batchNumber: 'BATCH-20231224-2-001', qtyProduced: 40, qtyRemaining: 8, costPerUnit: 340, productionDate: '2023-12-24', daysOld: 3 },
        { batchId: 202, batchNumber: 'BATCH-20231226-2-001', qtyProduced: 25, qtyRemaining: 10, costPerUnit: 345, productionDate: '2023-12-26', daysOld: 1 },
    ],
};

// Product Card Component - Light Theme
const ProductCard = ({ product, onAdd }: { product: Product; onAdd: () => void }) => (
    <button
        onClick={onAdd}
        disabled={product.stock === 0}
        className={`relative bg-gradient-to-br ${product.color} rounded-2xl p-3 text-white text-left transition-all hover:scale-105 hover:shadow-xl active:scale-95 h-24 overflow-hidden ${product.stock === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
        <div className="relative z-10 h-full flex flex-col justify-between">
            <p className="font-bold text-sm leading-tight line-clamp-2 drop-shadow-sm">{product.name}</p>
            <div className="flex items-center justify-between">
                <span className="text-xs opacity-90 flex items-center gap-1">📦 {product.stock}</span>
                <span className="font-bold text-sm bg-black/20 px-2 py-0.5 rounded-lg">{product.price}</span>
            </div>
        </div>
        {product.stock < 10 && product.stock > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></span>
        )}
        {product.stock === 0 && (
            <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500 text-[10px] font-bold rounded">OUT</span>
        )}
    </button>
);

// Cart Item Row Component - Light Theme
const CartItemRow = ({
    item,
    onIncrease,
    onDecrease,
    onRemove,
    onEditNotes,
    onEditDiscount
}: {
    item: CartItem;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
    onEditNotes: () => void;
    onEditDiscount: () => void;
}) => {
    const itemTotal = (item.price * item.qty) - item.discount;

    return (
        <div className="bg-white rounded-xl p-3 space-y-2 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">@ Ksh {item.price}</p>
                    {item.notes && (
                        <p className="text-xs text-orange-600 italic mt-1">📝 {item.notes}</p>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onDecrease}
                        className="w-8 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 flex items-center justify-center font-bold text-white transition-colors text-lg shadow-sm"
                    >
                        −
                    </button>
                    <span className="w-8 text-center font-bold text-gray-800">{item.qty}</span>
                    <button
                        onClick={onIncrease}
                        className="w-8 h-8 rounded-lg bg-green-500 hover:bg-green-600 flex items-center justify-center font-bold text-white transition-colors text-lg shadow-sm"
                    >
                        +
                    </button>
                </div>
                <div className="text-right min-w-[70px]">
                    <p className="font-bold text-gray-800">{itemTotal.toLocaleString()}</p>
                    {item.discount > 0 && (
                        <p className="text-xs text-green-600">-{item.discount}</p>
                    )}
                </div>
                <button
                    onClick={onRemove}
                    className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors"
                >
                    ✕
                </button>
            </div>
            <div className="flex gap-2">
                <button
                    onClick={onEditNotes}
                    className="flex-1 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors font-medium"
                >
                    📝 Notes
                </button>
                <button
                    onClick={onEditDiscount}
                    className="flex-1 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors font-medium"
                >
                    💰 Discount
                </button>
            </div>
        </div>
    );
};

// Running Order Card - Light Theme
const RunningOrderCard = ({ order, onResume, onDelete }: {
    order: RunningOrder;
    onResume: () => void;
    onDelete: () => void;
}) => (
    <div className="bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-400 transition-colors shadow-sm">
        <div className="flex items-start justify-between mb-2">
            <div>
                <p className="font-semibold text-gray-800">{order.name}</p>
                <p className="text-xs text-gray-500">{order.items.length} items • {new Date(order.createdAt).toLocaleTimeString()}</p>
            </div>
            <span className="text-lg font-bold text-blue-600">Ksh {order.total.toLocaleString()}</span>
        </div>
        <div className="text-xs text-gray-400 mb-3 line-clamp-2">
            {order.items.map(i => i.name).join(', ')}
        </div>
        <div className="flex gap-2">
            <button
                onClick={onResume}
                className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
            >
                Resume
            </button>
            <button
                onClick={onDelete}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
            >
                🗑️
            </button>
        </div>
    </div>
);

// Receipt Preview Modal
const ReceiptPreviewModal = ({
    isOpen,
    onClose,
    receiptHTML,
    title,
    onPrint
}: {
    isOpen: boolean;
    onClose: () => void;
    receiptHTML: string;
    title: string;
    onPrint: () => void;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>🧾</span> {title}
                    </h2>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Receipt Preview */}
                <div className="flex-1 overflow-auto bg-gray-100 rounded-2xl p-4 mb-4">
                    <div
                        className="bg-white shadow-lg mx-auto"
                        style={{ width: '80mm', minHeight: '200px' }}
                        dangerouslySetInnerHTML={{ __html: receiptHTML }}
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Close
                    </button>
                    <button
                        onClick={onPrint}
                        className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                    >
                        <span>🖨️</span>
                        <span>Print</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Batch Selection Modal - Like VB.NET frmBatchSelection
const BatchSelectionModal = ({
    isOpen,
    onClose,
    product,
    batches,
    onSelect
}: {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    batches: ProductionBatch[];
    onSelect: (batch: ProductionBatch) => void;
}) => {
    const [selectedBatch, setSelectedBatch] = useState<ProductionBatch | null>(null);

    if (!isOpen || !product) return null;

    const totalAvailable = batches.reduce((sum, b) => sum + b.qtyRemaining, 0);

    const getBatchRowColor = (daysOld: number) => {
        if (daysOld <= 1) return 'bg-green-50 border-green-200'; // Fresh - Light green
        if (daysOld <= 7) return 'bg-blue-50 border-blue-200';   // Recent - Light blue
        return 'bg-white border-gray-200';                        // Older batches
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <span>📦</span> Select Production Batch
                        </h2>
                        <p className="text-sm text-cyan-600 font-medium mt-1">{product.name}</p>
                    </div>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Total Available */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl mb-4">
                    <span className="text-gray-600">Total Available from {batches.length} batch(es):</span>
                    <span className="text-xl font-bold text-green-600">{totalAvailable} units</span>
                </div>

                {/* Batches Table */}
                <div className="flex-1 overflow-auto mb-4">
                    <table className="w-full">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="p-3 text-left text-xs font-bold text-gray-600">BATCH NUMBER</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">PRODUCED</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">AVAILABLE</th>
                                <th className="p-3 text-right text-xs font-bold text-gray-600">COST/UNIT</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">DATE</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">AGE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map((batch) => (
                                <tr
                                    key={batch.batchId}
                                    onClick={() => setSelectedBatch(batch)}
                                    onDoubleClick={() => onSelect(batch)}
                                    className={`cursor-pointer transition-all border-2 ${selectedBatch?.batchId === batch.batchId
                                        ? 'border-blue-500 bg-blue-50'
                                        : getBatchRowColor(batch.daysOld)
                                        } hover:border-blue-300`}
                                >
                                    <td className="p-3 font-mono text-sm font-medium">{batch.batchNumber}</td>
                                    <td className="p-3 text-center text-gray-600">{batch.qtyProduced}</td>
                                    <td className="p-3 text-center">
                                        <span className="px-3 py-1 bg-green-100 text-green-700 font-bold rounded-lg">
                                            {batch.qtyRemaining}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-medium text-gray-700">
                                        Ksh {batch.costPerUnit.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-center text-gray-600">
                                        {new Date(batch.productionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${batch.daysOld === 0 ? 'bg-green-500 text-white' :
                                            batch.daysOld <= 1 ? 'bg-green-100 text-green-700' :
                                                batch.daysOld <= 3 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-orange-100 text-orange-700'
                                            }`}>
                                            {batch.daysOld === 0 ? 'Today' : `${batch.daysOld}d`}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
                        <span>Fresh (0-1 days)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div>
                        <span>Recent (2-7 days)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-white border border-gray-300"></div>
                        <span>Older</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => selectedBatch && onSelect(selectedBatch)}
                        disabled={!selectedBatch}
                        className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <span>✓</span>
                        <span>Select This Batch</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// Payment Modal - Light Theme
const PaymentModal = ({
    isOpen,
    onClose,
    total,
    onComplete,
    invoiceNo
}: {
    isOpen: boolean;
    onClose: () => void;
    total: number;
    onComplete: (method: string, amountPaid: number, mpesaReceipt?: string, customerName?: string) => void;
    invoiceNo: string;
}) => {
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [amountPaid, setAmountPaid] = useState('');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [mpesaReceipt, setMpesaReceipt] = useState('');
    const [customerName, setCustomerName] = useState('');

    const change = paymentMethod === 'cash' ? Math.max(0, Number(amountPaid) - total) : 0;
    const quickAmounts = [500, 1000, 2000, 5000];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>💳</span> Payment
                    </h2>
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Invoice</p>
                        <p className="font-semibold text-blue-600">{invoiceNo}</p>
                    </div>
                </div>

                {/* Total */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-700 rounded-2xl p-5 text-white mb-6">
                    <p className="text-sm opacity-90">Total Amount</p>
                    <p className="text-4xl font-bold">Ksh {total.toLocaleString()}</p>
                </div>

                {/* Payment Methods */}
                <div className="grid grid-cols-4 gap-2 mb-6">
                    {[
                        { id: 'cash', icon: '💵', label: 'Cash' },
                        { id: 'mpesa', icon: '📱', label: 'M-Pesa' },
                        { id: 'card', icon: '💳', label: 'Card' },
                        { id: 'credit', icon: '📋', label: 'Credit' },
                    ].map(method => (
                        <button
                            key={method.id}
                            onClick={() => setPaymentMethod(method.id)}
                            className={`p-3 rounded-xl border-2 transition-all ${paymentMethod === method.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                                }`}
                        >
                            <span className="text-2xl block mb-1">{method.icon}</span>
                            <span className="text-xs font-medium text-gray-600">{method.label}</span>
                        </button>
                    ))}
                </div>

                {/* Cash Input */}
                {paymentMethod === 'cash' && (
                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-2 block">Amount Received</label>
                            <input
                                type="number"
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                                placeholder="Enter amount..."
                                className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg font-semibold"
                            />
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {quickAmounts.map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => setAmountPaid(amt.toString())}
                                    className="py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-medium transition-colors"
                                >
                                    {amt.toLocaleString()}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                            <span className="text-green-700 font-medium">Change:</span>
                            <span className="text-2xl font-bold text-green-600">Ksh {change.toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* M-Pesa Input */}
                {paymentMethod === 'mpesa' && (
                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-2 block">Phone Number</label>
                            <input
                                type="tel"
                                value={mpesaPhone}
                                onChange={(e) => setMpesaPhone(e.target.value)}
                                placeholder="0712345678"
                                className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-lg"
                            />
                        </div>
                        <button className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                            <span>📤</span> Send STK Push
                        </button>
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-2 block">M-Pesa Receipt (Optional)</label>
                            <input
                                type="text"
                                value={mpesaReceipt}
                                onChange={(e) => setMpesaReceipt(e.target.value)}
                                placeholder="e.g. QJK2A5B..."
                                className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
                            />
                        </div>
                    </div>
                )}

                {/* Credit Customer */}
                {paymentMethod === 'credit' && (
                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-2 block">Customer Name</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Enter customer name..."
                                className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-lg"
                            />
                        </div>
                        <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                            <p className="text-orange-700 text-sm">⚠️ This sale will be recorded as credit</p>
                        </div>
                    </div>
                )}

                {/* Complete Button */}
                <button
                    onClick={() => onComplete(paymentMethod, Number(amountPaid) || total, mpesaReceipt, customerName)}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                    <span>✅</span>
                    <span>Complete Sale</span>
                </button>
            </div>
        </div>
    );
};

// Notes Modal - Light Theme
const NotesModal = ({
    isOpen,
    onClose,
    currentNotes,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    currentNotes: string;
    onSave: (notes: string) => void;
}) => {
    const [notes, setNotes] = useState(currentNotes);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>📝</span> Item Notes
                </h2>
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add special instructions... (e.g., No onions, extra sauce)"
                    className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none h-32 resize-none"
                />
                <div className="flex gap-3 mt-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSave(notes); onClose(); }}
                        className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600"
                    >
                        Save Notes
                    </button>
                </div>
            </div>
        </div>
    );
};

// Hold Order Modal - Light Theme
const HoldOrderModal = ({
    isOpen,
    onClose,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, tableNo?: string) => void;
}) => {
    const [orderName, setOrderName] = useState('');
    const [tableNoInput, setTableNoInput] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>📋</span> Hold Order
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-2 block">Order Name / Customer</label>
                        <input
                            type="text"
                            value={orderName}
                            onChange={(e) => setOrderName(e.target.value)}
                            placeholder="e.g., Table 5, John's Order"
                            className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-2 block">Table No (Optional)</label>
                        <input
                            type="text"
                            value={tableNoInput}
                            onChange={(e) => setTableNoInput(e.target.value)}
                            placeholder="e.g., T1, T2"
                            className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSave(orderName || `Order-${Date.now()}`, tableNoInput); onClose(); }}
                        className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600"
                    >
                        Hold Order
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function POSPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [showPayment, setShowPayment] = useState(false);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [showHoldModal, setShowHoldModal] = useState(false);
    const [showRunningOrders, setShowRunningOrders] = useState(false);
    const [showReceiptPreview, setShowReceiptPreview] = useState(false);
    const [showKOTPreview, setShowKOTPreview] = useState(false);
    const [showBillPreview, setShowBillPreview] = useState(false);
    const [receiptHTML, setReceiptHTML] = useState('');
    const [kotHTML, setKOTHTML] = useState('');
    const [billHTML, setBillHTML] = useState('');
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [invoiceNo, setInvoiceNo] = useState('INV-0001');
    const [kotNo, setKotNo] = useState(1);
    const [runningOrders, setRunningOrders] = useState<RunningOrder[]>([]);
    const [orderNotes, setOrderNotes] = useState('');
    const [tableNo, setTableNo] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Batch Selection State
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
    const [productBatches, setProductBatches] = useState<ProductionBatch[]>([]);

    const [shift] = useState<ShiftInfo>({
        id: 1,
        name: 'Day Shift',
        code: 'DS-001',
        startTime: '06:00',
        openingCash: 5000
    });

    // Load products from database
    const loadProducts = useCallback(async () => {
        setIsLoadingProducts(true);
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .eq('show_ps', true) // Only show products marked to show in POS
                .order('product_name');

            if (error) throw error;

            // Transform database products to POS format
            const posProducts: Product[] = (data || []).map(p => ({
                id: p.pid,
                name: p.product_name,
                price: p.sales_cost || 0,
                purchasePrice: p.purchase_cost || 0,
                category: p.category || 'Uncategorized',
                stock: 999, // TODO: Implement stock tracking
                color: p.button_ui_color || 'from-blue-400 to-blue-600',
                barcode: p.barcode,
                hasBatches: false, // TODO: Implement batch tracking
            }));

            setProducts(posProducts);

            // Extract unique categories from products
            const uniqueCategories = ['All', ...new Set(posProducts.map(p => p.category).filter(Boolean))];
            setCategories(uniqueCategories);

        } catch (err) {
            console.error('Error loading products:', err);
            toast.error('Failed to load products');
        }
        setIsLoadingProducts(false);
    }, []);

    // Load products on mount
    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // Toggle Fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Filter products
    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Add to cart - with batch selection for products with batches
    const addToCart = (product: Product) => {
        if (product.stock === 0) return;

        // Check if product has production batches
        if (product.hasBatches && sampleBatches[product.id]) {
            const batches = sampleBatches[product.id].filter(b => b.qtyRemaining > 0);
            if (batches.length > 0) {
                // Show batch selection modal
                setPendingProduct(product);
                setProductBatches(batches);
                setShowBatchModal(true);
                return;
            }
        }

        // No batches - add directly
        addProductToCart(product);
    };

    // Add product to cart (called after batch selection or for non-batch products)
    const addProductToCart = (product: Product, batch?: ProductionBatch) => {
        setCart(prev => {
            // For products with batches, check if same product AND same batch exists
            const existing = prev.find(item =>
                item.id === product.id &&
                (!batch || item.batchId === batch.batchId)
            );

            if (existing) {
                return prev.map(item =>
                    item.id === product.id && (!batch || item.batchId === batch.batchId)
                        ? { ...item, qty: item.qty + 1 }
                        : item
                );
            }

            return [...prev, {
                ...product,
                qty: 1,
                discount: 0,
                notes: '',
                batchId: batch?.batchId,
                batchNumber: batch?.batchNumber,
                costPerUnit: batch?.costPerUnit || product.purchasePrice
            }];
        });
    };

    // Handle batch selection
    const handleBatchSelect = (batch: ProductionBatch) => {
        if (pendingProduct) {
            addProductToCart(pendingProduct, batch);
            setPendingProduct(null);
            setProductBatches([]);
            setShowBatchModal(false);
        }
    };

    // Update quantity
    const updateQty = (id: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = item.qty + delta;
                return newQty > 0 ? { ...item, qty: newQty } : item;
            }
            return item;
        }).filter(item => item.qty > 0));
    };

    // Remove from cart
    const removeFromCart = (id: number) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    // Clear cart
    const clearCart = () => {
        setCart([]);
        setOrderNotes('');
        setTableNo('');
    };

    // Update item notes
    const updateItemNotes = (id: number, notes: string) => {
        setCart(prev => prev.map(item =>
            item.id === id ? { ...item, notes } : item
        ));
    };

    // Hold order
    const holdOrder = (name: string, tbl?: string) => {
        if (cart.length === 0) return;

        const newOrder: RunningOrder = {
            id: `RO-${Date.now()}`,
            name,
            items: [...cart],
            total: total,
            createdAt: new Date(),
            tableNo: tbl
        };

        setRunningOrders(prev => [...prev, newOrder]);
        clearCart();
    };

    // Resume order
    const resumeOrder = (orderId: string) => {
        const order = runningOrders.find(o => o.id === orderId);
        if (order) {
            setCart(order.items);
            setRunningOrders(prev => prev.filter(o => o.id !== orderId));
            setShowRunningOrders(false);
        }
    };

    // Delete running order
    const deleteRunningOrder = (orderId: string) => {
        if (confirm('Delete this order?')) {
            setRunningOrders(prev => prev.filter(o => o.id !== orderId));
        }
    };

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalDiscount = cart.reduce((sum, item) => sum + item.discount, 0);
    const total = subtotal - totalDiscount;

    // Create receipt data for unpaid bill
    const createUnpaidBillData = () => {
        return createReceiptData(
            invoiceNo,
            cart.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                notes: item.notes,
                discount: item.discount
            })),
            'pending',
            0,
            'Cashier',
            {
                tableNo: tableNo || undefined,
                orderNotes: orderNotes || undefined,
                shiftCode: shift.code,
                isPaid: false
            }
        );
    };

    // Send to Kitchen (Print KOT then Customer Bill)
    const sendToKitchen = () => {
        if (cart.length === 0) return;

        // Create KOT data
        const kotData = createKOTData(
            `K${String(kotNo).padStart(4, '0')}`,
            cart.map(item => ({ name: item.name, qty: item.qty, notes: item.notes })),
            tableNo ? 'Dine-In' : 'Take-Away',
            {
                tableNo: tableNo || undefined,
                waiter: 'Cashier',
                orderNotes: orderNotes || undefined,
                priority: 'normal'
            }
        );

        const kotHtmlContent = generateKOTHTML(kotData);
        setKOTHTML(kotHtmlContent);

        // Create Customer Bill (Unpaid) data
        const billData = createUnpaidBillData();
        const billHtmlContent = generateCustomerBillHTML(billData, undefined, false);
        setBillHTML(billHtmlContent);

        setShowKOTPreview(true);
        setKotNo(prev => prev + 1);
    };

    // Print KOT and then show Customer Bill preview
    const printKOTNow = () => {
        // Print KOT
        const kotWindow = window.open('', '_blank', 'width=350,height=600');
        if (kotWindow) {
            kotWindow.document.write(kotHTML);
            kotWindow.document.close();
            kotWindow.focus();
            setTimeout(() => {
                kotWindow.print();
                kotWindow.onafterprint = () => kotWindow.close();
            }, 250);
        }
        // Close KOT preview and show Customer Bill preview
        setShowKOTPreview(false);
        setTimeout(() => {
            setShowBillPreview(true);
        }, 300);
    };

    // Close KOT without printing, still show Customer Bill
    const closeKOTAndShowBill = () => {
        setShowKOTPreview(false);
        setTimeout(() => {
            setShowBillPreview(true);
        }, 300);
    };

    // Print Customer Bill (unpaid)
    const printBillNow = () => {
        const billWindow = window.open('', '_blank', 'width=350,height=600');
        if (billWindow) {
            billWindow.document.write(billHTML);
            billWindow.document.close();
            billWindow.focus();
            setTimeout(() => {
                billWindow.print();
                billWindow.onafterprint = () => billWindow.close();
            }, 250);
        }
        setShowBillPreview(false);

        // TODO: After KOT + Bill print, order stays in cart for payment
        // Transaction is NOT saved here - only saved when payment is complete
    };

    // Save completed sale to database
    const saveSaleToDatabase = async (paymentMethod: string, amountPaid: number, mpesaReceipt?: string, customerName?: string) => {
        try {
            // In production, call: completeSaleTransaction from supabase
            console.log('Saving sale to database...', {
                invoiceNo,
                items: cart.map(item => ({
                    productId: item.id,
                    productName: item.name,
                    qty: item.qty,
                    price: item.price,
                    purchasePrice: item.purchasePrice,
                    discount: item.discount,
                    notes: item.notes
                })),
                subtotal,
                discount: totalDiscount,
                tax: 0,
                total,
                paymentMethod,
                amountPaid,
                change: paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0,
                cashierName: 'Cashier',
                shiftInstanceId: shift.id,
                customerName,
                mpesaReceipt,
                tableNo,
                orderNotes
            });

            // Update local invoice number
            const num = parseInt(invoiceNo.split('-')[1]) + 1;
            setInvoiceNo(`INV-${num.toString().padStart(4, '0')}`);

            return true;
        } catch (error) {
            console.error('Error saving sale:', error);
            alert('Error saving sale to database');
            return false;
        }
    };


    // Complete sale
    const completeSale = (paymentMethod: string, amountPaid: number, mpesaReceipt?: string, customerName?: string) => {
        // Create receipt data
        const receiptData = createReceiptData(
            invoiceNo,
            cart.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                notes: item.notes,
                discount: item.discount
            })),
            paymentMethod,
            amountPaid,
            'Cashier',
            {
                customerName,
                mpesaReceipt,
                tableNo: tableNo || undefined,
                orderNotes: orderNotes || undefined,
                shiftCode: shift.code,
                isPaid: true
            }
        );

        const html = generateCustomerBillHTML(receiptData, undefined, true);
        setReceiptHTML(html);
        setShowPayment(false);
        setShowReceiptPreview(true);

        // Generate next invoice number
        const num = parseInt(invoiceNo.split('-')[1]) + 1;
        setInvoiceNo(`INV-${num.toString().padStart(4, '0')}`);
    };

    // Print receipt
    const printReceiptNow = () => {
        const printWindow = window.open('', '_blank', 'width=350,height=600');
        if (printWindow) {
            printWindow.document.write(receiptHTML);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
            }, 250);
        }
        setShowReceiptPreview(false);
        clearCart();
    };

    return (
        <div className={`flex h-[calc(100vh-64px)] -m-6 bg-gray-50 ${isFullscreen ? 'fixed inset-0 z-50 h-screen m-0' : ''}`}>
            {/* Left Side - Products */}
            <div className="flex-1 flex flex-col bg-white">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl shadow-lg">
                                🛒
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800">Point of Sale</h1>
                                <p className="text-sm text-gray-500">Select products to add to cart</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Fullscreen Button */}
                            <button
                                onClick={toggleFullscreen}
                                className="p-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 transition-colors border border-gray-200"
                                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                            >
                                {isFullscreen ? '⛶' : '⛶'}
                            </button>
                            {/* Invoice */}
                            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-xl border border-blue-200">
                                <span className="text-2xl">🧾</span>
                                <div>
                                    <p className="text-xs text-blue-600">Invoice</p>
                                    <p className="font-bold text-blue-700">{invoiceNo}</p>
                                </div>
                            </div>
                            {/* Shift Info */}
                            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-xl border border-green-200">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                <div>
                                    <p className="text-xs text-green-600">Active Shift</p>
                                    <p className="font-semibold text-green-700">{shift.name}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Search & Table */}
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search products or scan barcode..."
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-gray-800 placeholder-gray-400"
                            />
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🪑</span>
                            <input
                                type="text"
                                value={tableNo}
                                onChange={(e) => setTableNo(e.target.value)}
                                placeholder="Table No"
                                className="w-32 pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-gray-800 placeholder-gray-400"
                            />
                        </div>
                    </div>
                </div>

                {/* Categories */}
                <div className="flex gap-2 p-4 overflow-x-auto border-b border-gray-100 bg-gray-50">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${selectedCategory === cat
                                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Products Grid */}
                <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                    <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                        {filteredProducts.map(product => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                onAdd={() => addToCart(product)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Side - Cart */}
            <div className="w-[420px] bg-white border-l border-gray-200 flex flex-col shadow-xl">
                {/* Cart Header */}
                <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">🛍️</span>
                            <h2 className="font-bold text-gray-800">Current Order</h2>
                            <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs font-bold rounded-full">
                                {cart.reduce((sum, item) => sum + item.qty, 0)} items
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowRunningOrders(true)}
                                className="relative p-2 hover:bg-orange-50 rounded-xl text-orange-500 transition-colors border border-orange-200"
                                title="Running Orders"
                            >
                                📋
                                {runningOrders.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                                        {runningOrders.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={clearCart}
                                className="p-2 hover:bg-red-50 rounded-xl text-red-500 transition-colors border border-red-200"
                                title="Clear All"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>

                {/* Order Notes */}
                <div className="px-4 py-3 border-b border-gray-100 bg-yellow-50">
                    <textarea
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="📝 Add order notes... (e.g., Take-away, Less spicy)"
                        className="w-full p-3 bg-white border border-yellow-200 rounded-xl focus:outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400 text-sm h-16 resize-none"
                    />
                </div>

                {/* Cart Items */}
                <div className="flex-1 p-4 overflow-y-auto space-y-2 bg-gray-50">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <span className="text-7xl mb-4 opacity-50">🛒</span>
                            <p className="font-semibold text-gray-500">Cart is empty</p>
                            <p className="text-sm">Add products to get started</p>
                        </div>
                    ) : (
                        cart.map(item => (
                            <CartItemRow
                                key={item.id}
                                item={item}
                                onIncrease={() => updateQty(item.id, 1)}
                                onDecrease={() => updateQty(item.id, -1)}
                                onRemove={() => removeFromCart(item.id)}
                                onEditNotes={() => { setEditingItemId(item.id); setShowNotesModal(true); }}
                                onEditDiscount={() => {
                                    const discount = prompt('Enter discount amount:', item.discount.toString());
                                    if (discount !== null) {
                                        setCart(prev => prev.map(i =>
                                            i.id === item.id ? { ...i, discount: Number(discount) || 0 } : i
                                        ));
                                    }
                                }}
                            />
                        ))
                    )}
                </div>

                {/* Cart Footer */}
                <div className="p-4 bg-white border-t border-gray-200 space-y-4">
                    {/* Totals */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span className="font-medium text-gray-700">Ksh {subtotal.toLocaleString()}</span>
                        </div>
                        {totalDiscount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Discount</span>
                                <span className="font-medium">- Ksh {totalDiscount.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-xl font-bold text-gray-800 pt-2 border-t border-gray-200">
                            <span>Total</span>
                            <span className="text-blue-600">Ksh {total.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => cart.length > 0 && setShowHoldModal(true)}
                            disabled={cart.length === 0}
                            className="py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/30"
                        >
                            <span>📋</span>
                            <span>Hold</span>
                        </button>
                        <button
                            onClick={sendToKitchen}
                            disabled={cart.length === 0}
                            className="py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30"
                        >
                            <span>🍳</span>
                            <span>KOT</span>
                        </button>
                        <button
                            onClick={() => cart.length > 0 && setShowPayment(true)}
                            disabled={cart.length === 0}
                            className="py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/30"
                        >
                            <span>💰</span>
                            <span>Pay</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Running Orders Sidebar */}
            {showRunningOrders && (
                <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowRunningOrders(false)}>
                    <div
                        className="absolute right-0 top-0 h-full w-96 bg-white border-l border-gray-200 p-4 overflow-y-auto shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <span>📋</span> Running Orders
                                <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full">
                                    {runningOrders.length}
                                </span>
                            </h2>
                            <button
                                onClick={() => setShowRunningOrders(false)}
                                className="text-2xl text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>

                        {runningOrders.length === 0 ? (
                            <div className="text-center text-gray-400 py-12">
                                <span className="text-5xl block mb-3 opacity-50">📭</span>
                                <p className="font-medium">No running orders</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {runningOrders.map(order => (
                                    <RunningOrderCard
                                        key={order.id}
                                        order={order}
                                        onResume={() => resumeOrder(order.id)}
                                        onDelete={() => deleteRunningOrder(order.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modals */}
            <PaymentModal
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                total={total}
                onComplete={completeSale}
                invoiceNo={invoiceNo}
            />

            <NotesModal
                isOpen={showNotesModal}
                onClose={() => setShowNotesModal(false)}
                currentNotes={cart.find(i => i.id === editingItemId)?.notes || ''}
                onSave={(notes) => editingItemId && updateItemNotes(editingItemId, notes)}
            />

            <HoldOrderModal
                isOpen={showHoldModal}
                onClose={() => setShowHoldModal(false)}
                onSave={holdOrder}
            />

            {/* Batch Selection Modal */}
            <BatchSelectionModal
                isOpen={showBatchModal}
                onClose={() => {
                    setShowBatchModal(false);
                    setPendingProduct(null);
                    setProductBatches([]);
                }}
                product={pendingProduct}
                batches={productBatches}
                onSelect={handleBatchSelect}
            />

            {/* KOT Preview - After print or close, shows Customer Bill */}
            {showKOTPreview && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span>🍳</span> Kitchen Order Ticket
                            </h2>
                            <span className="px-3 py-1 bg-purple-100 text-purple-600 text-xs font-bold rounded-full">Step 1 of 2</span>
                        </div>

                        <div className="flex-1 overflow-auto bg-gray-100 rounded-2xl p-4 mb-4">
                            <div
                                className="bg-white shadow-lg mx-auto"
                                style={{ width: '80mm', minHeight: '200px' }}
                                dangerouslySetInnerHTML={{ __html: kotHTML }}
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={closeKOTAndShowBill}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Skip →
                            </button>
                            <button
                                onClick={printKOTNow}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                            >
                                <span>🖨️</span>
                                <span>Print KOT →</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Customer Bill Preview (Unpaid) - After KOT */}
            {showBillPreview && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span>🧾</span> Customer Bill
                            </h2>
                            <span className="px-3 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full">Step 2 of 2</span>
                        </div>

                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4 flex items-center gap-2">
                            <span className="text-2xl">⚠️</span>
                            <div>
                                <p className="font-semibold text-red-700">NOT PAID</p>
                                <p className="text-xs text-red-600">Customer bill with watermark</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto bg-gray-100 rounded-2xl p-4 mb-4">
                            <div
                                className="bg-white shadow-lg mx-auto"
                                style={{ width: '80mm', minHeight: '200px' }}
                                dangerouslySetInnerHTML={{ __html: billHTML }}
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowBillPreview(false)}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button
                                onClick={printBillNow}
                                className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-orange-700 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                            >
                                <span>🖨️</span>
                                <span>Print Bill</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Paid Receipt Preview */}
            <ReceiptPreviewModal
                isOpen={showReceiptPreview}
                onClose={() => { setShowReceiptPreview(false); clearCart(); }}
                receiptHTML={receiptHTML}
                title="✓ Tax Invoice (Paid)"
                onPrint={printReceiptNow}
            />
        </div>
    );
}
