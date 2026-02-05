import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateQRCode } from '@/lib/qrCodeGenerator';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const qrData = searchParams.get('qr');
        const receiptNo = searchParams.get('receipt');

        if (!qrData && !receiptNo) {
            return NextResponse.json({
                valid: false,
                message: 'Please provide QR code data or receipt number'
            }, { status: 400 });
        }

        let sale;

        if (qrData) {
            // Validate QR code format first
            const decoded = validateQRCode(qrData);
            if (!decoded) {
                return NextResponse.json({
                    valid: false,
                    message: 'Invalid or tampered QR code'
                }, { status: 200 });
            }

            // Look up sale by QR code data
            const { data, error } = await supabase
                .from('hotel_sales')
                .select('*')
                .eq('qr_code_data', qrData)
                .eq('status', 'Completed')
                .single();

            if (error || !data) {
                return NextResponse.json({
                    valid: false,
                    message: 'Receipt not found in database'
                }, { status: 200 });
            }

            sale = data;
        } else if (receiptNo) {
            // Look up by receipt number
            const { data, error } = await supabase
                .from('hotel_sales')
                .select('*')
                .eq('receipt_no', receiptNo)
                .eq('status', 'Completed')
                .single();

            if (error || !data) {
                return NextResponse.json({
                    valid: false,
                    message: 'Receipt not found'
                }, { status: 200 });
            }

            sale = data;
        }

        // Fetch sale items
        const { data: items } = await supabase
            .from('hotel_sales_items')
            .select('*')
            .eq('sale_id', sale.sale_id);

        return NextResponse.json({
            valid: true,
            message: 'Receipt verified successfully',
            receipt: {
                receiptNo: sale.receipt_no,
                hotelName: sale.establishment_name,
                date: sale.sale_date,
                time: new Date(sale.sale_datetime).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                customerName: sale.customer_name,
                paymentMethod: sale.payment_method,
                taxMode: sale.tax_mode,
                subtotal: sale.subtotal,
                discount: sale.discount,
                netAmount: sale.net_amount,
                vatRate: sale.vat_rate,
                vatAmount: sale.vat_amount,
                levyRate: sale.levy_rate,
                levyAmount: sale.levy_amount,
                totalTax: sale.total_tax,
                totalAmount: sale.total_amount,
                mpesaCode: sale.mpesa_code,
                items: items || [],
                itemsCount: sale.items_count
            }
        });

    } catch (error: any) {
        console.error('Receipt validation error:', error);
        return NextResponse.json({
            valid: false,
            message: 'An error occurred while validating the receipt'
        }, { status: 500 });
    }
}
