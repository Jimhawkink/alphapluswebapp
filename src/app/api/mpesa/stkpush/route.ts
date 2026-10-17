import { NextRequest, NextResponse } from 'next/server';

// M-Pesa API endpoint - Hotel Supabase Edge Functions
const MPESA_API_URL = 'https://ywsstybsffcipaqtkjjl.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3c3N0eWJzZmZjaXBhcXRrampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzkzOTEsImV4cCI6MjEwNzA1NTM5MX0.dSjOnaB5W0jfZPXrTdc1H_OotXJLat2g6eqfX3udkwc';

// Format phone number to 254 format
function formatMpesaPhone(phone: string): string {
    let cleaned = phone.replace(/\s/g, '').replace(/\+/g, '').replace(/-/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    return cleaned;
}

// Validate Kenyan phone number (supports 07xx, 01xx, 254xxx formats)
function isValidKenyanPhone(phone: string): boolean {
    const cleaned = phone.replace(/\s/g, '').replace(/\+/g, '').replace(/-/g, '');
    return /^(07\d{8}|01\d{8}|254\d{9})$/.test(cleaned);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, amount, reference, description } = body;

        console.log('📱 STK Push Request:', { phone, amount, reference });

        // Validate inputs
        if (!phone || !amount || !reference) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: phone, amount, reference' },
                { status: 400 }
            );
        }

        // Format and validate phone number
        const formattedPhone = formatMpesaPhone(phone);
        if (!isValidKenyanPhone(phone)) {
            return NextResponse.json(
                { success: false, error: 'Invalid Kenyan phone number. Use format: 07xxxxxxxx, 01xxxxxxxx, or 254xxxxxxxxx' },
                { status: 400 }
            );
        }

        // Call Supabase Edge Function STK Push
        const response = await fetch(`${MPESA_API_URL}/stkpush`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                phone: formattedPhone,
                amount: Math.ceil(parseFloat(amount)),
                accountReference: reference,
                transactionDesc: description || `Payment for ${reference}`,
            }),
        });

        const data = await response.json();
        console.log('📱 STK Push Response:', data);

        if (data.success && (data.CheckoutRequestID || data.checkout_request_id)) {
            return NextResponse.json({
                success: true,
                checkoutRequestId: data.CheckoutRequestID || data.checkout_request_id,
                merchantRequestId: data.MerchantRequestID || data.merchant_request_id,
                message: data.message || 'STK Push sent successfully'
            });
        } else {
            return NextResponse.json(
                { success: false, error: data.message || data.error || 'Failed to send STK Push' },
                { status: 400 }
            );
        }
    } catch (error: any) {
        console.error('❌ STK Push API Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
