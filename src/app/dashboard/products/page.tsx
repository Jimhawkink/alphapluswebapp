'use client';

import { useState } from 'react';

interface Product {
    id: number;
    code: string;
    name: string;
    category: string;
    purchaseCost: number;
    salesCost: number;
    stock: number;
    reorderPoint: number;
    barcode: string;
    unit: string;
    color: string;
}

const sampleProducts: Product[] = [
    { id: 1, code: 'PRD001', name: 'Chicken Burger', category: 'Burgers', purchaseCost: 300, salesCost: 450, stock: 25, reorderPoint: 10, barcode: '1234567890123', unit: 'PCS', color: '#f97316' },
    { id: 2, code: 'PRD002', name: 'Beef Burger', category: 'Burgers', purchaseCost: 350, salesCost: 500, stock: 18, reorderPoint: 10, barcode: '1234567890124', unit: 'PCS', color: '#ef4444' },
    { id: 3, code: 'PRD003', name: 'Pizza Margherita', category: 'Pizza', purchaseCost: 600, salesCost: 850, stock: 12, reorderPoint: 5, barcode: '1234567890125', unit: 'PCS', color: '#eab308' },
    { id: 4, code: 'PRD004', name: 'Pepperoni Pizza', category: 'Pizza', purchaseCost: 700, salesCost: 950, stock: 8, reorderPoint: 5, barcode: '1234567890126', unit: 'PCS', color: '#ec4899' },
    { id: 5, code: 'PRD005', name: 'French Fries', category: 'Sides', purchaseCost: 100, salesCost: 200, stock: 50, reorderPoint: 20, barcode: '1234567890127', unit: 'PCS', color: '#eab308' },
    { id: 6, code: 'PRD006', name: 'Coca Cola 500ml', category: 'Drinks', purchaseCost: 60, salesCost: 100, stock: 100, reorderPoint: 30, barcode: '1234567890128', unit: 'PCS', color: '#ef4444' },
    { id: 7, code: 'PRD007', name: 'Sprite 500ml', category: 'Drinks', purchaseCost: 60, salesCost: 100, stock: 80, reorderPoint: 30, barcode: '1234567890129', unit: 'PCS', color: '#22c55e' },
    { id: 8, code: 'PRD008', name: 'Grilled Chicken', category: 'Main', purchaseCost: 450, salesCost: 650, stock: 15, reorderPoint: 8, barcode: '1234567890130', unit: 'PCS', color: '#f59e0b' },
];

const categories = ['All', 'Burgers', 'Pizza', 'Main', 'Sides', 'Drinks', 'Salads', 'Desserts'];

