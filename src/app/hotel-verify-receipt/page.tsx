'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ReceiptData {
    receiptNo: string;
    hotelName: string;
    date: string;
    time: string;
    customerName: string;
    paymentMethod: string;
    taxMode: string;
    subtotal: number;
    discount: number;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    levyRate: number;
    levyAmount: number;
    totalTax: number;
    totalAmount: number;
    mpesaCode?: string;
    items: Array<{
        product_name: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
    }>;
    itemsCount: number;
}

export default function VerifyHotelReceiptPage() {
    const [qrData, setQrData] = useState('');
    const [receiptNo, setReceiptNo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{
        valid: boolean;
        message: string;
        receipt?: ReceiptData;
    } | null>(null);

    const handleVerify = async () => {
        if (!qrData && !receiptNo) {
            setResult({
                valid: false,
                message: 'Please enter QR code data or receipt number'
            });
            return;
        }

        setIsLoading(true);
        setResult(null);

        try {
            const params = new URLSearchParams();
            if (qrData) params.append('qr', qrData);
            if (receiptNo) params.append('receipt', receiptNo);

            const response = await fetch(`/api/validate-receipt?${params.toString()}`);
            const data = await response.json();

            setResult(data);
        } catch (error) {
            setResult({
                valid: false,
                message: 'Failed to validate receipt. Please try again.'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const formatKES = (amount: number) => {
        return `KES ${amount.toLocaleString('en-KE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-12 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800 mb-3 flex items-center justify-center gap-3">
                        <span className="text-5xl">🏨</span>
                        Hotel Receipt Verification
                    </h1>
                    <p className="text-gray-600 text-lg">
                        Verify the authenticity of your hotel/restaurant receipt
                    </p>
                </div>

                {/* Input Card */}
                <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-6">Enter Receipt Information</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                📱 Scan QR Code or Enter QR Data
                            </label>
                            <textarea
                                value={qrData}
                                onChange={(e) => setQrData(e.target.value)}
                                placeholder="Paste QR code data here..."
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                rows={3}
                            />
                        </div>

                        <div className="text-center text-gray-500 font-semibold">OR</div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                🎫 Receipt Number
                            </label>
                            <input
                                type="text"
                                value={receiptNo}
                                onChange={(e) => setReceiptNo(e.target.value)}
                                placeholder="e.g., HTL-00123"
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <button
                            onClick={handleVerify}
                            disabled={isLoading || (!qrData && !receiptNo)}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <span>🔍</span>
                                    Verify Receipt
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Result Display */}
                {result && (
                    <div className={`rounded-2xl shadow-xl p-8 ${result.valid
                            ? 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300'
                            : 'bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300'
                        }`}>
                        {result.valid ? (
                            <>
                                {/* Valid Receipt */}
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white text-3xl">
                                        ✓
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-green-800">VALID RECEIPT</h2>
                                        <p className="text-green-700">This receipt is authentic and verified</p>
                                    </div>
                                </div>

                                {result.receipt && (
                                    <div className="bg-white rounded-xl p-6 space-y-4">
                                        {/* Hotel Name - Prominent */}
                                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-4 text-center">
                                            <div className="text-4xl mb-2">🏨</div>
                                            <h3 className="text-2xl font-bold">{result.receipt.hotelName}</h3>
                                        </div>

                                        {/* Receipt Details */}
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-600">Receipt No:</span>
                                                <p className="font-bold text-gray-900">{result.receipt.receiptNo}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Date & Time:</span>
                                                <p className="font-bold text-gray-900">{result.receipt.date} {result.receipt.time}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Customer:</span>
                                                <p className="font-bold text-gray-900">{result.receipt.customerName}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Payment Method:</span>
                                                <p className="font-bold text-gray-900">{result.receipt.paymentMethod}</p>
                                            </div>
                                        </div>

                                        {/* Items */}
                                        {result.receipt.items && result.receipt.items.length > 0 && (
                                            <div>
                                                <h4 className="font-bold text-gray-800 mb-2">Items ({result.receipt.itemsCount})</h4>
                                                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                                                    {result.receipt.items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between text-sm">
                                                            <span className="text-gray-700">
                                                                {item.product_name} x {item.quantity}
                                                            </span>
                                                            <span className="font-semibold text-gray-900">
                                                                {formatKES(item.subtotal)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Tax Breakdown */}
                                        <div>
                                            <h4 className="font-bold text-gray-800 mb-3">
                                                Tax Breakdown ({result.receipt.taxMode === 'inclusive' ? 'Inclusive' : 'Exclusive'})
                                            </h4>
                                            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-700">Subtotal:</span>
                                                    <span className="font-semibold">{formatKES(result.receipt.subtotal)}</span>
                                                </div>
                                                {result.receipt.discount > 0 && (
                                                    <div className="flex justify-between text-sm text-green-600">
                                                        <span>Discount:</span>
                                                        <span className="font-semibold">- {formatKES(result.receipt.discount)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-700">Net Amount:</span>
                                                    <span className="font-semibold">{formatKES(result.receipt.netAmount)}</span>
                                                </div>
                                                <div className="border-t border-blue-200 pt-2 mt-2 space-y-1">
                                                    <div className="flex justify-between text-sm">
                                                        <span>VAT ({result.receipt.vatRate}%):</span>
                                                        <span className="font-semibold">{formatKES(result.receipt.vatAmount)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span>Levy ({result.receipt.levyRate}%):</span>
                                                        <span className="font-semibold">{formatKES(result.receipt.levyAmount)}</span>
                                                    </div>
                                                    <div className="flex justify-between font-bold text-blue-700">
                                                        <span>Total Tax:</span>
                                                        <span>{formatKES(result.receipt.totalTax)}</span>
                                                    </div>
                                                </div>
                                                <div className="border-t-2 border-blue-300 pt-3 mt-3">
                                                    <div className="flex justify-between text-lg font-bold text-gray-900">
                                                        <span>TOTAL AMOUNT:</span>
                                                        <span>{formatKES(result.receipt.totalAmount)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {result.receipt.mpesaCode && (
                                            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">📱</span>
                                                    <div>
                                                        <p className="text-sm text-gray-600">M-Pesa Code:</p>
                                                        <p className="font-bold text-green-700">{result.receipt.mpesaCode}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Invalid Receipt */}
                                <div className="flex items-center gap-3">
                                    <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white text-3xl">
                                        ✕
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-red-800">INVALID RECEIPT</h2>
                                        <p className="text-red-700">{result.message}</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
