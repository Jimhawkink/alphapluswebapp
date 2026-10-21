// Thermal Receipt Printing Utilities
// Works with 58mm and 80mm thermal printers
import QRCode from 'qrcode';


export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  total: number;
  notes?: string;
  discount?: number;
}

export interface ReceiptData {
  invoiceNo: string;
  date: string;
  time: string;
  cashier: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number; // For backward compatibility
  total: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  customerName?: string;
  mpesaReceipt?: string;
  tableNo?: string;
  orderNotes?: string;
  shiftCode?: string;
  isPaid?: boolean;
  // Kenya Tax Fields
  showTaxInfo?: boolean;
  taxMode?: 'inclusive' | 'exclusive';
  netAmount?: number;
  vatRate?: number;
  vatAmount?: number;
  levyRate?: number;
  levyAmount?: number;
  totalTax?: number;
  qrCodeData?: string;
  verificationHash?: string;
}

export interface KOTData {
  kotNo: string;
  date: string;
  time: string;
  orderType: string;
  tableNo?: string;
  waiter?: string;
  items: {
    name: string;
    qty: number;
    notes?: string;
  }[];
  orderNotes?: string;
  priority?: 'normal' | 'rush';
}

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email?: string;
  pin?: string;
  logo?: string;
  slogan?: string;
}

// Default company info - will be loaded from database
let cachedCompanyInfo: CompanyInfo | null = null;

const defaultCompanyInfo: CompanyInfo = {
  name: 'ALPHA PLUS RESTAURANT',
  address: 'Main Street, Nairobi',
  phone: '+254 712 345 678',
  email: 'info@alphaplus.co.ke',
  pin: 'P051234567X',
  slogan: 'Quality Food, Great Service!'
};

// Reset cached company info (call after saving company settings)
export function resetCompanyInfoCache(): void {
  cachedCompanyInfo = null;
}

// Load company info from database (organisation_settings table)
export async function loadCompanyInfo(): Promise<CompanyInfo> {
  if (cachedCompanyInfo) return cachedCompanyInfo;

  try {
    // First try localStorage cache
    const storedSettings = localStorage.getItem('company_settings');
    if (storedSettings) {
      const settings = JSON.parse(storedSettings);
      cachedCompanyInfo = {
        name: settings.company_name || settings.name || defaultCompanyInfo.name,
        address: settings.address || defaultCompanyInfo.address,
        phone: settings.phone || defaultCompanyInfo.phone,
        email: settings.email || defaultCompanyInfo.email,
        pin: settings.kra_pin || settings.pin || defaultCompanyInfo.pin,
        slogan: settings.slogan || settings.tagline || defaultCompanyInfo.slogan,
        logo: settings.logo
      };
      return cachedCompanyInfo;
    }

    // If not in localStorage, try to fetch from Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: settingsData } = await supabase
        .from('organisation_settings')
        .select('setting_key, setting_value');

      if (settingsData && settingsData.length > 0) {
        const settingsMap: { [key: string]: string } = {};
        settingsData.forEach((item: { setting_key: string; setting_value: string }) => {
          settingsMap[item.setting_key] = item.setting_value;
        });

        cachedCompanyInfo = {
          name: settingsMap['company_name'] || defaultCompanyInfo.name,
          address: settingsMap['address'] ?
            (settingsMap['city'] ? `${settingsMap['address']}, ${settingsMap['city']}` : settingsMap['address'])
            : defaultCompanyInfo.address,
          phone: settingsMap['phone'] || defaultCompanyInfo.phone,
          email: settingsMap['email'] || defaultCompanyInfo.email,
          pin: settingsMap['kra_pin'] || defaultCompanyInfo.pin,
          slogan: settingsMap['footer_note'] || settingsMap['slogan'] || defaultCompanyInfo.slogan,
        };

        // Cache to localStorage for faster subsequent loads
        localStorage.setItem('company_settings', JSON.stringify({
          company_name: cachedCompanyInfo.name,
          address: settingsMap['address'] || '',
          city: settingsMap['city'] || '',
          phone: cachedCompanyInfo.phone,
          email: cachedCompanyInfo.email,
          kra_pin: cachedCompanyInfo.pin,
          slogan: cachedCompanyInfo.slogan
        }));

        return cachedCompanyInfo;
      }
    }

    return defaultCompanyInfo;
  } catch (error) {
    console.error('Error loading company info:', error);
    return defaultCompanyInfo;
  }
}

// Get cached or default company info (synchronous)
export function getCompanyInfo(): CompanyInfo {
  return cachedCompanyInfo || defaultCompanyInfo;
}

