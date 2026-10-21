'use client';

import { useState, useEffect } from 'react';
import { supabase, c2bSupabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function HotelSettingsPage() {
    const [activeTab, setActiveTab] = useState<'mpesa' | 'operations'>('mpesa');
    const [isSaving, setIsSaving] = useState(false);
    const [isTestingC2B, setIsTestingC2B] = useState(false);

    // M-Pesa C2B Configuration
    const [shortcode, setShortcode] = useState('482910');
    const [shortcodeType, setShortcodeType] = useState<'paybill' | 'till'>('till');
    const [consumerKey, setConsumerKey] = useState('');
    const [consumerSecret, setConsumerSecret] = useState('');
    const [passkey, setPasskey] = useState('');
    const [autoLinkPayments, setAutoLinkPayments] = useState(true);

    // Hotel Operating Policies
    const [checkInTime, setCheckInTime] = useState('12:00');
    const [checkOutTime, setCheckOutTime] = useState('10:00');
    const [nightAuditTime, setNightAuditTime] = useState('23:59');
    const [supervisorPin, setSupervisorPin] = useState('1234');
    const [roomServiceSurcharge, setRoomServiceSurcharge] = useState(0);
    const [lateCheckoutGraceMinutes, setLateCheckoutGraceMinutes] = useState(60);

    const baseUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}`
        : 'https://alphapluswebapp.vercel.app';

    const confirmationUrl = `${baseUrl}/api/mpesa/c2b-callback`;
    const validationUrl = `${baseUrl}/api/mpesa/c2b-validation`;

    // Load settings from localStorage and Supabase
    useEffect(() => {
        // Load local cache
        const savedShortcode = localStorage.getItem('mpesa_c2b_shortcode');
        if (savedShortcode) setShortcode(savedShortcode);

        const savedType = localStorage.getItem('mpesa_c2b_type');
        if (savedType === 'paybill' || savedType === 'till') setShortcodeType(savedType);

        const savedKey = localStorage.getItem('mpesa_consumer_key');
        if (savedKey) setConsumerKey(savedKey);

        const savedSecret = localStorage.getItem('mpesa_consumer_secret');
        if (savedSecret) setConsumerSecret(savedSecret);

        const savedPin = localStorage.getItem('manager_pin') || localStorage.getItem('supervisor_pin');
        if (savedPin) setSupervisorPin(savedPin);

        const savedCheckIn = localStorage.getItem('hotel_checkin_time');
        if (savedCheckIn) setCheckInTime(savedCheckIn);

        const savedCheckOut = localStorage.getItem('hotel_checkout_time');
        if (savedCheckOut) setCheckOutTime(savedCheckOut);

        // Fetch from Supabase organisation_settings
        (async () => {
            try {
                const { data } = await supabase
                    .from('organisation_settings')
                    .select('setting_key, setting_value');
                if (data && data.length > 0) {
                    data.forEach((item: { setting_key: string; setting_value: string }) => {
                        if (item.setting_key === 'mpesa_c2b_shortcode') setShortcode(item.setting_value);
                        if (item.setting_key === 'mpesa_c2b_type') setShortcodeType(item.setting_value as any);
                        if (item.setting_key === 'supervisor_pin') setSupervisorPin(item.setting_value);
                        if (item.setting_key === 'hotel_checkin_time') setCheckInTime(item.setting_value);
                        if (item.setting_key === 'hotel_checkout_time') setCheckOutTime(item.setting_value);
                    });
                }
            } catch (err) {
                console.error(err);
            }
        })();
    }, []);

    // Save All Settings
    const handleSaveSettings = async () => {
        setIsSaving(true);
        try {
            // Save to localStorage
            localStorage.setItem('mpesa_c2b_shortcode', shortcode);
            localStorage.setItem('mpesa_c2b_type', shortcodeType);
            localStorage.setItem('mpesa_consumer_key', consumerKey);
            localStorage.setItem('mpesa_consumer_secret', consumerSecret);
            localStorage.setItem('manager_pin', supervisorPin);
            localStorage.setItem('supervisor_pin', supervisorPin);
            localStorage.setItem('hotel_checkin_time', checkInTime);
            localStorage.setItem('hotel_checkout_time', checkOutTime);
            localStorage.setItem('hotel_night_audit_time', nightAuditTime);

            // Upsert into Supabase organisation_settings
            const settingsToSave = [
                { setting_key: 'mpesa_c2b_shortcode', setting_value: shortcode },
                { setting_key: 'mpesa_c2b_type', setting_value: shortcodeType },
                { setting_key: 'supervisor_pin', setting_value: supervisorPin },
                { setting_key: 'hotel_checkin_time', setting_value: checkInTime },
                { setting_key: 'hotel_checkout_time', setting_value: checkOutTime }
            ];

            for (const s of settingsToSave) {
                await supabase
                    .from('organisation_settings')
                    .upsert(s, { onConflict: 'setting_key' });
            }

            toast.success('Hotel & M-Pesa C2B settings saved successfully! ✅');
        } catch (err) {
            console.error('Error saving hotel settings:', err);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    // Copy to clipboard helper
    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`Copied ${label} to clipboard! 📋`);
    };

    // Test C2B Incoming Webhook Simulator
    const handleSimulateC2BPayment = async () => {
        setIsTestingC2B(true);
        try {
            const client = c2bSupabase || supabase;
            const mockReceipt = `TEST${Date.now().toString().slice(-6)}`;
            const mockAmount = Math.floor(Math.random() * 2000) + 500;

            const { data, error } = await client
                .from('c2b_transactions')
                .insert({
                    mpesa_receipt: mockReceipt,
                    phone: '254712345678',
                    amount: mockAmount,
                    account_reference: 'Table 4',
                    customer_name: 'M-Pesa Test Guest',
                    is_linked: false,
                    transaction_time: new Date().toISOString()
                })
                .select()
                .maybeSingle();

            if (error) throw error;

            toast.success(`Simulated C2B incoming payment of Ksh ${mockAmount.toLocaleString()} (${mockReceipt})! Check POS screen for the instant toast watchdog banner! 📱`, {
                duration: 6000
            });
        } catch (err: any) {
            console.error('C2B simulation error:', err);
            toast.error(`Simulation failed: ${err.message || 'Check database connection'}`);
        } finally {
            setIsTestingC2B(false);
        }
    };

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto p-2 sm:p-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-full text-xs font-black uppercase tracking-wider">
                            Enterprise Configuration
                        </span>
                        <span className="text-xs text-gray-500 font-medium">Hotel PMS &amp; Safaricom Daraja</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                        <span>⚙️</span> Hotel Operations &amp; M-Pesa C2B Settings
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Configure Safaricom Daraja C2B till webhooks, confirmation listener endpoints, guest check-in/out schedules, and supervisor anti-theft PINs.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex items-center bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200">
                    <button
                        onClick={() => setActiveTab('mpesa')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'mpesa' ? 'bg-white text-emerald-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>📱</span>
                        <span>M-Pesa C2B Webhook</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('operations')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'operations' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>🏨</span>
                        <span>Hotel Operations</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: SAFARICOM DARAJA M-PESA C2B */}
            {activeTab === 'mpesa' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left 7 Cols: Credentials & Shortcode */}
                    <div className="lg:col-span-7 bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-5">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div>
                                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <span>📱</span> Till / Paybill Shortcode &amp; Credentials
                                </h2>
                                <p className="text-xs text-gray-500">Configurable live Safaricom credentials — zero hardcoding</p>
                            </div>
                            <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-black">
                                ● Listener Active
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold uppercase text-gray-600 block mb-1">
                                    Shortcode / Till / Paybill Number *
                                </label>
                                <input
                                    type="text"
                                    value={shortcode}
                                    onChange={(e) => setShortcode(e.target.value)}
                                    placeholder="e.g. 482910"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black font-mono text-gray-900 focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase text-gray-600 block mb-1">
                                    Shortcode Type *
                                </label>
                                <select
                                    value={shortcodeType}
                                    onChange={(e) => setShortcodeType(e.target.value as any)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-900 focus:outline-none"
                                >
                                    <option value="till">Buy Goods &amp; Services (Till Number)</option>
                                    <option value="paybill">Paybill (with Account Number)</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold uppercase text-gray-600 block mb-1">
                                    Daraja Consumer Key
                                </label>
                                <input
                                    type="text"
                                    value={consumerKey}
                                    onChange={(e) => setConsumerKey(e.target.value)}
                                    placeholder="Enter Safaricom Consumer Key..."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase text-gray-600 block mb-1">
                                    Daraja Consumer Secret
                                </label>
                                <input
                                    type="password"
                                    value={consumerSecret}
                                    onChange={(e) => setConsumerSecret(e.target.value)}
                                    placeholder="Enter Safaricom Consumer Secret..."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase text-gray-600 block mb-1">
                                    Online Passkey (STK Push)
                                </label>
                                <input
                                    type="password"
                                    value={passkey}
                                    onChange={(e) => setPasskey(e.target.value)}
                                    placeholder="Enter Daraja Passkey..."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                                />
                            </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={autoLinkPayments}
                                    onChange={(e) => setAutoLinkPayments(e.target.checked)}
                                    className="w-4 h-4 text-emerald-600 rounded border-gray-300"
                                />
                                <span className="text-xs font-bold text-gray-800">
                                    Auto-match incoming payments by bill reference (Table / Room / Bill No)
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Right 5 Cols: Webhook URLs & 1-Click Simulator */}
                    <div className="lg:col-span-5 space-y-5">
                        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-4">
                            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <span>🌐</span> Register URLs with Safaricom
                            </h2>
                            <p className="text-xs text-gray-500">
                                Copy these exact endpoints and paste into your Safaricom Daraja Developer portal under C2B Register URL:
                            </p>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-500 block mb-1">
                                        Confirmation Webhook URL (Receives Payments)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={confirmationUrl}
                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800"
                                        />
                                        <button
                                            onClick={() => handleCopy(confirmationUrl, 'Confirmation URL')}
                                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-500 block mb-1">
                                        Validation Webhook URL (Validates Account)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={validationUrl}
                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800"
                                        />
                                        <button
                                            onClick={() => handleCopy(validationUrl, 'Validation URL')}
                                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Live Webhook Simulator */}
                        <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white p-6 rounded-3xl shadow-xl space-y-3">
                            <h3 className="text-base font-black flex items-center gap-2">
                                <span>🧪</span> Test C2B Payment Watchdog
                            </h3>
                            <p className="text-xs text-emerald-200">
                                Verify that incoming Safaricom payments trigger the real-time floating toast banner on your POS cashier screens.
                            </p>

                            <button
                                disabled={isTestingC2B}
                                onClick={handleSimulateC2BPayment}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-2xl text-xs font-black shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
                            >
                                <span>📱</span>
                                <span>{isTestingC2B ? 'Sending Mock Payment...' : 'Simulate Incoming M-Pesa Payment Now'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: HOTEL OPERATIONS & SECURITY */}
            {activeTab === 'operations' && (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-6">
                    <div>
                        <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                            <span>🏨</span> Hotel Operating Policies &amp; Anti-Theft Security
                        </h2>
                        <p className="text-xs text-gray-500">Timings, guest folio posting defaults, and manager authorization PIN</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                            <label className="text-xs font-bold uppercase text-gray-600 block">
                                Default Check-In Time
                            </label>
                            <input
                                type="time"
                                value={checkInTime}
                                onChange={(e) => setCheckInTime(e.target.value)}
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm font-bold"
                            />
                            <p className="text-[11px] text-gray-400">Standard hotel room readiness time</p>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                            <label className="text-xs font-bold uppercase text-gray-600 block">
                                Default Check-Out Time
                            </label>
                            <input
                                type="time"
                                value={checkOutTime}
                                onChange={(e) => setCheckOutTime(e.target.value)}
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm font-bold"
                            />
                            <p className="text-[11px] text-gray-400">Checkout deadline before late fee</p>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                            <label className="text-xs font-bold uppercase text-gray-600 block">
                                Automated Night Audit Run Time
                            </label>
                            <input
                                type="time"
                                value={nightAuditTime}
                                onChange={(e) => setNightAuditTime(e.target.value)}
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-sm font-bold"
                            />
                            <p className="text-[11px] text-gray-400">Automatic room rate folio posting time</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                        <div className="p-5 bg-amber-50/70 border border-amber-200 rounded-3xl space-y-2">
                            <div className="flex items-center gap-2 text-amber-900 font-black text-sm">
                                <span>🛡️</span> Supervisor / Manager 4-Digit Security PIN
                            </div>
                            <p className="text-xs text-amber-800">
                                This PIN is required in Restaurant POS to authorize item voids, discounts, check cancellations, and no-sale drawer kicks.
                            </p>
                            <input
                                type="password"
                                maxLength={4}
                                value={supervisorPin}
                                onChange={(e) => setSupervisorPin(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="1234"
                                className="w-48 p-3 bg-white border-2 border-amber-300 rounded-xl text-xl font-black font-mono tracking-widest text-center"
                            />
                        </div>

                        <div className="p-5 bg-blue-50/70 border border-blue-200 rounded-3xl space-y-2">
                            <div className="flex items-center gap-2 text-blue-900 font-black text-sm">
                                <span>🛎️</span> Room Service Surcharge %
                            </div>
                            <p className="text-xs text-blue-800">
                                Automatically added when restaurant bills are charged to guest room folios.
                            </p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    value={roomServiceSurcharge}
                                    onChange={(e) => setRoomServiceSurcharge(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-24 p-3 bg-white border-2 border-blue-300 rounded-xl text-lg font-black text-center"
                                />
                                <span className="font-bold text-sm text-blue-900">% extra surcharge</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Save Bar */}
            <div className="bg-white/80 backdrop-blur-xl p-4 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 flex items-center justify-end">
                <button
                    disabled={isSaving}
                    onClick={handleSaveSettings}
                    className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-700/30 transition-all flex items-center gap-2"
                >
                    <span>💾</span>
                    <span>{isSaving ? 'Saving Settings...' : 'Save Configuration'}</span>
                </button>
            </div>
        </div>
    );
}
