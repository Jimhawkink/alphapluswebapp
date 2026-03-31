'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
    savePendingSale,
    getNextReceiptNumber,
    getNextKOTNumber,
    getFoodOrderNotes
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    createReceiptData,
    createKOTData,
    generateReceiptHTML,
    generateKOTHTML,
    generateCustomerBillHTML,
    loadCompanyInfo
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
    createdBy?: string;
    totalValue?: number;
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

// Cart Item Row - Light Theme
const CartItemRow = ({ item, onIncrease, onDecrease, onRemove, onEditNotes, onEditDiscount }: {
    item: CartItem;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
    onEditNotes: () => void;
    onEditDiscount: () => void;
}) => {
    const itemTotal = (item.price * item.qty) - item.discount;

    // Calculate per-item tax (18% inclusive = VAT 16% + Levy 2%)
    const taxRate = 0.18;
    const netAmount = itemTotal / (1 + taxRate);
    const taxAmount = itemTotal - netAmount;
    const vatAmount = netAmount * 0.16;
    const levyAmount = netAmount * 0.02;

    return (
        <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start gap-3 mb-2">
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800 text-sm">{item.name}</h3>
                    {item.notes && (
                        <p className="text-xs text-amber-600 mt-1 italic">📝 {item.notes}</p>
                    )}
                    {/* Tax Breakdown */}
                    <div className="mt-1 text-xs text-blue-600">
                        💰 Tax: Ksh {Math.round(taxAmount)} (VAT: {Math.round(vatAmount)} + Levy: {Math.round(levyAmount)})
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onDecrease}
                        className="w-7 h-7 rounded-lg bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-white font-bold transition-colors"
                    >
                        −
                    </button>
                    <span className="text-lg font-bold text-gray-700 min-w-[30px] text-center">{item.qty}</span>
                    <button
                        onClick={onIncrease}
                        className="w-7 h-7 rounded-lg bg-green-500 hover:bg-green-600 flex items-center justify-center text-white font-bold transition-colors"
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

// Running Order Card with Time Tracking and Expandable Items
const RunningOrderCard = ({
    order,
    onReopen
}: {
    order: any;
    onReopen: (order: any) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState('');

    // Calculate elapsed time
    useEffect(() => {
        const updateTime = () => {
            const created = new Date(order.sale_datetime || order.created_at);
            const now = new Date();
            const diffMs = now.getTime() - created.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;

            if (hours > 0) {
                setTimeElapsed(`${hours}h ${mins}m`);
            } else {
                setTimeElapsed(`${mins}m`);
            }
        };

        updateTime();
        const interval = setInterval(updateTime, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [order]);

    return (
        <div className="bg-white rounded-xl border-2 border-orange-200 shadow-lg hover:shadow-xl transition-all">
            {/* Header - Clickable to expand */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 cursor-pointer hover:bg-orange-50 transition-colors rounded-t-xl"
            >
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🧾</span>
                        <div>
                            <h3 className="font-bold text-gray-800">{order.receipt_no || order.invoice_no}</h3>
                            <p className="text-xs text-gray-500">
                                {(order.table_name || order.table_no) && `Table ${order.table_name || order.table_no} • `}
                                {order.customer_name || 'Walk-in'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-lg text-orange-600">Ksh {(order.total_amount || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">
                            ⏱️ {timeElapsed}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                        👤 Served by: <span className="font-semibold">{order.cashier_name || 'Cashier'}</span>
                    </span>
                    <button
                        className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                    >
                        {isExpanded ? '▲ Collapse' : '▼ Expand'}
                    </button>
                </div>
            </div>

            {/* Expandable Items List */}
            {isExpanded && (
                <div className="border-t border-orange-200 p-4 bg-orange-50">
                    <h4 className="font-bold text-sm text-gray-700 mb-2">Order Items:</h4>
                    <div className="space-y-2">
                        {order.items && order.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center bg-white rounded-lg p-2 text-sm">
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-800">{item.product_name || item.name}</p>
                                    <p className="text-xs text-gray-500">Qty: {item.quantity || item.qty} × Ksh {(item.unit_price || item.price || 0).toLocaleString()}</p>
                                </div>
                                <p className="font-bold text-gray-800">Ksh {(item.subtotal || item.total || 0).toLocaleString()}</p>
                            </div>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReopen(order);
                            }}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors"
                        >
                            💳 Complete Payment
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};


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
                                <th className="p-3 text-right text-xs font-bold text-gray-600">TOTAL</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">PROD. DATE</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">PRODUCED BY</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-600">AGE (Days)</th>
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
                                        {batch.costPerUnit.toFixed(2)}
                                    </td>
                                    <td className="p-3 text-right font-bold text-orange-600">
                                        {(batch.qtyRemaining * batch.costPerUnit).toFixed(2)}
                                    </td>
                                    <td className="p-3 text-center text-gray-600">
                                        {new Date(batch.productionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="p-3 text-center text-blue-600 font-medium">
                                        {batch.createdBy || 'Unknown'}
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${batch.daysOld === 0 ? 'bg-green-500 text-white' :
                                            batch.daysOld <= 1 ? 'bg-green-100 text-green-700' :
                                                batch.daysOld <= 7 ? 'bg-yellow-100 text-yellow-700' :
                                                    batch.daysOld <= 30 ? 'bg-orange-100 text-orange-700' :
                                                        'bg-red-100 text-red-700'
                                            }`}>
                                            {batch.daysOld}
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

// Food Order Notes Modal - Shows predefined notes from database
const FoodOrderNotesModal = ({
    isOpen,
    onClose,
    currentNotes,
    onSave,
    foodNotes
}: {
    isOpen: boolean;
    onClose: () => void;
    currentNotes: string;
    onSave: (notes: string) => void;
    foodNotes: Array<{ note_id: number; note_text: string; icon: string; note_category: string }>;
}) => {
    const [notes, setNotes] = useState(currentNotes);
    const [selectedCategory, setSelectedCategory] = useState('All');

    // Get unique categories
    const categories = ['All', ...Array.from(new Set(foodNotes.map(n => n.note_category)))];

    // Filter notes by category
    const filteredNotes = selectedCategory === 'All'
        ? foodNotes
        : foodNotes.filter(n => n.note_category === selectedCategory);

    // Add a note to the current notes
    const addNote = (noteText: string) => {
        if (notes) {
            // Check if note already exists
            if (notes.includes(noteText)) return;
            setNotes(prev => prev + ', ' + noteText);
        } else {
            setNotes(noteText);
        }
    };

    // Remove a note from the current notes
    const removeNote = (noteText: string) => {
        const notesList = notes.split(',').map(n => n.trim()).filter(n => n !== noteText);
        setNotes(notesList.join(', '));
    };

    // Check if a note is selected
    const isNoteSelected = (noteText: string) => {
        return notes.split(',').map(n => n.trim()).includes(noteText);
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Seasoning': return 'bg-amber-100 text-amber-700 border-amber-300';
            case 'Spice Level': return 'bg-red-100 text-red-700 border-red-300';
            case 'Cooking': return 'bg-orange-100 text-orange-700 border-orange-300';
            case 'Allergy': return 'bg-purple-100 text-purple-700 border-purple-300';
            case 'Diet': return 'bg-green-100 text-green-700 border-green-300';
            case 'Extras': return 'bg-blue-100 text-blue-700 border-blue-300';
            case 'Service': return 'bg-cyan-100 text-cyan-700 border-cyan-300';
            default: return 'bg-gray-100 text-gray-700 border-gray-300';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📝</span> Food Order Notes
                    </h2>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Info Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-3">
                    <span className="text-2xl">🍳</span>
                    <p className="text-sm text-amber-700">
                        These notes will be printed on the <strong>KOT (Kitchen Order Ticket)</strong> to inform the kitchen about special instructions.
                    </p>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat
                                ? 'bg-amber-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Predefined Notes Grid */}
                <div className="flex-1 overflow-y-auto mb-4">
                    {filteredNotes.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                            {filteredNotes.map((note) => (
                                <button
                                    key={note.note_id}
                                    onClick={() => isNoteSelected(note.note_text)
                                        ? removeNote(note.note_text)
                                        : addNote(note.note_text)
                                    }
                                    className={`p-3 rounded-xl border-2 transition-all hover:scale-105 text-left ${isNoteSelected(note.note_text)
                                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400'
                                        : `${getCategoryColor(note.note_category)} hover:border-amber-400`
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{note.icon}</span>
                                        <span className="font-semibold text-sm">{note.note_text}</span>
                                    </div>
                                    {isNoteSelected(note.note_text) && (
                                        <span className="text-xs text-amber-600 mt-1 block">✓ Selected</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <span className="text-4xl mb-2 block">📝</span>
                            <p>No predefined notes found.</p>
                            <p className="text-sm">You can type custom notes below.</p>
                        </div>
                    )}
                </div>

                {/* Custom Notes Input */}
                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-600 mb-2 block">
                        Selected Notes / Custom Instructions:
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Type custom notes or click on the preset notes above..."
                        className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none h-20 resize-none text-sm"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={() => setNotes('')}
                        className="px-4 py-3 border-2 border-red-200 text-red-500 rounded-xl font-semibold hover:bg-red-50 transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSave(notes); onClose(); }}
                        className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-lg flex items-center justify-center gap-2"
                    >
                        <span>💾</span>
                        <span>Save Notes</span>
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
    const [invoiceNo, setInvoiceNo] = useState('RCP-00001');
    const [runningOrders, setRunningOrders] = useState<RunningOrder[]>([]);
    const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]); // NEW: For fetching from database
    const [isLoadingOrders, setIsLoadingOrders] = useState(false); // NEW: Loading state
    const [runningOrdersSearch, setRunningOrdersSearch] = useState(''); // NEW: Search filter
    const [orderNotes, setOrderNotes] = useState('');
    const [tableNo, setTableNo] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Batch Selection State
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
    const [productBatches, setProductBatches] = useState<ProductionBatch[]>([]);

    // Shift state - LOAD FROM DATABASE instead of mock data
    const [shift, setShift] = useState<ShiftInfo | null>(null);
    const [hasActiveShift, setHasActiveShift] = useState(false);
    const [isLoadingShift, setIsLoadingShift] = useState(true);

    // Food Order Notes state
    const [foodOrderNotes, setFoodOrderNotes] = useState<Array<{ note_id: number; note_text: string; icon: string; note_category: string }>>([]);

    // KOT Number state (from database)
    const [currentKOTNumber, setCurrentKOTNumber] = useState('K0001');

    // Saving state
    const [isSavingPending, setIsSavingPending] = useState(false);

    // Waiter/Staff selection state
    const [waiters, setWaiters] = useState<Array<{ user_id: number; full_name: string; role: string }>>([]);
    const [selectedWaiterId, setSelectedWaiterId] = useState<number | null>(null);
    const [selectedWaiterName, setSelectedWaiterName] = useState<string>('');

    // Hotel/Company Name from database
    const [hotelName, setHotelName] = useState<string>('Your Hotel');

    // ─── OPEN / CLOSE REGISTER ───
    const [showOpeningDrop, setShowOpeningDrop] = useState(false);
    const [openingDropAmount, setOpeningDropAmount] = useState('');
    const [registerOpen, setRegisterOpen] = useState(false);
    const [showCloseRegister, setShowCloseRegister] = useState(false);
    const [closeRegisterData, setCloseRegisterData] = useState<{
        totalSales: number; totalCash: number; totalMpesa: number;
        totalCredit: number; totalExpenses: number; openingCash: number;
        netSales: number; orderCount: number; profit: number;
    } | null>(null);
    const [isLoadingRegister, setIsLoadingRegister] = useState(false);

    // ─── HOLD / RECALL SALE ───
    interface HeldSale {
        id: string;
        cart: CartItem[];
        invoiceNo: string;
        heldAt: string;
        total: number;
        itemCount: number;
        customerName?: string;
        tableNo?: string;
    }
    const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
    const [showHeldSalesModal, setShowHeldSalesModal] = useState(false);

    // ─── LOW STOCK NOTIFICATION ───
    const [lowStockProducts, setLowStockProducts] = useState<{name: string; stock: number; id: number}[]>([]);
    const [showLowStockDropdown, setShowLowStockDropdown] = useState(false);

    // ─── WAITER BILL STATS ───
    const [waiterPaidCount, setWaiterPaidCount] = useState(0);
    const [waiterUnpaidCount, setWaiterUnpaidCount] = useState(0);
    const [waiterPaidTotal, setWaiterPaidTotal] = useState(0);
    const [waiterUnpaidTotal, setWaiterUnpaidTotal] = useState(0);

    // Load hotel name from database
    const loadHotelName = useCallback(async () => {
        try {
            const { data: settingsData } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value')
                .eq('setting_key', 'company_name')
                .single();

            if (settingsData?.setting_value) {
                setHotelName(settingsData.setting_value);
            }
        } catch (err) {
            console.log('Could not load hotel name:', err);
        }
    }, []);

    // Load active shift from database
    const loadActiveShift = useCallback(async () => {
        setIsLoadingShift(true);
        try {
            const { data: openShift, error } = await supabase
                .from('shifts')
                .select('*')
                .eq('status', 'Open')
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error loading shift:', error);
            }

            if (openShift) {
                setShift({
                    id: openShift.shift_id,
                    name: openShift.shift_type || 'Day Shift',
                    code: `SH-${openShift.shift_id}`,
                    startTime: openShift.start_time || '06:00',
                    openingCash: openShift.opening_cash || 0
                });
                setHasActiveShift(true);
            } else {
                setShift(null);
                setHasActiveShift(false);
            }
        } catch (err) {
            console.error('Error checking shift:', err);
            setHasActiveShift(false);
        }
        setIsLoadingShift(false);
    }, []);

    // Load held sales from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('alpha_hotel_held_sales');
            if (saved) setHeldSales(JSON.parse(saved));
        } catch (_) {}
    }, []);

    // Persist held sales to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('alpha_hotel_held_sales', JSON.stringify(heldSales));
        } catch (_) {}
    }, [heldSales]);

    // Hold current sale
    const holdCurrentSale = () => {
        if (cart.length === 0) {
            toast.error('Cart is empty — nothing to hold');
            return;
        }
        const held: HeldSale = {
            id: `HOLD-${Date.now()}`,
            cart: [...cart],
            invoiceNo,
            heldAt: new Date().toISOString(),
            total,
            itemCount: cart.length,
            tableNo: tableNo || undefined,
        };
        setHeldSales(prev => [...prev, held]);
        clearCart();
        toast.success(`Sale held (${held.itemCount} items — Ksh ${held.total.toLocaleString()})`);
    };

    // Recall a held sale
    const recallHeldSale = (heldId: string) => {
        const sale = heldSales.find(h => h.id === heldId);
        if (!sale) return;
        if (cart.length > 0) {
            holdCurrentSale();
        }
        setCart(sale.cart);
        setInvoiceNo(sale.invoiceNo);
        if (sale.tableNo) setTableNo(sale.tableNo);
        setHeldSales(prev => prev.filter(h => h.id !== heldId));
        setShowHeldSalesModal(false);
        toast.success('Sale recalled — continue where you left off');
    };

    // Delete a held sale
    const deleteHeldSale = (heldId: string) => {
        setHeldSales(prev => prev.filter(h => h.id !== heldId));
        toast.success('Held sale removed');
    };

    // ─── OPEN REGISTER ───
    const handleOpenRegister = async () => {
        const amount = Number(openingDropAmount) || 0;
        try {
            const { data: newShift, error } = await supabase.from('shifts').insert({
                shift_date: new Date().toISOString().split('T')[0],
                shift_type: 'Day',
                start_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                opening_cash: amount,
                status: 'Open',
                opened_by: 'Cashier'
            }).select('shift_id').single();

            if (error) throw error;
            setShift({
                id: newShift.shift_id,
                name: 'Day Shift',
                code: `SH-${newShift.shift_id}`,
                startTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                openingCash: amount
            });
            setHasActiveShift(true);
            setRegisterOpen(true);
            setShowOpeningDrop(false);
            setOpeningDropAmount('');
            toast.success(`Register opened with Ksh ${amount.toLocaleString()} opening cash`);
        } catch (err: any) {
            console.error('Open register error:', err);
            toast.error('Failed to open register: ' + err.message);
        }
    };

    // ─── CLOSE REGISTER ───
    const handleCloseRegister = async () => {
        setIsLoadingRegister(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: salesData } = await supabase
                .from('sales')
                .select('sale_id, total_amount, payment_method, total_cost')
                .eq('sale_date', today);

            const sales = salesData || [];
            const totalSales = sales.reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalCash = sales.filter(r => (r.payment_method || '').toLowerCase().includes('cash')).reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalMpesa = sales.filter(r => (r.payment_method || '').toLowerCase().includes('mpesa')).reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalCredit = sales.filter(r => (r.payment_method || '').toLowerCase().includes('credit')).reduce((s, r) => s + (r.total_amount || 0), 0);

            let totalExpenses = 0;
            try {
                const { data: expData } = await supabase.from('expenses').select('amount').eq('expense_date', today);
                totalExpenses = (expData || []).reduce((s, e) => s + (e.amount || 0), 0);
            } catch (_) {}

            const openingCash = shift?.openingCash || 0;
            const netSales = totalSales - totalExpenses - totalCredit;
            const totalCostPrice = sales.reduce((sum, s) => sum + (s.total_cost || 0), 0);
            const profit = totalSales - totalCostPrice;

            setCloseRegisterData({
                totalSales, totalCash, totalMpesa, totalCredit,
                totalExpenses, openingCash, netSales, orderCount: sales.length, profit
            });
            setShowCloseRegister(true);
        } catch (err: any) {
            toast.error('Failed to load register data: ' + err.message);
        }
        setIsLoadingRegister(false);
    };

    // Finalize close register
    const finalizeCloseRegister = async () => {
        if (shift && closeRegisterData) {
            await supabase.from('shifts').update({
                end_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                closing_cash: closeRegisterData.totalCash,
                total_sales: closeRegisterData.totalSales,
                total_expenses: closeRegisterData.totalExpenses,
                net_sales: closeRegisterData.netSales,
                status: 'Closed',
                closed_by: 'Cashier'
            }).eq('shift_id', shift.id);
        }
        setRegisterOpen(false);
        setHasActiveShift(false);
        setShift(null);
        setShowCloseRegister(false);
        setCloseRegisterData(null);
        toast.success('Register closed successfully');
    };

    // Print Close Register Report
    const printCloseRegisterReport = () => {
        if (!closeRegisterData) return;
        const d = closeRegisterData;
        const now = new Date();
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Close Register</title>
<style>
  @page{margin:0;size:80mm auto;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;font-size:11px;font-weight:700;width:80mm;padding:4mm;background:#fff;color:#000;line-height:1.4;}
  .c{text-align:center;} .r{display:flex;justify-content:space-between;padding:3px 0;border-bottom:0.5px dashed #ccc;}
  .d{border:none;border-top:1px solid #000;margin:4px 0;} .dd{border:none;border-top:1px dashed #000;margin:3px 0;}
  .big{font-size:14px;font-weight:900;} @media print{body{width:80mm;}}
</style></head><body>
  <div class="c"><div style="font-size:14px;font-weight:900;text-transform:uppercase;">${hotelName}</div>
  <div style="font-size:9px;margin:2px 0;">Close Register Report</div></div><hr class="d">
  <div class="c" style="margin:4px 0;"><div style="background:#000;color:#fff;padding:4px 12px;display:inline-block;font-size:11px;font-weight:900;">END OF DAY REPORT</div></div><hr class="dd">
  <div class="r"><span style="font-size:9px;">Date</span><span style="font-size:10px;">${now.toLocaleDateString('en-GB')}</span></div>
  <div class="r"><span style="font-size:9px;">Time</span><span style="font-size:10px;">${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></div>
  <div class="r"><span style="font-size:9px;">Total Orders</span><span style="font-size:10px;">${d.orderCount}</span></div><hr class="d">
  <div class="c" style="font-size:9px;font-weight:900;letter-spacing:1px;margin:3px 0;">SALES BREAKDOWN</div>
  <div class="r"><span>💵 Cash Sales</span><span class="big">Ksh ${d.totalCash.toLocaleString()}</span></div>
  <div class="r"><span>📱 M-Pesa Sales</span><span class="big">Ksh ${d.totalMpesa.toLocaleString()}</span></div>
  <div class="r"><span>📋 Credit Sales</span><span class="big">Ksh ${d.totalCredit.toLocaleString()}</span></div><hr class="dd">
  <div style="background:#000;color:#fff;padding:5px 8px;margin:4px 0;display:flex;justify-content:space-between;">
    <span style="font-size:11px;font-weight:900;">TOTAL SALES</span><span style="font-size:14px;font-weight:900;">Ksh ${d.totalSales.toLocaleString()}</span></div><hr class="d">
  <div class="c" style="font-size:9px;font-weight:900;letter-spacing:1px;margin:3px 0;">CASH SUMMARY</div>
  <div class="r"><span>🟢 Opening Cash</span><span class="big">Ksh ${d.openingCash.toLocaleString()}</span></div>
  <div class="r"><span>💵 Cash Sales</span><span class="big">Ksh ${d.totalCash.toLocaleString()}</span></div>
  <div class="r"><span>🔴 Expenses</span><span style="color:#c00;" class="big">-Ksh ${d.totalExpenses.toLocaleString()}</span></div><hr class="dd">
  <div style="background:#000;color:#fff;padding:6px 8px;margin:4px 0;display:flex;justify-content:space-between;">
    <span style="font-size:12px;font-weight:900;">NET SALES</span><span style="font-size:16px;font-weight:900;">Ksh ${d.netSales.toLocaleString()}</span></div>
  <div style="background:#000;color:#fff;padding:5px 8px;margin:2px 0;display:flex;justify-content:space-between;">
    <span style="font-size:10px;font-weight:900;">EXPECTED IN DRAWER</span><span style="font-size:13px;font-weight:900;">Ksh ${(d.openingCash + d.totalCash - d.totalExpenses).toLocaleString()}</span></div>
  <div style="background:#000;color:#fff;padding:6px 8px;margin:4px 0;display:flex;justify-content:space-between;">
    <span style="font-size:12px;font-weight:900;">📈 PROFIT</span><span style="font-size:16px;font-weight:900;">Ksh ${(d.profit || 0).toLocaleString()}</span></div><hr class="d">
  <div class="c" style="padding:4px 0;"><div style="font-size:8px;">Printed: ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
    <div style="font-size:7px;margin-top:2px;">Powered by Alpha Plus Hotel POS</div></div>
</body></html>`;
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) { doc.open(); doc.write(html); doc.close();
            iframe.onload = () => { setTimeout(() => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (e) { console.error(e); } setTimeout(() => document.body.removeChild(iframe), 1000); }, 300); };
        }
    };

    // Load products from database
    const loadProducts = useCallback(async () => {
        setIsLoadingProducts(true);
        try {
            // Load products
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .eq('show_ps', true) // Only show products marked to show in POS
                .order('product_name');

            if (error) throw error;

            // Load batch stock for all products
            const { data: batchData } = await supabase
                .from('production_batches')
                .select('product_id, qty_remaining')
                .eq('status', 'In Stock')
                .gt('qty_remaining', 0);

            // Calculate total available stock per product from batches
            const stockByProduct: Record<number, number> = {};
            (batchData || []).forEach((batch) => {
                const pid = batch.product_id;
                stockByProduct[pid] = (stockByProduct[pid] || 0) + (batch.qty_remaining || 0);
            });

            // Transform database products to POS format
            const posProducts: Product[] = (data || []).map(p => ({
                id: p.pid,
                name: p.product_name,
                price: p.sales_cost || 0,
                purchasePrice: p.purchase_cost || 0,
                category: p.category || 'Uncategorized',
                stock: stockByProduct[p.pid] || 0, // Stock from production batches
                color: p.button_ui_color || 'from-blue-400 to-blue-600',
                barcode: p.barcode,
                hasBatches: (stockByProduct[p.pid] || 0) > 0, // Has batches if stock > 0
            }));

            setProducts(posProducts);

            // Extract unique categories from products
            const categorySet = new Set(posProducts.map(p => p.category).filter(Boolean));
            const uniqueCategories = ['All', ...Array.from(categorySet)];
            setCategories(uniqueCategories);

        } catch (err) {
            console.error('Error loading products:', err);
            toast.error('Failed to load products');
        }
        setIsLoadingProducts(false);
    }, []);

    // Load unpaid orders from database
    const loadUnpaidOrders = useCallback(async () => {
        setIsLoadingOrders(true);
        try {
            // Fetch unpaid sales from database (status = 'Pending')
            const { data: sales, error } = await supabase
                .from('sales')
                .select('*')
                .eq('status', 'Pending')
                .order('sale_datetime', { ascending: false })
                .limit(20);

            if (error) throw error;

            if (sales && sales.length > 0) {
                // Fetch items for each sale
                const ordersWithItems = await Promise.all(
                    sales.map(async (sale) => {
                        const { data: items } = await supabase
                            .from('sales_items')
                            .select('*')
                            .eq('sale_id', sale.sale_id);

                        return {
                            ...sale,
                            items: items || []
                        };
                    })
                );

                setUnpaidOrders(ordersWithItems);
            } else {
                setUnpaidOrders([]);
            }
        } catch (error) {
            console.error('Error loading unpaid orders:', error);
            toast.error('Failed to load running orders');
        }
        setIsLoadingOrders(false);
    }, []);

    // Load products on mount
    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // Load food order notes and receipt/KOT numbers on mount
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Load active shift FIRST
                await loadActiveShift();

                // Load hotel name from database
                await loadHotelName();

                // Load food order notes
                const notes = await getFoodOrderNotes();
                setFoodOrderNotes(notes || []);

                // Load next receipt number
                const nextReceipt = await getNextReceiptNumber();
                setInvoiceNo(nextReceipt);

                // Load next KOT number
                const nextKOT = await getNextKOTNumber();
                setCurrentKOTNumber(nextKOT);

                // Load waiters/staff from users table
                const { data: usersData, error: usersError } = await supabase
                    .from('users')
                    .select('user_id, name, user_type')
                    .eq('active', true)
                    .order('name');

                if (usersError) {
                    console.error('Error loading waiters:', usersError);
                } else if (usersData && usersData.length > 0) {
                    // Transform to match expected interface
                    setWaiters(usersData.map(u => ({
                        user_id: u.user_id,
                        full_name: u.name,
                        role: u.user_type
                    })));
                }

                // Load unpaid orders (running orders)
                await loadUnpaidOrders();

            } catch (err) {
                console.error('Error loading initial data:', err);
            }
        };

        loadInitialData();
    }, [loadActiveShift, loadHotelName, loadUnpaidOrders]);

    // ─── LOAD LOW STOCK NOTIFICATION (products with stock < 10) ───
    useEffect(() => {
        if (products.length > 0) {
            const low = products.filter(p => p.stock < 10 && p.stock >= 0).map(p => ({ name: p.name, stock: p.stock, id: p.id }));
            setLowStockProducts(low);
        }
    }, [products]);

    // ─── LOAD WAITER BILL STATS (logged-in waiter) ───
    useEffect(() => {
        const loadWaiterBills = async () => {
            if (!selectedWaiterName && !selectedWaiterId) return;
            const waiterName = selectedWaiterName || 'Cashier';
            const today = new Date().toISOString().split('T')[0];
            try {
                // Paid bills
                const { data: paid } = await supabase
                    .from('sales')
                    .select('sale_id, total_amount')
                    .eq('sale_date', today)
                    .ilike('waiter_name', `%${waiterName}%`)
                    .eq('status', 'Completed');
                setWaiterPaidCount((paid || []).length);
                setWaiterPaidTotal((paid || []).reduce((s, r) => s + (r.total_amount || 0), 0));

                // Unpaid bills
                const { data: unpaid } = await supabase
                    .from('sales')
                    .select('sale_id, total_amount')
                    .eq('sale_date', today)
                    .ilike('waiter_name', `%${waiterName}%`)
                    .eq('status', 'Pending');
                setWaiterUnpaidCount((unpaid || []).length);
                setWaiterUnpaidTotal((unpaid || []).reduce((s, r) => s + (r.total_amount || 0), 0));
            } catch (err) {
                console.log('Error loading waiter bills:', err);
            }
        };
        loadWaiterBills();
        const interval = setInterval(loadWaiterBills, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, [selectedWaiterName, selectedWaiterId]);

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
    const addToCart = async (product: Product) => {
        if (product.stock === 0) {
            toast.error('Product out of stock!');
            return;
        }

        // Check if product has production batches - load from database
        if (product.hasBatches) {
            try {
                const { data: batchData } = await supabase
                    .from('production_batches')
                    .select('*')
                    .eq('product_id', product.id)
                    .eq('status', 'In Stock')
                    .gt('qty_remaining', 0)
                    .order('production_date', { ascending: true });

                if (batchData && batchData.length > 0) {
                    // Convert to ProductionBatch format
                    const batches: ProductionBatch[] = batchData.map(b => ({
                        batchId: b.batch_id,
                        batchNumber: b.batch_number,
                        qtyProduced: b.qty_produced || 0,
                        qtyRemaining: b.qty_remaining || 0,
                        costPerUnit: b.cost_per_unit || 0,
                        productionDate: b.production_date,
                        expiryDate: b.expiry_date,
                        daysOld: Math.floor((Date.now() - new Date(b.production_date).getTime()) / (1000 * 60 * 60 * 24)),
                        createdBy: b.created_by || 'Unknown',
                        totalValue: (b.qty_remaining || 0) * (b.cost_per_unit || 0),
                    }));

                    // Show batch selection modal
                    setPendingProduct(product);
                    setProductBatches(batches);
                    setShowBatchModal(true);
                    return;
                }
            } catch (err) {
                console.error('Error loading batches:', err);
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

    // Kenya Tax Calculation (VAT 16% + Levy 2%)
    // Tax is INCLUSIVE in prices (default for hotels in Kenya)
    const amountAfterDiscount = subtotal - totalDiscount;
    const taxRate = 0.18; // 16% VAT + 2% Levy
    const netAmount = amountAfterDiscount / (1 + taxRate); // Extract net from inclusive price
    const vatAmount = netAmount * 0.16;
    const levyAmount = netAmount * 0.02;
    const totalTax = vatAmount + levyAmount;

    const total = amountAfterDiscount; // Customer pays the inclusive amount

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
                shiftCode: shift?.code || 'NO-SHIFT',
                isPaid: false,
                // Kenya Tax Fields
                taxMode: 'inclusive',
                vatRate: 16,
                levyRate: 2,
                hotelName: 'Alpha Plus Hotel' // Will be loaded from DB in receipt printer
            }
        );
    };

    // Send to Kitchen (Print KOT then Customer Bill) - Now saves to database as Pending
    const sendToKitchen = async () => {
        if (cart.length === 0) return;
        if (isSavingPending) return; // Prevent double submission

        setIsSavingPending(true);

        try {
            // Create KOT data for printing
            const kotData = createKOTData(
                currentKOTNumber,
                cart.map(item => ({ name: item.name, qty: item.qty, notes: item.notes })),
                tableNo ? 'Dine-In' : 'Take-Away',
                {
                    tableNo: tableNo || undefined,
                    waiter: selectedWaiterName || 'Cashier',
                    orderNotes: orderNotes || undefined,
                    priority: 'normal'
                }
            );

            // Load company info from database for receipts
            const companyInfo = await loadCompanyInfo();

            const kotHtmlContent = generateKOTHTML(kotData, companyInfo);
            setKOTHTML(kotHtmlContent);

            // Create Customer Bill (Unpaid) data for printing
            const billData = createUnpaidBillData();
            const billHtmlContent = generateCustomerBillHTML(billData, companyInfo, false);
            setBillHTML(billHtmlContent);

            // Get current logged in user
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            // Get FRESH receipt and KOT numbers to avoid duplicate constraint errors
            const freshReceiptNo = await getNextReceiptNumber();
            const freshKOTNumber = await getNextKOTNumber();
            setInvoiceNo(freshReceiptNo);
            setCurrentKOTNumber(freshKOTNumber);

            // Save pending sale to database with waiter info
            await savePendingSale({
                receiptNo: freshReceiptNo,
                kotNumber: freshKOTNumber,
                items: cart.map(item => ({
                    productId: item.id,
                    productName: item.name,
                    qty: item.qty,
                    price: item.price,
                    costPrice: item.costPerUnit || item.purchasePrice,
                    discount: item.discount,
                    notes: item.notes,
                    batchId: item.batchId,
                    batchNumber: item.batchNumber,
                })),
                subtotal: subtotal,
                discount: totalDiscount,
                taxAmount: 0,
                total: total,
                cashierName: currentUser?.name || 'Cashier',
                waiterId: selectedWaiterId || undefined,
                waiterName: selectedWaiterName || undefined,
                shiftId: shift?.id,
                shiftName: shift?.name,
                shiftCode: shift?.code,
                tableName: tableNo || undefined,
                orderType: tableNo ? 'Dine-In' : 'Take-Away',
                orderNotes: orderNotes || undefined,
            });

            toast.success('Order sent to kitchen & saved as pending! 🍳');

            // Get next invoice and KOT numbers for the next order
            const nextReceipt = await getNextReceiptNumber();
            setInvoiceNo(nextReceipt);
            const nextKOT = await getNextKOTNumber();
            setCurrentKOTNumber(nextKOT);

            // Show KOT preview
            setShowKOTPreview(true);
        } catch (error: any) {
            console.error('Error saving pending sale:', error);
            // Show detailed error message for debugging
            const errorMsg = error?.message || error?.details || error?.hint || JSON.stringify(error);
            toast.error(`KOT Error: ${errorMsg}`, { duration: 8000 });
        } finally {
            setIsSavingPending(false);
        }
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

    // Prepare POS for next sale (clear cart, regenerate numbers)
    const prepareForNextSale = async () => {
        // Clear the cart
        clearCart();

        // Reload products to get updated stock
        loadProducts();

        // Generate next receipt number from database
        try {
            const nextReceipt = await getNextReceiptNumber();
            setInvoiceNo(nextReceipt);

            const nextKOT = await getNextKOTNumber();
            setCurrentKOTNumber(nextKOT);
        } catch (err) {
            console.error('Error generating next numbers:', err);
            // Fallback: increment locally
            const num = parseInt(invoiceNo.replace('RCP-', '').replace('INV-', '')) + 1;
            setInvoiceNo(`RCP-${String(num).padStart(5, '0')}`);
        }
    };

    // Print Customer Bill (unpaid) - After printing, prepare for next sale
    const printBillNow = async () => {
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

        // After KOT + Bill, clear cart and prepare for next sale
        // Transaction is already saved as Pending in sendToKitchen
        await prepareForNextSale();
        toast.success('Ready for next order! 🛒');
    };

    // Close Bill without printing - Still prepare for next sale
    const closeBillAndPrepareNext = async () => {
        setShowBillPreview(false);
        await prepareForNextSale();
        toast.success('Ready for next order! 🛒');
    };

    // Navigate to Bill Payment page with selected receipt
    const reopenOrderForPayment = async (order: any) => {
        try {
            // Close running orders sidebar
            setShowRunningOrders(false);

            // Navigate to Bill Payment page with the receipt number
            const receiptNo = order.receipt_no || order.invoice_no;
            window.location.href = `/dashboard/bill-payment?receipt=${receiptNo}`;

            toast.success(`Opening payment for ${receiptNo}`);
        } catch (error) {
            console.error('Error opening payment:', error);
            toast.error('Failed to open payment page');
        }
    };

    // Save completed sale to database
    const saveSaleToDatabase = async (paymentMethod: string, amountPaid: number, mpesaReceipt?: string, customerName?: string) => {
        try {
            // Get current user
            const userData = localStorage.getItem('user');
            const currentUser = userData ? JSON.parse(userData) : null;

            // Calculate values
            const changeAmount = paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0;
            const status = paymentMethod === 'credit' ? 'Pending' : 'Completed';

            // Calculate total cost for profit
            const totalCost = cart.reduce((sum, item) => sum + ((item.purchasePrice || 0) * item.qty), 0);
            const profit = total - totalCost;

            // 1. Create sale record with correct column names matching schema
            const { data: saleData, error: saleError } = await supabase
                .from('sales')
                .insert({
                    receipt_no: invoiceNo,
                    sale_date: new Date().toISOString().split('T')[0],
                    sale_time: new Date().toTimeString().split(' ')[0],
                    sale_datetime: new Date().toISOString(),
                    shift_id: shift?.id || null,
                    shift_name: shift?.name || null,
                    shift_code: shift?.code || null,
                    waiter_id: selectedWaiterId || null,
                    waiter_name: selectedWaiterName || null,
                    table_id: null,
                    table_name: tableNo || null,
                    table_no: tableNo || null,
                    order_type: tableNo ? 'Dine-in' : 'Quick Sale',
                    customer_name: customerName || null,
                    subtotal: subtotal,
                    subtotal_before_tax: subtotal,
                    discount: totalDiscount,
                    discount_percent: 0,
                    tax_rate: 0,
                    tax_amount: 0,
                    total_amount: total,
                    total_cost: totalCost,
                    profit: profit,
                    payment_method: paymentMethod.toUpperCase(),
                    amount_paid: amountPaid,
                    change_amount: changeAmount,
                    mpesa_code: mpesaReceipt || null,
                    mpesa_receipt: mpesaReceipt || null,
                    status: status,
                    notes: orderNotes || null,
                    order_notes: orderNotes || null,
                    created_by: currentUser?.name || 'Cashier'
                })
                .select()
                .single();

            if (saleError) {
                console.error('Error creating sale:', saleError);
                throw saleError;
            }

            const saleId = saleData.sale_id;

            // 2. Create sale items
            const saleItems = cart.map(item => ({
                sale_id: saleId,
                product_id: item.id,
                product_name: item.name,
                quantity: item.qty,
                unit_price: item.price,
                cost_price: item.purchasePrice || 0,
                discount: item.discount || 0,
                total_price: (item.price * item.qty) - (item.discount || 0),
                notes: item.notes || null,
                batch_id: item.batchId || null
            }));

            const { error: itemsError } = await supabase
                .from('sales_items')
                .insert(saleItems);

            if (itemsError) {
                console.error('Error creating sale items:', itemsError);
            }

            // 3. Deduct stock for each sold item from products table
            for (const item of cart) {
                // Get current stock
                const { data: productData } = await supabase
                    .from('products')
                    .select('pid, stock')
                    .eq('pid', item.id)
                    .single();

                if (productData) {
                    const newStock = Math.max(0, (productData.stock || 0) - item.qty);
                    await supabase
                        .from('products')
                        .update({ stock: newStock, updated_at: new Date().toISOString() })
                        .eq('pid', productData.pid);
                }

                // If item has batch, update production_batches qty_remaining
                if (item.batchId) {
                    const { data: batchData } = await supabase
                        .from('production_batches')
                        .select('batch_id, qty_remaining')
                        .eq('batch_id', item.batchId)
                        .single();

                    if (batchData) {
                        const newRemaining = Math.max(0, (batchData.qty_remaining || 0) - item.qty);
                        await supabase
                            .from('production_batches')
                            .update({ qty_remaining: newRemaining })
                            .eq('batch_id', batchData.batch_id);
                    }
                }
            }

            console.log('✅ Sale saved successfully:', saleId);
            toast.success(`Sale ${invoiceNo} saved successfully!`);

            // Generate next invoice number
            const nextNo = await getNextReceiptNumber();
            setInvoiceNo(nextNo);

            return true;
        } catch (error) {
            console.error('Error saving sale:', error);
            toast.error('Failed to save sale to database');
            return false;
        }
    };


    // Complete sale
    const completeSale = async (paymentMethod: string, amountPaid: number, mpesaReceipt?: string, customerName?: string) => {
        // Save to database first
        const saved = await saveSaleToDatabase(paymentMethod, amountPaid, mpesaReceipt, customerName);
        if (!saved) {
            toast.error('Failed to save sale');
            return;
        }

        // Load company info from database for receipt
        const companyInfo = await loadCompanyInfo();

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
                shiftCode: shift?.code || 'NO-SHIFT',
                isPaid: true,
                // Kenya Tax Fields
                taxMode: 'inclusive',
                vatRate: 16,
                levyRate: 2,
                hotelName: companyInfo?.name || 'Alpha Plus Hotel'
            }
        );

        const html = generateCustomerBillHTML(receiptData, companyInfo, true);
        setReceiptHTML(html);
        setShowPayment(false);
        setShowReceiptPreview(true);
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
        <>
            {/* No Active Shift / Register Closed Warning */}
            {!isLoadingShift && !hasActiveShift && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
                        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                            <span className="text-4xl">🟢</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Register is Closed</h2>
                        <p className="text-gray-600 mb-6">
                            Open the register with an opening cash float to start making sales.
                        </p>

                        <div className="mb-4">
                            <label className="text-sm font-medium text-gray-600 mb-2 block text-left">💰 Opening Cash Amount</label>
                            <input
                                type="number"
                                value={openingDropAmount}
                                onChange={(e) => setOpeningDropAmount(e.target.value)}
                                placeholder="Enter amount (e.g., 5000)"
                                className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-xl font-bold text-center"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {[0, 1000, 2000, 5000].map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => setOpeningDropAmount(amt.toString())}
                                    className="py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-medium transition-colors text-sm"
                                >
                                    {amt === 0 ? 'Zero' : `Ksh ${amt.toLocaleString()}`}
                                </button>
                            ))}
                        </div>

                        <div className="p-4 bg-green-50 rounded-xl border border-green-200 mb-4 text-center">
                            <span className="text-green-700 font-medium text-sm">Opening Cash: </span>
                            <span className="text-2xl font-bold text-green-600">Ksh {(Number(openingDropAmount) || 0).toLocaleString()}</span>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={handleOpenRegister}
                                className="block w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all"
                            >
                                ✅ Open Register
                            </button>
                            <a
                                href="/dashboard"
                                className="block w-full py-3 text-gray-500 hover:text-gray-700 font-medium"
                            >
                                ← Back to Dashboard
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className={`flex h-[calc(100vh-64px)] -m-6 bg-gray-50 ${isFullscreen ? 'fixed inset-0 z-50 h-screen m-0' : ''}`}>
                {/* Left Side - Products */}
                <div className="flex-1 flex flex-col bg-white">
                    {/* Header */}
                    <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {/* POS Title Only */}
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-base shadow-md">
                                    🛒
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-gray-800 leading-tight">Point of Sale</h2>
                                    <p className="text-[10px] text-gray-500">Select products to add to cart</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Fullscreen Button */}
                                <button
                                    onClick={toggleFullscreen}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors border border-gray-200 text-sm"
                                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                                >
                                    {isFullscreen ? '⛶' : '⛶'}
                                </button>
                                {/* Quick Action Buttons */}
                                <a href="/dashboard" className="p-2 bg-gray-100 hover:bg-indigo-100 rounded-lg text-sm transition-colors border border-gray-200" title="Dashboard">📊</a>
                                <a href="/dashboard/products" className="p-2 bg-gray-100 hover:bg-orange-100 rounded-lg text-sm transition-colors border border-gray-200" title="Dish Products">🍽️</a>
                                <a href="/dashboard/recipe" className="p-2 bg-gray-100 hover:bg-amber-100 rounded-lg text-sm transition-colors border border-gray-200" title="Recipe">📝</a>
                                <a href="/dashboard/sales" className="p-2 bg-gray-100 hover:bg-green-100 rounded-lg text-sm transition-colors border border-gray-200" title="Today's Sales">💰</a>
                                <a href="/dashboard/shift-reports" className="p-2 bg-gray-100 hover:bg-blue-100 rounded-lg text-sm transition-colors border border-gray-200" title="Register Reports">🧾</a>
                                <a href="/dashboard/dish-stock" className="p-2 bg-gray-100 hover:bg-teal-100 rounded-lg text-sm transition-colors border border-gray-200" title="Available Stock">📦</a>
                                <a href="/dashboard/bills" className="p-2 bg-gray-100 hover:bg-purple-100 rounded-lg text-sm transition-colors border border-gray-200" title="My Bills">🧑‍💼</a>
                                {/* Low Stock Notification Bell */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowLowStockDropdown(!showLowStockDropdown)}
                                        className="p-2 bg-gray-100 hover:bg-red-100 rounded-lg text-sm transition-colors border border-gray-200 relative"
                                        title={`${lowStockProducts.length} products low on stock`}
                                    >
                                        🔔
                                        {lowStockProducts.length > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                                {lowStockProducts.length > 99 ? '99+' : lowStockProducts.length}
                                            </span>
                                        )}
                                    </button>
                                    {/* Low Stock Dropdown */}
                                    {showLowStockDropdown && (
                                        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[400px] overflow-hidden flex flex-col">
                                            <div className="p-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-t-xl">
                                                <h3 className="text-sm font-bold">⚠️ Low Stock Alert</h3>
                                                <p className="text-[10px] opacity-80">{lowStockProducts.length} product{lowStockProducts.length !== 1 ? 's' : ''} below 10 units</p>
                                            </div>
                                            <div className="flex-1 overflow-y-auto max-h-[300px]">
                                                {lowStockProducts.length === 0 ? (
                                                    <div className="p-6 text-center text-gray-400">
                                                        <span className="text-3xl block mb-2">✅</span>
                                                        <p className="text-sm">All products well stocked!</p>
                                                    </div>
                                                ) : (
                                                    lowStockProducts.map(p => (
                                                        <div key={p.id} className="flex items-center justify-between p-2.5 border-b border-gray-100 hover:bg-gray-50">
                                                            <span className="text-xs text-gray-700 font-medium truncate flex-1">{p.name}</span>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.stock === 0 ? 'bg-red-100 text-red-600' : p.stock < 5 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                                                {p.stock === 0 ? 'OUT' : `${p.stock} left`}
                                                            </span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                            <div className="p-2 border-t border-gray-200">
                                                <a href="/dashboard/dish-stock" className="block w-full py-2 text-center text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">View Full Stock →</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* Waiter Bill Stats */}
                                <a href="/dashboard/bills" className="flex items-center gap-1.5 px-2 py-1.5 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors" title="Paid Bills">
                                    <span className="text-[10px]">✅</span>
                                    <span className="text-[10px] font-bold text-green-700">{waiterPaidCount}</span>
                                </a>
                                <a href="/dashboard/bills?status=Pending" className="flex items-center gap-1.5 px-2 py-1.5 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors" title="Unpaid Bills">
                                    <span className="text-[10px]">⏳</span>
                                    <span className="text-[10px] font-bold text-orange-700">{waiterUnpaidCount}</span>
                                </a>
                                {/* Invoice - Compact */}
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                                    <span className="text-xs text-blue-600">🧾</span>
                                    <span className="text-xs font-bold text-blue-700">{invoiceNo}</span>
                                </div>
                                {/* Shift Info - Compact */}
                                {hasActiveShift && shift && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 rounded-lg border border-green-200">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                        <span className="text-xs font-semibold text-green-700">{shift.name}</span>
                                    </div>
                                )}
                                {/* Close Register - Compact */}
                                {hasActiveShift && (
                                    <button
                                        onClick={handleCloseRegister}
                                        disabled={isLoadingRegister}
                                        className="px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                    >
                                        🔴 Close
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Search, Table & Waiter */}
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
                            {/* Waiter Dropdown */}
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">👤</span>
                                <select
                                    value={selectedWaiterId || ''}
                                    onChange={(e) => {
                                        const id = e.target.value ? parseInt(e.target.value) : null;
                                        setSelectedWaiterId(id);
                                        const waiter = waiters.find(w => w.user_id === id);
                                        setSelectedWaiterName(waiter?.full_name || '');
                                    }}
                                    className="w-44 pl-10 pr-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl focus:outline-none focus:border-purple-400 text-gray-800 appearance-none cursor-pointer font-medium"
                                >
                                    <option value="">Select Waiter</option>
                                    {waiters.map(waiter => (
                                        <option key={waiter.user_id} value={waiter.user_id}>
                                            {waiter.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {/* Table Number */}
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🪑</span>
                                <input
                                    type="text"
                                    value={tableNo}
                                    onChange={(e) => setTableNo(e.target.value)}
                                    placeholder="Table No"
                                    className="w-28 pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-gray-800 placeholder-gray-400"
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

                    {/* Original Quick Action Buttons */}
                    <div className="px-3 pb-3 pt-1 bg-gradient-to-r from-gray-100 via-white to-gray-100">
                        <div className="grid grid-cols-8 gap-2">
                            <a href="/dashboard/bill-payment" className="group p-3 bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 rounded-xl text-white text-center hover:shadow-lg hover:shadow-orange-500/40 transition-all hover:scale-105 cursor-pointer">
                                <span className="text-lg block group-hover:animate-bounce">💰</span>
                                <span className="text-[10px] font-bold">Receive Payment</span>
                            </a>
                            <a href="/dashboard/bills" className="group p-3 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-xl text-white text-center hover:shadow-lg hover:shadow-blue-500/40 transition-all hover:scale-105 cursor-pointer">
                                <span className="text-lg block group-hover:animate-bounce">📋</span>
                                <span className="text-[10px] font-bold">My Bills</span>
                            </a>
                            <a href="/dashboard/sales" className="group p-3 bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 rounded-xl text-white text-center hover:shadow-lg hover:shadow-green-500/40 transition-all hover:scale-105 cursor-pointer">
                                <span className="text-lg block group-hover:animate-bounce">📊</span>
                                <span className="text-[10px] font-bold">Day Sales</span>
                            </a>
                            <button className="group p-3 bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-xl text-white text-center hover:shadow-lg hover:shadow-purple-500/40 transition-all hover:scale-105">
                                <span className="text-lg block group-hover:animate-bounce">🔄</span>
                                <span className="text-[10px] font-bold">Merge Bill</span>
                            </button>
                            <button className="group p-3 bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-500 rounded-xl text-white text-center hover:shadow-lg hover:shadow-teal-500/40 transition-all hover:scale-105">
                                <span className="text-lg block group-hover:animate-bounce">📈</span>
                                <span className="text-[10px] font-bold">Sales Summary</span>
                            </button>
                            <a href="/dashboard/bills?status=Pending" className="group p-3 bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-500 rounded-xl text-white text-center hover:shadow-lg hover:shadow-amber-500/40 transition-all hover:scale-105 cursor-pointer">
                                <span className="text-lg block group-hover:animate-bounce">⏳</span>
                                <span className="text-[10px] font-bold">Pending Bills</span>
                            </a>
                            <button onClick={clearCart} className="group p-3 bg-gradient-to-br from-gray-500 via-gray-600 to-slate-700 rounded-xl text-white text-center hover:shadow-lg hover:shadow-gray-500/40 transition-all hover:scale-105">
                                <span className="text-lg block group-hover:animate-bounce">🗑️</span>
                                <span className="text-[10px] font-bold">Clear</span>
                            </button>
                            <button className="group p-3 bg-gradient-to-br from-rose-500 via-red-500 to-pink-600 rounded-xl text-white text-center hover:shadow-lg hover:shadow-rose-500/40 transition-all hover:scale-105">
                                <span className="text-lg block group-hover:animate-bounce">🏁</span>
                                <span className="text-[10px] font-bold">Closing Stock</span>
                            </button>
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
                                {/* Recall / Held Sales Button */}
                                <button
                                    onClick={() => setShowHeldSalesModal(true)}
                                    className="relative p-2 hover:bg-amber-50 rounded-xl text-amber-500 transition-colors border border-amber-200"
                                    title="Recall Held Sale"
                                >
                                    📋
                                    {heldSales.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                                            {heldSales.length}
                                        </span>
                                    )}
                                </button>
                                {/* Hold Current Sale */}
                                {cart.length > 0 && (
                                    <button
                                        onClick={holdCurrentSale}
                                        className="p-2 hover:bg-amber-50 rounded-xl text-amber-600 transition-colors border border-amber-200"
                                        title="Hold Sale"
                                    >
                                        ⏸️
                                    </button>
                                )}
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

                            {/* Tax Breakdown */}
                            {totalTax > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-1">
                                    <div className="text-xs font-bold text-blue-700 mb-1">📊 Tax Breakdown (Inclusive)</div>
                                    <div className="flex justify-between text-xs text-gray-600">
                                        <span>Net Amount:</span>
                                        <span>Ksh {Math.round(netAmount).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-blue-600">
                                        <span>VAT 16%:</span>
                                        <span>Ksh {Math.round(vatAmount).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-blue-600">
                                        <span>Tourism Levy 2%:</span>
                                        <span>Ksh {Math.round(levyAmount).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-bold text-blue-700 border-t border-blue-300 pt-1">
                                        <span>Total Tax:</span>
                                        <span>Ksh {Math.round(totalTax).toLocaleString()}</span>
                                    </div>
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
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <span>📋</span> Running Orders
                                    <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full">
                                        {unpaidOrders.length}
                                    </span>
                                </h2>
                                <button
                                    onClick={() => setShowRunningOrders(false)}
                                    className="text-2xl text-gray-400 hover:text-gray-600"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Search Input */}
                            <div className="mb-4">
                                <input
                                    type="text"
                                    placeholder="🔍 Search by receipt, customer, or table..."
                                    value={runningOrdersSearch}
                                    onChange={(e) => setRunningOrdersSearch(e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-orange-400 focus:outline-none text-sm"
                                />
                            </div>

                            {isLoadingOrders ? (
                                <div className="text-center text-gray-400 py-12">
                                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3"></div>
                                    <p className="font-medium">Loading orders...</p>
                                </div>
                            ) : unpaidOrders.filter(order =>
                                !runningOrdersSearch ||
                                order.invoice_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                order.customer_name?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                order.table_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase())
                            ).length === 0 ? (
                                <div className="text-center text-gray-400 py-12">
                                    <span className="text-5xl block mb-3 opacity-50">📭</span>
                                    <p className="font-medium">
                                        {runningOrdersSearch ? 'No matching orders' : 'No unpaid orders'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {unpaidOrders
                                        .filter(order =>
                                            !runningOrdersSearch ||
                                            order.invoice_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                            order.customer_name?.toLowerCase().includes(runningOrdersSearch.toLowerCase()) ||
                                            order.table_no?.toLowerCase().includes(runningOrdersSearch.toLowerCase())
                                        )
                                        .map(order => (
                                            <RunningOrderCard
                                                key={order.id}
                                                order={order}
                                                onReopen={reopenOrderForPayment}
                                            />
                                        ))
                                    }
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

                <FoodOrderNotesModal
                    isOpen={showNotesModal}
                    onClose={() => setShowNotesModal(false)}
                    currentNotes={cart.find(i => i.id === editingItemId)?.notes || ''}
                    onSave={(notes: string) => editingItemId && updateItemNotes(editingItemId, notes)}
                    foodNotes={foodOrderNotes}
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
                                    onClick={closeBillAndPrepareNext}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                                >
                                    Skip Print & Next
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

            {/* Held Sales Modal */}
            {showHeldSalesModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowHeldSalesModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">📋 Held Sales</h2>
                                <p className="text-amber-100 text-xs mt-0.5">{heldSales.length} transaction{heldSales.length !== 1 ? 's' : ''} on hold</p>
                            </div>
                            <button onClick={() => setShowHeldSalesModal(false)} className="p-2 hover:bg-white/20 rounded-xl text-white text-lg">✕</button>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {heldSales.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                    <span className="text-5xl mb-3">📋</span>
                                    <p className="font-medium">No held sales</p>
                                    <p className="text-sm">Hold a sale from the cart to see it here</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {heldSales.map(h => {
                                        const heldTime = new Date(h.heldAt);
                                        const minsAgo = Math.floor((Date.now() - heldTime.getTime()) / 60000);
                                        const timeLabel = minsAgo < 1 ? 'Just now' : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo / 60)}h ${minsAgo % 60}m ago`;
                                        return (
                                            <div key={h.id} className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm hover:shadow-md transition-all p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl">🧾</span>
                                                        <div>
                                                            <p className="font-bold text-gray-800">{h.invoiceNo}</p>
                                                            <p className="text-xs text-gray-500">⏱️ {timeLabel}{h.tableNo ? ` • Table ${h.tableNo}` : ''}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-black text-green-600">Ksh {h.total.toLocaleString()}</p>
                                                        <p className="text-xs text-gray-500">{h.itemCount} item{h.itemCount !== 1 ? 's' : ''}</p>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50 rounded-xl p-2.5 mb-3 max-h-[100px] overflow-y-auto">
                                                    {h.cart.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between text-xs py-0.5">
                                                            <span className="text-gray-600">{item.name} × {item.qty}</span>
                                                            <span className="font-bold text-gray-800">Ksh {((item.price * item.qty) - item.discount).toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => recallHeldSale(h.id)}
                                                        className="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-1.5"
                                                    >
                                                        <span>▶️</span> Recall Sale
                                                    </button>
                                                    <button
                                                        onClick={() => deleteHeldSale(h.id)}
                                                        className="py-2.5 px-4 bg-red-50 text-red-500 rounded-xl font-bold text-sm hover:bg-red-100 transition-all"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200">
                            <button onClick={() => setShowHeldSalesModal(false)} className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Register Modal */}
            {showCloseRegister && closeRegisterData && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            🔴 Close Register — End of Day Report
                        </h3>

                        <div className="space-y-2 mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sales Breakdown</p>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">💵 Cash Sales</span>
                                <span className="font-bold text-gray-800 text-lg">Ksh {closeRegisterData.totalCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">📱 M-Pesa Sales</span>
                                <span className="font-bold text-green-600 text-lg">Ksh {closeRegisterData.totalMpesa.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                <span className="text-gray-600">📋 Credit Sales</span>
                                <span className="font-bold text-orange-600 text-lg">Ksh {closeRegisterData.totalCredit.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white mb-4">
                            <div className="flex justify-between items-center">
                                <span className="font-medium">Total Sales ({closeRegisterData.orderCount} orders)</span>
                                <span className="text-2xl font-bold">Ksh {closeRegisterData.totalSales.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</p>
                            <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-200">
                                <span className="text-red-600">💰 Total Expenses</span>
                                <span className="font-bold text-red-600 text-lg">-Ksh {closeRegisterData.totalExpenses.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cash Summary</p>
                            <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl">
                                <span className="text-gray-600">🟢 Opening Cash</span>
                                <span className="font-bold text-gray-800">Ksh {closeRegisterData.openingCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl">
                                <span className="text-gray-600">Expected in Drawer</span>
                                <span className="font-bold text-gray-800">Ksh {(closeRegisterData.openingCash + closeRegisterData.totalCash - closeRegisterData.totalExpenses).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 text-white mb-4">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-lg">NET SALES</span>
                                <span className="text-3xl font-bold">Ksh {closeRegisterData.netSales.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className={`rounded-xl p-4 mb-6 ${(closeRegisterData?.profit || 0) >= 0 ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : 'bg-gradient-to-r from-red-500 to-red-600'} text-white`}>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-lg">📈 PROFIT</span>
                                <span className="text-3xl font-bold">Ksh {(closeRegisterData?.profit || 0).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowCloseRegister(false); setCloseRegisterData(null); }}
                                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={printCloseRegisterReport}
                                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                            >
                                🖨️ Print Report
                            </button>
                            <button
                                onClick={finalizeCloseRegister}
                                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg transition-all"
                            >
                                ✅ Close & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            </div>
        </>
    );
}
