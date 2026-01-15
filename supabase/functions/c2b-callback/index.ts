import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Get the C2B callback data from M-Pesa
        const body = await req.json()
        console.log('C2B Callback received:', JSON.stringify(body))

        // M-Pesa C2B callback format
        const {
            TransactionType,
            TransID,
            TransTime,
            TransAmount,
            BusinessShortCode,
            BillRefNumber,
            InvoiceNumber,
            OrgAccountBalance,
            ThirdPartyTransID,
            MSISDN,
            FirstName,
            MiddleName,
            LastName,
        } = body

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Parse transaction time (format: YYYYMMDDHHmmss)
        let transTime = null
        if (TransTime) {
            const year = TransTime.substring(0, 4)
            const month = TransTime.substring(4, 6)
            const day = TransTime.substring(6, 8)
            const hour = TransTime.substring(8, 10)
            const minute = TransTime.substring(10, 12)
            const second = TransTime.substring(12, 14)
            transTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`)
        }

        // Insert into c2b_transactions table
        const { data, error } = await supabase
            .from('c2b_transactions')
            .insert({
                trans_id: TransID,
                trans_amount: parseFloat(TransAmount) || 0,
                msisdn: MSISDN,
                first_name: FirstName || '',
                middle_name: MiddleName || '',
                last_name: LastName || '',
                bill_ref_number: BillRefNumber || '',
                business_shortcode: BusinessShortCode,
                org_account_balance: parseFloat(OrgAccountBalance) || 0,
                trans_time: transTime,
                is_linked: false,
            })
            .select()
            .single()

        if (error) {
            console.error('Error inserting C2B transaction:', error)
            // Return success to M-Pesa anyway to acknowledge receipt
            return new Response(
                JSON.stringify({
                    ResultCode: 0,
                    ResultDesc: 'Accepted but failed to save',
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200
                }
            )
        }

        console.log('C2B transaction saved:', data)

        // Return success response to M-Pesa
        return new Response(
            JSON.stringify({
                ResultCode: 0,
                ResultDesc: 'Accepted',
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        console.error('C2B callback error:', error)

        // Return success to M-Pesa to prevent retries
        return new Response(
            JSON.stringify({
                ResultCode: 0,
                ResultDesc: 'Accepted',
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )
    }
})
