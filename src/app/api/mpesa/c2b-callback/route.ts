import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Safaricom Daraja C2B Confirmation Webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Safaricom Daraja C2B Confirmation received:', body);

    const mpesaReceipt = body.TransID || body.trans_id || body.MpesaReceiptNumber || ('C2B-' + Date.now());
    const phone = body.MSISDN || body.msisdn || body.phone || '';
    const rawAmount = body.TransAmount || body.amount || 0;
    const amount = parseFloat(rawAmount) || 0;
    const accountRef = body.BillRefNumber || body.bill_ref_number || body.account_reference || '';
    const fullName = [body.FirstName, body.MiddleName, body.LastName]
      .filter(Boolean)
      .join(' ')
      .trim() || body.customer_name || 'M-Pesa Customer';

    // 1. Insert into c2b_transactions table
    const { data, error } = await supabase
      .from('c2b_transactions')
      .insert({
        mpesa_receipt: mpesaReceipt,
        phone: phone,
        amount: amount,
        account_reference: accountRef,
        customer_name: fullName,
        is_linked: false,
        transaction_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error recording C2B transaction to Supabase:', error);
    } else {
      console.log('C2B transaction saved to Supabase c2b_transactions ID:', data?.id);
    }

    // 2. Return standard Safaricom Daraja confirmation response
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Confirmation received successfully',
    });
  } catch (err: any) {
    console.error('C2B Confirmation handler error:', err);
    // Always return ResultCode 0 to Daraja so it does not keep retrying
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted with internal note',
    });
  }
}

// Allow GET for easy status/health check
export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/mpesa/c2b-callback',
    system: 'AlphaPlus Enterprise M-Pesa C2B Webhook',
    timestamp: new Date().toISOString(),
  });
}
