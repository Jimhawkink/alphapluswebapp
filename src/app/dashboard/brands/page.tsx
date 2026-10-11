'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Brand {
    brand_id: number;
    brand_name: string;
    brand_code: string;
    description: string;
    contact_person: string;
    phone: string;
    email: string;
    website: string;
    country: string;
    active: boolean;
    product_count?: number;
    created_at: string;
}

const COUNTRIES = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Ethiopia', 'UK', 'USA', 'South Africa', 'China', 'India', 'Other'];

const BRAND_COLORS = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-red-600',
    'from-purple-500 to-violet-600',
    'from-rose-500 to-pink-600',
    'from-amber-500 to-yellow-600',
    'from-sky-500 to-cyan-600',
    'from-teal-500 to-green-600',
];

function getBrandGradient(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return BRAND_COLORS[Math.abs(hash) % BRAND_COLORS.length];
}

const emptyForm = {
    brand_name: '',
    brand_code: '',
    description: '',
    contact_person: '',
    phone: '',
    email: '',
    website: '',
    country: 'Kenya',
    active: true,
};

export default function BrandsPage() {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
    const [showModal, setShowModal] = useState(false);
    const [editBrand, setEditBrand] = useState<Brand | null>(null);
    const [viewBrand, setViewBrand] = useState<Brand | null>(null);
    const [formData, setFormData] = useState(emptyForm);

    const loadBrands = useCallback(async () => {
        setLoading(true);
        try {
            // Load brands — gracefully handles if table doesn't exist yet
            const { data: brandsData, error } = await supabase
                .from('brands')
                .select('*')
                .order('brand_name');

            if (error) {
                if (error.code === '42P01') {
                    // Table doesn't exist — show empty state with create button
                    setBrands([]);
                    toast('Brands table not found. Please run the SQL below to create it.', { icon: '⚠️' });
                    setLoading(false);
                    return;
                }
                throw error;
            }

            // Enrich with product count
            const { data: products } = await supabase
                .from('products')
                .select('brand');

            const brandCount = new Map<string, number>();
            (products || []).forEach((p: any) => {
                if (p.brand) brandCount.set(p.brand, (brandCount.get(p.brand) || 0) + 1);
            });

            const enriched: Brand[] = (brandsData || []).map((b: any) => ({
                ...b,
                product_count: brandCount.get(b.brand_name) || 0,
            }));
            setBrands(enriched);
        } catch (err: any) {
            console.error(err);
            setBrands([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadBrands(); }, [loadBrands]);

    const openAdd = () => {
        setEditBrand(null);
        setFormData(emptyForm);
        setShowModal(true);
    };

    const openEdit = (brand: Brand) => {
        setEditBrand(brand);
        setFormData({
            brand_name: brand.brand_name,
            brand_code: brand.brand_code || '',
            description: brand.description || '',
            contact_person: brand.contact_person || '',
            phone: brand.phone || '',
            email: brand.email || '',
            website: brand.website || '',
            country: brand.country || 'Kenya',
            active: brand.active,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.brand_name.trim()) { toast.error('Brand name is required'); return; }
        setIsSaving(true);
        try {
            const payload = {
                brand_name: formData.brand_name.trim(),
                brand_code: formData.brand_code.trim() || formData.brand_name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 10),
                description: formData.description.trim() || null,
                contact_person: formData.contact_person.trim() || null,
                phone: formData.phone.trim() || null,
                email: formData.email.trim() || null,
                website: formData.website.trim() || null,
                country: formData.country,
                active: formData.active,
            };

            if (editBrand) {
                const { error } = await supabase.from('brands').update(payload).eq('brand_id', editBrand.brand_id);
                if (error) throw error;
                toast.success('Brand updated successfully!');
            } else {
                const { error } = await supabase.from('brands').insert(payload);
                if (error) throw error;
                toast.success('Brand added successfully!');
            }
            setShowModal(false);
            loadBrands();
        } catch (err: any) {
            toast.error('Failed to save: ' + err.message);
        }
        setIsSaving(false);
    };

    const toggleActive = async (brand: Brand) => {
        const { error } = await supabase.from('brands').update({ active: !brand.active }).eq('brand_id', brand.brand_id);
        if (error) { toast.error('Failed to update'); return; }
        toast.success(brand.active ? 'Brand deactivated' : 'Brand activated');
        loadBrands();
    };

    const deleteBrand = async (brand: Brand) => {
        if (brand.product_count && brand.product_count > 0) {
            toast.error(`Cannot delete — ${brand.product_count} product(s) linked to this brand`);
            return;
        }
        if (!confirm(`Delete brand "${brand.brand_name}"? This cannot be undone.`)) return;
        const { error } = await supabase.from('brands').delete().eq('brand_id', brand.brand_id);
        if (error) { toast.error('Failed to delete'); return; }
        toast.success('Brand deleted');
        loadBrands();
    };

    const filtered = brands.filter(b => {
        const matchSearch = !search || b.brand_name.toLowerCase().includes(search.toLowerCase()) || (b.brand_code || '').toLowerCase().includes(search.toLowerCase());
        const matchActive = filterActive === 'all' || (filterActive === 'active' ? b.active : !b.active);
        return matchSearch && matchActive;
    });

    const activeCount = brands.filter(b => b.active).length;
    const totalProducts = brands.reduce((s, b) => s + (b.product_count || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <span className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                        🏢
                    </span>
                    Brand Management
                </h1>
                <button
                    onClick={openAdd}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    ➕ Add Brand
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🏢</span>
                    <p className="text-sm opacity-80 mt-2">Total Brands</p>
                    <p className="text-3xl font-bold">{brands.length}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm opacity-80 mt-2">Active Brands</p>
                    <p className="text-3xl font-bold">{activeCount}</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">📦</span>
                    <p className="text-sm opacity-80 mt-2">Linked Products</p>
                    <p className="text-3xl font-bold">{totalProducts}</p>
                </div>
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
                    <span className="text-3xl">🌍</span>
                    <p className="text-sm opacity-80 mt-2">Countries</p>
                    <p className="text-3xl font-bold">{new Set(brands.map(b => b.country).filter(Boolean)).size}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="🔍 Search brands..."
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'active', 'inactive'] as const).map(f => (
                        <button key={f} onClick={() => setFilterActive(f)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${filterActive === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-gray-400 ml-auto">{filtered.length} brands</span>
            </div>

            {/* Brand Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="spinner" /><span className="ml-3 text-sm text-gray-500">Loading brands...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border py-20 text-center">
                    <div className="text-6xl mb-4">🏢</div>
                    <p className="text-xl font-bold text-gray-400">No brands found</p>
                    <p className="text-sm text-gray-400 mt-1">Click ➕ Add Brand to get started</p>
                    <button onClick={openAdd} className="mt-4 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all text-sm">
                        ➕ Add First Brand
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(brand => (
                        <div key={brand.brand_id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all ${!brand.active ? 'opacity-60' : ''}`}>
                            {/* Brand Color Header */}
                            <div className={`bg-gradient-to-r ${getBrandGradient(brand.brand_name)} px-5 py-4 text-white`}>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-lg font-black">{brand.brand_name}</p>
                                        <p className="text-xs opacity-80 font-mono mt-0.5">{brand.brand_code}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${brand.active ? 'bg-white/20 text-white' : 'bg-black/20 text-white/70'}`}>
                                            {brand.active ? '✅ Active' : '⛔ Inactive'}
                                        </span>
                                        {brand.country && <span className="text-xs opacity-70">🌍 {brand.country}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Brand Details */}
                            <div className="px-5 py-4 space-y-2">
                                {brand.description && (
                                    <p className="text-xs text-gray-600 leading-relaxed">{brand.description}</p>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                                    {brand.contact_person && <span>👤 {brand.contact_person}</span>}
                                    {brand.phone && <span>📞 {brand.phone}</span>}
                                    {brand.email && <span className="col-span-2 truncate">✉️ {brand.email}</span>}
                                    {brand.website && <span className="col-span-2 truncate text-blue-500">🌐 {brand.website}</span>}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                    <span className="text-xs font-semibold text-gray-500">
                                        📦 {brand.product_count || 0} product(s)
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {new Date(brand.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="px-5 pb-4 flex gap-2">
                                <button onClick={() => openEdit(brand)}
                                    className="flex-1 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all">
                                    ✏️ Edit
                                </button>
                                <button onClick={() => toggleActive(brand)}
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${brand.active ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                    {brand.active ? '⛔ Deactivate' : '✅ Activate'}
                                </button>
                                <button onClick={() => deleteBrand(brand)}
                                    className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white flex-shrink-0">
                            <h2 className="text-lg font-bold">{editBrand ? '✏️ Edit Brand' : '➕ Add New Brand'}</h2>
                            <p className="text-indigo-200 text-sm mt-0.5">Fill in the brand details below</p>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                                        Brand Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.brand_name}
                                        onChange={e => setFormData(p => ({ ...p, brand_name: e.target.value }))}
                                        placeholder="e.g. Alpha Foods Kenya"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Brand Code</label>
                                    <input
                                        type="text"
                                        value={formData.brand_code}
                                        onChange={e => setFormData(p => ({ ...p, brand_code: e.target.value.toUpperCase() }))}
                                        placeholder="e.g. ALPHA-KE"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Country</label>
                                    <select
                                        value={formData.country}
                                        onChange={e => setFormData(p => ({ ...p, country: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                                    >
                                        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                        placeholder="Brief description of the brand..."
                                        rows={2}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none resize-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Contact Person</label>
                                    <input
                                        type="text"
                                        value={formData.contact_person}
                                        onChange={e => setFormData(p => ({ ...p, contact_person: e.target.value }))}
                                        placeholder="Sales rep name"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                                        placeholder="+254 7xx xxx xxx"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                                        placeholder="brand@example.com"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Website</label>
                                    <input
                                        type="url"
                                        value={formData.website}
                                        onChange={e => setFormData(p => ({ ...p, website: e.target.value }))}
                                        placeholder="https://brand.com"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="col-span-2 flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.active}
                                            onChange={e => setFormData(p => ({ ...p, active: e.target.checked }))}
                                            className="w-4 h-4 accent-indigo-600"
                                        />
                                        <span className="text-sm font-semibold text-gray-700">Active Brand</span>
                                    </label>
                                    <span className="text-xs text-gray-400">Inactive brands won't appear in product selection</span>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button onClick={handleSave} disabled={isSaving}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50">
                                    {isSaving ? '⏳ Saving...' : editBrand ? '✅ Update Brand' : '✅ Add Brand'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
