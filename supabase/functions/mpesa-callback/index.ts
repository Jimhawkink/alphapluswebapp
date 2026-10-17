import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        console.log("📲 M-Pesa Callback received:", JSON.stringify(body));

        const callback = body?.Body?.stkCallback;
        if (!callback) {
            return new Response(JSON.stringify({ success: false, error: "Invalid callback" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400
            });
        }

        const checkoutRequestId = callback.CheckoutRequestID;
        const resultCode = callback.ResultCode;
        const resultDesc = callback.ResultDesc;

        let mpesaReceiptNumber = null;
        let amount = null;
        let phoneNumber = null;

        // Extract metadata items (only present on success)
        if (resultCode === 0 && callback.CallbackMetadata?.Item) {
            for (const item of callback.CallbackMetadata.Item) {
                if (item.Name === "MpesaReceiptNumber") mpesaReceiptNumber = item.Value;
                if (item.Name === "Amount") amount = item.Value;
                if (item.Name === "PhoneNumber") phoneNumber = item.Value;
            }
        }

        console.log("✅ Parsed callback:", { checkoutRequestId, resultCode, mpesaReceiptNumber, amount });

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("❌ Missing Supabase env vars");
            return new Response(JSON.stringify({ success: false }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Store in mpesa_transactions table (upsert)
        await supabase.from("mpesa_transactions").upsert({
            checkout_request_id: checkoutRequestId,
            result_code: resultCode,
            result_desc: resultDesc,
            mpesa_receipt_number: mpesaReceiptNumber,
            amount: amount,
            phone_number: phoneNumber,
            status: resultCode === 0 ? "completed" : "failed",
            updated_at: new Date().toISOString(),
        }, { onConflict: "checkout_request_id" });

        // 2. If successful, update the sales record via account_reference
        if (resultCode === 0 && mpesaReceiptNumber) {
            // Find the pending checkout to get account reference
            const { data: txn } = await supabase
                .from("mpesa_transactions")
                .select("account_reference")
                .eq("checkout_request_id", checkoutRequestId)
                .single();

            const receiptNo = txn?.account_reference;
            if (receiptNo) {
                await supabase.from("sales").update({
                    status: "Paid",
                    payment_method: "M-Pesa",
                    amount_paid: amount,
                    mpesa_code: mpesaReceiptNumber,
                }).eq("receipt_no", receiptNo);
                console.log(`✅ Updated sale ${receiptNo} as Paid`);
            }
        }

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("❌ Callback error:", error);
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
