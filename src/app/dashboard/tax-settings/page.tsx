'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface TaxSetting {
    tax_id: number;
    tax_code: string;
    tax_name: string;
    tax_rate: number;
    tax_type: string;
    is_inclusive: boolean;
    applies_to: string;
    is_default: boolean;
    active: boolean;
}

const taxTypes = ['VAT', 'Zero Rated', 'Exempt', 'Tourism Levy', 'Service Charge', 'Catering Levy', 'Excise Duty', 'Withholding Tax'];
const appliesTo = ['All', 'Food', 'Beverages', 'Services', 'Accommodation', 'Products'];

const defaultTax = {
    tax_name: '',
    tax_rate: 0,
    tax_type: 'VAT',
    is_inclusive: false,
    applies_to: 'All',
    is_default: false,
    active: true,
};

export default function TaxSettingsPage() {
    const [taxes, setTaxes] = useState<TaxSetting[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTax, setEditingTax] = useState<TaxSetting | null>(null);
    const [formData, setFormData] = useState(defaultTax);
    const [isSaving, setIsSaving] = useState(false);
    // ─── RECEIPT TAX DISPLAY SETTINGS ───
    const [showTaxOnReceipt, setShowTaxOnReceipt] = useState<boolean>(true);
    const [kraPin, setKraPin] = useState<string>('');
    const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
    const [isSavingTaxConfig, setIsSavingTaxConfig] = useState(false);


    
    const loadReceiptTaxConfig = useCallback(async () => {
        try {
            // 1. Check localStorage first
            const cachedShow = localStorage.getItem('show_tax_on_receipt');
            if (cachedShow !== null) {
                setShowTaxOnReceipt(cachedShow === 'true');
            }

            // 2. Query Supabase hotel_tax_config
            const { data } = await supabase
                .from('hotel_tax_config')
                .select('config_key, config_value')
                .in('config_key', ['show_tax_on_receipt', 'hotel_pin', 'tax_mode']);

            if (data && data.length > 0) {
                data.forEach(item => {
                    if (item.config_key === 'show_tax_on_receipt') {
                        const isShow = item.config_value === 'true';
                        setShowTaxOnReceipt(isShow);
                        localStorage.setItem('show_tax_on_receipt', isShow ? 'true' : 'false');
                    } else if (item.config_key === 'hotel_pin') {
                        setKraPin(item.config_value || '');
                    } else if (item.config_key === 'tax_mode') {
                        setTaxMode((item.config_value as any) || 'inclusive');
                    }
                });
            }
        } catch (err) {
            console.error('Error loading receipt tax config:', err);
        }
    }, []);

    const handleToggleShowTax = async (nextVal: boolean) => {
        setShowTaxOnReceipt(nextVal);
        localStorage.setItem('show_tax_on_receipt', nextVal ? 'true' : 'false');

        try {
            await supabase
                .from('hotel_tax_config')
                .upsert({
                    config_key: 'show_tax_on_receipt',
                    config_value: nextVal ? 'true' : 'false',
                    description: 'Toggle to show or hide tax breakdown on receipts'
                }, { onConflict: 'config_key' });

            toast.success(nextVal ? 'Tax breakdown enabled on receipts ✓' : 'Tax breakdown hidden on receipts (clean mode) ✓');
        } catch (err) {
            console.error('Error saving tax toggle:', err);
            toast.error('Failed to sync tax setting with cloud database');
        }
    };

    const handleSaveTaxConfig = async () => {
        setIsSavingTaxConfig(true);
        try {
            await supabase
                .from('hotel_tax_config')
                .upsert([
                    { config_key: 'hotel_pin', config_value: kraPin, description: 'Merchant KRA PIN' },
                    { config_key: 'tax_mode', config_value: taxMode, description: 'Inclusive vs Exclusive tax mode' },
                    { config_key: 'show_tax_on_receipt', config_value: showTaxOnReceipt ? 'true' : 'false', description: 'Show tax toggle' }
                ], { onConflict: 'config_key' });

            toast.success('Receipt tax configuration saved successfully! ✓');
        } catch (err) {
            console.error('Error saving tax config:', err);
            toast.error('Failed to save configuration');
        } finally {
            setIsSavingTaxConfig(false);
        }
    };

const loadTaxes = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('tax_settings')
                .select('*')
                .order('tax_id', { ascending: true });

            if (error) throw error;
            setTaxes(data || []);
        } catch (err) {
            console.error('Error loading taxes:', err);
            toast.error('Failed to load tax settings');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadTaxes();
        loadReceiptTaxConfig();
    }, [loadTaxes, loadReceiptTaxConfig]);

    const generateTaxCode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('tax_settings')
                .select('tax_code')
                .like('tax_code', 'TAX-%')
                .order('tax_code', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const lastCode = data[0].tax_code;
                const lastNum = parseInt(lastCode.replace('TAX-', '')) || 0;
                return `TAX-${String(lastNum + 1).padStart(2, '0')}`;
            }
            return 'TAX-01';
        } catch {
            return 'TAX-01';
        }
    };

    const openAddModal = () => {
        setEditingTax(null);
        setFormData(defaultTax);
        setShowModal(true);
    };

    const openEditModal = (tax: TaxSetting) => {
        setEditingTax(tax);
        setFormData({
            tax_name: tax.tax_name || '',
            tax_rate: tax.tax_rate || 0,
            tax_type: tax.tax_type || 'VAT',
            is_inclusive: tax.is_inclusive || false,
            applies_to: tax.applies_to || 'All',
            is_default: tax.is_default || false,
            active: tax.active !== false,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.tax_name.trim()) {
            toast.error('Tax name required!');
            return;
        }

        setIsSaving(true);
        try {
            // If setting as default, unset other defaults
            if (formData.is_default) {
                await supabase
                    .from('tax_settings')
                    .update({ is_default: false })
                    .neq('tax_id', editingTax?.tax_id || 0);
            }

            if (editingTax) {
                const { error } = await supabase
                    .from('tax_settings')
                    .update(formData)
                    .eq('tax_id', editingTax.tax_id);

                if (error) throw error;
                toast.success('Tax setting updated! ✓');
            } else {
                const newCode = await generateTaxCode();
                const { error } = await supabase
                    .from('tax_settings')
                    .insert({
                        ...formData,
                        tax_code: newCode,
                    });

                if (error) throw error;
                toast.success(`Tax ${newCode} created! ✓`);
            }

            setShowModal(false);
            loadTaxes();
        } catch (err) {
            console.error('Error saving tax:', err);
            toast.error('Failed to save tax setting');
        }
        setIsSaving(false);
    };

    const deleteTax = async (tax: TaxSetting) => {
        if (!confirm(`Delete "${tax.tax_name}"?`)) return;

        try {
            const { error } = await supabase
                .from('tax_settings')
                .delete()
                .eq('tax_id', tax.tax_id);

            if (error) throw error;
            toast.success('Tax setting deleted');
            loadTaxes();
        } catch (err) {
            console.error('Error deleting tax:', err);
            toast.error('Failed to delete');
        }
    };

    const getTaxTypeColor = (type: string) => {
        switch (type) {
            case 'VAT': return 'bg-blue-100 text-blue-700';
            case 'Zero Rated': return 'bg-green-100 text-green-700';
            case 'Exempt': return 'bg-gray-100 text-gray-700';
            case 'Tourism Levy': return 'bg-purple-100 text-purple-700';
            case 'Service Charge': return 'bg-orange-100 text-orange-700';
            case 'Catering Levy': return 'bg-pink-100 text-pink-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">📊</span>
                        Tax Settings
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Configure tax rates, types, and applicability • VAT, Tourism Levy, Service Charge
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-2xl shadow-lg shadow-purple-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                >
                    <span className="text-xl">➕</span>
                    Add Tax Type
                </button>
            </div>

            
            {/* ── RECEIPT TAX DISPLAY TOGGLE & CONFIGURATION CARD ── */}
            <div className="bg-white rounded-3xl border-2 border-purple-200/80 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
                            🧾
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-black tracking-tight">Customer Receipt Tax Settings</h2>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                                    showTaxOnReceipt
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                                }`}>
                                    {showTaxOnReceipt ? 'TAX BREAKDOWN ACTIVE' : 'CLEAN RECEIPT MODE (TAX HIDDEN)'}
                                </span>
                            </div>
                            <p className="text-xs text-purple-200/80 mt-0.5 font-medium">
                                Configure whether printed customer receipts and POS cart display detailed KRA tax calculations or clean simplified totals
                            </p>
                        </div>
                    </div>

                    {/* Master Switch Toggle */}
                    <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20">
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-100">
                            Show Tax Info:
                        </span>
                        <button
                            type="button"
                            onClick={() => handleToggleShowTax(!showTaxOnReceipt)}
                            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                showTaxOnReceipt ? 'bg-emerald-500' : 'bg-slate-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    showTaxOnReceipt ? 'translate-x-7' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50/50">
                    {/* Left: Mode Explanation */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                            <span>⚙️</span> Tax Visibility Behavior
                        </h3>

                        <div
                            onClick={() => handleToggleShowTax(true)}
                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                showTaxOnReceipt
                                    ? 'bg-emerald-50/70 border-emerald-500 shadow-md ring-2 ring-emerald-200'
                                    : 'bg-white border-gray-200 hover:border-gray-300 opacity-70'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-black text-sm text-emerald-950 flex items-center gap-1.5">
                                    <span>🟢</span> Show Full Tax Breakdown
                                </span>
                                {showTaxOnReceipt && (
                                    <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                                        ACTIVE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                Receipts display official <strong>★ TAX INVOICE ★</strong> header, merchant <strong>KRA PIN</strong>, per-item tax, Net Taxable Base, VAT 16%, and Catering/Tourism Levy 2%.
                            </p>
                        </div>

                        <div
                            onClick={() => handleToggleShowTax(false)}
                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                !showTaxOnReceipt
                                    ? 'bg-amber-50/70 border-amber-500 shadow-md ring-2 ring-amber-200'
                                    : 'bg-white border-gray-200 hover:border-gray-300 opacity-70'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-black text-sm text-amber-950 flex items-center gap-1.5">
                                    <span>⚪</span> Hide Tax (Clean Receipt)
                                </span>
                                {!showTaxOnReceipt && (
                                    <span className="text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded-full">
                                        ACTIVE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                Receipts display <strong>★ OFFICIAL CUSTOMER RECEIPT ★</strong>, showing only Item, Qty, Price, Subtotal, Discount, and Grand Total. Tax lines are completely omitted for a clean guest bill.
                            </p>
                        </div>
                    </div>

                    {/* Middle: Configuration Form */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                            <span>🏛️</span> Receipt Tax Credentials
                        </h3>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                                Merchant KRA PIN Number
                            </label>
                            <input
                                type="text"
                                value={kraPin}
                                onChange={e => setKraPin(e.target.value)}
                                placeholder="e.g. P051234567X"
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-mono text-sm uppercase text-gray-900 focus:bg-white focus:border-purple-600 focus:outline-none"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Printed on receipts when tax breakdown is enabled.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                                Pricing Tax Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTaxMode('inclusive')}
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                                        taxMode === 'inclusive'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    Inclusive (Kenya Std)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTaxMode('exclusive')}
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                                        taxMode === 'exclusive'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    Exclusive (Add on Top)
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">Default for hospitality in Kenya is Inclusive.</p>
                        </div>

                        <button
                            type="button"
                            onClick={handleSaveTaxConfig}
                            disabled={isSavingTaxConfig}
                            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span>💾</span>
                            <span>{isSavingTaxConfig ? 'Saving...' : 'Save Receipt Tax Credentials'}</span>
                        </button>
                    </div>

                    {/* Right: Live Visual Receipt Mockup */}
                    <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col justify-between font-mono text-xs">
                        <div>
                            <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-3">
                                <span className="font-bold text-[10px] text-purple-300 uppercase tracking-wider">
                                    LIVE RECEIPT SAMPLE PREVIEW
                                </span>
                                <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                                    80mm Thermal
                                </span>
                            </div>

                            <div className="bg-white text-black p-3 rounded-xl shadow-inner text-[10px] leading-tight space-y-1.5 font-sans">
                                <div className="text-center border-b border-dashed border-gray-400 pb-1.5">
                                    <p className="font-black text-xs uppercase">ALPHA PLUS RESTAURANT</p>
                                    <p className="text-[9px] text-gray-500">Main Street, Nairobi • TEL: +254 712 345 678</p>
                                    {showTaxOnReceipt && (
                                        <p className="text-[9px] font-bold text-blue-700 mt-0.5 font-mono">PIN: {kraPin || 'P051234567X'}</p>
                                    )}
                                </div>

                                <div className="text-center font-black text-[9px] uppercase tracking-wider bg-gray-100 py-1 rounded">
                                    {showTaxOnReceipt ? '★ OFFICIAL TAX INVOICE ★' : '★ OFFICIAL CUSTOMER RECEIPT ★'}
                                </div>

                                <div className="flex justify-between text-[9px] text-gray-500">
                                    <span>RCP-00042</span>
                                    <span>TABLE 04 • 12:30 PM</span>
                                </div>

                                <div className="border-t border-b border-gray-200 py-1 space-y-1 text-[9.5px]">
                                    <div className="flex justify-between font-semibold">
                                        <span>1x Beef Stew & Ugali</span>
                                        <span>Ksh 350.00</span>
                                    </div>
                                    <div className="flex justify-between font-semibold">
                                        <span>1x Fresh Passion Juice</span>
                                        <span>Ksh 100.00</span>
                                    </div>
                                </div>

                                {/* Tax Breakdown Display */}
                                {showTaxOnReceipt ? (
                                    <div className="bg-blue-50 border border-blue-200 rounded p-1.5 text-[8.5px] space-y-0.5 text-blue-900 font-mono">
                                        <div className="flex justify-between font-bold">
                                            <span>TAX BREAKDOWN (18% INCL):</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Net Taxable Base:</span>
                                            <span>Ksh 381.36</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>VAT (16%):</span>
                                            <span>Ksh 61.02</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Catering Levy (2%):</span>
                                            <span>Ksh 7.63</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-200 rounded p-1 text-[8.5px] text-center text-amber-800 italic">
                                        (Tax details hidden on customer receipt)
                                    </div>
                                )}

                                <div className="bg-black text-white p-2 rounded flex justify-between font-black text-xs">
                                    <span>TOTAL:</span>
                                    <span>Ksh 450.00</span>
                                </div>

                                <div className="text-center text-[8px] text-gray-400 pt-1 border-t border-dashed border-gray-300">
                                    ★ THANK YOU FOR DINING WITH US! ★
                                </div>
                            </div>
                        </div>

                        <p className="text-[10px] text-slate-400 mt-3 text-center">
                            Changes take effect immediately across all POS terminals and Sales Ledgers.
                        </p>
                    </div>
                </div>
            </div>


            {/* Info Card */}
            <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border border-purple-200 rounded-2xl p-5">
                <div className="flex items-start gap-4">
                    <span className="text-3xl">💡</span>
                    <div>
                        <h3 className="font-bold text-purple-800">Tax Types for Hotels & Restaurants</h3>
                        <p className="text-sm text-purple-700 mt-1">
                            <strong>VAT 16%</strong> - Standard rate for taxable goods and services |
                            <strong> Zero Rated 0%</strong> - For export and specified goods |
                            <strong> Exempt</strong> - Not subject to VAT |
                            <strong> Tourism Levy 2%</strong> - On accommodation |
                            <strong> Service Charge 10%</strong> - Optional service fee
                        </p>
                    </div>
                </div>
            </div>

            {/* Tax Settings Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Code</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Tax Name</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Rate</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Type</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Inclusive/Exclusive</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Applies To</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Default</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-purple-400/30 border-t-purple-500 rounded-full animate-spin"></div>
                                            <span className="text-gray-500">Loading tax settings...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : taxes.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-5xl">📊</span>
                                            <p className="text-gray-500">No tax settings found</p>
                                            <button
                                                onClick={openAddModal}
                                                className="px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors"
                                            >
                                                Add First Tax Type
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                taxes.map((tax) => (
                                    <tr key={tax.tax_id} className={`border-t border-gray-50 hover:bg-purple-50/50 transition-colors ${!tax.active ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-4">
                                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                                                {tax.tax_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 font-semibold text-gray-800">
                                            {tax.tax_name}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="text-xl font-bold text-purple-600">
                                                {tax.tax_rate}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getTaxTypeColor(tax.tax_type)}`}>
                                                {tax.tax_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tax.is_inclusive ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {tax.is_inclusive ? '✅ Inclusive' : '➕ Exclusive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center text-gray-600">
                                            {tax.applies_to}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {tax.is_default && (
                                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                                    ⭐ Default
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(tax)}
                                                    className="p-2 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-xl transition-all hover:scale-110"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => deleteTax(tax)}
                                                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all hover:scale-110"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingTax ? '✏️ Edit Tax Setting' : '➕ Add New Tax Type'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            {editingTax && (
                                <p className="text-purple-100 text-sm mt-1">Code: {editingTax.tax_code}</p>
                            )}
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📊 Tax Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.tax_name}
                                    onChange={(e) => setFormData({ ...formData, tax_name: e.target.value })}
                                    placeholder="e.g., VAT 16%"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-400/20"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        💯 Tax Rate (%)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.tax_rate}
                                        onChange={(e) => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🏷️ Tax Type
                                    </label>
                                    <select
                                        value={formData.tax_type}
                                        onChange={(e) => setFormData({ ...formData, tax_type: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 cursor-pointer"
                                    >
                                        {taxTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🎯 Applies To
                                </label>
                                <select
                                    value={formData.applies_to}
                                    onChange={(e) => setFormData({ ...formData, applies_to: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-purple-500 cursor-pointer"
                                >
                                    {appliesTo.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>

                            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-4 border border-purple-200">
                                <p className="text-sm font-semibold text-purple-800 mb-3">Tax Calculation Method</p>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-xl border-2 transition-all ${formData.is_inclusive ? 'border-gray-200 bg-white' : 'border-purple-400 bg-purple-50'}">
                                        <input
                                            type="radio"
                                            name="inclusive"
                                            checked={!formData.is_inclusive}
                                            onChange={() => setFormData({ ...formData, is_inclusive: false })}
                                            className="w-4 h-4 text-purple-500"
                                        />
                                        <div>
                                            <span className="font-medium text-gray-800">Exclusive</span>
                                            <p className="text-xs text-gray-500">Tax added to price</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-xl border-2 transition-all ${formData.is_inclusive ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'}">
                                        <input
                                            type="radio"
                                            name="inclusive"
                                            checked={formData.is_inclusive}
                                            onChange={() => setFormData({ ...formData, is_inclusive: true })}
                                            className="w-4 h-4 text-purple-500"
                                        />
                                        <div>
                                            <span className="font-medium text-gray-800">Inclusive</span>
                                            <p className="text-xs text-gray-500">Tax included in price</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_default}
                                        onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                                        className="w-5 h-5 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                                    />
                                    <span className="font-medium text-gray-700">⭐ Set as Default</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        className="w-5 h-5 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                                    />
                                    <span className="font-medium text-gray-700">Active</span>
                                </label>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-4 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-300/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingTax ? '💾' : '➕'}</span>
                                            {editingTax ? 'Update Tax' : 'Create Tax'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
