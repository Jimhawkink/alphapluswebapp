import { NextRequest, NextResponse } from 'next/server';

// M-Pesa API endpoint - Hotel Supabase Edge Functions
const MPESA_API_URL = 'https://ywsstybsffcipaqtkjjl.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3c3N0eWJzZmZjaXBhcXRrampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzkzOTEsImV4cCI6MjEwNzA1NTM5MX0.dSjOnaB5W0jfZPXrTdc1H_OotXJLat2g6eqfX3udkwc';

// M-Pesa result code descriptions
const MPESA_RESULT_CODES: Record<number, string> = {
    0: 'Payment Successful',
    1: 'Insufficient Funds',
    17: 'Cancelled by User',
    1032: 'Cancelled by User',
    1001: 'Invalid Phone Number',
    1019: 'Transaction Timeout',
    1037: 'Transaction Timeout',
    2001: 'Wrong PIN',
    9999: 'System Error',
};

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const checkoutRequestId = searchParams.get('checkoutRequestId');

        if (!checkoutRequestId) {
            return NextResponse.json(
                { success: false, error: 'Missing checkoutRequestId' },
                { status: 400 }
            );
        }

        console.log('📊 Checking STK status for:', checkoutRequestId);

        // Call Supabase Edge Function check-status
        const response = await fetch(
            `${MPESA_API_URL}/check-status?checkoutRequestId=${checkoutRequestId}`,
            { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
        );
        const data = await response.json();

        console.log('📊 Status Response:', data);

        if (data.ResultCode === 0 && data.MpesaReceiptNumber) {
            return NextResponse.json({
                success: true,
                resultCode: 0,
                mpesaReceipt: data.MpesaReceiptNumber,
                amount: data.Amount,
                status: 'completed',
                resultDescription: MPESA_RESULT_CODES[0]
            });
        } else if (data.ResultCode !== undefined && data.ResultCode !== null) {
            const status = data.ResultCode === 1032 ? 'cancelled' : 'failed';
            return NextResponse.json({
                success: false,
                resultCode: data.ResultCode,
                status,
                resultDescription: MPESA_RESULT_CODES[data.ResultCode] || `Failed (Code: ${data.ResultCode})`
            });
        } else {
            return NextResponse.json({
                success: false,
                status: 'pending',
                message: 'Payment still pending - waiting for confirmation'
            });
        }
    } catch (error: any) {
        console.error('❌ Status Check Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
