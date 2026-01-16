import { createClient } from '@supabase/supabase-js';

// Main Hotel App Supabase (AlphaPlusWeb) - for all hotel data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://enlqpifpxuecxxozyiak.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

// Create main Supabase client for hotel data
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// SEPARATE C2B Supabase client (Energy App) - ONLY for C2B transactions
const c2bSupabaseUrl = 'https://pxcdaivlvltmdifxietb.supabase.co';
const c2bSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4Y2RhaXZsdmx0bWRpZnhpZXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NDI3NDIsImV4cCI6MjA4MTMxODc0Mn0.s6nv24s6M83gAcW_nSKCBfcXcqJ_7owwqdObPDT7Ky0';

// Create separate client ONLY for C2B queries
export const c2bSupabase = createClient(c2bSupabaseUrl, c2bSupabaseAnonKey);

// ============================================
// DATABASE FUNCTIONS
// ============================================

// ==================== AUTHENTICATION ====================

export async function loginUser(userId: string, password: string) {
    const { data, error } = await supabase
        .from('registration')
        .select('*')
        .eq('user_id', userId)
        .eq('password', password)
        .single();

    if (error) throw error;
    return data;
}

// ==================== PRODUCTS ====================

export async function getProducts() {
    const { data, error } = await supabase
        .from('product')
        .select('*')
        .order('product_name');

    if (error) throw error;
    return data;
}

export async function getProductWithStock() {
    const { data, error } = await supabase
        .from('temp_stock_company')
        .select(`
      *,
      product:product_id (
        pid,
        product_code,
        product_name,
        category,
        button_ui_color,
        barcode
      )
    `)
        .gt('qty', 0)
        .order('product_id');

    if (error) throw error;
    return data;
}

