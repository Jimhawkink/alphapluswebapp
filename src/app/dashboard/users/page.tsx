'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface User {
    user_id: number;
    user_code: string;
    user_name: string;
    name: string;
    user_type: string;
    email: string;
    phone: string;
    national_id: string;
    salary_type: 'Monthly' | 'Weekly';
    salary_amount: number;
    pin: string;
    active: boolean;
    is_super_admin: boolean;
    created_at: string;
}

interface UserRole {
    role_id: number;
    role_name: string;
    description: string;
}

const defaultRoles: UserRole[] = [
    { role_id: 1, role_name: 'Super Admin', description: 'Full system control' },
    { role_id: 2, role_name: 'Manager', description: 'General management' },
    { role_id: 3, role_name: 'Supervisor', description: 'User & access management' },
    { role_id: 4, role_name: 'Cashier', description: 'Sales & payments' },
    { role_id: 5, role_name: 'Waiter', description: 'Order taking' },
];

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');

    // Form state
    const [formData, setFormData] = useState({
        user_code: '',
        user_name: '',
        name: '',
        user_type: 'Cashier',
        email: '',
        phone: '',
        national_id: '',
        salary_type: 'Monthly' as 'Monthly' | 'Weekly',
        salary_amount: 0,
        password: '',
        pin: '',
        active: true,
    });

    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error loading users:', err);
            toast.error('Failed to load users');
        }
        setIsLoading(false);
    }, []);

    const generateUserCode = useCallback(async () => {
        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        const nextNum = (count || 0) + 1;
        return `US-${String(nextNum).padStart(3, '0')}`;
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const openAddModal = async () => {
        const newCode = await generateUserCode();
        setFormData({
            user_code: newCode,
            user_name: '',
            name: '',
            user_type: 'Cashier',
            email: '',
            phone: '',
            national_id: '',
            salary_type: 'Monthly',
            salary_amount: 0,
            password: '',
            pin: '',
            active: true,
        });
        setEditingUser(null);
        setShowModal(true);
    };

    const openEditModal = (user: User) => {
        // Block editing super admin
        if (user.is_super_admin) {
            toast.error('🔒 Super Admin account cannot be edited!');
            return;
        }

        setFormData({
            user_code: user.user_code,
            user_name: user.user_name,
            name: user.name,
            user_type: user.user_type,
            email: user.email,
            phone: user.phone,
            national_id: user.national_id,
            salary_type: user.salary_type,
            salary_amount: user.salary_amount,
            password: '',
            pin: user.pin || '',
            active: user.active,
        });
        setEditingUser(user);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.user_name || !formData.name) {
            toast.error('Username and Full Name are required');
            return;
        }

        if (!editingUser && !formData.password && formData.user_type !== 'Cashier') {
            toast.error('Password is required for new users');
            return;
        }

        if (formData.user_type === 'Cashier' && formData.pin && ![4, 6].includes(formData.pin.length)) {
            toast.error('PIN must be 4 or 6 digits');
            return;
        }

        try {
            if (editingUser) {
                // Update existing user
                const updateData: Record<string, unknown> = {
                    user_name: formData.user_name,
                    name: formData.name,
                    user_type: formData.user_type,
                    email: formData.email,
                    phone: formData.phone,
                    national_id: formData.national_id,
                    salary_type: formData.salary_type,
                    salary_amount: formData.salary_amount,
                    pin: formData.pin,
                    active: formData.active,
                };

                if (formData.password) {
                    updateData.password_hash = formData.password;
                }

                const { error } = await supabase
                    .from('users')
                    .update(updateData)
                    .eq('user_id', editingUser.user_id);

                if (error) throw error;
                toast.success('User updated successfully! ✅');
            } else {
                // Create new user - user_code will be set to null initially
                const { data, error } = await supabase
                    .from('users')
                    .insert([{
                        user_code: null, // Let database handle or update after insert
                        user_name: formData.user_name,
                        password_hash: formData.password || formData.pin,
                        name: formData.name,
                        user_type: formData.user_type,
                        email: formData.email || null,
                        phone: formData.phone || null,
                        national_id: formData.national_id || null,
                        salary_type: formData.salary_type,
                        salary_amount: formData.salary_amount || 0,
                        pin: formData.pin || null,
                        active: formData.active,
                        is_super_admin: false,
                    }])
                    .select()
                    .single();

                if (error) throw error;

                // Update user_code based on user_id
                if (data) {
                    const userCode = `US-${String(data.user_id).padStart(4, '0')}`;
                    await supabase
                        .from('users')
                        .update({ user_code: userCode })
                        .eq('user_id', data.user_id);
                }

                toast.success('User created successfully! 🎉');
            }

            setShowModal(false);
            loadUsers();
        } catch (err: any) {
            console.error('Error saving user:', err);
            const errorMsg = err?.message || err?.error_description || err?.hint || 'Unknown error';
            const errorCode = err?.code || '';
            toast.error(`Failed to save user: ${errorCode} ${errorMsg}`, { duration: 6000 });
        }
    };

    const toggleUserStatus = async (user: User) => {
        if (user.is_super_admin) {
            toast.error('Cannot deactivate Super Admin');
            return;
        }

        try {
            const { error } = await supabase
                .from('users')
                .update({ active: !user.active })
                .eq('user_id', user.user_id);

            if (error) throw error;
            toast.success(user.active ? 'User deactivated' : 'User activated');
            loadUsers();
        } catch (err) {
            console.error('Error toggling user status:', err);
            toast.error('Failed to update user status');
        }
    };

    const deleteUser = async (user: User) => {
        if (user.is_super_admin) {
            toast.error('Cannot delete Super Admin');
            return;
        }

        if (!confirm(`Are you sure you want to delete ${user.name}?`)) return;

        try {
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('user_id', user.user_id);

            if (error) throw error;
            toast.success('User deleted successfully');
            loadUsers();
        } catch (err) {
            console.error('Error deleting user:', err);
            toast.error('Failed to delete user');
        }
    };

    // Filter users
    const filteredUsers = users.filter(user => {
        const matchesSearch =
            user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.user_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.phone?.includes(searchQuery);

        const matchesRole = filterRole === 'All' || user.user_type === filterRole;
        const matchesStatus = filterStatus === 'All' ||
            (filterStatus === 'Active' && user.active) ||
            (filterStatus === 'Inactive' && !user.active);

        return matchesSearch && matchesRole && matchesStatus;
    });

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'Super Admin': return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white';
            case 'Manager': return 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white';
            case 'Supervisor': return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white';
            case 'Cashier': return 'bg-gradient-to-r from-emerald-500 to-green-500 text-white';
            case 'Waiter': return 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white';
            default: return 'bg-gray-500 text-white';
        }
    };

    const getRoleEmoji = (role: string) => {
        switch (role) {
            case 'Super Admin': return '👑';
            case 'Manager': return '💼';
            case 'Supervisor': return '🎯';
            case 'Cashier': return '💰';
            case 'Waiter': return '🍽️';
            default: return '👤';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
            {/* Header */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <span className="text-3xl">👥</span>
                            User Management
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Manage system users, roles, and permissions
                        </p>
                    </div>

                    <button
                        onClick={openAddModal}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-2xl shadow-lg shadow-blue-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                    >
                        <span className="text-xl">➕</span>
                        Add New User
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {defaultRoles.map((role) => {
                    const count = users.filter(u => u.user_type === role.role_name).length;
                    return (
                        <div
                            key={role.role_id}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer"
                            onClick={() => setFilterRole(role.role_name)}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${getRoleColor(role.role_name)}`}>
                                    {getRoleEmoji(role.role_name)}
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-800">{count}</p>
                                    <p className="text-xs text-gray-500">{role.role_name}s</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="🔍 Search users by name, username, code, or phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-5 py-3 pl-12 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
                    </div>

                    {/* Role Filter */}
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all cursor-pointer"
                    >
                        <option value="All">🏷️ All Roles</option>
                        {defaultRoles.map(role => (
                            <option key={role.role_id} value={role.role_name}>
                                {getRoleEmoji(role.role_name)} {role.role_name}
                            </option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all cursor-pointer"
                    >
                        <option value="All">📊 All Status</option>
                        <option value="Active">✅ Active</option>
                        <option value="Inactive">❌ Inactive</option>
                    </select>

                    {/* Refresh */}
                    <button
                        onClick={loadUsers}
                        className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all flex items-center gap-2"
                    >
                        <span className="text-lg">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                                <th className="px-4 py-4 text-left text-sm font-semibold">👤 User</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">📧 Contact</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold">🎭 Role</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold hidden lg:table-cell">💵 Salary</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">📊 Status</th>
                                <th className="px-4 py-4 text-center text-sm font-semibold">⚙️ Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-blue-400/30 border-t-blue-500 rounded-full animate-spin"></div>
                                            <span className="text-gray-500">Loading users...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-5xl">📭</span>
                                            <span className="text-gray-500">No users found</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.user_id} className="hover:bg-indigo-50/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${getRoleColor(user.user_type)}`}>
                                                    {user.name?.charAt(0).toUpperCase() || '?'}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-800 flex items-center gap-2">
                                                        {user.name}
                                                        {user.is_super_admin && <span title="Super Admin">👑</span>}
                                                    </p>
                                                    <p className="text-sm text-gray-500">@{user.user_name}</p>
                                                    <p className="text-xs text-indigo-600 font-mono">{user.user_code}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 hidden md:table-cell">
                                            <div className="space-y-1">
                                                <p className="text-sm text-gray-600 flex items-center gap-1">
                                                    <span>📧</span> {user.email || '-'}
                                                </p>
                                                <p className="text-sm text-gray-600 flex items-center gap-1">
                                                    <span>📱</span> {user.phone || '-'}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${getRoleColor(user.user_type)}`}>
                                                {getRoleEmoji(user.user_type)} {user.user_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 hidden lg:table-cell">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">
                                                    KES {user.salary_amount?.toLocaleString() || '0'}
                                                </p>
                                                <p className="text-xs text-gray-500">{user.salary_type || 'Monthly'}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <button
                                                onClick={() => toggleUserStatus(user)}
                                                disabled={user.is_super_admin}
                                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${user.active
                                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                    } ${user.is_super_admin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                            >
                                                {user.active ? '✅ Active' : '❌ Inactive'}
                                            </button>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                {user.is_super_admin ? (
                                                    <span className="px-3 py-2 bg-purple-100 text-purple-700 rounded-xl text-xs font-semibold">
                                                        🔒 Protected
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => openEditModal(user)}
                                                            className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl transition-all hover:scale-110"
                                                            title="Edit User"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => deleteUser(user)}
                                                            className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all hover:scale-110"
                                                            title="Delete User"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </>
                                                )}
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
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingUser ? '✏️ Edit User' : '➕ Add New User'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* User Code & Username */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🆔 User Code
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.user_code}
                                        disabled
                                        className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-600 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        👤 Username <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.user_name}
                                        onChange={(e) => setFormData({ ...formData, user_name: e.target.value })}
                                        placeholder="Enter username"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Full Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📝 Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Enter full name"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    required
                                />
                            </div>

                            {/* Role & National ID */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🎭 User Role <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.user_type}
                                        onChange={(e) => setFormData({ ...formData, user_type: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 cursor-pointer"
                                    >
                                        <option value="Manager">💼 Manager</option>
                                        <option value="Supervisor">🎯 Supervisor</option>
                                        <option value="Cashier">💰 Cashier</option>
                                        <option value="Waiter">🍽️ Waiter / Waitress</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🪪 National ID
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.national_id}
                                        onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                                        placeholder="Enter national ID"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>
                            </div>

                            {/* Email & Phone */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📧 Working Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="user@company.com"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        📱 Mobile Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="0712345678"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>
                            </div>

                            {/* Salary Type & Amount */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        💰 Salary Type
                                    </label>
                                    <select
                                        value={formData.salary_type}
                                        onChange={(e) => setFormData({ ...formData, salary_type: e.target.value as 'Monthly' | 'Weekly' })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 cursor-pointer"
                                    >
                                        <option value="Monthly">📅 Monthly</option>
                                        <option value="Weekly">📆 Weekly</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        💵 Salary Amount (KES)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.salary_amount}
                                        onChange={(e) => setFormData({ ...formData, salary_amount: parseFloat(e.target.value) || 0 })}
                                        placeholder="0.00"
                                        min="0"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>
                            </div>

                            {/* Password & PIN */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🔐 Password {!editingUser && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        🔢 PIN (4 or 6 digits) {formData.user_type === 'Cashier' && <span className="text-blue-500">*</span>}
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.pin}
                                        onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                        placeholder="For cashiers"
                                        maxLength={6}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    />
                                    {formData.pin && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {formData.pin.length === 4 || formData.pin.length === 6 ? '✅' : '⚠️'} {formData.pin.length} digits entered
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Active Status */}
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="font-semibold text-gray-700">
                                        {formData.active ? '✅ Active' : '❌ Inactive'} - User can access the system
                                    </span>
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col md:flex-row gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-300/40 transition-all flex items-center justify-center gap-2"
                                >
                                    <span>{editingUser ? '💾' : '➕'}</span>
                                    {editingUser ? 'Update User' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
