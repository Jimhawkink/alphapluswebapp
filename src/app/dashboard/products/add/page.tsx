'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Category { category_id: number; category_name: string; icon: string; }
interface Unit { unit_id: number; unit_name: string; abbreviation: string; }

const VAT_OPTIONS = ['Standard (16%)', 'Zero Rated (0%)', 'Exempt', 'Special'];

const BUTTON_COLORS = [
    { label: 'Ocean Blue',   value: 'from-blue-400 to-blue-600' },
    { label: 'Forest Green', value: 'from-green-400 to-green-600' },
    { label: 'Sunset Red',   value: 'from-red-400 to-red-600' },
    { label: 'Royal Purple', value: 'from-purple-400 to-purple-600' },
    { label: 'Golden Amber', value: 'from-amber-400 to-amber-600' },
    { label: 'Teal Fresh',   value: 'from-teal-400 to-teal-600' },
    { label: 'Rose Pink',    value: 'from-rose-400 to-rose-600' },
    { label: 'Indigo Deep',  value: 'from-indigo-400 to-indigo-600' },
    { label: 'Slate Dark',   value: 'from-slate-500 to-slate-700' },
    { label: 'Cyan Bright',  value: 'from-cyan-400 to-cyan-600' },
];

const emptyForm = {
    product_name: '',
    alias: '',
    barcode: '',
    category: '',
    description: '',
    purchase_unit: 'PCS',
    sales_unit: 'PCS',
    purchase_cost: '',
    sales_cost: '',
    margin_per: '',
    vat_commodity: 'Zero Rated (0%)',
    vat: 0,
    reorder_point: 5,
    supplier_name: '',
    batch_no: '',
    show_in_pos: true,
    active: true,
    button_ui_color: 'from-blue-400 to-blue-600',
};

