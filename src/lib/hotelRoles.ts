// Hotel Roles & Permissions Architecture for AlphaPlus Web
// Tailored for Kenyan Hotels, Resorts, Lodges & Restaurants

export interface PermissionDefinition {
    key: string;
    label: string;
    module: string;
    moduleName: string;
    icon: string;
    description: string;
}

export interface HotelRole {
    role_id: string;
    role_name: string;
    department: string;
    description: string;
    color_gradient: string;
    badge_color: string;
    emoji: string;
    is_system?: boolean;
    is_super_admin?: boolean;
    permissions: Record<string, boolean>;
    created_at?: string;
    updated_at?: string;
}

export const PERMISSION_MODULES = [
    { id: 'pos', name: 'Restaurant & POS Floor', icon: '🍽️', color: 'from-blue-500 to-indigo-600' },
    { id: 'hotel', name: 'Hotel Rooms & Front Desk', icon: '🏨', color: 'from-emerald-500 to-teal-600' },
    { id: 'kitchen', name: 'Kitchen & Culinary', icon: '👨‍🍳', color: 'from-amber-500 to-orange-600' },
    { id: 'inventory', name: 'Stores & Inventory', icon: '📦', color: 'from-violet-500 to-purple-600' },
    { id: 'cashier', name: 'Cashiering & Financials', icon: '💰', color: 'from-rose-500 to-pink-600' },
    { id: 'admin', name: 'System Security & Settings', icon: '⚙️', color: 'from-slate-600 to-slate-800' },
] as const;

export const HOTEL_DEPARTMENTS = [
    { id: 'all', name: 'All Departments', icon: '🏢' },
    { id: 'Management', name: 'Executive Management', icon: '💼' },
    { id: 'Front Office', name: 'Front Desk & Reception', icon: '🛎️' },
    { id: 'Food & Beverage', name: 'F&B Service & Bar', icon: '🍷' },
    { id: 'Kitchen', name: 'Kitchen & Culinary', icon: '👨‍🍳' },
    { id: 'Housekeeping', name: 'Housekeeping & Rooms', icon: '🧹' },
    { id: 'Store & Purchasing', name: 'Stores & Procurement', icon: '📦' },
    { id: 'Finance & Accounts', name: 'Finance & Cashiering', icon: '💵' },
    { id: 'Security & IT', name: 'Security & Systems', icon: '🛡️' },
] as const;