// ============================================
// TAX DISPLAY SETTINGS (SHOW / HIDE ON RECEIPT)
// ============================================

export function getTaxDisplaySettingSync(): boolean {
  if (typeof window !== 'undefined') {
    const val = localStorage.getItem('show_tax_on_receipt');
    if (val !== null) {
      return val === 'true';
    }
  }
  return true; // Default to true (Show tax breakdown)
}

export async function loadTaxDisplaySetting(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('show_tax_on_receipt');
    if (cached !== null) {
      return cached === 'true';
    }
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ywsstybsffcipaqtkjjl.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3c3N0eWJzZmZjaXBhcXRrampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzkzOTEsImV4cCI6MjEwNzA1NTM5MX0.dSjOnaB5W0jfZPXrTdc1H_OotXJLat2g6eqfX3udkwc';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from('hotel_tax_config')
      .select('config_value')
      .eq('config_key', 'show_tax_on_receipt')
      .maybeSingle();

    if (data && data.config_value !== undefined) {
      const isShow = data.config_value === 'true';
      if (typeof window !== 'undefined') {
        localStorage.setItem('show_tax_on_receipt', isShow ? 'true' : 'false');
      }
      return isShow;
    }
  } catch (err) {
    console.error('Error loading tax display setting:', err);
  }

  return true;
}

export async function saveTaxDisplaySetting(show: boolean): Promise<boolean> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('show_tax_on_receipt', show ? 'true' : 'false');
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ywsstybsffcipaqtkjjl.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3c3N0eWJzZmZjaXBhcXRrampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzkzOTEsImV4cCI6MjEwNzA1NTM5MX0.dSjOnaB5W0jfZPXrTdc1H_OotXJLat2g6eqfX3udkwc';
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from('hotel_tax_config')
      .upsert({
        config_key: 'show_tax_on_receipt',
        config_value: show ? 'true' : 'false',
        description: 'Toggle to show or hide tax information on customer receipts'
      }, { onConflict: 'config_key' });
    return true;
  } catch (err) {
    console.error('Error saving tax display setting:', err);
    return false;
  }
}


// =========================================================================
// ULTRA PREMIUM CUSTOMER RECEIPT & BILL GENERATOR
// Highly styled, elegant boutique hotel/restaurant thermal receipt
// Compatible with 80mm & 58mm thermal printers and on-screen previews
// Fully honors the showTaxInfo toggle (show/hide Kenya tax breakdown)
// =========================================================================

