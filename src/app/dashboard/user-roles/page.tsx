'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface UserRole {
    role_id: number;
    role_name: string;
    description: string;
    can_view: boolean;
    can_create: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_make_sales: boolean;
    can_receive_payments: boolean;
    can_view_reports: boolean;
    can_manage_users: boolean;
    can_manage_products: boolean;
    can_manage_inventory: boolean;
    can_manage_settings: boolean;
    is_super_admin: boolean;
    created_at: string;
}

const defaultRoles: Partial<UserRole>[] = [
    {
        role_name: 'Super Admin',
        description: 'Full system control - Cannot be modified',
        can_view: true,
        can_create: true,
        can_update: true,
        can_delete: true,
        can_make_sales: true,
        can_receive_payments: true,
        can_view_reports: true,
        can_manage_users: true,
        can_manage_products: true,
        can_manage_inventory: true,
        can_manage_settings: true,
        is_super_admin: true,
    },
    {
        role_name: 'Manager',
        description: 'General management functions',
        can_view: true,
        can_create: true,
        can_update: true,
        can_delete: false,
        can_make_sales: true,
        can_receive_payments: true,
        can_view_reports: true,
        can_manage_users: false,
        can_manage_products: true,
        can_manage_inventory: true,
        can_manage_settings: false,
        is_super_admin: false,
    },
    {
        role_name: 'Supervisor',
        description: 'User management & access control',
        can_view: true,
        can_create: true,
        can_update: true,
        can_delete: false,
        can_make_sales: true,
        can_receive_payments: true,
        can_view_reports: true,
        can_manage_users: true,
        can_manage_products: false,
        can_manage_inventory: false,
        can_manage_settings: false,
        is_super_admin: false,
    },
    {
        role_name: 'Cashier',
        description: 'Sales and payment processing only',
        can_view: true,
        can_create: false,
        can_update: false,
        can_delete: false,
        can_make_sales: true,
        can_receive_payments: true,
        can_view_reports: false,
        can_manage_users: false,
        can_manage_products: false,
        can_manage_inventory: false,
        can_manage_settings: false,
        is_super_admin: false,
    },
    {
        role_name: 'Waiter',
        description: 'Order taking only',
        can_view: true,
        can_create: false,
        can_update: false,
        can_delete: false,
        can_make_sales: true,
        can_receive_payments: false,
        can_view_reports: false,
        can_manage_users: false,
        can_manage_products: false,
        can_manage_inventory: false,
        can_manage_settings: false,
        is_super_admin: false,
    },
];