export const PERMISSIONS_LIST: PermissionDefinition[] = [
    // 1. POS & Restaurant
    { key: 'pos_access', label: 'Access POS Terminal', module: 'pos', moduleName: 'Restaurant & POS Floor', icon: '🖥️', description: 'Open POS register & view tables' },
    { key: 'take_orders', label: 'Take Orders & Send KOT', module: 'pos', moduleName: 'Restaurant & POS Floor', icon: '📝', description: 'Create food/drink orders & dispatch to kitchen' },
    { key: 'apply_discounts', label: 'Apply Bill Discounts', module: 'pos', moduleName: 'Restaurant & POS Floor', icon: '🏷️', description: 'Apply percentage or fixed discounts to table bills' },
    { key: 'void_items', label: 'Void Items & Cancel Orders', module: 'pos', moduleName: 'Restaurant & POS Floor', icon: '🚫', description: 'Cancel placed items or order tickets (supervisor)' },
    { key: 'split_merge_bills', label: 'Split & Merge Bills', module: 'pos', moduleName: 'Restaurant & POS Floor', icon: '🧾', description: 'Split customer bills or merge multiple tables' },
    { key: 'reprint_receipts', label: 'Reprint Previous Receipts', module: 'pos', moduleName: 'Restaurant & POS Floor', icon: '🖨️', description: 'Reprint past sales receipts and pro-forma bills' },

    // 2. Hotel Rooms & PMS
    { key: 'hotel_reservations', label: 'Manage Reservations', module: 'hotel', moduleName: 'Hotel Rooms & Front Desk', icon: '📅', description: 'Book future room reservations & check availability' },
    { key: 'guest_checkin_checkout', label: 'Guest Check-in & Check-out', module: 'hotel', moduleName: 'Hotel Rooms & Front Desk', icon: '🔑', description: 'Perform guest registration and checkout settlements' },
    { key: 'room_folios', label: 'Post Extra Folio Charges', module: 'hotel', moduleName: 'Hotel Rooms & Front Desk', icon: '💳', description: 'Bill restaurant food or laundry to room folios' },
    { key: 'housekeeping_management', label: 'Housekeeping & Clean Status', module: 'hotel', moduleName: 'Hotel Rooms & Front Desk', icon: '🧹', description: 'Change room status: Clean, Dirty, Inspection, Out of Order' },
    { key: 'night_audit', label: 'Perform Night Audit', module: 'hotel', moduleName: 'Hotel Rooms & Front Desk', icon: '🌙', description: 'Post room rates & run end-of-day hospitality audit' },

    // 3. Kitchen & Culinary
    { key: 'kitchen_kds', label: 'Kitchen Display (KDS)', module: 'kitchen', moduleName: 'Kitchen & Culinary', icon: '🍳', description: 'View incoming kitchen orders & mark dishes prepared' },
    { key: 'recipe_management', label: 'View & Manage Recipes', module: 'kitchen', moduleName: 'Kitchen & Culinary', icon: '📖', description: 'Access dish recipes and raw ingredient requirements' },
    { key: 'record_spoilage', label: 'Log Food Spoilage & Wastage', module: 'kitchen', moduleName: 'Kitchen & Culinary', icon: '🗑️', description: 'Record burnt, expired, or damaged kitchen food' },

    // 4. Stores & Inventory
    { key: 'view_stock', label: 'View Stock & Low Alerts', module: 'inventory', moduleName: 'Stores & Inventory', icon: '📊', description: 'Monitor live product and raw ingredient inventory' },
    { key: 'stock_adjustments', label: 'Stock Intake & Adjustments', module: 'inventory', moduleName: 'Stores & Inventory', icon: '📥', description: 'Enter received stock from suppliers and manual count corrections' },
    { key: 'stock_transfers', label: 'Stock Godown Transfers', module: 'inventory', moduleName: 'Stores & Inventory', icon: '🔄', description: 'Transfer goods from Main Store to Kitchen / Restaurant Bars' },
    { key: 'store_requisitions', label: 'Approve & Issue Requisitions', module: 'inventory', moduleName: 'Stores & Inventory', icon: '📋', description: 'Process department ingredient & supply issue requests' },
    { key: 'manage_suppliers', label: 'Suppliers & Purchase Orders', module: 'inventory', moduleName: 'Stores & Inventory', icon: '🚛', description: 'Manage supplier contacts, credit terms & PO invoices' },

    // 5. Cashiering & Financials
    { key: 'open_close_shifts', label: 'Open / Close Cashier Shifts', module: 'cashier', moduleName: 'Cashiering & Financials', icon: '⏱️', description: 'Manage register drawer, opening cash & shift closing' },
    { key: 'receive_payments', label: 'Accept Payments (Cash/M-Pesa/Card)', module: 'cashier', moduleName: 'Cashiering & Financials', icon: '💵', description: 'Receive customer payments, verify M-Pesa STK & C2B' },
    { key: 'cash_drops_expenses', label: 'Record Cash Drops & Expenses', module: 'cashier', moduleName: 'Cashiering & Financials', icon: '💸', description: 'Log safe cash drops and petty cash shift expenses' },
    { key: 'view_financial_reports', label: 'Sales Reports & Shift Z-Reports', module: 'cashier', moduleName: 'Cashiering & Financials', icon: '📈', description: 'View daily revenue, payment summaries, and cashier variances' },
    { key: 'view_tax_reports', label: 'KRA / Tax Compliance Reports', module: 'cashier', moduleName: 'Cashiering & Financials', icon: '📑', description: 'Access VAT 16%, Catering Levy 2% and tax breakdowns' },

    // 6. System Security & Settings
    { key: 'manage_staff_users', label: 'Create & Manage Staff', module: 'admin', moduleName: 'System Security & Settings', icon: '👥', description: 'Add, edit, deactivate staff accounts and assign PINs' },
    { key: 'manage_roles', label: 'Manage Roles & Permissions', module: 'admin', moduleName: 'System Security & Settings', icon: '🛡️', description: 'Customize access rights and permission matrix' },
    { key: 'system_settings', label: 'Hotel & Hardware Settings', module: 'admin', moduleName: 'System Security & Settings', icon: '⚙️', description: 'Setup network thermal printers, KRA keys, till numbers' },
    { key: 'view_audit_logs', label: 'View System Audit Logs', module: 'admin', moduleName: 'System Security & Settings', icon: '🔍', description: 'Inspect audit trail of all staff transactions and actions' },
];

