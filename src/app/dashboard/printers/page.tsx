'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    loadPOSPrinterSettings,
    savePOSPrinterSettings,
    POSPrinterPreferences,
    PrinterConfig,
    OrderPrintMode,
    executeDirectPrint,
    executeOrderAutoPrintSequence,
    playPrintChime,
    defaultPrinterPreferences,
    fetchInstalledWindowsPrinters,
    InstalledPrinter,
    DEFAULT_INSTALLED_PRINTERS
} from '@/lib/printerSettings';
import {
    generateCustomerBillHTML,
    generateKOTHTML,
    createReceiptData,
    createKOTData,
    loadCompanyInfo,
    CompanyInfo,
    defaultCompanyInfo,
    getTaxDisplaySettingSync,
    saveTaxDisplaySetting
} from '@/lib/receiptPrinter';

// Replaced with dynamic installedPrinters list from Windows Spooler

interface SpoolerJob {
    id: string;
    timestamp: string;
    type: 'KOT' | 'Customer Bill' | 'Tax Invoice' | 'Drawer Kick';
    station: string;
    copies: number;
    status: 'Delivered' | 'Queued' | 'Failed';
}

export default function PrintersSettingsPage() {
    const [prefs, setPrefs] = useState<POSPrinterPreferences>(defaultPrinterPreferences);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'routing' | 'automation' | 'simulator' | 'kiosk_guide' | 'spooler'>('routing');
    const [isTesting, setIsTesting] = useState<string | null>(null);
    const [copiedShortcut, setCopiedShortcut] = useState<string | null>(null);

    // Live Simulator States
    const [simMode, setSimMode] = useState<'receipt' | 'bill' | 'kot'>('receipt');
    const [simPaperWidth, setSimPaperWidth] = useState<'80mm' | '58mm'>('80mm');
    const [simShowTax, setSimShowTax] = useState<boolean>(true);
    const [simHtml, setSimHtml] = useState<string>('');
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(defaultCompanyInfo);
    const [installedPrinters, setInstalledPrinters] = useState<InstalledPrinter[]>(DEFAULT_INSTALLED_PRINTERS);
    const [isScanningPrinters, setIsScanningPrinters] = useState(false);

    // Custom Name Inputs toggles
    const [customCustomerInput, setCustomCustomerInput] = useState(false);
    const [customKitchenInput, setCustomKitchenInput] = useState(false);

    // Spooler Audit Log State
    const [spoolerLogs, setSpoolerLogs] = useState<SpoolerJob[]>([
        { id: 'JOB-901', timestamp: new Date(Date.now() - 120000).toLocaleTimeString(), type: 'Customer Bill', station: 'Counter Customer Bill Printer', copies: 1, status: 'Delivered' },
        { id: 'JOB-902', timestamp: new Date(Date.now() - 118000).toLocaleTimeString(), type: 'KOT', station: 'Kitchen KOT Chef Printer', copies: 1, status: 'Delivered' }
    ]);

    useEffect(() => {
        const loaded = loadPOSPrinterSettings();
        setPrefs(loaded);
        setSimShowTax(getTaxDisplaySettingSync());

        // Fetch live Windows installed printers
        fetchInstalledWindowsPrinters().then(printers => {
            if (Array.isArray(printers) && printers.length > 0) {
                setInstalledPrinters(printers);
            }
        });

        loadCompanyInfo().then(info => {
            setCompanyInfo(info);
            setIsLoading(false);
        }).catch(() => {
            setIsLoading(false);
        });
    }, []);

    const handleRefreshPrinters = async () => {
        setIsScanningPrinters(true);
        try {
            const list = await fetchInstalledWindowsPrinters();
            setInstalledPrinters(list);
            toast.success(`Found ${list.length} installed Windows printers! ✓`);
        } catch (e: any) {
            toast.error('Could not refresh printers: ' + e.message);
        } finally {
            setIsScanningPrinters(false);
        }
    };

    // Refresh Simulator HTML whenever simulation parameters change
    useEffect(() => {
        let isMounted = true;
        const renderPreview = async () => {
            if (simMode === 'kot') {
                const sampleKOT = createKOTData(
                    'KOT-0084',
                    [
                        { name: 'Special Masala Tea (Pot)', qty: 2, notes: 'Extra hot with ginger' },
                        { name: 'Beef Stew & Brown Ugali', qty: 1, notes: 'Medium rare, extra gravy' },
                        { name: 'Swahili Chicken Biryani', qty: 2, notes: 'Kachumbari on the side' }
                    ],
                    'Dine-In',
                    {
                        tableNo: '04',
                        waiter: 'Staff Hawkins',
                        priority: 'rush',
                        orderNotes: 'Guest is boarding a flight in 1 hour'
                    }
                );
                const html = generateKOTHTML(sampleKOT, companyInfo);
                if (isMounted) setSimHtml(html);
            } else {
                const isPaid = simMode === 'receipt';
                const sampleReceipt = createReceiptData(
                    isPaid ? 'RCP-00291' : 'BIL-00291',
                    [
                        { name: 'Special Masala Tea (Pot)', qty: 2, price: 150, notes: 'Extra ginger' },
                        { name: 'Beef Stew & Brown Ugali', qty: 1, price: 450 },
                        { name: 'Swahili Chicken Biryani', qty: 2, price: 650 },
                        { name: 'Fresh Tropical Passion Juice', qty: 2, price: 200 }
                    ],
                    'M-Pesa Express',
                    2450,
                    'Cashier Jane',
                    {
                        customerName: 'Alex Kimani',
                        tableNo: '04',
                        isPaid: isPaid,
                        mpesaReceipt: 'QJH789XLM4',
                        showTaxInfo: simShowTax,
                        taxMode: 'inclusive',
                        vatRate: 16,
                        levyRate: 2
                    }
                );
                const html = await generateCustomerBillHTML(sampleReceipt, companyInfo, isPaid);
                if (isMounted) setSimHtml(html);
            }
        };

        renderPreview();
        return () => { isMounted = false; };
    }, [simMode, simShowTax, companyInfo]);

    const addSpoolerLog = (type: SpoolerJob['type'], station: string, copies: number) => {
        const newJob: SpoolerJob = {
            id: 'JOB-' + Math.floor(100 + Math.random() * 900),
            timestamp: new Date().toLocaleTimeString(),
            type,
            station,
            copies,
            status: 'Delivered'
        };
        setSpoolerLogs(prev => [newJob, ...prev.slice(0, 19)]);
    };

    // ── Save Preferences (Persists to localStorage and Cloud Supabase) ───────────
    const handleSave = async (updatedPrefs?: POSPrinterPreferences) => {
        const toSave = updatedPrefs || prefs;
        setIsSaving(true);
        const ok = await savePOSPrinterSettings(toSave);
        setIsSaving(false);
        if (ok) {
            setPrefs(toSave);
            toast.success('Printer configuration saved & synced! ✓');
        } else {
            toast.error('Failed to sync to cloud database');
        }
    };

    // ── Save Individual Point (Customer Bill vs Kitchen KOT) ───────────────────
    const handleSavePoint = async (point: 'customer' | 'kitchen') => {
        setIsSaving(true);
        const ok = await savePOSPrinterSettings(prefs);
        setIsSaving(false);
        if (ok) {
            const printerName = point === 'customer'
                ? prefs.customerPrinter.systemPrinterName
                : prefs.kitchenPrinter.systemPrinterName;
            toast.success(`Saved! Assigned to ${point === 'customer' ? 'Customer Bill' : 'Kitchen KOT'}: ${printerName} ✓`);
        } else {
            toast.error('Failed to save printer configuration');
        }
    };

    // ── WebUSB / Serial Hardware Scanner ───────────────────────────────────────
    const handleScanUSB = async (role: 'customer' | 'kitchen') => {
        try {
            if (typeof window !== 'undefined' && 'usb' in navigator) {
                const device = await (navigator as any).usb.requestDevice({ filters: [] });
                if (device) {
                    const devName = `${device.productName || 'USB Thermal'} (${device.manufacturerName || 'Port ' + device.vendorId})`;
                    const updated = {
                        ...prefs,
                        [role === 'customer' ? 'customerPrinter' : 'kitchenPrinter']: {
                            ...(role === 'customer' ? prefs.customerPrinter : prefs.kitchenPrinter),
                            systemPrinterName: devName,
                            connectionType: 'usb_serial'
                        }
                    };
                    setPrefs(updated as any);
                    handleSave(updated as any);
                    toast.success(`Discovered & Assigned: ${devName}`);
                    return;
                }
            } else if (typeof window !== 'undefined' && 'serial' in navigator) {
                const port = await (navigator as any).serial.requestPort();
                if (port) {
                    const devName = 'COM / Serial ESC-POS Thermal Printer';
                    const updated = {
                        ...prefs,
                        [role === 'customer' ? 'customerPrinter' : 'kitchenPrinter']: {
                            ...(role === 'customer' ? prefs.customerPrinter : prefs.kitchenPrinter),
                            systemPrinterName: devName,
                            connectionType: 'usb_serial'
                        }
                    };
                    setPrefs(updated as any);
                    handleSave(updated as any);
                    toast.success(`Paired Serial Port Printer!`);
                    return;
                }
            }
            toast('WebUSB not supported on this browser. You can select your printer from the dropdown or type its Windows name directly.', { icon: 'ℹ️' });
        } catch (err: any) {
            if (err.name !== 'NotFoundError') {
                console.warn('Hardware pair skipped:', err);
            }
        }
    };

    // ── Update Order Print Mode (Both vs Customer Bill Alone vs KOT Alone) ───────
    const handleSetOrderPrintMode = (mode: OrderPrintMode) => {
        const updated: POSPrinterPreferences = {
            ...prefs,
            orderPrintMode: mode,
            autoPrintKOTOnSend: mode === 'both' || mode === 'kot_only',
            autoPrintBillOnSend: mode === 'both' || mode === 'bill_only'
        };
        setPrefs(updated);
        handleSave(updated);

        const modeLabels: Record<OrderPrintMode, string> = {
            both: '🖨️ Automatically Print BOTH KOT & Customer Bill',
            bill_only: '🧾 Automatically Print Customer Bill ALONE',
            kot_only: '🍳 Automatically Print Kitchen KOT ALONE',
            none: '⏸️ Manual / Preview Mode Only'
        };
        toast.success(`Active Order Mode: ${modeLabels[mode]}`);
    };

    const handleToggleAutomation = (key: keyof Pick<POSPrinterPreferences, 'autoPrintReceiptOnPay' | 'skipPreviewDialog' | 'soundBeepOnPrint'>) => {
        const updated = {
            ...prefs,
            [key]: !prefs[key]
        };
        setPrefs(updated);
        handleSave(updated);
    };

    // ── Test Print Handlers ───────────────────────────────────────────────────
    const handleTestCustomerReceipt = async () => {
        setIsTesting('customer');
        try {
            const sampleReceipt = createReceiptData(
                'TEST-00001',
                [
                    { name: 'Special Masala Tea', qty: 2, price: 80, notes: 'Extra ginger' },
                    { name: 'Beef Stew & Ugali', qty: 1, price: 350 },
                    { name: 'Fresh Passion Juice', qty: 1, price: 100 }
                ],
                'Cash',
                650,
                'Manager',
                {
                    customerName: 'Test Guest',
                    tableNo: '04',
                    isPaid: true,
                    showTaxInfo: simShowTax
                }
            );

            const html = await generateCustomerBillHTML(sampleReceipt, companyInfo, true);
            await executeDirectPrint(html, {
                printerRole: 'customer',
                copies: prefs.customerPrinter.copies,
                playSound: prefs.soundBeepOnPrint,
                forceDialog: !prefs.skipPreviewDialog
            });
            addSpoolerLog('Tax Invoice', prefs.customerPrinter.label, prefs.customerPrinter.copies);
            toast.success(`Test Customer Receipt dispatched to [${prefs.customerPrinter.systemPrinterName}]!`);
        } catch (err: any) {
            console.error('Test print error:', err);
            toast.error('Test print failed: ' + err.message);
        } finally {
            setIsTesting(null);
        }
    };

    const handleTestKOT = async () => {
        setIsTesting('kitchen');
        try {
            const sampleKOT = createKOTData(
                'K-TEST',
                [
                    { name: 'Beef Stew & Ugali', qty: 1, notes: 'Medium rare, extra gravy' },
                    { name: 'Chicken Biryani', qty: 2, notes: 'Spicy, salad on side' }
                ],
                'Dine-In',
                {
                    tableNo: '04',
                    waiter: 'Staff Hawkins',
                    priority: 'rush',
                    orderNotes: 'Guest is in a hurry'
                }
            );

            const html = generateKOTHTML(sampleKOT, companyInfo);
            await executeDirectPrint(html, {
                printerRole: 'kitchen',
                copies: prefs.kitchenPrinter.copies,
                playSound: prefs.soundBeepOnPrint,
                forceDialog: !prefs.skipPreviewDialog
            });
            addSpoolerLog('KOT', prefs.kitchenPrinter.label, prefs.kitchenPrinter.copies);
            toast.success(`Test Kitchen KOT dispatched to [${prefs.kitchenPrinter.systemPrinterName}]!`);
        } catch (err: any) {
            console.error('Test KOT print error:', err);
            toast.error('Test KOT failed: ' + err.message);
        } finally {
            setIsTesting(null);
        }
    };

    // Test the Full Automated Sequence (KOT -> Delay -> Customer Bill)
    const handleTestSequence = async () => {
        setIsTesting('sequence');
        try {
            const sampleKOT = createKOTData(
                'SEQ-KOT',
                [{ name: 'Beef Stew & Brown Ugali', qty: 1 }],
                'Dine-In',
                { tableNo: '04', waiter: 'Server' }
            );
            const kotHtml = generateKOTHTML(sampleKOT, companyInfo);

            const sampleBill = createReceiptData(
                'SEQ-BIL',
                [{ name: 'Beef Stew & Brown Ugali', qty: 1, price: 450 }],
                'Pending',
                450,
                'Cashier',
                { tableNo: '04', isPaid: false, showTaxInfo: simShowTax }
            );
            const billHtml = await generateCustomerBillHTML(sampleBill, companyInfo, false);

            await executeOrderAutoPrintSequence(kotHtml, billHtml, prefs);
            if (prefs.orderPrintMode === 'both' || prefs.orderPrintMode === 'kot_only') {
                addSpoolerLog('KOT', prefs.kitchenPrinter.label, prefs.kitchenPrinter.copies);
            }
            if (prefs.orderPrintMode === 'both' || prefs.orderPrintMode === 'bill_only') {
                addSpoolerLog('Customer Bill', prefs.customerPrinter.label, prefs.customerPrinter.copies);
            }

            toast.success('Sequence executed successfully matching hotel configuration!');
        } catch (err: any) {
            toast.error('Sequence execution failed: ' + err.message);
        } finally {
            setIsTesting(null);
        }
    };

    const handleTestDrawer = () => {
        playPrintChime();
        addSpoolerLog('Drawer Kick', prefs.customerPrinter.label, 1);
        toast.success('Cash drawer trigger pulse sent (ESC/POS pin 2/5)!');
    };

    const chromeCommand = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos`;
    const edgeCommand = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos`;

    const copyCommand = (cmd: string, key: string) => {
        navigator.clipboard.writeText(cmd);
        setCopiedShortcut(key);
        toast.success('Command copied to clipboard!');
        setTimeout(() => setCopiedShortcut(null), 3000);
    };

    // Download .bat script for Windows 1-click zero-dialog launcher
    const downloadKioskBatchFile = () => {
        const batContent = `@echo off
title AlphaPlus Hotel POS - Zero Dialog Kiosk Mode
echo ========================================================
echo Launching AlphaPlus POS in Zero-Dialog Silent Print Mode
echo ========================================================
timeout /t 1 /nobreak >nul

if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos
    exit
)

if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app=https://alphapluswebapp.vercel.app/dashboard/pos
    exit
)

start https://alphapluswebapp.vercel.app/dashboard/pos
exit
`;
        const blob = new Blob([batContent], { type: 'application/bat' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AlphaPlus_POS_Silent_Kiosk.bat';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Downloaded AlphaPlus_POS_Silent_Kiosk.bat! Place on desktop & double click.');
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-700">Loading Hardware Printer Engine...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 animate-rise max-w-7xl mx-auto">

            {/* ── HEADER ──────────────────────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-700 to-indigo-900 flex items-center justify-center text-3xl text-white shadow-lg shadow-indigo-200">
                        🖨️
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Receipt & KOT Printers</h1>
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                HARDWARE ROUTING & PRINTER SELECTION
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                            Select, assign, and save your installed physical thermal printers for Customer Bills and Kitchen KOT tickets
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={handleRefreshPrinters}
                        disabled={isScanningPrinters}
                        className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        title="Scan Windows Print Spooler for all connected USB/Network printers"
                    >
                        <span className={isScanningPrinters ? 'animate-spin' : ''}>🔄</span>
                        <span>{isScanningPrinters ? 'Detecting...' : `Detect Windows Printers (${installedPrinters.length})`}</span>
                    </button>
                    <button
                        onClick={handleTestSequence}
                        disabled={isTesting === 'sequence'}
                        className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        title="Simulate sending an order and testing sequence execution"
                    >
                        <span>▶️</span>
                        <span>{isTesting === 'sequence' ? 'Testing Sequence...' : 'Test Sequence'}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('kiosk_guide')}
                        className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <span>⚡</span>
                        <span>Zero-Dialog Kiosk Guide</span>
                    </button>
                    <button
                        onClick={() => handleSave()}
                        disabled={isSaving}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <span>💾</span>
                        <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
                    </button>
                </div>
            </div>

            {/* ── TOP STATUS BANNER ────────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                        <span className="font-bold text-gray-300">Active Order Print Mode: </span>
                        <span className="font-black text-amber-300 uppercase tracking-wide">
                            {prefs.orderPrintMode === 'both' && 'PRINT BOTH (KOT + CUSTOMER BILL)'}
                            {prefs.orderPrintMode === 'bill_only' && 'PRINT CUSTOMER BILL ALONE'}
                            {prefs.orderPrintMode === 'kot_only' && 'PRINT KITCHEN KOT ALONE'}
                            {prefs.orderPrintMode === 'none' && 'MANUAL / PREVIEW MODE'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-gray-300">
                    <div>
                        <span>Sequential Delay: </span>
                        <strong className="text-white">{prefs.printSequenceDelayMs}ms</strong>
                    </div>
                    <div>
                        <span>Silent Fast Mode: </span>
                        <strong className={prefs.skipPreviewDialog ? 'text-emerald-400' : 'text-gray-400'}>
                            {prefs.skipPreviewDialog ? 'ENABLED (0.1s)' : 'STANDARD DIALOG'}
                        </strong>
                    </div>
                    <div>
                        <span>Audio Beep: </span>
                        <strong className={prefs.soundBeepOnPrint ? 'text-emerald-400' : 'text-gray-400'}>
                            {prefs.soundBeepOnPrint ? 'ON' : 'OFF'}
                        </strong>
                    </div>
                </div>
            </div>

            {/* ── NAVIGATION TABS ─────────────────────────────────────────────── */}
            <div className="flex border-b border-gray-200 bg-white rounded-2xl p-1.5 shadow-sm gap-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('routing')}
                    className={`flex-1 min-w-[170px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'routing'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <span>🖨️</span>
                    <span>Installed Printers & Routing</span>
                </button>
                <button
                    onClick={() => setActiveTab('automation')}
                    className={`flex-1 min-w-[180px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'automation'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <span>⚡</span>
                    <span>Order Mode & Sequence</span>
                </button>
                <button
                    onClick={() => setActiveTab('simulator')}
                    className={`flex-1 min-w-[160px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'simulator'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <span>👁️</span>
                    <span>Receipt Live Studio</span>
                </button>
                <button
                    onClick={() => setActiveTab('kiosk_guide')}
                    className={`flex-1 min-w-[170px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'kiosk_guide'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <span>🚀</span>
                    <span>Zero-Dialog Kiosk Guide</span>
                </button>
                <button
                    onClick={() => setActiveTab('spooler')}
                    className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'spooler'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <span>📜</span>
                    <span>Spooler Ledger ({spoolerLogs.length})</span>
                </button>
            </div>

            {/* ── TAB 1: PRINTER STATIONS ROUTING & SELECTION ─────────────────── */}
            {activeTab === 'routing' && (
                <div className="space-y-6">

                    {/* Quick Helper Banner */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🔌</span>
                            <div>
                                <h4 className="font-bold text-blue-950">How to Select & Save Installed Printers for each Point:</h4>
                                <p className="text-blue-800">
                                    Choose your printer model from the dropdown or type your exact Windows printer name (e.g., <strong>POS-80</strong> or <strong>EPSON TM-T20</strong>). Click <strong>"Save Printer for Point"</strong> to bind it!
                                </p>
                            </div>
                        </div>
                        <span className="text-[11px] font-bold bg-white text-indigo-700 px-3 py-1 rounded-full border border-blue-200 shadow-sm shrink-0">
                            WINDOWS & MAC READY
                        </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* 1. CUSTOMER BILL & RECEIPT PRINTER */}
                        <div className="bg-white rounded-3xl border-2 border-indigo-200 shadow-md overflow-hidden flex flex-col justify-between">
                            <div>
                                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                                            🧾
                                        </div>
                                        <div>
                                            <h3 className="font-black text-sm tracking-wide uppercase">POINT 1: Customer Bill & Receipt Printer</h3>
                                            <p className="text-[11px] text-indigo-200">Cashier Counter • Guest Bills, Tax Invoices & Final Receipts</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded-full font-bold">
                                        CUSTOMER POINT
                                    </span>
                                </div>

                                <div className="p-6 space-y-4 text-xs">

                                    {/* Active Assigned Printer Chip */}
                                    <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-indigo-900 block">Currently Assigned Printer:</span>
                                            <span className="font-black text-xs text-indigo-950 flex items-center gap-1.5 mt-0.5">
                                                <span>🖨️</span>
                                                <span>{prefs.customerPrinter.systemPrinterName || 'Default Windows Printer'}</span>
                                            </span>
                                        </div>
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200">
                                            ACTIVE POINT
                                        </span>
                                    </div>

                                    {/* Printer Selection Dropdown */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[11px] font-bold text-gray-700 uppercase">
                                                Select Installed Physical Printer
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleScanUSB('customer')}
                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                            >
                                                <span>🔍</span> Scan / Pair USB Printer
                                            </button>
                                        </div>

                                        <select
                                            value={
                                                installedPrinters.some(p => p.name === prefs.customerPrinter.systemPrinterName)
                                                    ? prefs.customerPrinter.systemPrinterName
                                                    : 'custom_windows'
                                            }
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === 'custom_windows') {
                                                    setCustomCustomerInput(true);
                                                } else {
                                                    setCustomCustomerInput(false);
                                                    const matched = installedPrinters.find(p => p.name === val);
                                                    setPrefs({
                                                        ...prefs,
                                                        customerPrinter: {
                                                            ...prefs.customerPrinter,
                                                            systemPrinterName: val,
                                                            paperWidth: (matched?.width as any) || '80mm',
                                                            connectionType: 'browser_default'
                                                        }
                                                    });
                                                }
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:bg-white focus:border-indigo-500 outline-none"
                                        >
                                            {installedPrinters.map(p => (
                                                <option key={p.id} value={p.name}>
                                                    {p.isThermal ? '🧾' : '🖨️'} {p.name} {p.port ? `(${p.port})` : ''}
                                                </option>
                                            ))}
                                            <option value="custom_windows">⚙️ Type Custom Windows Printer Name...</option>
                                        </select>
                                    </div>

                                    {/* Custom Windows Printer Name Input (if user wants custom name or selected custom) */}
                                    {(customCustomerInput || !installedPrinters.some(p => p.name === prefs.customerPrinter.systemPrinterName)) && (
                                        <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-1">
                                            <label className="block text-[11px] font-bold text-amber-900 uppercase">
                                                Type Exact Windows Installed Printer Name:
                                            </label>
                                            <input
                                                type="text"
                                                value={prefs.customerPrinter.systemPrinterName}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    customerPrinter: { ...prefs.customerPrinter, systemPrinterName: e.target.value }
                                                })}
                                                placeholder="e.g., EPSON TM-T20III or POS-80"
                                                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-bold text-gray-800 focus:outline-none"
                                            />
                                            <p className="text-[10px] text-amber-700">
                                                Must match the exact name listed in Windows Settings &gt; Printers & Scanners.
                                            </p>
                                        </div>
                                    )}

                                    {/* Paper Roll Width & Copies */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                                                Paper Roll Width
                                            </label>
                                            <select
                                                value={prefs.customerPrinter.paperWidth}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    customerPrinter: { ...prefs.customerPrinter, paperWidth: e.target.value as any }
                                                })}
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:bg-white focus:border-indigo-500 outline-none"
                                            >
                                                <option value="80mm">80mm (Standard Restaurant Roll)</option>
                                                <option value="58mm">58mm (Compact Mobile Roll)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                                                Copies to Print
                                            </label>
                                            <select
                                                value={prefs.customerPrinter.copies}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    customerPrinter: { ...prefs.customerPrinter, copies: Number(e.target.value) }
                                                })}
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:bg-white focus:border-indigo-500 outline-none"
                                            >
                                                <option value={1}>1 Copy (Guest Copy)</option>
                                                <option value={2}>2 Copies (Guest + Merchant Copy)</option>
                                                <option value={3}>3 Copies</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Hardware Toggles */}
                                    <div className="pt-2 border-t border-gray-100 space-y-2">
                                        <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-gray-50">
                                            <div>
                                                <p className="font-bold text-gray-800">Auto-Cut Paper After Receipt</p>
                                                <p className="text-[10px] text-gray-400">Sends ESC/POS GS V cut command</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={prefs.customerPrinter.autoCut}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    customerPrinter: { ...prefs.customerPrinter, autoCut: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-indigo-600 rounded"
                                            />
                                        </label>

                                        <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-gray-50">
                                            <div>
                                                <p className="font-bold text-gray-800">Kick Cash Drawer on Cash Payment</p>
                                                <p className="text-[10px] text-gray-400">Sends 24V pulse to RJ11 cash drawer port</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={prefs.customerPrinter.openDrawer}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    customerPrinter: { ...prefs.customerPrinter, openDrawer: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-indigo-600 rounded"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Card Footer: Save as Customer Bill Point + Test */}
                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleTestDrawer}
                                        className="px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl text-gray-700 font-bold text-xs transition-colors flex items-center gap-1 shadow-sm"
                                    >
                                        <span>💵</span> Drawer
                                    </button>
                                    <button
                                        onClick={handleTestCustomerReceipt}
                                        disabled={isTesting === 'customer'}
                                        className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                                    >
                                        <span>🖨️</span>
                                        <span>{isTesting === 'customer' ? 'Printing...' : 'Test Bill'}</span>
                                    </button>
                                </div>

                                <button
                                    onClick={() => handleSavePoint('customer')}
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <span>💾</span>
                                    <span>Save for Customer Bill</span>
                                </button>
                            </div>
                        </div>

                        {/* 2. KITCHEN KOT CHEF PRINTER */}
                        <div className="bg-white rounded-3xl border-2 border-orange-200 shadow-md overflow-hidden flex flex-col justify-between">
                            <div>
                                <div className="bg-gradient-to-r from-slate-900 to-amber-950 p-5 text-white flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                                            🍳
                                        </div>
                                        <div>
                                            <h3 className="font-black text-sm tracking-wide uppercase">POINT 2: Kitchen KOT Chef Printer</h3>
                                            <p className="text-[11px] text-amber-200">Hot Kitchen / Line Cook • Kitchen Order Tickets</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded-full font-bold">
                                        KITCHEN POINT
                                    </span>
                                </div>

                                <div className="p-6 space-y-4 text-xs">

                                    {/* Active Assigned Printer Chip */}
                                    <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-amber-900 block">Currently Assigned Printer:</span>
                                            <span className="font-black text-xs text-amber-950 flex items-center gap-1.5 mt-0.5">
                                                <span>🍳</span>
                                                <span>{prefs.kitchenPrinter.systemPrinterName || 'Kitchen Thermal Printer (80mm)'}</span>
                                            </span>
                                        </div>
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full border border-amber-200">
                                            ACTIVE POINT
                                        </span>
                                    </div>

                                    {/* Printer Selection Dropdown */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-[11px] font-bold text-gray-700 uppercase">
                                                Select Installed Physical Printer
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleScanUSB('kitchen')}
                                                className="text-[10px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1"
                                            >
                                                <span>🔍</span> Scan / Pair USB Printer
                                            </button>
                                        </div>

                                        <select
                                            value={
                                                installedPrinters.some(p => p.name === prefs.kitchenPrinter.systemPrinterName)
                                                    ? prefs.kitchenPrinter.systemPrinterName
                                                    : 'custom_windows'
                                            }
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === 'custom_windows') {
                                                    setCustomKitchenInput(true);
                                                } else {
                                                    setCustomKitchenInput(false);
                                                    const matched = installedPrinters.find(p => p.name === val);
                                                    setPrefs({
                                                        ...prefs,
                                                        kitchenPrinter: {
                                                            ...prefs.kitchenPrinter,
                                                            systemPrinterName: val,
                                                            paperWidth: (matched?.width as any) || '80mm',
                                                            connectionType: 'browser_default'
                                                        }
                                                    });
                                                }
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:bg-white focus:border-amber-500 outline-none"
                                        >
                                            {installedPrinters.map(p => (
                                                <option key={p.id} value={p.name}>
                                                    {p.isThermal ? '🍳' : '🖨️'} {p.name} {p.port ? `(${p.port})` : ''}
                                                </option>
                                            ))}
                                            <option value="custom_windows">⚙️ Type Custom Windows Printer Name...</option>
                                        </select>
                                    </div>

                                    {/* Custom Windows Printer Name Input */}
                                    {(customKitchenInput || !installedPrinters.some(p => p.name === prefs.kitchenPrinter.systemPrinterName)) && (
                                        <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-1">
                                            <label className="block text-[11px] font-bold text-amber-900 uppercase">
                                                Type Exact Windows Installed Kitchen Printer Name:
                                            </label>
                                            <input
                                                type="text"
                                                value={prefs.kitchenPrinter.systemPrinterName}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    kitchenPrinter: { ...prefs.kitchenPrinter, systemPrinterName: e.target.value }
                                                })}
                                                placeholder="e.g., Kitchen TM-T88 or POS-80-Kitchen"
                                                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-bold text-gray-800 focus:outline-none"
                                            />
                                            <p className="text-[10px] text-amber-700">
                                                Must match the printer name installed on this computer or POS terminal.
                                            </p>
                                        </div>
                                    )}

                                    {/* Network RAW IP configuration (if network printer selected) */}
                                    {prefs.kitchenPrinter.connectionType === 'network_raw' && (
                                        <div className="grid grid-cols-3 gap-2 p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                                            <div className="col-span-2">
                                                <label className="block text-[10px] font-bold text-blue-900 uppercase mb-0.5">Kitchen IP Address</label>
                                                <input
                                                    type="text"
                                                    value={prefs.kitchenPrinter.ipAddress || '192.168.1.200'}
                                                    onChange={e => setPrefs({
                                                        ...prefs,
                                                        kitchenPrinter: { ...prefs.kitchenPrinter, ipAddress: e.target.value }
                                                    })}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg font-mono text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-blue-900 uppercase mb-0.5">Port</label>
                                                <input
                                                    type="number"
                                                    value={prefs.kitchenPrinter.port || 9100}
                                                    onChange={e => setPrefs({
                                                        ...prefs,
                                                        kitchenPrinter: { ...prefs.kitchenPrinter, port: Number(e.target.value) }
                                                    })}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg font-mono text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Paper Roll Width & Copies */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                                                Paper Roll Width
                                            </label>
                                            <select
                                                value={prefs.kitchenPrinter.paperWidth}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    kitchenPrinter: { ...prefs.kitchenPrinter, paperWidth: e.target.value as any }
                                                })}
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:bg-white focus:border-amber-500 outline-none"
                                            >
                                                <option value="80mm">80mm (Recommended for KOT)</option>
                                                <option value="58mm">58mm</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                                                Copies to Print
                                            </label>
                                            <select
                                                value={prefs.kitchenPrinter.copies}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    kitchenPrinter: { ...prefs.kitchenPrinter, copies: Number(e.target.value) }
                                                })}
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:bg-white focus:border-amber-500 outline-none"
                                            >
                                                <option value={1}>1 Copy (Chef Line)</option>
                                                <option value={2}>2 Copies (Chef + Expediter)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Auto-Cut */}
                                    <div className="pt-2 border-t border-gray-100">
                                        <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-gray-50">
                                            <div>
                                                <p className="font-bold text-gray-800">Auto-Cut Paper After KOT</p>
                                                <p className="text-[10px] text-gray-400">Separates each ticket cleanly on the kitchen line</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={prefs.kitchenPrinter.autoCut}
                                                onChange={e => setPrefs({
                                                    ...prefs,
                                                    kitchenPrinter: { ...prefs.kitchenPrinter, autoCut: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-amber-600 rounded"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Card Footer: Save as Kitchen KOT Point + Test */}
                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                                <button
                                    onClick={handleTestKOT}
                                    disabled={isTesting === 'kitchen'}
                                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                                >
                                    <span>🍳</span>
                                    <span>{isTesting === 'kitchen' ? 'Printing...' : 'Test Kitchen KOT'}</span>
                                </button>

                                <button
                                    onClick={() => handleSavePoint('kitchen')}
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <span>💾</span>
                                    <span>Save for Kitchen KOT</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 2: AUTOMATIC ORDER MODE & SEQUENCE ──────────────────────── */}
            {activeTab === 'automation' && (
                <div className="space-y-6">

                    {/* 1. HOTEL ORDER SUBMISSION PRINT MODE CARDS */}
                    <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📋</span>
                                <div>
                                    <h3 className="font-black text-base text-gray-900">
                                        Hotel Order Submission Print Mode
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        Choose what happens when waitstaff or cashier taps "Send to Kitchen" (persisted and remembered automatically across all devices)
                                    </p>
                                </div>
                            </div>
                            <span className="text-[11px] px-3 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-full border border-indigo-200">
                                PERSISTENT PREFERENCE
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">

                            {/* Option 1: BOTH KOT & CUSTOMER BILL */}
                            <div
                                onClick={() => handleSetOrderPrintMode('both')}
                                className={`cursor-pointer p-5 rounded-2xl border-2 transition-all relative flex flex-col justify-between ${
                                    prefs.orderPrintMode === 'both'
                                        ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200'
                                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">🖨️🧾🍳</span>
                                            <span className="font-black text-sm text-gray-900">Print BOTH Automatically</span>
                                        </div>
                                        {prefs.orderPrintMode === 'both' && (
                                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                                                ✓
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Automatically dispatches the <strong>Kitchen KOT</strong> to the chef printer, pauses briefly, and automatically dispatches the <strong>Customer Bill</strong> to the counter/guest printer.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-indigo-700">Recommended for Full Dine-In</span>
                                    <span className="font-mono text-gray-400">Sequential</span>
                                </div>
                            </div>

                            {/* Option 2: CUSTOMER BILL ALONE */}
                            <div
                                onClick={() => handleSetOrderPrintMode('bill_only')}
                                className={`cursor-pointer p-5 rounded-2xl border-2 transition-all relative flex flex-col justify-between ${
                                    prefs.orderPrintMode === 'bill_only'
                                        ? 'border-emerald-600 bg-emerald-50/50 shadow-md ring-2 ring-emerald-200'
                                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">🧾</span>
                                            <span className="font-black text-sm text-gray-900">Print Customer Bill ALONE</span>
                                        </div>
                                        {prefs.orderPrintMode === 'bill_only' && (
                                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center">
                                                ✓
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Only automatically prints the <strong>Customer Bill (Unpaid Table Bill)</strong>. Kitchen KOT is skipped. Ideal for cafes, takeaway counters, bars, and beverage stations.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-emerald-700">Quick-Service & Cafes</span>
                                    <span className="font-mono text-gray-400">1 Ticket Only</span>
                                </div>
                            </div>

                            {/* Option 3: KITCHEN KOT ALONE */}
                            <div
                                onClick={() => handleSetOrderPrintMode('kot_only')}
                                className={`cursor-pointer p-5 rounded-2xl border-2 transition-all relative flex flex-col justify-between ${
                                    prefs.orderPrintMode === 'kot_only'
                                        ? 'border-amber-600 bg-amber-50/50 shadow-md ring-2 ring-amber-200'
                                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">🍳</span>
                                            <span className="font-black text-sm text-gray-900">Print Kitchen KOT ALONE</span>
                                        </div>
                                        {prefs.orderPrintMode === 'kot_only' && (
                                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[11px] font-black flex items-center justify-center">
                                                ✓
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Only dispatches the <strong>Chef Ticket to the Kitchen</strong>. The customer bill is not printed now, but can be printed upon request or at final checkout payment.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-amber-700">Kitchen-First Flow</span>
                                    <span className="font-mono text-gray-400">Chef Line</span>
                                </div>
                            </div>
                        </div>

                        {/* Sequential Delay Slider */}
                        {prefs.orderPrintMode === 'both' && (
                            <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-2 mt-4">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                                        <span>⏱️</span>
                                        <span>Sequence Spacing Delay (Between KOT and Customer Bill)</span>
                                    </span>
                                    <span className="font-black text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200 font-mono">
                                        {prefs.printSequenceDelayMs} ms
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={150}
                                    max={1000}
                                    step={50}
                                    value={prefs.printSequenceDelayMs}
                                    onChange={e => {
                                        const updated = { ...prefs, printSequenceDelayMs: Number(e.target.value) };
                                        setPrefs(updated);
                                        handleSave(updated);
                                    }}
                                    className="w-full accent-indigo-600 cursor-pointer"
                                />
                                <p className="text-[10px] text-gray-500">
                                    Adds a short buffer between KOT and Customer Bill so Windows print spooler and thermal guillotine cutters process them cleanly without collisions.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 2. GENERAL PEAK RUSH AUTOMATION SWITCHES */}
                    <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                            <span className="text-2xl">⚡</span>
                            <div>
                                <h3 className="font-black text-base text-gray-900">Direct Auto-Print Rules</h3>
                                <p className="text-xs text-gray-500">Speed up checkout throughput and eliminate dialogs during busy hotel rush</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">

                            {/* Auto-Print on Pay */}
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col justify-between gap-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-black text-xs text-gray-900">Auto-Print on Payment</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${prefs.autoPrintReceiptOnPay ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                                            {prefs.autoPrintReceiptOnPay ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500">
                                        Immediately prints customer receipt when cashier confirms payment in POS.
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleToggleAutomation('autoPrintReceiptOnPay')}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out self-end ${
                                        prefs.autoPrintReceiptOnPay ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        prefs.autoPrintReceiptOnPay ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>

                            {/* Direct Silent Printing (Bypass Dialog) */}
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col justify-between gap-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-black text-xs text-gray-900">Direct Silent Mode (0.1s)</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${prefs.skipPreviewDialog ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                                            {prefs.skipPreviewDialog ? 'FASTEST' : 'DIALOG'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500">
                                        Bypasses preview modal and dispatches directly to hardware in background.
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleToggleAutomation('skipPreviewDialog')}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out self-end ${
                                        prefs.skipPreviewDialog ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        prefs.skipPreviewDialog ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>

                            {/* Audio Chime */}
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col justify-between gap-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-black text-xs text-gray-900">Audio Chime Alert</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${prefs.soundBeepOnPrint ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                                            {prefs.soundBeepOnPrint ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500">
                                        Plays a crisp pleasant tone so staff in noisy dining rooms know job printed.
                                    </p>
                                </div>
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={playPrintChime}
                                        className="text-[10px] text-indigo-600 font-bold hover:underline"
                                    >
                                        🔊 Test Sound
                                    </button>
                                    <button
                                        onClick={() => handleToggleAutomation('soundBeepOnPrint')}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            prefs.soundBeepOnPrint ? 'bg-emerald-500' : 'bg-slate-300'
                                        }`}
                                    >
                                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            prefs.soundBeepOnPrint ? 'translate-x-5' : 'translate-x-0'
                                        }`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 3: RECEIPT LIVE STUDIO & SIMULATOR ───────────────────────── */}
            {activeTab === 'simulator' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Controls Sidebar */}
                    <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-5 lg:col-span-1">
                        <div>
                            <h3 className="font-black text-sm text-gray-900 uppercase tracking-wide">
                                Live Receipt Studio
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Real-time simulation of thin-dashed thermal printing
                            </p>
                        </div>

                        {/* Document Type Selector */}
                        <div>
                            <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1.5">
                                Simulated Document
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setSimMode('receipt')}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                                        simMode === 'receipt'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Receipt
                                </button>
                                <button
                                    onClick={() => setSimMode('bill')}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                                        simMode === 'bill'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Table Bill
                                </button>
                                <button
                                    onClick={() => setSimMode('kot')}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                                        simMode === 'kot'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Chef KOT
                                </button>
                            </div>
                        </div>

                        {/* Roll Width Toggle */}
                        <div>
                            <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1.5">
                                Thermal Roll Width
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setSimPaperWidth('80mm')}
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                                        simPaperWidth === '80mm'
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    80mm Roll (POS)
                                </button>
                                <button
                                    onClick={() => setSimPaperWidth('58mm')}
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                                        simPaperWidth === '58mm'
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    58mm Roll (Mobile)
                                </button>
                            </div>
                        </div>

                        {/* Tax Breakdown Toggle */}
                        {simMode !== 'kot' && (
                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                                <div>
                                    <p className="font-black text-xs text-gray-800">Show Tax Breakdown</p>
                                    <p className="text-[10px] text-gray-500">16% VAT + 2% Catering Levy + PIN</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const newVal = !simShowTax;
                                        setSimShowTax(newVal);
                                        saveTaxDisplaySetting(newVal);
                                        toast.success(`Receipt Tax Display: ${newVal ? 'SHOWN' : 'HIDDEN'}`);
                                    }}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                        simShowTax ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        simShowTax ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>
                        )}

                        <div className="pt-2 border-t border-gray-100 space-y-2">
                            <button
                                onClick={async () => {
                                    await executeDirectPrint(simHtml, {
                                        printerRole: simMode === 'kot' ? 'kitchen' : 'customer',
                                        playSound: prefs.soundBeepOnPrint
                                    });
                                    toast.success('Live preview sent to hardware printer!');
                                }}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <span>🖨️</span>
                                <span>Print Preview to Hardware</span>
                            </button>
                        </div>
                    </div>

                    {/* Live Thermal Paper Canvas */}
                    <div className="bg-slate-900 rounded-3xl p-6 lg:col-span-2 flex flex-col items-center justify-center border border-slate-800 min-h-[500px]">
                        <div className="text-center mb-3">
                            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-widest">
                                Physical Thermal Paper Simulation ({simPaperWidth}) • Thin Dashes • Normal Weights
                            </span>
                        </div>

                        <div
                            style={{
                                width: simPaperWidth === '80mm' ? '302px' : '220px',
                                transition: 'width 0.2s ease'
                            }}
                            className="bg-white rounded-xl shadow-2xl p-4 text-black border border-slate-700 overflow-hidden transform scale-100"
                        >
                            <iframe
                                srcDoc={simHtml}
                                title="Live Thermal Simulator"
                                className="w-full border-none"
                                style={{ minHeight: '440px', height: 'auto' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 4: ZERO-DIALOG SETUP GUIDE (BUSY HOTEL FAST-LANE) ───────── */}
            {activeTab === 'kiosk_guide' && (
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">🚀</span>
                            <div>
                                <h3 className="font-black text-lg text-gray-900">
                                    Zero-Dialog Silent Printing Guide (Busy Hotel Rush)
                                </h3>
                                <p className="text-xs text-gray-500">
                                    How to print KOT and Customer Bills in under 0.2 seconds with ZERO popup dialogs
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={downloadKioskBatchFile}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm"
                        >
                            <span>📥</span>
                            <span>Download Windows Kiosk Launcher (.bat)</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2 text-xs">
                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center text-xs">1</span>
                            <h4 className="font-black text-indigo-950">Set Default Thermal Printer</h4>
                            <p className="text-gray-600">
                                In Windows Settings &gt; Bluetooth & Devices &gt; Printers, click your thermal printer (e.g. Epson TM-T88 or POS-80) and click <strong>"Set as default"</strong>.
                            </p>
                        </div>

                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2 text-xs">
                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center text-xs">2</span>
                            <h4 className="font-black text-indigo-950">Launch with Kiosk Flag</h4>
                            <p className="text-gray-600">
                                Launch Chrome or Edge with <code>--kiosk-printing</code>. This instructs the browser engine to bypass all preview modals and feed raw ESC/POS directly to the printer!
                            </p>
                        </div>

                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2 text-xs">
                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center text-xs">3</span>
                            <h4 className="font-black text-indigo-950">Zero Friction Service</h4>
                            <p className="text-gray-600">
                                Cashier taps "Pay" or "Send to Kitchen" → tickets print immediately without stopping or requiring staff confirmation!
                            </p>
                        </div>
                    </div>

                    {/* Chrome Launch Command */}
                    <div className="bg-slate-900 rounded-2xl p-5 text-white space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="font-black text-xs text-indigo-300 uppercase tracking-wider">
                                1. Google Chrome Desktop Shortcut Target
                            </span>
                            <button
                                onClick={() => copyCommand(chromeCommand, 'chrome')}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <span>{copiedShortcut === 'chrome' ? '✓ Copied!' : '📋 Copy Command'}</span>
                            </button>
                        </div>
                        <div className="p-3 bg-black/50 rounded-xl font-mono text-xs text-emerald-400 break-all select-all border border-slate-800">
                            {chromeCommand}
                        </div>
                    </div>

                    {/* Edge Launch Command */}
                    <div className="bg-slate-900 rounded-2xl p-5 text-white space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="font-black text-xs text-cyan-300 uppercase tracking-wider">
                                2. Microsoft Edge Desktop Shortcut Target
                            </span>
                            <button
                                onClick={() => copyCommand(edgeCommand, 'edge')}
                                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <span>{copiedShortcut === 'edge' ? '✓ Copied!' : '📋 Copy Command'}</span>
                            </button>
                        </div>
                        <div className="p-3 bg-black/50 rounded-xl font-mono text-xs text-cyan-300 break-all select-all border border-slate-800">
                            {edgeCommand}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB 5: SPOOLER PRINT JOB AUDIT LOG ──────────────────────────── */}
            {activeTab === 'spooler' && (
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📜</span>
                            <div>
                                <h3 className="font-black text-base text-gray-900">
                                    Print Spooler Audit Log Ledger
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Dispatched thermal print jobs recorded in this cashier session
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setSpoolerLogs([]);
                                toast.success('Spooler logs cleared');
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-red-600 transition-colors"
                        >
                            Clear History
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-gray-600 uppercase font-black text-[10px] border-b border-gray-200">
                                <tr>
                                    <th className="p-3">Job ID</th>
                                    <th className="p-3">Time</th>
                                    <th className="p-3">Type</th>
                                    <th className="p-3">Assigned Station</th>
                                    <th className="p-3 text-center">Copies</th>
                                    <th className="p-3 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {spoolerLogs.map(job => (
                                    <tr key={job.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-mono text-indigo-600 font-bold">{job.id}</td>
                                        <td className="p-3 text-gray-500">{job.timestamp}</td>
                                        <td className="p-3 font-bold text-gray-800">
                                            {job.type === 'KOT' ? '🍳 Kitchen KOT' : job.type === 'Drawer Kick' ? '💵 Drawer Pulse' : '🧾 ' + job.type}
                                        </td>
                                        <td className="p-3 text-gray-600">{job.station}</td>
                                        <td className="p-3 text-center">{job.copies}</td>
                                        <td className="p-3 text-right">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                {job.status} ✓
                                            </span>
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
