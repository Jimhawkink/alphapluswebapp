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
        console.log("📱 Safaricom C2B Callback received:", JSON.stringify(body));

        const mpesaReceipt = body.TransID || body.trans_id || body.MpesaReceiptNumber || ("C2B-" + Date.now());
        const phone = body.MSISDN || body.msisdn || body.phone || "";
        const rawAmount = body.TransAmount || body.amount || 0;
        const amount = parseFloat(rawAmount) || 0;
        const accountRef = body.BillRefNumber || body.bill_ref_number || body.account_reference || "";
        const fullName = [body.FirstName, body.MiddleName, body.LastName]
            .filter(Boolean)
            .join(" ")
            .trim() || body.customer_name || "M-Pesa Customer";

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("Missing Supabase env vars");
            return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Insert into c2b_transactions
        const { error } = await supabase.from("c2b_transactions").insert({
            mpesa_receipt: mpesaReceipt,
            phone: phone,
            amount: amount,
            account_reference: accountRef,
            customer_name: fullName,
            is_linked: false,
            transaction_time: new Date().toISOString()
        });

        if (error) {
            console.error("Error inserting C2B transaction:", error);
        } else {
            console.log("✓ C2B transaction saved to new database:", mpesaReceipt, amount);
        }

        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("C2B Callback error:", err);
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
