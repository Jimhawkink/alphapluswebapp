'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface OrganisationSettings {
    company_name: string;
    address: string;
    city: string;
    country: string;
    phone: string;
    phone2: string;
    email: string;
    website: string;
    kra_pin: string;
    currency_code: string;
    currency_symbol: string;
    location_type: 'single' | 'multi';
    location_name: string;
    footer_note: string;
    receipt_header: string;
    receipt_footer: string;
    logo_url: string;
    enable_shifts: boolean;
    enable_loyalty: boolean;
    vat_rate: number;
}

const defaultSettings: OrganisationSettings = {
    company_name: '',
    address: '',
    city: '',
    country: 'Kenya',
    phone: '',
    phone2: '',
    email: '',
    website: '',
    kra_pin: '',
    currency_code: 'KES',
    currency_symbol: 'KSh',
    location_type: 'single',
    location_name: '',
    footer_note: 'Thank you for your business!',
    receipt_header: '',
    receipt_footer: 'Thank you for visiting us!',
    logo_url: '',
    enable_shifts: true,
    enable_loyalty: false,
    vat_rate: 16,
};

const currencies = [
    { code: 'KES', symbol: 'KSh', name: 'Kenya Shilling' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'TZS', symbol: 'TSh', name: 'Tanzania Shilling' },
    { code: 'UGX', symbol: 'USh', name: 'Uganda Shilling' },
];

