'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { resetCompanyInfoCache } from '@/lib/receiptPrinter';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface OrganisationSettings {
    company_name: string;
    trading_name: string;
    hotel_category: string;
    footer_note: string; // Slogan / Tagline
    business_reg_no: string;
    kra_pin: string;
    vat_number: string;
    phone: string;
    phone2: string;
    email: string;
    reservation_email: string;
    website: string;
    address: string;
    city: string;
    county: string;
    postal_code: string;
    country: string;
    receipt_header: string;
    receipt_footer: string;
    logo_url: string;
    currency_code: string;
    currency_symbol: string;
    vat_rate: number;
    hotel_checkin_time: string;
    hotel_checkout_time: string;
    hotel_night_audit_time: string;
    location_name: string;
    location_type: 'single' | 'multi';
}

const defaultSettings: OrganisationSettings = {
    company_name: 'Alpha Plus Hotel & Resort',
    trading_name: 'Alpha Plus Hotel',
    hotel_category: '5-Star Luxury Resort',
    footer_note: 'Experience Luxury & Warm Hospitality',
    business_reg_no: '',
    kra_pin: '',
    vat_number: '',
    phone: '',
    phone2: '',
    email: '',
    reservation_email: '',
    website: '',
    address: '',
    city: 'Nairobi',
    county: 'Nairobi County',
    postal_code: '',
    country: 'Kenya',
    receipt_header: 'WELCOME TO ALPHAPLUS HOTEL & RESORT',
    receipt_footer: 'Thank you for choosing AlphaPlus! Karibu tena.',
    logo_url: '',
    currency_code: 'KES',
    currency_symbol: 'Ksh',
    vat_rate: 16,
    hotel_checkin_time: '12:00',
    hotel_checkout_time: '10:00',
    hotel_night_audit_time: '02:00',
    location_name: 'Main Property',
    location_type: 'single',
};

