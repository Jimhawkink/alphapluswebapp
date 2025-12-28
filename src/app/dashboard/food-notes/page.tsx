'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface FoodOrderNote {
    note_id: number;
    note_code: string;
    note_text: string;
    note_category: string;
    icon: string;
    display_order: number;
    active: boolean;
}

const categoryOptions = ['General', 'Seasoning', 'Spice Level', 'Cooking', 'Allergy', 'Diet', 'Extras', 'Service'];
const iconOptions = ['🧂', '🌶️', '🔥', '🍳', '🥩', '🧅', '🧄', '🌾', '🥛', '🥗', '🫒', '🫗', '🚫', '📦', '⚡', '⏸️', '🍬', '🥬', '✨', '💡'];

const defaultNote = {
    note_text: '',
    note_category: 'General',
    icon: '📝',
    display_order: 0,
    active: true,
};

export default function FoodOrderNotesPage() {
    const [notes, setNotes] = useState<FoodOrderNote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingNote, setEditingNote] = useState<FoodOrderNote | null>(null);
    const [formData, setFormData] = useState(defaultNote);
    const [isSaving, setIsSaving] = useState(false);
    const [filterCategory, setFilterCategory] = useState('All');

    const loadNotes = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('food_order_notes')
                .select('*')
                .order('display_order', { ascending: true });

            if (error) throw error;
            setNotes(data || []);
        } catch (err) {
            console.error('Error loading notes:', err);
            toast.error('Failed to load notes');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    const generateNoteCode = (text: string): string => {
        return text.toUpperCase().replace(/[^A-Z0-9]/g, '-').substring(0, 20);
    };

    const openAddModal = () => {
        setEditingNote(null);
        setFormData({ ...defaultNote, display_order: notes.length + 1 });
        setShowModal(true);
    };

    const openEditModal = (note: FoodOrderNote) => {
        setEditingNote(note);
        setFormData({
            note_text: note.note_text || '',
            note_category: note.note_category || 'General',
            icon: note.icon || '📝',
            display_order: note.display_order || 0,
            active: note.active !== false,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.note_text.trim()) {
            toast.error('Note text required!');
            return;
        }

        setIsSaving(true);
        try {
            if (editingNote) {
                const { error } = await supabase
                    .from('food_order_notes')
                    .update({
                        ...formData,
                    })
                    .eq('note_id', editingNote.note_id);

                if (error) throw error;
                toast.success('Note updated! ✓');
            } else {
                const newCode = generateNoteCode(formData.note_text);
                const { error } = await supabase
                    .from('food_order_notes')
                    .insert({
                        ...formData,
                        note_code: newCode,
                    });

                if (error) throw error;
                toast.success('Note created! ✓');
            }

            setShowModal(false);
            loadNotes();
        } catch (err) {
            console.error('Error saving note:', err);
            toast.error('Failed to save note');
        }
        setIsSaving(false);
    };

    const deleteNote = async (note: FoodOrderNote) => {
        if (!confirm(`Delete "${note.note_text}"?`)) return;

        try {
            const { error } = await supabase
                .from('food_order_notes')
                .delete()
                .eq('note_id', note.note_id);

            if (error) throw error;
            toast.success('Note deleted');
            loadNotes();
        } catch (err) {
            console.error('Error deleting note:', err);
            toast.error('Failed to delete');
        }
    };

    const filteredNotes = filterCategory === 'All'
        ? notes
        : notes.filter(n => n.note_category === filterCategory);

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Seasoning': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Spice Level': return 'bg-red-100 text-red-700 border-red-200';
            case 'Cooking': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'Allergy': return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'Diet': return 'bg-green-100 text-green-700 border-green-200';
            case 'Extras': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Service': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <span className="text-3xl">📝</span>
                        Food Order Notes
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Preset notes for KOT • No Salt, Extra Spicy, Well Done, etc.
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-2xl shadow-lg shadow-amber-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                >
                    <span className="text-xl">➕</span>
                    Add Note
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
                <div className="flex items-start gap-4">
                    <span className="text-3xl">💡</span>
                    <div>
                        <h3 className="font-bold text-amber-800">KOT Notes for Kitchen</h3>
                        <p className="text-sm text-amber-700 mt-1">
                            These notes appear when adding items to cart and are printed on the Kitchen Order Ticket (KOT).
                            Examples: <strong>No Salt</strong>, <strong>Extra Spicy</strong>, <strong>Well Done</strong>, <strong>Gluten Free</strong>, <strong>Rush Order</strong>
                        </p>
                    </div>
                </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilterCategory('All')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterCategory === 'All'
                            ? 'bg-gray-800 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    All ({notes.length})
                </button>
                {categoryOptions.map(cat => {
                    const count = notes.filter(n => n.note_category === cat).length;
                    if (count === 0) return null;
                    return (
                        <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterCategory === cat
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {cat} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Notes Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {isLoading ? (
                    <div className="col-span-full flex justify-center py-12">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-amber-400/30 border-t-amber-500 rounded-full animate-spin"></div>
                            <span className="text-gray-500">Loading notes...</span>
                        </div>
                    </div>
                ) : filteredNotes.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center gap-3 py-12">
                        <span className="text-5xl">📝</span>
                        <p className="text-gray-500">No notes found</p>
                        <button
                            onClick={openAddModal}
                            className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors"
                        >
                            Add First Note
                        </button>
                    </div>
                ) : (
                    filteredNotes.map((note) => (
                        <div
                            key={note.note_id}
                            className={`rounded-2xl border-2 p-4 transition-all hover:shadow-lg hover:scale-105 ${note.active ? 'bg-white' : 'bg-gray-50 opacity-60'
                                } ${getCategoryColor(note.note_category)}`}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <span className="text-3xl">{note.icon}</span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => openEditModal(note)}
                                        className="p-1.5 bg-white/80 hover:bg-white text-gray-600 rounded-lg transition-all text-sm"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        onClick={() => deleteNote(note)}
                                        className="p-1.5 bg-white/80 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded-lg transition-all text-sm"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-bold text-gray-800 text-lg">{note.note_text}</h3>
                            <p className="text-xs text-gray-500 mt-1">{note.note_category}</p>
                            {!note.active && (
                                <span className="inline-block mt-2 px-2 py-0.5 bg-gray-200 text-gray-500 rounded text-xs">
                                    Disabled
                                </span>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingNote ? '✏️ Edit Note' : '➕ Add New Note'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📝 Note Text <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.note_text}
                                    onChange={(e) => setFormData({ ...formData, note_text: e.target.value })}
                                    placeholder="e.g., No Salt, Extra Spicy"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🏷️ Category
                                </label>
                                <select
                                    value={formData.note_category}
                                    onChange={(e) => setFormData({ ...formData, note_category: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-amber-500 cursor-pointer"
                                >
                                    {categoryOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    😊 Icon
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {iconOptions.map((icon) => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, icon })}
                                            className={`w-10 h-10 text-xl rounded-xl border-2 transition-all hover:scale-110 ${formData.icon === icon
                                                    ? 'border-amber-500 bg-amber-50'
                                                    : 'border-gray-200 bg-gray-50'
                                                }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🔢 Display Order
                                </label>
                                <input
                                    type="number"
                                    value={formData.display_order}
                                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:border-amber-500"
                                    min="0"
                                />
                            </div>

                            {/* Preview */}
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                                <p className="text-sm text-amber-700 mb-2">Preview (how it appears in POS):</p>
                                <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                                    <span className="text-2xl">{formData.icon}</span>
                                    <span className="font-semibold text-gray-800">{formData.note_text || 'Note Text'}</span>
                                </div>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.active}
                                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                    className="w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                />
                                <span className="font-medium text-gray-700">Active (show in POS)</span>
                            </label>

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
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-amber-300/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingNote ? '💾' : '➕'}</span>
                                            {editingNote ? 'Update' : 'Create'}
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
