// =========================================================================
// SUPER ROBUST HOTEL & RESTAURANT PRINTER SETTINGS ENGINE
// Manages Customer Bill Printers, Kitchen KOT Printers, Bar Printers
// Supports Direct Silent Printing, Auto-Print on Pay, and Kiosk Mode
// =========================================================================

export type OrderPrintMode = 'both' | 'bill_only' | 'kot_only' | 'none';

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
  skipPreviewDialog: false, // In browser default, false shows fast print. In Kiosk mode, it prints silently!
  soundBeepOnPrint: true,
  customerPrinter: {
    id: 'ptr-customer',
    label: 'Counter Customer Bill Printer',
    systemPrinterName: 'Default Thermal Printer (80mm)',
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
    systemPrinterName: 'Kitchen Thermal Printer (80mm)',
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
    systemPrinterName: 'Bar Counter Thermal (80mm)',
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

      return {
        ...defaultPrinterPreferences,
        ...parsed,
        orderPrintMode: mode,
        autoPrintKOTOnSend: mode === 'both' || mode === 'kot_only',
        autoPrintBillOnSend: mode === 'both' || mode === 'bill_only',
        printSequenceDelayMs: parsed.printSequenceDelayMs || 350,
        customerPrinter: { ...defaultPrinterPreferences.customerPrinter, ...(parsed.customerPrinter || {}) },
        kitchenPrinter: { ...defaultPrinterPreferences.kitchenPrinter, ...(parsed.kitchenPrinter || {}) },
        barPrinter: { ...defaultPrinterPreferences.barPrinter, ...(parsed.barPrinter || {}) },
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
  const mode = prefs.orderPrintMode || 'both';
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

  const mode = prefs.orderPrintMode || 'both';

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

// Print single job via hidden iframe or pop-up
function printSingleJob(html: string, forceDialog: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // 1. Try hidden iframe printing first (instant & clean)
      const existingIframe = document.getElementById('alphaplus-print-frame');
      if (existingIframe) {
        existingIframe.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'alphaplus-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (e) {
            console.warn('Iframe print failed, falling back to window.open:', e);
            fallbackWindowPrint(html).then(resolve);
          } finally {
            setTimeout(() => {
              iframe.remove();
            }, 2000);
          }
        }, 150);
      } else {
        fallbackWindowPrint(html).then(resolve);
      }
    } catch (e) {
      console.error('Print execution error:', e);
      fallbackWindowPrint(html).then(resolve);
    }
  });
}

function fallbackWindowPrint(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const printWindow = window.open('', '_blank', 'width=380,height=600');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => {
            printWindow.close();
            resolve(true);
          };
          // Fallback close
          setTimeout(() => {
            try { printWindow.close(); } catch {}
            resolve(true);
          }, 4000);
        }, 200);
      } else {
        resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
}
