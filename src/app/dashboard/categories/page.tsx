'use client';

import { useState } from 'react';

interface Category {
    id: number;
    name: string;
    productsCount: number;
    color: string;
}

const sampleCategories: Category[] = [
    { id: 1, name: 'Burgers', productsCount: 8, color: '#f97316' },
    { id: 2, name: 'Pizza', productsCount: 6, color: '#eab308' },
    { id: 3, name: 'Main Dishes', productsCount: 12, color: '#ef4444' },
    { id: 4, name: 'Sides', productsCount: 5, color: '#f59e0b' },
    { id: 5, name: 'Drinks', productsCount: 15, color: '#3b82f6' },
    { id: 6, name: 'Salads', productsCount: 4, color: '#22c55e' },
    { id: 7, name: 'Desserts', productsCount: 7, color: '#ec4899' },
    { id: 8, name: 'Breakfast', productsCount: 9, color: '#8b5cf6' },
];

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>(sampleCategories);
    const [showModal, setShowModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [newCategoryName, setNewCategoryName] = useState('');

    const handleAddCategory = () => {
        setEditingCategory(null);
        setNewCategoryName('');
        setShowModal(true);
    };

    const handleEditCategory = (category: Category) => {
        setEditingCategory(category);
        setNewCategoryName(category.name);
        setShowModal(true);
    };

    const handleSave = () => {
        if (!newCategoryName.trim()) return;

        if (editingCategory) {
            setCategories(prev => prev.map(c =>
                c.id === editingCategory.id ? { ...c, name: newCategoryName } : c
            ));
        } else {
            const colors = ['#f97316', '#eab308', '#ef4444', '#3b82f6', '#22c55e', '#ec4899', '#8b5cf6'];
            setCategories(prev => [...prev, {
                id: Date.now(),
                name: newCategoryName,
                productsCount: 0,
                color: colors[Math.floor(Math.random() * colors.length)],
            }]);
        }
        setShowModal(false);
        setNewCategoryName('');
    };

    const handleDelete = (id: number) => {
        if (confirm('Are you sure you want to delete this category?')) {
            setCategories(prev => prev.filter(c => c.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>🏷️</span> Categories
                    </h1>
                    <p className="text-gray-500">Organize your products into categories</p>
                </div>
                <button
                    onClick={handleAddCategory}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    <span>➕</span>
                    <span>Add Category</span>
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <span className="text-xl">🏷️</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600">Total Categories</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{categories.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <span className="text-xl">📦</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">Total Products</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">
                        {categories.reduce((sum, c) => sum + c.productsCount, 0)}
                    </p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                            <span className="text-xl">📊</span>
                        </div>
                        <span className="text-sm font-medium text-purple-600">Avg Products/Category</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">
                        {Math.round(categories.reduce((sum, c) => sum + c.productsCount, 0) / categories.length)}
                    </p>
                </div>
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {categories.map(category => (
                    <div
                        key={category.id}
                        className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                                style={{ backgroundColor: category.color }}
                            >
                                {category.name.charAt(0)}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleEditCategory(category)}
                                    className="p-2 hover:bg-blue-50 rounded-lg text-blue-500"
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={() => handleDelete(category.id)}
                                    className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-1">{category.name}</h3>
                        <p className="text-sm text-gray-500">{category.productsCount} products</p>
                    </div>
                ))}

                {/* Add New Category Card */}
                <button
                    onClick={handleAddCategory}
                    className="border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/50 transition-all group min-h-[140px]"
                >
                    <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                        <span className="text-2xl">➕</span>
                    </div>
                    <span className="text-gray-500 group-hover:text-blue-600 font-medium">Add Category</span>
                </button>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span>🏷️</span>
                                {editingCategory ? 'Edit Category' : 'Add New Category'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl hover:opacity-70">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Category Name</label>
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Enter category name..."
                                    className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                                >
                                    {editingCategory ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
