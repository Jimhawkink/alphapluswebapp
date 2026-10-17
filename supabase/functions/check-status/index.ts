import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MPESA_SANDBOX_URL = "https://sandbox.safaricom.co.ke";
const MPESA_LIVE_URL = "https://api.safaricom.co.ke";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const checkoutRequestId = url.searchParams.get("checkout_request_id") || url.searchParams.get("checkoutRequestId");

        if (!checkoutRequestId) {
            return new Response(
                JSON.stringify({ success: false, error: "checkoutRequestId is required" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            );
        }

        console.log("📊 Checking status for:", checkoutRequestId);

        // First check database for callback result
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { data: transaction } = await supabase
                .from("mpesa_transactions")
                .select("*")
                .eq("checkout_request_id", checkoutRequestId)
                .single();

            if (transaction && transaction.result_code !== null) {
                console.log("✅ Found result in database:", transaction);
                const receiptNumber = transaction.mpesa_receipt_number || transaction.mpesa_receipt;
                return new Response(
                    JSON.stringify({
                        success: transaction.result_code === 0,
                        ResultCode: transaction.result_code,
                        resultCode: transaction.result_code,
                        MpesaReceiptNumber: receiptNumber,
                        mpesaReceiptNumber: receiptNumber,
                        mpesa_receipt_number: receiptNumber,
                        Amount: transaction.amount,
                        status: transaction.status,
                        resultDesc: transaction.result_desc || (transaction.result_code === 0 ? "Success" : "Failed"),
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // Query M-Pesa API directly if not in DB yet
        const CONSUMER_KEY    = Deno.env.get("MPESA_CONSUMER_KEY");
        const CONSUMER_SECRET = Deno.env.get("MPESA_CONSUMER_SECRET");
        const SHORTCODE       = Deno.env.get("MPESA_SHORTCODE");
        const PASSKEY         = Deno.env.get("MPESA_PASSKEY");
        const ENVIRONMENT     = Deno.env.get("MPESA_ENVIRONMENT") || "production";

        if (!CONSUMER_KEY || !CONSUMER_SECRET || !SHORTCODE || !PASSKEY) {
            return new Response(
                JSON.stringify({ success: false, error: "M-Pesa credentials not configured", pending: true }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
        }

        const BASE_URL = ENVIRONMENT === "production" ? MPESA_LIVE_URL : MPESA_SANDBOX_URL;
        const authString = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`);
        const tokenResponse = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
            method: "GET",
            headers: { Authorization: `Basic ${authString}` },
        });

        if (!tokenResponse.ok) {
            return new Response(
                JSON.stringify({ success: false, error: "Failed to get access token", pending: true }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0");

        const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`);

        const queryResponse = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                BusinessShortCode: SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestId,
            }),
        });

        const queryData = await queryResponse.json();
        console.log("📊 Query Response:", queryData);

        if (queryData.ResultCode !== undefined) {
            const resultCode = parseInt(queryData.ResultCode);
            return new Response(
                JSON.stringify({
                    success: resultCode === 0,
                    ResultCode: resultCode,
                    resultCode: resultCode,
                    resultDesc: queryData.ResultDesc,
                    MpesaReceiptNumber: queryData.MpesaReceiptNumber,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Still pending
        return new Response(
            JSON.stringify({ success: false, pending: true, resultDesc: "Payment pending..." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("❌ Check-status error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message, pending: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
