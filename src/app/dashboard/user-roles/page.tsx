'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    HotelRole,
    PermissionDefinition,
    PERMISSION_MODULES,
    HOTEL_DEPARTMENTS,
    PERMISSIONS_LIST,
    PRESET_HOTEL_ROLES,
    getLocalHotelRoles,
    saveLocalHotelRoles,
    getRoleMeta,
} from '@/lib/hotelRoles';

export default function UserRolesPage() {
    const router = useRouter();

    const [roles, setRoles] = useState<HotelRole[]>(PRESET_HOTEL_ROLES);
    const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'cards' | 'matrix'>('cards');
    const [selectedDepartment, setSelectedDepartment] = useState('All');
    const [matrixModuleFilter, setMatrixModuleFilter] = useState('all');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingRole, setEditingRole] = useState<HotelRole | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState<HotelRole>({
        role_id: '',
        role_name: '',
        department: 'Food & Beverage',
        description: '',
        color_gradient: 'from-blue-600 to-indigo-600',
        badge_color: 'bg-blue-100 text-blue-800 border-blue-200',
        emoji: '🎯',
        is_system: false,
        permissions: {},
    });

    // Load roles and staff counts
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Load roles from local storage / presets
            const loadedRoles = getLocalHotelRoles();
            setRoles(loadedRoles);

            // 2. Fetch staff distribution across roles from Supabase
            const { data: usersData, error } = await supabase
                .from('users')
                .select('user_type, active');

            if (!error && usersData) {
                const counts: Record<string, number> = {};
                usersData.forEach((u: { user_type: string; active: boolean }) => {
                    const roleName = u.user_type || 'Unassigned';
                    counts[roleName] = (counts[roleName] || 0) + 1;
                });
                setStaffCounts(counts);
            }
        } catch (err) {
            console.error('Error loading roles data:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Open Add Role Modal
    const openAddModal = () => {
        setFormData({
            role_id: `custom-role-${Date.now()}`,
            role_name: '',
            department: 'Food & Beverage',
            description: '',
            color_gradient: 'from-blue-500 to-indigo-600',
            badge_color: 'bg-blue-100 text-blue-800 border-blue-200',
            emoji: '🏷️',
            is_system: false,
            permissions: {
                pos_access: true,
                take_orders: true,
            },
        });
        setEditingRole(null);
        setShowModal(true);
    };

    // Open Edit Role Modal
    const openEditModal = (role: HotelRole) => {
        if (role.is_super_admin) {
            toast.error('🔒 Super Admin role is protected and cannot be edited.');
            return;
        }

        setFormData({
            ...role,
            permissions: { ...(role.permissions || {}) },
        });
        setEditingRole(role);
        setShowModal(true);
    };

    // Save Role (Insert or Update)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.role_name.trim()) {
            toast.error('Role name is required.');
            return;
        }

        setIsSaving(true);

        try {
            let updatedRoles: HotelRole[];
            if (editingRole) {
                // Update
                updatedRoles = roles.map(r => r.role_id === editingRole.role_id ? {
                    ...formData,
                    role_id: editingRole.role_id,
                    role_name: formData.role_name.trim(),
                    updated_at: new Date().toISOString(),
                } : r);
                toast.success(`Role "${formData.role_name}" updated successfully! ✅`);
            } else {
                // Check if name already exists
                if (roles.some(r => r.role_name.toLowerCase() === formData.role_name.trim().toLowerCase())) {
                    toast.error(`A role named "${formData.role_name}" already exists.`);
                    setIsSaving(false);
                    return;
                }

                const newRole: HotelRole = {
                    ...formData,
                    role_id: `role-${Date.now()}`,
                    role_name: formData.role_name.trim(),
                    created_at: new Date().toISOString(),
                };
                updatedRoles = [...roles, newRole];
                toast.success(`Role "${newRole.role_name}" created successfully! 🎉`);
            }

            // Save to localStorage and notify app
            saveLocalHotelRoles(updatedRoles);
            setRoles(updatedRoles);
            setShowModal(false);
        } catch (err: any) {
            console.error('Error saving role:', err);
            toast.error('Failed to save role.');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete Role
    const handleDeleteRole = (role: HotelRole) => {
        if (role.is_super_admin || role.role_name === 'Super Admin') {
            toast.error('Cannot delete the Super Admin system role.');
            return;
        }

        const assignedStaff = staffCounts[role.role_name] || 0;
        if (assignedStaff > 0) {
            toast.error(`Cannot delete role "${role.role_name}" because ${assignedStaff} staff members are currently assigned to it. Reassign staff first.`);
            return;
        }

        if (!confirm(`Are you sure you want to permanently delete the "${role.role_name}" role?`)) {
            return;
        }

        const updated = roles.filter(r => r.role_id !== role.role_id);
        saveLocalHotelRoles(updated);
        setRoles(updated);
        toast.success(`Role "${role.role_name}" deleted.`);
    };

    // Reset to Standard Hotel Roles
    const handleResetDefaults = () => {
        if (!confirm('Reset all roles to standard Kenya hotel presets? Any custom roles will be refreshed.')) {
            return;
        }
        saveLocalHotelRoles(PRESET_HOTEL_ROLES);
        setRoles(PRESET_HOTEL_ROLES);
        toast.success('Restored default Kenyan hotel roles!');
    };

    // Quick Permission Templates
    const applyPermissionTemplate = (type: 'all' | 'none' | 'pos' | 'supervisor') => {
        const nextPerms: Record<string, boolean> = {};

        if (type === 'all') {
            PERMISSIONS_LIST.forEach(p => { nextPerms[p.key] = true; });
        } else if (type === 'none') {
            PERMISSIONS_LIST.forEach(p => { nextPerms[p.key] = false; });
        } else if (type === 'pos') {
            PERMISSIONS_LIST.forEach(p => {
                nextPerms[p.key] = ['pos_access', 'take_orders', 'receive_payments', 'open_close_shifts'].includes(p.key);
            });
        } else if (type === 'supervisor') {
            PERMISSIONS_LIST.forEach(p => {
                nextPerms[p.key] = p.module === 'pos' || p.key === 'view_financial_reports' || p.key === 'cash_drops_expenses';
            });
        }

        setFormData(prev => ({ ...prev, permissions: nextPerms }));
        toast.success(`Applied template: ${type.toUpperCase()}`);
    };

    // Filtered Roles
    const filteredRoles = useMemo(() => {
        return roles.filter(r => {
            if (selectedDepartment === 'All') return true;
            return r.department.toLowerCase() === selectedDepartment.toLowerCase();
        });
    }, [roles, selectedDepartment]);

    // Permissions grouped by module
    const groupedPermissions = useMemo(() => {
        const map: Record<string, PermissionDefinition[]> = {};
        PERMISSION_MODULES.forEach(m => {
            map[m.id] = PERMISSIONS_LIST.filter(p => p.module === m.id);
        });
        return map;
    }, []);

    return (
        <div className="min-h-screen bg-slate-50/70 p-4 md:p-8 text-slate-800">
            {/* Top Bar / Branding */}
            <div className="mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="text-3xl md:text-4xl">🛡️</span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                                        Hotel Roles & Access Control (RBAC)
                                    </h1>
                                    <span className="hidden sm:inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
                                        SECURITY MATRIX
                                    </span>
                                </div>
                                <p className="text-slate-500 text-sm mt-1">
                                    Define hotel permissions across POS terminals, PMS room folios, kitchen KDS, stock registers & financial closing.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                            href="/dashboard/users"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-all text-sm"
                            title="Back to Personnel Directory"
                        >
                            <span className="text-lg">👥</span>
                            <span>Staff Directory</span>
                        </Link>

                        <button
                            onClick={handleResetDefaults}
                            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 font-medium rounded-2xl border border-slate-200 shadow-sm transition-all text-sm"
                            title="Reset Standard Roles"
                        >
                            <span>🔄</span>
                            <span className="hidden sm:inline">Reset Defaults</span>
                        </button>

                        <button
                            onClick={openAddModal}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-md shadow-blue-500/20 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all text-sm"
                        >
                            <span className="text-lg">➕</span>
                            <span>Create Custom Role</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Executive Overview Banner (Clean Bright White) */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl flex-shrink-0">
                        💡
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm md:text-base">
                            Role-Based Authorization System
                        </h3>
                        <p className="text-slate-500 text-xs mt-0.5">
                            Hotel staff inherit permissions strictly from their assigned role. Changes made here apply instantly to all assigned personnel.
                        </p>
                    </div>
                </div>

                {/* View Switcher Tabs */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl self-stretch md:self-auto justify-center">
                    <button
                        onClick={() => setActiveTab('cards')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'cards'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        <span>📇</span>
                        <span>Roles Cards ({roles.length})</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('matrix')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'matrix'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        <span>📋</span>
                        <span>Permission Matrix</span>
                    </button>
                </div>
            </div>

            {/* Department Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
                <button
                    onClick={() => setSelectedDepartment('All')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${selectedDepartment === 'All'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    🏢 All Departments ({roles.length})
                </button>
                {HOTEL_DEPARTMENTS.filter(d => d.id !== 'all').map(dept => {
                    const count = roles.filter(r => r.department === dept.name).length;
                    const isActive = selectedDepartment === dept.name;
                    return (
                        <button
                            key={dept.id}
                            onClick={() => setSelectedDepartment(dept.name)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${isActive
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            <span>{dept.icon}</span>
                            <span>{dept.name}</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VIEW 1: ROLES CARDS GRID                                        */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredRoles.map((role) => {
                        const assignedStaffCount = staffCounts[role.role_name] || 0;
                        const permsCount = Object.values(role.permissions || {}).filter(Boolean).length;
                        const totalPerms = PERMISSIONS_LIST.length;

                        return (
                            <div
                                key={role.role_id}
                                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between hover:-translate-y-0.5"
                            >
                                {/* Role Header Banner */}
                                <div className={`p-5 bg-gradient-to-r ${role.color_gradient} text-white`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-3xl">{role.emoji}</span>
                                            <div>
                                                <h3 className="font-bold text-lg flex items-center gap-2 leading-tight">
                                                    {role.role_name}
                                                </h3>
                                                <p className="text-white/80 text-xs mt-0.5 font-medium">
                                                    {role.department}
                                                </p>
                                            </div>
                                        </div>

                                        {role.is_super_admin && (
                                            <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-[10px] font-bold tracking-wider uppercase border border-white/30">
                                                PROTECTED
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Body Description & Staff Metrics */}
                                <div className="p-5 flex-1 space-y-4">
                                    <p className="text-slate-600 text-xs line-clamp-2 leading-relaxed">
                                        {role.description || 'Custom hotel role defining specific system permissions.'}
                                    </p>

                                    {/* Linked Staff Metric Box */}
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                        <div>
                                            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Assigned Staff</span>
                                            <span className="text-lg font-bold text-slate-900">
                                                {assignedStaffCount} Personnel
                                            </span>
                                        </div>

                                        {/* Direct Link to Staff page filtered by this role */}
                                        <Link
                                            href={`/dashboard/users?role=${encodeURIComponent(role.role_name)}`}
                                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-600 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                                            title="View staff with this role"
                                        >
                                            <span>👥 View Staff</span>
                                            <span>→</span>
                                        </Link>
                                    </div>

                                    {/* Permission Coverage Stats */}
                                    <div>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="font-semibold text-slate-700">Access Coverage</span>
                                            <span className="font-bold text-indigo-700">{permsCount} / {totalPerms} rights</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${role.color_gradient} rounded-full transition-all duration-500`}
                                                style={{ width: `${Math.round((permsCount / totalPerms) * 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* Key Modules Snapshot */}
                                    <div className="space-y-1.5 pt-1">
                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Module Privileges</span>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {PERMISSION_MODULES.map(mod => {
                                                const modPerms = groupedPermissions[mod.id] || [];
                                                const hasAny = modPerms.some(p => role.permissions?.[p.key]);
                                                return (
                                                    <div
                                                        key={mod.id}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border ${hasAny
                                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            : 'bg-slate-50 text-slate-400 border-slate-200/60 opacity-60'
                                                            }`}
                                                    >
                                                        <span>{hasAny ? '✅' : '✕'}</span>
                                                        <span className="truncate">{mod.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2">
                                    <button
                                        onClick={() => openEditModal(role)}
                                        disabled={role.is_super_admin}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${role.is_super_admin
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                            }`}
                                    >
                                        <span>✏️</span>
                                        <span>Edit Permissions</span>
                                    </button>

                                    {!role.is_super_admin && (
                                        <button
                                            onClick={() => handleDeleteRole(role)}
                                            className="p-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all"
                                            title="Delete Role"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VIEW 2: FULL PERMISSION MATRIX TABLE                            */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'matrix' && (
                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                    {/* Matrix Module Filter Bar */}
                    <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase">Module Filter:</span>
                            <select
                                value={matrixModuleFilter}
                                onChange={(e) => setMatrixModuleFilter(e.target.value)}
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">🌐 All Hospitality Modules</option>
                                {PERMISSION_MODULES.map(m => (
                                    <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
                                ))}
                            </select>
                        </div>
                        <p className="text-xs text-slate-500">
                            Showing access rights for all {roles.length} hotel roles
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-xs font-bold">
                                    <th className="px-5 py-4 w-72 sticky left-0 bg-slate-100 z-10">
                                        Hotel System Privilege
                                    </th>
                                    {roles.map((role) => (
                                        <th key={role.role_id} className="px-3 py-4 text-center min-w-[110px]">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-lg">{role.emoji}</span>
                                                <span className="text-xs font-bold text-slate-800 truncate max-w-[100px]">
                                                    {role.role_name}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {PERMISSION_MODULES
                                    .filter(mod => matrixModuleFilter === 'all' || matrixModuleFilter === mod.id)
                                    .map(mod => {
                                        const permsInMod = groupedPermissions[mod.id] || [];
                                        return (
                                            <div key={mod.id} style={{ display: 'contents' }}>
                                                {/* Module Section Header Row */}
                                                <tr className="bg-slate-50/90 font-bold text-slate-800">
                                                    <td
                                                        colSpan={roles.length + 1}
                                                        className="px-5 py-2.5 text-xs text-blue-700 uppercase tracking-wider flex items-center gap-2"
                                                    >
                                                        <span>{mod.icon}</span>
                                                        <span>{mod.name} Module</span>
                                                    </td>
                                                </tr>

                                                {/* Permission Items Rows */}
                                                {permsInMod.map(perm => (
                                                    <tr key={perm.key} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-5 py-3 sticky left-0 bg-white z-10 border-r border-slate-100">
                                                            <div className="font-semibold text-slate-800 flex items-center gap-2">
                                                                <span>{perm.icon}</span>
                                                                <span>{perm.label}</span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-400 pl-6">
                                                                {perm.description}
                                                            </p>
                                                        </td>
                                                        {roles.map(role => {
                                                            const hasAccess = role.is_super_admin || !!role.permissions?.[perm.key];
                                                            return (
                                                                <td key={role.role_id} className="px-3 py-3 text-center">
                                                                    <span
                                                                        className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-bold text-xs ${hasAccess
                                                                            ? 'bg-emerald-100 text-emerald-700'
                                                                            : 'bg-slate-100 text-slate-400'
                                                                            }`}
                                                                    >
                                                                        {hasAccess ? '✓' : '✕'}
                                                                    </span>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </div>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CREATE / EDIT CUSTOM ROLE MODAL                                 */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 my-8">
                        {/* Header */}
                        <div className={`p-6 bg-gradient-to-r ${formData.color_gradient} text-white`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <span>{editingRole ? '✏️ Edit Hotel Role Permissions' : '➕ Create Custom Hotel Role'}</span>
                                    </h2>
                                    <p className="text-white/80 text-xs mt-0.5">
                                        Configure title, department and toggle granular rights across 6 hospitality modules
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all text-lg"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                            {/* Basic Role Identity */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Role Name */}
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Role Title <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.role_name}
                                        onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
                                        placeholder="e.g. Banquet Supervisor, Night Manager"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 text-sm font-semibold"
                                        required
                                    />
                                </div>

                                {/* Emoji Picker */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Role Icon Emoji
                                    </label>
                                    <select
                                        value={formData.emoji}
                                        onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
                                    >
                                        <option value="🎯">🎯 Supervisor</option>
                                        <option value="🛎️">🛎️ Front Desk</option>
                                        <option value="🍽️">🍽️ Waiter / Dining</option>
                                        <option value="💰">💰 Cashier / Till</option>
                                        <option value="👨‍🍳">👨‍🍳 Kitchen Chef</option>
                                        <option value="🧹">🧹 Housekeeping</option>
                                        <option value="📦">📦 Storekeeper</option>
                                        <option value="🌙">🌙 Night Auditor</option>
                                        <option value="💼">💼 Management</option>
                                        <option value="🛡️">🛡️ Security</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Department */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Department Assignment
                                    </label>
                                    <select
                                        value={formData.department}
                                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
                                    >
                                        {HOTEL_DEPARTMENTS.filter(d => d.id !== 'all').map(d => (
                                            <option key={d.id} value={d.name}>{d.icon} {d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Theme Accent */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Card Color Theme
                                    </label>
                                    <select
                                        value={formData.color_gradient}
                                        onChange={(e) => setFormData({ ...formData, color_gradient: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
                                    >
                                        <option value="from-blue-600 to-indigo-600">🔷 Blue & Indigo</option>
                                        <option value="from-emerald-500 to-teal-600">🟢 Emerald & Teal</option>
                                        <option value="from-amber-500 to-orange-600">🟠 Amber & Orange</option>
                                        <option value="from-rose-500 to-pink-600">🔴 Rose & Pink</option>
                                        <option value="from-purple-600 to-pink-600">🟣 Purple & Magenta</option>
                                        <option value="from-slate-700 to-slate-900">⚫ Slate & Charcoal</option>
                                    </select>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    Role Description & Operational Scope
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Explain duties, till handling, and access limits for this role..."
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm resize-none"
                                />
                            </div>

                            {/* Quick Presets Toolbar */}
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
                                <span className="text-xs font-bold text-slate-500 uppercase">Quick Rights Templates:</span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => applyPermissionTemplate('all')}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                                    >
                                        Full Access (All)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPermissionTemplate('pos')}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                                    >
                                        Standard POS Cashier
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPermissionTemplate('supervisor')}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                                    >
                                        F&B Supervisor
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPermissionTemplate('none')}
                                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            {/* Granular Permission Toggles grouped by Module */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <span>🔐</span> Granular Permission Matrix (Toggle to Authorize)
                                </h3>

                                {PERMISSION_MODULES.map(mod => {
                                    const modPerms = groupedPermissions[mod.id] || [];
                                    const allEnabledInMod = modPerms.every(p => formData.permissions?.[p.key]);

                                    const toggleAllInMod = () => {
                                        const nextPerms = { ...(formData.permissions || {}) };
                                        modPerms.forEach(p => {
                                            nextPerms[p.key] = !allEnabledInMod;
                                        });
                                        setFormData(prev => ({ ...prev, permissions: nextPerms }));
                                    };

                                    return (
                                        <div key={mod.id} className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80">
                                            {/* Module Header */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{mod.icon}</span>
                                                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                        {mod.name}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={toggleAllInMod}
                                                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                                                >
                                                    {allEnabledInMod ? 'Deselect Module' : 'Select All in Module'}
                                                </button>
                                            </div>

                                            {/* Checkboxes Grid */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {modPerms.map(perm => {
                                                    const isChecked = !!formData.permissions?.[perm.key];
                                                    return (
                                                        <label
                                                            key={perm.key}
                                                            className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${isChecked
                                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                                                : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        permissions: {
                                                                            ...(prev.permissions || {}),
                                                                            [perm.key]: e.target.checked,
                                                                        },
                                                                    }));
                                                                }}
                                                                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold leading-tight flex items-center gap-1.5">
                                                                    <span>{perm.icon}</span>
                                                                    <span>{perm.label}</span>
                                                                </p>
                                                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                                                    {perm.description}
                                                                </p>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-md transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            <span>Saving Role...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingRole ? '💾 Update Role & Permissions' : '➕ Create Role'}</span>
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
