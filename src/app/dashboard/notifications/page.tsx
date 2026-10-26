'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export type NotificationCategory = 'all' | 'inventory' | 'pos' | 'hotel' | 'finance' | 'security';
export type NotificationPriority = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'info';
export type NotificationStatus = 'all' | 'unread' | 'starred' | 'acknowledged' | 'resolved';

export interface SystemNotification {
    id: string;
    title: string;
    message: string;
    category: 'inventory' | 'pos' | 'hotel' | 'finance' | 'security';
    priority: 'critical' | 'high' | 'medium' | 'low' | 'info';
    timestamp: string; // ISO string
    read: boolean;
    starred: boolean;
    status: 'active' | 'acknowledged' | 'resolved';
    actionUrl: string;
    actionLabel: string;
    source: string;
    department?: string;
    metadata?: Record<string, any>;
    acknowledgedBy?: string;
    resolvedAt?: string;
}

// ─── Native Web Audio Chime Generator ──────────────────────────────────────────
const playNotificationSound = (type: 'chime' | 'critical' | 'ping' | 'subtle' = 'chime') => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'critical') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'ping') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } else {
            // Modern chime (D5 -> A5)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        }
    } catch {
        // audio policy or blocked
    }
};

export default function NotificationsPage() {
    const router = useRouter();

    // ── State ──
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all');
    const [selectedPriority, setSelectedPriority] = useState<NotificationPriority>('all');
    const [selectedStatus, setSelectedStatus] = useState<NotificationStatus>('all');
    const [currentUser, setCurrentUser] = useState<{ name: string; userType: string }>({ name: 'Manager', userType: 'Admin' });

    // ── Modals State ──
    const [inspectModalItem, setInspectModalItem] = useState<SystemNotification | null>(null);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // ── Broadcast Form State ──
    const [broadcastForm, setBroadcastForm] = useState({
        title: '',
        message: '',
        category: 'inventory' as SystemNotification['category'],
        priority: 'high' as SystemNotification['priority'],
        department: 'All Departments',
        actionUrl: '/dashboard/low-stock',
        actionLabel: 'Inspect & Resolve',
    });

    // ── Preferences State ──
    const [preferences, setPreferences] = useState({
        soundEnabled: true,
        soundTone: 'chime' as 'chime' | 'critical' | 'ping',
        autoMarkReadOnInspect: false,
        desktopAlerts: false,
        emailDigest: true,
    });

    // Load User
    useEffect(() => {
        try {
            const userData = localStorage.getItem('user');
            if (userData) {
                const parsed = JSON.parse(userData);
                setCurrentUser({
                    name: parsed.name || 'Executive Staff',
                    userType: parsed.userType || 'Administrator',
                });
            }
        } catch {
            // fallback
        }
    }, []);

    // Load Preferences
    useEffect(() => {
        try {
            const saved = localStorage.getItem('alphaplus_notif_prefs');
            if (saved) {
                setPreferences(JSON.parse(saved));
            }
        } catch {
            // ignore
        }
    }, []);

    // Fetch Live Operational Alerts & Combine with Seed Events
    const fetchAllNotifications = async () => {
        setLoading(true);
        try {
            const localSaved = localStorage.getItem('alphaplus_system_notifications');
            let baseList: SystemNotification[] = [];

            if (localSaved) {
                try {
                    baseList = JSON.parse(localSaved);
                } catch {
                    baseList = [];
                }
            }

            // 1. Live Database Ingestion: Low Stock Ingredients
            const { data: lowStockData } = await supabase
                .from('products_ingredients')
                .select('id, name, current_stock, reorder_point, unit, cost_per_base_unit')
                .order('current_stock', { ascending: true });

            const dynamicLiveAlerts: SystemNotification[] = [];

            if (lowStockData && lowStockData.length > 0) {
                lowStockData.forEach(item => {
                    const stock = Number(item.current_stock || 0);
                    const par = Number(item.reorder_point || 0);
                    if (stock <= par) {
                        const isZero = stock <= 0;
                        dynamicLiveAlerts.push({
                            id: `live-stock-${item.id}`,
                            title: isZero ? `CRITICAL OUT OF STOCK: ${item.name}` : `Low Stock Par Alert: ${item.name}`,
                            message: `${item.name} is currently at ${stock} ${item.unit || 'units'} (Reorder Par: ${par} ${item.unit || 'units'}). Replenishment required immediately.`,
                            category: 'inventory',
                            priority: isZero ? 'critical' : 'high',
                            timestamp: new Date().toISOString(),
                            read: false,
                            starred: isZero,
                            status: 'active',
                            actionUrl: '/dashboard/low-stock',
                            actionLabel: 'Open Low Stock Par',
                            source: 'Inventory Engine',
                            department: 'Kitchen & Stores',
                            metadata: {
                                ingredientId: item.id,
                                ingredientName: item.name,
                                currentStock: stock,
                                reorderPar: par,
                                unit: item.unit || 'units',
                                costPerUnit: item.cost_per_base_unit || 0,
                            },
                        });
                    }
                });
            }

            // 2. Live Database Ingestion: Open Shifts
            const { data: openShifts } = await supabase
                .from('shifts')
                .select('id, employee_name, user_id, start_time, starting_cash, status')
                .eq('status', 'open')
                .order('start_time', { ascending: false });

            if (openShifts && openShifts.length > 0) {
                openShifts.forEach(shift => {
                    const startTime = new Date(shift.start_time);
                    const hoursOpen = Math.round((Date.now() - startTime.getTime()) / (1000 * 60 * 60));
                    dynamicLiveAlerts.push({
                        id: `live-shift-${shift.id}`,
                        title: `Active POS Register Shift #${shift.id}`,
                        message: `Shift opened by ${shift.employee_name || 'Cashier'} starting with KES ${Number(shift.starting_cash || 0).toLocaleString()}. Open for ~${hoursOpen}h.`,
                        category: 'pos',
                        priority: hoursOpen > 14 ? 'high' : 'medium',
                        timestamp: shift.start_time || new Date().toISOString(),
                        read: false,
                        starred: false,
                        status: 'active',
                        actionUrl: '/dashboard/shifts',
                        actionLabel: 'Review Register Shift',
                        source: 'POS Cashier Terminal',
                        department: 'Cashiers & Floor',
                        metadata: {
                            shiftId: shift.id,
                            cashier: shift.employee_name,
                            startingFloat: shift.starting_cash,
                            openedAt: shift.start_time,
                        },
                    });
                });
            }

            // 3. Live Database Ingestion: Pending Purchases
            const { data: pendingPurchases } = await supabase
                .from('purchases')
                .select('id, purchase_no, total_amount, purchase_date, status')
                .order('purchase_date', { ascending: false })
                .limit(5);

            if (pendingPurchases && pendingPurchases.length > 0) {
                pendingPurchases.forEach(po => {
                    dynamicLiveAlerts.push({
                        id: `live-po-${po.id}`,
                        title: `Purchase Order ${po.purchase_no || '#' + po.id} Logged`,
                        message: `PO valued at KES ${Number(po.total_amount || 0).toLocaleString()} recorded. Awaiting store verification and receipt voucher.`,
                        category: 'finance',
                        priority: 'medium',
                        timestamp: po.purchase_date || new Date().toISOString(),
                        read: false,
                        starred: false,
                        status: 'active',
                        actionUrl: '/dashboard/purchases',
                        actionLabel: 'Open Purchasing Ledger',
                        source: 'Procurement Master',
                        department: 'Store & Purchasing',
                        metadata: {
                            poId: po.id,
                            poNumber: po.purchase_no,
                            totalAmount: po.total_amount,
                            status: po.status,
                        },
                    });
                });
            }

            // 4. Default Seed Operational Notifications (Hotel, Security, Kitchen) if list is empty
            const standardSeedAlerts: SystemNotification[] = [
                {
                    id: 'seed-hotel-1',
                    title: 'VIP Guest Checkout Imminent - Suite 302',
                    message: 'Guest Dr. M. Kiprono is scheduled for checkout at 11:30 AM. Folio balance KES 34,500 pending final bill settlement.',
                    category: 'hotel',
                    priority: 'high',
                    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
                    read: false,
                    starred: true,
                    status: 'active',
                    actionUrl: '/dashboard/hotel/checkout',
                    actionLabel: 'Process Room Checkout',
                    source: 'Front Desk PMS',
                    department: 'Front Office',
                    metadata: { roomNumber: '302', guestName: 'Dr. M. Kiprono', balanceDue: 34500, plannedCheckout: '11:30 AM' },
                },
                {
                    id: 'seed-hotel-2',
                    title: 'Housekeeping Turn-down Pending - 4 Rooms',
                    message: 'Rooms 104, 208, 210 and Executive Suite 401 flagged dirty post-checkout. Ready for housekeeping inspection.',
                    category: 'hotel',
                    priority: 'medium',
                    timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
                    read: false,
                    starred: false,
                    status: 'active',
                    actionUrl: '/dashboard/hotel/housekeeping',
                    actionLabel: 'Housekeeping Roster',
                    source: 'Room Status Monitor',
                    department: 'Housekeeping',
                    metadata: { roomsFlagged: ['104', '208', '210', '401'], status: 'Dirty / Needs Inspection' },
                },
                {
                    id: 'seed-security-1',
                    title: 'System Security Audit: Role Permissions Updated',
                    message: 'Security policy update applied: POS void permissions and cashier discounts logged by Super Admin.',
                    category: 'security',
                    priority: 'info',
                    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    read: true,
                    starred: false,
                    status: 'acknowledged',
                    actionUrl: '/dashboard/user-roles',
                    actionLabel: 'Audit Role Privileges',
                    source: 'Access Controller',
                    department: 'Management',
                    metadata: { actor: 'Super Admin', auditedEntity: 'user_roles', ipAddress: '192.168.1.100' },
                },
                {
                    id: 'seed-pos-1',
                    title: 'High-Value Banquet Order Placed (Table #9)',
                    message: 'Large party dining order KES 89,400 submitted to main kitchen pass. 12 covers including prime steaks.',
                    category: 'pos',
                    priority: 'medium',
                    timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
                    read: true,
                    starred: false,
                    status: 'active',
                    actionUrl: '/dashboard/reports/pos',
                    actionLabel: 'View POS Register Audit',
                    source: 'POS Restaurant Server',
                    department: 'Service & Dining',
                    metadata: { table: 'Table #9', covers: 12, totalAmount: 89400, server: 'Dennis' },
                },
                {
                    id: 'seed-finance-1',
                    title: 'Monthly Withholding Tax & VAT Filing Reminder',
                    message: 'Kenya Revenue Authority (KRA) electronic filing due in 4 days. Reconcile monthly VAT return ledger.',
                    category: 'finance',
                    priority: 'high',
                    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                    read: false,
                    starred: true,
                    status: 'active',
                    actionUrl: '/dashboard/financial-reports',
                    actionLabel: 'Review Tax Ledger',
                    source: 'Tax & Compliance Bot',
                    department: 'Accounts',
                    metadata: { authority: 'KRA iTax', period: 'Current Month', returnType: 'VAT3 & WHT' },
                },
            ];

            // Deduplicate based on ID
            const map = new Map<string, SystemNotification>();
            standardSeedAlerts.forEach(n => map.set(n.id, n));
            baseList.forEach(n => map.set(n.id, n));
            dynamicLiveAlerts.forEach(n => map.set(n.id, n));

            const finalSorted = Array.from(map.values()).sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            setNotifications(finalSorted);
            localStorage.setItem('alphaplus_system_notifications', JSON.stringify(finalSorted));
        } catch (err: any) {
            console.error('Error fetching notifications:', err);
            toast.error('Could not sync notifications');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllNotifications();
    }, []);

    // ── Update Notification Helper ──
    const updateNotification = (id: string, updates: Partial<SystemNotification>) => {
        setNotifications(prev => {
            const next = prev.map(item => (item.id === id ? { ...item, ...updates } : item));
            localStorage.setItem('alphaplus_system_notifications', JSON.stringify(next));
            return next;
        });
    };

    // ── Handlers ──
    const handleToggleRead = (n: SystemNotification, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const nextState = !n.read;
        updateNotification(n.id, { read: nextState });
        toast.success(nextState ? 'Marked as read' : 'Marked as unread');
    };

    const handleToggleStar = (n: SystemNotification, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const nextState = !n.starred;
        updateNotification(n.id, { starred: nextState });
        toast.success(nextState ? 'Notification starred' : 'Removed from starred');
    };

    const handleAcknowledge = (n: SystemNotification, e?: React.MouseEvent) => {
        e?.stopPropagation();
        updateNotification(n.id, {
            status: 'acknowledged',
            acknowledgedBy: currentUser.name,
            read: true,
        });
        toast.success(`Acknowledged by ${currentUser.name}`);
        if (inspectModalItem?.id === n.id) {
            setInspectModalItem(prev => prev ? { ...prev, status: 'acknowledged', acknowledgedBy: currentUser.name, read: true } : null);
        }
    };

    const handleResolve = (n: SystemNotification, e?: React.MouseEvent) => {
        e?.stopPropagation();
        updateNotification(n.id, {
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
            read: true,
        });
        toast.success('Alert resolved & archived');
        if (inspectModalItem?.id === n.id) {
            setInspectModalItem(prev => prev ? { ...prev, status: 'resolved', resolvedAt: new Date().toISOString(), read: true } : null);
        }
    };

    const handleDelete = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setNotifications(prev => {
            const next = prev.filter(item => item.id !== id);
            localStorage.setItem('alphaplus_system_notifications', JSON.stringify(next));
            return next;
        });
        toast.success('Notification removed');
        if (inspectModalItem?.id === id) setInspectModalItem(null);
    };

    const handleMarkAllRead = () => {
        setNotifications(prev => {
            const next = prev.map(item => ({ ...item, read: true }));
            localStorage.setItem('alphaplus_system_notifications', JSON.stringify(next));
            return next;
        });
        toast.success('All notifications marked as read');
    };

    const handleInspect = (n: SystemNotification) => {
        if (preferences.autoMarkReadOnInspect && !n.read) {
            updateNotification(n.id, { read: true });
        }
        setInspectModalItem(n);
    };

    // ── Create Broadcast Announcement ──
    const handleBroadcastSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) {
            toast.error('Please enter title and announcement details');
            return;
        }

        const newAlert: SystemNotification = {
            id: `broadcast-${Date.now()}`,
            title: broadcastForm.title.trim(),
            message: broadcastForm.message.trim(),
            category: broadcastForm.category,
            priority: broadcastForm.priority,
            timestamp: new Date().toISOString(),
            read: false,
            starred: broadcastForm.priority === 'critical',
            status: 'active',
            actionUrl: broadcastForm.actionUrl,
            actionLabel: broadcastForm.actionLabel,
            source: `Broadcast (${currentUser.name})`,
            department: broadcastForm.department,
            metadata: {
                dispatchedBy: currentUser.name,
                userRole: currentUser.userType,
                channel: 'System-wide Push',
            },
        };

        setNotifications(prev => {
            const next = [newAlert, ...prev];
            localStorage.setItem('alphaplus_system_notifications', JSON.stringify(next));
            return next;
        });

        if (preferences.soundEnabled) {
            playNotificationSound(broadcastForm.priority === 'critical' ? 'critical' : 'chime');
        }

        toast.success('Announcement broadcasted to all terminal dashboards!');
        setIsBroadcastModalOpen(false);
        setBroadcastForm({
            title: '',
            message: '',
            category: 'inventory',
            priority: 'high',
            department: 'All Departments',
            actionUrl: '/dashboard/low-stock',
            actionLabel: 'Inspect & Resolve',
        });
    };

    // ── Save Preferences ──
    const handleSavePreferences = () => {
        localStorage.setItem('alphaplus_notif_prefs', JSON.stringify(preferences));
        toast.success('Notification settings saved successfully');
        setIsSettingsModalOpen(false);
    };

    // ── Export Audit Log ──
    const handleExportAudit = (format: 'csv' | 'json') => {
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(notifications, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `alphaplus-notifications-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('JSON Audit Log exported');
        } else {
            const headers = ['ID', 'Category', 'Priority', 'Title', 'Message', 'Source', 'Status', 'Timestamp', 'ActionURL'];
            const rows = notifications.map(n => [
                n.id,
                n.category,
                n.priority,
                `"${n.title.replace(/"/g, '""')}"`,
                `"${n.message.replace(/"/g, '""')}"`,
                `"${n.source.replace(/"/g, '""')}"`,
                n.status,
                n.timestamp,
                n.actionUrl,
            ]);
            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `alphaplus-notifications-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('CSV Audit Sheet exported');
        }
    };

    // ── Copy Payload ──
    const handleCopyPayload = (n: SystemNotification) => {
        navigator.clipboard.writeText(JSON.stringify(n, null, 2));
        toast.success('Notification payload copied to clipboard');
    };

    // ── Filtered Notifications ──
    const filteredNotifications = useMemo(() => {
        return notifications.filter(n => {
            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = n.title.toLowerCase().includes(q);
                const matchMsg = n.message.toLowerCase().includes(q);
                const matchSource = n.source.toLowerCase().includes(q);
                const matchDept = (n.department || '').toLowerCase().includes(q);
                if (!matchTitle && !matchMsg && !matchSource && !matchDept) return false;
            }

            // Category filter
            if (selectedCategory !== 'all' && n.category !== selectedCategory) return false;

            // Priority filter
            if (selectedPriority !== 'all' && n.priority !== selectedPriority) return false;

            // Status filter
            if (selectedStatus === 'unread' && n.read) return false;
            if (selectedStatus === 'starred' && !n.starred) return false;
            if (selectedStatus === 'acknowledged' && n.status !== 'acknowledged') return false;
            if (selectedStatus === 'resolved' && n.status !== 'resolved') return false;

            return true;
        });
    }, [notifications, searchQuery, selectedCategory, selectedPriority, selectedStatus]);

    // ── KPI Metrics ──
    const metrics = useMemo(() => {
        const total = notifications.length;
        const unread = notifications.filter(n => !n.read).length;
        const critical = notifications.filter(n => n.priority === 'critical' && n.status === 'active').length;
        const high = notifications.filter(n => n.priority === 'high' && n.status === 'active').length;
        const resolved = notifications.filter(n => n.status === 'resolved' || n.status === 'acknowledged').length;
        const starred = notifications.filter(n => n.starred).length;
        return { total, unread, critical, high, resolved, starred };
    }, [notifications]);

    // ── Format Relative Time ──
    const formatRelativeTime = (isoString: string) => {
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMin = Math.round(diffMs / (1000 * 60));
            if (diffMin < 1) return 'Just now';
            if (diffMin < 60) return `${diffMin}m ago`;
            const diffHours = Math.round(diffMin / 60);
            if (diffHours < 24) return `${diffHours}h ago`;
            const diffDays = Math.round(diffHours / 24);
            return `${diffDays}d ago`;
        } catch {
            return 'Recent';
        }
    };

    // ── Badge Helpers ──
    const getPriorityBadge = (priority: SystemNotification['priority']) => {
        switch (priority) {
            case 'critical':
                return {
                    label: 'Critical',
                    bg: 'bg-rose-50 text-rose-700 border-rose-200',
                    dot: 'bg-rose-500 animate-ping',
                    border: 'border-l-rose-500',
                };
            case 'high':
                return {
                    label: 'High Priority',
                    bg: 'bg-amber-50 text-amber-700 border-amber-200',
                    dot: 'bg-amber-500',
                    border: 'border-l-amber-500',
                };
            case 'medium':
                return {
                    label: 'Medium',
                    bg: 'bg-blue-50 text-blue-700 border-blue-200',
                    dot: 'bg-blue-500',
                    border: 'border-l-blue-500',
                };
            case 'low':
                return {
                    label: 'Low',
                    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    dot: 'bg-emerald-500',
                    border: 'border-l-emerald-500',
                };
            default:
                return {
                    label: 'Notice',
                    bg: 'bg-slate-50 text-slate-700 border-slate-200',
                    dot: 'bg-slate-400',
                    border: 'border-l-indigo-400',
                };
        }
    };

    const getCategoryDetails = (cat: SystemNotification['category']) => {
        switch (cat) {
            case 'inventory':
                return { label: 'Inventory & Stock', icon: '📦', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
            case 'pos':
                return { label: 'POS & Cashier', icon: '💳', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
            case 'hotel':
                return { label: 'Hotel & Front Desk', icon: '🏨', color: 'text-purple-700 bg-purple-50 border-purple-200' };
            case 'finance':
                return { label: 'Finance & Accounts', icon: '💰', color: 'text-cyan-700 bg-cyan-50 border-cyan-200' };
            case 'security':
                return { label: 'Security & Access', icon: '🛡️', color: 'text-rose-700 bg-rose-50 border-rose-200' };
            default:
                return { label: 'System Notice', icon: '⚡', color: 'text-slate-700 bg-slate-50 border-slate-200' };
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* ── TOP EXECUTIVE BANNER (BRIGHT GLASSMORPHIC) ── */}
            <div className="backdrop-blur-xl bg-white/90 border border-slate-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-100/40 via-purple-50/30 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Alpha Plus Live Operations Hub
                            </span>
                            <span className="text-xs text-slate-500 font-medium bg-slate-100/80 border border-slate-200 px-2.5 py-1 rounded-full">
                                Real-Time DB Sync Active
                            </span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                            System Notification Centre
                        </h1>
                        <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                            Centralized alert hub for low stock triggers, hotel room turn-overs, POS register shifts, unpaid invoices, and staff department announcements.
                        </p>
                    </div>

                    {/* Top Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            onClick={() => {
                                playNotificationSound(preferences.soundTone);
                                toast.success('Alert chime test played');
                            }}
                            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs shadow-sm transition-all active:scale-95"
                            title="Test Audio Chime"
                        >
                            <span>🔊</span>
                            <span>Test Sound</span>
                        </button>

                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs shadow-sm transition-all active:scale-95"
                        >
                            <span>⚙️</span>
                            <span>Preferences</span>
                        </button>

                        <div className="relative inline-block text-left">
                            <button
                                onClick={() => handleExportAudit('csv')}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs shadow-sm transition-all active:scale-95"
                            >
                                <span>📥</span>
                                <span>Export Audit</span>
                            </button>
                        </div>

                        <button
                            onClick={handleMarkAllRead}
                            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs shadow-sm transition-all active:scale-95"
                        >
                            <span>✓✓</span>
                            <span>Mark All Read</span>
                        </button>

                        <button
                            onClick={() => setIsBroadcastModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                        >
                            <span>📣</span>
                            <span>Broadcast Alert</span>
                        </button>
                    </div>
                </div>

                {/* ── 6 KPI METRICS CARDS (BRIGHT GLASS) ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100">
                    {/* Critical Alerts */}
                    <div
                        onClick={() => { setSelectedPriority('critical'); setSelectedStatus('all'); }}
                        className="cursor-pointer backdrop-blur-md bg-rose-50/60 hover:bg-rose-50 border border-rose-200/80 rounded-xl p-3.5 transition-all shadow-sm group"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-rose-700">Critical Alerts</span>
                            <span className="text-base group-hover:scale-110 transition-transform">🚨</span>
                        </div>
                        <div className="text-2xl font-black text-rose-900 mt-1">{metrics.critical}</div>
                        <p className="text-[11px] text-rose-600 font-medium mt-0.5">Immediate action</p>
                    </div>

                    {/* High Priority */}
                    <div
                        onClick={() => { setSelectedPriority('high'); setSelectedStatus('all'); }}
                        className="cursor-pointer backdrop-blur-md bg-amber-50/60 hover:bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 transition-all shadow-sm group"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-amber-700">High Priority</span>
                            <span className="text-base group-hover:scale-110 transition-transform">⚠️</span>
                        </div>
                        <div className="text-2xl font-black text-amber-900 mt-1">{metrics.high}</div>
                        <p className="text-[11px] text-amber-600 font-medium mt-0.5">Pars & Checkouts</p>
                    </div>

                    {/* Unread Feed */}
                    <div
                        onClick={() => { setSelectedStatus('unread'); setSelectedPriority('all'); }}
                        className="cursor-pointer backdrop-blur-md bg-purple-50/60 hover:bg-purple-50 border border-purple-200/80 rounded-xl p-3.5 transition-all shadow-sm group"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-purple-700">Unread</span>
                            <span className="text-base group-hover:scale-110 transition-transform">📫</span>
                        </div>
                        <div className="text-2xl font-black text-purple-900 mt-1">{metrics.unread}</div>
                        <p className="text-[11px] text-purple-600 font-medium mt-0.5">Pending review</p>
                    </div>

                    {/* Starred */}
                    <div
                        onClick={() => { setSelectedStatus('starred'); setSelectedPriority('all'); }}
                        className="cursor-pointer backdrop-blur-md bg-indigo-50/60 hover:bg-indigo-50 border border-indigo-200/80 rounded-xl p-3.5 transition-all shadow-sm group"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-indigo-700">Starred Pins</span>
                            <span className="text-base group-hover:scale-110 transition-transform">⭐</span>
                        </div>
                        <div className="text-2xl font-black text-indigo-900 mt-1">{metrics.starred}</div>
                        <p className="text-[11px] text-indigo-600 font-medium mt-0.5">Important items</p>
                    </div>

                    {/* Resolved / Acknowledged */}
                    <div
                        onClick={() => { setSelectedStatus('resolved'); setSelectedPriority('all'); }}
                        className="cursor-pointer backdrop-blur-md bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200/80 rounded-xl p-3.5 transition-all shadow-sm group"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-emerald-700">Resolved Today</span>
                            <span className="text-base group-hover:scale-110 transition-transform">✅</span>
                        </div>
                        <div className="text-2xl font-black text-emerald-900 mt-1">{metrics.resolved}</div>
                        <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Audited & closed</p>
                    </div>

                    {/* Total Operational Feed */}
                    <div
                        onClick={() => { setSelectedStatus('all'); setSelectedPriority('all'); setSelectedCategory('all'); }}
                        className="cursor-pointer backdrop-blur-md bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl p-3.5 transition-all shadow-sm group"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">Total Notifications</span>
                            <span className="text-base group-hover:scale-110 transition-transform">📊</span>
                        </div>
                        <div className="text-2xl font-black text-slate-900 mt-1">{metrics.total}</div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Full ledger logs</p>
                    </div>
                </div>
            </div>

            {/* ── SEARCH, FILTER PILLS & STATUS TABS ── */}
            <div className="backdrop-blur-xl bg-white/80 border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Search Bar */}
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            🔍
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search alerts by title, ingredient, room number, shift ID, cashier, or source..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Priority Selector Dropdown */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority:</span>
                        <select
                            value={selectedPriority}
                            onChange={e => setSelectedPriority(e.target.value as NotificationPriority)}
                            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                            <option value="all">All Severity Levels</option>
                            <option value="critical">🚨 Critical Only</option>
                            <option value="high">⚠️ High Priority</option>
                            <option value="medium">🔵 Medium</option>
                            <option value="low">🟢 Low</option>
                            <option value="info">ℹ️ Notices & Info</option>
                        </select>
                    </div>

                    {/* Status Tabs */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        {(['all', 'unread', 'starred', 'acknowledged', 'resolved'] as NotificationStatus[]).map(st => (
                            <button
                                key={st}
                                onClick={() => setSelectedStatus(st)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                                    selectedStatus === st
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Modules:</span>
                    {[
                        { id: 'all', label: 'All Modules', icon: '🌐' },
                        { id: 'inventory', label: 'Inventory & Kitchen', icon: '📦' },
                        { id: 'pos', label: 'POS & Dining', icon: '💳' },
                        { id: 'hotel', label: 'Hotel & Rooms', icon: '🏨' },
                        { id: 'finance', label: 'Finance & Invoices', icon: '💰' },
                        { id: 'security', label: 'Security & System', icon: '🛡️' },
                    ].map(cat => {
                        const count = cat.id === 'all'
                            ? notifications.length
                            : notifications.filter(n => n.category === cat.id).length;
                        const isSelected = selectedCategory === cat.id;

                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id as NotificationCategory)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                    isSelected
                                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                                }`}
                            >
                                <span>{cat.icon}</span>
                                <span>{cat.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── NOTIFICATIONS FEED LIST ── */}
            <div className="space-y-3">
                {loading ? (
                    <div className="backdrop-blur-xl bg-white/80 border border-slate-200/80 rounded-2xl p-12 text-center shadow-sm">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <h3 className="text-base font-bold text-slate-800">Syncing live system telemetry...</h3>
                        <p className="text-xs text-slate-500 mt-1">Checking inventory pars, open shifts, hotel checkouts, and pending vouchers.</p>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="backdrop-blur-xl bg-white/80 border border-slate-200/80 rounded-2xl p-16 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 shadow-sm">
                            🎉
                        </div>
                        <h3 className="text-lg font-extrabold text-slate-900">Zero Pending Alerts</h3>
                        <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                            No notifications match your active filter criteria. All inventory pars, register shifts, and hotel operations are running optimally.
                        </p>
                        <div className="mt-5 flex justify-center gap-3">
                            <button
                                onClick={() => { setSelectedCategory('all'); setSelectedPriority('all'); setSelectedStatus('all'); setSearchQuery(''); }}
                                className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-xl hover:bg-indigo-100 transition-colors"
                            >
                                Reset All Filters
                            </button>
                            <button
                                onClick={() => setIsBroadcastModalOpen(true)}
                                className="px-4 py-2 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 transition-colors"
                            >
                                Create Announcement
                            </button>
                        </div>
                    </div>
                ) : (
                    filteredNotifications.map(item => {
                        const priorityBadge = getPriorityBadge(item.priority);
                        const categoryInfo = getCategoryDetails(item.category);

                        return (
                            <div
                                key={item.id}
                                onClick={() => handleInspect(item)}
                                className={`group relative backdrop-blur-xl bg-white/95 hover:bg-white border transition-all rounded-2xl p-5 shadow-sm hover:shadow-md border-l-4 cursor-pointer ${priorityBadge.border} ${
                                    !item.read ? 'border-slate-300 ring-1 ring-indigo-500/10' : 'border-slate-200/80 opacity-90'
                                }`}
                            >
                                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                    {/* Main Notification Content */}
                                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                        {/* Icon Container */}
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border shadow-sm ${categoryInfo.color}`}>
                                            {categoryInfo.icon}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* Meta Header */}
                                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                {/* Priority Badge */}
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${priorityBadge.bg}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${priorityBadge.dot}`} />
                                                    {priorityBadge.label}
                                                </span>

                                                {/* Module Badge */}
                                                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                                    {categoryInfo.label}
                                                </span>

                                                {/* Source Tag */}
                                                <span className="text-[11px] text-slate-500 font-medium">
                                                    via <strong className="text-slate-700">{item.source}</strong>
                                                </span>

                                                {/* Time Stamp */}
                                                <span className="text-[11px] text-slate-400 font-medium ml-auto lg:ml-0">
                                                    • {formatRelativeTime(item.timestamp)}
                                                </span>

                                                {/* Unread Indicator */}
                                                {!item.read && (
                                                    <span className="w-2 h-2 rounded-full bg-indigo-600 ring-4 ring-indigo-100" title="Unread" />
                                                )}
                                            </div>

                                            {/* Title */}
                                            <h3 className={`text-base font-extrabold tracking-tight ${!item.read ? 'text-slate-900' : 'text-slate-800'}`}>
                                                {item.title}
                                            </h3>

                                            {/* Body */}
                                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                                {item.message}
                                            </p>

                                            {/* Metadata Pills */}
                                            {item.metadata && Object.keys(item.metadata).length > 0 && (
                                                <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                                                    {Object.entries(item.metadata).slice(0, 4).map(([key, val]) => (
                                                        <span key={key} className="inline-flex items-center gap-1 text-[11px] bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700 font-medium">
                                                            <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                                                            <strong className="text-slate-800">{String(val)}</strong>
                                                        </span>
                                                    ))}
                                                    {item.status === 'acknowledged' && (
                                                        <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-800 font-bold">
                                                            ✓ Acknowledged by {item.acknowledgedBy || 'Staff'}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons Right Side */}
                                    <div className="flex items-center gap-2 lg:flex-col lg:items-end justify-end flex-shrink-0 pt-2 lg:pt-0">
                                        {/* Direct Page Resolution Button */}
                                        <Link
                                            href={item.actionUrl}
                                            onClick={e => e.stopPropagation()}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-all active:scale-95 group/btn"
                                        >
                                            <span>{item.actionLabel || 'Open Page'}</span>
                                            <span className="group-hover/btn:translate-x-0.5 transition-transform">→</span>
                                        </Link>

                                        {/* Quick Action Icon Row */}
                                        <div className="flex items-center gap-1">
                                            {/* Star / Unstar */}
                                            <button
                                                onClick={e => handleToggleStar(item, e)}
                                                className={`p-2 rounded-lg border text-xs transition-colors ${
                                                    item.starred
                                                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                                                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-amber-500'
                                                }`}
                                                title={item.starred ? 'Starred' : 'Star notification'}
                                            >
                                                ★
                                            </button>

                                            {/* Toggle Read */}
                                            <button
                                                onClick={e => handleToggleRead(item, e)}
                                                className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors"
                                                title={item.read ? 'Mark as unread' : 'Mark as read'}
                                            >
                                                {item.read ? '✉️' : '📫'}
                                            </button>

                                            {/* Quick Inspect Modal Button */}
                                            <button
                                                onClick={e => { e.stopPropagation(); handleInspect(item); }}
                                                className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-xs transition-colors"
                                                title="Inspect audit modal"
                                            >
                                                🔍
                                            </button>

                                            {/* Dismiss */}
                                            <button
                                                onClick={e => handleDelete(item.id, e)}
                                                className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs transition-colors"
                                                title="Dismiss alert"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ═════════════════════════════════════════════════════════════════════ */}
            {/* ── MODAL 1: NOTIFICATION INSPECT & AUDIT MODAL ────────────────────── */}
            {/* ═════════════════════════════════════════════════════════════════════ */}
            {inspectModalItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
                    <div
                        onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-scaleUp"
                    >
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border shadow-sm ${getCategoryDetails(inspectModalItem.category).color}`}>
                                    {getCategoryDetails(inspectModalItem.category).icon}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadge(inspectModalItem.priority).bg}`}>
                                            {getPriorityBadge(inspectModalItem.priority).label}
                                        </span>
                                        <span className="text-xs text-slate-500 font-semibold">
                                            Event ID: {inspectModalItem.id}
                                        </span>
                                    </div>
                                    <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                                        {inspectModalItem.title}
                                    </h2>
                                </div>
                            </div>
                            <button
                                onClick={() => setInspectModalItem(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-sm text-slate-700">
                            {/* Message Block */}
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Alert Description</h4>
                                <p className="text-slate-800 leading-relaxed font-medium">
                                    {inspectModalItem.message}
                                </p>
                            </div>

                            {/* Event Metadata Table */}
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Audit Payload Attributes</h4>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="grid grid-cols-2 p-3 border-b border-slate-100 text-xs">
                                        <span className="text-slate-500 font-semibold">Category Module:</span>
                                        <span className="font-bold text-slate-800 capitalize">{inspectModalItem.category}</span>
                                    </div>
                                    <div className="grid grid-cols-2 p-3 border-b border-slate-100 text-xs">
                                        <span className="text-slate-500 font-semibold">Originating Source:</span>
                                        <span className="font-bold text-slate-800">{inspectModalItem.source}</span>
                                    </div>
                                    <div className="grid grid-cols-2 p-3 border-b border-slate-100 text-xs">
                                        <span className="text-slate-500 font-semibold">Target Department:</span>
                                        <span className="font-bold text-slate-800">{inspectModalItem.department || 'All Hotel Staff'}</span>
                                    </div>
                                    <div className="grid grid-cols-2 p-3 border-b border-slate-100 text-xs">
                                        <span className="text-slate-500 font-semibold">Timestamp:</span>
                                        <span className="font-bold text-slate-800">{new Date(inspectModalItem.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="grid grid-cols-2 p-3 border-b border-slate-100 text-xs">
                                        <span className="text-slate-500 font-semibold">Lifecycle Status:</span>
                                        <span className="font-bold text-slate-800 uppercase">{inspectModalItem.status}</span>
                                    </div>
                                    {inspectModalItem.acknowledgedBy && (
                                        <div className="grid grid-cols-2 p-3 border-b border-slate-100 text-xs bg-emerald-50/50">
                                            <span className="text-emerald-700 font-semibold">Acknowledged By:</span>
                                            <span className="font-bold text-emerald-900">{inspectModalItem.acknowledgedBy}</span>
                                        </div>
                                    )}
                                    {inspectModalItem.metadata && Object.entries(inspectModalItem.metadata).map(([k, v]) => (
                                        <div key={k} className="grid grid-cols-2 p-3 border-b border-slate-100 last:border-b-0 text-xs">
                                            <span className="text-slate-500 font-semibold capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                                            <span className="font-bold text-indigo-700 break-words">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Direct Target Navigation Alert */}
                            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-bold text-indigo-900">Destination Resolution Route</div>
                                    <div className="text-xs text-indigo-700 font-mono mt-0.5">{inspectModalItem.actionUrl}</div>
                                </div>
                                <Link
                                    href={inspectModalItem.actionUrl}
                                    onClick={() => setInspectModalItem(null)}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all"
                                >
                                    Open Page Now →
                                </Link>
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleCopyPayload(inspectModalItem)}
                                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-xs transition-colors"
                                >
                                    📋 Copy JSON
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-xs transition-colors"
                                >
                                    🖨️ Print Slip
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                {inspectModalItem.status !== 'acknowledged' && inspectModalItem.status !== 'resolved' && (
                                    <button
                                        onClick={() => handleAcknowledge(inspectModalItem)}
                                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-sm transition-colors"
                                    >
                                        ✓ Acknowledge Alert
                                    </button>
                                )}
                                {inspectModalItem.status !== 'resolved' && (
                                    <button
                                        onClick={() => handleResolve(inspectModalItem)}
                                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                                    >
                                        ✓ Mark Resolved
                                    </button>
                                )}
                                <button
                                    onClick={() => setInspectModalItem(null)}
                                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════════ */}
            {/* ── MODAL 2: BROADCAST SYSTEM ANNOUNCEMENT ─────────────────────────── */}
            {/* ═════════════════════════════════════════════════════════════════════ */}
            {isBroadcastModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
                    <div
                        onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col animate-scaleUp"
                    >
                        <form onSubmit={handleBroadcastSubmit}>
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-md">
                                        📣
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-extrabold text-slate-900">Broadcast System Alert</h2>
                                        <p className="text-xs text-slate-500 mt-0.5">Dispatch real-time notification to all terminal dashboards</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsBroadcastModalOpen(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-4 text-xs">
                                {/* Title */}
                                <div>
                                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Alert Headline / Title *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={broadcastForm.title}
                                        onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                                        placeholder="e.g., Kitchen Par Notice: Fresh Salmon Consignment Received"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>

                                {/* Category & Priority Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Operational Module
                                        </label>
                                        <select
                                            value={broadcastForm.category}
                                            onChange={e => setBroadcastForm({ ...broadcastForm, category: e.target.value as any })}
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none"
                                        >
                                            <option value="inventory">📦 Inventory & Stock</option>
                                            <option value="pos">💳 POS & Restaurant</option>
                                            <option value="hotel">🏨 Hotel Front Desk</option>
                                            <option value="finance">💰 Finance & Accounts</option>
                                            <option value="security">🛡️ Security & Notice</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Urgency Severity
                                        </label>
                                        <select
                                            value={broadcastForm.priority}
                                            onChange={e => setBroadcastForm({ ...broadcastForm, priority: e.target.value as any })}
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none"
                                        >
                                            <option value="critical">🚨 Critical (Audio Warning)</option>
                                            <option value="high">⚠️ High Priority</option>
                                            <option value="medium">🔵 Medium Operational</option>
                                            <option value="low">🟢 Low Notice</option>
                                            <option value="info">ℹ️ Info Only</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Department & Target Action Link */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Target Department
                                        </label>
                                        <select
                                            value={broadcastForm.department}
                                            onChange={e => setBroadcastForm({ ...broadcastForm, department: e.target.value })}
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none"
                                        >
                                            <option value="All Departments">All Hotel & Staff</option>
                                            <option value="Kitchen & Stores">Kitchen & Stores</option>
                                            <option value="Cashiers & Floor">Cashiers & POS</option>
                                            <option value="Front Office">Front Office & PMS</option>
                                            <option value="Housekeeping">Housekeeping</option>
                                            <option value="Accounts & Finance">Accounts & Finance</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Direct Resolution URL
                                        </label>
                                        <input
                                            type="text"
                                            value={broadcastForm.actionUrl}
                                            onChange={e => setBroadcastForm({ ...broadcastForm, actionUrl: e.target.value })}
                                            placeholder="/dashboard/low-stock"
                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs focus:outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Message */}
                                <div>
                                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Announcement Details *
                                    </label>
                                    <textarea
                                        rows={3}
                                        required
                                        value={broadcastForm.message}
                                        onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                                        placeholder="Detailed instructions or context for floor staff..."
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsBroadcastModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                                >
                                    Dispatch Announcement Now 🚀
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════════ */}
            {/* ── MODAL 3: NOTIFICATION PREFERENCES & SETTINGS ───────────────────── */}
            {/* ═════════════════════════════════════════════════════════════════════ */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
                    <div
                        onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col animate-scaleUp"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg border">
                                    ⚙️
                                </div>
                                <div>
                                    <h2 className="text-lg font-extrabold text-slate-900">Notification Preferences</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Customize sound alerts and operational behaviors</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4 text-xs">
                            {/* Audio Chime Switch */}
                            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                                <div>
                                    <div className="font-bold text-slate-800">Operational Sound Chime</div>
                                    <div className="text-slate-500 text-[11px] mt-0.5">Play audio ping on critical low stock & VIP checkouts</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={preferences.soundEnabled}
                                    onChange={e => setPreferences({ ...preferences, soundEnabled: e.target.checked })}
                                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>

                            {/* Sound Tone Style */}
                            {preferences.soundEnabled && (
                                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                                    <div className="font-bold text-slate-800">Chime Tone Style</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['chime', 'ping', 'critical'] as const).map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => {
                                                    setPreferences({ ...preferences, soundTone: t });
                                                    playNotificationSound(t);
                                                }}
                                                className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                                                    preferences.soundTone === t
                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Auto Mark Read On Inspect */}
                            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                                <div>
                                    <div className="font-bold text-slate-800">Auto-Mark Read on Click</div>
                                    <div className="text-slate-500 text-[11px] mt-0.5">Automatically mark unread alerts as read when opened</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={preferences.autoMarkReadOnInspect}
                                    onChange={e => setPreferences({ ...preferences, autoMarkReadOnInspect: e.target.checked })}
                                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>

                            {/* Email Digest */}
                            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                                <div>
                                    <div className="font-bold text-slate-800">Manager Daily Email Summary</div>
                                    <div className="text-slate-500 text-[11px] mt-0.5">Send nightly audit recap of low-stock and voided sales</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={preferences.emailDigest}
                                    onChange={e => setPreferences({ ...preferences, emailDigest: e.target.checked })}
                                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSavePreferences}
                                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                            >
                                Save Preferences
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
