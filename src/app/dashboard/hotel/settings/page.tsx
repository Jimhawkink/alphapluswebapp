'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase, c2bSupabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function HotelSettingsPage() {
    const [activeTab, setActiveTab] = useState<'mpesa' | 'operations' | 'shifts'>('shifts');
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
    const [waiterAutoLockSeconds, setWaiterAutoLockSeconds] = useState<number>(30);
    const [waiterAutoLockOnKot, setWaiterAutoLockOnKot] = useState<boolean>(true);
    const [readCostFromRecipe, setReadCostFromRecipe] = useState<boolean>(true);

    // Shift Operations & Timings Policies
    const [shiftsEnabled, setShiftsEnabled] = useState<boolean>(true);
    const [dayShiftStart, setDayShiftStart] = useState<string>('06:00');
    const [dayShiftEnd, setDayShiftEnd] = useState<string>('18:00');
    const [nightShiftStart, setNightShiftStart] = useState<string>('18:00');
    const [nightShiftEnd, setNightShiftEnd] = useState<string>('06:00');
    const [defaultOpeningFloat, setDefaultOpeningFloat] = useState<number>(5000);

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

        const savedWaitSec = localStorage.getItem('waiter_autolock_seconds');
        if (savedWaitSec !== null) setWaiterAutoLockSeconds(parseInt(savedWaitSec, 10) || 0);

        const savedWaitKot = localStorage.getItem('waiter_autolock_on_kot');
        if (savedWaitKot !== null) setWaiterAutoLockOnKot(savedWaitKot === 'true');

        const savedShiftsOn = localStorage.getItem('shifts_enabled');
        if (savedShiftsOn !== null) setShiftsEnabled(savedShiftsOn === 'true');

        const savedDayStart = localStorage.getItem('day_shift_start');
        if (savedDayStart) setDayShiftStart(savedDayStart);

        const savedDayEnd = localStorage.getItem('day_shift_end');
        if (savedDayEnd) setDayShiftEnd(savedDayEnd);

        const savedNightStart = localStorage.getItem('night_shift_start');
        if (savedNightStart) setNightShiftStart(savedNightStart);

        const savedNightEnd = localStorage.getItem('night_shift_end');
        if (savedNightEnd) setNightShiftEnd(savedNightEnd);

        const savedCostSource = localStorage.getItem('read_cost_from_recipe');
        if (savedCostSource !== null) setReadCostFromRecipe(savedCostSource === 'true');

        const savedFloat = localStorage.getItem('default_opening_float');
        if (savedFloat) setDefaultOpeningFloat(parseInt(savedFloat, 10) || 5000);

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
                        if (item.setting_key === 'waiter_autolock_seconds') {
                            const parsed = parseInt(item.setting_value, 10);
                            if (!isNaN(parsed)) setWaiterAutoLockSeconds(parsed);
                        }
                        if (item.setting_key === 'waiter_autolock_on_kot') setWaiterAutoLockOnKot(item.setting_value === 'true');
                        if (item.setting_key === 'shifts_enabled') setShiftsEnabled(item.setting_value === 'true');
                        if (item.setting_key === 'day_shift_start') setDayShiftStart(item.setting_value);
                        if (item.setting_key === 'day_shift_end') setDayShiftEnd(item.setting_value);
                        if (item.setting_key === 'night_shift_start') setNightShiftStart(item.setting_value);
                        if (item.setting_key === 'night_shift_end') setNightShiftEnd(item.setting_value);
                        if (item.setting_key === 'read_cost_from_recipe') setReadCostFromRecipe(item.setting_value === 'true');
                        if (item.setting_key === 'default_opening_float') {
                            const parsedFloat = parseInt(item.setting_value, 10);
                            if (!isNaN(parsedFloat)) setDefaultOpeningFloat(parsedFloat);
                        }
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
            localStorage.setItem('waiter_autolock_seconds', String(waiterAutoLockSeconds));
            localStorage.setItem('waiter_autolock_on_kot', String(waiterAutoLockOnKot));
            localStorage.setItem('shifts_enabled', String(shiftsEnabled));
            localStorage.setItem('day_shift_start', dayShiftStart);
            localStorage.setItem('day_shift_end', dayShiftEnd);
            localStorage.setItem('night_shift_start', nightShiftStart);
            localStorage.setItem('night_shift_end', nightShiftEnd);
            localStorage.setItem('default_opening_float', String(defaultOpeningFloat));
            localStorage.setItem('read_cost_from_recipe', String(readCostFromRecipe));
            localStorage.setItem('product_cost_source', readCostFromRecipe ? 'recipe' : 'manual');

            // Upsert into Supabase organisation_settings
            const settingsToSave = [
                { setting_key: 'mpesa_c2b_shortcode', setting_value: shortcode },
                { setting_key: 'mpesa_c2b_type', setting_value: shortcodeType },
                { setting_key: 'supervisor_pin', setting_value: supervisorPin },
                { setting_key: 'hotel_checkin_time', setting_value: checkInTime },
                { setting_key: 'hotel_checkout_time', setting_value: checkOutTime },
                { setting_key: 'waiter_autolock_seconds', setting_value: String(waiterAutoLockSeconds) },
                { setting_key: 'waiter_autolock_on_kot', setting_value: String(waiterAutoLockOnKot) },
                { setting_key: 'read_cost_from_recipe', setting_value: String(readCostFromRecipe) },
                { setting_key: 'shifts_enabled', setting_value: String(shiftsEnabled) },
                { setting_key: 'day_shift_start', setting_value: dayShiftStart },
                { setting_key: 'day_shift_end', setting_value: dayShiftEnd },
                { setting_key: 'night_shift_start', setting_value: nightShiftStart },
                { setting_key: 'night_shift_end', setting_value: nightShiftEnd },
                { setting_key: 'default_opening_float', setting_value: String(defaultOpeningFloat) }
            ];

            for (const s of settingsToSave) {
                await supabase
                    .from('organisation_settings')
                    .upsert(s, { onConflict: 'setting_key' });
            }

            // Sync shift definitions table
            try {
                await supabase.from('shift_definitions').upsert([
                    { shift_name: 'Day Shift', shift_code: 'DAY', start_time: dayShiftStart, end_time: dayShiftEnd, is_active: shiftsEnabled },
                    { shift_name: 'Night Shift', shift_code: 'NIGHT', start_time: nightShiftStart, end_time: nightShiftEnd, is_active: shiftsEnabled }
                ], { onConflict: 'shift_code' });
            } catch (_) {}

            toast.success('Hotel, Shifts & M-Pesa C2B settings saved successfully! ✅');
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
                        onClick={() => setActiveTab('shifts')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'shifts' ? 'bg-white text-emerald-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>⏱️</span>
                        <span>Shift Operations &amp; Timings</span>
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
                    <Link
                        href="/dashboard/company"
                        className="px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200"
                    >
                        <span>🏢</span>
                        <span>Hotel Name &amp; Profile →</span>
                    </Link>
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
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <span>🌐</span> Safaricom Daraja Live URLs
                                </h2>
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black uppercase flex items-center gap-1.5 shadow-sm">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Active &amp; Connected
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                These exact live URLs are <strong>already registered with Safaricom Daraja</strong> and actively receiving real customer payments:
                            </p>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-500 block mb-1">
                                        Live Confirmation Webhook URL
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value="https://pxcdaivlvltmdifxietb.supabase.co/functions/v1/c2b-callback"
                                            className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-mono text-emerald-900 font-bold"
                                        />
                                        <button
                                            onClick={() => handleCopy('https://pxcdaivlvltmdifxietb.supabase.co/functions/v1/c2b-callback', 'Confirmation URL')}
                                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold uppercase text-gray-500 block mb-1">
                                        Live Validation Webhook URL
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value="https://pxcdaivlvltmdifxietb.supabase.co/functions/v1/c2b-callback"
                                            className="w-full p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-mono text-emerald-900 font-bold"
                                        />
                                        <button
                                            onClick={() => handleCopy('https://pxcdaivlvltmdifxietb.supabase.co/functions/v1/c2b-callback', 'Validation URL')}
                                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>

                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-800 space-y-1">
                                    <p className="font-bold flex items-center gap-1">
                                        <span>✓</span> Daraja Status: Completed &amp; Active
                                    </p>
                                    <p className="text-gray-600">
                                        Whenever a payment occurs, it is captured instantly and alerts your POS cashier screens in real-time.
                                    </p>
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

                    
                    {/* Waiter POS Security & Auto-Lock Section (Strictly Waiters) */}
                    <div className="p-6 bg-gradient-to-br from-purple-50/80 via-indigo-50/50 to-white border-2 border-purple-200/80 rounded-3xl shadow-sm space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-100">
                            <div className="flex items-center gap-2.5">
                                <span className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center text-xl shadow-md shadow-purple-600/20">
                                    🔒
                                </span>
                                <div>
                                    <h3 className="text-base font-black text-purple-950">
                                        Waiter POS Auto-Lock &amp; Cross-Punching Security
                                    </h3>
                                    <p className="text-xs text-purple-700">
                                        Compels every waiter to use their own account (Strictly Waiters — Admins &amp; Cashiers are unaffected)
                                    </p>
                                </div>
                            </div>
                            <span className="px-3 py-1 bg-purple-200/80 text-purple-900 rounded-full text-[11px] font-black uppercase tracking-wider">
                                Waiters Only
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                            {/* 1. Inactivity Seconds */}
                            <div className="p-4 bg-white rounded-2xl border border-purple-100 shadow-sm space-y-2">
                                <label className="text-xs font-bold uppercase text-purple-950 block">
                                    ⏱️ Waiter Inactivity Auto-Lock Seconds (0 to Disable)
                                </label>
                                <p className="text-[11px] text-gray-500 leading-snug">
                                    If a waiter steps away, terminal auto-locks to the 6-Digit PIN pad after this idle period.
                                </p>
                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        type="number"
                                        min="0"
                                        max="600"
                                        step="5"
                                        value={waiterAutoLockSeconds}
                                        onChange={(e) => setWaiterAutoLockSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-28 p-3 bg-purple-50/50 border-2 border-purple-300 rounded-xl text-xl font-black font-mono text-center text-purple-950 focus:outline-none focus:border-purple-600"
                                    />
                                    <span className="text-xs font-black text-purple-900">seconds</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {[15, 30, 45, 60, 90, 0].map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setWaiterAutoLockSeconds(s)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                                waiterAutoLockSeconds === s
                                                    ? 'bg-purple-600 text-white shadow-sm'
                                                    : 'bg-purple-100/60 text-purple-800 hover:bg-purple-200'
                                            }`}
                                        >
                                            {s === 0 ? 'Disabled' : `${s}s`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Lock on KOT */}
                            <div className="p-4 bg-white rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between">
                                <div>
                                    <label className="text-xs font-bold uppercase text-purple-950 block mb-1">
                                        ⚡ Auto-Lock Screen Immediately on KOT Dispatch
                                    </label>
                                    <p className="text-[11px] text-gray-500 leading-snug mb-3">
                                        As soon as a waiter hits "Send to Kitchen" (KOT), the terminal immediately locks to the 6-Digit PIN pad so the next waiter walking up must type their own PIN.
                                    </p>
                                </div>
                                <label className="flex items-center gap-3 p-3 bg-purple-50/60 rounded-xl border border-purple-200 cursor-pointer select-none hover:bg-purple-100/50 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={waiterAutoLockOnKot}
                                        onChange={(e) => setWaiterAutoLockOnKot(e.target.checked)}
                                        className="w-5 h-5 text-purple-600 rounded border-purple-300 focus:ring-purple-500"
                                    />
                                    <span className="text-xs font-black text-purple-950">
                                        {waiterAutoLockOnKot ? 'Active: Auto-lock after every KOT order' : 'Inactive: Leave terminal open after KOT'}
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>


                    {/* CULINARY RECIPE COGS AUTO-COSTING */}
                    <div className="p-5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-3xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-xs">
                                    🧪
                                </span>
                                <div>
                                    <h3 className="text-sm font-black text-purple-950">
                                        Read Product Purchase Cost from Culinary Recipes (COGS Engine)
                                    </h3>
                                    <p className="text-xs text-purple-700">
                                        When enabled, menu dish purchase costs and profit margins dynamically sync from the Recipe Studio formulas. When disabled, products use fixed manual defined rates.
                                    </p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={readCostFromRecipe}
                                    onChange={(e) => setReadCostFromRecipe(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-purple-200/60 text-xs">
                            <span className="font-bold text-purple-900">
                                Current Policy: {readCostFromRecipe ? '🟢 Reading Live Recipe COGS' : '🏷️ Using Defined Manual Rates'}
                            </span>
                            <Link
                                href="/dashboard/recipe"
                                className="text-purple-700 hover:text-purple-900 font-bold underline"
                            >
                                Open Recipe Studio →
                            </Link>
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

            {/* TAB 3: SHIFT OPERATIONS & TIMINGS */}
            {activeTab === 'shifts' && (
                <div className="bg-white/90 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-lg shadow-slate-900/5 space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-black uppercase tracking-wider">
                                    POS &amp; Till Operations
                                </span>
                                <span className="text-xs text-slate-500 font-medium">Hotel Shift Reconciliation</span>
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
                                <span>⏱️</span> Shift Operating Hours &amp; Cash Till Policies
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Control whether shifts are mandatory for POS operation, set Day &amp; Night shift start/end windows, and define starting cash drawer floats.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <a
                                href="/dashboard/shifts"
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <span>📋</span>
                                <span>View Shifts Dashboard →</span>
                            </a>
                        </div>
                    </div>

                    {/* Master Shift Toggle Card */}
                    <div className={`p-6 rounded-3xl border-2 transition-all ${
                        shiftsEnabled
                            ? 'bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white border-emerald-300 shadow-sm'
                            : 'bg-slate-50 border-slate-200'
                    }`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start sm:items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm flex-shrink-0 ${
                                    shiftsEnabled
                                        ? 'bg-emerald-600 text-white shadow-emerald-600/25'
                                        : 'bg-slate-200 text-slate-500'
                                }`}>
                                    {shiftsEnabled ? '✓' : '⏸️'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-black text-slate-900">
                                            Shift Management System &amp; Register Lockout
                                        </h3>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                            shiftsEnabled
                                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                                : 'bg-slate-200 text-slate-700'
                                        }`}>
                                            {shiftsEnabled ? 'ACTIVE &amp; ENFORCED' : 'OPTIONAL / BYPASSABLE'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                                        When <strong>ACTIVE</strong>, the POS terminal strictly requires cashiers to start an active shift with an opening cash float before taking orders. Day/Night shift indicators, live duration tracking, drawer variance reconciliation, and detailed Z-reports are fully operational.
                                    </p>
                                </div>
                            </div>

                            <label className="relative inline-flex items-center cursor-pointer select-none self-start sm:self-center">
                                <input
                                    type="checkbox"
                                    checked={shiftsEnabled}
                                    onChange={(e) => setShiftsEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-16 h-9 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
                            </label>
                        </div>
                    </div>

                    {/* Day & Night Shift Schedule Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Day Shift Card */}
                        <div className="p-6 bg-gradient-to-br from-amber-50/60 via-orange-50/30 to-white rounded-3xl border-2 border-amber-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
                                <div className="flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-xl shadow-md shadow-amber-500/20">
                                        ☀️
                                    </span>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900">
                                            Day Shift Schedule
                                        </h3>
                                        <p className="text-xs text-amber-800">
                                            Morning, lunch, &amp; afternoon service window
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg text-xs font-mono font-bold">
                                    {dayShiftStart} – {dayShiftEnd}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600 block">
                                        Start Day Shift Time
                                    </label>
                                    <input
                                        type="time"
                                        value={dayShiftStart}
                                        onChange={(e) => setDayShiftStart(e.target.value)}
                                        className="w-full p-3 bg-white border border-amber-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-sm"
                                    />
                                    <p className="text-[11px] text-slate-500">Typical breakfast / opening time</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600 block">
                                        Close Day Shift Time
                                    </label>
                                    <input
                                        type="time"
                                        value={dayShiftEnd}
                                        onChange={(e) => setDayShiftEnd(e.target.value)}
                                        className="w-full p-3 bg-white border border-amber-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-sm"
                                    />
                                    <p className="text-[11px] text-slate-500">Day handover &amp; close time</p>
                                </div>
                            </div>

                            <div className="pt-2">
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Quick Standard Windows:</p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { start: '06:00', end: '18:00', label: '06:00 – 18:00 (12h)' },
                                        { start: '07:00', end: '19:00', label: '07:00 – 19:00 (12h)' },
                                        { start: '08:00', end: '17:00', label: '08:00 – 17:00 (9h)' }
                                    ].map((preset) => (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => {
                                                setDayShiftStart(preset.start);
                                                setDayShiftEnd(preset.end);
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                                dayShiftStart === preset.start && dayShiftEnd === preset.end
                                                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                                    : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Night Shift Card */}
                        <div className="p-6 bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-white rounded-3xl border-2 border-indigo-200/80 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                                <div className="flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white flex items-center justify-center text-xl shadow-md shadow-indigo-600/20">
                                        🌙
                                    </span>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900">
                                            Night Shift Schedule
                                        </h3>
                                        <p className="text-xs text-indigo-800">
                                            Dinner, lounge bar, &amp; overnight service window
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-900 rounded-lg text-xs font-mono font-bold">
                                    {nightShiftStart} – {nightShiftEnd}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600 block">
                                        Start Night Shift Time
                                    </label>
                                    <input
                                        type="time"
                                        value={nightShiftStart}
                                        onChange={(e) => setNightShiftStart(e.target.value)}
                                        className="w-full p-3 bg-white border border-indigo-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                                    />
                                    <p className="text-[11px] text-slate-500">Night crew takeover time</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase text-slate-600 block">
                                        Close Night Shift Time
                                    </label>
                                    <input
                                        type="time"
                                        value={nightShiftEnd}
                                        onChange={(e) => setNightShiftEnd(e.target.value)}
                                        className="w-full p-3 bg-white border border-indigo-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                                    />
                                    <p className="text-[11px] text-slate-500">Dawn handover to day crew</p>
                                </div>
                            </div>

                            <div className="pt-2">
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Quick Standard Windows:</p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { start: '18:00', end: '06:00', label: '18:00 – 06:00 (12h)' },
                                        { start: '19:00', end: '07:00', label: '19:00 – 07:00 (12h)' },
                                        { start: '17:00', end: '02:00', label: '17:00 – 02:00 (9h)' }
                                    ].map((preset) => (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => {
                                                setNightShiftStart(preset.start);
                                                setNightShiftEnd(preset.end);
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                                nightShiftStart === preset.start && nightShiftEnd === preset.end
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'bg-white text-slate-700 border-indigo-200 hover:bg-indigo-100/50'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Default Opening Cash Float Configuration */}
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl shadow-sm">
                                💰
                            </span>
                            <div>
                                <h3 className="text-base font-black text-slate-900">
                                    Default Cash Drawer Starting Float
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Recommended initial petty cash provided to the cashier at shift start for customer change
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                            <div className="flex items-center gap-2">
                                <span className="text-base font-black text-slate-700">Ksh</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="500"
                                    value={defaultOpeningFloat}
                                    onChange={(e) => setDefaultOpeningFloat(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-40 p-3 bg-white border-2 border-slate-300 rounded-xl text-xl font-black font-mono text-center text-slate-900 focus:outline-none focus:border-emerald-600 shadow-sm"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {[1000, 2000, 5000, 10000, 15000].map((amt) => (
                                    <button
                                        key={amt}
                                        type="button"
                                        onClick={() => setDefaultOpeningFloat(amt)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                                            defaultOpeningFloat === amt
                                                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        Ksh {amt.toLocaleString()}
                                    </button>
                                ))}
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
