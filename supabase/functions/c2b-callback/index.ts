// Supabase Edge Function: M-Pesa C2B Callback for Hotel App
// Receives payment confirmations when customers pay to your Till
// Deploy with: supabase functions deploy c2b-callback --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
    try {
        // Get C2B callback data from Safaricom
        const callbackData = await req.json();

        console.log("📥 C2B Callback Received:", JSON.stringify(callbackData));

        // Safaricom C2B format
        const transactionId = callbackData.TransID;
        const amount = parseFloat(callbackData.TransAmount);
        const phone = callbackData.MSISDN;
        const accountRef = callbackData.BillRefNumber || "";
        const firstName = callbackData.FirstName || "";
        const middleName = callbackData.MiddleName || "";
        const lastName = callbackData.LastName || "";
        const businessShortcode = callbackData.BusinessShortCode || "";
        const orgBalance = parseFloat(callbackData.OrgAccountBalance) || 0;
        const transTime = callbackData.TransTime;

        if (!transactionId || !amount) {
            throw new Error("Missing required fields: TransID or TransAmount");
        }

        // Parse transaction time (format: YYYYMMDDHHmmss)
        let transactionTime = new Date();
        if (transTime && transTime.length >= 14) {
            const year = transTime.substring(0, 4);
            const month = transTime.substring(4, 6);
            const day = transTime.substring(6, 8);
            const hour = transTime.substring(8, 10);
            const min = transTime.substring(10, 12);
            const sec = transTime.substring(12, 14);
            transactionTime = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}+03:00`);
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Insert C2B transaction record
        const { data: transaction, error: insertError } = await supabase
            .from("c2b_transactions")
            .insert({
                trans_id: transactionId,
                trans_amount: amount,
                msisdn: phone,
                first_name: firstName,
                middle_name: middleName,
                last_name: lastName,
                bill_ref_number: accountRef,
                business_shortcode: businessShortcode,
                org_account_balance: orgBalance,
                trans_time: transactionTime.toISOString(),
                is_linked: false,
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === "23505") {
                console.log(`⚠️ Duplicate transaction ignored: ${transactionId}`);
            } else {
                console.error("❌ Failed to insert C2B transaction:", insertError);
                throw insertError;
            }
        } else {
            console.log(`✅ C2B Transaction saved: ${transactionId}, Amount: ${amount}, Phone: ${phone}`);
        }

        return new Response(
            JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
            { headers: { "Content-Type": "application/json" }, status: 200 }
        );
    } catch (error) {
        console.error("❌ C2B Callback error:", error);
        return new Response(
            JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
            { headers: { "Content-Type": "application/json" }, status: 200 }
        );
    }
});
