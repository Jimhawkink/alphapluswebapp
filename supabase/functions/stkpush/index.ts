import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        const body = await req.json();
        const {
            phone, amount, accountReference, transactionDesc,
            shortCode, consumerKey, consumerSecret, passKey,
            callbackUrl, environment: envFromBody, accountType
        } = body;

        console.log("📱 STK Push request:", { phone, amount, accountReference });

        const CONSUMER_KEY    = consumerKey    || Deno.env.get("MPESA_CONSUMER_KEY");
        const CONSUMER_SECRET = consumerSecret || Deno.env.get("MPESA_CONSUMER_SECRET");
        const SHORTCODE       = shortCode      || Deno.env.get("MPESA_SHORTCODE");
        const PASSKEY         = passKey        || Deno.env.get("MPESA_PASSKEY");
        const CALLBACK_URL    = callbackUrl    || Deno.env.get("MPESA_CALLBACK_URL");
        const ENVIRONMENT     = envFromBody    || Deno.env.get("MPESA_ENVIRONMENT") || "production";
        const ACCOUNT_TYPE    = accountType    || Deno.env.get("MPESA_ACCOUNT_TYPE") || "Till";
        const TRANSACTION_TYPE = ACCOUNT_TYPE.toLowerCase() === "paybill"
            ? "CustomerPayBillOnline"
            : "CustomerBuyGoodsOnline";

        const BASE_URL = ENVIRONMENT === "production" ? MPESA_LIVE_URL : MPESA_SANDBOX_URL;

        // Step 1: Get access token
        const authString = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`);
        const tokenResponse = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
            method: "GET",
            headers: { Authorization: `Basic ${authString}` },
        });

        if (!tokenResponse.ok) {
            const errText = await tokenResponse.text();
            console.error("Token request failed:", errText);
            return new Response(
                JSON.stringify({ success: false, error: "Failed to get access token", detail: errText }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
            );
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        console.log("✅ Access token obtained");

        // Step 2: Timestamp & password
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0");

        const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`);
        const TILL_NUMBER = Deno.env.get("MPESA_TILL_NUMBER") || SHORTCODE;

        // Step 3: STK Push
        const stkPayload = {
            BusinessShortCode: SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: TRANSACTION_TYPE,
            Amount: Math.ceil(amount),
            PartyA: phone,
            PartyB: ACCOUNT_TYPE.toLowerCase() === "paybill" ? SHORTCODE : TILL_NUMBER,
            PhoneNumber: phone,
            CallBackURL: CALLBACK_URL || `https://ywsstybsffcipaqtkjjl.supabase.co/functions/v1/mpesa-callback`,
            AccountReference: accountReference || "Payment",
            TransactionDesc: transactionDesc || "Payment",
        };

        const stkResponse = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(stkPayload),
        });

        const stkData = await stkResponse.json();
        console.log("📲 STK Push Response:", stkData);

        if (stkData.ResponseCode === "0") {
            // Store in DB so callback can link back to the sale
            const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
            const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                await supabase.from("mpesa_transactions").upsert({
                    checkout_request_id: stkData.CheckoutRequestID,
                    account_reference: accountReference || "Payment",
                    amount: Math.ceil(amount),
                    phone_number: phone,
                    status: "pending",
                    result_code: null,
                    created_at: new Date().toISOString(),
                }, { onConflict: "checkout_request_id" });
            }
            return new Response(
                JSON.stringify({
                    success: true,
                    CheckoutRequestID: stkData.CheckoutRequestID,
                    MerchantRequestID: stkData.MerchantRequestID,
                    ResponseDescription: stkData.ResponseDescription,
                    message: "STK Push sent successfully",
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        } else {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: stkData.errorMessage || stkData.ResponseDescription || "STK Push failed",
                    detail: stkData,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            );
        }
    } catch (error) {
        console.error("❌ STK Push error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
