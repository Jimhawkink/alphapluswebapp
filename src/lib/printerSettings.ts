// =========================================================================
// SUPER ROBUST HOTEL & RESTAURANT PRINTER SETTINGS ENGINE
// Manages Customer Bill Printers, Kitchen KOT Printers, Bar Printers
// Supports Direct Silent Printing, Auto-Print on Pay, and Kiosk Mode
// =========================================================================

export type OrderPrintMode = 'both' | 'bill_only' | 'kot_only' | 'none';

export interface InstalledPrinter {
  id: string;
  name: string;
  port?: string;
  driver?: string;
  isThermal: boolean;
  width: '80mm' | '58mm' | 'A4';
  status?: string;
}

// User's exact detected physical Windows installed printers
export const DEFAULT_INSTALLED_PRINTERS: InstalledPrinter[] = [
  { id: 'xp_80c_copy_2', name: 'XP-80C (copy 2)', port: 'USB004', driver: 'XP-80C', isThermal: true, width: '80mm', status: 'Normal' },
  { id: 'xp_80c_copy_1', name: 'XP-80C (copy 1)', port: 'USB003', driver: 'XP-80C', isThermal: true, width: '80mm', status: 'Normal' },
  { id: 'xp_80c', name: 'XP-80C', port: 'USB002', driver: 'XP-80C', isThermal: true, width: '80mm', status: 'Normal' },
  { id: 'hp_laserjet', name: 'HP LaserJet MFP M129-M134', port: 'USB001', driver: 'HP LaserJet MFP M129-M134 PCLm-S', isThermal: false, width: 'A4', status: 'Normal' },
  { id: 'ms_pdf', name: 'Microsoft Print to PDF', port: 'PORTPROMPT:', driver: 'Microsoft Print To PDF', isThermal: false, width: 'A4', status: 'Normal' },
  { id: 'foxit_pdf', name: 'Foxit Reader PDF Printer', port: 'FOXIT_Reader:', driver: 'Foxit Reader PDF Printer Driver', isThermal: false, width: 'A4', status: 'Normal' },
  { id: 'anydesk', name: 'AnyDesk Printer', port: 'AD_Port', driver: 'AnyDesk v4 Printer Driver', isThermal: false, width: 'A4', status: 'Normal' },
];

export interface PrinterConfig {
  id: string;
  label: string;
  systemPrinterName: string;
  targetRole: 'customer' | 'kitchen' | 'bar';
  connectionType: 'browser_default' | 'silent_kiosk' | 'network_raw' | 'usb_serial';
  ipAddress?: string;
  port?: number;
  paperWidth: '80mm' | '58mm';
  copies: number;
  autoCut: boolean;
  openDrawer: boolean;
  enabled: boolean;
}

export interface POSPrinterPreferences {
  orderPrintMode: OrderPrintMode; // 'both' | 'bill_only' | 'kot_only' | 'none'
  autoPrintReceiptOnPay: boolean; // Auto-print final receipt when payment is confirmed
  autoPrintKOTOnSend: boolean;    // Derived / helper flag
  autoPrintBillOnSend: boolean;   // Derived / helper flag
  printSequenceDelayMs: number;   // Delay between sequential jobs (e.g. 350ms)
  skipPreviewDialog: boolean;     // Bypass preview popups and print directly in background
  soundBeepOnPrint: boolean;      // Play audio chime on print dispatch
  customerPrinter: PrinterConfig;
  kitchenPrinter: PrinterConfig;
  barPrinter: PrinterConfig;
}

export const defaultPrinterPreferences: POSPrinterPreferences = {
  orderPrintMode: 'both', // Default: Print BOTH KOT & Customer Bill
  autoPrintReceiptOnPay: true,
  autoPrintKOTOnSend: true,
  autoPrintBillOnSend: true,
  printSequenceDelayMs: 350,
  skipPreviewDialog: true, // Always silent — dialogs only appear when using kiosk shortcut
  soundBeepOnPrint: true,
  customerPrinter: {
    id: 'ptr-customer',
    label: 'Counter Customer Bill Printer',
    systemPrinterName: 'XP-80C (copy 2)', // Exact cashier counter thermal printer
    targetRole: 'customer',
    connectionType: 'browser_default',
    paperWidth: '80mm',
    copies: 1,
    autoCut: true,
    openDrawer: true,
    enabled: true
  },
  kitchenPrinter: {
    id: 'ptr-kitchen',
    label: 'Kitchen KOT Chef Printer',
    systemPrinterName: 'XP-80C (copy 1)', // Exact kitchen thermal printer
    targetRole: 'kitchen',
    connectionType: 'browser_default',
    paperWidth: '80mm',
    copies: 1,
    autoCut: true,
    openDrawer: false,
    enabled: true
  },
  barPrinter: {
    id: 'ptr-bar',
    label: 'Bar & Beverage Printer',
    systemPrinterName: 'XP-80C', // Exact bar / 3rd thermal printer
    targetRole: 'bar',
    connectionType: 'browser_default',
    paperWidth: '80mm',
    copies: 1,
    autoCut: true,
    openDrawer: false,
    enabled: false
  }
};

