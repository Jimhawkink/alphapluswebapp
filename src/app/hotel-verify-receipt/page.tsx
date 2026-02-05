'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
    const searchParams = useSearchParams();
    const [qrData, setQrData] = useState('');
    const [receiptNo, setReceiptNo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{
        valid: boolean;
        message: string;
        receipt?: ReceiptData;
    } | null>(null);

    // Auto-verify from URL params when page loads via QR code scan
    useEffect(() => {
        const rParam = searchParams.get('r'); // receipt number
        const aParam = searchParams.get('a'); // amount
        const dParam = searchParams.get('d'); // date
        const dataParam = searchParams.get('data'); // old base64 format (backward compat)

        if (rParam) {
            // New simple format: ?r=RCP-53967&a=1500&d=05-02-26
            setReceiptNo(rParam);
            // Auto-verify
            setTimeout(() => {
                verifyReceipt(rParam);
            }, 100);
        } else if (dataParam) {
            // Old base64 format for backward compatibility
            try {
                const decoded = atob(dataParam);
                const parsed = JSON.parse(decoded);
                if (parsed.receipt) {
                    setReceiptNo(parsed.receipt);
                    setTimeout(() => {
                        verifyReceipt(parsed.receipt);
                    }, 100);
                }
            } catch (e) {
                console.error('Failed to decode QR data:', e);
            }
        }
    }, [searchParams]);

    const verifyReceipt = async (receiptNumber: string) => {
        setIsLoading(true);
        setResult(null);

        try {
            const params = new URLSearchParams();
            params.append('receipt', receiptNumber);

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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-4 sm:py-8 px-2 sm:px-4">
            <div className="w-full max-w-xl sm:max-w-2xl lg:max-w-4xl mx-auto">
                {/* Header - More compact on mobile */}
                <div className="text-center mb-4 sm:mb-6">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                        <span className="text-2xl sm:text-3xl">🏨</span>
                        Receipt Verification
                    </h1>
                    <p className="text-gray-600 text-sm sm:text-base">
                        Verify authenticity of your receipt
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
                                {/* Valid Receipt + PAID Badge */}
                                <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 sm:mb-6">
                                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-500 rounded-full flex items-center justify-center text-white text-2xl sm:text-3xl flex-shrink-0">
                                        ✓
                                    </div>
                                    <div className="text-center sm:text-left flex-1">
                                        <h2 className="text-xl sm:text-2xl font-bold text-green-800">VALID RECEIPT</h2>
                                        <p className="text-green-700 text-sm sm:text-base">This receipt is authentic and verified</p>
                                    </div>
                                    {/* PAID Badge - Prominent */}
                                    <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold text-lg sm:text-xl shadow-lg animate-pulse">
                                        ✓ PAID
                                    </div>
                                </div>

                                {result.receipt && (
                                    <div className="bg-white rounded-xl p-3 sm:p-6 space-y-3 sm:space-y-4">
                                        {/* Hotel Name - Prominent */}
                                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-3 sm:p-4 text-center">
                                            <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">🏨</div>
                                            <h3 className="text-lg sm:text-2xl font-bold">{result.receipt.hotelName}</h3>
                                        </div>

                                        {/* Receipt Details - 2x2 Grid */}
                                        <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                                            <div className="bg-gray-50 p-2 sm:p-3 rounded-lg">
                                                <span className="text-gray-500 text-xs">Receipt No:</span>
                                                <p className="font-bold text-gray-900 text-sm sm:text-base">{result.receipt.receiptNo}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 sm:p-3 rounded-lg">
                                                <span className="text-gray-500 text-xs">Date & Time:</span>
                                                <p className="font-bold text-gray-900 text-sm sm:text-base">{result.receipt.date} {result.receipt.time}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 sm:p-3 rounded-lg">
                                                <span className="text-gray-500 text-xs">Customer:</span>
                                                <p className="font-bold text-gray-900 text-sm sm:text-base">{result.receipt.customerName}</p>
                                            </div>
                                            <div className="bg-gray-50 p-2 sm:p-3 rounded-lg">
                                                <span className="text-gray-500 text-xs">Payment:</span>
                                                <p className="font-bold text-green-700 text-sm sm:text-base">{result.receipt.paymentMethod}</p>
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

                                        {/* Tax Breakdown - Prominent Box */}
                                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 sm:p-4 border-2 border-blue-200">
                                            <h4 className="font-bold text-blue-800 mb-2 sm:mb-3 text-sm sm:text-base flex items-center gap-2">
                                                📊 Tax Breakdown ({result.receipt.taxMode === 'inclusive' ? 'Incl.' : 'Excl.'})
                                            </h4>
                                            <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Subtotal:</span>
                                                    <span className="font-semibold">{formatKES(result.receipt.subtotal)}</span>
                                                </div>
                                                {result.receipt.discount > 0 && (
                                                    <div className="flex justify-between text-green-600">
                                                        <span>Discount:</span>
                                                        <span className="font-semibold">- {formatKES(result.receipt.discount)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Net Amount:</span>
                                                    <span className="font-semibold">{formatKES(result.receipt.netAmount)}</span>
                                                </div>
                                                <div className="border-t border-blue-300 pt-2 mt-2 space-y-1">
                                                    <div className="flex justify-between bg-white/60 px-2 py-1 rounded">
                                                        <span className="text-blue-700">VAT ({result.receipt.vatRate || 16}%):</span>
                                                        <span className="font-bold text-blue-800">{formatKES(result.receipt.vatAmount)}</span>
                                                    </div>
                                                    <div className="flex justify-between bg-white/60 px-2 py-1 rounded">
                                                        <span className="text-blue-700">Levy ({result.receipt.levyRate || 2}%):</span>
                                                        <span className="font-bold text-blue-800">{formatKES(result.receipt.levyAmount)}</span>
                                                    </div>
                                                    <div className="flex justify-between bg-blue-200/50 px-2 py-1 rounded font-bold">
                                                        <span className="text-blue-900">Total Tax:</span>
                                                        <span className="text-blue-900">{formatKES(result.receipt.totalTax)}</span>
                                                    </div>
                                                </div>
                                                <div className="border-t-2 border-green-400 pt-2 sm:pt-3 mt-2 sm:mt-3 bg-gradient-to-r from-green-100 to-emerald-100 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 sm:py-3 rounded-b-xl">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-base sm:text-lg font-bold text-gray-800">TOTAL PAID:</span>
                                                        <span className="text-lg sm:text-xl font-bold text-green-700">{formatKES(result.receipt.totalAmount)}</span>
                                                    </div>
                                                    <div className="text-center mt-1">
                                                        <span className="bg-green-600 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-bold">✓ FULLY PAID</span>
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
