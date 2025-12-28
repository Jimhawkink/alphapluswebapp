'use client';

import { useState } from 'react';

interface Supplier {
    id: number;
    supplierId: string;
    name: string;
    contactNo: string;
    email: string;
    address: string;
    balance: number;
}

const sampleSuppliers: Supplier[] = [
    { id: 1, supplierId: 'SUP001', name: 'ABC Distributors', contactNo: '0712345678', email: 'abc@email.com', address: 'Nairobi, Kenya', balance: 25000 },
    { id: 2, supplierId: 'SUP002', name: 'Fresh Foods Ltd', contactNo: '0723456789', email: 'fresh@email.com', address: 'Mombasa, Kenya', balance: 0 },
    { id: 3, supplierId: 'SUP003', name: 'Quick Supplies Co.', contactNo: '0734567890', email: 'quick@email.com', address: 'Kisumu, Kenya', balance: 15000 },
    { id: 4, supplierId: 'SUP004', name: 'Global Trading', contactNo: '0745678901', email: 'global@email.com', address: 'Nakuru, Kenya', balance: 8500 },
];

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<Supplier[]>(sampleSuppliers);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [formData, setFormData] = useState({
        supplierId: '',
        name: '',
        contactNo: '',
        email: '',
        address: '',
    });

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.supplierId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAdd = () => {
        setEditingSupplier(null);
        setFormData({ supplierId: `SUP${String(suppliers.length + 1).padStart(3, '0')}`, name: '', contactNo: '', email: '', address: '' });
        setShowModal(true);
    };

    const handleEdit = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            supplierId: supplier.supplierId,
            name: supplier.name,
            contactNo: supplier.contactNo,
            email: supplier.email,
            address: supplier.address,
        });
        setShowModal(true);
    };

    const handleSave = () => {
        if (!formData.name.trim()) return;

        if (editingSupplier) {
            setSuppliers(prev => prev.map(s =>
                s.id === editingSupplier.id ? { ...s, ...formData } : s
            ));
        } else {
            setSuppliers(prev => [...prev, {
                id: Date.now(),
                ...formData,
                balance: 0,
            }]);
        }
        setShowModal(false);
    };

    const handleDelete = (id: number) => {
        if (confirm('Are you sure you want to delete this supplier?')) {
            setSuppliers(prev => prev.filter(s => s.id !== id));
        }
    };

    const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>🏢</span> Suppliers
                    </h1>
                    <p className="text-gray-500">Manage your product suppliers</p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    <span>➕</span>
                    <span>Add Supplier</span>
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <span className="text-xl">🏢</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600">Total Suppliers</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{suppliers.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <span className="text-xl">✅</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">Active</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{suppliers.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <span className="text-xl">💰</span>
                        </div>
                        <span className="text-sm font-medium text-red-600">Total Payables</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">Ksh {totalBalance.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                            <span className="text-xl">⚠️</span>
                        </div>
                        <span className="text-sm font-medium text-orange-600">With Balance</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{suppliers.filter(s => s.balance > 0).length}</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search suppliers..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                    />
                </div>
            </div>

            {/* Suppliers Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Supplier ID</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Name</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Contact</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Email</th>
                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600">Balance</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSuppliers.map(supplier => (
                            <tr key={supplier.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                                <td className="py-4 px-4">
                                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                                        {supplier.supplierId}
                                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div>
                                        <p className="font-medium text-gray-800">{supplier.name}</p>
                                        <p className="text-xs text-gray-500">{supplier.address}</p>
                                    </div>
                                </td>
                                <td className="py-4 px-4 text-gray-600">{supplier.contactNo}</td>
                                <td className="py-4 px-4 text-gray-600">{supplier.email}</td>
                                <td className="py-4 px-4 text-right">
                                    <span className={`font-semibold ${supplier.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        Ksh {supplier.balance.toLocaleString()}
                                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => handleEdit(supplier)}
                                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => handleDelete(supplier.id)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
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

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <span>🏢</span>
                                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl hover:opacity-70">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Supplier ID</label>
                                    <input
                                        type="text"
                                        value={formData.supplierId}
                                        onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Contact No</label>
                                    <input
                                        type="text"
                                        value={formData.contactNo}
                                        onChange={(e) => setFormData({ ...formData, contactNo: e.target.value })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Supplier Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Address</label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    rows={2}
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg"
                                >
                                    {editingSupplier ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