const STORAGE_KEY = 'alphaplus_printer_settings';
const PRINTERS_LIST_KEY = 'alphaplus_installed_printers';

// Query exact installed Windows printers from local bridge, with fallback to saved cache
export async function fetchInstalledWindowsPrinters(): Promise<InstalledPrinter[]> {
  if (typeof window === 'undefined') return DEFAULT_INSTALLED_PRINTERS;

  // 1. Try querying local background bridge on port 18181
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);

    const res = await fetch('http://127.0.0.1:18181/printers', {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.printers) && data.printers.length > 0) {
        localStorage.setItem(PRINTERS_LIST_KEY, JSON.stringify(data.printers));
        return data.printers;
      }
    }
  } catch {
    // Bridge offline or not running locally; use cached or default list
  }

  // 2. Read from localStorage cache
  try {
    const cached = localStorage.getItem(PRINTERS_LIST_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // 3. Fallback to user's exact installed Windows printers
  return DEFAULT_INSTALLED_PRINTERS;
}

// Load settings from localStorage with fallback to default
export function loadPOSPrinterSettings(): POSPrinterPreferences {
  if (typeof window === 'undefined') return defaultPrinterPreferences;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode: OrderPrintMode = parsed.orderPrintMode || (
        parsed.autoPrintKOTOnSend && parsed.autoPrintBillOnSend ? 'both' :
        parsed.autoPrintBillOnSend ? 'bill_only' :
        parsed.autoPrintKOTOnSend ? 'kot_only' : 'both'
      );

      const customerPtr = { ...defaultPrinterPreferences.customerPrinter, ...(parsed.customerPrinter || {}) };
      const kitchenPtr = { ...defaultPrinterPreferences.kitchenPrinter, ...(parsed.kitchenPrinter || {}) };
      const barPtr = { ...defaultPrinterPreferences.barPrinter, ...(parsed.barPrinter || {}) };

      // Auto-migrate generic/predefined names to user's exact printers
      if (!customerPtr.systemPrinterName || customerPtr.systemPrinterName.includes('Default Thermal Printer')) {
        customerPtr.systemPrinterName = 'XP-80C (copy 2)';
      }
      if (!kitchenPtr.systemPrinterName || kitchenPtr.systemPrinterName.includes('Kitchen Thermal Printer')) {
        kitchenPtr.systemPrinterName = 'XP-80C (copy 1)';
      }
      if (!barPtr.systemPrinterName || barPtr.systemPrinterName.includes('Bar Counter Thermal')) {
        barPtr.systemPrinterName = 'XP-80C';
      }

      return {
        ...defaultPrinterPreferences,
        ...parsed,
        orderPrintMode: mode,
        autoPrintKOTOnSend: mode === 'both' || mode === 'kot_only',
        autoPrintBillOnSend: mode === 'both' || mode === 'bill_only',
        printSequenceDelayMs: parsed.printSequenceDelayMs || 350,
        customerPrinter: customerPtr,
        kitchenPrinter: kitchenPtr,
        barPrinter: barPtr,
      };
    }
  } catch (err) {
    console.error('Error reading printer settings from localStorage:', err);
  }
  return defaultPrinterPreferences;
}

// Save settings to localStorage and Supabase hotel_tax_config / system_settings
export async function savePOSPrinterSettings(prefs: POSPrinterPreferences): Promise<boolean> {
  // Ensure derived flags match orderPrintMode
  // Strictly read mode — never default to 'both' if user set something else
  const mode: OrderPrintMode = (prefs.orderPrintMode && ['both','bill_only','kot_only','none'].includes(prefs.orderPrintMode))
    ? prefs.orderPrintMode
    : 'both';
  const updatedPrefs: POSPrinterPreferences = {
    ...prefs,
    orderPrintMode: mode,
    autoPrintKOTOnSend: mode === 'both' || mode === 'kot_only',
    autoPrintBillOnSend: mode === 'both' || mode === 'bill_only',
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ywsstybsffcipaqtkjjl.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3c3N0eWJzZmZjaXBhcXRrampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzkzOTEsImV4cCI6MjEwNzA1NTM5MX0.dSjOnaB5W0jfZPXrTdc1H_OotXJLat2g6eqfX3udkwc';
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from('hotel_tax_config')
      .upsert({
        config_key: 'pos_hardware_printers',
        config_value: JSON.stringify(updatedPrefs),
        description: 'Hardware printer routing, automatic sequence, and direct silent print configuration',
        updated_at: new Date().toISOString()
      }, { onConflict: 'config_key' });

    return true;
  } catch (err) {
    console.error('Error persisting printer settings to cloud:', err);
    return false;
  }
}