export default function AddProductPage() {
    const router = useRouter();
    const [categories, setCategories] = useState<Category[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [nextCode, setNextCode] = useState('');
    const [activeSection, setActiveSection] = useState<'basic' | 'pricing' | 'pos' | 'advanced'>('basic');

    const loadMeta = useCallback(async () => {
        const [catRes, unitRes, countRes] = await Promise.all([
            supabase.from('product_categories').select('category_id, category_name, icon').eq('active', true).order('category_name'),
            supabase.from('product_units').select('unit_id, unit_name, abbreviation').eq('active', true).order('unit_name'),
            supabase.from('products').select('*', { count: 'exact', head: true }),
        ]);
        setCategories((catRes.data || []) as Category[]);
        setUnits((unitRes.data || []) as Unit[]);
        const n = String((countRes.count || 0) + 1).padStart(4, '0');
        setNextCode(`PRD-${n}`);
    }, []);

    useEffect(() => { loadMeta(); }, [loadMeta]);

    const set = (field: string, val: any) => setForm(p => {
        const updated = { ...p, [field]: val };
        // Auto-calc margin when costs change
        if ((field === 'sales_cost' || field === 'purchase_cost')) {
            const sell = parseFloat(field === 'sales_cost' ? val : p.sales_cost) || 0;
            const buy  = parseFloat(field === 'purchase_cost' ? val : p.purchase_cost) || 0;
            updated.margin_per = buy > 0 ? String(Math.round(((sell - buy) / buy) * 100)) : '';
        }
        // Auto-set VAT % from type
        if (field === 'vat_commodity') {
            updated.vat = val.includes('16%') ? 16 : val.includes('8%') ? 8 : 0;
        }
        return updated;
    });

    const handleSave = async (addAnother = false) => {
        if (!form.product_name.trim()) { toast.error('Product name is required'); return; }
        if (!form.category) { toast.error('Select a category'); return; }
        setIsSaving(true);
        try {
            const userData = JSON.parse(localStorage.getItem('user') || '{}');
            const payload = {
                product_code: nextCode,
                product_name: form.product_name.trim(),
                alias: form.alias.trim() || null,
                barcode: form.barcode.trim() || null,
                category: form.category,
                description: form.description.trim() || null,
                purchase_unit: form.purchase_unit,
                sales_unit: form.sales_unit,
                purchase_cost: parseFloat(form.purchase_cost) || 0,
                sales_cost: parseFloat(form.sales_cost) || 0,
                margin_per: parseFloat(form.margin_per) || 0,
                vat_commodity: form.vat_commodity,
                vat: form.vat,
                reorder_point: form.reorder_point,
                supplier_name: form.supplier_name.trim() || null,
                batch_no: form.batch_no.trim() || null,
                show_in_pos: form.show_in_pos,
                active: form.active,
                button_ui_color: form.button_ui_color,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase.from('products').insert(payload);
            if (error) throw error;

            toast.success(`✅ "${form.product_name}" added successfully!`);

            if (addAnother) {
                setForm(emptyForm);
                loadMeta(); // refresh code
            } else {
                router.push('/dashboard/products');
            }
        } catch (err: any) {
            toast.error('Failed to save: ' + err.message);
        }
        setIsSaving(false);
    };

    const sellCost = parseFloat(form.sales_cost) || 0;
    const buyCost  = parseFloat(form.purchase_cost) || 0;
    const profit   = sellCost - buyCost;
    const margin   = buyCost > 0 ? ((profit / buyCost) * 100).toFixed(1) : '0';

    const SECTIONS = [
        { id: 'basic',    label: 'Basic Info',   icon: '📋' },
        { id: 'pricing',  label: 'Pricing',       icon: '💰' },
        { id: 'pos',      label: 'POS Settings',  icon: '🛒' },
        { id: 'advanced', label: 'Advanced',      icon: '⚙️' },
    ] as const;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/dashboard/products')}
                        className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-all">
                        ←
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                            <span className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">🍽️</span>
                            Add New Dish / Menu Item
                        </h1>
                        <p className="text-xs text-gray-500 mt-0.5">Code: <strong className="font-mono text-blue-600">{nextCode}</strong> • This adds to the Products (Menu) table</p>
                    </div>
                </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <p className="text-sm text-blue-800">
                    Adding a <strong>Dish / Menu Item</strong> (e.g. Chicken Burger, Pilau, Chai). 
                    Its stock will be managed through <strong>Recipe Production batches</strong> — not a direct stock field.
                    To add raw ingredients (Sugar, Flour), go to <strong>Ingredient Stock</strong>.
                </p>
            </div>

            {/* Section Nav Tabs */}
            <div className="flex gap-2 bg-white border rounded-2xl p-2">
                {SECTIONS.map(s => (
                    <button key={s.id} onClick={() => setActiveSection(s.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all
                            ${activeSection === s.id ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <span>{s.icon}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>

            {/* ── BASIC INFO ── */}
            {activeSection === 'basic' && (
                <div className="bg-white rounded-2xl border p-6 space-y-5">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">📋 Basic Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                Product / Dish Name <span className="text-red-500">*</span>
                            </label>
                            <input type="text" value={form.product_name} onChange={e => set('product_name', e.target.value)}
                                placeholder="e.g. Chicken Burger, Pilau Rice, Masala Chai..."
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none text-base font-semibold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Alias / Short Name</label>
                            <input type="text" value={form.alias} onChange={e => set('alias', e.target.value)}
                                placeholder="e.g. Chk Burger (for POS button)"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <select value={form.category} onChange={e => set('category', e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none">
                                <option value="">-- Select Category --</option>
                                {categories.map(c => (
                                    <option key={c.category_id} value={c.category_name}>{c.icon} {c.category_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Barcode (Optional)</label>
                            <input type="text" value={form.barcode} onChange={e => set('barcode', e.target.value)}
                                placeholder="Scan or type barcode"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Supplier / Brand</label>
                            <input type="text" value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)}
                                placeholder="e.g. In-House, Vendor Name..."
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Description</label>
                            <textarea value={form.description} onChange={e => set('description', e.target.value)}
                                placeholder="Describe the dish — ingredients, preparation style, allergens..."
                                rows={3}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none resize-none" />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={() => setActiveSection('pricing')}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                            Next: Pricing →
                        </button>
                    </div>
                </div>
            )}

            {/* ── PRICING ── */}
            {activeSection === 'pricing' && (
                <div className="bg-white rounded-2xl border p-6 space-y-5">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">💰 Pricing & Units</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Purchase Unit</label>
                            <select value={form.purchase_unit} onChange={e => set('purchase_unit', e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none">
                                {units.length > 0
                                    ? units.map(u => <option key={u.unit_id} value={u.unit_name}>{u.unit_name} ({u.abbreviation})</option>)
                                    : ['PCS', 'KG', 'L', 'Plate', 'Bowl', 'Cup', 'Serving'].map(u => <option key={u} value={u}>{u}</option>)
                                }
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Purchase Cost (Ksh)</label>
                            <input type="number" value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)}
                                placeholder="0.00" min="0" step="0.01"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Sales Unit</label>
                            <select value={form.sales_unit} onChange={e => set('sales_unit', e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none">
                                {units.length > 0
                                    ? units.map(u => <option key={u.unit_id} value={u.unit_name}>{u.unit_name} ({u.abbreviation})</option>)
                                    : ['PCS', 'KG', 'L', 'Plate', 'Bowl', 'Cup', 'Serving'].map(u => <option key={u} value={u}>{u}</option>)
                                }
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Selling Price (Ksh) <span className="text-red-500">*</span></label>
                            <input type="number" value={form.sales_cost} onChange={e => set('sales_cost', e.target.value)}
                                placeholder="0.00" min="0" step="0.01"
                                className="w-full px-4 py-2.5 bg-gray-50 border-2 border-blue-200 rounded-xl text-sm focus:border-blue-500 outline-none font-bold text-blue-700" />
                        </div>
                    </div>

                    {/* Profit Summary */}
                    {sellCost > 0 && (
                        <div className={`rounded-2xl p-5 grid grid-cols-3 gap-4 ${profit >= 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                            <div className="text-center">
                                <p className="text-xs text-gray-500 font-bold uppercase">Cost Price</p>
                                <p className="text-2xl font-black text-gray-800 mt-1">Ksh {buyCost.toLocaleString()}</p>
                            </div>
                            <div className="text-center border-x border-gray-200">
                                <p className="text-xs text-gray-500 font-bold uppercase">Gross Profit</p>
                                <p className={`text-2xl font-black mt-1 ${profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {profit < 0 ? '-' : '+'}Ksh {Math.abs(profit).toLocaleString()}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-gray-500 font-bold uppercase">Margin</p>
                                <p className={`text-2xl font-black mt-1 ${profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {margin}%
                                </p>
                            </div>
                        </div>
                    )}

                    {/* VAT */}
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">VAT / Tax Category</label>
                            <select value={form.vat_commodity} onChange={e => set('vat_commodity', e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none">
                                {VAT_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">VAT % (Auto-filled)</label>
                            <input type="number" value={form.vat} onChange={e => set('vat', parseFloat(e.target.value) || 0)}
                                min="0" max="100"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Reorder Point (min stock)</label>
                            <input type="number" value={form.reorder_point} onChange={e => set('reorder_point', parseInt(e.target.value) || 0)}
                                min="0"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Batch Number</label>
                            <input type="text" value={form.batch_no} onChange={e => set('batch_no', e.target.value)}
                                placeholder="Optional batch reference"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none font-mono" />
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setActiveSection('basic')}
                            className="px-6 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                            ← Back
                        </button>
                        <button onClick={() => setActiveSection('pos')}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                            Next: POS Settings →
                        </button>
                    </div>
                </div>
            )}

            {/* ── POS SETTINGS ── */}
            {activeSection === 'pos' && (
                <div className="bg-white rounded-2xl border p-6 space-y-5">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">🛒 POS Display Settings</h2>
                    <p className="text-sm text-gray-500">Configure how this dish appears on the Point of Sale screen</p>

                    {/* Show in POS toggle */}
                    <div className={`p-5 rounded-2xl border-2 transition-all ${form.show_in_pos ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                        <label className="flex items-center gap-4 cursor-pointer">
                            <div
                                onClick={() => set('show_in_pos', !form.show_in_pos)}
                                className={`relative w-14 h-7 rounded-full transition-all cursor-pointer ${form.show_in_pos ? 'bg-emerald-500' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${form.show_in_pos ? 'left-8' : 'left-1'}`} />
                            </div>
                            <div>
                                <p className="font-bold text-gray-800">{form.show_in_pos ? '✅ Show on POS Screen' : '⛔ Hidden from POS'}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {form.show_in_pos ? 'This item will appear as a button on the POS order screen' : 'This item won\'t show on POS — only available via manual search'}
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Button Color Picker */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-3">POS Button Color</label>
                        <div className="grid grid-cols-5 gap-3">
                            {BUTTON_COLORS.map(c => (
                                <button
                                    key={c.value}
                                    onClick={() => set('button_ui_color', c.value)}
                                    className={`relative h-14 rounded-2xl bg-gradient-to-br ${c.value} transition-all hover:scale-105 ${form.button_ui_color === c.value ? 'ring-4 ring-offset-2 ring-gray-400 scale-105' : ''}`}
                                    title={c.label}
                                >
                                    {form.button_ui_color === c.value && (
                                        <span className="absolute inset-0 flex items-center justify-center text-white text-xl font-black">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Selected: <span className="font-semibold text-gray-600">{BUTTON_COLORS.find(c => c.value === form.button_ui_color)?.label}</span></p>
                    </div>

                    {/* POS Preview */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-3">POS Button Preview</label>
                        <div className={`inline-flex items-center justify-center w-36 h-20 rounded-2xl bg-gradient-to-br ${form.button_ui_color} text-white shadow-lg`}>
                            <div className="text-center px-2">
                                <p className="text-sm font-bold leading-tight">{form.alias || form.product_name || 'Dish Name'}</p>
                                {form.sales_cost && (
                                    <p className="text-xs opacity-80 mt-1">Ksh {parseFloat(form.sales_cost).toLocaleString()}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setActiveSection('pricing')}
                            className="px-6 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                            ← Back
                        </button>
                        <button onClick={() => setActiveSection('advanced')}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                            Next: Advanced →
                        </button>
                    </div>
                </div>
            )}

            {/* ── ADVANCED ── */}
            {activeSection === 'advanced' && (
                <div className="bg-white rounded-2xl border p-6 space-y-5">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">⚙️ Advanced Settings</h2>

                    <div className="space-y-3">
                        <div className={`p-5 rounded-2xl border-2 transition-all ${form.active ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                            <label className="flex items-center gap-4 cursor-pointer">
                                <div onClick={() => set('active', !form.active)}
                                    className={`relative w-14 h-7 rounded-full transition-all cursor-pointer ${form.active ? 'bg-emerald-500' : 'bg-red-400'}`}>
                                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${form.active ? 'left-8' : 'left-1'}`} />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800">{form.active ? '✅ Active Product' : '⛔ Inactive Product'}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Inactive products are hidden from all lists and POS</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Full Summary before saving */}
                    <div className="bg-gray-50 rounded-2xl p-5 space-y-3 border">
                        <h3 className="font-bold text-gray-700 text-sm">📋 Summary Before Saving</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-gray-500">Code:</span> <strong className="font-mono">{nextCode}</strong></div>
                            <div><span className="text-gray-500">Name:</span> <strong>{form.product_name || '—'}</strong></div>
                            <div><span className="text-gray-500">Category:</span> <strong>{form.category || '—'}</strong></div>
                            <div><span className="text-gray-500">Selling Price:</span> <strong className="text-blue-700">Ksh {parseFloat(form.sales_cost || '0').toLocaleString()}</strong></div>
                            <div><span className="text-gray-500">Cost Price:</span> <strong>Ksh {parseFloat(form.purchase_cost || '0').toLocaleString()}</strong></div>
                            <div><span className="text-gray-500">Margin:</span> <strong className={parseFloat(margin) >= 0 ? 'text-emerald-700' : 'text-red-700'}>{margin}%</strong></div>
                            <div><span className="text-gray-500">VAT:</span> <strong>{form.vat_commodity}</strong></div>
                            <div><span className="text-gray-500">Show in POS:</span> <strong>{form.show_in_pos ? '✅ Yes' : '❌ No'}</strong></div>
                            <div><span className="text-gray-500">Status:</span> <strong>{form.active ? '✅ Active' : '⛔ Inactive'}</strong></div>
                        </div>
                    </div>

                    <div className="flex justify-between gap-3">
                        <button onClick={() => setActiveSection('pos')}
                            className="px-6 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                            ← Back
                        </button>
                        <div className="flex gap-3">
                            <button onClick={() => handleSave(true)} disabled={isSaving}
                                className="px-5 py-2.5 border-2 border-blue-300 text-blue-700 rounded-xl font-semibold hover:bg-blue-50 text-sm disabled:opacity-50">
                                {isSaving ? '⏳...' : '✅ Save & Add Another'}
                            </button>
                            <button onClick={() => handleSave(false)} disabled={isSaving}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg transition-all text-sm disabled:opacity-50">
                                {isSaving ? '⏳ Saving...' : '✅ Save Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
