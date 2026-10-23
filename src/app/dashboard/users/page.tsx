'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    HotelRole,
    getLocalHotelRoles,
    getRoleMeta,
    HOTEL_DEPARTMENTS,
    PRESET_HOTEL_ROLES,
} from '@/lib/hotelRoles';

// SHA-256 password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface User {
    user_id: number;
    user_code: string;
    user_name: string;
    name: string;
    user_type: string;
    email: string | null;
    phone: string | null;
    national_id: string | null;
    salary_type: 'Monthly' | 'Weekly';
    salary_amount: number;
    pin: string | null;
    active: boolean;
    is_super_admin: boolean;
    created_at: string;
    updated_at?: string;
}

export default function UsersPage() {
    const searchParams = useSearchParams();
    const roleParam = searchParams.get('role');

    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<HotelRole[]>(PRESET_HOTEL_ROLES);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState(roleParam || 'All');
    const [filterDepartment, setFilterDepartment] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortBy, setSortBy] = useState<'name' | 'code' | 'salary' | 'recent'>('recent');

    // Form state
    const [formData, setFormData] = useState({
        user_code: '',
        user_name: '',
        name: '',
        user_type: 'Cashier',
        department: 'Food & Beverage',
        email: '',
        phone: '',
        national_id: '',
        salary_type: 'Monthly' as 'Monthly' | 'Weekly',
        salary_amount: 0,
        password: '',
        pin: '',
        active: true,
    });

    // Load custom roles from localStorage
    const loadRolesList = useCallback(() => {
        const storedRoles = getLocalHotelRoles();
        setRoles(storedRoles);
    }, []);

    // Load users from Supabase
    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err: any) {
            console.error('Error loading users:', err);
            toast.error('Failed to load hotel personnel.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRolesList();
        loadUsers();

        const handleRoleUpdate = () => loadRolesList();
        window.addEventListener('alphaplus_roles_updated', handleRoleUpdate);
        return () => window.removeEventListener('alphaplus_roles_updated', handleRoleUpdate);
    }, [loadRolesList, loadUsers]);

    useEffect(() => {
        if (roleParam) {
            setFilterRole(roleParam);
        }
    }, [roleParam]);

    // Auto-generate next Staff Code
    const generateUserCode = useCallback(async () => {
        try {
            const { count } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true });

            const nextNum = (count || users.length || 0) + 1;
            return `US-${String(nextNum).padStart(4, '0')}`;
        } catch {
            return `US-${String(users.length + 1).padStart(4, '0')}`;
        }
    }, [users.length]);

    // Open Add Staff Modal
    const openAddModal = async () => {
        const newCode = await generateUserCode();
        setFormData({
            user_code: newCode,
            user_name: '',
            name: '',
            user_type: filterRole !== 'All' ? filterRole : 'Cashier',
            department: 'Food & Beverage',
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
        setShowPassword(false);
        setShowPin(false);
        setShowModal(true);
    };

    // Open Edit Staff Modal
    const openEditModal = (user: User) => {
        if (user.is_super_admin) {
            toast.error('🔒 Super Admin root account is protected.');
            return;
        }

        const roleMeta = getRoleMeta(user.user_type);

        setFormData({
            user_code: user.user_code || `US-${String(user.user_id).padStart(4, '0')}`,
            user_name: user.user_name,
            name: user.name,
            user_type: user.user_type,
            department: roleMeta.department || 'Food & Beverage',
            email: user.email || '',
            phone: user.phone || '',
            national_id: user.national_id || '',
            salary_type: user.salary_type || 'Monthly',
            salary_amount: Number(user.salary_amount) || 0,
            password: '',
            pin: user.pin || '',
            active: user.active,
        });
        setEditingUser(user);
        setShowPassword(false);
        setShowPin(false);
        setShowModal(true);
    };

    // Open View Detail Modal
    const openDetailModal = (user: User) => {
        setSelectedUser(user);
        setShowDetailModal(true);
    };

    // Auto-generate random 4-digit PIN
    const handleGenerateRandomPin = () => {
        const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
        setFormData(prev => ({ ...prev, pin: randomPin }));
        setShowPin(true);
        toast.success(`Generated 4-digit PIN: ${randomPin}`);
    };

    // Save Staff (Insert / Update)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.user_name.trim() || !formData.name.trim()) {
            toast.error('Username and Full Name are mandatory.');
            return;
        }

        if (!editingUser && !formData.password && !['Cashier', 'Waiter'].includes(formData.user_type)) {
            toast.error('Password is required for administrative and front desk staff.');
            return;
        }

        if (formData.pin && ![4, 6].includes(formData.pin.length)) {
            toast.error('POS Quick PIN must be exactly 4 or 6 digits.');
            return;
        }

        setIsSubmitting(true);

        try {
            if (editingUser) {
                const updatePayload: Record<string, any> = {
                    user_name: formData.user_name.trim(),
                    name: formData.name.trim(),
                    user_type: formData.user_type,
                    email: formData.email.trim() || null,
                    phone: formData.phone.trim() || null,
                    national_id: formData.national_id.trim() || null,
                    salary_type: formData.salary_type,
                    salary_amount: Number(formData.salary_amount) || 0,
                    pin: formData.pin.trim() || null,
                    active: formData.active,
                    updated_at: new Date().toISOString(),
                };

                if (formData.password.trim()) {
                    updatePayload.password_hash = await hashPassword(formData.password.trim());
                }

                const { error } = await supabase
                    .from('users')
                    .update(updatePayload)
                    .eq('user_id', editingUser.user_id);

                if (error) throw error;
                toast.success(`Staff member "${formData.name}" updated! ✅`);
            } else {
                const passwordToHash = formData.password.trim() || formData.pin.trim() || '1234';
                const passwordHash = await hashPassword(passwordToHash);

                const { data, error } = await supabase
                    .from('users')
                    .insert([{
                        user_code: null,
                        user_name: formData.user_name.trim(),
                        password_hash: passwordHash,
                        name: formData.name.trim(),
                        user_type: formData.user_type,
                        email: formData.email.trim() || null,
                        phone: formData.phone.trim() || null,
                        national_id: formData.national_id.trim() || null,
                        salary_type: formData.salary_type,
                        salary_amount: Number(formData.salary_amount) || 0,
                        pin: formData.pin.trim() || null,
                        active: formData.active,
                        is_super_admin: false,
                        created_at: new Date().toISOString(),
                    }])
                    .select()
                    .single();

                if (error) throw error;

                if (data?.user_id) {
                    const finalCode = `US-${String(data.user_id).padStart(4, '0')}`;
                    await supabase
                        .from('users')
                        .update({ user_code: finalCode })
                        .eq('user_id', data.user_id);
                }

                toast.success(`Staff member "${formData.name}" registered! 🎉`);
            }

            setShowModal(false);
            loadUsers();
        } catch (err: any) {
            console.error('Error saving user:', err);
            const msg = err?.message || err?.error_description || 'Unable to save staff record.';
            toast.error(`Operation failed: ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Toggle Active Status
    const toggleUserStatus = async (user: User) => {
        if (user.is_super_admin) {
            toast.error('Cannot suspend the Super Admin account.');
            return;
        }

        try {
            const nextActive = !user.active;
            const { error } = await supabase
                .from('users')
                .update({ active: nextActive, updated_at: new Date().toISOString() })
                .eq('user_id', user.user_id);

            if (error) throw error;

            toast.success(nextActive ? `✅ ${user.name} is now ACTIVE` : `⏸️ ${user.name} is now INACTIVE`);
            setUsers(prev => prev.map(u => u.user_id === user.user_id ? { ...u, active: nextActive } : u));
        } catch (err: any) {
            console.error('Status toggle error:', err);
            toast.error('Failed to update status.');
        }
    };

    // Delete User
    const deleteUser = async (user: User) => {
        if (user.is_super_admin) {
            toast.error('Cannot delete the root Super Admin account.');
            return;
        }

        if (!confirm(`Are you sure you want to permanently remove "${user.name}" (${user.user_code}) from staff?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('user_id', user.user_id);

            if (error) throw error;
            toast.success(`Staff member "${user.name}" removed.`);
            setUsers(prev => prev.filter(u => u.user_id !== user.user_id));
        } catch (err: any) {
            console.error('Delete error:', err);
            toast.error(`Delete failed: ${err.message || 'Staff may have active shift or sales records.'}`);
        }
    };

    // Export Staff Roster to CSV
    const exportRosterCSV = () => {
        if (users.length === 0) {
            toast.error('No staff records to export.');
            return;
        }

        const headers = ['Staff Code', 'Full Name', 'Username', 'Hotel Role', 'National ID', 'Phone / M-Pesa', 'Email', 'Salary Type', 'Salary (KES)', 'Status', 'Date Registered'];
        const rows = filteredUsers.map(u => [
            u.user_code || `US-${u.user_id}`,
            `"${u.name.replace(/"/g, '""')}"`,
            `"${u.user_name.replace(/"/g, '""')}"`,
            `"${u.user_type}"`,
            `"${u.national_id || ''}"`,
            `"${u.phone || ''}"`,
            `"${u.email || ''}"`,
            u.salary_type || 'Monthly',
            Number(u.salary_amount || 0).toFixed(2),
            u.active ? 'Active' : 'Inactive',
            new Date(u.created_at).toLocaleDateString(),
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `alphaplus_hotel_staff_roster_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Staff roster exported to CSV 📥');
    };

    // Filter and Sort Users
    const filteredUsers = useMemo(() => {
        return users
            .filter(user => {
                const q = searchQuery.toLowerCase().trim();
                const matchesSearch =
                    !q ||
                    user.name?.toLowerCase().includes(q) ||
                    user.user_name?.toLowerCase().includes(q) ||
                    user.user_code?.toLowerCase().includes(q) ||
                    user.phone?.includes(q) ||
                    user.national_id?.toLowerCase().includes(q) ||
                    user.email?.toLowerCase().includes(q);

                const matchesRole = filterRole === 'All' || user.user_type === filterRole;

                const roleMeta = getRoleMeta(user.user_type);
                const matchesDepartment =
                    filterDepartment === 'All' ||
                    roleMeta.department.toLowerCase() === filterDepartment.toLowerCase();

                const matchesStatus =
                    filterStatus === 'All' ||
                    (filterStatus === 'Active' && user.active) ||
                    (filterStatus === 'Inactive' && !user.active);

                return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
            })
            .sort((a, b) => {
                if (sortBy === 'name') return a.name.localeCompare(b.name);
                if (sortBy === 'code') return (a.user_code || '').localeCompare(b.user_code || '');
                if (sortBy === 'salary') return (Number(b.salary_amount) || 0) - (Number(a.salary_amount) || 0);
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
    }, [users, searchQuery, filterRole, filterDepartment, filterStatus, sortBy]);

    // KPI Metrics
    const metrics = useMemo(() => {
        const total = users.length;
        const active = users.filter(u => u.active).length;
        const foh = users.filter(u => ['Cashier', 'Waiter', 'Waitress', 'Supervisor', 'Front Desk Agent'].includes(u.user_type)).length;
        const boh = users.filter(u => ['Head Chef', 'Chef', 'Cook', 'Housekeeping Supervisor', 'Storekeeper', 'Master Butcher'].includes(u.user_type)).length;
        const totalPayroll = users
            .filter(u => u.active)
            .reduce((sum, u) => sum + (Number(u.salary_amount) || 0), 0);

        return {
            total,
            active,
            inactive: total - active,
            foh,
            boh,
            totalPayroll,
        };
    }, [users]);

    return (
        <div className="space-y-6 pb-12 text-slate-800">
            {/* ─── Top Bar / Header ─── */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <span className="text-3xl md:text-4xl flex-shrink-0">🏨</span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                                    Hotel Personnel & Staff Directory
                                </h1>
                                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                                    KENYA HOSPITALITY
                                </span>
                            </div>
                            <p className="text-slate-500 text-xs md:text-sm mt-0.5 truncate">
                                Manage hotel staff credentials, POS till PINs, roles, department rosters & monthly payroll.
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons (flex-wrap ensures no right clipping!) */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/dashboard/user-roles"
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-2xl border border-slate-200 shadow-sm transition-all text-xs md:text-sm"
                            title="Manage Security & Permissions Matrix"
                        >
                            <span className="text-base">🛡️</span>
                            <span>Roles & Permissions</span>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">
                                {roles.length}
                            </span>
                        </Link>

                        <button
                            onClick={exportRosterCSV}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-2xl border border-slate-200 shadow-sm transition-all text-xs md:text-sm"
                            title="Export Roster to Excel/CSV"
                        >
                            <span>📥</span>
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>

                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-2xl border border-slate-200 shadow-sm transition-all text-xs md:text-sm"
                            title="Print Staff Roster"
                        >
                            <span>🖨️</span>
                            <span className="hidden sm:inline">Print</span>
                        </button>

                        <button
                            onClick={openAddModal}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs md:text-sm"
                        >
                            <span className="text-base">➕</span>
                            <span>Add Hotel Staff</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── KPI Stat Cards (Responsive Grid that fits viewport) ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 w-full min-w-0">
                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Total Staff</span>
                        <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm flex-shrink-0">👥</span>
                    </div>
                    <p className="text-xl md:text-2xl font-bold text-slate-900 mt-2">{metrics.total}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Registered workforce</p>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Active On-Duty</span>
                        <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm flex-shrink-0">✅</span>
                    </div>
                    <p className="text-xl md:text-2xl font-bold text-emerald-600 mt-2">{metrics.active}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{metrics.total > 0 ? Math.round((metrics.active / metrics.total) * 100) : 0}% active</p>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Front of House</span>
                        <span className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-sm flex-shrink-0">🍽️</span>
                    </div>
                    <p className="text-xl md:text-2xl font-bold text-slate-900 mt-2">{metrics.foh}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Cashiers, Waiters, F&B</p>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Back of House</span>
                        <span className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm flex-shrink-0">👨‍🍳</span>
                    </div>
                    <p className="text-xl md:text-2xl font-bold text-slate-900 mt-2">{metrics.boh}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Kitchen, Housekeeping</p>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Off-Duty / Leave</span>
                        <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-sm flex-shrink-0">⏸️</span>
                    </div>
                    <p className="text-xl md:text-2xl font-bold text-slate-500 mt-2">{metrics.inactive}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Inactive personnel</p>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">Monthly Payroll</span>
                        <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm flex-shrink-0">💵</span>
                    </div>
                    <p className="text-lg md:text-xl font-bold text-indigo-700 mt-2 truncate">
                        KES {metrics.totalPayroll.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">Active monthly commitment</p>
                </div>
            </div>

            {/* ─── Role Filter Chips (Safe horizontal scroll) ─── */}
            <div className="w-full max-w-full overflow-x-auto pb-1 scrollbar-none">
                <div className="flex items-center gap-2 whitespace-nowrap">
                    <button
                        onClick={() => setFilterRole('All')}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${filterRole === 'All'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        🏷️ All Roles ({users.length})
                    </button>
                    {roles.map(role => {
                        const count = users.filter(u => u.user_type === role.role_name).length;
                        const isActive = filterRole === role.role_name;
                        return (
                            <button
                                key={role.role_id}
                                onClick={() => setFilterRole(role.role_name)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${isActive
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                    }`}
                            >
                                <span>{role.emoji}</span>
                                <span>{role.role_name}</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ─── Search & Filter Toolbar ─── */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm w-full min-w-0">
                <div className="flex flex-col md:flex-row gap-3">
                    {/* Search Input */}
                    <div className="flex-1 relative min-w-0">
                        <input
                            type="text"
                            placeholder="🔍 Search staff by name, username, staff code (US-...), phone or national ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2.5 pl-10 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-xs md:text-sm"
                        />
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">🔎</span>
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Department Filter */}
                    <select
                        value={filterDepartment}
                        onChange={(e) => setFilterDepartment(e.target.value)}
                        className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 focus:outline-none focus:border-blue-500 text-xs md:text-sm cursor-pointer"
                    >
                        {HOTEL_DEPARTMENTS.map(dept => (
                            <option key={dept.id} value={dept.id === 'all' ? 'All' : dept.name}>
                                {dept.icon} {dept.name}
                            </option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 focus:outline-none focus:border-blue-500 text-xs md:text-sm cursor-pointer"
                    >
                        <option value="All">📊 All Status</option>
                        <option value="Active">✅ Active On-Duty</option>
                        <option value="Inactive">⏸️ Inactive / Leave</option>
                    </select>

                    {/* Sort */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 focus:outline-none focus:border-blue-500 text-xs md:text-sm cursor-pointer"
                    >
                        <option value="recent">⏱️ Recently Added</option>
                        <option value="name">🔤 Name (A - Z)</option>
                        <option value="code">🆔 Staff Code</option>
                        <option value="salary">💵 Salary (High to Low)</option>
                    </select>

                    {/* View Switcher & Refresh */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start md:self-auto">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Table View"
                        >
                            📋
                        </button>
                        <button
                            onClick={() => setViewMode('cards')}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Grid Cards View"
                        >
                            📇
                        </button>
                        <button
                            onClick={loadUsers}
                            className="p-2 text-slate-500 hover:text-slate-700 transition-all"
                            title="Reload"
                        >
                            🔄
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Content Area: Table vs Cards ─── */}
            {isLoading ? (
                <div className="bg-white rounded-3xl p-16 border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-slate-700 font-semibold mt-4">Loading Hotel Personnel...</p>
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="bg-white rounded-3xl p-16 border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-5xl mb-3">📭</span>
                    <h3 className="text-lg font-bold text-slate-800">No Hotel Staff Found</h3>
                    <p className="text-slate-500 text-sm max-w-md mt-1">
                        No personnel matched your search filters. Clear filters or create a new staff profile.
                    </p>
                    <button
                        onClick={openAddModal}
                        className="mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl shadow transition-all text-sm"
                    >
                        ➕ Add New Staff Member
                    </button>
                </div>
            ) : viewMode === 'table' ? (
                /* ─── TABLE VIEW (With full horizontal scroll protection) ─── */
                <div className="w-full max-w-full overflow-hidden bg-white rounded-3xl border border-slate-200/80 shadow-sm">
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[760px]">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                                    <th className="px-5 py-4">👤 Staff Member</th>
                                    <th className="px-4 py-4">🎭 Role & Department</th>
                                    <th className="px-4 py-4">📱 Contact & ID</th>
                                    <th className="px-4 py-4">🔐 Access / PIN</th>
                                    <th className="px-4 py-4">💵 Compensation</th>
                                    <th className="px-4 py-4 text-center">📊 Status</th>
                                    <th className="px-5 py-4 text-right">⚙️ Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {filteredUsers.map((user) => {
                                    const roleMeta = getRoleMeta(user.user_type);
                                    return (
                                        <tr
                                            key={user.user_id}
                                            className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                                            onClick={() => openDetailModal(user)}
                                        >
                                            {/* User identity */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${roleMeta.color} text-base flex-shrink-0`}>
                                                        {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                                                            {user.name}
                                                            {user.is_super_admin && <span title="Super Admin">👑</span>}
                                                        </div>
                                                        <div className="text-xs text-slate-500 font-mono">
                                                            @{user.user_name}
                                                        </div>
                                                        <div className="text-[11px] text-blue-600 font-mono font-medium">
                                                            {user.user_code || `US-${String(user.user_id).padStart(4, '0')}`}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Role & Department */}
                                            <td className="px-4 py-4">
                                                <div className="space-y-1">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${roleMeta.badge}`}>
                                                        <span>{roleMeta.emoji}</span>
                                                        <span>{user.user_type}</span>
                                                    </span>
                                                    <p className="text-[11px] text-slate-400 pl-1">
                                                        {roleMeta.department}
                                                    </p>
                                                </div>
                                            </td>

                                            {/* Contact & ID */}
                                            <td className="px-4 py-4">
                                                <div className="space-y-0.5">
                                                    {user.phone ? (
                                                        <a
                                                            href={`tel:${user.phone}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-xs font-medium text-slate-700 hover:text-blue-600 flex items-center gap-1.5"
                                                        >
                                                            <span>📱</span> {user.phone}
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">-</span>
                                                    )}
                                                    {user.national_id && (
                                                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                                            <span>🪪</span> ID: {user.national_id}
                                                        </p>
                                                    )}
                                                    {user.email && (
                                                        <p className="text-[11px] text-slate-400 truncate max-w-[150px] flex items-center gap-1">
                                                            <span>📧</span> {user.email}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Access & PIN */}
                                            <td className="px-4 py-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs">🔢 PIN:</span>
                                                        {user.pin ? (
                                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xs font-bold">
                                                                ●●●●
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">
                                                                No PIN
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400">
                                                        POS Terminal access
                                                    </p>
                                                </div>
                                            </td>

                                            {/* Compensation */}
                                            <td className="px-4 py-4">
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">
                                                        KES {Number(user.salary_amount || 0).toLocaleString()}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400">
                                                        {user.salary_type || 'Monthly'}
                                                    </p>
                                                </div>
                                            </td>

                                            {/* Status Toggle */}
                                            <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => toggleUserStatus(user)}
                                                    disabled={user.is_super_admin}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${user.active
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                                        : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                                                        } ${user.is_super_admin ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                                                    title={user.is_super_admin ? 'Protected account' : 'Click to toggle active status'}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${user.active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                    <span>{user.active ? 'Active' : 'Inactive'}</span>
                                                </button>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => openDetailModal(user)}
                                                        className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-xs"
                                                        title="View Profile"
                                                    >
                                                        👁️
                                                    </button>
                                                    {user.is_super_admin ? (
                                                        <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-semibold">
                                                            🔒 Root
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => openEditModal(user)}
                                                                className="p-2 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all text-xs"
                                                                title="Edit Staff Member"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                onClick={() => deleteUser(user)}
                                                                className="p-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all text-xs"
                                                                title="Remove Staff"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* ─── VISUAL STAFF IDENTITY CARDS VIEW ─── */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full min-w-0">
                    {filteredUsers.map((user) => {
                        const roleMeta = getRoleMeta(user.user_type);
                        return (
                            <div
                                key={user.user_id}
                                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 cursor-pointer min-w-0"
                                onClick={() => openDetailModal(user)}
                            >
                                <div className={`h-3 bg-gradient-to-r ${roleMeta.color}`}></div>

                                <div className="p-5 flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className={`w-13 h-13 rounded-2xl flex items-center justify-center font-bold text-white shadow bg-gradient-to-br ${roleMeta.color} text-xl flex-shrink-0`}>
                                            {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div className="text-right min-w-0">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleMeta.badge}`}>
                                                <span>{roleMeta.emoji}</span>
                                                <span className="truncate">{user.user_type}</span>
                                            </span>
                                            <p className="text-[11px] text-slate-400 mt-1 font-mono">
                                                {user.user_code || `US-${String(user.user_id).padStart(4, '0')}`}
                                            </p>
                                        </div>
                                    </div>

                                    <h4 className="text-base font-bold text-slate-900 truncate">
                                        {user.name}
                                    </h4>
                                    <p className="text-xs text-slate-400 mb-3 truncate">
                                        @{user.user_name} • <span className="text-slate-600 font-medium">{roleMeta.department}</span>
                                    </p>

                                    <div className="space-y-1.5 py-2 border-y border-slate-100 text-xs text-slate-600">
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">📱 Mobile:</span>
                                            <span className="font-medium text-slate-800">{user.phone || 'Not set'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">🪪 ID No:</span>
                                            <span className="font-medium text-slate-800">{user.national_id || '-'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">🔢 POS PIN:</span>
                                            <span className="font-mono font-bold text-slate-800">{user.pin ? '●●●●' : 'None'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">💵 Salary:</span>
                                            <span className="font-bold text-indigo-700">KES {Number(user.salary_amount || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={() => toggleUserStatus(user)}
                                        disabled={user.is_super_admin}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${user.active
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-rose-100 text-rose-800'
                                            }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                                        <span>{user.active ? 'Active' : 'Inactive'}</span>
                                    </button>

                                    <div className="flex items-center gap-1.5">
                                        {!user.is_super_admin && (
                                            <>
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-all text-xs"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => deleteUser(user)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition-all text-xs"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── ADD / EDIT STAFF MODAL ─── */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 my-8">
                        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <span>{editingUser ? '✏️ Edit Hotel Staff Profile' : '➕ Register New Hotel Personnel'}</span>
                                    </h2>
                                    <p className="text-blue-100 text-xs mt-0.5">
                                        Configure identity, POS till PIN, security credentials & department assignment
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

                        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-slate-900">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <span>👤</span> 1. Personal & Government Identification
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Official Full Name <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g. Samuel Mwangi"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            System Login Username <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.user_name}
                                            onChange={(e) => setFormData({ ...formData, user_name: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                                            placeholder="e.g. samuel.m"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-sm font-mono"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Staff Code (System Assigned)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.user_code}
                                            disabled
                                            className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono text-sm cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Kenyan National ID / Passport Number
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.national_id}
                                            onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                                            placeholder="e.g. 29384751"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <span>📱</span> 2. Contact & Communications
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Mobile Phone / M-Pesa Number
                                        </label>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="0712 345 678"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Official Email Address
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            placeholder="staff@hotel.co.ke"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span>🎭</span> 3. Hotel Role & Department Access
                                    </h3>
                                    <Link
                                        href="/dashboard/user-roles"
                                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                                    >
                                        ⚡ Customize Roles
                                    </Link>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Assigned Hotel Role <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            value={formData.user_type}
                                            onChange={(e) => {
                                                const selectedRoleName = e.target.value;
                                                const roleObj = roles.find(r => r.role_name === selectedRoleName);
                                                setFormData({
                                                    ...formData,
                                                    user_type: selectedRoleName,
                                                    department: roleObj?.department || formData.department,
                                                });
                                            }}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
                                        >
                                            {roles.map(r => (
                                                <option key={r.role_id} value={r.role_name}>
                                                    {r.emoji} {r.role_name} ({r.department})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Hospitality Department
                                        </label>
                                        <select
                                            value={formData.department}
                                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
                                        >
                                            {HOTEL_DEPARTMENTS.filter(d => d.id !== 'all').map(d => (
                                                <option key={d.id} value={d.name}>
                                                    {d.icon} {d.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <span>🔐</span> 4. System Login & POS Quick Access PIN
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-xs font-semibold text-slate-700">
                                                System Password {!editingUser && <span className="text-rose-500">*</span>}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                                            >
                                                {showPassword ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder={editingUser ? 'Leave blank to keep current' : 'Min. 6 characters'}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-xs font-semibold text-slate-700">
                                                POS Terminal PIN (4 or 6 digits)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateRandomPin}
                                                    className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium"
                                                >
                                                    🎲 Auto PIN
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPin(!showPin)}
                                                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    {showPin ? 'Hide' : 'Show'}
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            type={showPin ? 'text' : 'password'}
                                            value={formData.pin}
                                            onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                            placeholder="e.g. 1234"
                                            maxLength={6}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm font-mono tracking-widest"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <span>💵</span> 5. Compensation & Payroll (Kenya Shillings)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Payment Frequency
                                        </label>
                                        <select
                                            value={formData.salary_type}
                                            onChange={(e) => setFormData({ ...formData, salary_type: e.target.value as any })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
                                        >
                                            <option value="Monthly">📅 Monthly Salary</option>
                                            <option value="Weekly">📆 Weekly Wage</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                            Gross Amount (KES)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">KES</span>
                                            <input
                                                type="number"
                                                value={formData.salary_amount}
                                                onChange={(e) => setFormData({ ...formData, salary_amount: parseFloat(e.target.value) || 0 })}
                                                placeholder="0.00"
                                                min="0"
                                                className="w-full px-4 py-2.5 pl-14 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 text-sm font-semibold"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <span className="text-sm font-semibold text-slate-800">
                                            {formData.active ? '✅ Active Hotel Staff' : '⏸️ Inactive / Suspended'}
                                        </span>
                                        <p className="text-xs text-slate-500">
                                            Active personnel can login to POS, process hotel bills, and take room orders.
                                        </p>
                                    </div>
                                </label>
                            </div>

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
                                    disabled={isSubmitting}
                                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-md transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            <span>Saving Staff...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>{editingUser ? '💾 Update Staff' : '➕ Create Staff Member'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── VIEW STAFF DETAIL PROFILE MODAL ─── */}
            {showDetailModal && selectedUser && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
                        {(() => {
                            const roleMeta = getRoleMeta(selectedUser.user_type);
                            return (
                                <>
                                    <div className={`p-6 bg-gradient-to-r ${roleMeta.color} text-white`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white text-2xl border border-white/30">
                                                    {selectedUser.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold">{selectedUser.name}</h3>
                                                    <p className="text-white/80 text-xs">@{selectedUser.user_name}</p>
                                                    <span className="inline-block mt-1 px-2.5 py-0.5 bg-white/20 text-white rounded-full text-xs font-medium">
                                                        {selectedUser.user_code || `US-${selectedUser.user_id}`}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setShowDetailModal(false)}
                                                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-4">
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <span className="text-xs text-slate-400 block">Hotel Role</span>
                                                <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                                    <span>{roleMeta.emoji}</span> {selectedUser.user_type}
                                                </span>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <span className="text-xs text-slate-400 block">Department</span>
                                                <span className="font-bold text-slate-800 mt-0.5 block">
                                                    {roleMeta.department}
                                                </span>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <span className="text-xs text-slate-400 block">Mobile Phone</span>
                                                <span className="font-semibold text-slate-800 mt-0.5 block">
                                                    {selectedUser.phone || 'None'}
                                                </span>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <span className="text-xs text-slate-400 block">National ID</span>
                                                <span className="font-semibold text-slate-800 mt-0.5 block">
                                                    {selectedUser.national_id || 'None'}
                                                </span>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <span className="text-xs text-slate-400 block">Compensation</span>
                                                <span className="font-bold text-indigo-700 mt-0.5 block">
                                                    KES {Number(selectedUser.salary_amount || 0).toLocaleString()} / {selectedUser.salary_type || 'mo'}
                                                </span>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                <span className="text-xs text-slate-400 block">POS PIN Status</span>
                                                <span className="font-bold text-emerald-600 mt-0.5 block">
                                                    {selectedUser.pin ? '✅ Configured (Active)' : '⚠️ Not Configured'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-500">
                                            <p><strong>Registered Date:</strong> {new Date(selectedUser.created_at).toLocaleString()}</p>
                                            <p><strong>Account Type:</strong> {selectedUser.is_super_admin ? '👑 Super Administrator' : 'Standard Hotel Staff'}</p>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <button
                                                onClick={() => {
                                                    setShowDetailModal(false);
                                                    openEditModal(selectedUser);
                                                }}
                                                disabled={selectedUser.is_super_admin}
                                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl text-sm transition-all disabled:opacity-50"
                                            >
                                                ✏️ Edit Staff Details
                                            </button>
                                            <button
                                                onClick={() => setShowDetailModal(false)}
                                                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl text-sm transition-all"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