const currencies = [
    { code: 'KES', symbol: 'Ksh', name: 'Kenyan Shilling' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
    { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
];

const hotelCategories = [
    '5-Star Luxury Resort',
    '4-Star Executive Hotel',
    'Boutique Hotel & Spa',
    'Safari Camp & Lodge',
    'City Business Hotel',
    'Beachfront Resort',
    'Executive Suites & Apartments',
    'Eco-Lodge & Cottages',
    'Standard Guest House',
];

export default function HotelRegistrationPage() {
    const [settings, setSettings] = useState<OrganisationSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'identity' | 'location' | 'contact' | 'receipt' | 'schedule' | 'preview'>('identity');

    // Load from localStorage and Supabase organisation_settings
    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Initial hydrate from localStorage if available
            if (typeof window !== 'undefined') {
                const cached = localStorage.getItem('company_settings');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        setSettings(prev => ({
                            ...prev,
                            company_name: parsed.company_name || parsed.name || prev.company_name,
                            address: parsed.address || prev.address,
                            city: parsed.city || prev.city,
                            phone: parsed.phone || prev.phone,
                            email: parsed.email || prev.email,
                            kra_pin: parsed.kra_pin || parsed.pin || prev.kra_pin,
                            footer_note: parsed.slogan || prev.footer_note,
                        }));
                    } catch (_) {}
                }
            }

            // 2. Fetch authoritative data from Supabase
            const { data, error } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value');

            if (error) {
                console.warn('Could not load organisation_settings from Supabase:', error);
            } else if (data && data.length > 0) {
                const loaded = { ...defaultSettings };
                data.forEach((item: { setting_key: string; setting_value: string }) => {
                    const key = item.setting_key as keyof OrganisationSettings;
                    if (key in loaded) {
                        if (typeof loaded[key] === 'number') {
                            (loaded as any)[key] = parseFloat(item.setting_value) || 0;
                        } else if (typeof loaded[key] === 'boolean') {
                            (loaded as any)[key] = item.setting_value === 'true';
                        } else {
                            (loaded as any)[key] = item.setting_value || '';
                        }
                    }
                });
                setSettings(loaded);
            }
        } catch (err) {
            console.error('Error loading hotel profile settings:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    // Save All Hotel Profile Settings
    const handleSaveSettings = async () => {
        if (!settings.company_name.trim()) {
            toast.error('Hotel Name is required!');
            return;
        }

        setIsSaving(true);
        try {
            // Save to organisation_settings in Supabase
            const entries = Object.entries(settings);
            for (const [key, val] of entries) {
                await supabase
                    .from('organisation_settings')
                    .upsert(
                        {
                            setting_key: key,
                            setting_value: String(val ?? ''),
                            updated_at: new Date().toISOString()
                        },
                        { onConflict: 'setting_key' }
                    );
            }

            // Sync with localStorage caches
            if (typeof window !== 'undefined') {
                localStorage.setItem('company_name', settings.company_name);
                localStorage.setItem('company_settings', JSON.stringify({
                    company_name: settings.company_name,
                    name: settings.company_name,
                    trading_name: settings.trading_name,
                    hotel_category: settings.hotel_category,
                    address: settings.address,
                    city: settings.city,
                    county: settings.county,
                    phone: settings.phone,
                    phone2: settings.phone2,
                    email: settings.email,
                    reservation_email: settings.reservation_email,
                    website: settings.website,
                    kra_pin: settings.kra_pin,
                    pin: settings.kra_pin,
                    vat_number: settings.vat_number,
                    slogan: settings.footer_note,
                    footer_note: settings.footer_note,
                    logo: settings.logo_url,
                    logo_url: settings.logo_url,
                    receipt_header: settings.receipt_header,
                    receipt_footer: settings.receipt_footer,
                    currency_code: settings.currency_code,
                    currency_symbol: settings.currency_symbol,
                    hotel_checkin_time: settings.hotel_checkin_time,
                    hotel_checkout_time: settings.hotel_checkout_time,
                    hotel_night_audit_time: settings.hotel_night_audit_time,
                }));

                localStorage.setItem('hotel_checkin_time', settings.hotel_checkin_time);
                localStorage.setItem('hotel_checkout_time', settings.hotel_checkout_time);
                localStorage.setItem('hotel_night_audit_time', settings.hotel_night_audit_time);

                // Notify all components in the app
                window.dispatchEvent(new Event('storage'));
            }

            // Invalidate receipt printer in-memory cache
            resetCompanyInfoCache();

            toast.success(`Hotel profile "${settings.company_name}" saved successfully! ✅`);
        } catch (err: any) {
            console.error('Error saving hotel registration:', err);
            toast.error(`Save failed: ${err.message || 'Please check connection'}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-3">
                    <div className="w-9 h-9 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Loading Hotel Profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-3 sm:p-6 md:p-8 space-y-6 text-slate-800">
            {/* 1. Header Banner */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            🏢 Property Registration
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                            ● Live System Brand
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs font-bold text-slate-500">
                            Current Brand: <strong className="text-slate-900">{settings.company_name || 'Alpha Plus Hotel'}</strong>
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 mt-1">
                        <span>🏢</span> Hotel Profile &amp; Business Registration
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Register your official hotel legal name, trading brand, KRA tax PIN, and receipt branding applied across POS, guest folios, KOTs, and reports.
                    </p>
                </div>

                {/* Top Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <Link
                        href="/dashboard/hotel/settings"
                        className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                        ← Hotel Operations
                    </Link>
                    <button
                        type="button"
                        onClick={handleSaveSettings}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-sm transition-all active:scale-95 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Saving Profile...</span>
                            </>
                        ) : (
                            <>
                                <span>💾</span>
                                <span>Save Hotel Profile</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* 2. Primary Hero Hotel Name Banner Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-start sm:items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center text-3xl shrink-0 shadow-sm">
                            🏨
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                Primary System Display Name
                            </span>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                                {settings.company_name || 'Register Your Hotel Name'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {settings.hotel_category} • {settings.city || 'City'}, {settings.country} • PIN: {settings.kra_pin || 'Pending'}
                            </p>
                        </div>
                    </div>

                    {/* Quick Metric Pills */}
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex-wrap">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500">Currency</p>
                            <p className="text-base font-black font-mono text-slate-900">{settings.currency_symbol} ({settings.currency_code})</p>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500">VAT Rate</p>
                            <p className="text-base font-black font-mono text-emerald-700">{settings.vat_rate}% Standard</p>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500">KRA Fiscal Status</p>
                            <p className={`text-xs font-black px-2 py-1 rounded-md mt-0.5 ${
                                settings.kra_pin ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                                {settings.kra_pin ? '✓ Registered PIN' : '⚠️ No PIN Set'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Big Hotel Name Field */}
                <div>
                    <label className="text-xs font-black uppercase text-slate-700 tracking-wider block mb-1.5">
                        Official Hotel / Resort Legal Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                        type="text"
                        value={settings.company_name}
                        onChange={e => setSettings({ ...settings, company_name: e.target.value })}
                        placeholder="e.g. AlphaPlus Hotel & Resort, Grand Royal Suites, Lake Naivasha Safari Lodge"
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-300 rounded-2xl text-base sm:text-lg font-black text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white transition-all shadow-inner"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                        <span>ℹ️</span>
                        <span>This name is automatically synchronized to all POS touchscreens, guest folios, invoice headers, KOT slips, and thermal audit Z-Reports.</span>
                    </p>
                </div>
            </div>

            {/* 3. Navigation Tabs */}
            <div className="bg-white rounded-2xl p-1.5 border border-slate-200/90 shadow-sm flex items-center gap-1.5 overflow-x-auto">
                {[
                    { id: 'identity', label: 'Core Identity', icon: '🏢' },
                    { id: 'location', label: 'Property Location', icon: '📍' },
                    { id: 'contact', label: 'Front Desk & Contacts', icon: '📞' },
                    { id: 'receipt', label: 'Receipt & Branding', icon: '🧾' },
                    { id: 'schedule', label: 'Check-In Schedules', icon: '⏱️' },
                    { id: 'preview', label: 'Live Thermal Preview', icon: '🖨️' },
                ].map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id as any)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === t.id
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            {/* 4. Tab Content Panels */}

            {/* TAB 1: CORE HOTEL IDENTITY */}
            {activeTab === 'identity' && (
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>🏢</span> Hotel Legal Identity &amp; Tax Registration
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Define your legal entity details, classification, and tax registration credentials.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Trading Name / Alias</label>
                            <input
                                type="text"
                                value={settings.trading_name}
                                onChange={e => setSettings({ ...settings, trading_name: e.target.value })}
                                placeholder="e.g. AlphaPlus Naivasha Main Wing"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Hotel Classification</label>
                            <select
                                value={settings.hotel_category}
                                onChange={e => setSettings({ ...settings, hotel_category: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-500 focus:bg-white"
                            >
                                {hotelCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Hotel Tagline / Slogan</label>
                            <input
                                type="text"
                                value={settings.footer_note}
                                onChange={e => setSettings({ ...settings, footer_note: e.target.value })}
                                placeholder="e.g. Luxury Living & Warm Hospitality"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">KRA PIN Number</label>
                            <input
                                type="text"
                                value={settings.kra_pin}
                                onChange={e => setSettings({ ...settings, kra_pin: e.target.value.toUpperCase() })}
                                placeholder="e.g. P051239842M"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-black text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">VAT / Tourism Levy Reg No</label>
                            <input
                                type="text"
                                value={settings.vat_number}
                                onChange={e => setSettings({ ...settings, vat_number: e.target.value.toUpperCase() })}
                                placeholder="e.g. VAT-019284-K"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Business Registration / License #</label>
                            <input
                                type="text"
                                value={settings.business_reg_no}
                                onChange={e => setSettings({ ...settings, business_reg_no: e.target.value })}
                                placeholder="e.g. CPR/2022/982134"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white transition-all"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: PROPERTY LOCATION */}
            {activeTab === 'location' && (
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>📍</span> Property Physical Location &amp; Address
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Physical street and postal address printed on guest statements, invoices, and supplier documents.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="sm:col-span-2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Physical Street / Road Address</label>
                            <input
                                type="text"
                                value={settings.address}
                                onChange={e => setSettings({ ...settings, address: e.target.value })}
                                placeholder="e.g. Moi South Lake Road, Near Hell's Gate National Park"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">City / Town</label>
                            <input
                                type="text"
                                value={settings.city}
                                onChange={e => setSettings({ ...settings, city: e.target.value })}
                                placeholder="e.g. Naivasha, Nairobi, Mombasa"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">County / Province</label>
                            <input
                                type="text"
                                value={settings.county}
                                onChange={e => setSettings({ ...settings, county: e.target.value })}
                                placeholder="e.g. Nakuru County, Nairobi County"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">P.O. Box &amp; Postal Code</label>
                            <input
                                type="text"
                                value={settings.postal_code}
                                onChange={e => setSettings({ ...settings, postal_code: e.target.value })}
                                placeholder="e.g. P.O. Box 450 - 20117"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Country</label>
                            <input
                                type="text"
                                value={settings.country}
                                onChange={e => setSettings({ ...settings, country: e.target.value })}
                                placeholder="Kenya"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: CONTACT & FRONT DESK */}
            {activeTab === 'contact' && (
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>📞</span> Hotel Reception &amp; Reservations Contacts
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Telephone and electronic contact points presented to hotel guests on booking vouchers and receipts.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Primary Reception Telephone</label>
                            <input
                                type="text"
                                value={settings.phone}
                                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                                placeholder="e.g. +254 712 345 678"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Reservations / Secondary Hotline</label>
                            <input
                                type="text"
                                value={settings.phone2}
                                onChange={e => setSettings({ ...settings, phone2: e.target.value })}
                                placeholder="e.g. +254 798 765 432"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">General Inquiries Email</label>
                            <input
                                type="email"
                                value={settings.email}
                                onChange={e => setSettings({ ...settings, email: e.target.value })}
                                placeholder="e.g. info@alphaplusresort.com"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Bookings &amp; Reservations Email</label>
                            <input
                                type="email"
                                value={settings.reservation_email}
                                onChange={e => setSettings({ ...settings, reservation_email: e.target.value })}
                                placeholder="e.g. reservations@alphaplusresort.com"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Official Hotel Website URL</label>
                            <input
                                type="text"
                                value={settings.website}
                                onChange={e => setSettings({ ...settings, website: e.target.value })}
                                placeholder="e.g. https://www.alphaplusresort.com"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: RECEIPT & BRANDING */}
            {activeTab === 'receipt' && (
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>🧾</span> Receipt Branding, Headers &amp; Currency
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Customize printed header text, thank-you messages, and fiscal currency rules.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Printed Receipt Custom Header</label>
                            <input
                                type="text"
                                value={settings.receipt_header}
                                onChange={e => setSettings({ ...settings, receipt_header: e.target.value })}
                                placeholder="WELCOME TO ALPHAPLUS HOTEL & RESORT"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Printed Receipt Footer Thank-You Note</label>
                            <input
                                type="text"
                                value={settings.receipt_footer}
                                onChange={e => setSettings({ ...settings, receipt_footer: e.target.value })}
                                placeholder="Thank you for staying with us! We look forward to welcoming you back."
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">System Operational Currency</label>
                            <select
                                value={settings.currency_code}
                                onChange={e => {
                                    const c = currencies.find(curr => curr.code === e.target.value);
                                    if (c) {
                                        setSettings({ ...settings, currency_code: c.code, currency_symbol: c.symbol });
                                    }
                                }}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-500"
                            >
                                {currencies.map(c => (
                                    <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Default Standard VAT Rate (%)</label>
                            <input
                                type="number"
                                value={settings.vat_rate}
                                onChange={e => setSettings({ ...settings, vat_rate: Number(e.target.value) || 0 })}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-black text-slate-900 focus:outline-none focus:border-slate-500"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="text-xs font-bold uppercase text-slate-500 block mb-1">Hotel Logo Image URL</label>
                            <input
                                type="text"
                                value={settings.logo_url}
                                onChange={e => setSettings({ ...settings, logo_url: e.target.value })}
                                placeholder="https://example.com/hotel-logo.png"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 5: CHECK-IN / CHECK-OUT SCHEDULES */}
            {activeTab === 'schedule' && (
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>⏱️</span> Hotel Operating Schedules &amp; Night Audit
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Standard guest check-in/out windows and automated night audit housekeeping triggers.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <span className="text-xs font-black uppercase text-slate-700 block">Standard Check-In Time</span>
                            <input
                                type="time"
                                value={settings.hotel_checkin_time}
                                onChange={e => setSettings({ ...settings, hotel_checkin_time: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-black text-slate-900"
                            />
                            <p className="text-[10px] text-slate-500">Official earliest room occupancy</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <span className="text-xs font-black uppercase text-slate-700 block">Standard Check-Out Time</span>
                            <input
                                type="time"
                                value={settings.hotel_checkout_time}
                                onChange={e => setSettings({ ...settings, hotel_checkout_time: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-black text-slate-900"
                            />
                            <p className="text-[10px] text-slate-500">Late checkout fees apply after this time</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <span className="text-xs font-black uppercase text-slate-700 block">Night Audit Schedule</span>
                            <input
                                type="time"
                                value={settings.hotel_night_audit_time}
                                onChange={e => setSettings({ ...settings, hotel_night_audit_time: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-black text-slate-900"
                            />
                            <p className="text-[10px] text-slate-500">Triggers room charge posting &amp; day rollover</p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 6: LIVE THERMAL PREVIEW */}
            {activeTab === 'preview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Simulated 80mm Guest Thermal Receipt */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex flex-col items-center">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                            🖨️ 80mm Thermal Receipt Live Preview
                        </span>

                        <div className="w-[300px] bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 font-mono text-[11px] text-slate-900 shadow-sm space-y-2">
                            <div className="text-center space-y-0.5">
                                <p className="font-black text-sm uppercase tracking-wide">{settings.company_name || 'HOTEL NAME'}</p>
                                <p className="text-[10px] text-slate-600">{settings.hotel_category}</p>
                                {settings.footer_note && <p className="text-[9px] italic text-slate-500">"{settings.footer_note}"</p>}
                                <p className="text-[10px] text-slate-600">{settings.address || 'Street Address'}, {settings.city}</p>
                                <p className="text-[10px] text-slate-600">Tel: {settings.phone || '+254 7XX XXX XXX'}</p>
                                {settings.kra_pin && <p className="text-[10px] font-bold">KRA PIN: {settings.kra_pin}</p>}
                            </div>

                            <div className="border-t border-dashed border-slate-400 my-2" />

                            <div className="flex justify-between text-[10px]">
                                <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
                                <span>Time: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span>Receipt: #INV-004892</span>
                                <span>Room / Table: 104</span>
                            </div>

                            <div className="border-t border-dashed border-slate-400 my-2" />

                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <span>Executive Suite (1 Night)</span>
                                    <span>Ksh 12,500</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Grilled Tilapia + Ugali</span>
                                    <span>Ksh 1,400</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Fresh Passion Juice (500ml)</span>
                                    <span>Ksh 450</span>
                                </div>
                            </div>

                            <div className="border-t border-dashed border-slate-400 my-2" />

                            <div className="flex justify-between font-black text-xs">
                                <span>TOTAL PAYABLE:</span>
                                <span>Ksh 14,350</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-600">
                                <span>PAID VIA M-PESA:</span>
                                <span>Ksh 14,350</span>
                            </div>

                            <div className="border-t border-dashed border-slate-400 my-2" />

                            <div className="text-center text-[9px] text-slate-600 pt-1">
                                <p>{settings.receipt_footer}</p>
                                <p className="mt-1 font-bold">Powered by AlphaPlus Enterprise POS</p>
                            </div>
                        </div>
                    </div>

                    {/* System Top Header Preview */}
                    <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                            💻 Navigation Header Live Brand Preview
                        </span>

                        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-3">
                            <p className="text-[11px] text-slate-500 font-bold uppercase">Sidebar Brand Display</p>
                            <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                                    🏨
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-[#3730a3] text-[13px] leading-tight uppercase tracking-wide">
                                        {settings.company_name || 'Alpha Plus Hotel'}
                                    </h4>
                                    <p className="text-[10px] text-gray-400 font-medium tracking-widest mt-0.5">
                                        MANAGEMENT SYSTEM • {settings.hotel_category}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-3">
                            <p className="text-[11px] text-slate-500 font-bold uppercase">POS Cashier Top Bar Pill</p>
                            <div className="p-3 bg-slate-900 rounded-xl flex items-center justify-between text-white text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="font-black text-sm">{settings.company_name || 'Alpha Plus Hotel'}</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-500/40">
                                    ☀️ Day Shift • Register Open
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Save Bar */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                    Changes take effect across the entire hotel system instantly upon saving.
                </div>
                <div className="flex items-center gap-2.5">
                    <Link
                        href="/dashboard/hotel/settings"
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                    >
                        Cancel
                    </Link>
                    <button
                        type="button"
                        onClick={handleSaveSettings}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-sm transition-all active:scale-95 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Saving Profile...</span>
                            </>
                        ) : (
                            <>
                                <span>💾</span>
                                <span>Save Hotel Profile</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