export default function UserRolesPage() {
    const [roles, setRoles] = useState<UserRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRole, setEditingRole] = useState<UserRole | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Partial<UserRole>>({
        role_name: '',
        description: '',
        can_view: true,
        can_create: false,
        can_update: false,
        can_delete: false,
        can_make_sales: false,
        can_receive_payments: false,
        can_view_reports: false,
        can_manage_users: false,
        can_manage_products: false,
        can_manage_inventory: false,
        can_manage_settings: false,
        is_super_admin: false,
    });

    const loadRoles = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('user_roles')
                .select('*')
                .order('role_id');

            if (error) throw error;

            if (data && data.length > 0) {
                setRoles(data);
            } else {
                // Initialize with default roles
                setRoles(defaultRoles as UserRole[]);
            }
        } catch (err) {
            console.error('Error loading roles:', err);
            // Use default roles if table doesn't exist yet
            setRoles(defaultRoles as UserRole[]);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadRoles();
    }, [loadRoles]);

    const openEditModal = (role: UserRole) => {
        if (role.is_super_admin) {
            toast.error('Super Admin role cannot be modified');
            return;
        }
        setFormData({ ...role });
        setEditingRole(role);
        setShowModal(true);
    };

    const openAddModal = () => {
        setFormData({
            role_name: '',
            description: '',
            can_view: true,
            can_create: false,
            can_update: false,
            can_delete: false,
            can_make_sales: false,
            can_receive_payments: false,
            can_view_reports: false,
            can_manage_users: false,
            can_manage_products: false,
            can_manage_inventory: false,
            can_manage_settings: false,
            is_super_admin: false,
        });
        setEditingRole(null);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.role_name) {
            toast.error('Role name is required');
            return;
        }

        setIsSaving(true);

        try {
            if (editingRole) {
                const { error } = await supabase
                    .from('user_roles')
                    .update(formData)
                    .eq('role_id', editingRole.role_id);

                if (error) throw error;
                toast.success('Role updated successfully! ✅');
            } else {
                const { error } = await supabase
                    .from('user_roles')
                    .insert([formData]);

                if (error) throw error;
                toast.success('Role created successfully! 🎉');
            }

            setShowModal(false);
            loadRoles();
        } catch (err) {
            console.error('Error saving role:', err);
            toast.error('Failed to save role');
        }

        setIsSaving(false);
    };

    const deleteRole = async (role: UserRole) => {
        if (role.is_super_admin) {
            toast.error('Cannot delete Super Admin role');
            return;
        }

        if (!confirm(`Are you sure you want to delete the "${role.role_name}" role?`)) return;

        try {
            const { error } = await supabase
                .from('user_roles')
                .delete()
                .eq('role_id', role.role_id);

            if (error) throw error;
            toast.success('Role deleted');
            loadRoles();
        } catch (err) {
            console.error('Error deleting role:', err);
            toast.error('Failed to delete role');
        }
    };

    const getRoleColor = (roleName: string) => {
        switch (roleName) {
            case 'Super Admin': return 'from-purple-600 to-pink-600';
            case 'Manager': return 'from-blue-600 to-cyan-600';
            case 'Supervisor': return 'from-amber-500 to-orange-500';
            case 'Cashier': return 'from-emerald-500 to-green-500';
            case 'Waiter': return 'from-indigo-500 to-blue-500';
            default: return 'from-gray-500 to-gray-600';
        }
    };

    const getRoleEmoji = (roleName: string) => {
        switch (roleName) {
            case 'Super Admin': return '👑';
            case 'Manager': return '💼';
            case 'Supervisor': return '🎯';
            case 'Cashier': return '💰';
            case 'Waiter': return '🍽️';
            default: return '👤';
        }
    };

    const permissionsList = [
        { key: 'can_view', label: 'View Data', emoji: '👁️', description: 'View system data' },
        { key: 'can_create', label: 'Create', emoji: '➕', description: 'Create new records' },
        { key: 'can_update', label: 'Update', emoji: '✏️', description: 'Edit existing records' },
        { key: 'can_delete', label: 'Delete', emoji: '🗑️', description: 'Delete records' },
        { key: 'can_make_sales', label: 'Make Sales', emoji: '🛒', description: 'Process sales transactions' },
        { key: 'can_receive_payments', label: 'Receive Payments', emoji: '💳', description: 'Accept payments' },
        { key: 'can_view_reports', label: 'View Reports', emoji: '📊', description: 'Access reports' },
        { key: 'can_manage_users', label: 'Manage Users', emoji: '👥', description: 'User management' },
        { key: 'can_manage_products', label: 'Manage Products', emoji: '📦', description: 'Product management' },
        { key: 'can_manage_inventory', label: 'Manage Inventory', emoji: '🏪', description: 'Inventory control' },
        { key: 'can_manage_settings', label: 'Manage Settings', emoji: '⚙️', description: 'System settings' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
            {/* Header */}
            <div className="mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <span className="text-3xl">🛡️</span>
                            User Roles & Permissions
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Define roles and control access to system features
                        </p>
                    </div>

                    <button
                        onClick={openAddModal}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-2xl shadow-lg shadow-blue-300/40 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
                    >
                        <span className="text-xl">➕</span>
                        Add Custom Role
                    </button>
                </div>
            </div>

            {/* Info Card */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-5 mb-6 text-white shadow-lg shadow-indigo-500/20">
                <div className="flex items-start gap-4">
                    <span className="text-4xl">💡</span>
                    <div>
                        <h3 className="font-bold text-lg mb-1">Role-Based Access Control (RBAC)</h3>
                        <p className="text-blue-100 text-sm">
                            Each role defines what users can do in the system. Super Admin has full control,
                            while other roles have specific permissions. Users inherit permissions from their assigned role.
                        </p>
                    </div>
                </div>
            </div>

            {/* Roles Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-400/30 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-gray-500">Loading roles...</span>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {roles.map((role, index) => (
                        <div
                            key={role.role_id || index}
                            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                        >
                            {/* Role Header */}
                            <div className={`bg-gradient-to-r ${getRoleColor(role.role_name)} px-5 py-4 text-white`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl">{getRoleEmoji(role.role_name)}</span>
                                        <div>
                                            <h3 className="font-bold text-lg flex items-center gap-2">
                                                {role.role_name}
                                                {role.is_super_admin && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">PROTECTED</span>}
                                            </h3>
                                            <p className="text-white/80 text-xs">{role.description}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Permissions Grid */}
                            <div className="p-5">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <span>🔐</span> Permissions
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {permissionsList.map((perm) => (
                                        <div
                                            key={perm.key}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${role[perm.key as keyof UserRole]
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-gray-100 text-gray-400'
                                                }`}
                                        >
                                            <span>{role[perm.key as keyof UserRole] ? '✅' : '❌'}</span>
                                            <span>{perm.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="px-5 pb-5">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openEditModal(role)}
                                        disabled={role.is_super_admin}
                                        className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${role.is_super_admin
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                            }`}
                                    >
                                        ✏️ Edit
                                    </button>
                                    <button
                                        onClick={() => deleteRole(role)}
                                        disabled={role.is_super_admin}
                                        className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${role.is_super_admin
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-red-100 text-red-600 hover:bg-red-200'
                                            }`}
                                    >
                                        🗑️ Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Permission Matrix Table */}
            <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4 text-white">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <span>📋</span> Permission Matrix
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">Quick overview of all role permissions</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Permission</th>
                                {roles.map((role, idx) => (
                                    <th key={idx} className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                                        <div className="flex flex-col items-center gap-1">
                                            <span>{getRoleEmoji(role.role_name)}</span>
                                            <span className="text-xs">{role.role_name}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {permissionsList.map((perm) => (
                                <tr key={perm.key} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <span>{perm.emoji}</span>
                                        {perm.label}
                                    </td>
                                    {roles.map((role, idx) => (
                                        <td key={idx} className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${role[perm.key as keyof UserRole]
                                                ? 'bg-emerald-100 text-emerald-600'
                                                : 'bg-red-100 text-red-600'
                                                }`}>
                                                {role[perm.key as keyof UserRole] ? '✓' : '✕'}
                                            </span>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-5 text-white sticky top-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {editingRole ? '✏️ Edit Role' : '➕ Add Custom Role'}
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
                            {/* Role Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    🏷️ Role Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.role_name || ''}
                                    onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
                                    placeholder="e.g., Senior Cashier"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20"
                                    required
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    📝 Description
                                </label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Brief description of this role"
                                    rows={2}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 resize-none"
                                />
                            </div>

                            {/* Permissions */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3">
                                    🔐 Permissions
                                </label>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {permissionsList.map((perm) => (
                                        <label
                                            key={perm.key}
                                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${formData[perm.key as keyof typeof formData]
                                                ? 'bg-emerald-50 border-emerald-200'
                                                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{perm.emoji}</span>
                                                <div>
                                                    <p className="font-medium text-gray-800">{perm.label}</p>
                                                    <p className="text-xs text-gray-500">{perm.description}</p>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={!!formData[perm.key as keyof typeof formData]}
                                                onChange={(e) => setFormData({ ...formData, [perm.key]: e.target.checked })}
                                                className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                        </label>
                                    ))}
                                </div>
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
                                    disabled={isSaving}
                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingRole ? '💾' : '➕'}</span>
                                            {editingRole ? 'Update Role' : 'Create Role'}
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