export async function addProduct(product: {
    product_code: string;
    product_name: string;
    category: string;
    purchase_cost: number;
    sales_cost: number;
    barcode?: string;
    reorder_point?: number;
}) {
    const { data, error } = await supabase
        .from('product')
        .insert([{
            ...product,
            added_date: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateProduct(id: number, updates: Partial<{
    product_name: string;
    category: string;
    purchase_cost: number;
    sales_cost: number;
    barcode: string;
    reorder_point: number;
}>) {
    const { data, error } = await supabase
        .from('product')
        .update(updates)
        .eq('pid', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteProduct(id: number) {
    const { error } = await supabase
        .from('product')
        .delete()
        .eq('pid', id);

    if (error) throw error;
}

// ==================== CATEGORIES ====================

export async function getCategories() {
    const { data, error } = await supabase
        .from('category')
        .select('*')
        .order('category_name');

    if (error) throw error;
    return data;
}

export async function addCategory(categoryName: string) {
    const { data, error } = await supabase
        .from('category')
        .insert([{ category_name: categoryName }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== INVOICES/SALES ====================

export async function createInvoice(invoice: {
    invoice_no: string;
    open_id?: number;
    grand_total: number;
    cash?: number;
    change?: number;
    customer_name?: string;
    salesman_name?: string;
    shift_instance_id?: number;
}) {
    const { data, error } = await supabase
        .from('invoice_info')
        .insert([{
            ...invoice,
            invoice_date: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function addInvoiceProducts(invoiceId: number, products: Array<{
    product_id: number;
    barcode?: string;
    sales_rate: number;
    qty: number;
    total_amount: number;
    purchase_rate?: number;
}>) {
    const items = products.map(p => ({
        invoice_id: invoiceId,
        ...p,
    }));

    const { data, error } = await supabase
        .from('invoice_product')
        .insert(items)
        .select();

    if (error) throw error;
    return data;
}

export async function addInvoicePayment(invoiceId: number, paymentMode: string, amount: number, mpesaReceipt?: string) {
    const { data, error } = await supabase
        .from('invoice_payment')
        .insert([{
            invoice_id: invoiceId,
            payment_mode: paymentMode,
            amount,
            mpesa_receipt_number: mpesaReceipt,
            payment_date: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getSalesForDate(date: string) {
    const startDate = `${date}T00:00:00`;
    const endDate = `${date}T23:59:59`;

    const { data, error } = await supabase
        .from('invoice_info')
        .select(`
      *,
      invoice_product (*)
    `)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .order('invoice_date', { ascending: false });

    if (error) throw error;
    return data;
}

// ==================== SUPPLIERS ====================

export async function getSuppliers() {
    const { data, error } = await supabase
        .from('supplier')
        .select('*')
        .order('name');

    if (error) throw error;
    return data;
}

export async function addSupplier(supplier: {
    supplier_id: string;
    name: string;
    contact_no?: string;
    address?: string;
    email_id?: string;
}) {
    const { data, error } = await supabase
        .from('supplier')
        .insert([supplier])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== PURCHASES ====================

export async function createPurchase(purchase: {
    invoice_no: string;
    purchase_type: string;
    supplier_id: number;
    grand_total: number;
    supplier_name?: string;
}) {
    const { data, error } = await supabase
        .from('purchase')
        .insert([{
            ...purchase,
            date: new Date().toISOString(),
            status: 'Final',
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function addPurchaseItems(purchaseId: number, items: Array<{
    product_id: number;
    qty: number;
    price: number;
    total_amount: number;
    product_name?: string;
}>) {
    const purchaseItems = items.map(item => ({
        purchase_id: purchaseId,
        warehouse_store: 'Main Store',
        ...item,
    }));

    const { data, error } = await supabase
        .from('purchase_join')
        .insert(purchaseItems)
        .select();

    if (error) throw error;
    return data;
}

// ==================== STOCK ====================

export async function updateStock(productId: number, qty: number, salesRate: number, purchaseRate?: number) {
    // First check if stock exists
    const { data: existing } = await supabase
        .from('temp_stock_company')
        .select('*')
        .eq('product_id', productId)
        .single();

    if (existing) {
        // Update existing stock
        const { error } = await supabase
            .from('temp_stock_company')
            .update({
                qty: existing.qty + qty,
                sales_rate: salesRate,
                purchase_rate: purchaseRate,
            })
            .eq('product_id', productId);

        if (error) throw error;
    } else {
        // Insert new stock record
        const { error } = await supabase
            .from('temp_stock_company')
            .insert([{
                product_id: productId,
                qty,
                sales_rate: salesRate,
                purchase_rate: purchaseRate,
            }]);

        if (error) throw error;
    }
}

export async function decreaseStock(productId: number, qty: number) {
    const { data: existing } = await supabase
        .from('temp_stock_company')
        .select('*')
        .eq('product_id', productId)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('temp_stock_company')
            .update({ qty: Math.max(0, existing.qty - qty) })
            .eq('product_id', productId);

        if (error) throw error;
    }
}

// ==================== EXPENSES ====================

export async function getExpenses(startDate?: string, endDate?: string) {
    let query = supabase
        .from('voucher')
        .select('*, voucher_other_details(*)')
        .order('date', { ascending: false });

    if (startDate && endDate) {
        query = query.gte('date', startDate).lte('date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function addExpense(expense: {
    voucher_no: string;
    name: string;
    details?: string;
    payment_mode: string;
    grand_total: number;
}) {
    const { data, error } = await supabase
        .from('voucher')
        .insert([{
            ...expense,
            date: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== SHIFTS ====================

export async function getActiveShift() {
    const { data, error } = await supabase
        .from('shift_instances')
        .select(`
      *,
      shift_definitions (*)
    `)
        .eq('shift_status', 'Open')
        .order('created_date', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

export async function startShift(shiftDefId: number, openingCash: number, userId: string) {
    const { data, error } = await supabase
        .from('shift_instances')
        .insert([{
            shift_def_id: shiftDefId,
            shift_date: new Date().toISOString().split('T')[0],
            actual_start_time: new Date().toISOString(),
            shift_status: 'Open',
            opening_cash: openingCash,
            created_by: userId,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function closeShift(shiftInstanceId: number, closingCash: number, userId: string) {
    const { data, error } = await supabase
        .from('shift_instances')
        .update({
            actual_end_time: new Date().toISOString(),
            shift_status: 'Closed',
            closing_cash: closingCash,
            closed_by: userId,
            closed_date: new Date().toISOString(),
        })
        .eq('shift_instance_id', shiftInstanceId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== CREDIT CUSTOMERS ====================

export async function getCreditCustomers() {
    const { data, error } = await supabase
        .from('credit_customer')
        .select('*')
        .order('name');

    if (error) throw error;
    return data;
}

export async function addCreditCustomer(customer: {
    credit_customer_id: string;
    name: string;
    contact_no?: string;
    address?: string;
    credit_limit?: number;
}) {
    const { data, error } = await supabase
        .from('credit_customer')
        .insert([{
            ...customer,
            active: 'Yes',
            registration_date: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== DASHBOARD STATS ====================

export async function getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];

    // Get today's sales
    const { data: todaySales } = await supabase
        .from('invoice_info')
        .select('grand_total, invoice_payment!inner(payment_mode, amount)')
        .gte('invoice_date', `${today}T00:00:00`)
        .lte('invoice_date', `${today}T23:59:59`);

    // Get products count
    const { count: productsCount } = await supabase
        .from('product')
        .select('*', { count: 'exact', head: true });

    // Get low stock items
    const { count: lowStockCount } = await supabase
        .from('temp_stock_company')
        .select('*', { count: 'exact', head: true })
        .lt('qty', 10);

    // Calculate totals
    const totalRevenue = todaySales?.reduce((sum, sale) => sum + (sale.grand_total || 0), 0) || 0;

    return {
        todayRevenue: totalRevenue,
        transactions: todaySales?.length || 0,
        products: productsCount || 0,
        lowStock: lowStockCount || 0,
    };
}

// ==================== USERS ====================

export async function getUsers() {
    const { data, error } = await supabase
        .from('registration')
        .select('user_id, user_type, name, contact_no, email_id, active, joining_date')
        .order('name');

    if (error) throw error;
    return data;
}

export async function addUser(user: {
    user_id: string;
    user_type: string;
    password: string;
    name: string;
    contact_no?: string;
    email_id?: string;
}) {
    const { data, error } = await supabase
        .from('registration')
        .insert([{
            ...user,
            active: 1,
            joining_date: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== PRODUCTION BATCHES ====================

export async function getProductionBatches(productId: number) {
    const { data, error } = await supabase
        .from('production_batches')
        .select('*')
        .eq('product_id', productId)
        .eq('status', 'Active')
        .gt('qty_remaining', 0)
        .order('production_date', { ascending: true });

    if (error) throw error;
    return data;
}

export async function hasProductionBatches(productId: number): Promise<boolean> {
    const { count, error } = await supabase
        .from('production_batches')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('status', 'Active')
        .gt('qty_remaining', 0);

    if (error) throw error;
    return (count ?? 0) > 0;
}

export async function deductFromBatch(batchId: number, qty: number) {
    const { data: batch, error: fetchError } = await supabase
        .from('production_batches')
        .select('qty_remaining')
        .eq('batch_id', batchId)
        .single();

    if (fetchError) throw fetchError;

    const newQty = Math.max(0, (batch?.qty_remaining || 0) - qty);

    const { error } = await supabase
        .from('production_batches')
        .update({ qty_remaining: newQty })
        .eq('batch_id', batchId);

    if (error) throw error;
}

export async function createProductionBatch(batch: {
    batch_number: string;
    product_id: number;
    product_name: string;
    qty_produced: number;
    total_production_cost: number;
    cost_per_unit: number;
    created_by: string;
}) {
    const { data, error } = await supabase
        .from('production_batches')
        .insert([{
            ...batch,
            qty_remaining: batch.qty_produced,
            production_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months
            status: 'Active'
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ==================== RECIPE / INGREDIENTS ====================

export async function getDishes() {
    const { data, error } = await supabase
        .from('product')
        .select('pid, product_code, product_name, category, purchase_cost, sales_cost, barcode')
        .order('product_name');

    if (error) throw error;
    return data;
}

export async function getIngredients() {
    const { data, error } = await supabase
        .from('products_ingredients')
        .select('*')
        .order('product_name');

    if (error) throw error;
    return data;
}

export async function getIngredientStock(productId: number) {
    const { data, error } = await supabase
        .from('temp_stock_company_ingredients')
        .select('qty')
        .eq('product_id', productId)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.qty ?? 0;
}

export async function saveRecipeIngredient(ingredient: {
    dish: string;
    ingredient: string;
    unit_measure: string;
    qty_issued: number;
    rate: number;
    total_cost: number;
    qty_produced: number;
    receipe_date: string;
    product_id: number;
    batch_number: string;
    cost_per_dish: number;
}) {
    const { data, error } = await supabase
        .from('ingredients')
        .insert([ingredient])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateIngredientStock(productId: number, remainingQty: number) {
    const { data: existing } = await supabase
        .from('temp_stock_company_ingredients')
        .select('*')
        .eq('product_id', productId)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('temp_stock_company_ingredients')
            .update({ qty: remainingQty })
            .eq('product_id', productId);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('temp_stock_company_ingredients')
            .insert([{
                product_id: productId,
                qty: remainingQty,
                manufacturing_date: new Date().toISOString(),
                expiry_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
            }]);
        if (error) throw error;
    }
}

export async function generateBatchNumber(productId: number): Promise<string> {
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const { count } = await supabase
        .from('production_batches')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
        .gte('production_date', new Date().toISOString().split('T')[0]);

    const sequence = (count ?? 0) + 1;
    return `BATCH-${dateCode}-${productId}-${String(sequence).padStart(3, '0')}`;
}

// ==================== COMPLETE SALE TRANSACTION ====================

export async function getNextInvoiceNumber(): Promise<string> {
    const { data, error } = await supabase
        .from('invoice_info')
        .select('invoice_no')
        .order('invoice_id', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (data?.invoice_no) {
        // Parse existing invoice number (e.g., "INV-0001")
        const match = data.invoice_no.match(/INV-(\d+)/);
        if (match) {
            const nextNum = parseInt(match[1]) + 1;
            return `INV-${String(nextNum).padStart(4, '0')}`;
        }
    }
    return 'INV-0001';
}

export async function completeSaleTransaction(sale: {
    invoiceNo: string;
    items: Array<{
        productId: number;
        productName: string;
        qty: number;
        price: number;
        purchasePrice: number;
        discount: number;
        notes?: string;
        batchId?: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: string;
    amountPaid: number;
    change: number;
    cashierName: string;
    shiftInstanceId?: number;
    customerName?: string;
    mpesaReceipt?: string;
    tableNo?: string;
    orderNotes?: string;
}) {
    // 1. Create invoice
    const { data: invoice, error: invoiceError } = await supabase
        .from('invoice_info')
        .insert([{
            invoice_no: sale.invoiceNo,
            invoice_date: new Date().toISOString(),
            grand_total: sale.total,
            cash: sale.amountPaid,
            change: sale.change,
            customer_name: sale.customerName,
            salesman_name: sale.cashierName,
            shift_instance_id: sale.shiftInstanceId,
            table_no: sale.tableNo,
            order_notes: sale.orderNotes,
            discount: sale.discount,
            tax: sale.tax
        }])
        .select()
        .single();

    if (invoiceError) throw invoiceError;

    const invoiceId = invoice.invoice_id;

    // 2. Add invoice products
    const invoiceProducts = sale.items.map(item => ({
        invoice_id: invoiceId,
        product_id: item.productId,
        sales_rate: item.price,
        qty: item.qty,
        total_amount: (item.price * item.qty) - item.discount,
        purchase_rate: item.purchasePrice,
        discount: item.discount,
        item_notes: item.notes,
        batch_id: item.batchId
    }));

    const { error: productsError } = await supabase
        .from('invoice_product')
        .insert(invoiceProducts);

    if (productsError) throw productsError;

    // 3. Add payment record
    const { error: paymentError } = await supabase
        .from('invoice_payment')
        .insert([{
            invoice_id: invoiceId,
            payment_mode: sale.paymentMethod,
            amount: sale.amountPaid,
            mpesa_receipt_number: sale.mpesaReceipt,
            payment_date: new Date().toISOString()
        }]);

    if (paymentError) throw paymentError;

    // 4. Update stock for each item
    for (const item of sale.items) {
        // If has batch, deduct from batch
        if (item.batchId) {
            await deductFromBatch(item.batchId, item.qty);
        }

        // Update main stock
        await decreaseStock(item.productId, item.qty);
    }

    return { invoiceId, invoiceNo: sale.invoiceNo };
}

// ==================== RECIPE RECORDS ====================

export async function getRecipeRecords(startDate?: string, endDate?: string) {
    let query = supabase
        .from('ingredients')
        .select('*')
        .order('receipe_date', { ascending: false });

    if (startDate) {
        query = query.gte('receipe_date', startDate);
    }
    if (endDate) {
        query = query.lte('receipe_date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getProductionBatchRecords(startDate?: string, endDate?: string) {
    let query = supabase
        .from('production_batches')
        .select('*')
        .order('production_date', { ascending: false });

    if (startDate) {
        query = query.gte('production_date', startDate);
    }
    if (endDate) {
        query = query.lte('production_date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getCompanyInfo() {
    const { data, error } = await supabase
        .from('company')
        .select('*')
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

// ==================== SALES (Restaurant POS) ====================

// Get next receipt number for sales
export async function getNextReceiptNumber(): Promise<string> {
    const { data, error } = await supabase
        .from('sales')
        .select('receipt_no')
        .order('sale_id', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (data?.receipt_no) {
        // Parse existing receipt number (e.g., "RCP-00001")
        const match = data.receipt_no.match(/RCP-(\d+)/);
        if (match) {
            const nextNum = parseInt(match[1]) + 1;
            return `RCP-${String(nextNum).padStart(5, '0')}`;
        }
    }
    return 'RCP-00001';
}

// Get next KOT number
export async function getNextKOTNumber(): Promise<string> {
    const { data, error } = await supabase
        .from('kitchen_orders')
        .select('kot_number')
        .order('kot_id', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (data?.kot_number) {
        const match = data.kot_number.match(/K(\d+)/);
        if (match) {
            const nextNum = parseInt(match[1]) + 1;
            return `K${String(nextNum).padStart(4, '0')}`;
        }
    }
    return 'K0001';
}

// Get active food order notes
export async function getFoodOrderNotes() {
    const { data, error } = await supabase
        .from('food_order_notes')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
}

// Save pending sale (when KOT is clicked - order sent to kitchen but not paid)
export async function savePendingSale(sale: {
    receiptNo: string;
    kotNumber: string;
    items: Array<{
        productId: number;
        productName: string;
        qty: number;
        price: number;
        costPrice: number;
        discount: number;
        notes?: string;
        batchId?: number;
        batchNumber?: string;
    }>;
    subtotal: number;
    discount: number;
    taxAmount: number;
    total: number;
    cashierName: string;
    shiftId?: number;
    shiftName?: string;
    shiftCode?: string;
    tableId?: number;
    tableName?: string;
    roomName?: string;
    waiterId?: number;
    waiterName?: string;
    orderType?: string;
    customerName?: string;
    customerPhone?: string;
    orderNotes?: string;
}) {
    // 1. Create sale record with Pending status
    const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
            receipt_no: sale.receiptNo,
            sale_date: new Date().toISOString().split('T')[0],
            sale_time: new Date().toTimeString().split(' ')[0],
            sale_datetime: new Date().toISOString(),
            shift_id: sale.shiftId,
            shift_name: sale.shiftName,
            shift_code: sale.shiftCode,
            waiter_id: sale.waiterId,
            waiter_name: sale.waiterName || sale.cashierName,
            table_id: sale.tableId,
            table_name: sale.tableName,
            room_name: sale.roomName,
            order_type: sale.orderType || 'Quick Sale',
            kot_number: sale.kotNumber,
            customer_name: sale.customerName,
            customer_phone: sale.customerPhone,
            subtotal: sale.subtotal,
            discount: sale.discount,
            discount_percent: sale.subtotal > 0 ? (sale.discount / sale.subtotal) * 100 : 0,
            tax_amount: sale.taxAmount,
            total_amount: sale.total,
            total_cost: sale.items.reduce((sum, item) => sum + (item.costPrice * item.qty), 0),
            profit: sale.total - sale.items.reduce((sum, item) => sum + (item.costPrice * item.qty), 0),
            payment_method: 'Pending',
            amount_paid: 0,
            change_amount: 0,
            status: 'Pending',
            notes: sale.orderNotes,
            created_by: sale.cashierName,
        }])
        .select()
        .single();

    if (saleError) throw saleError;

    const saleId = saleData.sale_id;

    // 2. Add sale items
    const saleItems = sale.items.map(item => ({
        sale_id: saleId,
        product_id: item.productId,
        product_name: item.productName,
        batch_id: item.batchId,
        batch_number: item.batchNumber,
        quantity: item.qty,
        unit_price: item.price,
        cost_price: item.costPrice,
        discount: item.discount,
        subtotal: (item.price * item.qty) - item.discount,
        profit: ((item.price * item.qty) - item.discount) - (item.costPrice * item.qty),
        notes: item.notes,
    }));

    const { error: itemsError } = await supabase
        .from('sales_items')
        .insert(saleItems);

    if (itemsError) throw itemsError;

    // 3. Create KOT record
    const { data: kotData, error: kotError } = await supabase
        .from('kitchen_orders')
        .insert([{
            kot_number: sale.kotNumber,
            sale_id: saleId,
            table_id: sale.tableId,
            table_name: sale.tableName,
            waiter_id: sale.waiterId,
            waiter_name: sale.waiterName || sale.cashierName,
            status: 'Pending',
            notes: sale.orderNotes,
            printed_at: new Date().toISOString(),
        }])
        .select()
        .single();

    if (kotError) throw kotError;

    const kotId = kotData.kot_id;

    // 4. Add KOT items
    const kotItems = sale.items.map(item => ({
        kot_id: kotId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.qty,
        notes: item.notes,
        status: 'Pending',
    }));

    const { error: kotItemsError } = await supabase
        .from('kot_items')
        .insert(kotItems);

    if (kotItemsError) throw kotItemsError;

    // 5. Deduct stock from batch for each item (food is being prepared)
    for (const item of sale.items) {
        if (item.batchId) {
            await deductFromBatch(item.batchId, item.qty);
        }
    }

    return { saleId, receiptNo: sale.receiptNo, kotId, kotNumber: sale.kotNumber };
}

// Complete a pending sale (when payment is received)
export async function completePendingSale(
    saleId: number,
    paymentMethod: string,
    amountPaid: number,
    change: number,
    mpesaCode?: string
) {
    const { data, error } = await supabase
        .from('sales')
        .update({
            payment_method: paymentMethod,
            amount_paid: amountPaid,
            change_amount: change,
            mpesa_code: mpesaCode,
            status: 'Completed',
            updated_at: new Date().toISOString(),
        })
        .eq('sale_id', saleId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Get pending sales (unpaid orders)
export async function getPendingSales() {
    const { data, error } = await supabase
        .from('sales')
        .select(`
            *,
            sales_items (*)
        `)
        .eq('status', 'Pending')
        .order('sale_datetime', { ascending: false });

    if (error) throw error;
    return data || [];
}