export const PRESET_HOTEL_ROLES: HotelRole[] = [
    {
        role_id: 'super-admin',
        role_name: 'Super Admin',
        department: 'Management',
        description: 'Complete hotel control with full unrestricted administrative authority across all modules.',
        color_gradient: 'from-purple-600 via-indigo-600 to-pink-600',
        badge_color: 'bg-purple-100 text-purple-800 border-purple-200',
        emoji: '👑',
        is_system: true,
        is_super_admin: true,
        permissions: PERMISSIONS_LIST.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
    },
    {
        role_id: 'general-manager',
        role_name: 'General Manager',
        department: 'Management',
        description: 'Hotel operational executive: full financial visibility, staff oversight, guest folios & inventory management.',
        color_gradient: 'from-blue-600 to-cyan-600',
        badge_color: 'bg-blue-100 text-blue-800 border-blue-200',
        emoji: '💼',
        is_system: true,
        permissions: {
            pos_access: true,
            take_orders: true,
            apply_discounts: true,
            void_items: true,
            split_merge_bills: true,
            reprint_receipts: true,
            hotel_reservations: true,
            guest_checkin_checkout: true,
            room_folios: true,
            housekeeping_management: true,
            night_audit: true,
            kitchen_kds: true,
            recipe_management: true,
            record_spoilage: true,
            view_stock: true,
            stock_adjustments: true,
            stock_transfers: true,
            store_requisitions: true,
            manage_suppliers: true,
            open_close_shifts: true,
            receive_payments: true,
            cash_drops_expenses: true,
            view_financial_reports: true,
            view_tax_reports: true,
            manage_staff_users: true,
            manage_roles: false,
            system_settings: true,
            view_audit_logs: true,
        },
    },
    {
        role_id: 'fb-supervisor',
        role_name: 'Supervisor',
        department: 'Food & Beverage',
        description: 'F&B floor leader: void approvals, bill discounts, split/merge tables, shift cash drop audits & waiter oversight.',
        color_gradient: 'from-amber-500 to-orange-600',
        badge_color: 'bg-amber-100 text-amber-800 border-amber-200',
        emoji: '🎯',
        is_system: true,
        permissions: {
            pos_access: true,
            take_orders: true,
            apply_discounts: true,
            void_items: true,
            split_merge_bills: true,
            reprint_receipts: true,
            hotel_reservations: false,
            guest_checkin_checkout: false,
            room_folios: true,
            housekeeping_management: false,
            night_audit: false,
            kitchen_kds: true,
            recipe_management: false,
            record_spoilage: true,
            view_stock: true,
            stock_adjustments: false,
            stock_transfers: true,
            store_requisitions: true,
            manage_suppliers: false,
            open_close_shifts: true,
            receive_payments: true,
            cash_drops_expenses: true,
            view_financial_reports: true,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'front-desk-agent',
        role_name: 'Front Desk Agent',
        department: 'Front Office',
        description: 'Front office receptionist: room reservations, guest check-in/out, keycards, folios, and direct room billing.',
        color_gradient: 'from-teal-500 to-emerald-600',
        badge_color: 'bg-teal-100 text-teal-800 border-teal-200',
        emoji: '🛎️',
        is_system: true,
        permissions: {
            pos_access: true,
            take_orders: false,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: false,
            reprint_receipts: true,
            hotel_reservations: true,
            guest_checkin_checkout: true,
            room_folios: true,
            housekeeping_management: true,
            night_audit: false,
            kitchen_kds: false,
            recipe_management: false,
            record_spoilage: false,
            view_stock: false,
            stock_adjustments: false,
            stock_transfers: false,
            store_requisitions: false,
            manage_suppliers: false,
            open_close_shifts: true,
            receive_payments: true,
            cash_drops_expenses: true,
            view_financial_reports: true,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'cashier',
        role_name: 'Cashier',
        department: 'Finance & Accounts',
        description: 'Point of sale cashier: tender payments via Cash / M-Pesa, issue receipts, close shifts, record petty cash expenses.',
        color_gradient: 'from-emerald-500 to-green-600',
        badge_color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        emoji: '💰',
        is_system: true,
        permissions: {
            pos_access: true,
            take_orders: true,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: true,
            reprint_receipts: true,
            hotel_reservations: false,
            guest_checkin_checkout: false,
            room_folios: true,
            housekeeping_management: false,
            night_audit: false,
            kitchen_kds: false,
            recipe_management: false,
            record_spoilage: false,
            view_stock: false,
            stock_adjustments: false,
            stock_transfers: false,
            store_requisitions: false,
            manage_suppliers: false,
            open_close_shifts: true,
            receive_payments: true,
            cash_drops_expenses: true,
            view_financial_reports: false,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'waiter',
        role_name: 'Waiter',
        department: 'Food & Beverage',
        description: 'Dining floor service: take customer orders, send KOT to kitchen, manage table orders, request printed bills.',
        color_gradient: 'from-indigo-500 to-blue-600',
        badge_color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        emoji: '🍽️',
        is_system: true,
        permissions: {
            pos_access: true,
            take_orders: true,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: false,
            reprint_receipts: false,
            hotel_reservations: false,
            guest_checkin_checkout: false,
            room_folios: false,
            housekeeping_management: false,
            night_audit: false,
            kitchen_kds: false,
            recipe_management: false,
            record_spoilage: false,
            view_stock: false,
            stock_adjustments: false,
            stock_transfers: false,
            store_requisitions: false,
            manage_suppliers: false,
            open_close_shifts: false,
            receive_payments: false,
            cash_drops_expenses: false,
            view_financial_reports: false,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'head-chef',
        role_name: 'Head Chef',
        department: 'Kitchen',
        description: 'Kitchen & culinary lead: view kitchen display tickets, monitor dish prep, dish spoilage and ingredient requisitions.',
        color_gradient: 'from-orange-500 to-rose-600',
        badge_color: 'bg-orange-100 text-orange-800 border-orange-200',
        emoji: '👨‍🍳',
        is_system: true,
        permissions: {
            pos_access: false,
            take_orders: false,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: false,
            reprint_receipts: false,
            hotel_reservations: false,
            guest_checkin_checkout: false,
            room_folios: false,
            housekeeping_management: false,
            night_audit: false,
            kitchen_kds: true,
            recipe_management: true,
            record_spoilage: true,
            view_stock: true,
            stock_adjustments: false,
            stock_transfers: false,
            store_requisitions: true,
            manage_suppliers: false,
            open_close_shifts: false,
            receive_payments: false,
            cash_drops_expenses: false,
            view_financial_reports: false,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'housekeeper',
        role_name: 'Housekeeping Supervisor',
        department: 'Housekeeping',
        description: 'Rooms sanitation: room cleaning schedules, maintenance flags, inspection completion, minibar restock tickets.',
        color_gradient: 'from-sky-500 to-blue-600',
        badge_color: 'bg-sky-100 text-sky-800 border-sky-200',
        emoji: '🧹',
        is_system: true,
        permissions: {
            pos_access: false,
            take_orders: false,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: false,
            reprint_receipts: false,
            hotel_reservations: false,
            guest_checkin_checkout: false,
            room_folios: false,
            housekeeping_management: true,
            night_audit: false,
            kitchen_kds: false,
            recipe_management: false,
            record_spoilage: false,
            view_stock: false,
            stock_adjustments: false,
            stock_transfers: false,
            store_requisitions: true,
            manage_suppliers: false,
            open_close_shifts: false,
            receive_payments: false,
            cash_drops_expenses: false,
            view_financial_reports: false,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'storekeeper',
        role_name: 'Storekeeper',
        department: 'Store & Purchasing',
        description: 'Inventory custodian: stock intake GRN, ingredient issues to kitchen/bar, physical stock counts & supplier orders.',
        color_gradient: 'from-violet-500 to-purple-600',
        badge_color: 'bg-violet-100 text-violet-800 border-violet-200',
        emoji: '📦',
        is_system: true,
        permissions: {
            pos_access: false,
            take_orders: false,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: false,
            reprint_receipts: false,
            hotel_reservations: false,
            guest_checkin_checkout: false,
            room_folios: false,
            housekeeping_management: false,
            night_audit: false,
            kitchen_kds: false,
            recipe_management: false,
            record_spoilage: true,
            view_stock: true,
            stock_adjustments: true,
            stock_transfers: true,
            store_requisitions: true,
            manage_suppliers: true,
            open_close_shifts: false,
            receive_payments: false,
            cash_drops_expenses: false,
            view_financial_reports: false,
            view_tax_reports: false,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: false,
        },
    },
    {
        role_id: 'night-auditor',
        role_name: 'Night Auditor',
        department: 'Finance & Accounts',
        description: 'Night audit officer: end-of-day room rate rollover, cashier drawer reconciliation, daily audit reporting.',
        color_gradient: 'from-indigo-800 to-slate-900',
        badge_color: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        emoji: '🌙',
        is_system: true,
        permissions: {
            pos_access: true,
            take_orders: false,
            apply_discounts: false,
            void_items: false,
            split_merge_bills: false,
            reprint_receipts: true,
            hotel_reservations: true,
            guest_checkin_checkout: true,
            room_folios: true,
            housekeeping_management: true,
            night_audit: true,
            kitchen_kds: false,
            recipe_management: false,
            record_spoilage: false,
            view_stock: true,
            stock_adjustments: false,
            stock_transfers: false,
            store_requisitions: false,
            manage_suppliers: false,
            open_close_shifts: true,
            receive_payments: true,
            cash_drops_expenses: true,
            view_financial_reports: true,
            view_tax_reports: true,
            manage_staff_users: false,
            manage_roles: false,
            system_settings: false,
            view_audit_logs: true,
        },
    },
];

const LOCAL_STORAGE_KEY = 'alphaplus_hotel_roles_v2';

/**
 * Loads roles from localStorage, falling back to PRESET_HOTEL_ROLES.
 * Safe for SSR (checks window != undefined).
 */
export function getLocalHotelRoles(): HotelRole[] {
    if (typeof window === 'undefined') {
        return PRESET_HOTEL_ROLES;
    }

    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Ensure Super Admin is always present
                const hasAdmin = parsed.some((r: HotelRole) => r.is_super_admin || r.role_name === 'Super Admin');
                if (!hasAdmin) {
                    return [PRESET_HOTEL_ROLES[0], ...parsed];
                }
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to parse stored roles, falling back to presets', e);
    }

    // Default: initialize localStorage with presets
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(PRESET_HOTEL_ROLES));
    } catch {}

    return PRESET_HOTEL_ROLES;
}

/**
 * Saves roles list to localStorage and fires a custom event for real-time tab sync.
 */
export function saveLocalHotelRoles(roles: HotelRole[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(roles));
        window.dispatchEvent(new CustomEvent('alphaplus_roles_updated', { detail: roles }));
    } catch (e) {
        console.error('Failed to save hotel roles to localStorage', e);
    }
}

/**
 * Returns role styling and emoji helper.
 */
export function getRoleMeta(roleName: string) {
    const roles = getLocalHotelRoles();
    const match = roles.find(r => r.role_name.toLowerCase() === roleName?.toLowerCase());
    if (match) {
        return {
            emoji: match.emoji || '👤',
            color: match.color_gradient || 'from-slate-600 to-slate-700',
            badge: match.badge_color || 'bg-slate-100 text-slate-700 border-slate-200',
            department: match.department || 'General',
            description: match.description || '',
        };
    }

    // Fallbacks for common legacy names
    switch (roleName?.toLowerCase()) {
        case 'super admin':
            return { emoji: '👑', color: 'from-purple-600 to-pink-600', badge: 'bg-purple-100 text-purple-800 border-purple-200', department: 'Management', description: 'Full system control' };
        case 'manager':
        case 'general manager':
            return { emoji: '💼', color: 'from-blue-600 to-cyan-600', badge: 'bg-blue-100 text-blue-800 border-blue-200', department: 'Management', description: 'Operations & oversight' };
        case 'supervisor':
        case 'f&b supervisor':
            return { emoji: '🎯', color: 'from-amber-500 to-orange-600', badge: 'bg-amber-100 text-amber-800 border-amber-200', department: 'Food & Beverage', description: 'Floor supervision' };
        case 'cashier':
            return { emoji: '💰', color: 'from-emerald-500 to-green-600', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', department: 'Finance & Accounts', description: 'POS & billing' };
        case 'waiter':
        case 'waitress':
            return { emoji: '🍽️', color: 'from-indigo-500 to-blue-600', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', department: 'Food & Beverage', description: 'Guest orders' };
        default:
            return { emoji: '👤', color: 'from-slate-600 to-slate-700', badge: 'bg-slate-100 text-slate-700 border-slate-200', department: 'General', description: 'Staff member' };
    }
}