export default function CompanyPage() {
    const [settings, setSettings] = useState<OrganisationSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'location' | 'receipt' | 'system'>('general');

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('organisation_settings')
                .select('setting_key, setting_value');

            if (error) throw error;

            if (data) {
                const loadedSettings = { ...defaultSettings };
                data.forEach((item: { setting_key: string; setting_value: string }) => {
                    const key = item.setting_key as keyof OrganisationSettings;
                    if (key in loadedSettings) {
                        if (typeof loadedSettings[key] === 'boolean') {
                            (loadedSettings as Record<string, unknown>)[key] = item.setting_value === 'true';
                        } else if (typeof loadedSettings[key] === 'number') {
                            (loadedSettings as Record<string, unknown>)[key] = parseFloat(item.setting_value) || 0;
                        } else {
                            (loadedSettings as Record<string, unknown>)[key] = item.setting_value || '';
                        }
                    }
                });
                setSettings(loadedSettings);
            }
        } catch (err) {
            console.error('Error loading settings:', err);
            toast.error('Failed to load settings');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const saveSettings = async () => {
        if (!settings.company_name.trim()) {
            toast.error('Company name required!');
            return;
        }

        setIsSaving(true);
        try {
            // Save each setting individually
            const settingsToSave = Object.entries(settings);
            let savedCount = 0;

            for (const [key, value] of settingsToSave) {
                const { error } = await supabase
                    .from('organisation_settings')
                    .upsert(
                        {
                            setting_key: key,
                            setting_value: String(value),
                            updated_at: new Date().toISOString()
                        },
                        { onConflict: 'setting_key' }
                    );

                if (error) {
                    console.error(`Error saving ${key}:`, error);
                    throw new Error(`Failed to save ${key}`);
                }
                savedCount++;
            }

            console.log(`Saved ${savedCount} settings successfully`);
            toast.success('Settings saved! ✓');
        } catch (err: unknown) {
            console.error('Save error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Save failed';
            toast.error(errorMessage);
        }
        setIsSaving(false);
    };

    const handleCurrencyChange = (code: string) => {
        const currency = currencies.find(c => c.code === code);
        if (currency) {
            setSettings({
                ...settings,
                currency_code: currency.code,
                currency_symbol: currency.symbol,
            });
        }
    };

    const tabs = [
        { id: 'general', label: 'General Info', icon: '🏨', description: 'Company details' },
        { id: 'location', label: 'Location', icon: '📍', description: 'Address & branches' },
        { id: 'receipt', label: 'Receipts', icon: '🧾', description: 'Receipt settings' },
        { id: 'system', label: 'System', icon: '⚙️', description: 'System preferences' },
    ];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="text-gray-600 font-medium">Loading company settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
            {/* Header */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <span className="text-3xl">🏨</span>
                            Company Settings
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Configure your hotel/business details used across the entire system
                        </p>
                    </div>

                    <button
                        onClick={saveSettings}
                        disabled={isSaving}
                        className="flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-2xl shadow-lg shadow-blue-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-60"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Saving...
                            </>
                        ) : (
                            <>
                                <span className="text-xl">💾</span>
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Preview Card - Soft Blue Gradient */}
            {settings.company_name && (
                <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-6 mb-6 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-500 rounded-2xl flex items-center justify-center text-3xl text-white shadow-lg shadow-blue-200">
                            🏨
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">{settings.company_name}</h2>
                            <p className="text-gray-600 text-sm mt-1">
                                {settings.address && `${settings.address}, `}
                                {settings.city && `${settings.city}, `}
                                {settings.country}
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                                📞 {settings.phone || 'No phone'} • 📧 {settings.email || 'No email'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 mb-6">
                <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === tab.id
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-blue-50'
                                }`}
                        >
                            <span className="text-xl">{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* General Info Tab */}
                {activeTab === 'general' && (
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <span className="text-2xl">🏨</span>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">General Information</h3>
                                <p className="text-sm text-gray-500">Basic details about your hotel/business</p>
                            </div>
                        </div>

                        {/* Company Name - Most Important */}
                        <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-5 border-2 border-sky-200">
                            <label className="block text-sm font-bold text-sky-700 mb-2">
                                🏨 Company / Hotel Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={settings.company_name}
                                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                                placeholder="Enter your hotel/company name"
                                className="w-full px-5 py-4 bg-white border-2 border-sky-300 rounded-xl text-lg font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20"
                            />
                            <p className="text-xs text-sky-600 mt-2">
                                ⚠️ This name will appear on all receipts, reports, and throughout the system
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Email */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📧 Company Email
                                </label>
                                <input
                                    type="email"
                                    value={settings.email}
                                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                                    placeholder="info@yourhotel.com"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            {/* Website */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🌐 Website
                                </label>
                                <input
                                    type="url"
                                    value={settings.website}
                                    onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                                    placeholder="www.yourhotel.com"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            {/* Phone 1 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📞 Main Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={settings.phone}
                                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                                    placeholder="0720316175"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            {/* Phone 2 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📱 Secondary Phone
                                </label>
                                <input
                                    type="tel"
                                    value={settings.phone2}
                                    onChange={(e) => setSettings({ ...settings, phone2: e.target.value })}
                                    placeholder="Optional"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            {/* KRA PIN */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🏛️ KRA PIN / Tax ID
                                </label>
                                <input
                                    type="text"
                                    value={settings.kra_pin}
                                    onChange={(e) => setSettings({ ...settings, kra_pin: e.target.value.toUpperCase() })}
                                    placeholder="P051234567X"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 uppercase"
                                />
                            </div>

                            {/* Currency */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    💰 Currency
                                </label>
                                <select
                                    value={settings.currency_code}
                                    onChange={(e) => handleCurrencyChange(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 cursor-pointer"
                                >
                                    {currencies.map((currency) => (
                                        <option key={currency.code} value={currency.code}>
                                            {currency.symbol} - {currency.name} ({currency.code})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* VAT Rate */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📊 VAT Rate (%)
                                </label>
                                <input
                                    type="number"
                                    value={settings.vat_rate}
                                    onChange={(e) => setSettings({ ...settings, vat_rate: parseFloat(e.target.value) || 0 })}
                                    placeholder="16"
                                    min="0"
                                    max="100"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Location Tab */}
                {activeTab === 'location' && (
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <span className="text-2xl">📍</span>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Location Settings</h3>
                                <p className="text-sm text-gray-500">Physical address and branch configuration</p>
                            </div>
                        </div>

                        {/* Single/Multi Location */}
                        <div className="bg-gray-50 rounded-2xl p-5">
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                                🏢 Business Type
                            </label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setSettings({ ...settings, location_type: 'single' })}
                                    className={`flex-1 flex items-center justify-center gap-3 px-5 py-4 rounded-xl border-2 transition-all ${settings.location_type === 'single'
                                        ? 'bg-indigo-100 border-indigo-500 text-sky-700'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                        }`}
                                >
                                    <span className="text-2xl">🏠</span>
                                    <div className="text-left">
                                        <p className="font-semibold">Single Location</p>
                                        <p className="text-xs opacity-75">One branch only</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setSettings({ ...settings, location_type: 'multi' })}
                                    className={`flex-1 flex items-center justify-center gap-3 px-5 py-4 rounded-xl border-2 transition-all ${settings.location_type === 'multi'
                                        ? 'bg-indigo-100 border-indigo-500 text-sky-700'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                        }`}
                                >
                                    <span className="text-2xl">🏢</span>
                                    <div className="text-left">
                                        <p className="font-semibold">Multi Location</p>
                                        <p className="text-xs opacity-75">Multiple branches</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Location Name */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📍 {settings.location_type === 'multi' ? 'Main Branch Name' : 'Location Name'}
                                </label>
                                <input
                                    type="text"
                                    value={settings.location_name}
                                    onChange={(e) => setSettings({ ...settings, location_name: e.target.value })}
                                    placeholder="Main Branch / Downtown Location"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            {/* Address */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🏠 Physical Address
                                </label>
                                <textarea
                                    value={settings.address}
                                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                                    placeholder="Building name, Street, Area..."
                                    rows={2}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 resize-none"
                                />
                            </div>

                            {/* City */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🌆 City / Town
                                </label>
                                <input
                                    type="text"
                                    value={settings.city}
                                    onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                                    placeholder="Nairobi"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            {/* Country */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🌍 Country
                                </label>
                                <input
                                    type="text"
                                    value={settings.country}
                                    onChange={(e) => setSettings({ ...settings, country: e.target.value })}
                                    placeholder="Kenya"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Receipt Tab */}
                {activeTab === 'receipt' && (
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <span className="text-2xl">🧾</span>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Receipt Settings</h3>
                                <p className="text-sm text-gray-500">Customize how your receipts look</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-5">
                                {/* Receipt Header */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📝 Receipt Header Text
                                    </label>
                                    <textarea
                                        value={settings.receipt_header}
                                        onChange={(e) => setSettings({ ...settings, receipt_header: e.target.value })}
                                        placeholder="Welcome to our hotel! / Any text to show at the top"
                                        rows={2}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 resize-none"
                                    />
                                </div>

                                {/* Footer Note / Motto */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        ✨ Footer Note / Motto
                                    </label>
                                    <textarea
                                        value={settings.footer_note}
                                        onChange={(e) => setSettings({ ...settings, footer_note: e.target.value })}
                                        placeholder="Your satisfaction is our priority!"
                                        rows={2}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 resize-none"
                                    />
                                </div>

                                {/* Receipt Footer */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        👋 Receipt Footer Text
                                    </label>
                                    <textarea
                                        value={settings.receipt_footer}
                                        onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
                                        placeholder="Thank you for visiting us! Come again soon."
                                        rows={2}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 resize-none"
                                    />
                                </div>
                            </div>

                            {/* Receipt Preview */}
                            <div className="bg-gray-100 rounded-2xl p-5">
                                <p className="text-sm font-semibold text-gray-600 mb-4 flex items-center gap-2">
                                    👁️ Receipt Preview
                                </p>
                                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 font-mono text-xs">
                                    <div className="text-center border-b border-dashed border-gray-300 pb-3">
                                        <p className="font-bold text-base">{settings.company_name || 'Your Hotel Name'}</p>
                                        <p className="text-gray-500">{settings.address || 'Address'}</p>
                                        <p className="text-gray-500">Tel: {settings.phone || '0720316175'}</p>
                                        {settings.kra_pin && <p className="text-gray-500">PIN: {settings.kra_pin}</p>}
                                        {settings.receipt_header && (
                                            <p className="text-sky-600 mt-2">{settings.receipt_header}</p>
                                        )}
                                    </div>
                                    <div className="py-3 border-b border-dashed border-gray-300 space-y-1">
                                        <div className="flex justify-between">
                                            <span>1x Coffee</span>
                                            <span>150.00</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>2x Sandwich</span>
                                            <span>400.00</span>
                                        </div>
                                        <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-2">
                                            <span>TOTAL</span>
                                            <span>{settings.currency_symbol} 550.00</span>
                                        </div>
                                    </div>
                                    <div className="pt-3 text-center">
                                        <p className="text-gray-600">{settings.footer_note}</p>
                                        <p className="text-gray-500 mt-1">{settings.receipt_footer}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* System Tab */}
                {activeTab === 'system' && (
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                            <span className="text-2xl">⚙️</span>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">System Settings</h3>
                                <p className="text-sm text-gray-500">Configure system behavior and features</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Enable Shifts */}
                            <div className="bg-gray-50 rounded-2xl p-5">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <span className="text-3xl">⏰</span>
                                        <div>
                                            <p className="font-semibold text-gray-800">Enable Shift Management</p>
                                            <p className="text-xs text-gray-500">Track sales by shift (Day/Night)</p>
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => setSettings({ ...settings, enable_shifts: !settings.enable_shifts })}
                                        className={`w-14 h-8 rounded-full relative transition-all cursor-pointer ${settings.enable_shifts ? 'bg-emerald-500' : 'bg-gray-300'
                                            }`}
                                    >
                                        <div
                                            className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${settings.enable_shifts ? 'left-7' : 'left-1'
                                                }`}
                                        ></div>
                                    </div>
                                </label>
                            </div>

                            {/* Enable Loyalty */}
                            <div className="bg-gray-50 rounded-2xl p-5">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <span className="text-3xl">🎁</span>
                                        <div>
                                            <p className="font-semibold text-gray-800">Enable Loyalty Program</p>
                                            <p className="text-xs text-gray-500">Customer rewards & points</p>
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => setSettings({ ...settings, enable_loyalty: !settings.enable_loyalty })}
                                        className={`w-14 h-8 rounded-full relative transition-all cursor-pointer ${settings.enable_loyalty ? 'bg-emerald-500' : 'bg-gray-300'
                                            }`}
                                    >
                                        <div
                                            className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${settings.enable_loyalty ? 'left-7' : 'left-1'
                                                }`}
                                        ></div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* System Info */}
                        <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl p-6 text-white mt-6">
                            <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span>ℹ️</span> System Information
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-400">Version</p>
                                    <p className="font-semibold">v3.1</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">License</p>
                                    <p className="font-semibold text-emerald-400">Active ✓</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Last Update</p>
                                    <p className="font-semibold">Dec 2024</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Support</p>
                                    <p className="font-semibold">0720316175</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-700 text-center">
                                <p className="text-gray-400 text-xs">
                                    Powered by Alpha Solutions • Developed by Jimhawkins Korir
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
