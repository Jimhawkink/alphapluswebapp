'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, getNextReceiptNumber } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { generateCustomerBillHTML, createReceiptData, loadCompanyInfo, CompanyInfo, defaultCompanyInfo } from '@/lib/receiptPrinter';
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
    source_receipt_no?: string;
}

interface OpenReceipt {
    sale_id: number;
    receipt_no: string;
    sale_date: string;
    sale_time: string;
    sale_datetime: string;
    table_no?: string;
    table_name?: string;
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

interface SubReceiptBucket {
    id: number;
    guestName: string;
    items: Array<SaleItem & { selectedQty: number }>;
    isPaid?: boolean;
    paidMethod?: string;
    paidAmount?: number;
    receiptNo?: string;
}

export default function SplitMergeReceiptsPage() {
    const [openReceipts, setOpenReceipts] = useState<OpenReceipt[]>([]);
    const [allLedgerReceipts, setAllLedgerReceipts] = useState<OpenReceipt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'split' | 'merge' | 'ledger'>('split');
    const [searchQuery, setSearchQuery] = useState('');
    const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'All' | 'Pending' | 'Merged' | 'Split' | 'Completed'>('All');

    // --- MERGE STUDIO STATE ---
    const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
    const [isMerging, setIsMerging] = useState(false);
    const [nextMergeReceiptNo, setNextMergeReceiptNo] = useState<string>('Loading...');

    // Modal for New Merged Receipt Customer Bill
    const [newMergedReceipt, setNewMergedReceipt] = useState<{
        receiptNo: string;
        sourceReceipts: string[];
        items: SaleItem[];
        subtotal: number;
        discount: number;
        tax: number;
        total: number;
        tableNo?: string;
        customerName?: string;
        saleId?: number;
    } | null>(null);
    const [showMergedBillModal, setShowMergedBillModal] = useState(false);

    // --- SPLIT STUDIO STATE ---
    const [splitReceipt, setSplitReceipt] = useState<OpenReceipt | null>(null);
    const [splitType, setSplitType] = useState<'equal' | 'itemized'>('equal');
    const [equalShares, setEqualShares] = useState(2);
    const [paidShares, setPaidShares] = useState<Record<number, { method: string; amount: number; guestName?: string; ref?: string; receiptNo?: string }>>({});
    
    // Itemized buckets
    const [subReceipts, setSubReceipts] = useState<SubReceiptBucket[]>([
        { id: 1, guestName: 'Guest 1', items: [] },
        { id: 2, guestName: 'Guest 2', items: [] }
    ]);

    // Active Thermal Bill Viewer Modal
    const [thermalModalData, setThermalModalData] = useState<{
        title: string;
        receiptNo: string;
        html: string;
        isPaid: boolean;
        total: number;
    } | null>(null);

    // Company Settings
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(defaultCompanyInfo);

    useEffect(() => {
        loadCompanyInfo().then(info => setCompanyInfo(info));
    }, []);

    // Load next receipt number for preview in merge studio
    const refreshNextReceiptNo = useCallback(async () => {
        try {
            const nextNo = await getNextReceiptNumber();
            setNextMergeReceiptNo(nextNo);
        } catch {
            setNextMergeReceiptNo('RCP-NEW');
        }
    }, []);

    // Load Open Receipts from Supabase
    const loadReceipts = useCallback(async () => {
        setIsLoading(true);
        try {
            // Load open checks
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

                // Preserve or auto-select splitReceipt
                if (!splitReceipt && fullReceipts.length > 0) {
                    setSplitReceipt(fullReceipts[0]);
                } else if (splitReceipt) {
                    const refreshed = fullReceipts.find(r => r.sale_id === splitReceipt.sale_id);
                    if (refreshed) setSplitReceipt(refreshed);
                }
            } else {
                setOpenReceipts([]);
                setSplitReceipt(null);
            }

            // Load audit ledger (including Merged, Split, Completed)
            const { data: ledgerSales } = await supabase
                .from('sales')
                .select('*')
                .order('sale_id', { ascending: false })
                .limit(60);

            if (ledgerSales) {
                const fullLedger: OpenReceipt[] = await Promise.all(
                    ledgerSales.map(async (s) => {
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
                setAllLedgerReceipts(fullLedger);
            }

            await refreshNextReceiptNo();
        } catch (err) {
            console.error('Error loading open receipts:', err);
            toast.error('Failed to load open receipts');
        } finally {
            setIsLoading(false);
        }
    }, [splitReceipt, refreshNextReceiptNo]);

    useEffect(() => {
        loadReceipts();
    }, [loadReceipts]);

    // Filtered receipts for split selector
    const filteredReceipts = useMemo(() => {
        if (!searchQuery) return openReceipts;
        const q = searchQuery.toLowerCase();
        return openReceipts.filter(r =>
            (r.receipt_no || '').toLowerCase().includes(q) ||
            (r.table_no || '').toLowerCase().includes(q) ||
            (r.table_name || '').toLowerCase().includes(q) ||
            (r.customer_name || '').toLowerCase().includes(q) ||
            (r.waiter_name || '').toLowerCase().includes(q)
        );
    }, [openReceipts, searchQuery]);

    // Filtered ledger
    const filteredLedger = useMemo(() => {
        return allLedgerReceipts.filter(r => {
            const matchesSearch = !searchQuery ||
                (r.receipt_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (r.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (r.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesStatus = ledgerStatusFilter === 'All' ? true : r.status === ledgerStatusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [allLedgerReceipts, searchQuery, ledgerStatusFilter]);

    // KPI Metrics
    const totalOpenKsh = useMemo(() => openReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0), [openReceipts]);
    const averageCheckKsh = useMemo(() => openReceipts.length > 0 ? Math.round(totalOpenKsh / openReceipts.length) : 0, [openReceipts, totalOpenKsh]);

    // =========================================================================
    // MERGE RECEIPTS LOGIC WITH NEW RECEIPT NUMBER & ACCOUNTING AUDIT
    // =========================================================================
    const toggleMergeSelection = (id: number) => {
        setSelectedForMerge(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            return [...prev, id];
        });
    };

    // Live aggregated items for selected merge receipts
    const selectedMergeSummary = useMemo(() => {
        const selected = openReceipts.filter(r => selectedForMerge.includes(r.sale_id));
        const allItems: SaleItem[] = [];
        let subtotal = 0;
        let discount = 0;
        let total = 0;
        const sourceReceiptNos: string[] = [];
        const tables: string[] = [];
        const guests: string[] = [];

        selected.forEach(r => {
            sourceReceiptNos.push(r.receipt_no);
            if (r.table_no && !tables.includes(r.table_no)) tables.push(r.table_no);
            if (r.customer_name && !guests.includes(r.customer_name)) guests.push(r.customer_name);
            subtotal += (r.subtotal || 0);
            discount += (r.discount || 0);
            total += (r.total_amount || 0);

            r.items.forEach(it => {
                allItems.push({
                    ...it,
                    source_receipt_no: r.receipt_no
                });
            });
        });

        return {
            receipts: selected,
            sourceReceiptNos,
            allItems,
            subtotal,
            discount,
            tax: Math.round(subtotal * 0.16),
            total,
            tableStr: tables.length > 0 ? `Tables: ${tables.join(', ')}` : 'Counter',
            guestStr: guests.length > 0 ? guests.join(' & ') : 'Consolidated Guests'
        };
    }, [openReceipts, selectedForMerge]);

    const executeMergeReceipts = async () => {
        if (selectedForMerge.length < 2) {
            toast.error('Select at least 2 open receipts to merge!');
            return;
        }

        setIsMerging(true);
        try {
            // 1. Generate NEXT sequential receipt number
            const newReceiptNo = await getNextReceiptNumber();
            const sourceReceipts = openReceipts.filter(r => selectedForMerge.includes(r.sale_id));
            const sourceNos = sourceReceipts.map(r => r.receipt_no);

            const now = new Date();
            const saleDate = now.toISOString().split('T')[0];
            const saleTime = now.toTimeString().split(' ')[0].substring(0, 5);

            // 2. Create the NEW Master Consolidated Sale record in `sales`
            const { data: newSale, error: saleErr } = await supabase
                .from('sales')
                .insert({
                    receipt_no: newReceiptNo,
                    sale_date: saleDate,
                    sale_time: saleTime,
                    sale_datetime: now.toISOString(),
                    table_no: selectedMergeSummary.tableStr,
                    table_name: selectedMergeSummary.tableStr,
                    customer_name: selectedMergeSummary.guestStr,
                    subtotal: selectedMergeSummary.subtotal,
                    discount: selectedMergeSummary.discount,
                    tax_amount: selectedMergeSummary.tax,
                    total_amount: selectedMergeSummary.total,
                    payment_method: 'Pending',
                    status: 'Pending',
                    order_type: 'Dine-In',
                    notes: `Master Consolidated Check (Merged from #${sourceNos.join(', #')}) on ${now.toLocaleString()}`
                })
                .select()
                .single();

            if (saleErr) throw saleErr;

            const newSaleId = newSale.sale_id;

            // 3. Insert all merged items into `sales_items` linked to newSaleId
            const itemsPayload = selectedMergeSummary.allItems.map(it => ({
                sale_id: newSaleId,
                product_id: it.product_id,
                product_name: it.product_name,
                quantity: it.quantity,
                unit_price: it.unit_price,
                cost_price: it.cost_price || 0,
                discount: it.discount || 0,
                total_price: (it.unit_price * it.quantity) - (it.discount || 0),
                notes: `Merged from check #${it.source_receipt_no}`
            }));

            const { error: itemsErr } = await supabase.from('sales_items').insert(itemsPayload);
            if (itemsErr) console.error('Error inserting merged items:', itemsErr);

            // 4. Mark all source receipts as MERGED INTO for accounting integrity
            for (const src of sourceReceipts) {
                await supabase
                    .from('sales')
                    .update({
                        status: 'Merged',
                        notes: `Merged into Master Check #${newReceiptNo} on ${now.toLocaleString()}`,
                        updated_at: now.toISOString()
                    })
                    .eq('sale_id', src.sale_id);
            }

            // 5. Store new merged receipt for instant customer bill display & printing
            const mergedReceiptData = {
                receiptNo: newReceiptNo,
                sourceReceipts: sourceNos,
                items: selectedMergeSummary.allItems,
                subtotal: selectedMergeSummary.subtotal,
                discount: selectedMergeSummary.discount,
                tax: selectedMergeSummary.tax,
                total: selectedMergeSummary.total,
                tableNo: selectedMergeSummary.tableStr,
                customerName: selectedMergeSummary.guestStr,
                saleId: newSaleId
            };
            setNewMergedReceipt(mergedReceiptData);
            setShowMergedBillModal(true);

            // 6. Generate and auto-preview thermal bill
            const comp = await loadCompanyInfo();
            const rData = createReceiptData(
                newReceiptNo,
                selectedMergeSummary.allItems.map(i => ({
                    name: i.product_name,
                    qty: i.quantity,
                    price: i.unit_price,
                    notes: `From #${i.source_receipt_no}`
                })),
                'Pending',
                selectedMergeSummary.total,
                'Cashier',
                {
                    customerName: selectedMergeSummary.guestStr,
                    tableNo: selectedMergeSummary.tableStr,
                    orderNotes: `CONSOLIDATED CHECK — Merged from #${sourceNos.join(', #')}`,
                    isPaid: false
                }
            );

            const billHtml = await generateCustomerBillHTML(rData, comp, false);
            // Attempt silent or standard print
            await executeDirectPrint(billHtml, { printerRole: 'customer' });

            toast.success(`Merged ${sourceNos.length} checks into NEW Master Check #${newReceiptNo}! 🧾`);
            setSelectedForMerge([]);
            await loadReceipts();
        } catch (err: any) {
            console.error('Error executing receipt merge:', err);
            toast.error(err.message || 'Failed to merge receipts');
        } finally {
            setIsMerging(false);
        }
    };

    // Settle the newly merged receipt directly
    const handleSettleMergedReceipt = async (method: 'Cash' | 'M-Pesa') => {
        if (!newMergedReceipt?.saleId) return;
        try {
            let mpesaRef = '';
            if (method === 'M-Pesa') {
                mpesaRef = prompt('Enter M-Pesa Confirmation Code (e.g. QK876TR9):', '') || `MP-${Date.now().toString().slice(-6)}`;
            }

            const now = new Date();
            await supabase
                .from('sales')
                .update({
                    status: 'Completed',
                    payment_method: method,
                    amount_paid: newMergedReceipt.total,
                    mpesa_code: mpesaRef,
                    paid_at: now.toISOString(),
                    notes: `${newMergedReceipt.receiptNo} settled via ${method}`
                })
                .eq('sale_id', newMergedReceipt.saleId);

            // Print paid final thermal receipt
            const rData = createReceiptData(
                newMergedReceipt.receiptNo,
                newMergedReceipt.items.map(i => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
                method,
                newMergedReceipt.total,
                'Cashier',
                {
                    customerName: newMergedReceipt.customerName,
                    tableNo: newMergedReceipt.tableNo,
                    mpesaReceipt: mpesaRef,
                    orderNotes: `Paid Merged Check (from #${newMergedReceipt.sourceReceipts.join(', #')})`,
                    isPaid: true
                }
            );
            const paidHtml = await generateCustomerBillHTML(rData, companyInfo, true);
            await executeDirectPrint(paidHtml, { printerRole: 'customer' });

            toast.success(`Master Check #${newMergedReceipt.receiptNo} settled via ${method}! 🎉`);
            setShowMergedBillModal(false);
            setNewMergedReceipt(null);
            await loadReceipts();
        } catch (e) {
            console.error('Settle error:', e);
            toast.error('Failed to settle merged receipt');
        }
    };

    // =========================================================================
    // SPLIT RECEIPTS LOGIC WITH THERMAL CUSTOMER BILL PRINTING
    // =========================================================================
    
    // Print Customer Bill (Proforma / Check) for Equal Split Share
    const handlePrintEqualShareBill = async (shareIndex: number) => {
        if (!splitReceipt) return;
        const total = splitReceipt.total_amount || 0;
        const shareAmount = Math.round(total / equalShares);
        const splitInvoiceNo = `${splitReceipt.receipt_no}-${String.fromCharCode(64 + shareIndex)}`;

        const receiptData = createReceiptData(
            splitInvoiceNo,
            [{ name: `Dining Share (${shareIndex}/${equalShares})`, qty: 1, price: shareAmount }],
            'Pending',
            shareAmount,
            'Cashier',
            {
                customerName: `Guest ${shareIndex}`,
                tableNo: splitReceipt.table_no,
                orderNotes: `EQUAL SPLIT BILL (${shareIndex} of ${equalShares}) for Check #${splitReceipt.receipt_no}`,
                isPaid: false
            }
        );

        const html = await generateCustomerBillHTML(receiptData, companyInfo, false);
        setThermalModalData({
            title: `Customer Bill — Share ${shareIndex} (${splitInvoiceNo})`,
            receiptNo: splitInvoiceNo,
            html,
            isPaid: false,
            total: shareAmount
        });

        await executeDirectPrint(html, { printerRole: 'customer' });
        toast.success(`Printed Customer Bill for Share #${shareIndex} (${splitInvoiceNo}) 🧾`);
    };

    // Settle Equal Share and Print Paid Receipt
    const handlePayEqualShare = async (shareIndex: number, method: string) => {
        if (!splitReceipt) return;
        const total = splitReceipt.total_amount || 0;
        const shareAmount = Math.round(total / equalShares);
        const guestName = prompt(`Enter Guest #${shareIndex} Name / Note:`, `Guest ${shareIndex}`) || `Guest ${shareIndex}`;
        let mpesaRef = '';
        if (method === 'M-Pesa') {
            mpesaRef = prompt('Enter M-Pesa Confirmation Ref (e.g. QHK82910):', '') || `MP-${Date.now().toString().slice(-6)}`;
        }

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
        setThermalModalData({
            title: `Paid Receipt — Share ${shareIndex} (${splitInvoiceNo})`,
            receiptNo: splitInvoiceNo,
            html,
            isPaid: true,
            total: shareAmount
        });

        await executeDirectPrint(html, { printerRole: 'customer' });

        setPaidShares(prev => ({
            ...prev,
            [shareIndex]: { method, amount: shareAmount, guestName, ref: mpesaRef, receiptNo: splitInvoiceNo }
        }));

        toast.success(`Settled & Printed Receipt #${splitInvoiceNo} for ${guestName} (Ksh ${shareAmount.toLocaleString()}) 🧾`);

        // If all shares paid, mark original sale completed
        const nextPaidCount = Object.keys(paidShares).length + 1;
        if (nextPaidCount >= equalShares) {
            await supabase
                .from('sales')
                .update({
                    status: 'Completed',
                    payment_method: 'SPLIT MULTI',
                    notes: `Fully Settled across ${equalShares} split receipts (${Object.values(paidShares).map(s => s.receiptNo).join(', ')}, ${splitInvoiceNo})`
                })
                .eq('sale_id', splitReceipt.sale_id);
            toast.success(`Master Check #${splitReceipt.receipt_no} Fully Settled! 🎉`);
            await loadReceipts();
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

    // Print Customer Bill (Proforma / Check) for Itemized Guest Bucket
    const handlePrintItemizedBill = async (subReceiptId: number) => {
        if (!splitReceipt) return;
        const bucket = subReceipts.find(b => b.id === subReceiptId);
        if (!bucket || bucket.items.length === 0) {
            toast.error('Add dishes to this guest bill before printing!');
            return;
        }

        const bucketTotal = bucket.items.reduce((sum, item) => sum + (item.unit_price * item.selectedQty), 0);
        const splitInvoiceNo = `${splitReceipt.receipt_no}-S${bucket.id}`;

        const receiptData = createReceiptData(
            splitInvoiceNo,
            bucket.items.map(i => ({ name: i.product_name, qty: i.selectedQty, price: i.unit_price })),
            'Pending',
            bucketTotal,
            'Cashier',
            {
                customerName: bucket.guestName,
                tableNo: splitReceipt.table_no,
                orderNotes: `ITEMIZED SPLIT BILL for ${bucket.guestName} (Check #${splitReceipt.receipt_no})`,
                isPaid: false
            }
        );

        const html = await generateCustomerBillHTML(receiptData, companyInfo, false);
        setThermalModalData({
            title: `Customer Bill — ${bucket.guestName} (${splitInvoiceNo})`,
            receiptNo: splitInvoiceNo,
            html,
            isPaid: false,
            total: bucketTotal
        });

        await executeDirectPrint(html, { printerRole: 'customer' });
        toast.success(`Printed Customer Bill for ${bucket.guestName} (Ksh ${bucketTotal.toLocaleString()}) 🧾`);
    };

    // Settle Itemized Sub-Receipt and Print Paid Thermal Slip
    const settleItemizedSubReceipt = async (subReceiptId: number, method: string) => {
        if (!splitReceipt) return;
        const bucket = subReceipts.find(b => b.id === subReceiptId);
        if (!bucket || bucket.items.length === 0) {
            toast.error('Add items to this split receipt before settling!');
            return;
        }

        let mpesaRef = '';
        if (method === 'M-Pesa') {
            mpesaRef = prompt(`Enter M-Pesa Code for ${bucket.guestName}:`, '') || `MP-${Date.now().toString().slice(-6)}`;
        }

        const bucketTotal = bucket.items.reduce((sum, item) => sum + (item.unit_price * item.selectedQty), 0);
        const splitInvoiceNo = `${splitReceipt.receipt_no}-S${bucket.id}`;

        const receiptData = createReceiptData(
            splitInvoiceNo,
            bucket.items.map(i => ({ name: i.product_name, qty: i.selectedQty, price: i.unit_price })),
            method,
            bucketTotal,
            'Cashier',
            {
                customerName: bucket.guestName,
                mpesaReceipt: mpesaRef,
                tableNo: splitReceipt.table_no,
                orderNotes: `Itemized Split from Bill #${splitReceipt.receipt_no}`,
                isPaid: true
            }
        );

        const html = await generateCustomerBillHTML(receiptData, companyInfo, true);
        setThermalModalData({
            title: `Paid Receipt — ${bucket.guestName} (${splitInvoiceNo})`,
            receiptNo: splitInvoiceNo,
            html,
            isPaid: true,
            total: bucketTotal
        });

        await executeDirectPrint(html, { printerRole: 'customer' });
        toast.success(`Settled & Printed Split Receipt #${splitInvoiceNo} (Ksh ${bucketTotal.toLocaleString()})! 🧾`);

        // Mark bucket as paid
        setSubReceipts(prev => prev.map(b => b.id === subReceiptId ? {
            ...b,
            isPaid: true,
            paidMethod: method,
            paidAmount: bucketTotal,
            receiptNo: splitInvoiceNo
        } : b));
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
            {/* Top Cockpit Header */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 flex-shrink-0">
                            <span className="text-2xl">✂️</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                                    Split &amp; Merge Receipts Studio
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    80mm / 58mm Thermal Bills Engine
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Consolidate checks with sequential receipt numbering &amp; accounting audit trail, or split bills into equal shares &amp; itemized customer receipts.
                            </p>
                        </div>
                    </div>

                    {/* Navigation Tab Switcher */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                            onClick={() => setActiveTab('split')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'split' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>✂️</span>
                            <span>Split Receipt</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('merge')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'merge' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>⚯</span>
                            <span>Merge Receipts</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('ledger')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'ledger' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>📋</span>
                            <span>Audit Ledger</span>
                        </button>
                    </div>
                </div>

                {/* KPI Overview Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
                    <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                        <p className="text-[11px] font-semibold text-slate-500">Active Unpaid Checks</p>
                        <p className="text-xl font-bold font-mono text-slate-800 mt-0.5">{openReceipts.length}</p>
                    </div>
                    <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                        <p className="text-[11px] font-semibold text-slate-500">Total Open Value</p>
                        <p className="text-xl font-bold font-mono text-emerald-700 mt-0.5">Ksh {totalOpenKsh.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                        <p className="text-[11px] font-semibold text-slate-500">Average Check Size</p>
                        <p className="text-xl font-bold font-mono text-indigo-700 mt-0.5">Ksh {averageCheckKsh.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                        <p className="text-[11px] font-semibold text-slate-500">Next Master Receipt #</p>
                        <p className="text-xl font-bold font-mono text-amber-700 mt-0.5">{nextMergeReceiptNo}</p>
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: SPLIT RECEIPT STUDIO */}
            {/* ========================================================================= */}
            {activeTab === 'split' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left 4 Cols: Open Receipts Selector */}
                    <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col h-[740px]">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                            <h2 className="text-sm font-bold text-slate-800">Select Receipt to Split</h2>
                            <span className="text-xs text-slate-400 font-mono">{openReceipts.length} Active</span>
                        </div>

                        <div className="relative mb-3">
                            <input
                                type="text"
                                placeholder="Search receipt, table, guest..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                            {filteredReceipts.map(r => {
                                const isSelected = splitReceipt?.sale_id === r.sale_id;
                                return (
                                    <div
                                        key={r.sale_id}
                                        onClick={() => setSplitReceipt(r)}
                                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                                            isSelected
                                                ? 'border-indigo-600 bg-indigo-50/60 shadow-sm'
                                                : 'border-slate-100 hover:border-slate-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold font-mono text-indigo-700">
                                                #{r.receipt_no}
                                            </span>
                                            <span className="text-xs font-bold font-mono text-slate-800">
                                                Ksh {r.total_amount?.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                                            <span>{r.table_no ? `Table ${r.table_no}` : 'Counter Tab'}</span>
                                            <span>{r.items.length} items</span>
                                        </div>
                                        {r.customer_name && (
                                            <p className="text-[10px] text-slate-400 truncate mt-0.5">Guest: {r.customer_name}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right 8 Cols: Splitting Canvas */}
                    <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm h-[740px] flex flex-col">
                        {splitReceipt ? (
                            <>
                                {/* Receipt Header Strip */}
                                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold text-slate-800">
                                                Receipt #{splitReceipt.receipt_no}
                                            </h3>
                                            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-200">
                                                {splitReceipt.table_no ? `Table ${splitReceipt.table_no}` : 'Counter Tab'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {splitReceipt.items.length} dishes • Subtotal Ksh {splitReceipt.subtotal?.toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="text-right">
                                        <p className="text-[11px] text-slate-400 uppercase font-semibold">Grand Total</p>
                                        <p className="text-xl font-bold text-emerald-700 font-mono">
                                            Ksh {splitReceipt.total_amount?.toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Split Mode Selector */}
                                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-4">
                                    <button
                                        onClick={() => setSplitType('equal')}
                                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                            splitType === 'equal' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                                        }`}
                                    >
                                        👥 Mode 1: Equal Split Receipts
                                    </button>
                                    <button
                                        onClick={() => setSplitType('itemized')}
                                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                            splitType === 'itemized' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                                        }`}
                                    >
                                        📑 Mode 2: Itemized Dish Allocation
                                    </button>
                                </div>

                                {/* EQUAL SPLIT MODE */}
                                {splitType === 'equal' && (
                                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                                                Number of Separate Customer Checks to Generate
                                            </label>
                                            <div className="grid grid-cols-5 gap-2">
                                                {[2, 3, 4, 5, 6].map(n => (
                                                    <button
                                                        key={n}
                                                        onClick={() => setEqualShares(n)}
                                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                                            equalShares === n
                                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        {n} Bills
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-indigo-700 font-semibold mt-2">
                                                Each split check: <span className="font-bold font-mono">Ksh {Math.round((splitReceipt.total_amount || 0) / equalShares).toLocaleString()}</span>
                                            </p>
                                        </div>

                                        {/* Separate Share Receipts Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {Array.from({ length: equalShares }).map((_, idx) => {
                                                const shareNo = idx + 1;
                                                const isPaid = Boolean(paidShares[shareNo]);
                                                const shareAmt = Math.round((splitReceipt.total_amount || 0) / equalShares);
                                                const subNo = `${splitReceipt.receipt_no}-${String.fromCharCode(64 + shareNo)}`;

                                                return (
                                                    <div
                                                        key={shareNo}
                                                        className={`p-4 rounded-2xl border-2 transition-all ${
                                                            isPaid
                                                                ? 'border-emerald-200 bg-emerald-50/50'
                                                                : 'border-slate-200 bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-[10px] font-bold">
                                                                    {shareNo}
                                                                </span>
                                                                <span className="text-xs font-bold font-mono text-slate-800">
                                                                    #{subNo}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm font-bold font-mono text-slate-800">
                                                                Ksh {shareAmt.toLocaleString()}
                                                            </span>
                                                        </div>

                                                        {isPaid ? (
                                                            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between">
                                                                <span>✅ Settled ({paidShares[shareNo].method})</span>
                                                                <button
                                                                    onClick={() => handlePrintEqualShareBill(shareNo)}
                                                                    className="px-2 py-0.5 rounded bg-white text-emerald-800 text-[10px] font-bold shadow-sm"
                                                                >
                                                                    🖨️ Re-print
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2 mt-3">
                                                                <button
                                                                    onClick={() => handlePrintEqualShareBill(shareNo)}
                                                                    className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"
                                                                >
                                                                    <span>🖨️</span>
                                                                    <span>Print Customer Bill (Check)</span>
                                                                </button>

                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <button
                                                                        onClick={() => handlePayEqualShare(shareNo, 'Cash')}
                                                                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                                                                    >
                                                                        💵 Pay Cash
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handlePayEqualShare(shareNo, 'M-Pesa')}
                                                                        className="py-1.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm"
                                                                    >
                                                                        📱 Pay M-Pesa
                                                                    </button>
                                                                </div>
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
                                            <p className="text-xs font-semibold text-slate-500 uppercase">
                                                Available Check Items (Click to allocate to guest receipt)
                                            </p>
                                            <button
                                                onClick={addSubReceiptBucket}
                                                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200"
                                            >
                                                + Add Another Guest Receipt
                                            </button>
                                        </div>

                                        {/* Original Items list */}
                                        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                                            {splitReceipt.items.map(item => (
                                                <div
                                                    key={item.product_id}
                                                    className="p-2 bg-white rounded-xl border border-slate-200 text-xs shadow-sm flex items-center gap-2"
                                                >
                                                    <span className="font-bold text-slate-800">{item.product_name}</span>
                                                    <span className="text-slate-500">x{item.quantity}</span>
                                                    <span className="font-mono text-emerald-700 font-bold">Ksh {item.unit_price}</span>
                                                    <div className="flex items-center gap-1 ml-2">
                                                        {subReceipts.map(sr => (
                                                            <button
                                                                key={sr.id}
                                                                onClick={() => addItemToSubReceipt(sr.id, item)}
                                                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200"
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
                                                const subReceiptCode = `${splitReceipt.receipt_no}-S${sr.id}`;

                                                return (
                                                    <div key={sr.id} className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-3">
                                                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                                            <div className="flex items-center gap-1.5">
                                                                <input
                                                                    type="text"
                                                                    value={sr.guestName}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        setSubReceipts(prev => prev.map(x => x.id === sr.id ? { ...x, guestName: val } : x));
                                                                    }}
                                                                    className="text-xs font-bold text-slate-800 border-b border-dashed border-slate-300 focus:outline-none"
                                                                />
                                                                <span className="text-[10px] font-mono text-slate-400">
                                                                    #{subReceiptCode}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm font-bold font-mono text-indigo-700">
                                                                Ksh {totalBucket.toLocaleString()}
                                                            </span>
                                                        </div>

                                                        {sr.items.length === 0 ? (
                                                            <p className="text-[11px] text-slate-400 italic text-center py-4">No items allocated to this receipt yet.</p>
                                                        ) : (
                                                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                                                {sr.items.map(it => (
                                                                    <div key={it.product_id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                                                                        <span>{it.product_name} (x{it.selectedQty})</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-mono font-bold">Ksh {it.unit_price * it.selectedQty}</span>
                                                                            <button
                                                                                onClick={() => removeItemFromSubReceipt(sr.id, it.product_id)}
                                                                                className="text-rose-500 font-bold hover:text-rose-700"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Actions: Print Thermal Bill & Settle */}
                                                        {sr.isPaid ? (
                                                            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between">
                                                                <span>✅ Settled via {sr.paidMethod}</span>
                                                                <button
                                                                    onClick={() => handlePrintItemizedBill(sr.id)}
                                                                    className="px-2 py-0.5 rounded bg-white text-emerald-800 text-[10px] font-bold shadow-sm border border-emerald-200"
                                                                >
                                                                    🖨️ Re-print
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                                                <button
                                                                    disabled={sr.items.length === 0}
                                                                    onClick={() => handlePrintItemizedBill(sr.id)}
                                                                    className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"
                                                                >
                                                                    <span>🖨️</span>
                                                                    <span>Print Customer Bill (Thermal)</span>
                                                                </button>

                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <button
                                                                        disabled={sr.items.length === 0}
                                                                        onClick={() => settleItemizedSubReceipt(sr.id, 'Cash')}
                                                                        className="py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm"
                                                                    >
                                                                        💵 Settle Cash
                                                                    </button>
                                                                    <button
                                                                        disabled={sr.items.length === 0}
                                                                        onClick={() => settleItemizedSubReceipt(sr.id, 'M-Pesa')}
                                                                        className="py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm"
                                                                    >
                                                                        📱 Settle M-Pesa
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <span className="text-4xl mb-2">🧾</span>
                                <p className="font-semibold text-xs">Select an open receipt from the left column to begin splitting</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: MERGE RECEIPTS STUDIO (NEXT RECEIPT # & AUDIT MERGED INTO) */}
            {/* ========================================================================= */}
            {activeTab === 'merge' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <span>⚯</span> Merge Multiple Open Receipts
                                    </h2>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                        Target New #: {nextMergeReceiptNo}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Select 2 or more open checks to consolidate into a single new Master Check. Original receipts are archived as "Merged Into" for full accounting compliance.
                                </p>
                            </div>

                            <button
                                disabled={selectedForMerge.length < 2 || isMerging}
                                onClick={executeMergeReceipts}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-100 transition-all flex items-center gap-2"
                            >
                                <span>⚯</span>
                                <span>{isMerging ? 'Merging Checks...' : `Consolidate into New Check #${nextMergeReceiptNo} (${selectedForMerge.length})`}</span>
                            </button>
                        </div>

                        {/* Live Merge Preview Summary Card */}
                        {selectedForMerge.length >= 2 && (
                            <div className="mt-4 p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <span className="text-xs font-bold text-indigo-900">
                                            📋 Live Consolidated Check Preview — New #{nextMergeReceiptNo}
                                        </span>
                                        <p className="text-[11px] text-slate-500">
                                            Accounting Audit: Merging checks #{selectedMergeSummary.sourceReceiptNos.join(', #')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-slate-500 block">Total Consolidated Value</span>
                                        <span className="text-xl font-bold font-mono text-emerald-700">
                                            Ksh {selectedMergeSummary.total.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-3 bg-white rounded-xl border border-indigo-100">
                                    <div className="text-[11px] font-bold text-slate-600 mb-2">
                                        Consolidated Line Items ({selectedMergeSummary.allItems.length} dishes):
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1 text-xs">
                                        {selectedMergeSummary.allItems.map((item, idx) => (
                                            <div key={idx} className="p-1.5 bg-slate-50 rounded-lg flex items-center justify-between">
                                                <div className="truncate pr-2">
                                                    <span className="font-semibold text-slate-800">{item.product_name}</span>
                                                    <span className="text-slate-400 text-[10px] ml-1">x{item.quantity}</span>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <span className="font-mono font-bold text-slate-700">
                                                        Ksh {item.unit_price * item.quantity}
                                                    </span>
                                                    <span className="text-[9px] text-indigo-600 block">
                                                        from #{item.source_receipt_no}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Receipts Grid with Selection Checkboxes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
                            {openReceipts.map(r => {
                                const isSelected = selectedForMerge.includes(r.sale_id);
                                return (
                                    <div
                                        key={r.sale_id}
                                        onClick={() => toggleMergeSelection(r.sale_id)}
                                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                                            isSelected
                                                ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 pointer-events-none"
                                                />
                                                <span className="text-xs font-bold font-mono text-indigo-700">
                                                    #{r.receipt_no}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold font-mono text-slate-800">
                                                Ksh {r.total_amount?.toLocaleString()}
                                            </span>
                                        </div>

                                        <div className="text-xs text-slate-600 space-y-0.5">
                                            <p>📍 {r.table_no ? `Table ${r.table_no}` : 'Counter Tab'}</p>
                                            <p>👤 {r.customer_name || 'Walk-in Guest'}</p>
                                            <p>🍽️ {r.items.length} items ordered</p>
                                        </div>

                                        {isSelected && (
                                            <div className="mt-2 pt-2 border-t border-indigo-200 flex items-center justify-between text-[11px] text-indigo-700 font-semibold">
                                                <span>✓ Selected for consolidation</span>
                                                <span className="font-mono">+{r.items.length} items</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: AUDIT LEDGER (MERGED & SPLIT AUDIT TRAIL) */}
            {/* ========================================================================= */}
            {activeTab === 'ledger' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">
                                📋 Multi-Check Audit &amp; Settlement Ledger
                            </h3>
                            <p className="text-xs text-slate-500">
                                Complete accounting history showing checks merged, checks split, and active bills.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <select
                                value={ledgerStatusFilter}
                                onChange={e => setLedgerStatusFilter(e.target.value as any)}
                                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white outline-none"
                            >
                                <option value="All">All Check Records</option>
                                <option value="Pending">Open / Pending Checks</option>
                                <option value="Merged">Merged Checks (Archived)</option>
                                <option value="Split">Split Parent Checks</option>
                                <option value="Completed">Completed / Paid</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                    <th className="py-3 px-4">Receipt No</th>
                                    <th className="py-3 px-4">Date &amp; Time</th>
                                    <th className="py-3 px-4">Table / Area</th>
                                    <th className="py-3 px-4">Guest</th>
                                    <th className="py-3 px-4">Dishes</th>
                                    <th className="py-3 px-4 text-right">Grand Total</th>
                                    <th className="py-3 px-4 text-center">Status</th>
                                    <th className="py-3 px-4">Accounting Audit Trail</th>
                                    <th className="py-3 px-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {filteredLedger.map(r => (
                                    <tr key={r.sale_id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="py-3 px-4 font-mono font-bold text-slate-900">#{r.receipt_no}</td>
                                        <td className="py-3 px-4 text-slate-500 font-mono">{r.sale_date} {r.sale_time}</td>
                                        <td className="py-3 px-4">{r.table_no ? `Table ${r.table_no}` : 'Counter'}</td>
                                        <td className="py-3 px-4 text-slate-600">{r.customer_name || 'Guest'}</td>
                                        <td className="py-3 px-4">{r.items.length} dishes</td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                                            Ksh {r.total_amount?.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                r.status === 'Completed' || r.status === 'Paid'
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : r.status === 'Merged'
                                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                    : r.status === 'Split'
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                            }`}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                                            {r.notes || '—'}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {r.status !== 'Merged' && (
                                                <button
                                                    onClick={() => {
                                                        setSplitReceipt(r);
                                                        setActiveTab('split');
                                                    }}
                                                    className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-[11px]"
                                                >
                                                    ✂️ Split
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 1: NEW MERGED RECEIPT CUSTOMER BILL & SETTLEMENT */}
            {/* ========================================================================= */}
            {showMergedBillModal && newMergedReceipt && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <span>🧾</span>
                                    <span>New Consolidated Master Check</span>
                                </h2>
                                <p className="text-xs text-slate-500 font-mono">
                                    Receipt Number: <span className="font-bold text-indigo-700">#{newMergedReceipt.receiptNo}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMergedBillModal(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        {/* Accounting Audit Banner */}
                        <div className="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900">
                            <span className="font-bold">🏛️ Accounting Audit Trail:</span>
                            <p className="mt-0.5">
                                Original receipts <span className="font-mono font-bold">#{newMergedReceipt.sourceReceipts.join(', #')}</span> have been flagged as <b>"Merged into #{newMergedReceipt.receiptNo}"</b> in the database to prevent duplicate billing.
                            </p>
                        </div>

                        {/* Merged Items Table */}
                        <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-3">
                            <div className="flex justify-between text-xs font-semibold text-slate-600 pb-2 border-b border-slate-200">
                                <span>Item &amp; Source</span>
                                <span>Subtotal</span>
                            </div>

                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                                {newMergedReceipt.items.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-100">
                                        <div>
                                            <span className="font-bold text-slate-800">{it.product_name}</span>
                                            <span className="text-slate-500 text-[11px] ml-1">x{it.quantity}</span>
                                            {it.source_receipt_no && (
                                                <span className="text-[10px] text-indigo-600 block">
                                                    (from check #{it.source_receipt_no})
                                                </span>
                                            )}
                                        </div>
                                        <span className="font-mono font-bold text-slate-800">
                                            Ksh {(it.unit_price * it.quantity).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                                <div className="flex justify-between text-slate-600">
                                    <span>Subtotal:</span>
                                    <span className="font-mono">Ksh {newMergedReceipt.subtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>VAT 16% (Included):</span>
                                    <span className="font-mono">Ksh {newMergedReceipt.tax.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                                    <span>Grand Total:</span>
                                    <span className="font-mono text-emerald-700">
                                        Ksh {newMergedReceipt.total.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Customer Bill Actions */}
                        <div className="space-y-2 mt-5">
                            <button
                                onClick={async () => {
                                    const rData = createReceiptData(
                                        newMergedReceipt.receiptNo,
                                        newMergedReceipt.items.map(i => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
                                        'Pending',
                                        newMergedReceipt.total,
                                        'Cashier',
                                        {
                                            customerName: newMergedReceipt.customerName,
                                            tableNo: newMergedReceipt.tableNo,
                                            orderNotes: `CONSOLIDATED BILL — Merged from #${newMergedReceipt.sourceReceipts.join(', #')}`,
                                            isPaid: false
                                        }
                                    );
                                    const html = await generateCustomerBillHTML(rData, companyInfo, false);
                                    setThermalModalData({
                                        title: `Merged Customer Bill — #${newMergedReceipt.receiptNo}`,
                                        receiptNo: newMergedReceipt.receiptNo,
                                        html,
                                        isPaid: false,
                                        total: newMergedReceipt.total
                                    });
                                    await executeDirectPrint(html, { printerRole: 'customer' });
                                }}
                                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"
                            >
                                <span>🖨️</span>
                                <span>Print Merged Customer Bill (Thermal)</span>
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => handleSettleMergedReceipt('Cash')}
                                    className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1"
                                >
                                    <span>💵</span>
                                    <span>Settle Cash</span>
                                </button>
                                <button
                                    onClick={() => handleSettleMergedReceipt('M-Pesa')}
                                    className="py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1"
                                >
                                    <span>📱</span>
                                    <span>Settle M-Pesa</span>
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowMergedBillModal(false)}
                            className="w-full mt-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                            Close Window
                        </button>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: INTERACTIVE THERMAL BILL VIEWER (58mm / 80mm ESC/POS) */}
            {/* ========================================================================= */}
            {thermalModalData && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 flex flex-col max-h-[92vh]">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    {thermalModalData.title}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-mono">Thermal 80mm ESC/POS Output</p>
                            </div>
                            <button
                                onClick={() => setThermalModalData(null)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        {/* Thermal Preview Canvas Frame */}
                        <div className="my-4 flex-1 overflow-y-auto bg-slate-50 rounded-2xl p-2 border border-slate-200">
                            <iframe
                                srcDoc={thermalModalData.html}
                                title="Thermal Bill Preview"
                                className="w-full h-80 rounded-xl bg-white border border-slate-200 shadow-inner"
                            />
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setThermalModalData(null)}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50"
                            >
                                Close
                            </button>
                            <button
                                onClick={async () => {
                                    await executeDirectPrint(thermalModalData.html, { printerRole: 'customer' });
                                    toast.success('Sent to thermal printer! 🖨️');
                                }}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-1.5"
                            >
                                <span>🖨️</span>
                                <span>Print Receipt</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
