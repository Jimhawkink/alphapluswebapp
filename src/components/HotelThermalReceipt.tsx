import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface HotelReceiptProps {
    receiptData: {
        receiptNo: string;
        customerName: string;
        items: Array<{ name: string; qty: number; price: number }>;
        subtotal: number;
        discount: number;
        netAmount: number;
        vatRate: number;
        vatAmount: number;
        levyRate: number;
        levyAmount: number;
        totalTax: number;
        grandTotal: number;
        paymentMethod: string;
        date: string;
        time: string;
        taxMode: 'inclusive' | 'exclusive';
        qrCodeData?: string;
        mpesaCode?: string;
        customerPhone?: string;
    };
    hotelInfo: {
        name: string;
        address: string;
        phone: string;
        pin: string;
    };
}

export const HotelThermalReceipt = React.forwardRef<HTMLDivElement, HotelReceiptProps>(
    ({ receiptData, hotelInfo }, ref) => {
        const DashedLine = () => (
            <div className="w-full border-t border-dashed border-black my-1"></div>
        );

        const fmt = (num: number) =>
            num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return (
            <div
                ref={ref}
                className="bg-white text-black p-2 w-[80mm] mx-auto font-mono text-[11px] leading-tight print:w-full print:m-0"
            >
                {/* Header Section */}
                <div className="flex flex-col items-center mb-2">
                    <DashedLine />
                    <h1 className="font-bold text-sm uppercase text-center">{hotelInfo.name}</h1>
                    <p className="uppercase text-center">{hotelInfo.address}</p>
                    <p className="uppercase">TEL: {hotelInfo.phone}</p>
                    <p className="uppercase">PIN: {hotelInfo.pin}</p>
                    <DashedLine />
                </div>

                {/* Receipt Info */}
                <div className="flex flex-col gap-0.5 mb-2 uppercase">
                    <div className="flex justify-between">
                        <span className="font-bold">{receiptData.paymentMethod.toUpperCase()} SALE</span>
                        <span>{receiptData.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>{receiptData.receiptNo}</span>
                        <span>{receiptData.date}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>{receiptData.time}</span>
                        <span>Cashier: Admin</span>
                    </div>
                </div>

                <DashedLine />

                {/* Items Header */}
                <div className="flex uppercase font-bold text-[10px] mb-1">
                    <div className="w-[45%]">Item Name</div>
                    <div className="w-[15%] text-center">Qty</div>
                    <div className="w-[20%] text-right">Price</div>
                    <div className="w-[20%] text-right">Amt</div>
                </div>
                <DashedLine />

                {/* Items List */}
                <div className="flex flex-col gap-1 mb-2">
                    {receiptData.items.map((item, i) => (
                        <div key={i} className="flex flex-col uppercase">
                            <div className="w-full truncate">{item.name}</div>
                            <div className="flex text-[10px]">
                                <div className="w-[45%]"></div>
                                <div className="w-[15%] text-center">{item.qty}</div>
                                <div className="w-[20%] text-right">{fmt(item.price)}</div>
                                <div className="w-[20%] text-right font-bold">{fmt(item.price * item.qty)}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <DashedLine />

                {/* Subtotal and Discount */}
                <div className="flex flex-col gap-1 mb-2">
                    <div className="flex justify-between text-xs">
                        <span>SUBTOTAL{receiptData.taxMode === 'inclusive' ? ' (incl. tax)' : ''}:</span>
                        <span>{fmt(receiptData.subtotal)}</span>
                    </div>
                    {receiptData.discount > 0 && (
                        <div className="flex justify-between text-xs text-green-600">
                            <span>DISCOUNT:</span>
                            <span>- {fmt(receiptData.discount)}</span>
                        </div>
                    )}
                </div>

                {/* Tax Breakdown */}
                {receiptData.taxMode === 'inclusive' && (
                    <>
                        <DashedLine />
                        <div className="text-[9px] space-y-0.5 mb-2">
                            <div className="font-bold text-center uppercase mb-1">Tax Breakdown (Inclusive)</div>
                            <div className="flex justify-between">
                                <span>Net Amount:</span>
                                <span>{fmt(receiptData.netAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>VAT ({receiptData.vatRate}%):</span>
                                <span>{fmt(receiptData.vatAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Levy ({receiptData.levyRate}%):</span>
                                <span>{fmt(receiptData.levyAmount)}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                                <span>TOTAL TAX:</span>
                                <span>{fmt(receiptData.totalTax)}</span>
                            </div>
                        </div>
                    </>
                )}

                {receiptData.taxMode === 'exclusive' && (
                    <div className="flex flex-col gap-1 mb-2 text-xs">
                        <div className="flex justify-between">
                            <span>VAT ({receiptData.vatRate}%):</span>
                            <span>{fmt(receiptData.vatAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Levy ({receiptData.levyRate}%):</span>
                            <span>{fmt(receiptData.levyAmount)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span>TOTAL TAX:</span>
                            <span>{fmt(receiptData.totalTax)}</span>
                        </div>
                    </div>
                )}

                <DashedLine />

                {/* Grand Total */}
                <div className="flex justify-between text-sm font-bold mb-2">
                    <span>TOTAL:</span>
                    <span>{fmt(receiptData.grandTotal)}</span>
                </div>

                <div className="flex justify-between text-xs">
                    <span>PAYMENT RECEIVED:</span>
                    <span>{fmt(receiptData.grandTotal)}</span>
                </div>

                {/* M-PESA Code Box */}
                {receiptData.paymentMethod.toUpperCase().includes('MPESA') && receiptData.mpesaCode && (
                    <div className="border border-dashed border-black p-2 my-2 text-center">
                        <p className="font-bold">PAID VIA M-PESA</p>
                        <p className="font-bold text-sm my-1 tracking-widest">{receiptData.mpesaCode}</p>
                        {receiptData.customerPhone && (
                            <p className="text-[10px]">
                                Phone: {receiptData.customerPhone.replace(/(\d{3})(\d{3})(\d{3})/, function (_, a, b, c) {
                                    return a + '****' + c;
                                })}
                            </p>
                        )}
                    </div>
                )}

                <DashedLine />

                {/* QR Code */}
                {receiptData.qrCodeData && (
                    <>
                        <div className="flex flex-col items-center mt-3 mb-2">
                            <QRCodeSVG
                                value={receiptData.qrCodeData}
                                size={120}
                                level="M"
                                includeMargin={false}
                            />
                            <p className="text-[8px] text-gray-600 mt-2 text-center uppercase">
                                Scan to verify receipt
                            </p>
                            <p className="text-[8px] text-gray-500 text-center">
                                {hotelInfo.name}
                            </p>
                        </div>
                        <DashedLine />
                    </>
                )}

                {/* Footer */}
                <div className="flex flex-col items-center text-center gap-1 mt-2">
                    <div className="flex justify-between w-full text-[10px]">
                        <span>SERVED BY: Cashier</span>
                    </div>
                    <div className="flex justify-between w-full text-[10px] mb-1">
                        <span>Tax Invoice</span>
                        <span>{receiptData.date}</span>
                    </div>

                    <p className="font-bold text-xs mt-2">*** THANK YOU! ***</p>
                    <p className="text-[9px]">Goods once sold are not returnable</p>
                    <p className="text-[9px] mt-1">Powered by Alpha Hotel POS</p>
                    <p className="text-[9px]">www.hawkinsoft.co.ke</p>
                </div>

                <DashedLine />
            </div>
        );
    }
);

HotelThermalReceipt.displayName = 'HotelThermalReceipt';
