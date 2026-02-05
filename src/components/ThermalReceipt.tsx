import React from 'react';

interface ReceiptProps {
    receiptData: {
        receiptNo: string;
        patientName: string;
        items: Array<{ service_name: string; qty: number; price: number }>;
        total: number;
        paymentMethod: string;
        date: string;
        verificationHash: string;
        tendered?: number;
        change?: number;
    };
    hospitalInfo: {
        name: string;
        address: string;
        phone: string;
        pin: string;
    };
}

export const ThermalReceipt = React.forwardRef<HTMLDivElement, ReceiptProps>(({ receiptData, hospitalInfo }, ref) => {
    // Helper for dashed lines to mimic the VB.NET "------------------"
    const DashedLine = () => (
        <div className="w-full border-t border-dashed border-black my-1"></div>
    );

    const padLeft = (text: string, length: number) => {
        return text.toString().padEnd(length).slice(0, length);
    }

    const padRight = (text: string, length: number) => {
        return text.toString().padStart(length).slice(-length);
    }

    // Format currency
    const fmt = (num: number) => num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div ref={ref} className="bg-white text-black p-2 w-[80mm] mx-auto font-mono text-[11px] leading-tight print:w-full print:m-0">
            
            {/* Header Section */}
            <div className="flex flex-col items-center mb-2">
                <DashedLine />
                <h1 className="font-bold text-sm uppercase text-center">{hospitalInfo.name}</h1>
                <p className="uppercase text-center">{hospitalInfo.address}</p>
                <p className="uppercase">TEL: {hospitalInfo.phone}</p>
                <p className="uppercase">PIN: {hospitalInfo.pin}</p>
                <DashedLine />
            </div>

            {/* Receipt Info */}
            <div className="flex flex-col gap-0.5 mb-2 uppercase">
                <div className="flex justify-between">
                    <span className="font-bold">{receiptData.paymentMethod.toUpperCase()} SALE</span>
                    <span>{receiptData.patientName}</span>
                </div>
                <div className="flex justify-between">
                    <span>{receiptData.receiptNo}</span>
                    <span>{receiptData.date}</span>
                </div>
                <div>Admin: Reception</div>
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
                        <div className="w-full truncate">{item.service_name}</div>
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

            {/* Totals */}
            <div className="flex flex-col gap-1 mb-2 font-bold">
                <div className="flex justify-between text-xs">
                    <span>TOTAL:</span>
                    <span>{receiptData.items.length} Items</span>
                    <span>{fmt(receiptData.total)}</span>
                </div>
                {/* 
                   Mimicking the VB logic:
                   If Method is Cash, show cash tendered/change logic if available.
                   If M-Pesa, just show Payment Received or specific MPesa box. 
                   For now, showing Payment Received as total since backend doesn't track tendered yet.
                */}
                <div className="flex justify-between text-xs">
                    <span>PAYMENT RECEIVED</span>
                    <span>{fmt(receiptData.total)}</span>
                </div>
                
                {/* M-PESA Code Box (Only if M-Pesa) */}
                {receiptData.paymentMethod.toUpperCase().includes('M-PESA') && (
                    <div className="border border-dashed border-black p-2 my-2 text-center">
                        <p className="font-bold">PAID VIA M-PESA</p>
                        <p className="font-bold text-sm my-1 tracking-widest">{receiptData.verificationHash}</p>
                        <p className="text-[10px]">Phone: 07** *** ***</p> {/* Placeholder as per Ref */}
                    </div>
                )}
            </div>

            <DashedLine />

            {/* Footer */}
            <div className="flex flex-col items-center text-center gap-1 mt-2">
                 {/* Re-using served by logic */}
                <div className="flex justify-between w-full text-[10px]">
                     <span>SERVED BY: Super Admin</span>
                </div>
                <div className="flex justify-between w-full text-[10px] mb-1">
                     <span>Fiscal Receipt</span>
                     <span>{new Date().toLocaleDateString('en-GB')}</span>
                </div>
                
                <p className="font-bold text-xs mt-2">*** THANK YOU! ***</p>
                <p className="text-[9px]">Medical services once rendered are not refundable</p>
                <p className="text-[9px] mt-1">Powered by Alpha Hospital POS</p>
                <p className="text-[9px]">www.hawkinsoft.co.ke</p>
            </div>
            
             <DashedLine />
        </div>
    );
});

ThermalReceipt.displayName = 'ThermalReceipt';
