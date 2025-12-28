'use client';

import { useState } from 'react';

interface User {
    id: number;
    userId: string;
    name: string;
    userType: string;
    contactNo: string;
    email: string;
    active: boolean;
    joiningDate: string;
}

const sampleUsers: User[] = [
    { id: 1, userId: 'admin', name: 'Admin User', userType: 'Admin', contactNo: '0712345678', email: 'admin@alphaplus.com', active: true, joiningDate: '2024-01-01' },
    { id: 2, userId: 'cashier1', name: 'John Kamau', userType: 'Cashier', contactNo: '0723456789', email: 'john@alphaplus.com', active: true, joiningDate: '2024-03-15' },
    { id: 3, userId: 'cashier2', name: 'Mary Wanjiku', userType: 'Cashier', contactNo: '0734567890', email: 'mary@alphaplus.com', active: true, joiningDate: '2024-05-20' },
    { id: 4, userId: 'manager1', name: 'Peter Ochieng', userType: 'Manager', contactNo: '0745678901', email: 'peter@alphaplus.com', active: true, joiningDate: '2024-02-10' },
    { id: 5, userId: 'cashier3', name: 'Jane Muthoni', userType: 'Cashier', contactNo: '0756789012', email: 'jane@alphaplus.com', active: false, joiningDate: '2024-04-05' },
];

const userTypes = ['Admin', 'Manager', 'Cashier', 'Supervisor'];

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>(sampleUsers);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({
        userId: '',
        name: '',
        userType: 'Cashier',
        contactNo: '',
        email: '',
        password: '',
    });

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.userId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAdd = () => {
        setEditingUser(null);
        setFormData({ userId: '', name: '', userType: 'Cashier', contactNo: '', email: '', password: '' });
        setShowModal(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({
            userId: user.userId,
            name: user.name,
            userType: user.userType,
            contactNo: user.contactNo,
            email: user.email,
            password: '',
        });
        setShowModal(true);
    };

    const handleSave = () => {
        if (!formData.userId.trim() || !formData.name.trim()) return;

        if (editingUser) {
            setUsers(prev => prev.map(u =>
                u.id === editingUser.id ? { ...u, ...formData } : u
            ));
        } else {
            setUsers(prev => [...prev, {
                id: Date.now(),
                ...formData,
                active: true,
                joiningDate: new Date().toISOString().split('T')[0],
            }]);
        }
        setShowModal(false);
    };

    const toggleActive = (id: number) => {
        setUsers(prev => prev.map(u =>
            u.id === id ? { ...u, active: !u.active } : u
        ));
    };

    const handleDelete = (id: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            setUsers(prev => prev.filter(u => u.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span>👥</span> Users
                    </h1>
                    <p className="text-gray-500">Manage system users and permissions</p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                    <span>➕</span>
                    <span>Add User</span>
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <span className="text-xl">👥</span>
                        </div>
                        <span className="text-sm font-medium text-blue-600">Total Users</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{users.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <span className="text-xl">✅</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">Active</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.active).length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                            <span className="text-xl">👑</span>
                        </div>
                        <span className="text-sm font-medium text-purple-600">Admins</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.userType === 'Admin').length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                            <span className="text-xl">💼</span>
                        </div>
                        <span className="text-sm font-medium text-orange-600">Cashiers</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.userType === 'Cashier').length}</p>
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
                        placeholder="Search users..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">User</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Role</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Contact</th>
                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-600">Joined</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Status</th>
                            <th className="text-center py-4 px-4 text-sm font-semibold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                                <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${user.userType === 'Admin' ? 'bg-purple-500' :
                                                user.userType === 'Manager' ? 'bg-blue-500' :
                                                    'bg-green-500'
                                            }`}>
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-800">{user.name}</p>
                                            <p className="text-xs text-gray-500">@{user.userId}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${user.userType === 'Admin' ? 'bg-purple-100 text-purple-700' :
                                            user.userType === 'Manager' ? 'bg-blue-100 text-blue-700' :
                                                user.userType === 'Supervisor' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-green-100 text-green-700'
                                        }`}>
                                        {user.userType}
                                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div>
                                        <p className="text-gray-800">{user.contactNo}</p>
                                        <p className="text-xs text-gray-500">{user.email}</p>
                                    </div>
                                </td>
                                <td className="py-4 px-4 text-gray-600">{user.joiningDate}</td>
                                <td className="py-4 px-4 text-center">
                                    <button
                                        onClick={() => toggleActive(user.id)}
                                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${user.active
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                                            }`}
                                    >
                                        {user.active ? '✅ Active' : '❌ Inactive'}
                                    </button>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-500"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => handleDelete(user.id)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-red-500"
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
                                <span>👤</span>
                                {editingUser ? 'Edit User' : 'Add New User'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-2xl hover:opacity-70">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">User ID</label>
                                    <input
                                        type="text"
                                        value={formData.userId}
                                        onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                        disabled={!!editingUser}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">User Type</label>
                                    <select
                                        value={formData.userType}
                                        onChange={(e) => setFormData({ ...formData, userType: e.target.value })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                    >
                                        {userTypes.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">Full Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-1 block">Contact No</label>
                                    <input
                                        type="text"
                                        value={formData.contactNo}
                                        onChange={(e) => setFormData({ ...formData, contactNo: e.target.value })}
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
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">
                                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
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
                                    {editingUser ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