export async function generateCustomerBillHTML(
  data: ReceiptData,
  company: CompanyInfo = defaultCompanyInfo,
  isPaid: boolean = false
): Promise<string> {
  const showTax = data.showTaxInfo ?? getTaxDisplaySettingSync();

  // Generate inline QR code as base64 (no external network needed — instant render)
  let qrDataUrl = '';
  if (data.qrCodeData) {
    try {
      qrDataUrl = await QRCode.toDataURL(data.qrCodeData, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 220,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (e) {
      console.error('QR generation error:', e);
    }
  }

  // Format currency helper
  const fmt = (n: number | undefined | null) =>
    (Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalQty = data.items.reduce((s, i) => s + (i.qty || 1), 0);
  const netAmt = data.netAmount || (data.total / 1.18);
  const vatAmt = data.vatAmount || (netAmt * ((data.vatRate || 16) / 100));
  const levyAmt = data.levyAmount || (netAmt * ((data.levyRate || 2) / 100));
  const totTax = data.totalTax || (vatAmt + levyAmt);

  // Generate item rows
  const itemRows = data.items.map((item, idx) => {
    const itemSubtotal = item.total - (item.discount || 0);
    const itemTaxRate = 0.18; // 16% VAT + 2% Levy
    const itemNetAmount = itemSubtotal / (1 + itemTaxRate);
    const itemTaxAmount = itemSubtotal - itemNetAmount;

    const itemNotes = item.notes
      ? `<div style="font-size:8px;color:#d97706;font-style:italic;margin-top:1px;">📝 ${item.notes}</div>`
      : '';
    const itemDiscount = item.discount && item.discount > 0
      ? `<div style="font-size:8px;color:#16a34a;font-weight:700;">-${fmt(item.discount)} OFF</div>`
      : '';

    if (showTax) {
      return `
        <tr style="border-bottom:1px dashed #d1d5db;">
          <td style="padding:5px 2px;vertical-align:top;">
            <div style="font-weight:800;font-size:10px;color:#111827;line-height:1.25;">${item.name}</div>
            ${itemNotes}
            ${itemDiscount}
          </td>
          <td style="padding:5px 2px;text-align:center;font-weight:800;font-size:10.5px;vertical-align:top;">
            <span style="display:inline-block;min-width:18px;background:#f3f4f6;border-radius:3px;padding:1px 3px;">${item.qty}</span>
          </td>
          <td style="padding:5px 2px;text-align:right;font-size:10px;color:#4b5563;vertical-align:top;">${item.price.toLocaleString()}</td>
          <td style="padding:5px 2px;text-align:right;font-size:9px;color:#2563eb;font-weight:600;vertical-align:top;">${Math.round(itemTaxAmount).toLocaleString()}</td>
          <td style="padding:5px 2px;text-align:right;font-weight:900;font-size:10.5px;color:#111827;vertical-align:top;">${item.total.toLocaleString()}</td>
        </tr>
      `;
    } else {
      // Clean 4-column layout when tax is hidden (more spacious dish name)
      return `
        <tr style="border-bottom:1px dashed #d1d5db;">
          <td style="padding:6px 2px;vertical-align:top;">
            <div style="font-weight:800;font-size:10.5px;color:#111827;line-height:1.25;">${item.name}</div>
            ${itemNotes}
            ${itemDiscount}
          </td>
          <td style="padding:6px 2px;text-align:center;font-weight:800;font-size:11px;vertical-align:top;">
            <span style="display:inline-block;min-width:20px;background:#f3f4f6;border-radius:3px;padding:1px 4px;">${item.qty}</span>
          </td>
          <td style="padding:6px 2px;text-align:right;font-size:10.5px;color:#4b5563;vertical-align:top;">${item.price.toLocaleString()}</td>
          <td style="padding:6px 2px;text-align:right;font-weight:900;font-size:11px;color:#111827;vertical-align:top;">${item.total.toLocaleString()}</td>
        </tr>
      `;
    }
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${isPaid ? 'Official Receipt' : 'Customer Bill'} - ${data.invoiceNo}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10px;
      width: 80mm;
      max-width: 80mm;
      padding: 3.5mm 3.5mm;
      margin: 0 auto;
      background: #ffffff;
      color: #000000;
      line-height: 1.3;
    }

    /* ── Header & Branding ── */
    .brand-header {
      text-align: center;
      padding-bottom: 6px;
      margin-bottom: 6px;
      border-bottom: 2px dashed #000;
    }
    .brand-crown {
      font-size: 20px;
      line-height: 1;
      margin-bottom: 2px;
    }
    .brand-name {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #000;
    }
    .brand-slogan {
      font-size: 8.5px;
      font-style: italic;
      color: #4b5563;
      margin-top: 1px;
    }
    .brand-contact {
      font-size: 9px;
      color: #374151;
      margin-top: 3px;
      line-height: 1.35;
    }
    .kra-pin-pill {
      display: inline-block;
      margin-top: 3px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      padding: 1px 6px;
      border-radius: 4px;
    }

    /* ── Document Title Banner ── */
    .title-banner {
      text-align: center;
      margin: 6px 0;
      padding: 6px 4px;
      border-radius: 5px;
    }
    .title-banner.paid {
      background: #000000;
      color: #ffffff;
    }
    .title-banner.unpaid {
      background: #fef2f2;
      border: 1.5px solid #dc2626;
      color: #dc2626;
    }
    .title-banner-text {
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .title-banner-sub {
      font-size: 8.5px;
      font-weight: 700;
      margin-top: 2px;
      opacity: 0.9;
    }

    /* ── Metadata Grid ── */
    .meta-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 5px;
      padding: 6px;
      margin-bottom: 7px;
      font-size: 9.5px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 1.5px 0;
    }
    .meta-lbl {
      color: #6b7280;
      font-weight: 600;
    }
    .meta-val {
      font-weight: 700;
      color: #111827;
      text-align: right;
    }
    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    /* ── Items Table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    .items-table th {
      background: #111827;
      color: #ffffff;
      padding: 5px 3px;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .items-table td {
      border-bottom: 1px dashed #e5e7eb;
    }
    .items-table tr:last-child td {
      border-bottom: 2px solid #000000;
    }

    /* ── Totals Ledger ── */
    .totals-ledger {
      margin-top: 5px;
    }
    .ledger-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
      font-size: 9.5px;
    }
    .ledger-lbl {
      color: #4b5563;
      font-weight: 600;
    }
    .ledger-val {
      font-weight: 700;
      color: #111827;
    }

    /* ── Tax Breakdown Box (Conditionally Displayed) ── */
    .tax-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 5px;
      padding: 5px 6px;
      margin: 6px 0;
    }
    .tax-box-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      font-weight: 800;
      color: #1e40af;
      text-transform: uppercase;
      border-bottom: 1px solid #dbeafe;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
    .tax-box-pill {
      background: #2563eb;
      color: #ffffff;
      font-size: 7.5px;
      padding: 1px 5px;
      border-radius: 10px;
    }
    .tax-row {
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      padding: 1px 0;
      color: #1e3a8a;
    }
    .tax-row-total {
      border-top: 1px solid #bfdbfe;
      margin-top: 3px;
      padding-top: 3px;
      font-weight: 800;
      font-size: 9px;
      color: #1e40af;
    }

    /* ── Grand Total Ribbon ── */
    .grand-total-ribbon {
      background: #000000;
      color: #ffffff;
      padding: 8px 10px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 7px 0;
    }
    .grand-total-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .grand-total-amount {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: -0.5px;
    }

    /* ── Settlement Box ── */
    .settlement-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 5px;
      padding: 5px 6px;
      margin-bottom: 6px;
      font-size: 9px;
    }
    .settlement-row {
      display: flex;
      justify-content: space-between;
      padding: 1.5px 0;
    }
    .settlement-change {
      color: #15803d;
      font-weight: 800;
      border-top: 1px dashed #d1d5db;
      padding-top: 2px;
      margin-top: 2px;
    }

    /* ── M-PESA Code Box ── */
    .mpesa-badge {
      border: 1.5px dashed #16a34a;
      background: #f0fdf4;
      border-radius: 5px;
      padding: 6px;
      text-align: center;
      margin: 6px 0;
    }
    .mpesa-badge-title {
      color: #15803d;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .mpesa-code {
      font-family: ui-monospace, monospace;
      font-size: 13px;
      font-weight: 900;
      color: #111827;
      letter-spacing: 2px;
      margin: 3px 0;
    }
    .mpesa-sub {
      font-size: 8px;
      color: #166534;
    }

    /* ── Order Notes ── */
    .notes-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 5px;
      padding: 5px;
      margin: 6px 0;
      font-size: 9px;
      color: #92400e;
    }

    /* ── QR Code ── */
    .qr-container {
      text-align: center;
      padding: 6px;
      margin: 7px 0;
      background: #ffffff;
      border: 1px dashed #9ca3af;
      border-radius: 6px;
    }
    .qr-img {
      width: 140px;
      height: 140px;
      image-rendering: crisp-edges;
      image-rendering: pixelated;
      margin: 0 auto;
      display: block;
    }
    .qr-hint {
      font-size: 8px;
      color: #4b5563;
      margin-top: 3px;
      font-weight: 600;
      text-transform: uppercase;
    }

    /* ── Barcode & Serial ── */
    .barcode-wrap {
      text-align: center;
      margin: 6px 0 4px 0;
      font-family: 'Libre Barcode 39 Text', monospace;
      font-size: 26px;
      letter-spacing: 1px;
    }
    .barcode-serial {
      text-align: center;
      font-family: ui-monospace, monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #374151;
    }

    /* ── Hospitality Footer ── */
    .footer-section {
      text-align: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 2px dashed #000000;
      font-size: 8.5px;
      color: #4b5563;
      line-height: 1.4;
    }
    .footer-stars {
      color: #000;
      font-size: 11px;
      letter-spacing: 2px;
      margin-bottom: 2px;
    }
    .footer-thanks {
      font-weight: 900;
      font-size: 10px;
      color: #000;
      text-transform: uppercase;
    }
    .footer-sub {
      margin-top: 2px;
    }
    .tear-line {
      margin: 7px 0 4px 0;
      font-size: 8px;
      letter-spacing: 1px;
      color: #9ca3af;
    }
    .footer-credit {
      font-size: 7.5px;
      color: #9ca3af;
      margin-top: 2px;
    }

    @media print {
      body {
        width: 80mm;
        padding: 2mm;
      }
    }
  </style>
</head>
<body>

  <!-- Brand Header -->
  <div class="brand-header">
    <div class="brand-crown">👑</div>
    <div class="brand-name">${company.name}</div>
    ${company.slogan ? `<div class="brand-slogan">"${company.slogan}"</div>` : ''}
    <div class="brand-contact">
      📍 ${company.address}<br>
      📞 ${company.phone}${company.email ? ` • ✉️ ${company.email}` : ''}
      ${showTax && company.pin ? `<br><span class="kra-pin-pill">KRA PIN: ${company.pin}</span>` : ''}
    </div>
  </div>

  <!-- Title Banner -->
  <div class="title-banner ${isPaid ? 'paid' : 'unpaid'}">
    <div class="title-banner-text">
      ${isPaid ? (showTax ? '★ OFFICIAL TAX INVOICE ★' : '★ OFFICIAL CUSTOMER RECEIPT ★') : '★ CUSTOMER BILL ESTIMATE ★'}
    </div>
    <div class="title-banner-sub">
      ${isPaid ? `✓ PAID IN FULL • ${data.paymentMethod.toUpperCase()}` : '⚠ BILL ESTIMATE • PAYMENT PENDING'}
    </div>
  </div>

  <!-- Metadata Information Card -->
  <div class="meta-box">
    <div class="meta-row">
      <span class="meta-lbl">INVOICE NO:</span>
      <span class="meta-val font-mono">${data.invoiceNo}</span>
    </div>
    <div class="meta-row">
      <span class="meta-lbl">DATE & TIME:</span>
      <span class="meta-val">${data.date} • ${data.time}</span>
    </div>
    <div class="meta-row">
      <span class="meta-lbl">CASHIER / SERVER:</span>
      <span class="meta-val">${data.cashier}</span>
    </div>
    ${data.tableNo ? `
    <div class="meta-row">
      <span class="meta-lbl">TABLE / STATION:</span>
      <span class="meta-val font-bold">TABLE ${data.tableNo}</span>
    </div>
    ` : ''}
    ${data.customerName ? `
    <div class="meta-row">
      <span class="meta-lbl">GUEST NAME:</span>
      <span class="meta-val">${data.customerName}</span>
    </div>
    ` : ''}
    ${data.shiftCode ? `
    <div class="meta-row">
      <span class="meta-lbl">SHIFT / TERMINAL:</span>
      <span class="meta-val font-mono">${data.shiftCode}</span>
    </div>
    ` : ''}
  </div>

  <!-- Itemized Details Table -->
  <table class="items-table">
    <thead>
      ${showTax ? `
      <tr>
        <th style="width:42%;text-align:left;">ITEM DESCRIPTION</th>
        <th style="width:10%;text-align:center;">QTY</th>
        <th style="width:18%;text-align:right;">PRICE</th>
        <th style="width:13%;text-align:right;">TAX</th>
        <th style="width:17%;text-align:right;">TOTAL</th>
      </tr>
      ` : `
      <tr>
        <th style="width:52%;text-align:left;">ITEM DESCRIPTION</th>
        <th style="width:12%;text-align:center;">QTY</th>
        <th style="width:18%;text-align:right;">PRICE</th>
        <th style="width:18%;text-align:right;">TOTAL</th>
      </tr>
      `}
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Totals Section -->
  <div class="totals-ledger">
    <div class="ledger-row">
      <span class="ledger-lbl">Subtotal (${data.items.length} items • ${totalQty} portions):</span>
      <span class="ledger-val">Ksh ${data.subtotal.toLocaleString()}</span>
    </div>
    ${data.discount > 0 ? `
    <div class="ledger-row" style="color:#16a34a;">
      <span class="ledger-lbl" style="color:#16a34a;font-weight:700;">Special Discount:</span>
      <span class="ledger-val" style="color:#16a34a;font-weight:800;">- Ksh ${data.discount.toLocaleString()}</span>
    </div>
    ` : ''}
  </div>

  <!-- Tax Breakdown Box (Rendered ONLY if showTax is ON) -->
  ${showTax ? `
  <div class="tax-box">
    <div class="tax-box-header">
      <span>📊 KENYA TAX BREAKDOWN (INCLUSIVE)</span>
      <span class="tax-box-pill">${(data.vatRate || 16) + (data.levyRate || 2)}% TOTAL</span>
    </div>
    <div class="tax-row">
      <span>Net Taxable Base:</span>
      <span>Ksh ${fmt(netAmt)}</span>
    </div>
    <div class="tax-row">
      <span>VAT (${data.vatRate || 16}%):</span>
      <span>Ksh ${fmt(vatAmt)}</span>
    </div>
    <div class="tax-row">
      <span>Catering / Tourism Levy (${data.levyRate || 2}%):</span>
      <span>Ksh ${fmt(levyAmt)}</span>
    </div>
    <div class="tax-row tax-row-total">
      <span>TOTAL TAX COLLECTED:</span>
      <span>Ksh ${fmt(totTax)}</span>
    </div>
  </div>
  ` : ''}

  <!-- Grand Total Ribbon -->
  <div class="grand-total-ribbon">
    <div class="grand-total-label">TOTAL AMOUNT</div>
    <div class="grand-total-amount">Ksh ${data.total.toLocaleString()}</div>
  </div>

  <!-- Payment Status & Settlement Card -->
  ${isPaid ? `
  <div class="settlement-card">
    <div class="settlement-row">
      <span class="meta-lbl">PAYMENT METHOD:</span>
      <span class="meta-val font-bold">${data.paymentMethod.toUpperCase()}</span>
    </div>
    ${data.amountPaid ? `
    <div class="settlement-row">
      <span class="meta-lbl">AMOUNT TENDERED:</span>
      <span class="meta-val">Ksh ${data.amountPaid.toLocaleString()}</span>
    </div>
    ` : ''}
    ${data.change > 0 ? `
    <div class="settlement-row settlement-change">
      <span>CHANGE RETURNED:</span>
      <span>Ksh ${data.change.toLocaleString()}</span>
    </div>
    ` : ''}
  </div>

  ${data.paymentMethod.toUpperCase().includes('MPESA') || data.mpesaReceipt ? `
  <div class="mpesa-badge">
    <div class="mpesa-badge-title">📱 CONFIRMED M-PESA PAYMENT</div>
    <div class="mpesa-code">${data.mpesaReceipt || data.verificationHash || 'VERIFIED'}</div>
    <div class="mpesa-sub">Official Safaricom Lipa na M-Pesa Record</div>
  </div>
  ` : ''}
  ` : `
  <div class="title-banner unpaid" style="margin:4px 0 6px 0;padding:5px;">
    <div style="font-weight:900;font-size:11px;">❌ NOT PAID (PENDING)</div>
    <div style="font-size:8.5px;margin-top:2px;">Please present this bill at the counter</div>
  </div>
  `}

  <!-- Order Special Notes -->
  ${data.orderNotes ? `
  <div class="notes-box">
    📝 <strong>Special Order Instructions:</strong> ${data.orderNotes}
  </div>
  ` : ''}

  <!-- QR Code Verification Card -->
  ${(data.qrCodeData && qrDataUrl) ? `
  <div class="qr-container">
    <div style="font-size:8px;font-weight:800;color:#111827;text-transform:uppercase;margin-bottom:3px;">
      ${isPaid ? '✓ Scan to Verify Authentic Receipt' : '📱 Scan to Pay via M-Pesa Online'}
    </div>
    <img src="${qrDataUrl}" alt="Verification QR" class="qr-img" />
    <div class="qr-hint">${isPaid ? 'VERIFIED • ' + data.invoiceNo : 'TAP OR SCAN TO PAY'}</div>
  </div>
  ` : ''}

  <!-- Barcode Section -->
  <div class="barcode-wrap">*${data.invoiceNo}*</div>
  <div class="barcode-serial">${data.invoiceNo}</div>

  <!-- Hospitality Footer -->
  <div class="footer-section">
    <div class="footer-stars">★ ★ ★ ★ ★</div>
    <div class="footer-thanks">THANK YOU FOR VISITING US!</div>
    <div class="footer-sub">We appreciate your patronage and look forward to serving you again.</div>
    <div style="margin-top:3px;font-size:8px;">${showTax ? 'This document serves as your official tax invoice.' : 'This document serves as your official customer receipt.'}</div>
    <div style="font-size:8px;">Goods and meals once served are not returnable.</div>
    <div class="tear-strip">- - - - - - - - - - - - - ✂ Tear Here ✂ - - - - - - - - - - - - -</div>
    <div class="footer-credit">Alpha Plus Hospitality POS v2.0 • Digital Audit Trail</div>
  </div>

</body>
</html>
`;
}

// Generate thermal receipt HTML (for paid receipts)
export async function generateReceiptHTML(data: ReceiptData, company: CompanyInfo = defaultCompanyInfo): Promise<string> {
  return generateCustomerBillHTML(data, company, true);
}

// Generate KOT (Kitchen Order Ticket) HTML
export function generateKOTHTML(data: KOTData, company: CompanyInfo = defaultCompanyInfo): string {
  const itemRows = data.items.map((item, index) => `
    <div class="kot-item">
        <span style="max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${index + 1}. ${item.name}</span>
        <span class="dots"></span>
        <div class="qty-box-black">${item.qty}</div>
    </div>
    ${item.notes ? `
    <div style="font-size:11px;color:#c00;margin-top:-4px;margin-bottom:4px;padding-left:10px;font-style:italic;">
      ⚠️ ${item.notes.toUpperCase()}
    </div>
    ` : ''}
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>KOT - ${data.kotNo}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      width: 80mm;
      padding: 4mm;
      background: #fff;
      color: #000;
    }
    .kot-header-black {
        background-color: #000;
        color: white;
        padding: 8px;
        text-align: center;
        border-radius: 6px;
        margin-bottom: 10px;
    }
    
    .kot-title {
        font-size: 18px; 
        font-weight: 900;
        text-transform: uppercase;
    }
    
    .kot-number {
         font-size: 16px;
         font-weight: 700;
         margin-top: 2px;
    }

    .badge-takeaway {
        display: inline-block;
        background: linear-gradient(to right, #f59e0b, #ea580c);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 12px;
        text-transform: uppercase;
        margin-bottom: 8px;
        text-align: center;
    }

    .badge-dinein {
        display: inline-block;
        background: linear-gradient(to right, #3b82f6, #2563eb);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 12px;
        text-transform: uppercase;
        margin-bottom: 8px;
        text-align: center;
    }

    .line-info {
        border-top: 1px solid #000;
        border-bottom: 1px solid #000;
        padding: 5px 0;
        margin: 10px 0;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
    }

    .kot-item {
        display: flex;
        align-items: flex-end; /* Align dots to bottom */
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 700;
    }

    .dots {
        flex-grow: 1;
        border-bottom: 2px dotted #000;
        margin: 0 5px 4px 5px; /* Adjust margin to align with text baseline */
        height: 1px;
    }

    .qty-box-black {
        background: #000;
        color: #fff;
        min-width: 26px;
        height: 26px;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 16px;
        border-radius: 4px;
    }
    
    .footer {
        margin-top: 15px; 
        padding-top: 5px; 
        border-top: 2px solid #000; 
        text-center: center;
        font-size: 10px;
        font-weight: bold;
    }

    .rush-badge {
       background: #dc2626;
       color: white;
       padding: 2px 8px;
       border-radius: 4px;
       font-size: 10px;
       margin-left: 5px;
       vertical-align: middle;
       display: inline-block;
    }
    
    @media print {
      body { width: 80mm; }
    }
  </style>
</head>
<body>
  
  <div class="kot-header-black">
      <div class="kot-title">
        K.O.T 👨‍🍳
        ${data.priority === 'rush' ? '<span class="rush-badge">⚡ RUSH</span>' : ''}
      </div>
      <div class="kot-number">#${data.kotNo}</div>
  </div>

  <div style="text-align: center;">
      <div class="${data.orderType.toLowerCase().includes('take') ? 'badge-takeaway' : 'badge-dinein'}">
          ${data.orderType.toLowerCase().includes('take') ? '🛍️' : '🪑'} ${data.orderType.toUpperCase()}
          ${data.tableNo ? `- TABLE ${data.tableNo}` : ''}
      </div>
  </div>

  <div class="line-info">
      ${data.orderType.toUpperCase()} | ${data.date} | ${data.time} | ${data.waiter || 'Server'}
  </div>

  <!-- Items -->
  <div style="margin-top: 10px;">
      ${itemRows}
  </div>
  
  ${data.orderNotes ? `
  <div style="margin-top:15px;border:2px dashed #000;padding:5px;font-weight:bold;text-align:center;">
    📝 ${data.orderNotes.toUpperCase()}
  </div>
  ` : ''}

  <div class="footer">
      ${data.date} | ${data.time}<br>
      <span style="font-size: 9px; color: #666; font-weight: normal; text-transform: uppercase;">
        ${company.name}
      </span>
  </div>

</body>
</html>
`;
}

// Print function - opens print dialog
export function printReceipt(html: string): void {
  const printWindow = window.open('', '_blank', 'width=350,height=600');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
      // Close after print dialog closes
      printWindow.onafterprint = () => printWindow.close();
    }, 250);
  }
}

// Direct print to thermal printer (for connected printers)
export async function printToThermalPrinter(html: string, printerName?: string): Promise<boolean> {
  try {
    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
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

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 100));

      // Print
      iframe.contentWindow?.print();

      // Remove iframe after print
      setTimeout(() => document.body.removeChild(iframe), 1000);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
}

// Generate receipt data from cart
export function createReceiptData(
  invoiceNo: string,
  items: { name: string; qty: number; price: number; notes?: string; discount?: number }[],
  paymentMethod: string,
  amountPaid: number,
  cashier: string,
  options?: {
    customerName?: string;
    mpesaReceipt?: string;
    tableNo?: string;
    orderNotes?: string;
    shiftCode?: string;
    discount?: number;
    tax?: number;
    isPaid?: boolean;
    // Kenya Tax Fields
    taxMode?: 'inclusive' | 'exclusive';
    vatRate?: number;
    levyRate?: number;
    showTaxInfo?: boolean;
    hotelName?: string;
  }
): ReceiptData {
  const now = new Date();
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const itemDiscounts = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const totalDiscount = itemDiscounts + (options?.discount || 0);

  // Calculate Kenya Tax (VAT 16% + Levy 2%)
  const taxMode = options?.taxMode || 'inclusive';
  const vatRate = options?.vatRate || 16;
  const levyRate = options?.levyRate || 2;
  const totalTaxRate = (vatRate + levyRate) / 100; // 0.18

  const amountAfterDiscount = subtotal - totalDiscount;
  let netAmount: number;
  let vatAmount: number;
  let levyAmount: number;
  let totalTax: number;

  if (taxMode === 'inclusive') {
    // Tax already included in price
    netAmount = amountAfterDiscount / (1 + totalTaxRate);
    vatAmount = netAmount * (vatRate / 100);
    levyAmount = netAmount * (levyRate / 100);
    totalTax = vatAmount + levyAmount;
  } else {
    // Tax added on top
    netAmount = amountAfterDiscount;
    vatAmount = netAmount * (vatRate / 100);
    levyAmount = netAmount * (levyRate / 100);
    totalTax = vatAmount + levyAmount;
  }

  const total = taxMode === 'inclusive' ? amountAfterDiscount : (amountAfterDiscount + totalTax);
  const change = paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0;

  // Generate QR Code Data for receipt validation (ALL receipts, paid or unpaid)
  let qrCodeData: string | undefined;
  let verificationHash: string | undefined;

  try {
    // Create simple verification URL - no complex encoding
    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : process.env.NEXT_PUBLIC_SITE_URL || 'https://alphapluswebapp.vercel.app';

    // Simple direct URL for easy scanning
    const hotelName = options?.hotelName || 'AlphaPlus';
    const shortDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');

    // Create M-Pesa payment URL — customer scans → enters phone → STK Push fires
    qrCodeData = `${baseUrl}/pay/${encodeURIComponent(invoiceNo)}`;
    verificationHash = invoiceNo + '_' + total.toFixed(2);
  } catch (error) {
    console.error('Error generating QR code:', error);
  }

  return {
    invoiceNo,
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    cashier,
    items: items.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.price * item.qty,
      notes: item.notes,
      discount: item.discount
    })),
    subtotal,
    discount: totalDiscount,
    tax: options?.tax || totalTax, // Backward compatibility
    total,
    paymentMethod,
    amountPaid,
    change,
    customerName: options?.customerName,
    mpesaReceipt: options?.mpesaReceipt,
    tableNo: options?.tableNo,
    orderNotes: options?.orderNotes,
    shiftCode: options?.shiftCode,
    isPaid: options?.isPaid ?? true,
    showTaxInfo: options?.showTaxInfo ?? getTaxDisplaySettingSync(),
    // Kenya Tax Fields
    taxMode,
    netAmount: Math.round(netAmount * 100) / 100,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    levyRate,
    levyAmount: Math.round(levyAmount * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    qrCodeData,
    verificationHash
  };
}

// Generate KOT data from cart
export function createKOTData(
  kotNo: string,
  items: { name: string; qty: number; notes?: string }[],
  orderType: string = 'Dine-In',
  options?: {
    tableNo?: string;
    waiter?: string;
    orderNotes?: string;
    priority?: 'normal' | 'rush';
  }
): KOTData {
  const now = new Date();

  return {
    kotNo,
    date: now.toLocaleDateString('en-GB'),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    orderType,
    tableNo: options?.tableNo,
    waiter: options?.waiter,
    items: items.map(item => ({
      name: item.name,
      qty: item.qty,
      notes: item.notes
    })),
    orderNotes: options?.orderNotes,
    priority: options?.priority || 'normal'
  };
}

// Print customer receipt
export async function printCustomerReceipt(data: ReceiptData, company?: CompanyInfo): Promise<void> {
  const html = await generateReceiptHTML(data, company);
  printReceipt(html);
}

// Print KOT
export function printKOT(data: KOTData, company?: CompanyInfo): void {
  const html = generateKOTHTML(data, company);
  printReceipt(html);
}

// Print unpaid customer bill (with NOT PAID watermark)
export async function printUnpaidBill(data: ReceiptData, company?: CompanyInfo): Promise<void> {
  const html = await generateCustomerBillHTML(data, company, false);
  printReceipt(html);
}

export default {
  generateReceiptHTML,
  generateCustomerBillHTML,
  generateKOTHTML,
  printReceipt,
  printToThermalPrinter,
  createReceiptData,
  createKOTData,
  printCustomerReceipt,
  printKOT,
  printUnpaidBill
};