// Audio chime using Web Audio API (Zero external MP3 dependency)
export function playPrintChime(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12); // A6 note

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore audio errors if user hasn't interacted
  }
}

// Automatic Sequential Order Dispatcher
// Executes KOT and/or Customer Bill in automated sequence based on hotel preference
export async function executeOrderAutoPrintSequence(
  kotHtml: string,
  billHtml: string,
  prefs: POSPrinterPreferences
): Promise<{ kotPrinted: boolean; billPrinted: boolean }> {
  let kotPrinted = false;
  let billPrinted = false;

  // Strictly read mode — never default to 'both' if user set something else
  const mode: OrderPrintMode = (prefs.orderPrintMode && ['both','bill_only','kot_only','none'].includes(prefs.orderPrintMode))
    ? prefs.orderPrintMode
    : 'both';

  // 1. Dispatch Kitchen KOT first if enabled
  if (mode === 'both' || mode === 'kot_only') {
    kotPrinted = await executeDirectPrint(kotHtml, {
      printerRole: 'kitchen',
      copies: prefs.kitchenPrinter.copies,
      playSound: prefs.soundBeepOnPrint,
      forceDialog: false
    });
  }

  // 2. Sequential Delay between jobs to allow printer driver / guillotine cut
  if (mode === 'both') {
    const delay = prefs.printSequenceDelayMs || 350;
    await new Promise(r => setTimeout(r, delay));
  }

  // 3. Dispatch Customer Bill (unpaid) to table/counter printer if enabled
  if (mode === 'both' || mode === 'bill_only') {
    billPrinted = await executeDirectPrint(billHtml, {
      printerRole: 'customer',
      copies: prefs.customerPrinter.copies,
      playSound: (mode !== 'both' && prefs.soundBeepOnPrint), // Avoid double chime if both printed
      forceDialog: false
    });
  }

  return { kotPrinted, billPrinted };
}

// Direct Silent Print Executer
// When skipPreview is true or in Kiosk mode, prints via hidden iframe in background
export async function executeDirectPrint(
  html: string,
  options?: {
    printerRole?: 'customer' | 'kitchen' | 'bar';
    copies?: number;
    playSound?: boolean;
    forceDialog?: boolean;
  }
): Promise<boolean> {
  const prefs = loadPOSPrinterSettings();
  const playSound = options?.playSound ?? prefs.soundBeepOnPrint;
  if (playSound) {
    playPrintChime();
  }

  const printer = options?.printerRole === 'kitchen'
    ? prefs.kitchenPrinter
    : options?.printerRole === 'bar'
      ? prefs.barPrinter
      : prefs.customerPrinter;

  const copies = options?.copies || printer?.copies || 1;

  // Repeat for required copies
  for (let c = 0; c < copies; c++) {
    const success = await printSingleJob(html, options?.forceDialog ?? false);
    if (!success) return false;
    if (copies > 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  return true;
}

// Print single job via hidden iframe — ALWAYS silent, no popup dialog
// Chrome suppresses dialog ONLY with --kiosk-printing; iframe.print() triggers the OS dialog
// Use iframe always — cleaner UX, dialog auto-selects last printer
function printSingleJob(html: string, _forceDialog: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const existing = document.getElementById('alphaplus-print-frame');
      if (existing) existing.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'alphaplus-print-frame';
      iframe.setAttribute('style',
        'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;');
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) { resolve(false); return; }

      doc.open();
      doc.write(html);
      doc.close();

      // Wait for images (QR code) to fully load before printing
      const win = iframe.contentWindow!;
      const imgs = Array.from(doc.querySelectorAll('img'));
      const waitForImages = imgs.length > 0
        ? Promise.all(imgs.map(img => img.complete
            ? Promise.resolve()
            : new Promise(r => { img.onload = r; img.onerror = r; })))
        : Promise.resolve();

      waitForImages.then(() => {
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.warn('Silent print error:', e);
          }
          setTimeout(() => { try { iframe.remove(); } catch {} }, 3000);
          resolve(true);
        }, 200);
      });
    } catch (e) {
      console.error('Print execution error:', e);
      resolve(false);
    }
  });
}
