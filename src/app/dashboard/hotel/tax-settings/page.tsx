'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface TaxSetting {
    tax_id: number;
    tax_name: string;
    tax_type: string;
    tax_rate: number;
    is_active: boolean;
    applies_to: string;
    description: string;
}

interface TaxConfig {
    config_id: number;
    config_key: string;
    config_value: string;
    description: string;
}

export default function HotelTaxSettingsPage() {
    const [taxSettings, setTaxSettings] = useState<TaxSetting[]>([]);
    const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
    const [hotelName, setHotelName] = useState('');
    const [hotelPin, setHotelPin] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editingTax, setEditingTax] = useState<number | null>(null);
    const [editRate, setEditRate] = useState('');

    // Load tax settings
    useEffect(() => {
        loadTaxSettings();
        loadTaxConfig();
    }, []);

    const loadTaxSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('hotel_tax_settings')
                .select('*')
                .order('display_order');

            if (error) throw error;
            setTaxSettings(data || []);
        } catch (err) {
            console.error('Error loading tax settings:', err);
            toast.error('Failed to load tax settings');
        }
    };

    const loadTaxConfig = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('hotel_tax_config')
                .select('*')
                .in('config_key', ['tax_mode', 'hotel_name', 'hotel_pin']);

            if (error) throw error;

            data?.forEach((config) => {
                if (config.config_key === 'tax_mode') {
                    setTaxMode(config.config_value as 'inclusive' | 'exclusive');
                } else if (config.config_key === 'hotel_name') {
                    setHotelName(config.config_value);
                } else if (config.config_key === 'hotel_pin') {
                    setHotelPin(config.config_value);
                }
            });
        } catch (err) {
            console.error('Error loading config:', err);
        }
        setIsLoading(false);
    };

    const updateTaxMode = async (mode: 'inclusive' | 'exclusive') => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('hotel_tax_config')
                .update({
                    config_value: mode,
                    updated_at: new Date().toISOString()
                })
                .eq('config_key', 'tax_mode');

            if (error) throw error;

            setTaxMode(mode);
            toast.success(`Tax mode updated to ${mode}`);
        } catch (err: any) {
            console.error('Error updating tax mode:', err);
            toast.error('Failed to update tax mode');
        }
        setIsSaving(false);
    };

    const updateHotelInfo = async () => {
        setIsSaving(true);
        try {
            await supabase
                .from('hotel_tax_config')
                .update({ config_value: hotelName, updated_at: new Date().toISOString() })
                .eq('config_key', 'hotel_name');

            await supabase
                .from('hotel_tax_config')
                .update({ config_value: hotelPin, updated_at: new Date().toISOString() })
                .eq('config_key', 'hotel_pin');

            toast.success('Hotel information updated');
        } catch (err) {
            console.error('Error updating hotel info:', err);
            toast.error('Failed to update hotel information');
        }
        setIsSaving(false);
    };

    const updateTaxRate = async (taxId: number, newRate: number) => {
        try {
            const { error } = await supabase
                .from('hotel_tax_settings')
                .update({
                    tax_rate: newRate,
                    updated_at: new Date().toISOString()
                })
                .eq('tax_id', taxId);

            if (error) throw error;

            await loadTaxSettings();
            setEditingTax(null);
            setEditRate('');
            toast.success('Tax rate updated successfully');
        } catch (err) {
            console.error('Error updating tax rate:', err);
            toast.error('Failed to update tax rate');
        }
    };

    const toggleTaxActive = async (taxId: number, currentActive: boolean) => {
        try {
            const { error } = await supabase
                .from('hotel_tax_settings')
                .update({
                    is_active: !currentActive,
                    updated_at: new Date().toISOString()
                })
                .eq('tax_id', taxId);

            if (error) throw error;

            await loadTaxSettings();
            toast.success(`Tax ${!currentActive ? 'enabled' : 'disabled'}`);
        } catch (err) {
            console.error('Error toggling tax:', err);
            toast.error('Failed to update tax status');
        }
    };

    const getTotalTaxRate = () => {
        return taxSettings
            .filter(t => t.is_active)
            .reduce((sum, t) => sum + t.tax_rate, 0);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading tax settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <span>🏨</span> Hotel Tax Settings
                </h1>
                <p className="text-gray-600 mt-1">Manage Kenya tax rates and calculation mode</p>
            </div>

            {/* Hotel Information Card */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>🏢</span> Hotel Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Hotel/Restaurant Name
                        </label>
                        <input
                            type="text"
                            value={hotelName}
                            onChange={(e) => setHotelName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., Grand Plaza Hotel"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            KRA PIN Number
                        </label>
                        <input
                            type="text"
                            value={hotelPin}
                            onChange={(e) => setHotelPin(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., P051234567X"
                        />
                    </div>
                </div>
                <button
                    onClick={updateHotelInfo}
                    disabled={isSaving}
                    className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Hotel Info'}
                </button>
            </div>

            {/* Tax Mode Selection */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-md p-6 mb-6 text-white">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span>⚙️</span> Tax Calculation Mode
                </h2>
                <p className="text-blue-100 mb-4">
                    Choose how taxes are applied to your prices
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => updateTaxMode('inclusive')}
                        disabled={isSaving}
                        className={`p-4 rounded-xl border-2 transition-all ${taxMode === 'inclusive'
                                ? 'bg-white text-blue-600 border-white shadow-lg scale-105'
                                : 'bg-blue-400/20 border-blue-300 hover:bg-blue-400/30'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${taxMode === 'inclusive' ? 'border-blue-600 bg-blue-600' : 'border-white'
                                }`}>
                                {taxMode === 'inclusive' && <span className="text-white text-sm">✓</span>}
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold">Tax Inclusive</h3>
                                <p className={`text-sm ${taxMode === 'inclusive' ? 'text-blue-500' : 'text-blue-100'}`}>
                                    Prices already include tax (KES 1,180 = KES 1,000 + KES 180 tax)
                                </p>
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={() => updateTaxMode('exclusive')}
                        disabled={isSaving}
                        className={`p-4 rounded-xl border-2 transition-all ${taxMode === 'exclusive'
                                ? 'bg-white text-blue-600 border-white shadow-lg scale-105'
                                : 'bg-blue-400/20 border-blue-300 hover:bg-blue-400/30'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${taxMode === 'exclusive' ? 'border-blue-600 bg-blue-600' : 'border-white'
                                }`}>
                                {taxMode === 'exclusive' && <span className="text-white text-sm">✓</span>}
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold">Tax Exclusive</h3>
                                <p className={`text-sm ${taxMode === 'exclusive' ? 'text-blue-500' : 'text-blue-100'}`}>
                                    Tax added on top (KES 1,000 + KES 180 tax = KES 1,180 total)
                                </p>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Tax Rates Table */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="p-6 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📊</span> Tax Rates Configuration
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Total Tax Rate: <span className="font-bold text-blue-600">{getTotalTaxRate()}%</span>
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Tax Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Rate
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Applies To
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {taxSettings.map((tax) => (
                                <tr key={tax.tax_id} className={!tax.is_active ? 'opacity-50' : ''}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-medium text-gray-900">{tax.tax_name}</div>
                                        <div className="text-sm text-gray-500">{tax.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tax.tax_type === 'VAT'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-green-100 text-green-700'
                                            }`}>
                                            {tax.tax_type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {editingTax === tax.tax_id ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={editRate}
                                                    onChange={(e) => setEditRate(e.target.value)}
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                                                    step="0.1"
                                                />
                                                <button
                                                    onClick={() => updateTaxRate(tax.tax_id, Number(editRate))}
                                                    className="text-green-600 hover:text-green-700"
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    onClick={() => { setEditingTax(null); setEditRate(''); }}
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-lg font-bold text-gray-900">{tax.tax_rate}%</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-gray-700">{tax.applies_to}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => toggleTaxActive(tax.tax_id, tax.is_active)}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold ${tax.is_active
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            {tax.is_active ? '✓ Active' : '✕ Disabled'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {editingTax !== tax.tax_id && (
                                            <button
                                                onClick={() => {
                                                    setEditingTax(tax.tax_id);
                                                    setEditRate(tax.tax_rate.toString());
                                                }}
                                                className="text-blue-600 hover:text-blue-700 font-medium"
                                            >
                                                Edit Rate
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tax Calculation Example */}
            <div className="bg-blue-50 rounded-xl p-6 mt-6 border border-blue-200">
                <h3 className="font-bold text-gray-800 mb-3">💡 Example Calculation</h3>
                <div className="text-sm text-gray-700 space-y-2">
                    {taxMode === 'inclusive' ? (
                        <>
                            <p><strong>Inclusive Mode:</strong> Price shown to customer already includes tax</p>
                            <p>• Item Price: <strong>KES 11,800</strong> (inclusive)</p>
                            <p>• Net Amount: KES 10,000 (11,800 ÷ 1.{getTotalTaxRate().toString().padStart(2, '0')})</p>
                            <p>• VAT (16%): KES 1,600</p>
                            <p>• Levy (2%): KES 200</p>
                            <p>• Customer Pays: <strong>KES 11,800</strong></p>
                        </>
                    ) : (
                        <>
                            <p><strong>Exclusive Mode:</strong> Tax added on top of price</p>
                            <p>• Item Price: <strong>KES 10,000</strong></p>
                            <p>• VAT (16%): KES 1,600</p>
                            <p>• Levy (2%): KES 200</p>
                            <p>• Customer Pays: <strong>KES 11,800</strong> (10,000 + 1,800)</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
