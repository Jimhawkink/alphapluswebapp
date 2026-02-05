import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateQRCode } from '@/lib/qrCodeGenerator';

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
            // Try hotel_sales first
            let { data, error } = await supabase
                .from('hotel_sales')
                .select('*')
                .eq('receipt_no', receiptNo)
                .single();

            if (error || !data) {
                // Fallback to regular sales table - search by receipt_no (not invoice_no)
                const { data: regularSale, error: regError } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('receipt_no', receiptNo)
                    .single();

                if (regError || !regularSale) {
                    return NextResponse.json({
                        valid: false,
                        message: 'Receipt not found'
                    }, { status: 200 });
                }

                // Transform regular sale to match hotel sale format
                sale = {
                    sale_id: regularSale.sale_id,
                    receipt_no: regularSale.receipt_no,
                    establishment_name: 'Alpha Plus Hotel',
                    sale_date: regularSale.sale_date,
                    sale_datetime: regularSale.sale_datetime || regularSale.sale_date,
                    customer_name: regularSale.customer_name || 'Walk-in Customer',
                    payment_method: regularSale.payment_method,
                    tax_mode: regularSale.tax_mode || 'inclusive',
                    subtotal: regularSale.subtotal,
                    discount: regularSale.discount || 0,
                    net_amount: regularSale.net_amount || regularSale.subtotal,
                    vat_rate: regularSale.vat_rate || 16,
                    vat_amount: regularSale.vat_amount || 0,
                    levy_rate: regularSale.levy_rate || 2,
                    levy_amount: regularSale.levy_amount || 0,
                    total_tax: regularSale.total_tax || 0,
                    total_amount: regularSale.total_amount,
                    mpesa_code: regularSale.mpesa_receipt || regularSale.mpesa_code,
                    status: regularSale.status,
                    items_count: 0 // Will be counted from items
                };
            } else {
                sale = data;
            }
        }

        // Fetch sale items from hotel_sales_items or sales_items
        let { data: items } = await supabase
            .from('hotel_sales_items')
            .select('*')
            .eq('sale_id', sale.sale_id);

        // If no hotel items found, try regular sales_items
        if (!items || items.length === 0) {
            const { data: regularItems } = await supabase
                .from('sales_items')
                .select('*')
                .eq('sale_id', sale.sale_id);
            items = regularItems;
        }

        // Update items count
        if (items) {
            sale.items_count = items.length;
        }

        // Calculate tax values if not stored (backward compatibility for older receipts)
        let subtotal = sale.subtotal || 0;
        let discount = sale.discount || 0;
        let netAmount = sale.net_amount || subtotal - discount;
        let totalAmount = sale.total_amount || 0;
        let vatRate = sale.vat_rate || 16;
        let levyRate = sale.levy_rate || 2;
        let vatAmount = sale.vat_amount || 0;
        let levyAmount = sale.levy_amount || 0;
        let totalTax = sale.total_tax || 0;
        let taxMode = sale.tax_mode || 'inclusive';

        // If tax values are 0 but we have total, calculate them (inclusive tax mode)
        if (totalTax === 0 && totalAmount > 0) {
            // Tax inclusive: Calculate from total
            const totalTaxRate = vatRate + levyRate; // 18% total
            const netFromTotal = totalAmount / (1 + totalTaxRate / 100);
            netAmount = Math.round(netFromTotal * 100) / 100;
            vatAmount = Math.round((netAmount * vatRate / 100) * 100) / 100;
            levyAmount = Math.round((netAmount * levyRate / 100) * 100) / 100;
            totalTax = Math.round((vatAmount + levyAmount) * 100) / 100;
            subtotal = totalAmount; // For inclusive, subtotal = total
        }

        return NextResponse.json({
            valid: true,
            message: 'Receipt verified successfully',
            receipt: {
                receiptNo: sale.receipt_no,
                hotelName: sale.establishment_name || 'Alpha Plus',
                date: sale.sale_date,
                time: new Date(sale.sale_datetime).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                customerName: sale.customer_name || 'Walk-in Customer',
                paymentMethod: sale.payment_method,
                taxMode: taxMode,
                subtotal: subtotal,
                discount: discount,
                netAmount: netAmount,
                vatRate: vatRate,
                vatAmount: vatAmount,
                levyRate: levyRate,
                levyAmount: levyAmount,
                totalTax: totalTax,
                totalAmount: totalAmount,
                mpesaCode: sale.mpesa_code,
                items: items || [],
                itemsCount: sale.items_count,
                status: sale.status
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
