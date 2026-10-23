// Comprehensive Hotel & Restaurant RBAC Architecture for AlphaPlus Web
// Deeply audited across all 60+ pages, tabs, modals, buttons and sub-functions

export interface PermissionDefinition {
    key: string;
    label: string;
    subFunction: string;
    module: string;
    moduleName: string;
    icon: string;
    description: string;
    pagePath: string;
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
    { id: 'pos', name: 'Restaurant POS & Table Floor', icon: '🍽️', color: 'from-blue-600 to-indigo-600', page: '/dashboard/pos' },
    { id: 'hotel', name: 'Hotel PMS & Front Desk', icon: '🏨', color: 'from-emerald-600 to-teal-700', page: '/dashboard/hotel/checkin' },
    { id: 'kitchen', name: 'Kitchen & Culinary KDS', icon: '👨‍🍳', color: 'from-amber-500 to-orange-600', page: '/dashboard/kitchen' },
    { id: 'butchery', name: 'Butchery & Meat Processing', icon: '🥩', color: 'from-rose-600 to-red-700', page: '/dashboard/butchery/pos' },
    { id: 'inventory', name: 'Stores, Procurement & Stock', icon: '📦', color: 'from-violet-600 to-purple-700', page: '/dashboard/stores' },
    { id: 'cashier', name: 'Cashiering & Shift Reconciliation', icon: '💰', color: 'from-teal-600 to-emerald-700', page: '/dashboard/shifts' },
    { id: 'finance', name: 'Accounting, Expenses & Payroll', icon: '💵', color: 'from-sky-600 to-blue-700', page: '/dashboard/expenses' },
    { id: 'reports', name: 'Sales, KRA Tax & Analytics', icon: '📈', color: 'from-indigo-600 to-violet-700', page: '/dashboard/sales' },
    { id: 'catalog', name: 'Menu, Products & Dining Rooms', icon: '📋', color: 'from-amber-600 to-yellow-700', page: '/dashboard/products' },
    { id: 'admin', name: 'Security, Staff & Hardware', icon: '⚙️', color: 'from-slate-700 to-slate-900', page: '/dashboard/users' },
] as const;

export const HOTEL_DEPARTMENTS = [
    { id: 'all', name: 'All Departments', icon: '🏢' },
    { id: 'Management', name: 'Executive Management', icon: '💼' },
    { id: 'Front Office', name: 'Front Desk & Reception', icon: '🛎️' },
    { id: 'Food & Beverage', name: 'F&B Service & Bar', icon: '🍷' },
    { id: 'Kitchen', name: 'Kitchen & Culinary', icon: '👨‍🍳' },
    { id: 'Butchery', name: 'Butchery & Meat Section', icon: '🥩' },
    { id: 'Housekeeping', name: 'Housekeeping & Rooms', icon: '🧹' },
    { id: 'Store & Purchasing', name: 'Stores & Procurement', icon: '📦' },
    { id: 'Finance & Accounts', name: 'Finance & Cashiering', icon: '💵' },
    { id: 'Security & IT', name: 'Security & Systems', icon: '🛡️' },
] as const;

