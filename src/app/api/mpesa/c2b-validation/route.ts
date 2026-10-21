import { NextRequest, NextResponse } from 'next/server';

// Safaricom Daraja C2B Validation Webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('🔍 Safaricom Daraja C2B Validation received:', body);

    // Accept all valid payments (ResultCode 0)
    // If you ever want to reject an amount or invalid account number, return ResultCode 1
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  } catch (err: any) {
    console.error('C2B Validation error:', err);
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted by default',
    });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/mpesa/c2b-validation',
    system: 'AlphaPlus Enterprise M-Pesa C2B Validator',
    timestamp: new Date().toISOString(),
  });
}
