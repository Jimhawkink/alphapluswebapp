'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { generateCustomerBillHTML, createReceiptData, loadCompanyInfo } from '@/lib/receiptPrinter';
import { executeDirectPrint } from '@/lib/printerSettings';

interface SaleItem {
    item_id?: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    cost_price?: number;
    discount?: number;
    total_price?: number;
    notes?: string;
}

interface OpenReceipt {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    table_no?: string;
    customer_name?: string;
    subtotal: number;
    discount: number;
    tax_amount: number;
    total_amount: number;
    payment_method: string;
    status: string;
    order_type?: string;
    waiter_name?: string;
    notes?: string;
    items: SaleItem[];
}

export default function SplitMergeReceiptsPage() {
    const [openReceipts, setOpenReceipts] = useState<OpenReceipt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'merge' | 'split' | 'ledger'>('split');
    const [searchQuery, setSearchQuery] = useState('');

    // --- MERGE STUDIO STATE ---
    const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
    const [destinationReceiptId, setDestinationReceiptId] = useState<number | null>(null);
    const [isMerging, setIsMerging] = useState(false);

    // --- SPLIT STUDIO STATE ---
    const [splitReceipt, setSplitReceipt] = useState<OpenReceipt | null>(null);
    const [splitType, setSplitType] = useState<'equal' | 'itemized'>('equal');
    const [equalShares, setEqualShares] = useState(2);
    const [paidShares, setPaidShares] = useState<Record<number, { method: string; amount: number; guestName?: string; ref?: string }>>({});
    
    // Itemized buckets
    const [subReceipts, setSubReceipts] = useState<Array<{
        id: number;
        guestName: string;
        items: Array<SaleItem & { selectedQty: number }>;
    }>>([
        { id: 1, guestName: 'Guest 1', items: [] },
        { id: 2, guestName: 'Guest 2', items: [] }
    ]);

    // Load Open Receipts from Supabase
    const loadOpenReceipts = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data: sales, error } = await supabase
                .from('sales')
                .select('*')
                .in('status', ['Pending', 'Open', 'Unpaid'])
                .order('sale_datetime', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (sales && sales.length > 0) {
                const fullReceipts: OpenReceipt[] = await Promise.all(
                    sales.map(async (s) => {
                        const { data: items } = await supabase
                            .from('sales_items')
                            .select('*')
                            .eq('sale_id', s.sale_id);

                        return {
                            ...s,
                            items: (items || []).map((it: any) => ({
                                item_id: it.item_id,
                                product_id: it.product_id,
                                product_name: it.product_name,
                                quantity: Number(it.quantity) || 1,
                                unit_price: Number(it.unit_price) || 0,
                                cost_price: Number(it.cost_price) || 0,
                                discount: Number(it.discount) || 0,
                                total_price: Number(it.total_price) || (Number(it.unit_price) * Number(it.quantity)),
                                notes: it.notes || ''
                            }))
                        };
                    })
                );
                setOpenReceipts(fullReceipts);
                // Auto-select first receipt for split if none selected
                if (!splitReceipt && fullReceipts.length > 0) {
                    setSplitReceipt(fullReceipts[0]);
                }
            } else {
                setOpenReceipts([]);
            }
        } catch (err) {
            console.error('Error loading open receipts:', err);
            toast.error('Failed to load open receipts');
        } finally {
            setIsLoading(false);
        }
    }, [splitReceipt]);

    useEffect(() => {
        loadOpenReceipts();
    }, [loadOpenReceipts]);

    // Filtered receipts
    const filteredReceipts = useMemo(() => {
        if (!searchQuery) return openReceipts;
        const q = searchQuery.toLowerCase();
        return openReceipts.filter(r =>
            (r.receipt_no || '').toLowerCase().includes(q) ||
            (r.table_no || '').toLowerCase().includes(q) ||
            (r.customer_name || '').toLowerCase().includes(q) ||
            (r.waiter_name || '').toLowerCase().includes(q)
        );
    }, [openReceipts, searchQuery]);

    // KPI Metrics
    const totalOpenKsh = useMemo(() => openReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0), [openReceipts]);
    const averageCheckKsh = useMemo(() => openReceipts.length > 0 ? Math.round(totalOpenKsh / openReceipts.length) : 0, [openReceipts, totalOpenKsh]);

    // =========================================================================
    // MERGE RECEIPTS LOGIC
    // =========================================================================
    const toggleMergeSelection = (id: number) => {
        setSelectedForMerge(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            return [...prev, id];
        });
    };

    const executeMergeReceipts = async () => {
        if (selectedForMerge.length < 2) {
            toast.error('Select at least 2 open receipts to merge!');
            return;
        }

        const destId = destinationReceiptId || selectedForMerge[0];
        const sourceIds = selectedForMerge.filter(id => id !== destId);

        const destReceipt = openReceipts.find(r => r.sale_id === destId);
        if (!destReceipt) return;

        setIsMerging(true);
        try {
            // Collect all items from source receipts
            const itemsToTransfer: SaleItem[] = [];
            let totalAdditionalAmount = 0;
            let totalAdditionalDiscount = 0;

            for (const sId of sourceIds) {
                const sReceipt = openReceipts.find(r => r.sale_id === sId);
                if (sReceipt) {
                    itemsToTransfer.push(...sReceipt.items);
                    totalAdditionalAmount += (sReceipt.total_amount || 0);
                    totalAdditionalDiscount += (sReceipt.discount || 0);

                    // Mark source receipt as merged
                    await supabase
                        .from('sales')
                        .update({
                            status: 'Merged',
                            notes: `Merged into Master Receipt #${destReceipt.receipt_no}`
                        })
                        .eq('sale_id', sId);
                }
            }

            // Transfer items to destination receipt in sales_items
            if (itemsToTransfer.length > 0) {
                const newItemsPayload = itemsToTransfer.map(item => ({
                    sale_id: destId,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    cost_price: item.cost_price || 0,
                    discount: item.discount || 0,
                    total_price: (item.unit_price * item.quantity) - (item.discount || 0),
                    notes: item.notes ? `${item.notes} (Merged)` : 'Merged Item'
                }));

                await supabase.from('sales_items').insert(newItemsPayload);
            }

            // Update destination receipt total
            const newTotal = (destReceipt.total_amount || 0) + totalAdditionalAmount;
            const newDiscount = (destReceipt.discount || 0) + totalAdditionalDiscount;
            const newSubtotal = (destReceipt.subtotal || 0) + totalAdditionalAmount;

            await supabase
                .from('sales')
                .update({
                    subtotal: newSubtotal,
                    discount: newDiscount,
                    total_amount: newTotal,
                    notes: `Master Consolidated Receipt (Merged from ${sourceIds.length} checks)`
                })
                .eq('sale_id', destId);

            toast.success(`Merged ${sourceIds.length} receipts into Master Receipt #${destReceipt.receipt_no} ✅`);
            setSelectedForMerge([]);
            setDestinationReceiptId(null);
            await loadOpenReceipts();
        } catch (err) {
            console.error('Error executing receipt merge:', err);
            toast.error('Failed to merge receipts');
        } finally {
            setIsMerging(false);
        }
    };

    // =========================================================================
    // SPLIT RECEIPTS LOGIC
    // =========================================================================
    const handlePayEqualShare = async (shareIndex: number, method: string) => {
        if (!splitReceipt) return;
        const total = splitReceipt.total_amount || 0;
        const shareAmount = Math.round(total / equalShares);
        const guestName = prompt(`Enter Guest #${shareIndex} Name / Note:`, `Guest ${shareIndex}`) || `Guest ${shareIndex}`;
        let mpesaRef = '';
        if (method === 'M-Pesa') {
            mpesaRef = prompt('Enter M-Pesa Confirmation Ref (e.g. QHK82910):', '') || `MP-${Date.now().toString().slice(-6)}`;
        }

        // Print split receipt slip
        const companyInfo = await loadCompanyInfo();
        const splitInvoiceNo = `${splitReceipt.receipt_no}-${String.fromCharCode(64 + shareIndex)}`;

        const receiptData = createReceiptData(
            splitInvoiceNo,
            [{ name: `Dining Share (${shareIndex}/${equalShares})`, qty: 1, price: shareAmount }],
            method,
            shareAmount,
            'Cashier',
            {
                customerName: guestName,
                mpesaReceipt: mpesaRef,
                tableNo: splitReceipt.table_no,
                orderNotes: `Split Share ${shareIndex} of ${equalShares} for Bill #${splitReceipt.receipt_no}`,
                isPaid: true
            }
        );

        const html = await generateCustomerBillHTML(receiptData, companyInfo, true);
        await executeDirectPrint(html, { printerRole: 'customer' });

        setPaidShares(prev => ({
            ...prev,
            [shareIndex]: { method, amount: shareAmount, guestName, ref: mpesaRef }
        }));

        toast.success(`Paid & Printed Receipt #${splitInvoiceNo} for ${guestName} (Ksh ${shareAmount.toLocaleString()}) 🧾`);

        // If all shares paid, mark original sale completed
        const nextPaidCount = Object.keys(paidShares).length + 1;
        if (nextPaidCount >= equalShares) {
            await supabase
                .from('sales')
                .update({
                    status: 'Completed',
                    payment_method: 'SPLIT MULTI',
                    notes: `Fully Settled across ${equalShares} split receipts`
                })
                .eq('sale_id', splitReceipt.sale_id);
            toast.success(`Master Check #${splitReceipt.receipt_no} Fully Settled! 🎉`);
            await loadOpenReceipts();
        }
    };

    // Add item to sub-receipt bucket for itemized split
    const addItemToSubReceipt = (subReceiptId: number, item: SaleItem) => {
        setSubReceipts(prev => prev.map(sr => {
            if (sr.id === subReceiptId) {
                const existing = sr.items.find(i => i.product_id === item.product_id);
                if (existing) {
                    return {
                        ...sr,
                        items: sr.items.map(i => i.product_id === item.product_id ? { ...i, selectedQty: i.selectedQty + 1 } : i)
                    };
                } else {
                    return {
                        ...sr,
                        items: [...sr.items, { ...item, selectedQty: 1 }]
                    };
                }
            }
            return sr;
        }));
    };

    const removeItemFromSubReceipt = (subReceiptId: number, productId: number) => {
        setSubReceipts(prev => prev.map(sr => {
            if (sr.id === subReceiptId) {
                return {
                    ...sr,
                    items: sr.items.filter(i => i.product_id !== productId)
                };
            }
            return sr;
        }));
    };

    const addSubReceiptBucket = () => {
        setSubReceipts(prev => [
            ...prev,
            { id: prev.length + 1, guestName: `Guest ${prev.length + 1}`, items: [] }
        ]);
    };

    const settleItemizedSubReceipt = async (subReceiptId: number, method: string) => {
        if (!splitReceipt) return;
        const bucket = subReceipts.find(b => b.id === subReceiptId);
        if (!bucket || bucket.items.length === 0) {
            toast.error('Add items to this split receipt before settling!');
            return;
        }

        const bucketTotal = bucket.items.reduce((sum, item) => sum + (item.unit_price * item.selectedQty), 0);
        const splitInvoiceNo = `${splitReceipt.receipt_no}-S${bucket.id}`;
        const companyInfo = await loadCompanyInfo();

        const receiptData = createReceiptData(
            splitInvoiceNo,
            bucket.items.map(i => ({ name: i.product_name, qty: i.selectedQty, price: i.unit_price })),
            method,
            bucketTotal,
            'Cashier',
            {
                customerName: bucket.guestName,
                tableNo: splitReceipt.table_no,
                orderNotes: `Itemized Split from Bill #${splitReceipt.receipt_no}`,
                isPaid: true
            }
        );

        const html = await generateCustomerBillHTML(receiptData, companyInfo, true);
        await executeDirectPrint(html, { printerRole: 'customer' });

        toast.success(`Settled & Printed Split Receipt #${splitInvoiceNo} (Ksh ${bucketTotal.toLocaleString()})! 🧾`);

        // Remove settled items from subReceipts bucket
        setSubReceipts(prev => prev.filter(b => b.id !== subReceiptId));
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-2 sm:p-4">
            {/* Top Cockpit Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black uppercase tracking-wider">
                            Multi-Check Studio
                        </span>
                        <span className="text-xs text-gray-500 font-medium">Real-Time Supabase Ledger</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
                        <span>✂️</span> Split &amp; Merge Receipts Studio
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Consolidate multiple guest checks into master receipts, or split bills into equal shares &amp; itemized receipts with direct 80mm printing.
                    </p>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200">
                    <button
                        onClick={() => setActiveTab('split')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'split' ? 'bg-white text-emerald-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>✂️</span>
                        <span>Split Receipt</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('merge')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'merge' ? 'bg-white text-indigo-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>⚯</span>
                        <span>Merge Receipts</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                            activeTab === 'ledger' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span>📋</span>
                        <span>Open Ledger</span>
                    </button>
                </div>
            </div>

            {/* Live KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Open Unpaid Checks</p>
                    <p className="text-3xl font-black text-gray-900 mt-1">{openReceipts.length}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">● Active Dining &amp; Tabs</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Open Value</p>
                    <p className="text-3xl font-black text-emerald-700 mt-1 font-mono">Ksh {totalOpenKsh.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-400 mt-1">Pending cashier settlement</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Average Check Size</p>
                    <p className="text-3xl font-black text-indigo-700 mt-1 font-mono">Ksh {averageCheckKsh.toLocaleString()}</p>
                    <p className="text-[11px] text-indigo-500 font-semibold mt-1">Per active receipt</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <p className="text-xs font-bold text-gray-500 uppercase">Receipt Splitting</p>
                    <p className="text-3xl font-black text-purple-700 mt-1">2 - 8 Pax</p>
                    <p className="text-[11px] text-purple-600 font-semibold mt-1">Equal or Itemized</p>
                </div>
            </div>

            {/* TAB 1: SPLIT RECEIPT STUDIO */}
            {activeTab === 'split' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left 4 Cols: Open Receipts Selector */}
                    <div className="lg:col-span-4 bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 flex flex-col h-[750px]">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                            <h2 className="text-base font-black text-gray-900">Select Receipt to Split</h2>
                            <span className="text-xs text-gray-400 font-bold">{openReceipts.length} Active</span>
                        </div>

                        <div className="relative mb-3">
                            <input
                                type="text"
                                placeholder="Search receipt, table, guest..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-500"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-gray-400">🔍</span>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                            {filteredReceipts.map(r => {
                                const isSelected = splitReceipt?.sale_id === r.sale_id;
                                return (
                                    <div
                                        key={r.sale_id}
                                        onClick={() => setSplitReceipt(r)}
                                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                                            isSelected
                                                ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                                                : 'border-gray-100 hover:border-gray-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-gray-900 font-mono">
                                                #{r.receipt_no}
                                            </span>
                                            <span className="text-xs font-black text-emerald-700 font-mono">
                                                Ksh {r.total_amount?.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                                            <span>{r.table_no ? `Table ${r.table_no}` : 'Counter Tab'}</span>
                                            <span>{r.items.length} items</span>
                                        </div>
                                        {r.customer_name && (
                                            <p className="text-[10px] text-gray-400 truncate mt-0.5">Guest: {r.customer_name}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right 8 Cols: Splitting Canvas */}
                    <div className="lg:col-span-8 bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 h-[750px] flex flex-col">
                        {splitReceipt ? (
                            <>
                                {/* Receipt Header Strip */}
                                <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-black text-gray-900">
                                                Receipt #{splitReceipt.receipt_no}
                                            </h3>
                                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                                                {splitReceipt.table_no ? `Table ${splitReceipt.table_no}` : 'Counter'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {splitReceipt.items.length} dishes · Subtotal Ksh {splitReceipt.subtotal?.toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 uppercase font-bold">Grand Total</p>
                                        <p className="text-2xl font-black text-emerald-700 font-mono">
                                            Ksh {splitReceipt.total_amount?.toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Split Mode Selector */}
                                <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-2xl mb-5">
                                    <button
                                        onClick={() => setSplitType('equal')}
                                        className={`py-2 rounded-xl text-xs font-black transition-all ${
                                            splitType === 'equal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                        }`}
                                    >
                                        👥 Mode 1: Equal Split Receipts
                                    </button>
                                    <button
                                        onClick={() => setSplitType('itemized')}
                                        className={`py-2 rounded-xl text-xs font-black transition-all ${
                                            splitType === 'itemized' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                        }`}
                                    >
                                        🧾 Mode 2: Itemized Dish Allocation
                                    </button>
                                </div>

                                {/* EQUAL SPLIT MODE */}
                                {splitType === 'equal' && (
                                    <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                                        <div>
                                            <label className="text-xs font-bold uppercase text-gray-500 block mb-2">
                                                Number of Separate Receipts to Generate
                                            </label>
                                            <div className="grid grid-cols-5 gap-2">
                                                {[2, 3, 4, 5, 6].map(n => (
                                                    <button
                                                        key={n}
                                                        onClick={() => setEqualShares(n)}
                                                        className={`py-3 rounded-2xl text-xs font-black border transition-all ${
                                                            equalShares === n
                                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30'
                                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {n} Receipts
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-sm text-emerald-800 font-bold mt-2">
                                                Each receipt amount: <span className="text-base font-black font-mono">Ksh {Math.round((splitReceipt.total_amount || 0) / equalShares).toLocaleString()}</span>
                                            </p>
                                        </div>

                                        {/* Separate Share Receipts Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {Array.from({ length: equalShares }).map((_, idx) => {
                                                const shareNo = idx + 1;
                                                const isPaid = Boolean(paidShares[shareNo]);
                                                const shareAmt = Math.round((splitReceipt.total_amount || 0) / equalShares);
                                                return (
                                                    <div
                                                        key={shareNo}
                                                        className={`p-4 rounded-3xl border-2 transition-all ${
                                                            isPaid
                                                                ? 'border-green-300 bg-green-50/60'
                                                                : 'border-gray-200 bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-black">
                                                                    {shareNo}
                                                                </span>
                                                                <span className="text-xs font-black text-gray-800">
                                                                    Receipt #{splitReceipt.receipt_no}-{String.fromCharCode(64 + shareNo)}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm font-black font-mono text-gray-900">
                                                                Ksh {shareAmt.toLocaleString()}
                                                            </span>
                                                        </div>

                                                        {isPaid ? (
                                                            <div className="p-2.5 bg-green-100 rounded-xl text-green-800 text-xs font-bold flex items-center justify-between">
                                                                <span>✅ Settled ({paidShares[shareNo].method})</span>
                                                                <span>{paidShares[shareNo].guestName}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-2 mt-3">
                                                                <button
                                                                    onClick={() => handlePayEqualShare(shareNo, 'Cash')}
                                                                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm"
                                                                >
                                                                    💵 Pay Cash
                                                                </button>
                                                                <button
                                                                    onClick={() => handlePayEqualShare(shareNo, 'M-Pesa')}
                                                                    className="py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black shadow-sm"
                                                                >
                                                                    📱 Pay M-Pesa
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ITEMIZED SPLIT MODE */}
                                {splitType === 'itemized' && (
                                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-bold text-gray-500 uppercase">
                                                Available Check Items (Click to allocate to guest receipt)
                                            </p>
                                            <button
                                                onClick={addSubReceiptBucket}
                                                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black border border-indigo-200"
                                            >
                                                + Add Another Guest Receipt
                                            </button>
                                        </div>

                                        {/* Original Items list */}
                                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-2xl border border-gray-200">
                                            {splitReceipt.items.map(item => (
                                                <div
                                                    key={item.product_id}
                                                    className="p-2 bg-white rounded-xl border border-gray-200 text-xs shadow-sm flex items-center gap-2"
                                                >
                                                    <span className="font-bold text-gray-800">{item.product_name}</span>
                                                    <span className="text-gray-500">x{item.quantity}</span>
                                                    <span className="font-mono text-emerald-700 font-bold">Ksh {item.unit_price}</span>
                                                    <div className="flex items-center gap-1 ml-2">
                                                        {subReceipts.map(sr => (
                                                            <button
                                                                key={sr.id}
                                                                onClick={() => addItemToSubReceipt(sr.id, item)}
                                                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black border border-indigo-200"
                                                            >
                                                                + {sr.guestName}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Sub-Receipt Buckets */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {subReceipts.map(sr => {
                                                const totalBucket = sr.items.reduce((sum, i) => sum + (i.unit_price * i.selectedQty), 0);
                                                return (
                                                    <div key={sr.id} className="p-4 bg-white rounded-3xl border-2 border-indigo-100 shadow-sm space-y-3">
                                                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                                            <input
                                                                type="text"
                                                                value={sr.guestName}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setSubReceipts(prev => prev.map(x => x.id === sr.id ? { ...x, guestName: val } : x));
                                                                }}
                                                                className="text-xs font-black text-gray-900 border-b border-dashed border-gray-300 focus:outline-none"
                                                            />
                                                            <span className="text-sm font-black font-mono text-indigo-700">
                                                                Ksh {totalBucket.toLocaleString()}
                                                            </span>
                                                        </div>

                                                        {sr.items.length === 0 ? (
                                                            <p className="text-[11px] text-gray-400 italic text-center py-4">No items allocated to this receipt yet.</p>
                                                        ) : (
                                                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                                                {sr.items.map(it => (
                                                                    <div key={it.product_id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                                                                        <span>{it.product_name} (x{it.selectedQty})</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-mono font-bold">Ksh {it.unit_price * it.selectedQty}</span>
                                                                            <button
                                                                                onClick={() => removeItemFromSubReceipt(sr.id, it.product_id)}
                                                                                className="text-red-500 font-bold hover:text-red-700"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                                                            <button
                                                                disabled={sr.items.length === 0}
                                                                onClick={() => settleItemizedSubReceipt(sr.id, 'Cash')}
                                                                className="py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold"
                                                            >
                                                                💵 Settle Cash
                                                            </button>
                                                            <button
                                                                disabled={sr.items.length === 0}
                                                                onClick={() => settleItemizedSubReceipt(sr.id, 'M-Pesa')}
                                                                className="py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold"
                                                            >
                                                                📱 Settle M-Pesa
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <span className="text-5xl mb-2">🧾</span>
                                <p className="font-bold text-sm">Select an open receipt from the left column to begin splitting</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: MERGE RECEIPTS STUDIO */}
            {activeTab === 'merge' && (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                <span>⚯</span> Merge Multiple Open Receipts
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Select 2 or more open receipts below to combine into a single consolidated master bill.
                            </p>
                        </div>
                        <button
                            disabled={selectedForMerge.length < 2 || isMerging}
                            onClick={executeMergeReceipts}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
                        >
                            <span>⚯</span>
                            <span>{isMerging ? 'Merging Receipts...' : `Merge (${selectedForMerge.length}) Selected Receipts`}</span>
                        </button>
                    </div>

                    {/* Receipts Grid with Selection Checkboxes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {openReceipts.map(r => {
                            const isSelected = selectedForMerge.includes(r.sale_id);
                            const isDest = destinationReceiptId === r.sale_id;
                            return (
                                <div
                                    key={r.sale_id}
                                    onClick={() => toggleMergeSelection(r.sale_id)}
                                    className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative ${
                                        isSelected
                                            ? 'border-indigo-600 bg-indigo-50/50 shadow-md'
                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {}}
                                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 pointer-events-none"
                                            />
                                            <span className="text-xs font-black font-mono text-gray-900">
                                                #{r.receipt_no}
                                            </span>
                                        </div>
                                        <span className="text-sm font-black font-mono text-indigo-700">
                                            Ksh {r.total_amount?.toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="text-xs text-gray-600 space-y-1">
                                        <p>📍 {r.table_no ? `Table ${r.table_no}` : 'Counter Tab'}</p>
                                        <p>👤 {r.customer_name || 'Walk-in Guest'}</p>
                                        <p>🍽️ {r.items.length} items ordered</p>
                                    </div>

                                    {isSelected && (
                                        <div className="mt-3 pt-3 border-t border-indigo-200 flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDestinationReceiptId(r.sale_id);
                                                }}
                                                className={`px-3 py-1 rounded-xl text-[11px] font-black ${
                                                    isDest ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-300'
                                                }`}
                                            >
                                                {isDest ? '★ Master Destination' : 'Set as Master Destination'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB 3: OPEN RECEIPTS LEDGER */}
            {activeTab === 'ledger' && (
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-lg shadow-emerald-950/5">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="text-[11px] font-bold uppercase text-gray-500 border-b border-gray-100">
                                <tr>
                                    <th className="py-3 px-3">Receipt No</th>
                                    <th className="py-3 px-3">Date &amp; Time</th>
                                    <th className="py-3 px-3">Table / Room</th>
                                    <th className="py-3 px-3">Guest</th>
                                    <th className="py-3 px-3">Items</th>
                                    <th className="py-3 px-3 text-right">Total Amount</th>
                                    <th className="py-3 px-3 text-center">Status</th>
                                    <th className="py-3 px-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {openReceipts.map(r => (
                                    <tr key={r.sale_id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="py-3 px-3 font-mono font-bold text-gray-900">{r.receipt_no}</td>
                                        <td className="py-3 px-3 text-gray-500">{r.sale_date} {r.sale_time}</td>
                                        <td className="py-3 px-3 font-semibold">{r.table_no ? `Table ${r.table_no}` : 'Counter'}</td>
                                        <td className="py-3 px-3 text-gray-600">{r.customer_name || 'Guest'}</td>
                                        <td className="py-3 px-3">{r.items.length} items</td>
                                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700">Ksh {r.total_amount?.toLocaleString()}</td>
                                        <td className="py-3 px-3 text-center">
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            <button
                                                onClick={() => {
                                                    setSplitReceipt(r);
                                                    setActiveTab('split');
                                                }}
                                                className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-[11px] mr-1.5"
                                            >
                                                ✂️ Split
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