export const PERMISSIONS_LIST: PermissionDefinition[] = [
    // ═══════════════════════════════════════════════════════════════════
    // 1. RESTAURANT POS & TABLE FLOOR (/dashboard/pos, my-bills, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'pos_view_terminal', label: 'Access POS Terminal Screen', subFunction: 'Open POS Register', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🖥️', description: 'Access main restaurant dining floor & touch POS screen', pagePath: '/dashboard/pos' },
    { key: 'pos_home_dashboard', label: 'Exit to Home Dashboard (🏠 Button)', subFunction: 'Home Dashboard Exit', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🏠', description: 'Navigate back to Hotel Management Main Dashboard from POS top header', pagePath: '/dashboard/pos' },
    { key: 'pos_reports_view', label: 'Access POS Reports (📊 Header Button)', subFunction: 'Reports Header Button', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '📊', description: 'Open sales & POS revenue reports summary from POS top header', pagePath: '/dashboard/pos' },
    { key: 'pos_shortcuts_view', label: 'Keyboard Shortcuts (⌨️ Button)', subFunction: 'Shortcuts Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '⌨️', description: 'Open quick keyboard shortcuts guide [F1] from top header', pagePath: '/dashboard/pos' },
    { key: 'pos_lock_register', label: 'Lock POS Terminal (🔒 Button)', subFunction: 'Lock Screen Button', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🔒', description: 'Temporarily lock POS screen requiring supervisor authorization to unlock', pagePath: '/dashboard/pos' },
    { key: 'pos_close_register', label: 'Close Cashier Shift / Register', subFunction: 'Close Register Button', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🏁', description: 'Close active register shift, enter cash counts, and generate Z-Report', pagePath: '/dashboard/pos' },
    { key: 'pos_receive_payment', label: 'Receive Payment (💰 Direct Tender Button)', subFunction: 'Receive Pay Quick Action', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '💰', description: 'Open direct tender portal to receive payments for pending orders', pagePath: '/dashboard/pos' },
    { key: 'pos_view_my_bills', label: 'Access "My Bills" & Waiter Orders (📋 Button)', subFunction: 'My Bills Tab', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '📋', description: 'View waiter open orders, pending tickets, and settled receipts', pagePath: '/dashboard/my-bills' },
    { key: 'pos_day_sales', label: 'Day Sales Button (📊 Shifts & Sales)', subFunction: 'Day Sales Command Bar', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '📊', description: 'Inspect daily shift gross sales and live tender totals from command bar', pagePath: '/dashboard/pos' },
    { key: 'pos_merge_bills', label: 'Merge Bills Studio (🔄 Split & Merge Button)', subFunction: 'Merge Bills Command Bar', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🔄', description: 'Launch split & merge studio to combine or separate guest invoices', pagePath: '/dashboard/pos' },
    { key: 'pos_sales_summary', label: 'Sales Summary Analytics (📈 Summary Button)', subFunction: 'Summary Command Bar', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '📈', description: 'View itemized sales breakdown and hourly sales curves from command bar', pagePath: '/dashboard/pos' },
    { key: 'pos_pending_bills', label: 'Master Pending Bills (⏳ Pending Button)', subFunction: 'Pending Bills Command Bar', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '⏳', description: 'Inspect all open unpaid dining bills and tables across all waiters', pagePath: '/dashboard/pos' },
    { key: 'pos_clear_cart', label: 'Clear Cart Button (🗑️ Void Order)', subFunction: 'Clear Cart Action', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🗑️', description: 'Cancel running cart order with supervisor PIN protection', pagePath: '/dashboard/pos' },
    { key: 'pos_shift_reconciliation', label: 'EOD Stock Audit (🏁 EOD Stock Button)', subFunction: 'EOD Stock Command Bar', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🏁', description: 'Access end-of-day kitchen stock and shift reconciliation reports', pagePath: '/dashboard/pos' },
    { key: 'pos_select_tables', label: 'Select Dining Tables & Rooms', subFunction: 'Table Floor Map', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🪑', description: 'Open tables, view occupancy status and assign party seating', pagePath: '/dashboard/pos' },
    { key: 'pos_take_orders', label: 'Add Items & Build Orders', subFunction: 'Menu Cart', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '📝', description: 'Add dishes and drinks to cart, adjust quantities and portion size', pagePath: '/dashboard/pos' },
    { key: 'pos_send_kot', label: 'Send KOT to Kitchen Printer', subFunction: 'KOT Dispatch', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🍳', description: 'Dispatch Kitchen Order Ticket directly to kitchen thermal printers', pagePath: '/dashboard/pos' },
    { key: 'pos_reprint_kot', label: 'Reprint KOT Tickets', subFunction: 'KOT Reprint', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🖨️', description: 'Reprint duplicate kitchen order tickets for cooks or runners', pagePath: '/dashboard/pos' },
    { key: 'pos_order_notes', label: 'Kitchen Notes & Modifiers', subFunction: 'Food Notes Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🏷️', description: 'Add preparation modifiers (e.g., "Well Done", "No Salt", "Extra Gravy")', pagePath: '/dashboard/pos' },
    { key: 'pos_customer_bill_print', label: 'Print Pro-Forma Customer Bill', subFunction: 'Bill Print', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🧾', description: 'Print dining bill for guest review before payment collection', pagePath: '/dashboard/pos' },
    { key: 'pos_split_bill', label: 'Split Table Bills (Equal / Itemized)', subFunction: 'Split Bill Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '✂️', description: 'Split single table order into multiple separate bills for individual guests', pagePath: '/dashboard/split-merge-receipts' },
    { key: 'pos_merge_tables', label: 'Merge Multiple Table Orders', subFunction: 'Merge Tables Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🔗', description: 'Combine orders from two or more tables into a single master check', pagePath: '/dashboard/pos' },
    { key: 'pos_transfer_table', label: 'Move / Transfer Running Table', subFunction: 'Move Table Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🔄', description: 'Transfer order from Table A to Table B or change waiter assignment', pagePath: '/dashboard/pos' },
    { key: 'pos_hold_recall_order', label: 'Hold & Recall Pending Orders', subFunction: 'Held Sales Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '⏸️', description: 'Temporarily hold uncompleted customer orders and recall them later', pagePath: '/dashboard/pos' },
    { key: 'pos_item_discounts', label: 'Apply Bill / Item Discounts', subFunction: 'Discount Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🏷️', description: 'Apply promotional percentage discounts or fixed shillings deduction', pagePath: '/dashboard/pos' },
    { key: 'pos_price_override', label: 'Override Unit Selling Price', subFunction: 'Price Override', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '💲', description: 'Manually edit price per unit on special orders (Requires Supervisor)', pagePath: '/dashboard/pos' },
    { key: 'pos_void_item', label: 'Void Items from Active Order', subFunction: 'Supervisor Auth PIN', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🚫', description: 'Remove or cancel ordered items after KOT dispatch (Anti-Theft PIN)', pagePath: '/dashboard/pos' },
    { key: 'pos_cancel_order', label: 'Cancel Entire Bill / Order', subFunction: 'Void Order Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '❌', description: 'Void complete table order and cancel all registered KOT tickets', pagePath: '/dashboard/pos' },
    { key: 'pos_batch_selection', label: 'Select Production Batch', subFunction: 'Batch Selection Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '📦', description: 'Link POS sales line to specific manufacturing batch number', pagePath: '/dashboard/pos' },
    { key: 'pos_payment_tender', label: 'Tender Payment & Print Receipt', subFunction: 'Payment Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '💳', description: 'Complete transaction using Cash, M-Pesa STK, M-Pesa C2B Till, or PDQ Card', pagePath: '/dashboard/pos' },
    { key: 'pos_tender_cash', label: '1-Tap Fast Cash Tender (Exact / 500 / 1000)', subFunction: 'Fast Cash Buttons', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '💵', description: 'Settle order instantly with 1-tap exact cash tender tiles', pagePath: '/dashboard/pos' },
    { key: 'pos_reprint_receipt', label: 'Reprint Past Sales Receipts', subFunction: 'Receipt Preview Modal', module: 'pos', moduleName: 'Restaurant POS & Table Floor', icon: '🖨️', description: 'Reprint previously finalized sales receipts from receipt archive', pagePath: '/dashboard/pos' },

    // ═══════════════════════════════════════════════════════════════════
    // 2. HOTEL PMS & FRONT DESK (/dashboard/hotel/...)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'hotel_reservations_view', label: 'View Reservations Calendar', subFunction: 'Room Booking Grid', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '📅', description: 'View calendar timeline, room availability, and booked guest blocks', pagePath: '/dashboard/hotel/calendar-booking' },
    { key: 'hotel_reservations_create', label: 'Create Room Reservation', subFunction: 'New Booking Modal', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '➕', description: 'Create room reservations, set dates, meal plans and advance deposits', pagePath: '/dashboard/hotel/reservations' },
    { key: 'hotel_reservations_cancel', label: 'Cancel Reservation', subFunction: 'Cancel & Refund', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🚫', description: 'Cancel room bookings and record cancellation reason & refund policy', pagePath: '/dashboard/hotel/reservations' },
    { key: 'hotel_guest_checkin', label: 'Process Guest Check-in', subFunction: 'Check-in Wizard', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🔑', description: 'Register arriving guest, capture ID, issue room key and open folio', pagePath: '/dashboard/hotel/checkin' },
    { key: 'hotel_guest_checkout', label: 'Process Guest Check-out', subFunction: 'Checkout Settle', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🚪', description: 'Calculate final room bill, extra charges, accept balance & check out', pagePath: '/dashboard/hotel/checkout' },
    { key: 'hotel_guest_directory', label: 'Manage Guest CRM Profiles', subFunction: 'Guest Directory', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '👤', description: 'View guest stay history, next of kin, loyalty points and blacklist', pagePath: '/dashboard/hotel/guests' },
    { key: 'hotel_folio_post_charges', label: 'Post Charges to Room Folio', subFunction: 'Room Folio Billing', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '💳', description: 'Charge restaurant food, minibar, or laundry directly to guest room folio', pagePath: '/dashboard/hotel/checkin' },
    { key: 'hotel_folio_discounts', label: 'Apply Room Rate Discounts', subFunction: 'Rate Override', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🏷️', description: 'Apply promotional room discounts or waiver of extra bed charges', pagePath: '/dashboard/hotel/reservations' },
    { key: 'hotel_room_status_change', label: 'Update Room Status', subFunction: 'Room Grid Status', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🔄', description: 'Mark room as Vacant, Occupied, Maintenance, or Out of Order', pagePath: '/dashboard/hotel/rooms' },
    { key: 'hotel_housekeeping_queue', label: 'Housekeeping Queue & Clean State', subFunction: 'Housekeeping Dashboard', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🧹', description: 'Update room hygiene status (Clean, Dirty, Inspected, Sanitized)', pagePath: '/dashboard/hotel/housekeeping' },
    { key: 'hotel_housekeeping_assign', label: 'Assign Housekeeping Tasks', subFunction: 'Staff Task Dispatch', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '📋', description: 'Assign specific room cleaning duties and priority to housekeepers', pagePath: '/dashboard/hotel/housekeeping' },
    { key: 'hotel_night_audit_run', label: 'Run Daily Night Audit', subFunction: 'Night Audit Wizard', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🌙', description: 'Post room rates, balance cashier shifts, and roll financial date', pagePath: '/dashboard/hotel/night-audit' },
    { key: 'hotel_rooms_setup', label: 'Manage Hotel Rooms & Rates', subFunction: 'Room Master Setup', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🏨', description: 'Add, edit rooms, bed types, AC/WiFi amenities and base room rates', pagePath: '/dashboard/hotel/rooms' },
    { key: 'hotel_plans_setup', label: 'Manage Room Meal Plans', subFunction: 'Plan Rates Setup', module: 'hotel', moduleName: 'Hotel PMS & Front Desk', icon: '🍽️', description: 'Configure Bed & Breakfast (CP), Half Board (MAP), Full Board (AP)', pagePath: '/dashboard/hotel/room-plans' },

    // ═══════════════════════════════════════════════════════════════════
    // 3. KITCHEN & CULINARY KDS (/dashboard/kitchen, recipe, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'kitchen_kds_view', label: 'View Live Kitchen Display (KDS)', subFunction: 'KDS Dashboard', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🍳', description: 'Live screen of pending tickets, preparation timers, and table notes', pagePath: '/dashboard/kitchen' },
    { key: 'kitchen_kds_mark_prep', label: 'Mark Food Cooking / Preparing', subFunction: 'Cooking State Toggle', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🔥', description: 'Notify food runners and waiters that chef has started cooking dish', pagePath: '/dashboard/kitchen' },
    { key: 'kitchen_kds_mark_ready', label: 'Mark Dishes Ready for Service', subFunction: 'Dish Ready Ping', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🔔', description: 'Flag order items as fully cooked and ready at the kitchen pass', pagePath: '/dashboard/kitchen' },
    { key: 'kitchen_kds_recall_order', label: 'Recall Completed Kitchen Tickets', subFunction: 'KDS Ticket History', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '⏪', description: 'Re-open inadvertently cleared tickets for review', pagePath: '/dashboard/kitchen' },
    { key: 'kitchen_recipes_view', label: 'View Recipe Ingredient Costing', subFunction: 'Recipe Catalog', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '📖', description: 'Inspect culinary dish recipes, ingredient proportions and unit cost', pagePath: '/dashboard/recipe' },
    { key: 'kitchen_recipes_manage', label: 'Create & Edit Dish Recipes', subFunction: 'Recipe Form Editor', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '✍️', description: 'Configure ingredients, measurement units and standard portion yield', pagePath: '/dashboard/recipe' },
    { key: 'kitchen_production_batch', label: 'Record Batch Production Runs', subFunction: 'Batch Manufacturing', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🏭', description: 'Deduct raw ingredients from stock and create finished dish batches', pagePath: '/dashboard/recipe' },
    { key: 'kitchen_food_notes_manage', label: 'Configure Kitchen Food Notes', subFunction: 'Food Notes Master', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🏷️', description: 'Add pre-defined preparation instructions ("Medium Rare", "No Nuts")', pagePath: '/dashboard/food-notes' },
    { key: 'kitchen_dish_spoilage', label: 'Log Kitchen Spoilage & Wastage', subFunction: 'Spoilage Registry', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🗑️', description: 'Log burnt dishes, dropped food, and spoiled raw ingredients for loss report', pagePath: '/dashboard/dish-movement' },
    { key: 'kitchen_dish_stock_view', label: 'View Finished Dish Stock Balances', subFunction: 'Dish Stock Tracker', module: 'kitchen', moduleName: 'Kitchen & Culinary KDS', icon: '🍲', description: 'Monitor daily pre-cooked batches and remaining portions', pagePath: '/dashboard/dish-stock' },

    // ═══════════════════════════════════════════════════════════════════
    // 4. BUTCHERY & MEAT PROCESSING (/dashboard/butchery/...)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'butchery_pos_scale', label: 'Access Butchery Scale & POS', subFunction: 'Butchery POS Terminal', module: 'butchery', moduleName: 'Butchery & Meat Processing', icon: '⚖️', description: 'Weigh cuts on digital scale and tender butchery sales receipts', pagePath: '/dashboard/butchery/pos' },
    { key: 'butchery_carcass_intake', label: 'Record Carcass Intake', subFunction: 'Carcass Registry', module: 'butchery', moduleName: 'Butchery & Meat Processing', icon: '🥩', description: 'Log incoming whole beef, goat, sheep, or pork carcass weights', pagePath: '/dashboard/butchery/stock' },
    { key: 'butchery_breakdown_cuts', label: 'De-bone & Carcass Breakdown', subFunction: 'Carcass Cutting Batch', module: 'butchery', moduleName: 'Butchery & Meat Processing', icon: '🔪', description: 'Deconstruct carcass into steaks, ribs, minced meat, liver and soup bones', pagePath: '/dashboard/butchery/batches' },
    { key: 'butchery_weight_loss_log', label: 'Record Meat Dehydration Loss', subFunction: 'Weight Loss Tracker', module: 'butchery', moduleName: 'Butchery & Meat Processing', icon: '📉', description: 'Track carcass cold room moisture evaporation and trimming losses', pagePath: '/dashboard/butchery/weight-loss' },
    { key: 'butchery_meat_types_setup', label: 'Configure Meat Cuts & Price/KG', subFunction: 'Meat Cuts Master', module: 'butchery', moduleName: 'Butchery & Meat Processing', icon: '🏷️', description: 'Set selling price per KG and minimum order thresholds', pagePath: '/dashboard/butchery/meat-types' },
    { key: 'butchery_sales_reports', label: 'View Butchery Margins & Yields', subFunction: 'Butchery Analytics', module: 'butchery', moduleName: 'Butchery & Meat Processing', icon: '📊', description: 'Audit meat recovery percentages and gross profitability per carcass', pagePath: '/dashboard/butchery/sales-report' },

    // ═══════════════════════════════════════════════════════════════════
    // 5. STORES, PROCUREMENT & STOCK (/dashboard/stores, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'store_view_inventory', label: 'View Godown Stock Balances', subFunction: 'Main Store Stock Grid', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '📦', description: 'Inspect live stock balances in Main Store, Cold Room, and Bar Godowns', pagePath: '/dashboard/stores' },
    { key: 'store_stock_intake_grn', label: 'Record Goods Received Note (GRN)', subFunction: 'GRN Receiving Modal', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '📥', description: 'Receive supplier delivery, enter invoice quantities and batch numbers', pagePath: '/dashboard/purchases' },
    { key: 'store_stock_adjustment', label: 'Perform Stock Count Adjustments', subFunction: 'Stock Adjustment Form', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '⚖️', description: 'Enter physical count reconciliation and adjust variances in inventory', pagePath: '/dashboard/stock-adjustment' },
    { key: 'store_stock_transfer', label: 'Transfer Stock Across Godowns', subFunction: 'Transfer Requisition', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '🔄', description: 'Move ingredients and beverages from Central Store to Kitchen or Bar', pagePath: '/dashboard/stock-transfer' },
    { key: 'store_issue_requisitions', label: 'Approve & Issue Requisitions', subFunction: 'Issue Requisitions Modal', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '📋', description: 'Approve internal requests for raw ingredients submitted by kitchen chefs', pagePath: '/dashboard/stores' },
    { key: 'store_low_stock_alerts', label: 'View Reorder Point Alerts', subFunction: 'Low Stock Screen', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '⚠️', description: 'Monitor products falling below minimum safe operational stock limits', pagePath: '/dashboard/low-stock' },
    { key: 'store_suppliers_manage', label: 'Manage Supplier Directory', subFunction: 'Supplier Master Form', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '🚛', description: 'Add and edit supplier contacts, credit terms, and KRA PIN numbers', pagePath: '/dashboard/suppliers' },
    { key: 'store_purchase_orders', label: 'Create Purchase Orders & Invoices', subFunction: 'Purchase Order Wizard', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '🧾', description: 'Generate procurement purchase orders and record vendor bills', pagePath: '/dashboard/purchases' },
    { key: 'store_purchase_returns', label: 'Process Supplier Purchase Returns', subFunction: 'Purchase Return Modal', module: 'inventory', moduleName: 'Stores, Procurement & Stock', icon: '↩️', description: 'Record damaged or rejected goods returned to vendor for credit note', pagePath: '/dashboard/purchase-return' },

    // ═══════════════════════════════════════════════════════════════════
    // 6. CASHIERING & SHIFT RECONCILIATION (/dashboard/shifts, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'cashier_open_register', label: 'Open Shift & Enter Opening Cash', subFunction: 'Shift Opening Modal', module: 'cashier', moduleName: 'Cashiering & Shift Reconciliation', icon: '⏱️', description: 'Open cashier register drawer and enter starting till cash float', pagePath: '/dashboard/shifts' },
    { key: 'cashier_safe_cash_drops', label: 'Perform Safe Cash Drops', subFunction: 'Cash Drop Form', module: 'cashier', moduleName: 'Cashiering & Shift Reconciliation', icon: '💰', description: 'Drop excess register cash into the hotel safe to limit cash-in-drawer risk', pagePath: '/dashboard/shifts' },
    { key: 'cashier_petty_expenses', label: 'Record Shift Petty Cash Expenses', subFunction: 'Shift Expense Modal', module: 'cashier', moduleName: 'Cashiering & Shift Reconciliation', icon: '💸', description: 'Record cash payouts for emergency supplies or local transport', pagePath: '/dashboard/shifts' },
    { key: 'cashier_x_report_print', label: 'Print Mid-Shift X-Report', subFunction: 'X-Report Print', module: 'cashier', moduleName: 'Cashiering & Shift Reconciliation', icon: '🧾', description: 'Print mid-shift register audit summary without closing active drawer', pagePath: '/dashboard/shifts' },
    { key: 'cashier_close_z_report', label: 'Close Register & Generate Z-Report', subFunction: 'Z-Report Close Modal', module: 'cashier', moduleName: 'Cashiering & Shift Reconciliation', icon: '🔒', description: 'Count drawer cash, calculate overage/shortage variance and seal shift', pagePath: '/dashboard/shifts' },
    { key: 'cashier_view_all_shifts', label: 'View All Cashier Shift Records', subFunction: 'Shift History Table', module: 'cashier', moduleName: 'Cashiering & Shift Reconciliation', icon: '📜', description: 'Audit past shifts, closing balances, and cashier discrepancy logs', pagePath: '/dashboard/shift-reports' },

    // ═══════════════════════════════════════════════════════════════════
    // 7. ACCOUNTING, EXPENSES & PAYROLL (/dashboard/expenses, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'finance_manage_expenses', label: 'Manage Operating Expenses', subFunction: 'Expense Form & Ledger', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '📉', description: 'Enter utilities, rent, maintenance, licenses and operational costs', pagePath: '/dashboard/expenses' },
    { key: 'finance_payment_vouchers', label: 'Issue Payment Vouchers', subFunction: 'Voucher Issuance', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '🎫', description: 'Generate formal payment vouchers for authorized payouts', pagePath: '/dashboard/vouchers' },
    { key: 'finance_chart_of_accounts', label: 'Access Chart of Accounts', subFunction: 'Accounts General Ledger', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '🏦', description: 'View bank accounts, cash accounts, and accounting ledger balances', pagePath: '/dashboard/accounts' },
    { key: 'finance_bill_payment_settle', label: 'Settle Outstanding Customer Bills', subFunction: 'Bill Payment Settle', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '💳', description: 'Receive payments for unpaid customer bills and partial credit accounts', pagePath: '/dashboard/bill-payment' },
    { key: 'finance_sales_returns_refund', label: 'Authorize Sales Returns & Refunds', subFunction: 'Sales Return Refund', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '↩️', description: 'Approve refund payouts and reverse inventory on customer returns', pagePath: '/dashboard/sales-return' },
    { key: 'finance_staff_advances', label: 'Issue Staff Salary Advances', subFunction: 'Salary Advance Form', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '🤝', description: 'Approve salary advances and track deductions for monthly payroll', pagePath: '/dashboard/advances' },
    { key: 'finance_payroll_process', label: 'Process Monthly Hotel Payroll', subFunction: 'Payroll Calculator', module: 'finance', moduleName: 'Accounting, Expenses & Payroll', icon: '💵', description: 'Calculate gross wages, NHIF/NSSF/PAYE deductions and net pay', pagePath: '/dashboard/payroll' },

    // ═══════════════════════════════════════════════════════════════════
    // 8. SALES, KRA TAX & ANALYTICS (/dashboard/sales, reports, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'reports_daily_sales_view', label: 'View Real-time Sales Dashboard', subFunction: 'Sales Dashboard', module: 'reports', moduleName: 'Sales, KRA Tax & Analytics', icon: '📊', description: 'Inspect live daily gross sales, revenue curves, and payment breakdown', pagePath: '/dashboard/sales' },
    { key: 'reports_itemized_pos', label: 'Access Itemized Sales Report', subFunction: 'POS Analytics', module: 'reports', moduleName: 'Sales, KRA Tax & Analytics', icon: '📈', description: 'View dish-by-dish quantities sold, category totals and waiter sales', pagePath: '/dashboard/reports/pos' },
    { key: 'reports_recipe_costing', label: 'Analyze Dish Margins & Costing', subFunction: 'Dish Profitability', module: 'reports', moduleName: 'Sales, KRA Tax & Analytics', icon: '🍲', description: 'Audit food cost percentage, dish profitability and recipe margins', pagePath: '/dashboard/reports/recipe-report' },
    { key: 'reports_kra_tax_breakdown', label: 'Access KRA / Tax Compliance', subFunction: 'Tax Breakdown Summary', module: 'reports', moduleName: 'Sales, KRA Tax & Analytics', icon: '📑', description: 'View 16% VAT, 2% Catering Levy, and net taxable sales reports', pagePath: '/dashboard/tax-settings' },
    { key: 'reports_export_excel_pdf', label: 'Export Reports to Excel / PDF', subFunction: 'Report Exporter', module: 'reports', moduleName: 'Sales, KRA Tax & Analytics', icon: '📥', description: 'Download CSV spreadsheets and PDF executive summaries', pagePath: '/dashboard/reports/dish-report' },

    // ═══════════════════════════════════════════════════════════════════
    // 9. MENU, PRODUCTS & DINING ROOMS (/dashboard/products, etc.)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'catalog_products_view', label: 'Browse Products & Dish Menu', subFunction: 'Product Catalog Grid', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '🍽️', description: 'View full menu catalog with photo, price, category and stock state', pagePath: '/dashboard/products' },
    { key: 'catalog_products_create_edit', label: 'Add & Edit Dishes and Drinks', subFunction: 'Product Form Editor', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '➕', description: 'Create new dishes, set selling price, cost price, and POS UI color', pagePath: '/dashboard/products/add' },
    { key: 'catalog_products_delete', label: 'Delete / Archive Products', subFunction: 'Product Archive', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '🗑️', description: 'Deactivate or permanently remove dishes from active restaurant menu', pagePath: '/dashboard/products' },
    { key: 'catalog_categories_manage', label: 'Manage Menu Categories', subFunction: 'Categories Form', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '🗂️', description: 'Create and organize menu categories (Appetizers, Mains, Bar, Desserts)', pagePath: '/dashboard/categories' },
    { key: 'catalog_units_manage', label: 'Manage Measurement Units', subFunction: 'Units Master Form', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '📏', description: 'Configure units (PCS, KG, Liter, Bottle, Tot, Portion, Glass)', pagePath: '/dashboard/units' },
    { key: 'catalog_brands_manage', label: 'Manage Product Brands', subFunction: 'Brands Directory', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '🏷️', description: 'Register beverage and liquor manufacturers & distributors', pagePath: '/dashboard/brands' },
    { key: 'catalog_dining_tables_setup', label: 'Design Dining Rooms & Tables', subFunction: 'Table Layout Designer', module: 'catalog', moduleName: 'Menu, Products & Dining Rooms', icon: '🪑', description: 'Create restaurant rooms, set capacity, table codes and floor numbers', pagePath: '/dashboard/tables-rooms' },

    // ═══════════════════════════════════════════════════════════════════
    // 10. SECURITY, STAFF & HARDWARE (/dashboard/users, user-roles, printers)
    // ═══════════════════════════════════════════════════════════════════
    { key: 'admin_staff_users_view', label: 'View Personnel Staff Roster', subFunction: 'Staff Directory', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '👥', description: 'Access staff directory, National IDs, phone numbers, and job roles', pagePath: '/dashboard/users' },
    { key: 'admin_staff_users_manage', label: 'Add & Edit Staff Profiles', subFunction: 'Staff Profile Editor', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '✍️', description: 'Create new personnel, edit salary, department, and phone details', pagePath: '/dashboard/users' },
    { key: 'admin_staff_pin_reset', label: 'Reset Staff Passwords & POS PINs', subFunction: 'Credential Reset', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '🔐', description: 'Assign new fast POS login PINs and update user passwords', pagePath: '/dashboard/users' },
    { key: 'admin_staff_status_toggle', label: 'Suspend / Deactivate Staff', subFunction: 'Account Suspension', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '⏸️', description: 'Toggle employee active status to block POS terminal access', pagePath: '/dashboard/users' },
    { key: 'admin_roles_permissions', label: 'Configure Roles & Permissions', subFunction: 'RBAC Security Matrix', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '🛡️', description: 'Create custom roles and check/uncheck granular system privileges', pagePath: '/dashboard/user-roles' },
    { key: 'admin_printers_setup', label: 'Configure Network Thermal Printers', subFunction: 'Hardware Printers Form', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '🖨️', description: 'Configure thermal printers for Kitchen, Bar, Cashier, and Butchery', pagePath: '/dashboard/printers' },
    { key: 'admin_pos_tax_settings', label: 'Configure KRA / VAT Tax Parameters', subFunction: 'Tax Parameters Form', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '⚙️', description: 'Configure VAT 16%, Catering Levy 2%, inclusive or exclusive pricing', pagePath: '/dashboard/tax-settings' },
    { key: 'admin_company_profile', label: 'Edit Hotel Company Profile', subFunction: 'Company Info Form', module: 'admin', moduleName: 'Security, Staff & Hardware', icon: '🏢', description: 'Set hotel branding, address, M-Pesa Till / Paybill credentials', pagePath: '/dashboard/company' },
];

export const PRESET_HOTEL_ROLES: HotelRole[] = [
    {
        role_id: 'super-admin',
        role_name: 'Super Admin',
        department: 'Management',
        description: 'Complete unrestricted control over all hotel POS terminals, PMS rooms, kitchen KDS, accounting and security settings.',
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
        description: 'Hotel Executive: oversight of dining floor, hotel bookings, kitchen operations, stock audits, payroll and financial performance.',
        color_gradient: 'from-blue-600 to-cyan-600',
        badge_color: 'bg-blue-100 text-blue-800 border-blue-200',
        emoji: '💼',
        is_system: true,
        permissions: PERMISSIONS_LIST.reduce((acc, p) => {
            // GM has almost everything except raw role definition manipulation
            acc[p.key] = p.key !== 'admin_roles_permissions';
            return acc;
        }, {} as Record<string, boolean>),
    },
    {
        role_id: 'fb-supervisor',
        role_name: 'Supervisor',
        department: 'Food & Beverage',
        description: 'Dining Floor Leader: authorize item voids with PIN, approve bill discounts, split/merge tables, shift cash drop audits.',
        color_gradient: 'from-amber-500 to-orange-600',
        badge_color: 'bg-amber-100 text-amber-800 border-amber-200',
        emoji: '🎯',
        is_system: true,
        permissions: {
            pos_view_terminal: true,
            pos_select_tables: true,
            pos_take_orders: true,
            pos_send_kot: true,
            pos_reprint_kot: true,
            pos_order_notes: true,
            pos_customer_bill_print: true,
            pos_view_my_bills: true,
            pos_split_bill: true,
            pos_merge_tables: true,
            pos_transfer_table: true,
            pos_hold_recall_order: true,
            pos_item_discounts: true,
            pos_price_override: true,
            pos_void_item: true,
            pos_cancel_order: true,
            pos_batch_selection: true,
            pos_payment_tender: true,
            pos_reprint_receipt: true,
            hotel_folio_post_charges: true,
            kitchen_kds_view: true,
            kitchen_dish_spoilage: true,
            kitchen_dish_stock_view: true,
            cashier_open_register: true,
            cashier_safe_cash_drops: true,
            cashier_petty_expenses: true,
            cashier_x_report_print: true,
            cashier_close_z_report: true,
            cashier_view_all_shifts: true,
            reports_daily_sales_view: true,
            reports_itemized_pos: true,
            catalog_products_view: true,
            admin_staff_users_view: true,
        },
    },
    {
        role_id: 'front-desk-agent',
        role_name: 'Front Desk Agent',
        department: 'Front Office',
        description: 'Reception & Rooms Host: room bookings, guest check-in, keycard assignment, folio billing, checkout and night audit.',
        color_gradient: 'from-teal-500 to-emerald-600',
        badge_color: 'bg-teal-100 text-teal-800 border-teal-200',
        emoji: '🛎️',
        is_system: true,
        permissions: {
            pos_view_terminal: true,
            pos_customer_bill_print: true,
            pos_payment_tender: true,
            pos_reprint_receipt: true,
            hotel_reservations_view: true,
            hotel_reservations_create: true,
            hotel_reservations_cancel: true,
            hotel_guest_checkin: true,
            hotel_guest_checkout: true,
            hotel_guest_directory: true,
            hotel_folio_post_charges: true,
            hotel_folio_discounts: true,
            hotel_room_status_change: true,
            hotel_housekeeping_queue: true,
            hotel_housekeeping_assign: true,
            hotel_night_audit_run: true,
            cashier_open_register: true,
            cashier_safe_cash_drops: true,
            cashier_petty_expenses: true,
            cashier_x_report_print: true,
            cashier_close_z_report: true,
            reports_daily_sales_view: true,
            catalog_products_view: true,
            admin_staff_users_view: true,
        },
    },
    {
        role_id: 'cashier',
        role_name: 'Cashier',
        department: 'Finance & Accounts',
        description: 'POS Billing & Cashier: accept Cash/M-Pesa/PDQ payments, print receipts, split bills, record petty cash and close shifts.',
        color_gradient: 'from-emerald-500 to-green-600',
        badge_color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        emoji: '💰',
        is_system: true,
        permissions: {
            pos_view_terminal: true,
            pos_select_tables: true,
            pos_take_orders: true,
            pos_send_kot: true,
            pos_reprint_kot: true,
            pos_order_notes: true,
            pos_customer_bill_print: true,
            pos_view_my_bills: true,
            pos_split_bill: true,
            pos_merge_tables: true,
            pos_hold_recall_order: true,
            pos_item_discounts: false,
            pos_void_item: false,
            pos_cancel_order: false,
            pos_batch_selection: true,
            pos_payment_tender: true,
            pos_reprint_receipt: true,
            hotel_folio_post_charges: true,
            cashier_open_register: true,
            cashier_safe_cash_drops: true,
            cashier_petty_expenses: true,
            cashier_x_report_print: true,
            cashier_close_z_report: true,
            finance_bill_payment_settle: true,
            reports_daily_sales_view: true,
            catalog_products_view: true,
        },
    },
    {
        role_id: 'waiter',
        role_name: 'Waiter',
        department: 'Food & Beverage',
        description: 'Floor Service Staff: select tables, add items to cart, add kitchen notes, dispatch KOT and view "My Bills".',
        color_gradient: 'from-indigo-500 to-blue-600',
        badge_color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        emoji: '🍽️',
        is_system: true,
        permissions: {
            pos_view_terminal: true,
            pos_home_dashboard: false,
            pos_reports_view: false,
            pos_shortcuts_view: true,
            pos_lock_register: false,
            pos_close_register: false,
            pos_receive_payment: false,
            pos_view_my_bills: true,
            pos_day_sales: false,
            pos_merge_bills: false,
            pos_sales_summary: false,
            pos_pending_bills: false,
            pos_clear_cart: false,
            pos_shift_reconciliation: false,
            pos_select_tables: true,
            pos_take_orders: true,
            pos_send_kot: true,
            pos_reprint_kot: false,
            pos_order_notes: true,
            pos_customer_bill_print: true,
            pos_split_bill: false,
            pos_merge_tables: false,
            pos_transfer_table: false,
            pos_hold_recall_order: true,
            pos_item_discounts: false,
            pos_price_override: false,
            pos_void_item: false,
            pos_cancel_order: false,
            pos_payment_tender: false,
            pos_tender_cash: false,
            pos_reprint_receipt: false,
            catalog_products_view: true,
        },
    },
    {
        role_id: 'head-chef',
        role_name: 'Head Chef',
        department: 'Kitchen',
        description: 'Executive Culinary Chef: live kitchen display, mark dishes ready, manage recipes, food spoilage logs and batch production.',
        color_gradient: 'from-orange-500 to-rose-600',
        badge_color: 'bg-orange-100 text-orange-800 border-orange-200',
        emoji: '👨‍🍳',
        is_system: true,
        permissions: {
            kitchen_kds_view: true,
            kitchen_kds_mark_prep: true,
            kitchen_kds_mark_ready: true,
            kitchen_kds_recall_order: true,
            kitchen_recipes_view: true,
            kitchen_recipes_manage: true,
            kitchen_production_batch: true,
            kitchen_food_notes_manage: true,
            kitchen_dish_spoilage: true,
            kitchen_dish_stock_view: true,
            store_view_inventory: true,
            store_issue_requisitions: true,
            catalog_products_view: true,
            reports_recipe_costing: true,
        },
    },
    {
        role_id: 'master-butcher',
        role_name: 'Master Butcher',
        department: 'Butchery',
        description: 'Meat Processing Specialist: digital scale butchery POS, carcass intake, breakdown batches and cutting weight loss audit.',
        color_gradient: 'from-rose-600 to-red-700',
        badge_color: 'bg-rose-100 text-rose-800 border-rose-200',
        emoji: '🥩',
        is_system: true,
        permissions: {
            butchery_pos_scale: true,
            butchery_carcass_intake: true,
            butchery_breakdown_cuts: true,
            butchery_weight_loss_log: true,
            butchery_meat_types_setup: true,
            butchery_sales_reports: true,
            store_view_inventory: true,
            store_stock_intake_grn: true,
            store_stock_adjustment: true,
            catalog_products_view: true,
        },
    },
    {
        role_id: 'housekeeper',
        role_name: 'Housekeeping Supervisor',
        department: 'Housekeeping',
        description: 'Rooms Sanitation Supervisor: room cleaning queues, clean/dirty toggles, minibar restocking and room maintenance logs.',
        color_gradient: 'from-sky-500 to-blue-600',
        badge_color: 'bg-sky-100 text-sky-800 border-sky-200',
        emoji: '🧹',
        is_system: true,
        permissions: {
            hotel_room_status_change: true,
            hotel_housekeeping_queue: true,
            hotel_housekeeping_assign: true,
            store_view_inventory: true,
            store_issue_requisitions: true,
        },
    },
    {
        role_id: 'storekeeper',
        role_name: 'Storekeeper',
        department: 'Store & Purchasing',
        description: 'Inventory Controller: goods received notes (GRN), manual stock corrections, godown transfers, and department ingredient issues.',
        color_gradient: 'from-violet-500 to-purple-600',
        badge_color: 'bg-violet-100 text-violet-800 border-violet-200',
        emoji: '📦',
        is_system: true,
        permissions: {
            store_view_inventory: true,
            store_stock_intake_grn: true,
            store_stock_adjustment: true,
            store_stock_transfer: true,
            store_issue_requisitions: true,
            store_low_stock_alerts: true,
            store_suppliers_manage: true,
            store_purchase_orders: true,
            store_purchase_returns: true,
            catalog_products_view: true,
            kitchen_dish_spoilage: true,
        },
    },
    {
        role_id: 'night-auditor',
        role_name: 'Night Auditor',
        department: 'Finance & Accounts',
        description: 'Night Hospitality Auditor: end-of-day room rate rollover, cashier shift reconciliations, folio audits and flash reports.',
        color_gradient: 'from-indigo-800 to-slate-900',
        badge_color: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        emoji: '🌙',
        is_system: true,
        permissions: {
            pos_view_terminal: true,
            pos_customer_bill_print: true,
            pos_payment_tender: true,
            pos_reprint_receipt: true,
            hotel_reservations_view: true,
            hotel_guest_checkin: true,
            hotel_guest_checkout: true,
            hotel_folio_post_charges: true,
            hotel_room_status_change: true,
            hotel_housekeeping_queue: true,
            hotel_night_audit_run: true,
            cashier_open_register: true,
            cashier_safe_cash_drops: true,
            cashier_petty_expenses: true,
            cashier_x_report_print: true,
            cashier_close_z_report: true,
            cashier_view_all_shifts: true,
            finance_bill_payment_settle: true,
            reports_daily_sales_view: true,
            reports_itemized_pos: true,
            reports_kra_tax_breakdown: true,
            reports_export_excel_pdf: true,
        },
    },
    {
        role_id: 'financial-accountant',
        role_name: 'Financial Accountant',
        department: 'Finance & Accounts',
        description: 'Financial Controller: general ledger, payment vouchers, operating expenses, supplier payments, tax compliance and payroll.',
        color_gradient: 'from-emerald-700 to-teal-800',
        badge_color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        emoji: '💵',
        is_system: true,
        permissions: {
            finance_manage_expenses: true,
            finance_payment_vouchers: true,
            finance_chart_of_accounts: true,
            finance_bill_payment_settle: true,
            finance_sales_returns_refund: true,
            finance_staff_advances: true,
            finance_payroll_process: true,
            cashier_view_all_shifts: true,
            store_suppliers_manage: true,
            store_purchase_orders: true,
            reports_daily_sales_view: true,
            reports_itemized_pos: true,
            reports_recipe_costing: true,
            reports_kra_tax_breakdown: true,
            reports_export_excel_pdf: true,
            admin_staff_users_view: true,
        },
    },
];

const LOCAL_STORAGE_KEY = 'alphaplus_hotel_roles_v3';

export function getLocalHotelRoles(): HotelRole[] {
    if (typeof window === 'undefined') {
        return PRESET_HOTEL_ROLES;
    }

    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
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

    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(PRESET_HOTEL_ROLES));
    } catch {}

    return PRESET_HOTEL_ROLES;
}

export function saveLocalHotelRoles(roles: HotelRole[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(roles));
        window.dispatchEvent(new CustomEvent('alphaplus_roles_updated', { detail: roles }));
    } catch (e) {
        console.error('Failed to save hotel roles to localStorage', e);
    }
}

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
        case 'butcher':
        case 'master butcher':
            return { emoji: '🥩', color: 'from-rose-600 to-red-700', badge: 'bg-rose-100 text-rose-800 border-rose-200', department: 'Butchery', description: 'Meat section' };
        case 'accountant':
        case 'financial accountant':
            return { emoji: '💵', color: 'from-emerald-700 to-teal-800', badge: 'bg-emerald-100 text-emerald-900 border-emerald-300', department: 'Finance & Accounts', description: 'Accounting & tax' };
        default:
            return { emoji: '👤', color: 'from-slate-600 to-slate-700', badge: 'bg-slate-100 text-slate-700 border-slate-200', department: 'General', description: 'Staff member' };
    }
}

export function hasRolePermission(roleName: string, permissionKey: string): boolean {
    if (typeof window === 'undefined') return true;
    const lowerRole = (roleName || '').trim().toLowerCase();
    if (!lowerRole) return false;
    if (lowerRole === 'super admin' || lowerRole === 'admin') return true;

    const roles = getLocalHotelRoles();
    const match = roles.find(r => 
        r.role_name.toLowerCase() === lowerRole || 
        r.role_id.toLowerCase() === lowerRole ||
        (lowerRole.includes('waiter') && r.role_id === 'waiter') ||
        (lowerRole.includes('cashier') && r.role_id === 'cashier')
    );
    if (match) {
        if (match.is_super_admin) return true;
        if (match.permissions && typeof match.permissions[permissionKey] === 'boolean') {
            return match.permissions[permissionKey];
        }
    }

    const preset = PRESET_HOTEL_ROLES.find(r => 
        r.role_name.toLowerCase() === lowerRole || 
        r.role_id.toLowerCase() === lowerRole ||
        (lowerRole.includes('waiter') && r.role_id === 'waiter') ||
        (lowerRole.includes('cashier') && r.role_id === 'cashier')
    );
    if (preset?.permissions && typeof preset.permissions[permissionKey] === 'boolean') {
        return preset.permissions[permissionKey];
    }

    if (lowerRole.includes('waiter') || lowerRole === 'waitress') {
        return false;
    }

    return true;
}
