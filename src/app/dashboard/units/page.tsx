'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Unit {
    unit_id: number;
    unit_code: string;
    unit_name: string;
    abbreviation: string;
    description: string;
    is_base_unit: boolean;
    active: boolean;
}

const defaultUnit = {
    unit_name: '',
    abbreviation: '',
    description: '',
    is_base_unit: false,
    active: true,
};

export default function UnitsPage() {
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
    const [formData, setFormData] = useState(defaultUnit);
    const [isSaving, setIsSaving] = useState(false);

    const loadUnits = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('product_units')
                .select('*')
                .order('unit_id', { ascending: true });

            if (error) throw error;
            setUnits(data || []);
        } catch (err) {
            console.error('Error loading units:', err);
            toast.error('Failed to load units');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadUnits();
    }, [loadUnits]);

    const generateUnitCode = async (): Promise<string> => {
        try {
            const { data } = await supabase
                .from('product_units')
                .select('unit_code')
                .like('unit_code', 'UNT-%')
                .order('unit_code', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const lastCode = data[0].unit_code;
                const lastNum = parseInt(lastCode.replace('UNT-', '')) || 0;
                return `UNT-${String(lastNum + 1).padStart(2, '0')}`;
            }
            return 'UNT-01';
        } catch {
            return 'UNT-01';
        }
    };

    const openAddModal = () => {
        setEditingUnit(null);
        setFormData(defaultUnit);
        setShowModal(true);
    };

    const openEditModal = (unit: Unit) => {
        setEditingUnit(unit);
        setFormData({
            unit_name: unit.unit_name || '',
            abbreviation: unit.abbreviation || '',
            description: unit.description || '',
            is_base_unit: unit.is_base_unit || false,
            active: unit.active !== false,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.unit_name.trim()) {
            toast.error('Unit name required!');
            return;
        }

        setIsSaving(true);
        try {
            if (editingUnit) {
                const { error } = await supabase
                    .from('product_units')
                    .update(formData)
                    .eq('unit_id', editingUnit.unit_id);

                if (error) throw error;
                toast.success('Unit updated! ✓');
            } else {
                const newCode = await generateUnitCode();
                const { error } = await supabase
                    .from('product_units')
                    .insert({
                        ...formData,
                        unit_code: newCode,
                    });

                if (error) throw error;
                toast.success(`Unit ${newCode} created! ✓`);
            }

            setShowModal(false);
            loadUnits();
        } catch (err) {
            console.error('Error saving unit:', err);
            toast.error('Failed to save unit');
        }
        setIsSaving(false);
    };

    const deleteUnit = async (unit: Unit) => {
        if (!confirm(`Delete "${unit.unit_name}"?`)) return;

        try {
            const { error } = await supabase
                .from('product_units')
                .delete()
                .eq('unit_id', unit.unit_id);

            if (error) throw error;
            toast.success('Unit deleted');
            loadUnits();
        } catch (err) {
            console.error('Error deleting unit:', err);
            toast.error('Failed to delete');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">📏</span>
                        Units of Measurement
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Manage units for products and ingredients • Code format: UNT-XX
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold rounded-2xl shadow-lg shadow-teal-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                >
                    <span className="text-xl">➕</span>
                    Add Unit
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center text-white text-2xl">
                            📏
                        </div>
                        <div>
                            <p className="text-sm text-teal-600 font-medium">Total Units</p>
                            <p className="text-2xl font-bold text-gray-800">{units.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white text-2xl">
                            ⭐
                        </div>
                        <div>
                            <p className="text-sm text-blue-600 font-medium">Base Units</p>
                            <p className="text-2xl font-bold text-gray-800">{units.filter(u => u.is_base_unit).length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center text-white text-2xl">
                            ✅
                        </div>
                        <div>
                            <p className="text-sm text-green-600 font-medium">Active</p>
                            <p className="text-2xl font-bold text-gray-800">{units.filter(u => u.active).length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Units Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-teal-500 to-teal-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">Code</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">Unit Name</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Abbreviation</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">Description</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Base Unit</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Status</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-teal-400/30 border-t-teal-500 rounded-full animate-spin"></div>
                                            <span className="text-gray-500">Loading units...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : units.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-5xl">📏</span>
                                            <p className="text-gray-500">No units found</p>
                                            <button
                                                onClick={openAddModal}
                                                className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors"
                                            >
                                                Add First Unit
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                units.map((unit) => (
                                    <tr key={unit.unit_id} className={`border-t border-gray-50 hover:bg-teal-50/50 transition-colors ${!unit.active ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-4">
                                            <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-semibold">
                                                {unit.unit_code}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 font-semibold text-gray-800">
                                            {unit.unit_name}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg font-mono font-bold">
                                                {unit.abbreviation}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 hidden md:table-cell text-gray-600">
                                            {unit.description || '-'}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {unit.is_base_unit && (
                                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                                    ⭐ Base
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${unit.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {unit.active ? '✅ Active' : '⏸️ Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(unit)}
                                                    className="p-2 bg-teal-100 hover:bg-teal-200 text-teal-600 rounded-xl transition-all hover:scale-110"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => deleteUnit(unit)}
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
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingUnit ? '✏️ Edit Unit' : '➕ Add New Unit'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            {editingUnit && (
                                <p className="text-teal-100 text-sm mt-1">Code: {editingUnit.unit_code}</p>
                            )}
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📏 Unit Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.unit_name}
                                    onChange={(e) => setFormData({ ...formData, unit_name: e.target.value })}
                                    placeholder="e.g., Kilogram"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/20"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🔤 Abbreviation
                                </label>
                                <input
                                    type="text"
                                    value={formData.abbreviation}
                                    onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                                    placeholder="e.g., Kg"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-teal-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📝 Description
                                </label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Optional description"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-teal-500"
                                />
                            </div>

                            <div className="flex items-center gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_base_unit}
                                        onChange={(e) => setFormData({ ...formData, is_base_unit: e.target.checked })}
                                        className="w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
                                    />
                                    <span className="font-medium text-gray-700">⭐ Base Unit</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        className="w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
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
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-300/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingUnit ? '💾' : '➕'}</span>
                                            {editingUnit ? 'Update' : 'Create'}
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