// Add/Edit Product Modal
const ProductModal = ({
    isOpen,
    onClose,
    product,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onSave: (product: Partial<Product>) => void;
}) => {
    const [formData, setFormData] = useState({
        code: product?.code || '',
        name: product?.name || '',
        category: product?.category || 'Burgers',
        purchaseCost: product?.purchaseCost || 0,
        salesCost: product?.salesCost || 0,
        stock: product?.stock || 0,
        reorderPoint: product?.reorderPoint || 10,
        barcode: product?.barcode || '',
        unit: product?.unit || 'PCS',
    });

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📦</span>
                        {product ? 'Edit Product' : 'Add New Product'}
                    </h2>
                    <button onClick={onClose} className="text-2xl hover:opacity-70">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Product Code */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Product Code</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                required
                            />
                        </div>

                        {/* Barcode */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Barcode</label>
                            <input
                                type="text"
                                value={formData.barcode}
                                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Product Name */}
                    <div>
                        <label className="text-sm font-medium text-gray-600 mb-1 block">Product Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Category */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Category</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            >
                                {categories.filter(c => c !== 'All').map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        {/* Unit */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Unit</label>
                            <select
                                value={formData.unit}
                                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            >
                                <option value="PCS">PCS</option>
                                <option value="KG">KG</option>
                                <option value="L">Liters</option>
                                <option value="BOX">Box</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Purchase Cost */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Purchase Cost (Ksh)</label>
                            <input
                                type="number"
                                value={formData.purchaseCost}
                                onChange={(e) => setFormData({ ...formData, purchaseCost: Number(e.target.value) })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                required
                            />
                        </div>

                        {/* Sales Cost */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Sales Cost (Ksh)</label>
                            <input
                                type="number"
                                value={formData.salesCost}
                                onChange={(e) => setFormData({ ...formData, salesCost: Number(e.target.value) })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Stock */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Current Stock</label>
                            <input
                                type="number"
                                value={formData.stock}
                                onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Reorder Point */}
                        <div>
                            <label className="text-sm font-medium text-gray-600 mb-1 block">Reorder Point</label>
                            <input
                                type="number"
                                value={formData.reorderPoint}
                                onChange={(e) => setFormData({ ...formData, reorderPoint: Number(e.target.value) })}
                                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Margin Display */}
                    <div className="p-4 bg-green-50 rounded-xl">
                        <div className="flex items-center justify-between">
                            <span className="text-green-700 font-medium">Profit Margin</span>
                            <span className="text-xl font-bold text-green-600">
                                Ksh {formData.salesCost - formData.purchaseCost} ({formData.purchaseCost > 0 ? Math.round(((formData.salesCost - formData.purchaseCost) / formData.purchaseCost) * 100) : 0}%)
                            </span>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <span>💾</span>
                            <span>{product ? 'Update' : 'Save'} Product</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>(sampleProducts);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Filter products
    const filteredProducts = products.filter(p => {
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.code.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleAddProduct = () => {
        setEditingProduct(null);
        setShowModal(true);
    };

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product);
        setShowModal(true);
    };

    const handleSaveProduct = (data: Partial<Product>) => {
        if (editingProduct) {
            setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...data } : p));
        } else {
            setProducts(prev => [...prev, { id: Date.now(), ...data, color: '#3b82f6' } as Product]);
        }
    };

    const handleDeleteProduct = (id: number) => {
        if (confirm('Are you sure you want to delete this product?')) {
            setProducts(prev => prev.filter(p => p.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>📦</span> Products
                    </h1>
                    <p className="text-gray-500">Manage your product inventory</p>
                </div>
                <button
                    onClick={handleAddProduct}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    <span>➕</span>
                    <span>Add Product</span>
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <span className="text-xl">📦</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600">Total Products</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{products.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <span className="text-xl">✅</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">In Stock</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{products.filter(p => p.stock > p.reorderPoint).length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center">
                            <span className="text-xl">⚠️</span>
                        </div>
                        <span className="text-sm font-medium text-yellow-600">Low Stock</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{products.filter(p => p.stock <= p.reorderPoint && p.stock > 0).length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <span className="text-xl">❌</span>
                        </div>
                        <span className="text-sm font-medium text-red-600">Out of Stock</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{products.filter(p => p.stock === 0).length}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search products by name or code..."
                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                        />
                    </div>

                    {/* Category Filter */}
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                    >
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>

                    {/* Export Button */}
                    <button className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        <span>📥</span>
                        <span className="font-medium text-gray-600">Export</span>
                    </button>
                </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Product</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Category</th>
                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600">Purchase</th>
                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600">Sales</th>
                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600">Margin</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Stock</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map(product => (
                            <tr key={product.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                                <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                                            style={{ backgroundColor: product.color }}
                                        >
                                            {product.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-800">{product.name}</p>
                                            <p className="text-xs text-gray-500">{product.code}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                                        {product.category}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-right font-medium text-gray-600">
                                    Ksh {product.purchaseCost.toLocaleString()}
                                </td>
                                <td className="py-4 px-4 text-right font-medium text-gray-800">
                                    Ksh {product.salesCost.toLocaleString()}
                                </td>
                                <td className="py-4 px-4 text-right">
                                    <span className="text-green-600 font-semibold">
                                        {Math.round(((product.salesCost - product.purchaseCost) / product.purchaseCost) * 100)}%
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-center">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${product.stock === 0
                                            ? 'bg-red-100 text-red-600'
                                            : product.stock <= product.reorderPoint
                                                ? 'bg-yellow-100 text-yellow-600'
                                                : 'bg-green-100 text-green-600'
                                        }`}>
                                        {product.stock} {product.unit}
                                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => handleEditProduct(product)}
                                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors"
                                            title="Edit"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => handleDeleteProduct(product.id)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Product Modal */}
            <ProductModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                product={editingProduct}
                onSave={handleSaveProduct}
            />
        </div>
    );
}
